# Async Events & Queues (`@forge/events`) — for Confluence

Use a queue when work won't fit in 25 seconds — large space scans, bulk page rewrites, AI generation, anything that depends on rate-limited downstreams. A `consumer` function can run up to **900 seconds** and respects `Retry-After`. This page covers the v2 `@forge/events` API; the v1 shape (`consumer.resolver`) still works but is deprecated.

## When to use

| Symptom | Use a queue? |
|---|---|
| Trigger handler that fans out into many REST calls | Yes |
| Need to scan every page in a large space | Yes |
| Bulk-update page properties or labels | Yes |
| Trigger fires on your own writes (self-loop) | Guard in code via cached app accountId — `filter.ignoreSelf` is Jira-only, not Confluence |
| In-iframe Custom UI fetch | No — keep that in a resolver |

## Manifest shape (v2)

```yaml
modules:
  trigger:
    - key: enqueue-on-page-update
      function: enqueue
      events:
        - avi:confluence:updated:page
      # NOTE: filter.ignoreSelf is Jira-only — it does NOT suppress Confluence
      # self-events. Guard self-loops in code via a cached app accountId (below).

  consumer:
    - key: long-job-consumer
      queue: long-jobs          # any key — used by Queue.push
      function: consume         # v2: function:, NOT resolver:

  function:
    - key: enqueue
      handler: index.enqueue
    - key: consume
      handler: index.consume
      timeoutSeconds: 900       # max for consumers (default 25)
```

## Producer

```javascript
import { Queue, RateLimitError } from '@forge/events';
const queue = new Queue({ key: 'long-jobs' });

await queue.push({ body: { taskId, pageId } });

// Batch (max 50 events / 200 KB combined per push)
await queue.push([{ body: { id: 1 } }, { body: { id: 2 } }]);

// Per-key serialization — "one writer per page"
await queue.push({
  body: { taskId, pageId },
  concurrency: { key: pageId, limit: 1 },
});

// Ingest is rate-limited per minute. Don't drop bursts on the floor.
try {
  await queue.push({ body });
} catch (err) {
  if (err instanceof RateLimitError) { /* back off and try later */ }
  else throw err;
}
```

## Consumer

```javascript
import { InvocationError, InvocationErrorCode } from '@forge/events';

export async function consume(event /* AsyncEvent */, context) {
  const { taskId } = event.body;
  const { retryCount, retryReason } = event.retryContext ?? {};

  if (retryCount) console.log(`[consume] retry #${retryCount} (${retryReason})`);

  try {
    await doWork(taskId);
  } catch (err) {
    // Honor upstream Retry-After (Confluence REST returns this on 429)
    if (err.status === 429 && err.retryAfter) {
      return new InvocationError({
        retryAfter: Math.min(err.retryAfter, 900),
        retryReason: InvocationErrorCode.FUNCTION_UPSTREAM_RATE_LIMITED,
        retryData: { taskId },     // ≤ 4 KB
      });
    }
    if (isTransient(err)) {
      const c = (retryCount ?? 0) + 1;
      const delay = Math.min(20 * 2 ** c + Math.random() * 100, 900);
      return new InvocationError({
        retryAfter: delay,
        retryReason: InvocationErrorCode.FUNCTION_RETRY_REQUEST,
        retryData: { taskId },
      });
    }
    throw err; // permanent → no retry
  }
}
```

### Retry budget

- **Max 4 retries.** After that the event is dropped.
- `retryAfter` ≤ 900 s, `retryData` ≤ 4 KB.
- v2 adds `retentionWindow.{startTime, remainingTimeMs}` so you can stop retrying near the deadline.

## Confluence-specific patterns

### 1) Cursor-paginated space scan from a queue

A space with thousands of pages can't be scanned in a single 25-second resolver call. Push a "scan job" onto a queue, then page through `/wiki/api/v2/spaces/{id}/pages?limit=100&cursor=...` until the cursor is exhausted.

```javascript
// Producer: kick off a job
import { Queue } from '@forge/events';
const scanQueue = new Queue({ key: 'space-scan-queue' });

