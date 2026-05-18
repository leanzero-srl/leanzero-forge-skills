#!/usr/bin/env node
"use strict";

/**
 * plan-script.template.js
 *
 * Phase 1 of a Plan→Sync→Audit migration job. Discovers source entities,
 * resolves identities and IDs, and writes a reviewable JSON plan +
 * companion CSV preview to `logs/`.
 *
 * Run:
 *   node main/plan.js --space DOCS,KB --limit 1000
 *
 * Then review:
 *   logs/plan_<runId>.json    ← the source of truth for the sync phase
 *   logs/plan_<runId>.csv     ← human-friendly preview, one row per intended change
 *
 * REQUIRED EDITS (search for "TODO" below):
 *   1. Choose your source: DC or Cloud (or both)
 *   2. Define the discovery query (CQL, JQL, or REST list)
 *   3. Decide what fields to persist in each plan entry
 *   4. Build the destination payload preview and write it to the CSV
 */

const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const CloudJiraClient = require("../src/cloudJiraClient");                  // TODO: swap for the client you need
// const CloudConfluenceClient = require("../src/cloudConfluenceClient");
// const DatacenterJiraClient = require("../src/datacenterJiraClient");
// const DatacenterConfluenceClient = require("../src/datacenterConfluenceClient");

const PlanManager = require("../src/planManager");
const { runPool } = require("../src/workerPool");
const { CsvWriter } = require("../src/csvWriter");

// ─── CLI ─────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const o = {
    spaceKeys: [],
    projectKeys: [],
    limit: 0,
    concurrency: 5,
    seed: null,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--space":   o.spaceKeys.push(...(argv[++i] || "").split(",").map((s) => s.trim()).filter(Boolean)); break;
      case "--project": o.projectKeys.push(...(argv[++i] || "").split(",").map((s) => s.trim()).filter(Boolean)); break;
      case "--limit":       o.limit = parseInt(argv[++i], 10) || 0; break;
      case "--concurrency": o.concurrency = parseInt(argv[++i], 10) || 5; break;
      case "--seed":        o.seed = argv[++i]; break;
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
Usage: node main/plan.js [options]

  --space K[,K...]      Confluence space keys to scan (repeatable)
  --project K[,K...]    Jira project keys to scan
  --limit N             cap planned entries
  --concurrency N       worker pool size (default 5)
  --seed S              attach a seed to the plan for downstream auditing
`);
}

// ─── ORCHESTRATOR ────────────────────────────────────────────────────

class MigrationPlan {
  constructor(opts) {
    this.opts = opts;

    const required = ["CLOUD_BASE_URL", "CLOUD_EMAIL", "CLOUD_API_TOKEN"];
    for (const k of required) {
      if (!process.env[k]) throw new Error(`Missing ${k} in .env`);
    }

    this.scriptRoot = path.resolve(__dirname, "..");
    this.logDir = path.join(this.scriptRoot, "logs");
    if (!fs.existsSync(this.logDir)) fs.mkdirSync(this.logDir, { recursive: true });

    this.runId = String(Date.now());
    this.logFile = path.join(this.logDir, `plan_${this.runId}.log`);

    // TODO: instantiate the clients you actually need
    this.cloud = new CloudJiraClient(
      process.env.CLOUD_BASE_URL,
      process.env.CLOUD_EMAIL,
      process.env.CLOUD_API_TOKEN,
    );

    this.planManager = new PlanManager(this.logDir, (m) => this.log(m));
    this.csv = null;

    this.stats = { discovered: 0, planned: 0, skipped: 0 };
  }

  log(msg) {
    const line = `[${new Date().toISOString()}] ${msg}`;
    console.log(msg);
    try { fs.appendFileSync(this.logFile, line + "\n"); } catch { /* swallow */ }
  }

  async run() {
    this.log(`Plan run ${this.runId} starting...`);
    if (!(await this.cloud.testConnection())) throw new Error("Cloud connection failed");

    this.planManager.createPlan(this.runId);
    this.csv = new CsvWriter(
      path.join(this.logDir, `plan_${this.runId}.csv`),
      ["source_id", "source_url", "dest_id_if_known", "operation", "field", "old_value", "new_value", "reason"],
    );

    // ───────────────────────────────────────────────────────────────
    // TODO: discover the entities to migrate.
    //
    // Example — Jira issues by JQL:
    //
    //   const jql = `project IN (${this.opts.projectKeys.map((p) => `"${p}"`).join(",")}) AND ...`;
    //   const candidates = [];
    //   await this.cloud.searchIssuesByJql(jql, { fields: ["summary"], maxResults: 100 }, async (issues) => {
    //     for (const issue of issues) {
    //       candidates.push(issue);
    //       if (this.opts.limit && candidates.length >= this.opts.limit) return false;
    //     }
    //   });
    //
    // Example — Confluence pages by CQL:
    //
    //   await cloudConfluence.searchContentByCql(
    //     `space = "${spaceKey}" AND type = page`,
    //     "version,space",
    //     async (results) => { ... }
    //   );
    //
    // For each candidate, decide whether it needs a plan entry, then call:
    //
    //   await this.csv.writeRow({ source_id: ..., operation: "update", ... });
    //   this.planManager.addEntry(candidate.id, { sourceKey: ..., targetField: ..., newValue: ... });
    // ───────────────────────────────────────────────────────────────

    this.planManager.savePlan();
    await this.csv.close();
    this.log(`\nPlan written: ${this.planManager.planFilePath}`);
    this.log(`  ${this.planManager.formatStats()}`);
    this.log(`  Discovered: ${this.stats.discovered}, Planned: ${this.stats.planned}, Skipped: ${this.stats.skipped}`);
  }
}

// ─── MAIN ────────────────────────────────────────────────────────────

(async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) { help(); process.exit(0); }
  const job = new MigrationPlan(opts);
  await job.run();
})().catch((e) => {
  console.error("FATAL:", e.message);
  if (e.stack) console.error(e.stack);
  process.exit(1);
});
