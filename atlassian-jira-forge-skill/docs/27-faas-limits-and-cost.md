# FaaS Limits & Cost Reference

The hard numbers you need to design around. All values are from `developer.atlassian.com` and current as of the skill's last update.

## Function timeouts

| Surface | Default | Configurable to |
|---|---|---|
| Resolver | 25 s | 25 s (hard ceiling) |
| Trigger | 25 s | 25 s |
| Workflow validator / condition / post-function | 25 s | 25 s |
| Scheduled trigger | 25 s | 25 s |
| Web trigger | 25 s | 25 s |
| **Consumer (async event handler)** | 25 s | **`timeoutSeconds:` up to 900 s** |
| `preUninstall` | 55 s | 55 s |

Need >25 s? Push to a queue. See `26-async-events-and-queues.md`.

## Memory & CPU

```yaml
runtime:
  name: nodejs22.x   # also: nodejs24.x, nodejs20.x
  memoryMB: 512      # raises CPU proportionally
```

- Per-function override: `function.runtime.memoryMB`.
- Heavier memory ≈ more CPU; useful for CPU-bound work like compression or large JSON transforms.

## KVS (`@forge/kvs`) limits

| Limit | Value |
|---|---|
| Key length | 500 chars |
| Key format | `/^(?!\s+$)[a-zA-Z0-9:._\s-#]+$/` |
| Value size | 240 KiB (max single persisted value) |
| Object depth | 31 |
| Reads per key | 12 MB/s |
| Writes per key | 1 MB/s |
| Queries per index value | 24 MB/s |

### When you hit each:

- **240 KiB value cap** → split the value across multiple keys (sharding) using a deterministic prefix: `key:{i}` plus an index entry that maps logical id → shard. (PPM-Pro pattern.)
- **1 MB/s write per key** → you have a hot key. Either shard, or push writes to an async queue with `concurrency.key` to serialize and slow them down.
- **12 MB/s read per key** → cache the read result in a downstream KVS or in-memory in the same invocation; spread reads across shards.
- **`RATE_LIMIT_EXCEEDED` (HTTP 429 from KVS)** → exponential backoff, then route the work through a queue.

### Hot-key throughput in practice (observed)

When reading or deleting many sharded keys, batch and pace them rather than firing all at once:
- **Reads:** batch ~**5 shards in parallel** per round (PPM `getIssuesByKeys`), which keeps you under per-key limits while still parallel.
- **Deletes:** batches of **~3 with ~200 ms pauses** between rounds — deletes are heavier and a tight loop trips `RATE_LIMIT_EXCEEDED` fast.
- **Ops budget:** a warm container can exhaust the per-minute KVS ops budget during a bulk transition; cache hot read-only data module-scoped with a short TTL (e.g. a registry, `25-workflow-modules-deep-dive.md`) and invalidate on every write.

## Queue (`@forge/events`) limits

| Limit | Value |
|---|---|
| `queue.push` payload | ≤ 50 events / 200 KB combined |
| Per-minute push rate | Throws `RateLimitError` when exceeded |
| Async event retries | Max 4 |
| `InvocationError.retryAfter` | ≤ 900 s |
| `InvocationError.retryData` | ≤ 4 KB |
| Consumer execution | `timeoutSeconds` ≤ 900 |

## REST request limits

- Jira Cloud rate-limits the REST API. **Honor `Retry-After`** when present and apply exponential backoff with jitter.
- Per-issue write limit: ~20 writes / 2 s.
- Burst limit: ~100 writes / s.
- See `19-rate-limit-handling.md` for backoff implementations.

## Forge LLM API (`@forge/llm` — Preview as of 2026-06)

| Limit | Value |
|---|---|
| Context window | 200,000 tokens |
| Requests per minute | 100 |
| Inference timeout | 5 minutes (requires async events config) |
| Models | Claude Haiku / Sonnet / Opus (platform-level) |
| Billing | app vendor's Forge bill — no free quota |

Adding the `llm` module is a **major version bump + admin re-consent**. Cost-guard every call. See `31-forge-ai-and-llm.md`.

## Egress / external fetch

- `permissions.external.fetch.backend` — hosts your resolvers / functions can reach.
- `permissions.external.fetch.client` — hosts the Custom UI iframe can `fetch()` directly (separate from backend).
- `permissions.external.images` — hosts allowed in `<img src=...>` (separate from `fetch`).
- See `28-forge-remote-and-egress.md`.

## Resolver invoke payload

The Custom UI ↔ resolver bridge has practical payload limits in the ~250 KB range. Past that, persist the data in KVS and pass an id.

## Logs

- `forge logs -n N` shows the last N lines.
- Logs are retained ~7 days; pull anything you need to keep into your own observability.
- `console.log` works; `console.error` shows in red. `console.debug` is filtered by default.

## Scheduled triggers

- Max **5 scheduled triggers per app**.
- Minimum interval: `fiveMinute`.
- First fire: ~5 minutes after deployment.
- No automatic retry — handle errors in code.

## Custom field types

- `view` rendering must be UI Kit (`@forge/react`, `render: native`). Custom UI is unsupported for view.
- `edit` can be either; UI Kit is recommended for consistency.
- See `29-custom-field-types.md`.

## When you hit a wall

| Wall | Move |
|---|---|
| 25 s timeout | Async queue + consumer with `timeoutSeconds: 900` |
| 240 KiB value | Shard across multiple keys + index map |
| 1 MB/s write per key | Shard the key, or serialize via queue `concurrency.key` |
| 4 retry max | Persist failure in KVS; retry via a separate scheduled trigger |
| 4 KB retryData | Persist payload in KVS, reference by id in retryData |
| 200 KB queue push | Split into multiple pushes |
| Custom UI bridge payload | Pass an id, persist the body in KVS |

## See also

- `26-async-events-and-queues.md` — queues in depth
- `28-forge-remote-and-egress.md` — egress declarations
- `19-rate-limit-handling.md` — backoff strategies
- https://developer.atlassian.com/platform/forge/limits-kvs-ce
- https://developer.atlassian.com/platform/forge/runtime-reference/async-events-api
