"use strict";

/**
 * Multi-key dispatcher: assign jobs (sub-plans) to slots (API tokens),
 * spawn one Node child process per slot, track status across crashes.
 *
 * This is the JS equivalent of `templates/run-driver.sh.template` —
 * pick the bash driver for the simple case (one user's tokens, one
 * machine, easy logs); pick this JS dispatcher when you need:
 *
 *   - Persistent state across dispatcher restarts (slot/job assignment
 *     survives Ctrl-C and re-launch).
 *   - Coordination across MULTIPLE tokens (one slot per token) where
 *     a job can run on any available token, not a fixed queue.
 *   - Programmatic re-queue logic (retry on non-zero exit, skip on
 *     repeated failures, dynamic queue from a discovery script).
 *
 * Topology:
 *
 *     dispatcher.js (parent)
 *       │
 *       ├── slot 1 (CLOUD_API_TOKEN)    -> child: node main/script.js --plan-file <X>
 *       ├── slot 2 (CLOUD_API_TOKEN_2)  -> child: node main/script.js --plan-file <Y>
 *       ├── slot 3 (CLOUD_API_TOKEN_3)  -> child: node main/script.js --plan-file <Z>
 *       └── ...
 *
 * Each slot binds one credential. When a child exits, the dispatcher
 * records the result, frees the slot, and starts the next pending job
 * on it. The slot-to-token binding is sticky — token_3 is never used
 * by a slot it wasn't assigned to — so each user's rate-limit bucket
 * is consumed predictably.
 *
 * State JSON is written on every transition. A relaunched dispatcher
 * reads it, marks any prior "running" jobs as pending (the children
 * died with the parent), and resumes.
 *
 * Pattern mirrors sync_asset_ticket_associations/logs/dispatcher_state_*.json.
 *
 * Usage:
 *
 *   const { Dispatcher } = require("../src/dispatcher");
 *   const d = new Dispatcher({
 *     stateFile: `logs/dispatcher_state_${Date.now()}.json`,
 *     scriptPath: "main/sync_xxx.js",
 *     logDir: "logs",
 *     slots: [
 *       { id: 1, envVar: "CLOUD_API_TOKEN",   owner: "mihai" },
 *       { id: 2, envVar: "CLOUD_API_TOKEN_2", owner: "jan"   },
 *       { id: 3, envVar: "CLOUD_API_TOKEN_3", owner: "akash" },
 *       { id: 4, envVar: "CLOUD_API_TOKEN_4", owner: "nenad" },
 *     ],
 *     jobs: [
 *       { id: "field-1", planFile: "logs/master_split_Field_A.json", args: ["--execute-only", "--retry-failed"] },
 *       { id: "field-2", planFile: "logs/master_split_Field_B.json", args: ["--execute-only", "--retry-failed"] },
 *       ...
 *     ],
 *   });
 *   d.attachSignalHandlers();
 *   const result = await d.run();
 *   console.log(result);  // { total, completed, failed }
 */

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

class Dispatcher {
  constructor(opts) {
    this.stateFile = opts.stateFile;
    this.slots = opts.slots.map((s) => ({
      ...s,
      currentJob: null,
      pid: null,
      logFile: null,
      child: null,
    }));
    this.jobs = opts.jobs.map((j) => ({
      ...j,
      status: "pending",
      slot: null,
      startedAt: null,
      completedAt: null,
      exitCode: null,
    }));
    this.scriptPath = opts.scriptPath;
    this.logDir = opts.logDir || "logs";
    this.log = opts.log || console.log;

    if (!fs.existsSync(this.logDir)) fs.mkdirSync(this.logDir, { recursive: true });

    // Resume from prior state if a file with the same name exists.
    // Children running under the previous parent are gone; mark their
    // jobs pending so we re-launch them.
    if (fs.existsSync(this.stateFile)) {
      this.log(`Resuming dispatcher state from ${this.stateFile}`);
      const prior = JSON.parse(fs.readFileSync(this.stateFile, "utf8"));
      for (const j of this.jobs) {
        const p = (prior.jobs || []).find((x) => x.id === j.id);
        if (!p) continue;
        if (p.status === "completed" || p.status === "failed") {
          Object.assign(j, p);
        } else if (p.status === "running") {
          j.status = "pending";
        }
      }
    }
  }

