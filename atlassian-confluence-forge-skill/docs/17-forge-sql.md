# Forge SQL (`@forge/sql`)

A managed relational store (TiDB, MySQL-wire-compatible) for Forge apps that need things KVS is bad at: append-only audit logs, activity aggregation/upserts, and trend reporting (SQL `GROUP BY` / date math). Grounded in License Leash (`src/migrations/`, `src/services/activity-service.ts`, `src/services/config-service.ts`, `src/services/migration-service.ts`).

> **KVS vs SQL.** Reach for SQL when you need: atomic upserts (`ON DUPLICATE KEY UPDATE`), aggregate queries (`COUNT`/`GROUP BY`), ordered keyset pagination over thousands of rows, or an append-only audit table. Stay on KVS for per-page/per-artifact records you address by key prefix (see `24-production-patterns.md` Pattern 2). License Leash uses **both**: KVS for config secrets, SQL for the user-activity and audit tables.

## Manifest

```yaml
modules:
  sql:
    - key: app-database
      engine: mysql        # TiDB under the hood
permissions:
  scopes:
    - storage:app          # SQL shares the storage scope
```

## Official limits (per install) — design around these

From developer.atlassian.com/platform/forge/limits-sql (2026-06):

| Limit | Value |
|---|---|
| **Foreign keys** | **Not supported.** JOINs work; DELETEs do not cascade. |
| Statements per `.execute()` | **One** (single statement only) |
| Tables | 200 max |
| Stored data | 1 GiB prod / 256 MiB staging / 128 MiB dev |
| Row size | 6 MiB |
| Request / response / per-query memory | 1 MiB / 4 MiB / 16 MiB |
| DML rate | 150 req/s |
| DDL rate | 25 req/min |
| Query execution time | 62.5 s/min |
| Timeouts | SELECT 5 s, INSERT/UPDATE/DELETE 10 s, DDL 20 s |

Reads are not separately metered the way writes/storage are — License Leash leans on a cheap PK `SELECT` to debounce writes (below) on that basis, but verify against current docs for your workload.

## Migration runner

Migrations are `{ name, sql }` modules collected into an ordered array and run idempotently. Each one is a single statement (one-query-per-execute applies to migrations too):

```typescript
// migrations/001-create-user-activity.ts
export const name = 'v001_create_user_activity';
export const sql = `
  CREATE TABLE IF NOT EXISTS user_activity (
    account_id     VARCHAR(128) PRIMARY KEY,
    display_name   VARCHAR(255),
    last_active_at VARCHAR(30) NOT NULL,     -- ISO-8601 UTC, NOT DATETIME (see below)
    event_type     VARCHAR(100),
    created_at     VARCHAR(30) NOT NULL,
    updated_at     VARCHAR(30) NOT NULL
  )`;
```

```typescript
// services/migration-service.ts
import { migrationRunner } from '@forge/sql';
import { migrations } from '../migrations';

let migrationRan = false;     // in-isolate guard — skip re-enqueue within a warm isolate
export async function ensureMigrations(): Promise<void> {
  if (migrationRan) return;
  for (const m of migrations) migrationRunner.enqueue(m.name, m.sql);
  await migrationRunner.run();
  await seedDefaults();
  migrationRan = true;
}
```

Call `ensureMigrations()` from a resolver-middleware wrapper (see `24-production-patterns.md` Pattern 12) and from web-trigger/consumer entrypoints, so the schema is present on any cold path. A `scheduledTrigger` calling it daily is a cheap safety net.

## Empirical findings (verify against current docs)

These are not in the official limits doc — they are what License Leash hit in production (2026-06):

### No parameterised `LIMIT` / `OFFSET`
Binding `LIMIT ?` throws `ER_WRONG_ARGUMENTS`. Inline a **sanitised integer** — never caller text:

```typescript
const safeLimit  = Math.max(1, Math.floor(limit));
const safeOffset = Math.max(0, Math.floor(offset));
const q = `SELECT * FROM user_activity WHERE ${PREDICATE}
           ORDER BY last_active_at ASC, account_id ASC
           LIMIT ${safeLimit} OFFSET ${safeOffset}`;   // ints inlined; WHERE values stay bound
await sql.prepare<UserActivityRow>(q).bindParams(...whereParams).execute();
```

Same rule for `ORDER BY` column/direction: they can't be parameterised, so build them from a hard-coded switch of trusted literals, never from a caller string.

### Composite-index `CREATE INDEX` was rejected — inline `INDEX` in `CREATE TABLE`
A standalone `CREATE INDEX idx_action_date ...` and `ALTER TABLE ... ADD INDEX` both returned a generic `400 SQL_EXECUTION_ERROR` with no debug field in `forge logs`. The form that worked reliably is an **inline `INDEX` inside `CREATE TABLE`**:

