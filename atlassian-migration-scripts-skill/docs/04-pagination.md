# Pagination

Pagination is the single biggest source of broken migration scripts in 2025–2026. Atlassian changed Jira's search pagination contract on Aug 1, 2025, and the new Confluence v2 API uses a different scheme from v1. This doc has the rules for each surface.

## Jira Cloud — post-Aug 1, 2025

**The classic `GET /rest/api/3/search?jql=...&startAt=N&maxResults=M` is GONE.** It returns `410 Gone`, with no migration path on that URL.

Replacement: **`POST /rest/api/3/search/jql`** with body:

```json
{
  "jql":           "project = ABC AND ...",
  "fields":        ["summary", "status", "customfield_10318"],
  "expand":        ["changelog"],
  "maxResults":    100,
  "nextPageToken": "<opaque-from-previous-page>"
}
```

Response shape:

```json
{
  "issues": [ ... ],
  "nextPageToken": "<opaque-or-absent>",
  "isLast": false
}
```

**There is no `total` field.** Count what you've seen; don't compute progress percentages.

Pagination loop:

```javascript
let pageToken = undefined;
while (true) {
  if (pageToken) body.nextPageToken = pageToken;
  else delete body.nextPageToken;
  const response = await cloud.makeRequest("POST", "/rest/api/3/search/jql", body);
  const issues = response.issues || [];
  if (issues.length === 0) break;
  for (const issue of issues) processed++;
  if (!response.nextPageToken) break;
  pageToken = response.nextPageToken;
}
```

The `cloud-jira-client.js` template exposes this as `searchIssuesByJql(jql, opts, onPage)`. Use it.

### Things that look right but break

- **Caching `nextPageToken`** between runs: the token is opaque and time-bound. Always start fresh.
- **Parsing the token**: don't. It's not a base64-encoded offset; it's a server-side cursor identifier.
- **Sorting by `created DESC` and assuming stability**: new issues appear at the head between pages. Sort by `key ASC` or `created ASC` to get stable cursors.
- **Reading `total` for a progress bar**: that field is gone. Render a count + elapsed-time + items/sec instead.

### Bulk endpoints (use these to save points)

| Endpoint | Body | Notes |
|---|---|---|
| `POST /rest/api/3/issue/bulkfetch` | `{ issueIdsOrKeys, fields, expand }` | ≤100 keys per call. One billable point. |
| `POST /rest/api/3/changelog/bulkfetch` | `{ issueIdsOrKeys }` | ≤100 keys. Returns changelog arrays. |
| `POST /rest/api/3/bulk/issues/delete` | `{ issueIdOrKeys }` | ≤1000 per call. |
| `POST /rest/api/3/issue/bulk` | `{ issueUpdates: [...] }` | ≤50 issues per call. Multi-create. |
| `GET /rest/api/3/user/bulk?accountId=...` (repeatable) | n/a | ≤90 accountIds per call. |

If you find yourself looping `GET /issue/{key}` over thousands of keys, switch to `bulkfetch` — the rate-limit savings are 50×+.

## Jira Data Center / Server

Classic offset pagination still works:

```
GET /rest/api/2/search?jql=...&startAt=N&maxResults=M
```

Response includes `total`. The `datacenter-jira-client.js` template uses this. Keep it; do **not** retrofit the new Cloud surface onto DC — there's no equivalent endpoint there.

## Confluence Cloud v1 — CQL search

The standard discovery endpoint is `/rest/api/content/search?cql=...&expand=...`. The legacy `start=N` offset is unreliable for large result sets — sometimes the same page is returned repeatedly. The fix is to follow `_links.next` (a relative URL with an opaque cursor):

```javascript
let next = `/rest/api/content/search?cql=${encoded}&expand=${expand}&limit=50`;
while (next) {
  const response = await cf.makeRequest("GET", next);
  // dedupe by id as a safety belt against cursor bugs
  // ...
  const link = response._links?.next;
  if (!link) break;
  next = link.startsWith(this.basePath) ? link.substring(this.basePath.length) : link;
}
```

