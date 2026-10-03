#!/usr/bin/env node
"use strict";

/**
 * audit-script.template.js
 *
 * Phase 3 of a Plan→Sync→Audit migration job. Samples completed plan
 * entries, re-fetches the destination state, compares expected vs actual,
 * and writes an audit CSV sorted FAILs-first with a summary footer.
 *
 * Run:
 *   node main/audit.js --plan-file logs/plan_<runId>.json --seed 42 --sample 150
 *   node main/audit.js --plan-file logs/plan_<runId>.json --full        # check every entry
 *
 * Mulberry32 seeded RNG → fully reproducible samples for the same seed.
 *
 * REQUIRED EDITS (search for "TODO" below):
 *   1. Choose the destination client
 *   2. Implement `_check(entryId, data)` — return { match, expected, actual, field, dest_id }
 *   3. Update the CSV columns to reflect the entity's shape
 */

const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const CloudJiraClient = require("../src/cloudJiraClient");      // TODO: swap as needed
// const CloudConfluenceClient = require("../src/cloudConfluenceClient");

const PlanManager = require("../src/planManager");
const { CsvWriter } = require("../src/csvWriter");

// ─── Seeded RNG (Mulberry32) ─────────────────────────────────────────

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededSample(items, n, seed) {
  const rng = mulberry32(seed);
  const out = [];
  const taken = new Set();
  const target = Math.min(n, items.length);
  while (out.length < target) {
    const idx = Math.floor(rng() * items.length);
    if (taken.has(idx)) continue;
    taken.add(idx);
    out.push(items[idx]);
  }
  return out;
}

// ─── CLI ─────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const o = {
    planFile: null,
    sample: 150,
    full: false,
    seed: 42,
    statusFilter: "completed",
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--plan-file":     o.planFile = argv[++i]; break;
      case "--sample":        o.sample = parseInt(argv[++i], 10) || 150; break;
      case "--full":          o.full = true; break;
      case "--seed":          o.seed = parseInt(argv[++i], 10) || 42; break;
      case "--status":        o.statusFilter = argv[++i]; break;
      case "--help":
      case "-h":              o.help = true; break;
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
Usage: node main/audit.js --plan-file <path> [options]

  --plan-file <path>   plan JSON to audit (required)
  --sample N           sample size (default 150). Ignored if --full.
  --full               audit every entry matching --status (full sweep)
  --seed N             RNG seed for reproducibility (default 42)
  --status S           which plan statuses to audit (default "completed")
`);
}

// ─── ORCHESTRATOR ────────────────────────────────────────────────────

class MigrationAudit {
  constructor(opts) {
    this.opts = opts;
    if (!opts.planFile) throw new Error("--plan-file is required.");

    const required = ["CLOUD_BASE_URL", "CLOUD_EMAIL", "CLOUD_API_TOKEN"];
    for (const k of required) {
      if (!process.env[k]) throw new Error(`Missing ${k} in .env`);
    }

    this.scriptRoot = path.resolve(__dirname, "..");
    this.logDir = path.join(this.scriptRoot, "logs");
    this.runId = String(Date.now());

    this.cloud = new CloudJiraClient(
      process.env.CLOUD_BASE_URL,
      process.env.CLOUD_EMAIL,
      process.env.CLOUD_API_TOKEN,
    );
    this.planManager = new PlanManager(this.logDir);
    this.stats = { sampled: 0, pass: 0, fail: 0, missing: 0 };
  }

  async run() {
    this.planManager.loadPlan(this.opts.planFile);
    if (!this.planManager.plan) throw new Error("No plan loaded");

    const pool = Object.entries(this.planManager.plan.entries)
      .filter(([, e]) => e.status === this.opts.statusFilter);
    if (pool.length === 0) {
      console.log(`No entries match status=${this.opts.statusFilter}. Nothing to audit.`);
      return;
    }

    const sample = this.opts.full
      ? pool
      : seededSample(pool, this.opts.sample, this.opts.seed);
    this.stats.sampled = sample.length;

    console.log(`Auditing ${sample.length} entries (status=${this.opts.statusFilter}, seed=${this.opts.seed})`);

    const rows = [];
    for (const [entryId, data] of sample) {
      try {
        const result = await this._check(entryId, data);
        rows.push({
          source_id: entryId,
          dest_id: result.dest_id || data.dest_id || "",
          field: result.field || "",
          expected: result.expected ?? "",
          actual: result.actual ?? "",
          match: result.match,
          checked_at: new Date().toISOString(),
        });
        if (result.match === "PASS") this.stats.pass++;
        else if (result.match === "FAIL") this.stats.fail++;
        else this.stats.missing++;
      } catch (err) {
        rows.push({
          source_id: entryId,
          dest_id: data.dest_id || "",
          field: "",
          expected: "",
          actual: "",
          match: "MISSING",
          checked_at: new Date().toISOString(),
        });
        this.stats.missing++;
      }
    }

    // Sort FAILs to the top of the CSV, then MISSING, then PASS.
    const order = { FAIL: 0, MISSING: 1, PASS: 2 };
    rows.sort((a, b) => (order[a.match] ?? 9) - (order[b.match] ?? 9));

    const outFile = path.join(this.logDir, `audit_${this.runId}.csv`);
    const csv = new CsvWriter(outFile, ["source_id", "dest_id", "field", "expected", "actual", "match", "checked_at"]);
    for (const row of rows) await csv.writeRow(row);
    csv.writeComment(`total=${this.stats.sampled} pass=${this.stats.pass} fail=${this.stats.fail} missing=${this.stats.missing}`);
    await csv.close();

    console.log(`\nAudit CSV: ${outFile}`);
    console.log(`  total=${this.stats.sampled} pass=${this.stats.pass} fail=${this.stats.fail} missing=${this.stats.missing}`);
    if (this.stats.fail > 0 || this.stats.missing > 0) process.exitCode = 1;
  }

  /**
   * Compare expected (from plan) vs actual (from destination).
   * Return shape:
   *   { match: "PASS"|"FAIL"|"MISSING", field, expected, actual, dest_id }
   *
   * Throw if the destination is unreachable — the caller records MISSING.
   */
  async _check(entryId, data) {
    // ───────────────────────────────────────────────────────────────
    // TODO: implement the per-entity check.
    //
    // Example — Jira custom field round-trip:
    //
    //   const issue = await this.cloud.getIssue(data.issueKey, data.fieldId);
    //   const actual = issue.fields?.[data.fieldId];
    //   const expected = data.newValue;
    //   return {
    //     match: JSON.stringify(actual) === JSON.stringify(expected) ? "PASS" : "FAIL",
    //     dest_id: issue.id, field: data.fieldId, expected, actual,
    //   };
    // ───────────────────────────────────────────────────────────────
    throw new Error("_check not implemented — fill in the TODO");
  }
}

// ─── MAIN ────────────────────────────────────────────────────────────

(async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) { help(); process.exit(0); }
  const job = new MigrationAudit(opts);
  await job.run();
})().catch((e) => {
  console.error("FATAL:", e.message);
  if (e.stack) console.error(e.stack);
  process.exit(1);
});
