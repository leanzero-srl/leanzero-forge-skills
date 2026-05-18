"use strict";

/**
 * PlanManager — generic, entity-agnostic plan persistence for resumable
 * Atlassian migration jobs.
 *
 * A "plan" is a JSON file in `<planDir>/plan_<runId>.json` with this shape:
 *
 *   {
 *     "version":  "1.0",
 *     "runId":    "1747549872311",
 *     "createdAt": "2026-05-18T08:00:00.000Z",
 *     "updatedAt": "2026-05-18T08:34:12.117Z",
 *     "stats":   { "total": N, "pending": N, "completed": N, "failed": N, "skipped": N },
 *     "entries": {
 *       "<entryId>": {
 *         "status":   "pending|completed|failed|skipped",
 *         "error":    null | "string",
 *         "updatedAt": null | "ISO-8601",
 *         // ... whatever fields the caller wants to persist
 *       }
 *     }
 *   }
 *
 * The caller decides what fields go inside each entry. The manager only
 * touches `status`, `error`, and `updatedAt`. Add custom fields by passing
 * them in the `data` arg to `addEntry`.
 *
 * Not concurrent-safe — single writer per plan file.
 */

const fs = require("fs");
const path = require("path");

class PlanManager {
  /**
   * @param {string} planDir - directory where plan_<runId>.json will live
   * @param {Function} [log] - optional logger; defaults to console.log
   */
  constructor(planDir, log) {
    this.planDir = planDir;
    this.log = log || ((msg) => console.log(msg));
    this.plan = null;
    this.planFilePath = null;
    this.updatesSinceSave = 0;
    this.autoSaveThreshold = 50;
  }

  setPlanFile(filePath) {
    this.planFilePath = filePath;
  }

  // ──────────────────────────────────────────────────────────────────
  //  CREATION
  // ──────────────────────────────────────────────────────────────────

  createPlan(runId) {
    if (!fs.existsSync(this.planDir)) {
      fs.mkdirSync(this.planDir, { recursive: true });
    }

    this.planFilePath = path.join(this.planDir, `plan_${runId}.json`);
    this.plan = {
      version: "1.0",
      runId: String(runId),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      stats: { total: 0, pending: 0, completed: 0, failed: 0, skipped: 0 },
      entries: {},
    };

    this.savePlan();
    return this.plan;
  }

  /**
   * Add a new entry to the plan. `data` may include any caller-specific
   * fields; `status`, `error`, and `updatedAt` are managed here.
   */
  addEntry(entryId, data) {
    if (!this.plan) {
      throw new Error("No plan loaded — call createPlan() or loadPlan() first.");
    }
    this.plan.entries[String(entryId)] = {
      ...data,
      status: "pending",
      error: null,
      updatedAt: null,
    };

    this.plan.stats.total++;
    this.plan.stats.pending++;
    this.plan.updatedAt = new Date().toISOString();

    this.updatesSinceSave++;
    if (this.updatesSinceSave >= this.autoSaveThreshold) {
      this.savePlan();
    }
  }

  // ──────────────────────────────────────────────────────────────────
  //  PERSISTENCE
  // ──────────────────────────────────────────────────────────────────

  /**
   * Atomically write the plan to disk. Uses a streamed write so large
   * plans (>50 MB) don't blow up the heap when JSON.stringify-ing the
   * whole tree.
   */
  savePlan() {
    if (!this.plan || !this.planFilePath) return;

    this.plan.updatedAt = new Date().toISOString();
    this.recalculateStats();

    this._streamWritePlan(this.planFilePath, this.plan);
    this.updatesSinceSave = 0;
  }

  _streamWritePlan(filePath, plan) {
    let fd = null;
    try {
      fd = fs.openSync(filePath + ".tmp", "w");
      fs.writeSync(fd, "{\n");
      fs.writeSync(fd, `"version":${JSON.stringify(plan.version)},\n`);
      fs.writeSync(fd, `"runId":${JSON.stringify(plan.runId)},\n`);
      fs.writeSync(fd, `"createdAt":${JSON.stringify(plan.createdAt)},\n`);
      fs.writeSync(fd, `"updatedAt":${JSON.stringify(plan.updatedAt)},\n`);
      fs.writeSync(fd, `"stats":${JSON.stringify(plan.stats)},\n`);
      fs.writeSync(fd, `"entries":{\n`);

      const ids = Object.keys(plan.entries);
      for (let i = 0; i < ids.length; i++) {
        const key = ids[i];
        const comma = i < ids.length - 1 ? ",\n" : "\n";
        fs.writeSync(fd, `${JSON.stringify(key)}:${JSON.stringify(plan.entries[key])}${comma}`);
      }

      fs.writeSync(fd, "}\n}");
      fs.closeSync(fd);
      fd = null;
      fs.renameSync(filePath + ".tmp", filePath);
    } catch (error) {
      this.log(`  ERROR saving plan: ${error.message}`);
    } finally {
      if (fd !== null) {
        try { fs.closeSync(fd); } catch { /* ignore */ }
      }
    }
  }

