# FaaS Limits & Cost Reference (Confluence Forge)

The hard numbers you need to design around. Same FaaS platform as the Jira Forge runtime; the Confluence-specific bits are called out separately.

## Function timeouts

| Surface | Default | Configurable to |
|---|---|---|
| Resolver | 25 s | 25 s (hard) |
| Trigger | 25 s | 25 s |
| Scheduled trigger | 25 s | 25 s |
| Web trigger | 25 s | 25 s |
| **Consumer (async event handler)** | 25 s | **`timeoutSeconds:` up to 900 s** |
| `preUninstall` | 55 s | 55 s |

Need >25 s? Push to a queue. See `26-async-events-and-queues.md`.

## Memory

```yaml
runtime:
  name: nodejs22.x         # also: nodejs24.x, nodejs20.x
  memoryMB: 512            # raises CPU proportionally
```

Per-function override: `function.runtime.memoryMB`.

## KVS (`@forge/kvs`) limits

| Limit | Value |
|---|---|
| Key length | 500 chars |
| Key format | `/^(?!\s+$)[a-zA-Z0-9:._\s-#]+$/` |
| Value size | 240 KiB |
| Object depth | 31 |
| Reads per key | 12 MB/s |
| Writes per key | 1 MB/s |
| Queries per index value | 24 MB/s |

When you hit each:

- **240 KiB cap** → shard with a deterministic prefix: `key:{i}` plus an index key that maps logical id → shard index.
- **1 MB/s write per key** → push writes to a queue with `concurrency.key = pageId` and let the consumer serialize them.
- **`RATE_LIMIT_EXCEEDED` (HTTP 429 from KVS)** → exponential backoff with jitter; route through a queue.

## Queue (`@forge/events`) limits

| Limit | Value |
|---|---|
| `queue.push` payload | ≤ 50 events / 200 KB combined |
| Per-minute push rate | Throws `RateLimitError` |
| Async event retries | Max 4 |
| `InvocationError.retryAfter` | ≤ 900 s |
| `InvocationError.retryData` | ≤ 4 KB |
| Consumer execution | `timeoutSeconds` ≤ 900 |

## Confluence REST limits

- Confluence Cloud rate-limits the REST API. Honor `Retry-After` when present.
- Bulk operations (e.g. updating many pages) commonly trip rate limits — chunk and pause.
- v1 endpoints (`/wiki/rest/api/...`) and v2 (`/wiki/api/v2/...`) have separate quotas in practice; prefer v2 for newer operations.
- Pagination is **cursor-based** in v2 (`_links.next`), not offset-based.

## Content property limits (CQL-indexed)

When a content property is registered as `confluence:contentProperty`, its value can be queried via CQL. Practical limits:
- Property values up to ~32 KiB are reasonable; beyond that, indexing becomes unpredictable.
- Indexing is asynchronous — newly written values may not appear in CQL search for several seconds.
- Property keys are case-sensitive and must be stable for the lifetime of the app.

## Body format & ADF size

When fetching a page with `?body-format=atlas_doc_format`, the ADF JSON is serialized into `body.atlas_doc_format.value` as a string. Very large pages (>1 MiB ADF after stringification) can cause performance issues or hit transport limits — paginate when possible.

## Scheduled triggers

- **Max 5 scheduled triggers per app.**
- Minimum interval: `fiveMinute`.
- First fire ~5 min after deploy.
- No automatic retry — handle errors in code.

## Resolver invoke payload

The Custom UI ↔ resolver bridge has practical payload limits in the ~250 KB range. Past that, persist the data in KVS and pass an id.

## Logs

- `forge logs -n N` shows the last N lines.
- Logs retained ~7 days; copy anything you need to keep into your own observability.

## When you hit a wall

| Wall | Move |
|---|---|
| 25 s timeout | Async queue + consumer with `timeoutSeconds: 900` |
| 240 KiB value | Shard across multiple keys + index map |
| 1 MB/s write per key | Shard the key, or serialize via queue `concurrency.key` |
| 4 retry max | Persist failure in KVS; retry from a separate scheduled trigger |
| 4 KB retryData | Persist payload in KVS, reference by id in retryData |
| 200 KB queue push | Split into multiple pushes |
| Custom UI bridge payload | Pass an id, persist the body in KVS |

## See also

- `26-async-events-and-queues.md` — queues in depth
- `28-adf-and-storage-format.md` — page bodies, conversion, common gotchas
- https://developer.atlassian.com/platform/forge/limits-kvs-ce
- https://developer.atlassian.com/platform/forge/runtime-reference/async-events-api
