# Concurrency & Worker Pool

The `worker-pool.js` template is ~30 lines and zero deps. This doc explains why we don't use `p-limit` or `bottleneck`, how to size the pool to the workload, and the "shrink on 429" pattern.

## The bounded worker pool

```javascript
async function runPool(items, workerFn, concurrency = 5, opts = {}) {
  const N = Math.max(1, Math.min(concurrency, items.length));
  let nextIndex = 0;
  const worker = async () => {
    while (true) {
      const i = nextIndex++;
      if (i >= items.length) return;
      try { await workerFn(items[i], i); }
      catch (err) { /* log, continue */ }
    }
  };
  const workers = Array.from({ length: N }, worker);
  await Promise.all(workers);
}
```

Each worker is a promise that pulls items by atomically incrementing `nextIndex`. There's no queue — just a shared cursor. When all items are processed, all workers naturally exit.

## Why not p-limit?

`p-limit` is fine — at ~100M weekly downloads it's clearly battle-tested. Reasons to roll our own anyway:

- **Zero dependency rule** for migration scripts (supply chain risk, audit pain).
- **Per-worker visibility**: with our pool, you can log "worker 3 timed out" — `p-limit` abstracts that away.
- **Custom error handling**: our pool catches and logs; `p-limit` rejects the whole `Promise.all`. For migration scripts we want to keep processing other items even when one fails.
- **Custom progress reporting**: easy to add a "processed N/total" log inside the worker.

If your migration is doing 50+ different sub-operations, switch to `p-queue` for priority and dynamic concurrency tuning. For the standard plan→sync→audit flow, the bare pool is enough.

## Why not bottleneck?

`bottleneck` is the right tool when you need to map to Atlassian's reservoir model exactly (`reservoir` = hourly point budget, `reservoirRefreshInterval: 3600_000`, `maxConcurrent: 4–8`). The trade-off:

- More complex setup; more dependencies.
- Forces you to compute point budgets up front.
- Worth it if your migration runs >1 hour and rate-limit math is your bottleneck.

For 99% of jobs, a hand-tuned `concurrency` value gives you the same effective throughput with less complexity.

## Sizing the pool

| Operation | Recommended concurrency |
|---|---|
| Read (GET single entity) | 8–10 |
| Read (bulk fetch) | 1–2 (each call is already a multi-item batch) |
| Write (PUT / POST single entity) | 3–5 |
| Write to the same issue (e.g. multiple comments) | 1 (per-issue 20-writes-per-2-seconds bites) |
| Search/CQL pagination | 1 (pagination is inherently sequential) |
| Identity resolution lookups | 5 |
| Forge KVS writes | 5–10 (KVS handles it well) |

Defaults in the templates: 5 for sync, 5 for plan. Tune downward when you see rate-limit retries spike.

## When you see 429s

Three options:

1. **Drop concurrency by 1 next run.** Each retry costs more points than just being slower in the first place.
2. **Shrink the pool dynamically.** If you observe several 429s in a short window, kill one worker mid-run:

```javascript
let activeWorkers = concurrency;
const worker = async (id) => {
  while (id < activeWorkers) {
    const i = nextIndex++;
    if (i >= items.length) return;
    try { await workerFn(items[i], i); }
    catch (err) {
      if (err.isRateLimit && activeWorkers > 2) {
        activeWorkers--;
        console.log(`  pool shrunk to ${activeWorkers}`);
        return;   // this worker exits
      }
    }
  }
};
```

3. **Switch to bulk endpoints.** A `POST /issue/bulkfetch` with 100 keys costs ~1 point; 100 individual `GET /issue/{key}` calls cost 100 points. Bulk wins by 100× under any concurrency.

## Per-issue write throttling

Atlassian limits per-issue writes to 20/2s and 100/30s. If your migration does multiple writes to the same issue (e.g. backfilling 50 comments), the per-issue limit will trigger before the global one.

Pattern: **group by issue, serialize within group, parallelize across groups.**