resolver.define('startSpaceScan', async ({ payload, context }) => {
  const jobId = `${payload.spaceId}-${Date.now()}`;
  await kvs.set(`scan-job:${jobId}`, { status: 'queued', spaceId: payload.spaceId });
  await scanQueue.push({ body: { jobId, spaceId: payload.spaceId } });
  return { jobId };
});

// Consumer: walk every page
export async function consume(event) {
  const { jobId, spaceId } = event.body;
  let cursor = undefined;
  let processed = 0;

  do {
    const url = cursor
      ? `/wiki/api/v2/spaces/${spaceId}/pages?limit=100&cursor=${cursor}`
      : `/wiki/api/v2/spaces/${spaceId}/pages?limit=100`;
    const r = await api.asApp().requestConfluence(route`${url}`);
    const data = await r.json();

    for (const page of data.results) await visitPage(page);
    processed += data.results.length;

    cursor = data._links?.next ? new URL(data._links.next, 'https://x').searchParams.get('cursor') : null;
  } while (cursor);

  await kvs.set(`scan-job:${jobId}`, { status: 'done', processed });
}
```

(Pattern lifted from Sentinel Vault's `realmScanConsumer` — see `24-production-patterns.md`.)

### 2) Self-loop guard for content-update triggers

Your consumer adds a footer comment, which fires `avi:confluence:updated:page`, which… you see where this goes. Two safeguards:

```yaml
trigger:
  - key: on-page-updated
    function: enqueue
    events:
      - avi:confluence:updated:page
    # filter.ignoreSelf is Jira-only — for Confluence, guard self-loops in code (below)
```

```javascript
// Confluence self-loop guard — filter.ignoreSelf does not apply to Confluence events,
// so always check the actor at runtime:
const appAccountId = await getAppAccountId(); // cache in KVS
if (event.atlassianId === appAccountId) return;
```

### 3) Hourly lazy-refresh

A `scheduledTrigger` that fires hourly should *skip* the heavy work if nothing's changed. Cache a `last-modified-at` timestamp keyed by space; only re-scan when it advances.

```javascript
const STALE_THRESHOLD_MS = 55 * 60 * 1000; // 55min — avoids edge re-loops on hourly cron

export async function onHourly() {
  const spaces = await kvs.get('tracked-spaces') ?? [];
  const now = Date.now();
  for (const space of spaces) {
    const meta = await kvs.get(`space-meta:${space.id}`);
    if (now - new Date(meta?.lastIndexedAt ?? 0).getTime() < STALE_THRESHOLD_MS) continue;
    if (meta?.status === 'scanning') continue;
    await scanQueue.push({ body: { spaceId: space.id } });
  }
}
```

## Migrating from `@forge/events` v1

| v1 (deprecated) | v2 |
|---|---|
| `consumer.resolver.function` + `consumer.resolver.method` | `consumer.function` |
| handler defined via `Resolver.define('event-listener', …)` | regular `export async function handler(event, context)` |

`InvocationError` semantics are unchanged. v2 adds the `retentionWindow` fields.

## Gotchas

- **Don't *throw* `InvocationError`. Return it.** Throwing won't trigger the retry pipeline.
- **`retryData` is 4 KB.** Persist large state in KVS keyed by `taskId`.
- **`forge tunnel` won't pick up new modules** — `forge deploy` first, then restart tunnel.
- **Functions are stateless across invocations.** Don't rely on module-level caches surviving between consumer runs.
- **Concurrency limits are per `key` value.** Use the page id (or other natural id) when you need exactly-one-writer semantics per resource.

## See also

- `27-faas-limits-and-cost.md` — full quota table
- `templates/scheduled-trigger.yml` — scheduledTrigger skeleton
- `24-production-patterns.md` — Sentinel Vault's realm-scan and timestamp-gated cron patterns
- https://developer.atlassian.com/platform/forge/runtime-reference/async-events-api
- https://developer.atlassian.com/platform/forge/use-a-long-running-function