  async run() {
    this.persistState();
    return new Promise((resolve) => {
      const filling = () => {
        for (const slot of this.slots) {
          if (slot.currentJob) continue;
          const next = this.jobs.find((j) => j.status === "pending");
          if (!next) return;
          this._assign(slot, next);
        }
      };

      this._onSlotFree = (slot, job, exitCode) => {
        job.status = exitCode === 0 ? "completed" : "failed";
        job.exitCode = exitCode;
        job.completedAt = new Date().toISOString();
        slot.currentJob = null;
        slot.pid = null;
        slot.child = null;
        this.log(`  slot ${slot.id} (${slot.owner}) finished ${job.id} exit=${exitCode}`);
        this.persistState();
        filling();
        const stillRunning = this.slots.some((s) => s.currentJob);
        const stillPending = this.jobs.some((j) => j.status === "pending");
        if (!stillRunning && !stillPending) resolve(this._summary());
      };

      filling();
      const stillRunning = this.slots.some((s) => s.currentJob);
      const stillPending = this.jobs.some((j) => j.status === "pending");
      if (!stillRunning && !stillPending) resolve(this._summary());
    });
  }

  _assign(slot, job) {
    const token = process.env[slot.envVar];
    if (!token) {
      this.log(`  slot ${slot.id}: ${slot.envVar} not set; skipping all jobs on this slot`);
      // Mark this slot as permanently disabled by claiming a sentinel job
      slot.currentJob = "__disabled__";
      return;
    }
    const logFile = path.join(
      this.logDir,
      `dispatcher_slot${slot.id}_${slot.owner}_${job.id}.out`,
    );
    const out = fs.openSync(logFile, "a");
    const args = [this.scriptPath, ...(job.args || [])];
    if (job.planFile) args.push("--plan-file", job.planFile);

    const child = spawn(process.execPath, args, {
      env: { ...process.env, CLOUD_API_TOKEN: token },
      stdio: ["ignore", out, out],
      detached: false,
    });

    slot.currentJob = job.id;
    slot.pid = child.pid;
    slot.logFile = logFile;
    slot.child = child;
    job.status = "running";
    job.slot = slot.id;
    job.startedAt = new Date().toISOString();

    this.log(`  slot ${slot.id} (${slot.owner}) -> ${job.id} pid=${child.pid} log=${logFile}`);
    this.persistState();

    child.on("exit", (code) => {
      try { fs.closeSync(out); } catch { /* ignore */ }
      this._onSlotFree(slot, job, code);
    });
  }

  persistState() {
    const state = {
      stateFile: this.stateFile,
      updatedAt: new Date().toISOString(),
      slots: this.slots.map((s) => ({
        id: s.id, envVar: s.envVar, owner: s.owner,
        currentJob: s.currentJob, pid: s.pid, logFile: s.logFile,
      })),
      jobs: this.jobs.map((j) => ({
        id: j.id, planFile: j.planFile, args: j.args,
        status: j.status, slot: j.slot,
        startedAt: j.startedAt, completedAt: j.completedAt, exitCode: j.exitCode,
      })),
    };
    fs.writeFileSync(this.stateFile, JSON.stringify(state, null, 2));
  }

  _summary() {
    return {
      total: this.jobs.length,
      completed: this.jobs.filter((j) => j.status === "completed").length,
      failed:    this.jobs.filter((j) => j.status === "failed").length,
    };
  }

  attachSignalHandlers() {
    const shutdown = (sig) => {
      this.log(`Dispatcher received ${sig}, forwarding SIGTERM to children...`);
      for (const slot of this.slots) {
        if (slot.child && !slot.child.killed) {
          try { slot.child.kill("SIGTERM"); } catch { /* ignore */ }
        }
      }
      this.persistState();
    };
    process.on("SIGINT",  () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
  }
}

module.exports = { Dispatcher };
