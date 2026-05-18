#!/usr/bin/env node
"use strict";

/**
 * sync-script.template.js
 *
 * Phase 2 of a Plan→Sync→Audit migration job. Loads a saved plan and
 * applies the changes to Cloud, with two safety gates:
 *
 *   --dry-run   walk the plan, log intended changes, never mutate
 *   --confirm   operator confirms — required for any actual mutation
 *
 * Re-running the same plan skips entries with status="completed".
 * `--retry-failed` also re-attempts entries with status="failed".
 *
 * Run:
 *   node main/sync.js --plan-file logs/plan_<runId>.json --dry-run
 *   node main/sync.js --plan-file logs/plan_<runId>.json --confirm --concurrency 5
 *   node main/sync.js --plan-file logs/plan_<runId>.json --confirm --retry-failed
 *
 * REQUIRED EDITS (search for "TODO" below):
 *   1. Choose the destination client
 *   2. Implement `_applyEntry(entryId, data)`
 *   3. Update the audit CSV columns to reflect the entity's shape
 */

const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const CloudJiraClient = require("../src/cloudJiraClient");            // TODO: swap as needed
// const CloudConfluenceClient = require("../src/cloudConfluenceClient");

const PlanManager = require("../src/planManager");
const { runPool } = require("../src/workerPool");
const { CsvWriter } = require("../src/csvWriter");

// ─── CLI ─────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const o = {
    planFile: null,
    dryRun: false,
    confirm: false,
    retryFailed: false,
    concurrency: 5,
    limit: 0,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--plan-file":   o.planFile = argv[++i]; break;
      case "--dry-run":     o.dryRun = true; break;
      case "--confirm":     o.confirm = true; break;
      case "--retry-failed":o.retryFailed = true; break;
      case "--concurrency": o.concurrency = parseInt(argv[++i], 10) || 5; break;
      case "--limit":       o.limit = parseInt(argv[++i], 10) || 0; break;
      case "--help":
      case "-h":            o.help = true; break;
      default:
        if (a.startsWith("--")) {
          console.error(`Unknown flag: ${a}`);
          o.help = true;
        }
    }
  }
  return o;
}

function help() {
  console.log(`
Usage: node main/sync.js --plan-file <path> [options]

  --plan-file <path>    plan JSON to execute (required)
  --dry-run             simulate; never mutate
  --confirm             required for mutating runs (safety gate)
  --retry-failed        also re-attempt entries with status="failed"
  --concurrency N       worker pool size (default 5)
  --limit N             cap number of entries processed this run

Safety: a run without --dry-run AND without --confirm exits non-zero.
`);
}

// ─── ORCHESTRATOR ────────────────────────────────────────────────────

class MigrationSync {
  constructor(opts) {
    this.opts = opts;

    if (!opts.dryRun && !opts.confirm) {
      throw new Error("Refusing to mutate without --confirm. Use --dry-run for a preview.");
    }
    if (!opts.planFile) {
      throw new Error("--plan-file is required.");
    }

    const required = ["CLOUD_BASE_URL", "CLOUD_EMAIL", "CLOUD_API_TOKEN"];
    for (const k of required) {
      if (!process.env[k]) throw new Error(`Missing ${k} in .env`);
    }

    this.scriptRoot = path.resolve(__dirname, "..");
    this.logDir = path.join(this.scriptRoot, "logs");

    this.runId = String(Date.now());
    this.logFile = path.join(this.logDir, `sync_${this.runId}.log`);

    this.cloud = new CloudJiraClient(
      process.env.CLOUD_BASE_URL,
      process.env.CLOUD_EMAIL,
      process.env.CLOUD_API_TOKEN,
    );

    this.planManager = new PlanManager(this.logDir, (m) => this.log(m));
    this.errCsv = null;

    this.stats = { processed: 0, applied: 0, skipped: 0, failed: 0 };
  }

  log(msg) {
    const line = `[${new Date().toISOString()}] ${msg}`;
    console.log(msg);
    try { fs.appendFileSync(this.logFile, line + "\n"); } catch { /* swallow */ }
  }

  async run() {
    this.log(`Sync run ${this.runId} starting ${this.opts.dryRun ? "[DRY RUN]" : ""}`);
    if (!(await this.cloud.testConnection())) throw new Error("Cloud connection failed");

    this.planManager.loadPlan(this.opts.planFile);
    if (!this.planManager.plan) throw new Error("No plan loaded");

    let entries = this.planManager.getEntriesToProcess(this.opts.retryFailed);
    if (this.opts.limit > 0) entries = entries.slice(0, this.opts.limit);
    this.log(`  ${entries.length} entries to process`);
    if (entries.length === 0) return;

    this.errCsv = new CsvWriter(
      path.join(this.logDir, `failed_${this.runId}.csv`),
      ["entry_id", "status", "error", "checked_at"],
    );

    await runPool(entries, async ([entryId, data]) => {
      this.stats.processed++;
      if (this.opts.dryRun) {
        this.planManager.updateEntryStatus(entryId, "skipped", "dry-run");
        this.stats.skipped++;
        return;
      }
      try {
        await this._applyEntry(entryId, data);
        this.planManager.updateEntryStatus(entryId, "completed");
        this.stats.applied++;
      } catch (err) {
        this.planManager.updateEntryStatus(entryId, "failed", err.message);
        this.stats.failed++;
        await this.errCsv.writeRow({
          entry_id: entryId,
          status: "failed",
          error: err.message,
          checked_at: new Date().toISOString(),
        });
      }
    }, this.opts.concurrency, { log: (m) => this.log(m), progressEvery: 25 });

    this.planManager.savePlan();
    await this.errCsv.close();

    const cs = this.cloud.getStats();
    this.log(`\nSync complete:`);
    this.log(`  Processed: ${this.stats.processed}, Applied: ${this.stats.applied}, Skipped: ${this.stats.skipped}, Failed: ${this.stats.failed}`);
    this.log(`  HTTP: ${cs.requestCount} requests, ${cs.errorCount} errors, ${cs.rateLimitCount || 0} rate-limits`);
    this.log(`  Plan: ${this.planManager.formatStats()}`);
  }

  /**
   * Apply a single plan entry. Throw on failure — the caller records
   * status. This is the only method most migration scripts need to
   * customize.
   */
  async _applyEntry(entryId, data) {
    // ───────────────────────────────────────────────────────────────
    // TODO: implement the mutation.
    //
    // Example — Jira issue update:
    //
    //   const result = await this.cloud.updateIssue(data.issueKey, {
    //     fields: { [data.fieldId]: data.newValue },
    //   });
    //   if (!result.success) throw new Error(result.error);
    //
    // Example — Confluence page storage rewrite:
    //
    //   const result = await this.cloud.updatePageStorage(
    //     data.cloudPageId, data.title, data.contentType,
    //     data.newStorageXml, data.currentVersion, "Migration update",
    //   );
    //   if (!result.success) throw new Error(result.error);
    //   this.planManager.patchEntry(entryId, { completedVersion: result.newVersion });
    // ───────────────────────────────────────────────────────────────

    throw new Error("_applyEntry not implemented — fill in the TODO");
  }
}

// ─── MAIN ────────────────────────────────────────────────────────────

(async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) { help(); process.exit(0); }
  const job = new MigrationSync(opts);
  await job.run();
})().catch((e) => {
  console.error("FATAL:", e.message);
  if (e.stack) console.error(e.stack);
  process.exit(1);
});
