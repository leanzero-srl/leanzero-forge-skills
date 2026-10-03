"use strict";

/**
 * BackupManager — write per-entity pre-mutation snapshots so the sync
 * phase is rollback-safe.
 *
 * Two complementary strategies:
 *
 *   1. **Confluence**: don't write a file at all — Cloud already keeps
 *      every page version. Record the pre-write version number in the
 *      plan and use `restoreVersion` (or `?status=historical&version=N` +
 *      PUT) to roll back. See `rollbackFromConfluenceHistory`.
 *
 *   2. **Jira + others**: write a JSON snapshot to
 *      `backups/<runId>/<entityId>.json` before any mutating call. The
 *      snapshot is whatever the source-of-truth was at fetch time —
 *      the issue's whole `fields` payload, an attachment's metadata,
 *      etc. Roll back by re-applying the saved value.
 *
 * The manager also computes a **semantic hash** of the source state and
 * stores it in the plan entry. After the write, you can compare the
 * destination's actual hash against the original — equal hashes mean the
 * mutation was a no-op and there's nothing to roll back.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

class BackupManager {
  /**
   * @param {string} runId
   * @param {string} backupDir  e.g. "backups" — runId is appended automatically
   */
  constructor(runId, backupDir = "backups") {
    this.runId = String(runId);
    this.dir = path.join(backupDir, this.runId);
    this.writes = 0;
    this.bytes = 0;
  }

  _ensureDir() {
    if (!fs.existsSync(this.dir)) fs.mkdirSync(this.dir, { recursive: true });
  }

  /**
   * Snapshot the pre-mutation state of an entity. Returns the absolute
   * path of the written file (stable, can be embedded in the plan entry).
   *
   * @param {string} entityId       e.g. "ABC-1234" or "12345"
   * @param {object} preState       Whatever you want to restore from
   * @returns {string} backup file path
   */
  snapshot(entityId, preState) {
    this._ensureDir();
    const safeId = String(entityId).replace(/[^A-Za-z0-9_.-]/g, "_");
    const file = path.join(this.dir, `${safeId}.json`);
    const payload = JSON.stringify(preState, null, 2);
    fs.writeFileSync(file, payload);
    this.writes++;
    this.bytes += Buffer.byteLength(payload);
    return file;
  }

  /**
   * Load a previously-snapshotted entity. Returns null if not found
   * (use this defensively — partial runs may not have written every
   * backup).
   */
  load(entityId) {
    const safeId = String(entityId).replace(/[^A-Za-z0-9_.-]/g, "_");
    const file = path.join(this.dir, `${safeId}.json`);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  }

  /**
   * Compute a SHA1 hash of `value`. Useful as a pre/post fingerprint so
   * idempotent re-runs can detect "destination already matches the plan"
   * and skip writing.
   *
   * Pass a canonicalized value (see adf-builders.canonicalize for ADF) —
   * the raw JSON of a non-canonicalized object is order-sensitive.
   */
  static hash(value) {
    const str = typeof value === "string" ? value : JSON.stringify(value);
    return crypto.createHash("sha1").update(str).digest("hex");
  }

  /**
   * Compute a semantic hash of a Confluence storage-format string.
   * Lower-bound implementation: strip whitespace between tags and within
   * tag attributes, normalize self-closing slashes. For richer semantic
   * equivalence (attribute ordering, etc.), parse to a tree and use that.
   */
  static storageHash(storageXml) {
    if (!storageXml) return BackupManager.hash("");
    const normalized = String(storageXml)
      .replace(/>\s+</g, "><")              // collapse inter-tag whitespace
      .replace(/\s+\/>/g, "/>")             // normalize self-closing
      .replace(/\s+/g, " ")                 // collapse runs of whitespace
      .trim();
    return BackupManager.hash(normalized);
  }

  getStats() {
    return { writes: this.writes, bytes: this.bytes, dir: this.dir };
  }
}

/**
 * Rollback helper for Confluence: restore a page to its pre-run version
 * using Cloud's version history. Non-destructive — Cloud keeps the
 * intermediate edit. Detects intervening third-party edits and refuses
 * to clobber them.
 *
 * Caller supplies the `recordedVersion` that the sync phase wrote into
 * the plan as the post-PUT version (so `recordedVersion - 1` is the
 * pre-run version to restore).
 *
 * @param {object} cloudClient            CloudConfluenceClient instance
 * @param {string|number} pageId
 * @param {number} recordedVersion        version stamped at sync time
 * @returns {Promise<{status: string, reason?: string, currentVersion?: number, newVersion?: number, restoredFromVersion?: number}>}
 */
async function rollbackFromConfluenceHistory(cloudClient, pageId, recordedVersion) {
  if (typeof recordedVersion !== "number" || recordedVersion < 2) {
    return { status: "skipped", reason: "no recorded post-PUT version" };
  }
  const targetVersion = recordedVersion - 1;

  let current;
  try { current = await cloudClient.getPageStorage(pageId); }
  catch (err) { return { status: "failed", reason: `fetch current: ${err.message}` }; }

  const currentVersion = current?.version?.number;
  if (typeof currentVersion !== "number") {
    return { status: "failed", reason: "no current version on destination" };
  }

  if (currentVersion > recordedVersion) {
    return {
      status: "skipped-intervening",
      reason: `version ${currentVersion} > recorded ${recordedVersion} — third-party edit; manual rollback required`,
      currentVersion,
    };
  }
  if (currentVersion < recordedVersion) {
    return { status: "skipped-rolled-back", reason: "already rolled back or never matched plan", currentVersion };
  }

  let historical;
  try {
    historical = await cloudClient.makeRequest(
      "GET",
      `/rest/api/content/${pageId}?status=historical&version=${targetVersion}&expand=body.storage,version,space`,
    );
  } catch (err) {
    return { status: "failed", reason: `fetch historical v${targetVersion}: ${err.message}` };
  }
  const historicalStorage = historical?.body?.storage?.value;
  if (typeof historicalStorage !== "string") {
    return { status: "failed", reason: `historical v${targetVersion} has no storage body` };
  }

  const result = await cloudClient.updatePageStorage(
    pageId,
    current.title,
    current.type || "page",
    historicalStorage,
    currentVersion,
    `Rollback to v${targetVersion} (migration script)`,
  );
  if (!result.success) return { status: "failed", reason: `PUT: ${result.error}` };
  return {
    status: "rolled-back",
    currentVersion,
    newVersion: result.newVersion,
    restoredFromVersion: targetVersion,
  };
}

module.exports = { BackupManager, rollbackFromConfluenceHistory };