```sql
CREATE TABLE IF NOT EXISTS deactivation_log (
  id           BIGINT AUTO_INCREMENT PRIMARY KEY,   -- append-only audit log
  account_id   VARCHAR(128) NOT NULL,
  action       VARCHAR(20)  NOT NULL,
  reason       VARCHAR(255),
  performed_by VARCHAR(128),
  performed_at VARCHAR(30)  NOT NULL,
  INDEX idx_account_id (account_id),                 -- inline indexes: accepted
  INDEX idx_performed_at (performed_at)
)
```

Plan your indexes at table-creation time. If you need an index on an existing table, the recovery is a new table + backfill migration, not `ALTER`. Official docs are silent on index DDL — treat this as an empirical finding.

### Store dates as ISO `VARCHAR(30)` UTC, not `DATETIME`
TiDB `DATETIME` round-trips poorly through the Forge driver. License Leash stores every timestamp as an ISO-8601 string in `VARCHAR(30)`. String comparison on ISO-8601 is chronological, so `last_active_at < ?` and `ORDER BY last_active_at` work correctly.

### A failed migration retries forever → rename-the-file recovery
If a migration throws, the runner keeps re-attempting that same `name` on every cold start, blocking everything after it. Recovery: **rename the migration file, its exported `name`, and the index import**, then redeploy — the runner treats it as a new migration and the broken one is abandoned.

### Reactive data-fix migrations
A migration can be a one-shot `UPDATE` to repair historical rows. License Leash's `v008_redact_secret_audit` scrubs an API key/secret that an earlier `updateConfig` had written into the audit `reason` column:

```sql
UPDATE deactivation_log
SET reason = CONCAT(SUBSTRING_INDEX(reason, ' updated to ', 1), ' updated to ''***** (redacted)''')
WHERE action = 'CONFIG_CHANGED'
  AND (reason LIKE 'Config ''org_api_key'' updated to %'
    OR reason LIKE 'Config ''hmac_secret'' updated to %')
```

A data migration cleans up going forward; it cannot un-leak a secret — **rotate the credential** if exposure is suspected.

## Idempotent upserts that never regress a value

For an activity table written by many event paths, use `ON DUPLICATE KEY UPDATE` so concurrent writers don't clobber each other, and `GREATEST(...)` so a stale backfill can never move a "last active" timestamp **backwards**:

```typescript
// activity-service.ts — debounced real-time write
await sql.prepare(
  `INSERT INTO user_activity (account_id, display_name, last_active_at, event_type, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, ?)
   ON DUPLICATE KEY UPDATE
     last_active_at = VALUES(last_active_at),
     event_type     = VALUES(event_type),
     display_name   = COALESCE(VALUES(display_name), display_name),
     updated_at     = VALUES(updated_at)`
).bindParams(accountId, name || null, now, eventType, now, now).execute();

// a re-verification path advances the date only forward:
await sql.prepare(
  `UPDATE user_activity SET last_active_at = GREATEST(last_active_at, ?), updated_at = ? WHERE account_id = ?`
).bindParams(verifiedISO, now, accountId).execute();
```

A separate `markUserEvent` writes an app-action `event_type` (license-revoked, reactivation) **without touching `last_active_at`**, so the activity row stays a faithful witness to real user activity even after the app acts on the account.

## Keyset (cursor) pagination over a candidate set

For a daily batch that may not finish in one consumer run, page by `(last_active_at, account_id)` and persist the cursor — deterministic, resumable, bounded memory:

```typescript
const safeLimit = Math.max(1, Math.floor(limit));
const rows = await sql.prepare<UserActivityRow>(
  `SELECT * FROM user_activity
    WHERE ${INACTIVE_PREDICATE}
      AND (last_active_at > ? OR (last_active_at = ? AND account_id > ?))
    ORDER BY last_active_at ASC, account_id ASC
    LIMIT ${safeLimit}`
).bindParams(cutoffISO, cursor.lastActiveAt, cursor.lastActiveAt, cursor.accountId).execute();
```

Always end `ORDER BY` with the PK (`account_id`) so the cursor is stable across pages even when many rows share a timestamp. Live mode advances past a row even if its action *fails*, so one un-processable account can't deadlock the scan. See `27-faas-limits-and-cost.md` for the consumer-budget/cursor-resume pattern.

## See also

- `24-production-patterns.md` — Pattern 11 (config table + typed helpers), Pattern 12 (`withMigrations` wrapper), Pattern 15 (trust local audit over eventually-consistent REST).
- `18-unlicensed-access-and-web-triggers.md` — the HMAC secret stored in `app_config`.
- `27-faas-limits-and-cost.md` — consumer budgets, cursor-resume across runs.
- https://developer.atlassian.com/platform/forge/limits-sql
