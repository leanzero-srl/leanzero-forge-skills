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

## See also

- [`03-http-client-pattern.md`](03-http-client-pattern.md) — the retry budget the pool's concurrency interacts with
- [`27-rate-limits-and-quotas.md`](27-rate-limits-and-quotas.md) — the per-issue and burst caps that drive the sizing table
- [`templates/worker-pool.js`](../templates/worker-pool.js) — the implementation