```javascript
const byIssue = new Map();
for (const entry of pending) {
  const k = entry.data.issueKey;
  if (!byIssue.has(k)) byIssue.set(k, []);
  byIssue.get(k).push(entry);
}

await runPool([...byIssue.values()], async (entriesForOneIssue) => {
  for (const entry of entriesForOneIssue) {
    await processOne(entry);
  }
}, 5);  // 5 issues in flight, each issue processed sequentially
```

This pattern absorbs the per-issue limit naturally — no per-call sleeping required.

## Progress reporting

Pass `opts.progressEvery` to log every N processed items:

```javascript
await runPool(pending, worker, 5, { progressEvery: 25, log: console.log });
// → "  Progress: 25/2400"
//    "  Progress: 50/2400"
//    ...
```

This is more useful than a percentage with the new Jira pagination (no `total` field — see `04-pagination.md`). Items/sec gives the operator a meaningful expected-time estimate.

## Abort semantics

The current pool doesn't support `AbortController` — once `runPool` is called, it runs to completion. If you need early termination:

- For "stop on first failure", throw inside the worker AND catch outside `runPool` (in-flight workers still finish their current item, but no new items are claimed).
- For "user pressed Ctrl-C", catch `SIGINT` in `main`, call `planManager.savePlan()`, then `process.exit(130)`. The worker pool's in-flight items will not commit, but the plan is saved with the items they did manage to complete.

## Multi-key parallelism (multiply throughput by N tokens)

Atlassian's rate limits are **per-user** for the burst and per-issue caps, and **per-tenant** for the hourly point pool. One `CLOUD_API_TOKEN` = one user's bucket. If you have N service accounts (each with its own token), you can run **N independent buckets in parallel** and multiply effective throughput by ~N — as long as the work is partitionable and the tenant pool isn't your bottleneck.

Two implementation shapes; pick by scale:

### A. In-process multi-key pool — `templates/multi-key-pool.js`

K clients × W workers per client = K·W total workers, all inside one Node process. Each worker holds a fixed reference to one client so per-client caches (attachment cache, perms cache, config cache) are preserved.

```javascript
const { runMultiKeyPool, clientsFromEnv } = require("./multi-key-pool");

const clients = clientsFromEnv("CLOUD_API_TOKEN", (token) =>
  new CloudJiraClient(process.env.CLOUD_BASE_URL, token));

await runMultiKeyPool(items, async (item, client, ctx) => {
  await client.updateIssue(item.key, item.payload);
}, { clients, workersPerClient: 3, log: console.log, progressEvery: 50 });
```

When to use:
- The whole sweep fits in one process's heap (see `docs/14-heap-and-memory.md`).
- You want one log file, one progress stream, one PID to monitor.
- ≤ 6 tokens. Past that, you've got 18+ concurrent workers in one process and the shared event loop becomes the bottleneck.

When NOT to use:
- A worker error can corrupt the V8 state for the others — e.g. a leaked TCP handle, a pinned big buffer in a closure.
- You need per-token logs (auditing which user did what).
- You want process-isolated crash recovery.

### B. Out-of-process dispatcher — `templates/run-driver.sh.template` / `templates/dispatcher.js`

One child Node process per slot. The slot binds an `envVar` (e.g. `CLOUD_API_TOKEN_3`) and the parent only ever sets that one as `CLOUD_API_TOKEN` for the child. Each child has its own heap, retry budget, log file, file descriptors.

Pattern lifted from `sync_asset_ticket_associations/`:

```bash
# 1. Pre-split the plan ONCE during the plan phase
#    (sub-plan per project / per field — see docs/02-plan-manager.md).
# 2. Each driver shell pins one CLOUD_API_TOKEN_X.
# 3. xargs -P N keeps N children alive per driver.

TOKEN="$(grep '^CLOUD_API_TOKEN_3=' .env | head -1 | cut -d= -f2-)"
printf '%s\n' "${QUEUE[@]}" | xargs -I {} -P 3 bash -c '
  IFS="|" read -r label master slug <<< "$1"
  CLOUD_API_TOKEN="$TOKEN" node main/sync.js \
    --execute-only --plan-file "$master" \
    > logs/driver_${slug}.out 2>&1
' _ {}
```