  /**
   * Load a plan file. If `filePath` is omitted, scans `planDir` for the
   * most recent `plan_*.json` and loads that.
   */
  loadPlan(filePath) {
    const target = filePath || this.planFilePath;
    if (!target) {
      const latest = this.findLatestPlan();
      if (!latest) {
        this.log("  No existing plan found.");
        return null;
      }
      this.planFilePath = latest;
    } else {
      this.planFilePath = target;
    }

    if (!fs.existsSync(this.planFilePath)) {
      this.log(`  Plan not found: ${this.planFilePath}`);
      return null;
    }

    try {
      this.log(`  Loading plan from ${this.planFilePath}...`);
      const data = fs.readFileSync(this.planFilePath, "utf8");
      const parsed = JSON.parse(data);

      // Tolerate the legacy "pages" key if encountered (rename to entries).
      if (parsed.pages && !parsed.entries) {
        parsed.entries = parsed.pages;
        delete parsed.pages;
      }

      this.plan = parsed;
      this.recalculateStats();
      this.log(`  Loaded plan: ${this.formatStats()}`);
      return this.plan;
    } catch (error) {
      this.log(`  ERROR loading plan: ${error.message}`);
      return null;
    }
  }

  findLatestPlan() {
    if (!fs.existsSync(this.planDir)) return null;
    const files = fs.readdirSync(this.planDir)
      .filter((f) => f.startsWith("plan_") && f.endsWith(".json"))
      .sort()
      .reverse();
    return files.length > 0 ? path.join(this.planDir, files[0]) : null;
  }

  // ──────────────────────────────────────────────────────────────────
  //  STATUS
  // ──────────────────────────────────────────────────────────────────

  /**
   * Return all entries whose status is "pending". With `retryFailed=true`,
   * also include "failed".
   *
   * @returns {[string, object][]} array of [entryId, data] pairs
   */
  getEntriesToProcess(retryFailed) {
    if (!this.plan) return [];
    return Object.entries(this.plan.entries).filter(
      ([, data]) => data.status === "pending" || (retryFailed && data.status === "failed"),
    );
  }

  updateEntryStatus(entryId, status, error = null) {
    if (!this.plan || !this.plan.entries[entryId]) return;
    this.plan.entries[entryId].status = status;
    this.plan.entries[entryId].error = error;
    this.plan.entries[entryId].updatedAt = new Date().toISOString();
    this.updatesSinceSave++;
    if (this.updatesSinceSave >= this.autoSaveThreshold) {
      this.savePlan();
    }
  }

  /**
   * Merge arbitrary fields into an entry (e.g. record the destination ID
   * after a successful create). Does not touch status/error/updatedAt.
   */
  patchEntry(entryId, patch) {
    if (!this.plan || !this.plan.entries[entryId]) return;
    Object.assign(this.plan.entries[entryId], patch);
    this.updatesSinceSave++;
  }

  recalculateStats() {
    if (!this.plan) return;
    const stats = { total: 0, pending: 0, completed: 0, failed: 0, skipped: 0 };
    for (const e of Object.values(this.plan.entries)) {
      stats.total++;
      if (stats[e.status] !== undefined) stats[e.status]++;
    }
    this.plan.stats = stats;
  }

  formatStats() {
    if (!this.plan) return "No plan loaded";
    const s = this.plan.stats;
    return `${s.total} entries (${s.pending} pending, ${s.completed} completed, ${s.failed} failed, ${s.skipped} skipped)`;
  }

  getPlanSummary() {
    if (!this.plan) return null;
    return { ...this.plan.stats, planFile: this.planFilePath };
  }
}

module.exports = PlanManager;
