# REST Integration Patterns (Jira Cloud)

Production patterns for external apps calling the Jira Cloud REST API. Each pattern lists the problem it solves, a copy-pasteable code excerpt, and notes on tradeoffs.

## 1. OAuth access-token refresh loop

**Problem:** OAuth 2.0 (3LO) access tokens expire (default ~1 h). If you cache one and use it for an hour-long batch, you'll start getting 401s mid-run.

**Pattern:** Track `expires_at`. On any 401, refresh once and retry. Treat the refresh token as the durable credential.

```javascript
let accessToken;
let expiresAt = 0;

async function getToken() {
  if (accessToken && Date.now() < expiresAt - 60_000) return accessToken;

  const r = await fetch('https://auth.atlassian.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: process.env.ATLASSIAN_CLIENT_ID,
      client_secret: process.env.ATLASSIAN_CLIENT_SECRET,
      refresh_token: process.env.ATLASSIAN_REFRESH_TOKEN,
    }),
  });
  if (!r.ok) throw new Error(`refresh failed: ${r.status}`);
  const j = await r.json();
  accessToken = j.access_token;
  expiresAt   = Date.now() + j.expires_in * 1000;
  return accessToken;
}
```

> **Refresh tokens rotate** in Atlassian's flow — every successful refresh returns a *new* refresh token. Persist whatever the response gives you, or your next refresh fails.

## 2. Exponential backoff with jitter

**Problem:** Bursts of 429 responses; thundering retries that synchronize with the limit window.

**Pattern:** Honor `Retry-After`. Otherwise exponential delay × jitter (0.7–1.3). Cap at a sensible ceiling.

```javascript
const RETRIES = 5, BASE = 1000, MAX = 30_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function requestWithRetry(url, init = {}) {
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    const r = await fetch(url, init);
    if (r.ok) return r;
    if (r.status === 429 || r.status >= 500) {
      if (attempt === RETRIES) return r;
      const ra = r.headers.get('Retry-After');
      const base = ra ? Math.min(Number(ra) * 1000, MAX) : BASE * 2 ** (attempt - 1);
      await sleep(Math.min(base * (0.7 + Math.random() * 0.6), MAX));
      continue;
    }
    return r; // permanent error — don't retry
  }
}
```

## 3. Idempotency on creates

**Problem:** A retry after a network blip silently creates duplicate issues.

**Pattern:** Use a stable client-generated key as a unique label or property; before POST, check if an issue with that key already exists.

```javascript
async function createIssueIdempotent({ projectKey, fields }, idempotencyKey) {
  // Look for an existing issue with our idempotency key as a label
  const search = await requestWithRetry(`${BASE_URL}/rest/api/3/search/jql`, {
    method: 'POST',
    headers: jsonAuthHeaders,
    body: JSON.stringify({
      jql: `project = ${projectKey} AND labels = "idem-${idempotencyKey}"`,
      fields: ['summary'],
      maxResults: 1,
    }),
  });
  const existing = (await search.json()).issues?.[0];
  if (existing) return existing;

  // Create with the idempotency label baked in
  const created = await requestWithRetry(`${BASE_URL}/rest/api/3/issue`, {
    method: 'POST',
    headers: jsonAuthHeaders,
    body: JSON.stringify({
      fields: { ...fields, project: { key: projectKey }, labels: [`idem-${idempotencyKey}`] },
    }),
  });
  return (await created.json());
}
```

## 4. Cursor pagination for `/search/jql`

**Problem:** The new search endpoint paginates with `nextPageToken`, not `startAt`. Code that uses `startAt + maxResults` silently retrieves only the first page.

**Pattern:** Loop on `nextPageToken` until it's null/empty.

```javascript
async function* searchAll(jql, fields = ['summary']) {
  let nextPageToken = null;
  do {
    const r = await requestWithRetry(`${BASE_URL}/rest/api/3/search/jql`, {
      method: 'POST',
      headers: jsonAuthHeaders,
      body: JSON.stringify({ jql, fields, maxResults: 100, nextPageToken }),
    });
    const page = await r.json();
    for (const issue of page.issues ?? []) yield issue;
    nextPageToken = page.nextPageToken ?? null;
  } while (nextPageToken);
}

// Usage:
for await (const issue of searchAll('project = PROJ AND status != Done')) {
  process(issue);
}
```

## 5. Bulk writes with rate-aware chunking

**Problem:** Updating thousands of issues sequentially is slow; in parallel, you trip the per-issue 20/2s and global 100/s burst limits.

**Pattern:** Chunk into batches, throttle to ~4 writes/s (well below the per-issue limit), pause longer between batches.