Run multiple drivers in parallel (one per terminal or via tmux), each pinned to a different token. Total parallelism = (# drivers) × (xargs -P value).

When to use:
- Mega-scale sweeps (100k+ entities, multi-hour runs).
- Multiple tokens from different users (audit trail per user).
- The plan is naturally splittable (per project, per field, per partition).
- You want a crash in one shard to leave the others untouched.

For programmatic dispatch (state file, retry on non-zero exit, dynamic queue), use the JS dispatcher:

```javascript
const { Dispatcher } = require("../src/dispatcher");
const d = new Dispatcher({
  stateFile: `logs/dispatcher_state_${Date.now()}.json`,
  scriptPath: "main/sync_xxx.js",
  slots: [
    { id: 1, envVar: "CLOUD_API_TOKEN",   owner: "mihai" },
    { id: 2, envVar: "CLOUD_API_TOKEN_2", owner: "jan"   },
    { id: 3, envVar: "CLOUD_API_TOKEN_3", owner: "akash" },
  ],
  jobs: subPlanFiles.map((pf, i) => ({
    id: `job-${i}`, planFile: pf, args: ["--execute-only", "--retry-failed"],
  })),
  logDir: "logs",
});
d.attachSignalHandlers();
await d.run();
```

The state JSON (`logs/dispatcher_state_*.json`) is rewritten on every transition. Re-launching the same dispatcher resumes — any "running" jobs become pending and get reassigned.

### Choosing between A and B

| Question | In-process pool (A) | Out-of-process dispatcher (B) |
|---|---|---|
| Entities to process? | < 50k | ≥ 50k or unknown |
| Token count? | 2–6 | 2–12+ |
| Wall-clock budget? | minutes | hours |
| Tolerable to lose progress on a process crash? | yes | no |
| Want per-token log/audit? | no | yes |
| Run on a CI box with shared disk? | yes | yes |

### Where the gain comes from (and where it doesn't)

The per-user burst cap is 100 GET/s + 50 PUT/s. One client at concurrency 4 hits ~30-50 writes/s before the rate-limit retry path kicks in. Adding a second user's token doubles that — until the tenant hourly point pool runs out. Math:

- Tier 1 tenant pool: **65,000 pts/hour** = ~18/s sustained.
- Tier 4 (Enterprise): up to **500,000 pts/hour** = ~139/s sustained.
- A bulk-write costs the same as a single write (use bulk!). A single PUT/POST costs ~1 pt.

If the math says your job needs 130/s sustained on a Tier-1 tenant, **more tokens won't help** — you're rate-limited by the tenant pool. Either:
- Switch to bulk endpoints (`POST /issue/bulk`, `POST /issue/bulkfetch`) — 100× point efficiency.
- Negotiate a higher tier with Atlassian for the duration of the migration.
- Spread the run over a longer window (e.g. overnight + business hours = 2× the pool).

See `docs/27-rate-limits-and-quotas.md` for the full table.

### Token hygiene

- **One token per service account.** Don't reuse the same token across drivers — that collapses K buckets back into one.
- **Pin slot → owner.** The dispatcher_state JSON records `owner` so a 429 storm on slot 3 can be traced to the right user account.
- **Rotate before each major migration.** Compromised tokens have done damage in this exact pattern before.
- **`.env` is gitignored.** Never commit tokens.
- **At least one token must be admin-level.** Permission checks (preflight) need full read on the source and write on the dest. If only one of your tokens has it, route the plan phase to that slot.

## See also

- [`03-http-client-pattern.md`](03-http-client-pattern.md) — the retry budget the pool's concurrency interacts with
- [`14-heap-and-memory.md`](14-heap-and-memory.md) — multi-key in-process pools amplify memory pressure
- [`27-rate-limits-and-quotas.md`](27-rate-limits-and-quotas.md) — the per-issue and burst caps that drive the sizing table
- [`templates/worker-pool.js`](../templates/worker-pool.js) — single-client pool
- [`templates/multi-key-pool.js`](../templates/multi-key-pool.js) — K-client × W-worker pool
- [`templates/dispatcher.js`](../templates/dispatcher.js) — out-of-process dispatcher
- [`templates/run-driver.sh.template`](../templates/run-driver.sh.template) — bash xargs driver
