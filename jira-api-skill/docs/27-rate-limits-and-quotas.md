# Rate Limits & Quotas (Jira Cloud REST)

Atlassian Cloud rate-limits the REST API per-user per-IP per-app. Exact numbers fluctuate and aren't fully published; the values below are the ones Atlassian *does* publish, plus practical observations.

## 429 response shape

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 5
X-RateLimit-NearLimit: true
Content-Type: application/json

{ "errorMessages": ["Too many requests, please retry after 5 seconds"], "errors": {} }
```

Always honor `Retry-After`. If absent, fall back to exponential backoff with jitter (`24-rest-integration-patterns.md` §2).

Atlassian also returns proactive headers when you're approaching the limit:

| Header | Meaning |
|---|---|
| `X-RateLimit-NearLimit: true` | You're close to the limit — slow down |
| `Retry-After: <n>` | Wait this many seconds before retrying |

## Practical limits worth knowing

| Surface | Limit | Notes |
|---|---|---|
| **Per-issue writes** | ~20 writes / 2 seconds | Burst above this trips immediate 429s on the same issue |
| **Global write burst** | ~100 writes / second | Bursts above this also 429 |
| **Search (`/search/jql`)** | Generous, but page sizes >100 are rejected | Use `nextPageToken` cursor |
| **Bulk operations** | Tighter than single ops | Chunk and pause between batches |
| **OAuth token refresh** | Modest | Cache access tokens; refresh only when within 60s of expiry |

## What to do when you hit each

| Symptom | Fix |
|---|---|
| 429 in tight loop on one issue | Add `await sleep(250)` between writes to the same issue |
| 429 across issues during a batch run | Reduce concurrency to ~4 writes/s; add inter-batch pause |
| 429 on read-heavy reports | Cache results; switch to `expand=` in a single GET vs many small GETs |
| 5xx (Hystrix circuit breaker) | Same retry strategy as 429; transient |
| 401 mid-batch | OAuth access token expired — refresh and retry once |
| 403 on a specific issue | User lost permission to that issue — log and skip; don't retry |

## Read-heavy patterns

Prefer **expansion** over multiple round-trips:

```javascript
// Instead of:
const issue = await get(`/issue/${key}`);
const transitions = await get(`/issue/${key}/transitions`);
const editmeta = await get(`/issue/${key}/editmeta`);

// Do:
const issue = await get(`/issue/${key}?expand=transitions,editmeta,changelog,renderedFields`);
```

For lists: prefer `/search/jql` with `fields=` over fetching each issue individually.

## Write-heavy patterns

When you must update many issues:

1. **Chunk** to 10 issues per batch.
2. **Sleep 250 ms** between writes within a batch (4/s).
3. **Sleep 2 s** between batches.
4. **Stop and reconsider** if you see >5% 429 rate — your downstream is congested.

See `24-rest-integration-patterns.md` §5 for the worked code.

## Webhook delivery limits

Atlassian batches and retries webhook deliveries. Your endpoint should:

- Respond `2xx` within ~10 seconds, or Atlassian considers it failed.
- Be idempotent — webhook events can be delivered more than once.
- Verify the signature on every event before acting (see `24-rest-integration-patterns.md` §6).

## Body size

| Limit | Value |
|---|---|
| Max JSON body Jira will accept | ~10 MB practical (varies by endpoint) |
| Max ADF nesting depth | ~50 levels (much more than you'd ever need; deeply nested ADF is a code smell) |
| Max attachment size | 10 MB (Free), 100 MB (Standard), 250 MB (Premium) |

## When the limits aren't enough

For very high-volume integrations, talk to Atlassian about an "elevated rate" arrangement, or rearchitect:

- Use **webhooks** to receive change notifications instead of polling.
- Batch reads via JQL instead of fetching one issue at a time.
- Maintain a local mirror of frequently-read data; refresh on webhook events.

## See also

- `24-rest-integration-patterns.md` — backoff+jitter, idempotency, chunking implementations
- https://developer.atlassian.com/cloud/jira/platform/rate-limiting/
- https://confluence.atlassian.com/cloud/api-rate-limits-1235124797.html

---

## Points-based rate limiting does NOT apply to this integration (verified 2026-08-26)

Atlassian's 2026 points model (1 pt/request + 2 per identity object + 1 per other
object, 65,000/hr) governs **Forge apps and Connect apps** — app-initiated backend
traffic under an OAuth client id. The change notice (CHANGE-2958) is explicit:

> "**API token-based traffic is not affected by this change**, and will continue to be
> governed by existing burst rate limits."

So an integration authenticating with an **API token** stays on the classic burst /
concurrency limits: honour `Retry-After`, back off exponentially WITH jitter, keep
concurrency modest. Do not re-architect a token-based integration around points, and
do not quote points arithmetic in a support ticket about it — it will read as a
category error.

**Where it DOES reach you:** OAuth 2.0 (3LO) apps are app-initiated backend traffic
and are in scope. If this integration authenticates with 3LO rather than a token, read
the Forge points guidance instead (`atlassian-confluence-forge-skill/docs/31-points-rate-limiting.md`),
because the pool is shared across every tenant of your client id and one noisy tenant
can starve the rest.

**Either way, the ground truth is on the response.** The delta in
`X-RateLimit-Remaining` across two consecutive responses is the real cost of what
happened between them. Log it before you model anything.
