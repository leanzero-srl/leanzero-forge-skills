# Running & Monitoring (for AI Agents and Operators)

These scripts are long-running. The smallest job is a few seconds; a real one can run for tens of minutes to hours. An AI assistant orchestrating a migration cannot afford to block while the script runs — and a human operator needs to know **what's happening right now**, not just **what happened at the end**.

This doc describes the conventions every sub-project in this skill follows so that *both* a model and a human can launch a script, observe progress, and report status without reading the source.

## The progress contract

Every `main/*.js` in this skill emits the same three signals to its log file (which is also tee'd to stdout). An external observer relies on these and only these:

| Signal | Where | Cadence | What it tells you |
|---|---|---|---|
| Banner | First 10 lines of `logs/sync_<runId>.log` | Once, at start | Mode (PLAN ONLY / EXECUTE ONLY / FULL), source + dest base URLs, JQL, concurrency, dry-run flag |
| `Step N: <action>...` | Throughout | Every phase boundary | The script is past connection tests, past plan build, currently in execute phase, etc. |
| `progress: X/Y (uploaded: U, failed: F)` | Inside execute loop | Every 25 entries (configurable) | Throughput and live failure count. Watch the gap between consecutive lines for stall detection. |
| `FINAL REPORT` block | Last ~20 lines | Once, at end | Aggregate stats, CSV paths, master-index path, elapsed seconds |

Any sub-project that deviates from this contract is wrong. Fix the script — don't invent new monitoring.

### Example (real run, `sync_issue_attachments`)

```
[2026-05-19T05:10:23.715Z] ==========================================
[2026-05-19T05:10:23.715Z] Sync Issue Attachments: DC -> Cloud
[2026-05-19T05:10:23.715Z] ==========================================
[2026-05-19T05:10:23.715Z]   DC:    https://jira.example.com
[2026-05-19T05:10:23.715Z]   Cloud: https://example.atlassian.net
[2026-05-19T05:10:23.715Z]   Mode: EXECUTE ONLY (loading existing plan)
[2026-05-19T05:10:23.715Z]   Concurrency: 3
[2026-05-19T05:10:23.715Z] Step 1: Testing connections...
[2026-05-19T05:10:23.830Z]   Datacenter: OK
[2026-05-19T05:10:24.027Z]   Cloud Jira: OK
[2026-05-19T05:10:24.028Z] Step 2: Loading existing plan...
[2026-05-19T05:10:24.051Z]   Loaded plan: 1510 issues (380 pending, 50 completed, 0 failed, 1080 skipped)
[2026-05-19T05:10:24.051Z] Step 3: Executing plan (380 pending issues)...
[2026-05-19T05:10:30.582Z]     progress: 25/380 (uploaded: 9, failed: 0)
[2026-05-19T05:11:13.731Z]     progress: 50/380 (uploaded: 113, failed: 0)
...
[2026-05-19T05:20:28.978Z] ============================================================
[2026-05-19T05:20:28.978Z] FINAL REPORT
```

10 minutes wall-clock; one progress line every ~30 seconds; you can compute throughput from the ISO timestamps.

## How an AI agent should launch a script

Use **background execution** for anything past `--plan-only --limit 5`. Foreground holds the tool call open for the entire run; on a real plan that's tens of minutes of dead time the operator can't interrupt.

```bash
# Foreground — OK for smoke tests only
node main/sync_issue_attachments.js --jql 'key = PROJ-123' --dry-run

# Background — the default for any real run
# (Claude Code: Bash tool with run_in_background: true)
node main/sync_issue_attachments.js --plan-only > /dev/null 2>&1
```

When you run via the harness's `Bash` tool with `run_in_background: true`, you get a process ID you can attach to with the `Monitor` tool. Each new stdout line is delivered as a notification. **Don't sleep-poll** — let the harness wake you when the script writes a line.

If `run_in_background` is unavailable, tail the log file periodically:

```bash
# Find the latest log for this sub-project
ls -t logs/sync_*.log | head -1
# Show last N lines
tail -50 "$(ls -t logs/sync_*.log | head -1)"
# Or only progress lines
grep -E "^\[.*\]\s+progress:" "$(ls -t logs/sync_*.log | head -1)" | tail -10
```

Avoid blocking `tail -f` inside a tool call — it never returns and burns your context window. Use bounded `tail -N` snapshots at intervals instead. If you're in a /loop, snapshot once per loop tick and report deltas.

## How to report progress to the user

The user typed one command. They expect short, specific updates — not a copy of the log file. Distill the log into a one-line state per check-in:

| What the log says | What you say |
|---|---|
| Banner just printed | "Started. Mode: execute-only on 1510 issues, concurrency 3." |
| First `progress:` line | "9 attachments uploaded out of ~1388 expected (~25/380 issues processed)." |
| Mid-run | "Half done. 650 of ~1388 uploaded, 0 failures. ETA ~5 min based on the last 25-issue batch." |
| `FINAL REPORT` seen | "Finished. 1388 uploaded, 119 already-present, 0 failed. Log: logs/sync_<runId>.log" |
| Gap > 5 min since last `progress:` line, no `FINAL REPORT` | "Last progress line was 6 min ago at 250/380. May be in a 429 backoff or a slow upload. Checking now." |
| Process exited non-zero | "Crashed. Last log line: `<excerpt>`. Plan was autosaved — re-run with `--resume --retry-failed` after fixing." |

Three rules:
1. **Always include the runId** in your final report so the operator can find the plan + log later.
2. **Always link to the log file path**, not the directory.
3. **Never echo the whole log** — quote at most 5 lines for failures, and use file_path:line_number style references for anything longer.

## Detecting completion

Three independent signals; use any two. They all mean "the script is done":

1. **The background bash process exits.** If you launched via `run_in_background`, the harness notifies you. Exit code 0 = clean; non-zero = crash (plan should still be saved if SIGINT/SIGTERM was honored).
2. **The string `FINAL REPORT` appears in the log file.** Reliable inside the run, but doesn't tell you if the process is *still* alive after — only that the run completed its happy path.
3. **The master-index `updatedAt` stops changing** for more than the autosave interval (default 500 updates / a few seconds). Combine with #2 to be sure the process exited cleanly.

The script also auto-saves the plan + master index on `SIGINT` and `SIGTERM` (see `main/*.js` — every entry point installs the handler). If you need to stop a run, send SIGTERM. Don't `kill -9` — that skips the save.

## Detecting stuck runs

These scripts can stall without crashing. Signs:

| Symptom | Likely cause | Action |
|---|---|---|
| No `progress:` line for ≥ 5× the normal gap | 429 retry storm (rate limit) | Wait — exponential backoff caps at ~60s per request, full storm clears in 5-10 min. If still stuck after 15 min, kill and re-run with lower `--concurrency`. |
| Same `progress:` line repeated | A single issue is hanging on a giant upload | Check the HTTP client timeout — multipart upload should be ≥ 5 min. Confirm with `lsof -p <pid> \| grep ESTABLISHED`. |
| `progress:` lines but `failed:` count climbing fast | Source data has a systematic problem (deleted issues, missing perms) | Stop the run; inspect a couple of failed rows from the plan JSON; fix root cause; resume. |
| Plan file unchanged after autosave threshold | Worker pool deadlocked | This is a bug — capture the stack with `kill -USR1 <pid>` (if installed) and report. |

## Plan, log, and master files — where state lives

```
<sub-project>/logs/
├── master_<runId>.json          ← THE pointer: which plan file, run-level stats, CSV paths
├── plan_<runId>.json            ← THE per-entity ledger: one row per issue/page
├── sync_<runId>.log             ← Human-readable timeline (this doc's contract)
├── missing_attachments_<runId>.csv   ← Sub-project-specific outputs
├── oversize_attachments_<runId>.csv
└── tmp/<runId>/                 ← Scratch (gitignored, auto-cleaned unless --keep-temp)
```

To resume the most recent run, point `--plan-file` at the latest `master_*.json` (the index will name the plan):

```bash
node main/sync_issue_attachments.js --resume \
  --plan-file "$(ls -t logs/master_*.json | head -1)"
```

For diagnostics, the plan JSON is `jq`-friendly:

```bash
# How many issues are still pending?
jq '[.issues | to_entries[] | select(.value.status == "pending")] | length' logs/plan_<runId>.json

# Which ones failed and why?
jq '.issues | to_entries[] | select(.value.status == "failed") | {key: .key, error: .value.error}' \
   logs/plan_<runId>.json | head -20
```

## Client reuse and caching across the run

A migration sub-project creates exactly **one** `DatacenterClient` and **one** `CloudJiraClient` (or Confluence equivalent) at startup, and threads them through every processor module. This matters because:

- Each client carries **internal caches** keyed by entity. `cloudClient._attachmentCache`, `cloudClient._issueExistsCache`, `cloudClient._configCache` — these are populated lazily and invalidated explicitly. Re-creating clients between phases blows away the cache and re-fetches everything.
- The client owns **request-count and error-count counters** for the final report. Two clients = misleading counts.
- Worker-pool concurrency is bounded *per client*, not per call site. Multiple clients lose that bound.

### Cache priming

When you call `cloud.searchIssues(jql, "attachment,...")`, the response already contains the attachment list for each issue. **Prime the cache** so a subsequent `listAttachments(key)` returns instantly:

```javascript
for (const issue of cloudIssues) {
  cloudClient._attachmentCache.set(issue.key, (issue.fields.attachment || []).map(toShape));
}
```

This is the single biggest rate-limit win when a planner walks N issues and then the executor inspects each one again — without priming, you double the GET count.

### Cache invalidation after writes

Whenever a write changes destination state, invalidate the relevant cache entry:

```javascript
async uploadAttachment(issueKey, ...) {
  const result = await this.makeMultipartRequest(...);
  this.invalidateAttachmentCache(issueKey);  // next listAttachments() re-fetches
  return result;
}
```

Without this, the post-write preflight in the next issue thinks the attachment isn't there.

## Environment variables

Every sub-project reads its `.env` from the parent directory of `main/`:

```javascript
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
```

Conventions across siblings in `jira-data/`:

- The `.env` is **per sub-project**, not shared across projects in the same monorepo. Each clone keeps its own copy so a credential rotation only touches one folder.
- The same five variables (`DC_BASE_URL`, `DC_USERNAME`, `DC_PASSWORD`, `CLOUD_BASE_URL`, `CLOUD_API_TOKEN`) appear in every sub-project's `.env.example` — operators have one mental model.
- `CLOUD_API_TOKEN` is **base64-encoded `email:api_token`**, ready to drop into the `Authorization: Basic <token>` header without re-encoding. The .env.example documents this; the client constructor does not re-base64. Mis-formatted token = 401 at the first `testConnection`.
- `validateConfig()` runs in the sub-project's constructor — missing variables fail loud with the variable names listed. **Never** swallow this check.

## Logging conventions

Every entry point opens one log file at start:

```javascript
this.logFile = path.join(this.logDir, `sync_${Date.now()}.log`);
fs.writeFileSync(this.logFile, `Sync … Log\nStarted: ${new Date().toISOString()}\n${"=".repeat(80)}\n\n`);

log(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(message);                      // unprefixed for terminal readability
  try { fs.appendFileSync(this.logFile, line + "\n"); } catch { /* ignore */ }
}
```

Two sinks. Console output is human-friendly (no leading timestamp); the file gets the ISO timestamp prefix so external observers can compute throughput. The append failure is silently ignored — losing a log line is preferable to crashing the run.

For very long runs (1M+ lines), prefer `templates/logger.js` which holds a `WriteStream` open instead of `appendFileSync` per line. `appendFileSync` blocks the event loop and serializes writes — fine for tens of thousands of lines, painful past that.

## Unattended start: the AI-agent contract

A common operator pattern: **"start the script and check on it every X seconds — tell me when it's done or if it stalls."** This is the right way to delegate a multi-hour migration to an agent without holding the CLI session open. The contract below is what an agent should follow when given this instruction (or when it makes sense without an explicit one — e.g., the user asked to "run the migration" and the dry-run/plan already showed > 5 minutes of work pending).

### The pattern (in seven steps)

1. **Refuse to start without two-gate safety.** If the user asks for an unattended run, verify the command includes `--confirm`. Dry-runs may be launched without it, but a real mutation requires it explicitly — never default to mutation. If missing, ask once.
2. **Smoke test first.** One `--plan-only --limit 5` or `--dry-run` invocation in the foreground, ≤ 30 seconds, to catch auth or config errors before committing to a multi-hour run. Refuse to skip this on populations > 100 entries.
3. **Launch in background.** Use the Bash tool with `run_in_background: true` and direct stdout/stderr to `/dev/null` (the script writes its own `logs/<script>_<ts>.log`). Record the bash process ID returned by the harness.
4. **Capture the latest log path** before any polling. `ls -t logs/*.log | head -1` once, store the result. The script appends to this one file for the run's lifetime; you don't have to re-discover it on every check.
5. **Poll on an interval the user specified, or 60 s by default.** Use a `/loop` skill invocation or `ScheduleWakeup` (dynamic-pacing mode). NEVER busy-wait with `sleep` in foreground — that burns the cache and blocks the agent.
6. **Each tick: snapshot, distill, decide.** Read only the tail of the log + the latest plan/master file stats; do not echo the log. Distill into a one-line state update (see "How to report progress to the user" above). Compute deltas vs. the previous tick. Decide: still progressing → keep polling. Stalled (> 5× normal gap with no `progress:` line) → flag to the user. `FINAL REPORT` seen or process exited → report completion and stop polling.
7. **End loudly.** When the run finishes (clean or crashed), send one final message with: the runId, the log file path, the per-status counts from the master index, and — if crashed — the last 5 log lines.

### Polling cadence — picking X

The Bash tool's "you'll be notified when the process exits" notification handles the **completion** signal for you. The polling interval is only for **progress reports during the run**:

| Run length | Cadence | Why |
|---|---|---|
| < 5 min | don't poll — wait for the exit notification | Polling overhead exceeds the run |
| 5–30 min | every 60–120 s | One progress line every 25 entries × ~1 s = 25 s; 60 s sees 2–3 new lines |
| 30 min–4 h | every 5–10 min (300–600 s) | Cache miss vs. 60s polling pays off in fewer wakeups |
| > 4 h | every 15–30 min (900–1800 s) | Long-tail mode; just confirm forward progress |

If using `ScheduleWakeup` (the /loop dynamic-pacing mechanism), respect the prompt-cache TTL math: a 60–270 s wake stays in cache; a 5-minute (300 s) wake is the worst-of-both. Prefer 270 s for fast cadence, 1200–1800 s for slow.

### Snapshot commands per tick

Run these in parallel via a single Bash tool call (independent reads):

```bash
# 1. Is the process still alive? Harness will notify on exit, but a
#    belt-and-braces check is cheap when polling.
ps -p <PID> -o pid=,etime=,rss= 2>/dev/null || echo "EXITED"

# 2. Latest progress line — distill into "X/Y, U uploaded, F failed"
grep -E "^\[.*\]\s+progress:" "$LOGFILE" | tail -1

# 3. Final-report marker — appears once when the script finishes happy
grep -c "FINAL REPORT" "$LOGFILE"

# 4. Memory line if heap-bumper-style scripts log it
grep -E "heap=|rss=" "$LOGFILE" | tail -1

# 5. Recent errors (last 5)
grep -E "^\[.*\]\s+(ERROR|FAIL|crashed|FATAL)" "$LOGFILE" | tail -5
```

Combine into a one-line state message per tick.

### Stall detection

You decide "stalled" by combining three signals — any TWO of these means stalled:

1. **No new `progress:` line for > 5× the historical gap** (measure the gap on the first 3 lines, then compare).
2. **`rss=` line shows monotonic growth with no new `scanned=` increment** — leak rather than work.
3. **`ps` shows the process still running but `lsof -p <PID> | grep ESTABLISHED` shows zero active sockets** — wedged in a sleep loop or in a 429 backoff storm.

When stalled, surface the diagnosis to the user — don't kill it on your own without asking. Suggest the right action (wait 5 min for 429 to clear; `kill -SIGTERM <PID>` for a wedged process so the plan saves; `--retry-failed` on resume).

### Example agent transcript

> **User**: Kick off the full plan in execute mode against PROD, check in every 5 minutes, ping me when it's done.
> **Agent**: *(verifies `--confirm` is set, runs `--dry-run --limit 5` smoke test, confirms clean)* Smoke test passed. Launching in background. Plan has 12,400 pending entries, expected wall-clock ~45 min at the current per-batch rate.
> *(launches with `run_in_background: true`, captures PID, schedules a 300s wakeup)*
> Started. PID 84321. Log: `logs/sync_1716489000.log`. Next check in 5 min.
> *(5 min later, on wakeup, snapshots log)*
> 2,800/12,400 done, 0 failures, RSS 1.2 GB stable. ETA ~38 min from now. Next check in 5 min.
> *(continues polling; final-report appears, harness notifies on exit)*
> Finished. 12,400 processed, 12,387 uploaded, 13 skipped (cloud-issue-not-found), 0 failed. Log: `logs/sync_1716489000.log`. Master: `logs/master_1716489000.json`.

### When NOT to auto-start

The agent must NOT silently launch a destructive run, even with `--confirm`, if:
- The user asked a research question ("what does this script do?"). Explain, don't run.
- The dry-run flagged a destination drift > 5%. Report and wait.
- The plan is empty. Report and wait.
- The `.env` doesn't match the production base URL the user mentioned. Confirm tenant ID with the user first.

The cost of one missed launch is seconds; the cost of mutating the wrong tenant is hours of rollback. **Ask once if anything looks off.**

## Smoke test before a real run

The skill's standard order, for any new sub-project or any production-touching run:

1. `bash scripts/preflight-check.sh` — Node version, `.env` present, base URLs DNS-resolvable.
2. `bash scripts/test-auth.sh` — both source and destination return 200 on `/myself`.
3. `node main/<script>.js --jql '<one issue>' --dry-run` — exercise the full code path against one entity. Look for the `Step 1: Testing connections...` lines and a clean `FINAL REPORT`.
4. `node main/<script>.js --plan-only --limit 50` — build a small plan, eyeball the CSV.
5. `node main/<script>.js --plan-only` — build the full plan; commit the master + plan files to a ticket.
6. `node main/<script>.js --execute-only --plan-file logs/master_<runId>.json --dry-run` — load the plan, walk it without writing.
7. `node main/<script>.js --execute-only --plan-file logs/master_<runId>.json` — the real run. **Launch in background.**
8. Audit script if available; `bash scripts/audit-summary.sh` to aggregate.

An agent should refuse to skip steps 3-6 on a population larger than ~100 entries, even if the operator asks. The cost of one smoke run is seconds; the cost of mass-corrupting a tenant is hours.

## See also

- [`01-core-concepts.md`](01-core-concepts.md) — two-phase, two-gate model
- [`02-plan-manager.md`](02-plan-manager.md) — plan + master-index file shapes
- [`06-csv-and-cli-conventions.md`](06-csv-and-cli-conventions.md) — log/plan/audit filename conventions
- [`08-concurrency-and-pool.md`](08-concurrency-and-pool.md) — why concurrency 3-5 is the sweet spot
- [`27-rate-limits-and-quotas.md`](27-rate-limits-and-quotas.md) — what a 429 storm actually looks like in the logs
