# Track 1: Plan-Sync-Audit triad, two-gate/two-phase flags, core skeleton

Moved verbatim from SKILL.md on 2026-10-30 (skills audit); lines 119-200 of the old file. Read by section; the CORE card in SKILL.md wins on conflict.
Part of Track 1 (Plan/Sync/Audit, `plan-sync-audit/`). Backtick paths below are relative to the skill root (~/.claude/skills/atlassian-migration/); markdown links were re-pointed (`../`) so they resolve from references/.

### The Plan→Sync→Audit triad

```
SOURCE (DC or Cloud)        DEST (Cloud)
       │                        │
       │  plan-script           │
       │ ─ scan entities ──→ logs/plan_<runId>.json   ┐
       │                                              │  (human spot-check
       │                                              │   via CSV preview)
       │                        │                     ▼
       │  sync-script (--execute-only --plan-file …)
       │ ─ load plan ─ apply ──→ DEST  status→ completed|failed|skipped
       │                        │
       │  audit-script (--seed N)
       │ ─ sample completed ── re-fetch ── compare ──→ logs/audit_<runId>.csv
```

**Two-gate safety on every mutating run:**

| Flag combination | Effect |
|---|---|
| (nothing) | Read-only. Plans, dry-runs, audits all refuse to mutate without `--confirm`. |
| `--dry-run` | Walk the full plan, log every intended change, **never** call PUT/POST/DELETE. Writes backups. |
| `--confirm` | Operator confirms the run is intentional. Required before any mutation. |
| `--dry-run --confirm` | Same as `--dry-run`. Dry-run wins. |

**Two-phase workflow:**

| Flag | Effect |
|---|---|
| `--plan-only` | Build `logs/plan_<runId>.json`, then exit. |
| `--execute-only --plan-file <path>` | Skip discovery; load existing plan; process only `pending` (or `pending` + `failed` with `--retry-failed`). |
| (neither) | Plan then execute in one run. Useful for small jobs. |

### Core skeleton (a complete sync entry point)

```javascript
#!/usr/bin/env node
"use strict";
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const CloudJiraClient = require("../src/cloudJiraClient");
const PlanManager     = require("../src/planManager");
const { parseArgs }   = require("../src/cliFlags");
const { runPool }     = require("../src/workerPool");

(async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.dryRun && !opts.confirm) {
    console.error("Refusing to mutate without --confirm. Use --dry-run for preview.");
    process.exit(2);
  }

  const jira = new CloudJiraClient(
    process.env.CLOUD_BASE_URL, process.env.CLOUD_EMAIL, process.env.CLOUD_API_TOKEN,
  );
  const planManager = new PlanManager(path.resolve(__dirname, "../logs"));
  if (opts.executeOnly) planManager.loadPlan(opts.planFile);
  else                  planManager.createPlan(String(Date.now()));

  if (!opts.executeOnly) {
    // ── discover & populate the plan ──
    // await planManager.addEntry(id, { ... });
  }

  const pending = planManager.getEntriesToProcess(opts.retryFailed);
  await runPool(pending, async ([id, entry]) => {
    if (opts.dryRun) return planManager.updateEntryStatus(id, "skipped", "dry-run");
    try {
      // await jira.updateIssue(entry.issueKey, entry.payload);
      planManager.updateEntryStatus(id, "completed");
    } catch (err) {
      planManager.updateEntryStatus(id, "failed", err.message);
    }
  }, opts.concurrency);

  planManager.savePlan();
  console.log(planManager.formatStats());
})().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
```
