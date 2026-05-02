# Rate Limits & Quotas (Confluence Cloud REST)

Atlassian Cloud rate-limits the REST API per-user per-IP per-app. Exact numbers fluctuate; honor `Retry-After`.

## 429 response shape

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 5
X-RateLimit-NearLimit: true
Content-Type: application/json

{ "message": "Too many requests, please retry after 5 seconds" }
```

| Header | Meaning |
|---|---|
| `Retry-After: <n>` | Wait n seconds before retrying |
| `X-RateLimit-NearLimit: true` | You're close to the limit — slow down |

## Practical limits

| Surface | Limit | Notes |
|---|---|---|
| **Page reads** | Generous | Prefer cursor-paginated lists over per-id GETs |
| **Page writes** | Tighter | Sequence updates to the same page |
| **Bulk operations** | Tighter than single ops | Chunk and pause between batches |
| **CQL search (v1)** | Per-user throttle | Cache results when possible |
| **OAuth refresh** | Modest | Cache access tokens; refresh near expiry |

## What to do when you hit each

| Symptom | Fix |
|---|---|
| 429 in tight loop on one page | Sequence writes; sleep 250 ms between |
| 429 across pages during batch | Reduce concurrency; add inter-batch pause |
| 429 on read-heavy reports | Cache results; use cursor pagination |
| 5xx (Hystrix circuit breaker) | Same retry as 429 — transient |
| 401 mid-batch | OAuth access token expired — refresh and retry once |
| 403 on a specific space | User lost view permission — log and skip |
| 409 on PUT | Stale `version.number` — GET → bump → PUT |

## Read patterns

Prefer **expansion** when v2 supports it:

```
GET /wiki/api/v2/pages/{id}?body-format=atlas_doc_format&include-labels=true&include-properties=true&include-versions=false
```

For lists: `?limit=100` with cursor pagination, not many small GETs.

## Write patterns

When you must update many pages:

1. **Chunk** to ~10 pages per batch.
2. **Sleep 250 ms** between writes within a batch (4/s).
3. **Sleep 2 s** between batches.
4. **Stop** if you see >5% 429 rate — your downstream is congested.

See `24-rest-integration-patterns.md` §7.

## Body sizes

| Limit | Value |
|---|---|
| Max page body | a few MB practical (varies by tier) |
| ADF stringified value | 240 KiB practical (above this, content properties are a better split point) |
| Max attachment size | 10 MB (Free), 100 MB (Standard), 250 MB (Premium) |

## Webhook delivery

| Property | Behavior |
|---|---|
| Response window | `2xx` within ~10 seconds, or Atlassian retries |
| Idempotency | Events can be delivered more than once — make handlers idempotent |
| Signature | HMAC-SHA256 over raw body — verify always |
| Backoff | Atlassian retries failures with exponential backoff (typically 4–6 attempts) |

## When the limits aren't enough

For very high-volume integrations:

- Use **webhooks** instead of polling.
- Use **CQL** to fetch many items in one call instead of per-id GETs.
- Maintain a local mirror; refresh on webhook events.
- Talk to Atlassian about elevated rate arrangements for marketplace partners.

## See also

- `24-rest-integration-patterns.md` — backoff+jitter, idempotency, chunking implementations
- https://developer.atlassian.com/cloud/confluence/rate-limiting/
- https://confluence.atlassian.com/cloud/api-rate-limits-1235124797.html
