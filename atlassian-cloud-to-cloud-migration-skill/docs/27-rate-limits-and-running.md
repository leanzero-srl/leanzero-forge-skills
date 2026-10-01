# Rate limits and running a multi-hour migration

General rate-limit math, backoff and bulk endpoints: `atlassian-migration-scripts-skill/docs/27-rate-limits-and-quotas.md`.
Launching and observing long scripts as an AI agent: `atlassian-migration-scripts-skill/docs/13-running-and-monitoring.md`.
This doc is what was specific to a two-site copy under a deadline.

## The Jira cost budget is per ACCOUNT per SITE per hour

Measured: the target answered `429` with `x-ratelimit-limit` (a points budget, e.g. 150,000 on one site and 300,000 on
another), `x-ratelimit-remaining: 0` and `x-ratelimit-reset` = the top of the next hour. More threads do not help once
the budget is spent; three parallel chains on one account exhausted it at ~35 items/min.

Consequences:
- **429 waits until `x-ratelimit-reset`** (format `YYYY-MM-DDTHH:MMZ`), not a short backoff. Old code gave up after 12
  tries — a dead run at the first busy hour.
- **A second admin account has its own budget.** Split target WRITES across two accounts (e.g. `TGT_EMAIL/TGT_TOKEN`
  per chain), two chains per account, projects balanced by item count (~6k numbers per chain).
- **Use disjoint project lists per account** for any write that appends (a marker check per item cannot stop two
  writers on the same project from double-appending).
- The source READ budget is shared too: every chain plus the Confluence loop read the source with one account — stop
  every other job that reads the source with that account (evidence rebuilds, sandbox jobs) before the run.
