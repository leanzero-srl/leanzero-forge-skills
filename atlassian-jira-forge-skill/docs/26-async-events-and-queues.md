# Async Events & Queues (`@forge/events`)

When work won't fit in 25 seconds — AI calls, large bulk REST operations, multi-issue sync, anything that depends on rate-limited downstreams — push it onto a queue and process it from a `consumer` function. Consumer functions can run up to **900 seconds**, retry on failure, and respect upstream `Retry-After` headers.

This page covers the v2 `@forge/events` API. The deprecated v1 shape (`consumer.resolver` instead of `consumer.function`) still works but receives no new features.

## When to use

| Symptom | Use a queue? |
|---|---|
| Single function takes >5s and may grow | Yes |
| Calls an LLM or other long-tail external service | Yes |
| Bulk-updates issues across a project | Yes |
| Triggers can self-loop (your write fires the event again) | Yes — set `filter.ignoreSelf: true` on the trigger |
| In-page UI fetches need fast responses | No — keep them in resolvers |

## Manifest shape (v2)

```yaml
modules:
  trigger:
    - key: producer
      function: enqueue                  # fast handler that pushes
      events:
        - avi:jira:updated:issue
      filter:
        ignoreSelf: true

  consumer:
    - key: long-job-consumer
      queue: long-jobs                   # arbitrary key — used by Queue.push
      function: consume                  # v2: function:, NOT resolver:

  function:
    - key: enqueue
      handler: index.enqueue
    - key: consume
      handler: index.consume
      timeoutSeconds: 900                # max for consumer functions
```

## Producer: `Queue.push`

```javascript
import { Queue, RateLimitError } from '@forge/events';

const queue = new Queue({ key: 'long-jobs' });

await queue.push({ body: { taskId, issueKey } });

// Batch (max 50 events / 200 KB combined per call)
await queue.push([
  { body: { taskId: 'a' } },
  { body: { taskId: 'b' } },
]);

// Delay processing
await queue.push({ body: { taskId }, delayInSeconds: 5 });

// Per-key serialization (great for "one writer per issue")
await queue.push({
  body: { taskId, issueKey },
  concurrency: { key: issueKey, limit: 1 },
});

// Ingest is rate-limited per minute — handle bursty pushes:
try {
  await queue.push({ body });
} catch (err) {
  if (err instanceof RateLimitError) { /* back off and retry later */ }
  else throw err;
}
```

## Consumer: handler signature

```javascript
import { InvocationError, InvocationErrorCode } from '@forge/events';

export async function consume(event /* AsyncEvent */, context) {
  const { taskId } = event.body;
  const { retryCount, retryReason, retryData, retentionWindow } =
    event.retryContext ?? {};

  if (retryCount) {
    console.log(`[consume] retry #${retryCount} reason=${retryReason}`);
  }

  try {
    await doWork(taskId);
  } catch (err) {
    // Upstream rate-limit → respect Retry-After
    if (err.status === 429 && err.retryAfter) {
      return new InvocationError({
        retryAfter: Math.min(err.retryAfter, 900),
        retryReason: InvocationErrorCode.FUNCTION_UPSTREAM_RATE_LIMITED,
        retryData: { taskId },
      });
    }
    // Transient → exponential backoff with jitter
    if (isTransient(err)) {
      const count = (retryCount ?? 0) + 1;
      const delay = Math.min(20 * 2 ** count + Math.random() * 100, 900);
      return new InvocationError({
        retryAfter: delay,
        retryReason: InvocationErrorCode.FUNCTION_RETRY_REQUEST,
        retryData: { taskId },
      });
    }
    // Permanent → don't retry
    throw err;
  }
}
```

### Retry budget

- **Max 4 retries.** After that the event is dropped.
- **`retryAfter` ≤ 900 s.**
- **`retryData` ≤ 4 KB.**
- The `retentionWindow` (v2) tells you `startTime` and `remainingTimeMs` so you can stop retrying once the window's nearly over.

## Common patterns

### 1. Trigger → queue → result polling
Resolver / trigger pushes to the queue, returns `{ taskId }` immediately. UI polls a resolver that reads `kvs.get('task:' + taskId)`. Consumer writes the result back to KVS keyed by `taskId`.

```yaml
modules:
  consumer:
    - key: ai-consumer
      queue: ai-jobs
      function: consume
  function:
    - key: consume
      handler: index.consume
      timeoutSeconds: 120
```

```javascript
// Frontend polls every ~1s until status === 'done'
resolver.define('getTaskStatus', async ({ payload }) =>
  (await kvs.get(`task:${payload.taskId}`)) ?? null
);
```

(Pattern source: CogniRunner — runs Claude/AI calls that comfortably exceed 25 s.)

### 2. Hourly lazy-refresh scheduled trigger
Cron-style refresh that only re-indexes plans which are actually stale.

```javascript
// scheduled-refresh.js
const STALE_THRESHOLD = 55 * 60 * 1000; // 55min, not 60min — avoids edge re-loops