```javascript
async function updateMany(issueKeys, fieldsBuilder) {
  const CHUNK = 10, INTRA_MS = 250, INTER_MS = 2000;
  for (let i = 0; i < issueKeys.length; i += CHUNK) {
    const batch = issueKeys.slice(i, i + CHUNK);
    for (let j = 0; j < batch.length; j++) {
      const key = batch[j];
      await requestWithRetry(`${BASE_URL}/rest/api/3/issue/${key}`, {
        method: 'PUT',
        headers: jsonAuthHeaders,
        body: JSON.stringify({ fields: await fieldsBuilder(key) }),
      });
      if (j < batch.length - 1) await sleep(INTRA_MS);
    }
    if (i + CHUNK < issueKeys.length) await sleep(INTER_MS);
  }
}
```

## 6. Webhook signature verification

**Problem:** A public webhook URL is hit by anything. Atlassian signs webhook payloads — verify before acting.

**Pattern:** Compute HMAC-SHA256 over the raw body using your shared secret; compare with `timingSafeEqual`.

```javascript
import { createHmac, timingSafeEqual } from 'crypto';

export function verifyWebhook(rawBody, signatureHeader, secret) {
  if (!signatureHeader?.startsWith('sha256=')) return false;
  const provided = Buffer.from(signatureHeader.slice('sha256='.length), 'hex');
  const expected = Buffer.from(
    createHmac('sha256', secret).update(rawBody).digest('hex'),
    'hex'
  );
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}
```

> Capture the **raw** request body before any JSON parsing — otherwise the bytes don't match what Atlassian signed.

## 7. Error envelope unification

**Problem:** Jira returns errors in several shapes (`errorMessages`, `errors`, plain HTML for some 5xx). Your callers want one shape.

**Pattern:** Normalize all errors at the client boundary.

```javascript
async function callJira(path, init = {}) {
  const r = await requestWithRetry(`${BASE_URL}${path}`, {
    ...init,
    headers: { Accept: 'application/json', ...init.headers, ...authHeader() },
  });
  if (r.ok) return r.status === 204 ? null : r.json();

  let payload;
  try { payload = await r.json(); } catch { payload = await r.text(); }

  const message =
    payload?.errorMessages?.[0] ??
    Object.values(payload?.errors ?? {})[0] ??
    (typeof payload === 'string' ? payload.slice(0, 200) : `HTTP ${r.status}`);

  const err = new Error(message);
  err.status = r.status;
  err.body = payload;
  throw err;
}
```

## 8. CloudID discovery for OAuth-flow apps

**Problem:** OAuth-flow apps need to call `https://api.atlassian.com/ex/jira/{cloudid}/rest/api/3/...` but you don't know the cloudid up front.

**Pattern:** Hit `/oauth/token/accessible-resources` once per token, cache the result.

```javascript
async function discoverCloudId(accessToken) {
  const r = await fetch('https://api.atlassian.com/oauth/token/accessible-resources', {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  const sites = await r.json();
  // sites: [{ id: '<cloudid>', url: 'https://example.atlassian.net', name: '...', scopes: [...] }, ...]
  return sites.find((s) => s.url === process.env.EXPECTED_SITE_URL)?.id ?? sites[0]?.id;
}
```

## 9. JQL injection avoidance

**Problem:** Building a JQL string with `${userInput}` allows the user to inject extra clauses (`OR project = SECRET`).

**Pattern:** Never concatenate user input into JQL. For user-supplied filter values, use a parameterized lookup (e.g. `key in (${escapedKeys})`). For free-text search, use Jira's `text` operator with the user's value as a *quoted literal*.

```javascript
function jqlQuote(s) {
  // Wrap in double quotes; escape backslashes and double-quotes inside
  return `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

const jql = `project = "PROJ" AND text ~ ${jqlQuote(userQuery)}`;
```

For `key in (...)` lists, validate each key against `/^[A-Z][A-Z0-9_]+-\d+$/` before joining.

## 10. ADF for descriptions, comments, and worklog bodies

Jira's `description`, `comment.body`, and `worklog.comment` are ADF (JSON tree), not Markdown. See `28-adf-construction.md` for the canonical builders. Quick reference:

```javascript
const adfParagraph = (text) => ({
  type: 'doc',
  version: 1,
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

await callJira(`/rest/api/3/issue/${key}/comment`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ body: adfParagraph('Deployed to staging at ' + new Date().toISOString()) }),
});
```

## See also

- `27-rate-limits-and-quotas.md` — limits these patterns work around
- `28-adf-construction.md` — building ADF nodes
- `30-testing-rest-integrations.md` — mocking, fixtures
- https://developer.atlassian.com/cloud/jira/platform/rate-limiting/
- https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/
