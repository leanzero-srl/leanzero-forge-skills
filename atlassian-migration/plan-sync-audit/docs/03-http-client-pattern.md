# HTTP Client Pattern

Every migration sub-project ships its own HTTP client classes — one per host. This doc covers why we use Node's native `https` over a third-party library, how the retry state machine works, and the rules around per-host instances.

## Why native `https`, not axios / got / fetch?

| Concern | `https` (this skill) | axios / got / undici |
|---|---|---|
| Dependencies | 0 — Node stdlib | 1–5 npm packages, with transitives |
| Predictable retries | We own the state machine | Library defaults vary; some retry POSTs on connection reset, which can double-create |
| Observable counters | Trivial to add `requestCount`, `errorCount`, `rateLimitCount` | Requires interceptors and per-request hooks |
| Network/timeout/HTTP-status handling | One code path | Split between request lifecycle and response lifecycle |
| Multipart upload with custom headers | Manual but explicit | Library-dependent; sometimes strips `X-Atlassian-Token` |
| Total LOC | ~120 per client | Less code, but obscures the retry logic |

Migration scripts are short-lived and high-stakes — the trade-off favors clarity over conciseness. You can read a 120-line client in 60 seconds and know exactly what it does at 429 vs 5xx vs ECONNRESET.

If you have an exceptional need for HTTP/2, brotli decompression, or DNS caching, drop in `undici`. Don't reach for axios; its config object is harder to audit than the equivalent native code.

## The retry state machine

Each request carries a `retryState` object:

```javascript
{ rateLimitAttempts: 0, serverErrorAttempts: 0 }
```

Three independent retry channels, each with its own counter:

| Channel | Trigger | Max attempts | Backoff | Notes |
|---|---|---|---|---|
| Rate limit (429) | HTTP 429 | 3 (Cloud) / 5 (DC) | `Retry-After` header → fallback to `min(5000 · 2^n, 60_000)` ms | Cloud is enforced by Atlassian; DC throttles vary |
| Server error (5xx) | HTTP 500–599 | 3 | `min(1000 · 2^n, 10_000)` ms | Most 5xx clear on retry |
| Network / timeout | `req.on('error')`, `req.on('timeout')` | 3 | `2000 · (n+1)` ms linear | Shares the counter with 5xx |

A 429 retry does NOT count against the 5xx counter and vice-versa. A request that hits one 429 and one 503 still gets its full retry budget on each channel.

The retry shape:

```javascript
const retry = (newState) =>
  this.makeRequest(method, path, body, newState).then(resolve).catch(reject);

if (res.statusCode === 429 && state.rateLimitAttempts < maxRateLimitRetries) {
  const delay = parseInt(res.headers["retry-after"], 10) * 1000 || backoff(state);
  setTimeout(
    () => retry({ ...state, rateLimitAttempts: state.rateLimitAttempts + 1 }),
    delay,
  );
  return;
}
```

`maxServerRetries` and `maxRateLimitRetries` are top-of-function constants — tune per host if your environment differs.

## What gets thrown vs retried

| HTTP code | Behavior |
|---|---|
| 200 / 201 | Resolve with parsed body (or `null` for 204) |
| 204 | Resolve with `null` |
| 400 / 401 / 403 / 404 / 410 | Reject immediately. `err.statusCode` is set. Do NOT retry — these indicate a payload bug, not a transient failure. |
| 409 | Reject with `err.statusCode = 409`. Some callers (page update) catch this and retry after re-fetching; the client itself doesn't auto-retry. |
| 429 | Retry with `Retry-After` honored; reject after max attempts (`err.isRateLimit = true`) |
| 500 / 502 / 503 / 504 | Retry with exp-backoff; reject after max attempts |
| Network error / timeout | Retry linear-backoff; reject after max attempts |

For 4xx (except 429 and 409), the client deliberately fails fast — these are programmer errors that retrying won't fix. The error message preserves the first 500 chars of the response body so you can see the API's complaint.

## Per-host instances, not singletons

```javascript
// GOOD — one per host
const cloud = new CloudJiraClient(process.env.CLOUD_BASE_URL, ...);
const dc    = new DatacenterJiraClient(process.env.DC_BASE_URL, ...);

// BAD — single client used against multiple hosts
const client = new CloudJiraClient(process.env.CLOUD_BASE_URL, ...);
client.baseUrl = process.env.DC_BASE_URL;   // breaks; baseUrl is parsed at construction
```

Each instance owns:

- The auth header (don't share between hosts).
- The `https.Agent` (cookies / connection pool are not host-portable).
- The retry counters (stats are per-host; that's how you tell which side is throttling).

In Cloud→Cloud migrations, instantiate **two** Cloud clients — one for source, one for destination. They have separate API tokens and separate rate-limit pools.

## Auth header construction

```javascript
function buildBasic(email, apiToken) {
  const t = (apiToken || "").trim();
  // If CLOUD_API_TOKEN is already "email:token" base64-encoded, accept it.
  if (/^[A-Za-z0-9+/]+=*$/.test(t) && t.length % 4 === 0) {
    try {
      const decoded = Buffer.from(t, "base64").toString("utf8");
      if (decoded.includes(":")) return t;
    } catch { /* fall through */ }
  }
  return Buffer.from(`${email}:${t}`).toString("base64");
}
```

The pre-encoded detection means an operator can paste a Base64 string from a password manager directly into `CLOUD_API_TOKEN` and the client still works. This catches a common mistake where a token already includes the email.

## Stats and observability

Every client exposes `getStats()`:

```javascript
{ requestCount: 4218, errorCount: 7, rateLimitCount: 12 }
```

Print this at the end of each phase. A non-zero `rateLimitCount` is a hint to drop concurrency next time; a high `errorCount` suggests payload bugs that retries can't fix.

For deeper introspection (per-endpoint timing, p99 latency), wrap `makeRequest` with a `hrtime` measurement and log to a separate file. Don't ship metrics to a real monitoring stack from a migration script — that's overkill for code that runs three times then dies.

## See also

- [`04-pagination.md`](04-pagination.md) — pagination patterns built on top of `makeRequest`
- [`08-concurrency-and-pool.md`](08-concurrency-and-pool.md) — how to size the worker pool to the client's retry budget
- [`27-rate-limits-and-quotas.md`](27-rate-limits-and-quotas.md) — the March 2026 points model the retry logic exists to handle
