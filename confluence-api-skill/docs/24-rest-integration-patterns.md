# REST Integration Patterns (Confluence Cloud)

Production patterns for external apps calling the Confluence Cloud REST API. Each pattern: problem statement, copy-pasteable code, tradeoffs.

## 1. OAuth access-token refresh loop

**Problem:** OAuth 2.0 (3LO) access tokens expire (~1 h). Long-running batches start getting 401s mid-run if you cache one.

**Pattern:** Track `expires_at`. Refresh on 401 once and retry. Refresh tokens **rotate** — persist whatever the response gives you.

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
  // j.refresh_token is the new one — persist it
  return accessToken;
}
```

## 2. Exponential backoff with jitter

**Problem:** Bursts of 429 + thundering retries.

**Pattern:** Honor `Retry-After`; otherwise exponential delay × jitter (0.7–1.3); cap at 30 s.

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
    return r;
  }
}
```

## 3. Idempotent page creation

**Problem:** A retry after a network blip silently creates duplicate pages.

**Pattern:** Use a stable client-generated key as a content property. Before POST, query for it.

```javascript
async function createPageIdempotent({ spaceId, title, body }, idempotencyKey) {
  // Look for an existing page with our idempotency key as a property
  // (CQL is v1; v2 lacks generic property search)
  const search = await requestWithRetry(
    `${BASE}/wiki/rest/api/search?cql=${encodeURIComponent(
      `space = "${spaceId}" AND content.property["idem-key"] = "${idempotencyKey}"`
    )}&limit=1`
  );
  const existing = (await search.json()).results?.[0];
  if (existing) return { id: existing.content.id, dedup: true };

  // Create the page
  const created = await requestWithRetry(`${BASE}/wiki/api/v2/pages`, {
    method: 'POST',
    headers: jsonAuthHeaders,
    body: JSON.stringify({
      spaceId, title, status: 'current',
      body: { representation: 'atlas_doc_format', value: JSON.stringify(body) },
    }),
  });
  const page = await created.json();

  // Stamp the idempotency key as a property (so the next retry finds it)
  await requestWithRetry(`${BASE}/wiki/api/v2/pages/${page.id}/properties`, {
    method: 'POST',
    headers: jsonAuthHeaders,
    body: JSON.stringify({ key: 'idem-key', value: idempotencyKey }),
  });
  return { id: page.id, dedup: false };
}
```

## 4. Cursor pagination

**Problem:** v2 paginates with `_links.next` (cursor), not `start + limit`. Code that uses offset-style pagination silently retrieves only the first page.

**Pattern:** Loop on `_links.next` until it's missing.

```javascript
async function* listAll(initialPath) {
  let path = initialPath;
  while (path) {
    const r = await requestWithRetry(`${BASE}${path}`);
    const data = await r.json();
    for (const item of data.results ?? []) yield item;
    path = data._links?.next ?? null;   // already includes ?cursor=...
  }
}

// Usage:
for await (const page of listAll(`/wiki/api/v2/spaces/${spaceId}/pages?limit=100`)) {
  process(page);
}
```

> The `_links.next` value is a *path*, not a full URL — prepend your base URL.

## 5. Page update with version handling

**Problem:** `409 Conflict` because PUT requires `version.number` to be exactly `current + 1`.

**Pattern:** GET → bump → PUT. Never compute version from a cached value.

```javascript
async function updatePageBody(pageId, newAdf) {
  const get = await requestWithRetry(
    `${BASE}/wiki/api/v2/pages/${pageId}?body-format=atlas_doc_format`
  );
  const current = await get.json();

  return requestWithRetry(`${BASE}/wiki/api/v2/pages/${pageId}`, {
    method: 'PUT',
    headers: jsonAuthHeaders,
    body: JSON.stringify({
      id: pageId,
      status: current.status,                       // required
      title: current.title,                          // required even if unchanged
      spaceId: current.spaceId,                      // required
      body: { representation: 'atlas_doc_format', value: JSON.stringify(newAdf) },
      version: { number: current.version.number + 1 },
    }),
  });
}
```

