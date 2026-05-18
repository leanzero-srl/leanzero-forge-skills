# Rate Limits & Quotas

Atlassian's points-based rate-limit model becomes enforced on **March 2, 2026**. Until then, the system runs in "beta" mode — your requests are scored but not throttled, and the response headers are prefixed `Beta-RateLimit-...`. On enforcement day, the `Beta-` prefix drops and overages return HTTP 429.

If you're writing a migration script that will run after March 2, 2026, you must understand this model. Existing scripts that don't change anything will start failing.

## Three independent caps

Every request is checked against all three caps in parallel. Hitting any one cap returns 429.

| Cap | Default (Tier 1) | Default (Tier 2 / Enterprise) | Header reason |
|---|---|---|---|
| Tenant hourly point pool | 65,000 pts | 100,000 + 10·users (Standard) → 150,000 + 30·users (Enterprise), capped at 500,000 | `jira-quota-tenant-based` or `jira-quota-global-based` |
| Burst per second | GET/POST 100/s, PUT/DELETE 50/s | Same | `jira-burst-based` |
| Per-issue writes | 20 writes / 2s, 100 writes / 30s | Same | `jira-per-issue-on-write` |

Point costs:

| Operation type | Cost |
|---|---|
| Core read (`GET /issue/{key}`, `GET /rest/api/3/search/jql`) | 1 |
| Identity read (`GET /user`, `GET /group`, `GET /permissions`) | 2 |
| Write (`PUT`, `POST`, `DELETE`) | 1 |
| Bulk read or write | 1 (per call, regardless of items inside) |

So `POST /issue/bulkfetch` with 100 issue keys costs **1 point**, not 100. Use bulk endpoints — the math is overwhelming.

## Response headers on 429

```
HTTP/1.1 429 Too Many Requests
Retry-After: 12
X-RateLimit-Limit: 65000
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 2026-05-18T10:00:00Z
X-RateLimit-NearLimit: true
```

The client templates honor `Retry-After` first, then fall back to exponential backoff. The other headers are informational — log them for post-run analysis but don't gate retries on them.

## Recommended pacing

Aim for **60% of burst** and **40% of hourly**. This headroom absorbs retries without surfacing 429:

```
Tier 1 Cloud: 65,000 pts/hr × 0.4 = 26,000 pts/hr ≈ 7 reads/sec
Burst: 100 GET/sec × 0.6 = 60 GET/sec
```

In practice this means concurrency=5 for writes and concurrency=8 for reads. The bulk endpoints amortize so well that even at the burst rate you're nowhere near the hourly limit.

If you must run faster, time-spread your work randomly across the hour (a uniform jitter of 0–1000ms before each request) — this lets the hourly bucket refill smoothly instead of draining and spiking.

## Exponential backoff with full jitter

```javascript
const delay = retryAfter
  ? parseInt(retryAfter, 10) * 1000
  : Math.min(5000 * Math.pow(2, attempt), 60_000);
```

Add jitter to prevent thundering-herd on retry:

```javascript
const base = retryAfter ? parseInt(retryAfter, 10) * 1000 : Math.min(5000 * Math.pow(2, attempt), 60_000);
const jittered = base * (0.5 + Math.random() * 0.5);   // 50–100% of base
```

The templates use exp-backoff without jitter for simplicity — if your migration is the only thing hitting the tenant, jitter doesn't help. Add it when you're sharing the tenant with another active migration or a CI fleet.

## Don't retry these 4xx codes

| Code | Why not |
|---|---|
| 400 Bad Request | Payload is malformed. Retrying with the same payload is pointless. |
| 401 Unauthorized | Token is wrong. Fix the env var. |
| 403 Forbidden | Permission missing (or the attachment-CSRF case — see `28-adf-and-attachments.md`). Fix the scope/header. |
| 404 Not Found | The entity doesn't exist. Plan referenced a wrong ID. |
| 410 Gone | The endpoint was removed (e.g. `GET /search?startAt=N` after Aug 1, 2025). Use the replacement. |

These are programmer errors. Fail fast, fix the bug, re-run.

## Per-issue write limit (20/2s) — the silent killer

If your migration does multiple writes to the *same* issue (backfilling 50 comments, restoring 30 attachments), you'll hit the per-issue cap before the global one.

Bad pattern (parallelize on each comment):

```javascript
await runPool(allComments, async (c) => { await jira.addComment(c); }, 10);
```

If 10 comments happen to target the same issue in flight, you'll see 429 even with global headroom.

Good pattern (group by issue, serialize within group):

```javascript
const byIssue = new Map();
for (const c of allComments) {
  if (!byIssue.has(c.issueKey)) byIssue.set(c.issueKey, []);
  byIssue.get(c.issueKey).push(c);
}
await runPool([...byIssue.values()], async (comments) => {
  for (const c of comments) await jira.addComment(c);
}, 5);
```

5 issues in flight, each issue's comments serialized — the per-issue limit is never approached.

## Tier calculator

| Plan | Users | Hourly points |
|---|---|---|
| Free / Standard | any | 65,000 |
| Standard | 100 | 100,000 + 10·100 = 101,000 |
| Premium | 500 | 130,000 + 20·500 = 140,000 |
| Enterprise | 2,000 | 150,000 + 30·2,000 = 210,000 |
| Enterprise (cap) | 12,000+ | 500,000 |

Your actual quota is in your tenant's admin console under **Settings → API limits**. Don't guess; look it up before a large run.

## Confluence rate limits

Confluence Cloud rate limits use the same response-header schema but the point budgets are separate from Jira (per-product). The shape is identical; the numbers are not yet public for the March 2026 rollout. Assume similar order of magnitude.

## Forge KVS rate limits

| Operation | Limit |
|---|---|
| `kvs.set` | 50/sec/app (in-app), 50/sec/app (remote) |
| `kvs.get` | 100/sec/app |
| `kvs.query` | 25/sec/app — eventually consistent |
| `kvs.batchSet` | 25/sec, ≤100 keys per call |

429 errors from KVS look the same as REST 429s. Honor `Retry-After`.

## Authoritative references

- [Atlassian rate limiting docs](https://developer.atlassian.com/cloud/jira/platform/rate-limiting/)
- [Evolving API rate limits (blog)](https://www.atlassian.com/blog/platform/evolving-api-rate-limits)
- [Jira bulk operations](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-bulk-operations/)

## See also

- [`03-http-client-pattern.md`](03-http-client-pattern.md) — the retry state machine that honors these headers
- [`08-concurrency-and-pool.md`](08-concurrency-and-pool.md) — pool sizing recommendations
- [`24-production-patterns.md`](24-production-patterns.md) — pattern 12 (bulk endpoints)
