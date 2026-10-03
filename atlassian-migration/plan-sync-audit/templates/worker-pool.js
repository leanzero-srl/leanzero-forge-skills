"use strict";

/**
 * Bounded-concurrency worker pool. Zero deps; uses native Promises.
 *
 *   const { runPool } = require("./worker-pool");
 *
 *   await runPool(items, async (item, index) => {
 *     await client.doSomething(item);
 *   }, 5);    // concurrency = 5
 *
 * `runPool` resolves when every item has been processed. Errors thrown
 * from the worker function are caught and logged but do not abort the
 * pool — the caller is expected to record success/failure inside the
 * worker (typically via PlanManager.updateEntryStatus).
 *
 * If you need to abort the pool on the first failure, throw inside the
 * worker and wrap the call to runPool in a try/catch — the in-flight
 * workers will still drain, but new work stops being assigned.
 *
 * For Atlassian work, recommended concurrency:
 *   - writes:     3 – 5
 *   - reads:      8 – 10
 *   - bulkfetch:  1 – 2  (each call already amortizes many items)
 *
 * When you start seeing 429s, drop concurrency by 1 — the rate-limit
 * retry inside the client absorbs the bump, and you stop wasting points
 * on retries.
 */

async function runPool(items, workerFn, concurrency = 5, opts = {}) {
  const log = opts.log || (() => {});
  const total = items.length;
  if (total === 0) return;

  const N = Math.max(1, Math.min(concurrency, total));
  let nextIndex = 0;
  let done = 0;

  const worker = async (workerId) => {
    while (true) {
      const i = nextIndex++;
      if (i >= total) return;
      try {
        await workerFn(items[i], i);
      } catch (err) {
        log(`  [pool#${workerId}] worker error on item ${i}: ${err.message}`);
      }
      done++;
      if (opts.progressEvery && (done % opts.progressEvery === 0 || done === total)) {
        log(`  Progress: ${done}/${total}`);
      }
    }
  };

  const workers = [];
  for (let w = 0; w < N; w++) workers.push(worker(w));
  await Promise.all(workers);
}

module.exports = { runPool };
