// Forge SQL Migration Template (@forge/sql)
//
// An idempotent migration runner + the upsert patterns that make a many-writer
// activity/audit store safe. Engine is mysql (TiDB under the hood).
//
// KEY RULES (see docs/17-forge-sql.md for the full limits + empirical findings):
//   - ONE statement per .execute() — no multi-statement strings.
//   - NO foreign keys (JOINs work, DELETEs don't cascade).
//   - LIMIT/OFFSET can't be parameterized → inline a SANITISED integer.
//   - Composite-index CREATE INDEX / ALTER ADD INDEX was rejected in production;
//     declare indexes INLINE inside CREATE TABLE.
//   - Store dates as ISO-8601 VARCHAR(30) UTC, not DATETIME.
//   - A failed migration retries forever → rename-the-file recovery (below).
//
// Manifest:
//   modules:
//     sql:
//       - key: app-database
//         engine: mysql
//   permissions:
//     scopes: [storage:app]

import { sql, migrationRunner } from '@forge/sql';

// --- Migrations: each is { name, sql } with a SINGLE statement ----------------
// `name` must be unique and STABLE. To abandon a broken migration, rename BOTH
// the file and this `name` (the runner treats a new name as a new migration and
// stops re-attempting the old, failing one), then redeploy.

const migrations = [
  {
    name: 'v001_create_user_activity',
    sql: `
      CREATE TABLE IF NOT EXISTS user_activity (
        account_id     VARCHAR(128) PRIMARY KEY,
        display_name   VARCHAR(255),
        last_active_at VARCHAR(30) NOT NULL,
        event_type     VARCHAR(100),
        created_at     VARCHAR(30) NOT NULL,
        updated_at     VARCHAR(30) NOT NULL
      )`,
  },
  {
    name: 'v002_create_audit_log',
    sql: `
      CREATE TABLE IF NOT EXISTS audit_log (
        id           BIGINT AUTO_INCREMENT PRIMARY KEY,
        account_id   VARCHAR(128) NOT NULL,
        action       VARCHAR(20)  NOT NULL,
        reason       VARCHAR(255),
        performed_at VARCHAR(30)  NOT NULL,
        INDEX idx_account_id (account_id),       -- inline indexes are the reliable form
        INDEX idx_performed_at (performed_at)
      )`,
  },
  {
    name: 'v003_create_app_config',
    sql: `
      CREATE TABLE IF NOT EXISTS app_config (
        config_key   VARCHAR(100) PRIMARY KEY,
        config_value TEXT NOT NULL,
        updated_at   VARCHAR(30) NOT NULL
      )`,
  },
  // Example reactive data-fix migration (one-shot UPDATE). A data migration
  // cleans up going forward; it CANNOT un-leak a secret — rotate the credential.
  // {
  //   name: 'v004_redact_secret_audit',
  //   sql: `UPDATE audit_log SET reason = '***** (redacted)' WHERE reason LIKE 'secret %'`,
  // },
];

// Idempotent: in-isolate guard skips re-enqueue on a warm isolate. Call from a
// resolver-middleware wrapper AND from web-trigger/consumer entrypoints so the
// schema exists on any cold path. (A daily scheduledTrigger calling it is a
// cheap safety net.)
let migrationRan = false;
export async function ensureMigrations() {
  if (migrationRan) return;
  try {
    for (const m of migrations) migrationRunner.enqueue(m.name, m.sql);
    await migrationRunner.run();
    migrationRan = true;
  } catch (err) {
    console.error('Migration failed:', err);   // surfaces in `forge logs`
  }
}

const nowISO = () => new Date().toISOString();

// --- Idempotent upsert: never regress a "last active" timestamp --------------
export async function upsertActivity(accountId, eventType, displayName) {
  const now = nowISO();
  await sql
    .prepare(
      `INSERT INTO user_activity (account_id, display_name, last_active_at, event_type, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         last_active_at = VALUES(last_active_at),
         event_type     = VALUES(event_type),
         display_name   = COALESCE(VALUES(display_name), display_name),
         updated_at     = VALUES(updated_at)`
    )
    .bindParams(accountId, displayName || null, now, eventType, now, now)
    .execute();
}

// Advance a timestamp only FORWARD (a stale backfill must not move it back).
export async function markVerifiedActive(accountId, lastActiveISO) {
  await sql
    .prepare(
      `UPDATE user_activity
          SET last_active_at = GREATEST(last_active_at, ?), updated_at = ?
        WHERE account_id = ?`
    )
    .bindParams(lastActiveISO, nowISO(), accountId)
    .execute();
}

// --- Keyset pagination: LIMIT is inlined (sanitised), WHERE values are bound --
export async function getInactiveBatch(cutoffISO, cursor, limit) {
  const safeLimit = Math.max(1, Math.floor(limit)); // inline ints ONLY — never caller text
  if (cursor) {
    const r = await sql
      .prepare(
        `SELECT * FROM user_activity
          WHERE last_active_at < ?
            AND (last_active_at > ? OR (last_active_at = ? AND account_id > ?))
          ORDER BY last_active_at ASC, account_id ASC
          LIMIT ${safeLimit}`
      )
      .bindParams(cutoffISO, cursor.lastActiveAt, cursor.lastActiveAt, cursor.accountId)
      .execute();
    return r.rows;
  }
  const r = await sql
    .prepare(
      `SELECT * FROM user_activity
        WHERE last_active_at < ?
        ORDER BY last_active_at ASC, account_id ASC
        LIMIT ${safeLimit}`
    )
    .bindParams(cutoffISO)
    .execute();
  return r.rows;
}