## 6. Content-property version handling

**Problem:** Same `409` trap on `/properties/{id}` PUT — properties are versioned independently of the page body.

**Pattern:** GET property by key, increment version, PUT.

```javascript
async function setContentProperty(pageId, key, value) {
  const get = await requestWithRetry(
    `${BASE}/wiki/api/v2/pages/${pageId}/properties?key=${encodeURIComponent(key)}&limit=1`
  );
  const list = await get.json();
  const existing = list.results?.[0];

  if (!existing) {
    return requestWithRetry(`${BASE}/wiki/api/v2/pages/${pageId}/properties`, {
      method: 'POST',
      headers: jsonAuthHeaders,
      body: JSON.stringify({ key, value }),
    });
  }
  const next = (existing.version?.number ?? 1) + 1;
  return requestWithRetry(
    `${BASE}/wiki/api/v2/pages/${pageId}/properties/${existing.id}`,
    {
      method: 'PUT',
      headers: jsonAuthHeaders,
      body: JSON.stringify({ key, value, version: { number: next } }),
    }
  );
}
```

## 7. Bulk page updates with rate-aware chunking

**Problem:** Updating many pages in parallel trips Confluence's rate limits.

**Pattern:** Chunk into batches of 10, sleep 250 ms between writes within a batch (4/s), 2 s between batches.

```javascript
async function updateMany(pageIds, builder) {
  const CHUNK = 10, INTRA = 250, INTER = 2000;
  for (let i = 0; i < pageIds.length; i += CHUNK) {
    const batch = pageIds.slice(i, i + CHUNK);
    for (let j = 0; j < batch.length; j++) {
      await updatePageBody(batch[j], await builder(batch[j]));
      if (j < batch.length - 1) await sleep(INTRA);
    }
    if (i + CHUNK < pageIds.length) await sleep(INTER);
  }
}
```

## 8. Webhook signature verification

**Problem:** A public webhook URL is hit by anything. Verify Atlassian's signature before acting.

**Pattern:** HMAC-SHA256 over raw body, `timingSafeEqual` compare.

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

## 9. CQL injection avoidance

**Problem:** Building a CQL string with `${userInput}` lets users inject extra clauses.

**Pattern:** Quote literals, escape backslashes/quotes; validate IDs before interpolation.

```javascript
function cqlQuote(s) {
  return `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
const cql = `space = "DEMO" AND text ~ ${cqlQuote(userQuery)}`;
```

Validate `spaceKey` against `/^[A-Z][A-Z0-9_]+$/` before using it raw.

## 10. CloudID discovery for OAuth-flow apps

```javascript
async function discoverCloudId(accessToken) {
  const r = await fetch('https://api.atlassian.com/oauth/token/accessible-resources', {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  const sites = await r.json();
  return sites.find((s) => s.url === process.env.EXPECTED_SITE_URL)?.id ?? sites[0]?.id;
}

// Then call:
//   https://api.atlassian.com/ex/confluence/{cloudid}/wiki/api/v2/...
```

## 11. Footer-comment via mention (notify a user without external mail)

```javascript
function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

async function postMentionComment({ pageId, accountId, message }) {
  const storageBody = `
    <p>
      <ac:link><ri:user ri:account-id="${accountId}"/></ac:link>
      ${escapeXml(message)}
    </p>
  `;
  return requestWithRetry(`${BASE}/wiki/api/v2/footer-comments`, {
    method: 'POST',
    headers: jsonAuthHeaders,
    body: JSON.stringify({ pageId, body: { representation: 'storage', value: storageBody } }),
  });
}
```

Confluence emails the mentioned user according to *their* preferences — no external mail provider needed.

## See also

- `27-rate-limits-and-quotas.md` — limits these patterns work around
- `28-adf-and-storage.md` — body formats, ADF construction
- `30-testing-rest-integrations.md` — mocking, fixtures
- https://developer.atlassian.com/cloud/confluence/rate-limiting/
- https://developer.atlassian.com/cloud/confluence/oauth-2-3lo-apps/