export async function onScheduledRefresh() {
  const plans = (await storage.get('plans:list')) ?? [];
  const now = Date.now();
  for (const plan of plans) {
    const meta = await kvs.get(`p:${plan.id}:meta`);
    if (!meta) continue;
    const lastIndexed = new Date(meta.lastIndexedAt ?? 0).getTime();
    if (now - lastIndexed < STALE_THRESHOLD) continue;       // skip recent
    if (meta.status === 'writing' || meta.status === 'indexing') continue; // skip in-flight
    await refreshPlan(plan.id);
  }
}
```

(Pattern source: PPM-Pro — `src/triggers/scheduled-refresh.js`.)

### 3. Storage-API offload
`@forge/kvs` enforces per-key write limits (1 MB/s). A burst of `kvs.set` calls in a hot trigger easily breaks the limit. Push the writes to a queue and serialize them per key.

```javascript
const storageQueue = new Queue({ key: 'storage-async-queue' });

export async function onIssueCreated(event) {
  await storageQueue.push({
    body: { issueKey: event.issue.key },
    delayInSeconds: 0.5,
  });
}
```

## Consumer error handling & idempotency (production)

Three hard-won rules from PPM (`queue-consumer.js`) and CogniRunner (`async-handler.js`):

### 1. Do NOT re-throw on a *permanent* failure

A throw (or an `InvocationError` retry) makes the platform retry the whole event — repeatedly, across the retention window (**~96 h, observed**). For a permanent failure (bad JQL, missing config) that's wrong: it burns budget retrying something that can never succeed. Instead, **record the failure as state and return normally**:

```javascript
// PPM queue-consumer.js — runIndexing records status:'error' on the plan itself,
// so the consumer deliberately does NOT re-throw a permanent failure.
export async function handler(event) {
  const planId = event?.body?.planId;
  if (!planId) { console.error('[PPM] missing planId'); return; }   // drop, don't retry
  try {
    const result = await runIndexing(planId);                       // catches its own errors, sets status
    if (!result.success) console.error(`indexing failed for ${planId}: ${result.error}`);
  } catch (err) {
    // Guard against an UNEXPECTED throw so the queue doesn't endlessly retry.
    console.error(`[PPM] unexpected error for ${planId}:`, err?.message || err);
  }
}
```

Reserve `InvocationError` (retry) for genuinely **transient** failures — upstream 429/5xx — as shown in the consumer signature above.

### 2. Heartbeat + self-heal cap

A long job can die mid-flight (OOM, platform kill) leaving its status stuck at `processing` forever. Write a `updatedAt` heartbeat as the job progresses, and treat a status that hasn't advanced past a cap (e.g. **>960 s** — above the 900 s max consumer runtime) as failed on the next read, so the UI and re-drive logic self-heal instead of hanging.

### 3. Idempotency via `FAIL_IF_EXISTS` (at-least-once delivery)

Forge async events are **at-least-once** — a *successful* invocation can be redelivered (~1 s apart, observed). For any side-effectful consumer, **claim the task atomically before executing**:

```javascript
await kvs.set(`pf_exec:${taskId}`, { claimedAt: new Date().toISOString() }, {
  keyPolicy: 'FAIL_IF_EXISTS',                 // atomic conditional write — no CAS needed
  ttl: { value: 6, unit: 'HOURS' },
});
// catch: e.code === 'KEY_ALREADY_EXISTS' || 409 || /already exist/i  → return { deduped: true }
```

Claim-**first** means a crash mid-execution is *not* retried with side effects — for fail-open automations, duplicates are the worse failure. See `31-forge-ai-and-llm.md` for the full claim/skip flow.

### 4. Single-flight per entity

Serialize work per entity so two events for the same issue/plan can't interleave: `concurrency: { key: issueKey, limit: 1 }` on `queue.push` (limits are per `key` value, not per queue).

**Source:** PPM `src/queue-consumer.js`, CogniRunner `src/async-handler.js` (`executeQueuedPostFunction`).

## Migrating from `@forge/events` v1

| v1 (deprecated) | v2 |
|---|---|
| `consumer.resolver.function` + `consumer.resolver.method` | `consumer.function` |
| handler defined via `Resolver.define('event-listener', …)` | handler is a regular `export async function handler(event, context)` |

The retry context is the same except v2 adds `retentionWindow`. Existing `InvocationError` returns continue to work.

## Gotchas

- **`forge tunnel` doesn't pick up manifest changes** — restarting alone isn't enough; `forge deploy` first.
- **Self-loops**: a trigger that writes to a Jira issue and listens for `avi:jira:updated:issue` will fire on its own writes. Set `filter.ignoreSelf: true` (Jira-only — Confluence product triggers must guard self-loops in code via a cached app accountId).
- **`InvocationError` is *returned*, not thrown.** Throwing won't trigger the retry pipeline.
- **Concurrency limits** are per `key` value, not per queue. Use the issue key (or whatever id makes sense) to serialize work.
- **Don't put large payloads in `retryData`** — 4 KB ceiling. Persist big state in KVS and reference by key.
- **Functions are stateless between invocations.** Don't rely on module-level caches living across consumer runs.

## See also

- `27-faas-limits-and-cost.md` — full quota table
- `19-rate-limit-handling.md` — backoff strategies
- `templates/async-queue-consumer.yml` — copy-paste skeleton
- https://developer.atlassian.com/platform/forge/runtime-reference/async-events-api
- https://developer.atlassian.com/platform/forge/use-a-long-running-function
