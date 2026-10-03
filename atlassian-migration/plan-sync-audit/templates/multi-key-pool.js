"use strict";

/**
 * Multi-key bounded worker pool.
 *
 * Each Atlassian Cloud API token is throttled per-USER (the email half of
 * the base64'd `email:api_token`). One token = one rate-limit bucket.
 * If you have CLOUD_API_TOKEN_1..N (one per service account), you can
 * multiply effective throughput by N — provided each worker uses a
 * DIFFERENT client (different token) so the per-user burst cap doesn't
 * fold them all into one bucket again.
 *
 * Topology:
 *   - K = number of clients (one per token)
 *   - W = workers per client
 *   - total concurrency = K * W
 *
 *   clients[0]  (token A, mihai's user)  --> worker_0, worker_1, worker_2
 *   clients[1]  (token B, jan's user)    --> worker_3, worker_4, worker_5
 *   clients[2]  (token C, akash's user)  --> worker_6, worker_7, worker_8
 *
 * Each worker holds a FIXED reference to one client for its lifetime so
 * any per-client cache (attachment cache, perms cache, config cache) is
 * preserved. The shared item cursor (`nextIndex`) is the only point of
 * contention.
 *
 * Usage:
 *
 *   const clients = [
 *     new CloudJiraClient(baseUrl, process.env.CLOUD_API_TOKEN),
 *     new CloudJiraClient(baseUrl, process.env.CLOUD_API_TOKEN_2),
 *     new CloudJiraClient(baseUrl, process.env.CLOUD_API_TOKEN_3),
 *   ];
 *   await runMultiKeyPool(items, async (item, client, ctx) => {
 *     await client.updateIssue(item.key, item.payload);
 *   }, { clients, workersPerClient: 3, log: console.log });
 *
 * Failure semantics: a single worker error is logged and the worker
 * continues on the next item. To abort the whole pool on first error,
 * throw and wrap the call in try/catch (in-flight workers drain).
 *
 * Rate-limit semantics: if you see 429s on ONE client only, ONE user's
 * bucket is exhausted — the other clients keep flowing. Drop
 * `workersPerClient` by 1 on next run. If all clients see 429s at the
 * same time, it's the tenant-wide hourly pool — drop the client count
 * or run in shorter shifts.
 */

async function runMultiKeyPool(items, workerFn, opts = {}) {
  const log = opts.log || (() => {});
  const clients = opts.clients;
  if (!Array.isArray(clients) || clients.length === 0) {
    throw new Error("runMultiKeyPool: opts.clients must be a non-empty array");
  }
  const workersPerClient = Math.max(1, opts.workersPerClient || 3);
  const total = items.length;
  if (total === 0) return;

  const K = clients.length;
  const W = Math.max(1, Math.min(K * workersPerClient, total));

  let nextIndex = 0;
  let done = 0;
  const perClientCounts = new Array(K).fill(0);

  const worker = async (workerId, clientIdx) => {
    const client = clients[clientIdx];
    while (true) {
      const i = nextIndex++;
      if (i >= total) return;
      try {
        await workerFn(items[i], client, { workerId, clientIdx, itemIndex: i });
        perClientCounts[clientIdx]++;
      } catch (err) {
        log(`  [pool#${workerId}/client${clientIdx}] error on item ${i}: ${err.message}`);
      }
      done++;
      if (opts.progressEvery && (done % opts.progressEvery === 0 || done === total)) {
        const dist = perClientCounts.map((n, k) => `c${k}=${n}`).join(" ");
        log(`  Progress: ${done}/${total} [${dist}]`);
      }
    }
  };

  const workers = [];
  let wid = 0;
  for (let k = 0; k < K; k++) {
    const wForThisClient = Math.min(workersPerClient, Math.ceil(W / K));
    for (let w = 0; w < wForThisClient; w++) {
      workers.push(worker(wid++, k));
    }
  }
  await Promise.all(workers);
}

/**
 * Build clients from numbered env vars. Default reads CLOUD_API_TOKEN,
 * CLOUD_API_TOKEN_2, CLOUD_API_TOKEN_3, ... up to the first gap.
 *
 *   const clients = clientsFromEnv("CLOUD_API_TOKEN", (token) =>
 *     new CloudJiraClient(process.env.CLOUD_BASE_URL, token));
 */
function clientsFromEnv(prefix, makeClient) {
  const tokens = [];
  if (process.env[prefix]) tokens.push(process.env[prefix]);
  for (let i = 2; ; i++) {
    const v = process.env[`${prefix}_${i}`];
    if (!v) break;
    tokens.push(v);
  }
  if (tokens.length === 0) {
    throw new Error(`clientsFromEnv: ${prefix} not set; cannot build any client`);
  }
  return tokens.map(makeClient);
}

module.exports = { runMultiKeyPool, clientsFromEnv };