The `cloud-confluence-client.js` template exposes this as `searchContentByCql(cql, expand, onPage)`. It also dedupes by content ID — if a page appears in two consecutive batches, the second copy is dropped, and if an entire page is duplicates, pagination stops to avoid an infinite loop.

## Confluence Cloud v2 — cursor + Link header

The newer `/api/v2/...` API uses true cursor pagination via the **`Link` HTTP response header**, not `_links.next` in the body:

```
GET /wiki/api/v2/pages?limit=250
Link: </wiki/api/v2/pages?cursor=eyJp...>; rel="next"
```

Pattern:

```javascript
let next = "/api/v2/pages?limit=250";
while (next) {
  const response = await cf.makeRequest("GET", next);
  const link = response._linkHeader;
  const m = link && link.match(/<([^>]+)>\s*;\s*rel="next"/);
  if (!m) break;
  next = m[1].startsWith(this.basePath) ? m[1].substring(this.basePath.length) : m[1];
}
```

Note: v2 paths live under `/api/v2/...` (not `/rest/api/...`). They're significantly faster than v1 — Atlassian's own announcement quotes 2-3× throughput improvements.

Use v2 when:

- You only need basic CRUD on pages / blogposts / labels / spaces.
- You're listing large result sets where pagination performance matters.

Use v1 when:

- You need CQL (v2 has no equivalent).
- You're reading body in `storage` format for XHTML surgery.
- You're working with a content type v2 doesn't yet support.

The `cloud-confluence-client.js` template exposes both — `getPagesV2(query, onPage)` for v2, `searchContentByCql(...)` for v1.

## Forge KVS query

For Forge KVS via the remote system token (see `29-forge-kvs-remote-mending.md`):

```
POST /forge/storage/kvs/v1/list-keys
{ "prefix": "user_settings:", "limit": 100, "cursor": "<from prev>" }
```

Returns `{ keys: [...], cursor: "..." }`. **Eventually consistent** — don't loop while writing to the same prefix.

## Safety caps

All pagination loops in this skill have an upper-bound iteration cap (`maxPages = 5000` for Confluence CQL, similar for Jira). The cap exists to bail out of broken cursors that loop indefinitely. Hitting the cap is a bug — log it loudly and investigate.

## Stable cursor sorting

When paginating with cursors, your ORDER BY must be **immutable** — values that don't change as issues / pages are created or updated. Otherwise, pages drift between requests:

```
GOOD — stable cursors
  ORDER BY key ASC          (issue keys are immutable post-create)
  ORDER BY id ASC           (page / issue / object ids)
  ORDER BY created ASC      (creation date doesn't change)

BAD — drift between pages
  ORDER BY updated DESC     (every save shifts the order)
  ORDER BY rank ASC         (drag-and-drop changes rank)
  ORDER BY priority ASC     (user-mutable)
```

Why it matters: if you're on page 5 of an unstable sort and a new issue gets the highest `updated` timestamp, it pushes the contents of pages 1-5 down by one. The pagination cursor advances on `seen issues` but the *content* of those positions changed — you skip one row and double-process another.

For the post-Aug-2025 Jira API (`POST /search/jql` + `nextPageToken`), the opaque cursor handles stability internally, but you still want a stable ORDER BY so re-runs produce the same plan.

## Page-id deduplication

Even with stable sorts, network blips and broken cursors can return duplicates. All pagination wrappers in this skill dedupe by entity ID as a safety belt:

```javascript
const seen = new Set();
async (results) => {
  const fresh = results.filter((r) => {
    const id = r.id || r.key;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  if (fresh.length === 0) {
    // every result on this page was a duplicate → cursor is broken; abort
    return false;
  }
  for (const r of fresh) processed.push(r);
}
```

The `cloud-confluence-client.js` template does this automatically for `searchContentByCql`; replicate for any custom pagination.

## See also

- [`27-rate-limits-and-quotas.md`](27-rate-limits-and-quotas.md) — the bulk endpoints are how you stay under the points cap
- [`03-http-client-pattern.md`](03-http-client-pattern.md) — the makeRequest the pagination loops build on
- [`gotchas.md`](gotchas.md) — common pagination footguns