- `/rest/api/3/myself` and user searches share the budget; avoid probes during the load ("no extra probing at
  saturation").
- A long description-PUT job ran one account out of budget after ~6k PUTs; it was killed during the 429 sleep (no write
  in flight) and restarted split over both accounts.
- A test-management app had a separate per-USER limit (~30/min) — doc 12.

Headers seen: `x-ratelimit-limit` (e.g. 300000 on one site, 150000 on a sandbox), `x-ratelimit-remaining`,
`x-ratelimit-reset`, `retry-after`, `ratelimit-reason: jira-cost-based` on writes and `jira-burst-based` (with a
`q=…;w=1` policy) on bursts. A fresh second account showed its own, separate limit. Documented model (worth reading
before planning): base 1 point per request, users/groups 2 points, burst limits per second (GET/POST ~100, PUT/DELETE
~50).

## Write safety: what may be retried

| Response | Retry? |
|---|---|
| 429 (any method) | **Yes** — the request was rejected, not processed. Wait `Retry-After` / `x-ratelimit-reset` |
| 5xx / timeout on GET | Yes, with backoff |
| 5xx / timeout on POST/PUT/DELETE | **No blind retry** — it may have been applied. Check the target state (marker label at the expected key, value read back), then decide |
| 404 on a just-created item | Retry GETs a few times (~30 s) — new items lag |
| 400 | Never — your payload is wrong; read the message |
| An instant, reproducible 500 | Stop retrying — the route is broken; find a second route |

Several scripts on the production path had NO 429 handling at all; on a throttled sandbox one crashed and the
orchestrator stopped with "NOTIF SILENT FAILED". A small shim imported by every script fixed that class
(`templates/atl_http.py`).

## Orchestration that survived crashes

- **One orchestrator** creates targets, runs preflight, enters silence, pauses automation, starts the Confluence loop
  in the background, starts N Jira chains, then runs the post passes once all copies are done. Post passes were split
  into their own script (`run_post`) that WAITS until no copy process runs on the target.
- **Every step resume-safe**: re-running the orchestrator after a crash must be correct (create = "exists", preflight
  passes for objects THIS run created, each chain resumes at its last number, the Confluence copy resumes from its page
  map). Never start a second orchestrator while one runs.
- **A failed single project** = re-run only that project's copy command; the post script waits for it.
- **Second pass on POST FAIL** (doc 04).
- `trap EXIT` in the orchestrator resumes paused automation; after a `kill -9`, run the resume by hand.
- **Alerts file**: every script appends one-line alerts (`NUMBER LOST`, `POST FAIL … STILL after pass 2`,
  `CREATE <P> FAILED`, `TEAMS FAILED`, `URL REWRITE FAILED`, `PROD RUN DONE`); the human/agent monitor reads that, not
  the whole log.
- **Hard stop times** for late writers (no writes after a set local time) and an explicit end marker.
- **Per-run state directory** (`runs/<target>/…`): maps, logs, records. A rehearsal's top-level map files gave
  different ids from the production ones and one script read the wrong one — always pass the run.

## Process hygiene (each of these cost a run)

- **`pkill -f "<pattern>"` killed the orchestrator's own background subshells** (they share the command line) — the
  Confluence half of a rehearsal died this way. Kill by PID of the specific process.
- **`pgrep -f "<pattern>"` inside a `sh -c '…<pattern>…'` waiter matches the waiter itself** → it never proceeds, or
  `pkill` kills the waiter. Hit three times. Wait on a PID (`kill -0 $PID`) or a file.
- A launcher that waited on the shell's PID instead of the Python child's fired early and was killed during project
  creation. Wait on the real worker's PID.
- **Never edit a running shell script** (zsh/bash read it incrementally — the edit changes what runs). Python files are
  compiled at start and safe to edit, except when a pool/xargs spawns NEW processes that import the edited module.
  Write a temp file and `mv` it into place.
- A long job that has not written its first checkpoint is broken, not slow — give every long scan a first-checkpoint
  deadline. (A Confluence route that 500ed instantly was retried for 50 minutes.)
- A regex can hang inside C code where a Python alarm cannot interrupt it — make inputs safe (doc 08/09) and run
  pathological work in killable subprocesses.
- A plain `threading.Lock` taken twice deadlocks; use `RLock` or never nest. Diagnose a hung Python process with
  `sample <pid>` (macOS) — a chain silent for 11 minutes was sleeping until the hourly reset, not dead.
- Python 3.9: `socket.timeout` is NOT a `TimeoutError` — it killed two verify runs. Catch `OSError`.
- macOS has no `timeout`; zsh aborts a whole command on a glob with no match (`setopt nullglob`); a background task
  whose output passes a few GB is killed — never stream huge output.
- Adding a file to a directory that other scripts glob can break them: a new `cmap-ARCHIVED.json` broke every
  `cmap-<SRC>-<TGT>.json` parser (`split("-")`). Grep every glob reader before adding a file.
- Derive counts and lists from ONE scope file: a freshness gate expected 35 scans after the scope had become 33; a
  scope change has to be grepped through every run list, the preflight, the freeze, the evidence, the report text, the
  final review and the guard. Move stale out-of-scope package files into their own directory.
- When a chain fails, kill the orchestrator PARENT too, or the post-load phase can start on half-loaded projects. Keep
  exactly one orchestrator instance (pid file); kill process trees children-first.
- Parallel agents editing the same script collide (one fix was swallowed into another's commit): one owner per file,
  re-read before patching, and assert the exact old text occurs once before replacing it.
- Long jobs starved unrelated work on a shared machine (a routine check ran past its 10-minute timeout): run migration
  workers where nothing time-sensitive runs, or cap their parallelism and `renice` the CPU-heavy scans.
- An OS tool auto-update blocked `python3` and `git` until a licence prompt was accepted interactively: before each
  unattended phase run `python3 --version && git --version`.
- Buffered logs show progress only at the end: watch the map-log line count and file mtimes instead; rotate logs per
  attempt (stale logs from an earlier attempt were misread as current).
- A guarded "only if it is not affecting something" from the lead meant no mid-pass restart of a running chain:
  restarting would have re-ordered work.
- A job with the matcher loaded at start keeps the OLD matcher; restart it after a list change, and record which
  content was written with which fingerprint.
- Background jobs on a shared workstation: lower priority (`nice`) for CPU-heavy scans; `caffeinate`/disable sleep and
  OS auto-updates for an overnight run (a reboot kills every unattended loop).

## Monitoring

A tick every 15-20 minutes during the load, one line each: per chain `PROJ n/max`, items/hour, Confluence space x/y,
alerts, guard-dog last tick age (< 10 min), 429 waits (expected). Plus a spot check every 30 minutes (doc 13).
Typical tick lines that mattered:
- "silent 11 min at 350/398: process alive, main thread in `time.sleep` = 429 wait until reset" — not dead
- "died on a one-off 403 'no permission to create issues'" — re-checked permissions (true), audit (no change), resumed
  with a 3-try wrapper; numbers verified across the resume seam (no drift, no duplicates)
- "verify CPU-bound, 5 processes at 100%, none done after 27 min" → decoupled the gating compare from the deep verify

## Timings to plan with (measured, rounded)

| Step | Duration |
|---|---|
| Preflight (walks the whole evidence package on one core) | ~10 min |
| Jira load, a few tens of thousands of items + fillers, 2 accounts × 2 chains | ~6-7 h |
| Confluence, a few thousand pages + attachments + draw.io + hierarchy + verify | ~2-3 h in parallel |
| Cross-project links | ~10 min |
| Attachment release (2 accounts) | ~1 h |
| Late sub-task moves (~1.5k) | ~1 h |
| URL rewrite | ~50 min |
| Boards + sprints (~17 boards, ~200 sprints, one account) | ~1.5 h |
| Verify + compare (parallel) | ~1 h |
| Test-management load (8 projects, ~2.3k tests, ~8k steps) | many hours (per-user limit) |
| Archive rebuild pass for the largest archives | ~1.5 h per archive, a day in total |
