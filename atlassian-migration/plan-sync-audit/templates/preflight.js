"use strict";

/**
 * preflight — re-verify a plan's source data against the live source RIGHT
 * BEFORE the sync phase mutates anything. Detects drift between plan
 * creation and apply time, buckets the results, and (optionally) refuses
 * to proceed if too much has changed.
 *
 * Why this exists: a plan built on Monday and applied on Friday may be
 * stale — users edited, automation rules fired, attachments shifted.
 * Without a preflight check, the sync writes Monday's values over
 * Friday's reality. With one, the operator sees the drift, decides
 * whether to re-plan or to forge ahead.
 *
 * Usage:
 *
 *   const { preflight } = require("../src/preflight");
 *
 *   const report = await preflight({
 *     entries: planManager.getEntriesToProcess(opts.retryFailed),
 *     fetchCurrent: async (id, data) => {
 *       return await dcClient.getIssue(data.sourceKey, "summary,parent");
 *     },
 *     comparator: (planned, actual) => {
 *       // return "same" | "drift" | "missing-in-source"
 *       if (!actual) return "missing-in-source";
 *       return planned.sourceSummary === actual.fields.summary ? "same" : "drift";
 *     },
 *     concurrency: 8,
 *     log: (m) => console.log(m),
 *   });
 *
 *   console.log(report.summary());
 *   if (report.driftRatio > 0.10) {
 *     console.error("DRIFT > 10%. Re-plan before applying.");
 *     process.exit(2);
 *   }
 */

const fs = require("fs");
const path = require("path");

/**
 * Run a preflight check across plan entries.
 *
 * @param {object} options
 * @param {[string, object][]} options.entries        plan entries to check, as [id, data] pairs
 * @param {(id: string, data: object) => Promise<object|null>} options.fetchCurrent
 * @param {(planned: object, actual: object|null) => string} options.comparator
 *                                                    return one of: "same" | "drift" | "missing-in-source"
 *                                                    (custom string values become their own bucket)
 * @param {number} [options.concurrency=8]
 * @param {Function} [options.log]
 * @param {string} [options.outFile]                  optional CSV path with per-entry results
 * @returns {Promise<PreflightReport>}
 */
async function preflight(options) {
  const log = options.log || (() => {});
  const concurrency = Math.max(1, options.concurrency || 8);
  const entries = options.entries || [];
  const buckets = new Map();          // bucketName → count
  const rows = [];                    // per-entry rows for the CSV
  let next = 0;

  const worker = async () => {
    while (true) {
      const i = next++;
      if (i >= entries.length) return;
      const [id, planned] = entries[i];
      let actual = null;
      let bucket;
      try {
        actual = await options.fetchCurrent(id, planned);
        bucket = options.comparator(planned, actual);
      } catch (err) {
        bucket = "fetch-error";
        log(`  [preflight] ${id} fetch failed: ${err.message}`);
      }
      buckets.set(bucket, (buckets.get(bucket) || 0) + 1);
      rows.push({ id, bucket, checkedAt: new Date().toISOString() });
    }
  };

  const workers = [];
  for (let w = 0; w < Math.min(concurrency, entries.length); w++) workers.push(worker());
  await Promise.all(workers);

  if (options.outFile) _writeCsv(options.outFile, rows);

  return new PreflightReport(buckets, entries.length, rows);
}

class PreflightReport {
  constructor(buckets, total, rows) {
    this.buckets = buckets;
    this.total = total;
    this.rows = rows;
    this.same = buckets.get("same") || 0;
    this.drift = buckets.get("drift") || 0;
    this.missing = buckets.get("missing-in-source") || 0;
    this.fetchErrors = buckets.get("fetch-error") || 0;
    this.driftRatio = total > 0 ? (this.drift + this.missing) / total : 0;
  }

  summary() {
    const lines = [
      `Preflight: ${this.total} entries checked`,
      `  same:                  ${this.same}`,
      `  drift:                 ${this.drift}`,
      `  missing-in-source:     ${this.missing}`,
      `  fetch-error:           ${this.fetchErrors}`,
      `  drift+missing ratio:   ${(this.driftRatio * 100).toFixed(1)}%`,
    ];
    for (const [name, count] of this.buckets.entries()) {
      if (["same", "drift", "missing-in-source", "fetch-error"].includes(name)) continue;
      lines.push(`  ${name}: ${count}`);
    }
    return lines.join("\n");
  }
}

function _writeCsv(filePath, rows) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const head = "entry_id,bucket,checked_at\r\n";
  const body = rows.map((r) =>
    [r.id, r.bucket, r.checkedAt].map(_csvEscape).join(","),
  ).join("\r\n");
  fs.writeFileSync(filePath, head + body + "\r\n");
}

function _csvEscape(s) {
  const str = String(s || "");
  if (!/[,"\r\n]/.test(str)) return str;
  return `"${str.replace(/"/g, '""')}"`;
}

module.exports = { preflight, PreflightReport };
