# Core Concepts: Atlassian Organizations API

This guide covers the fundamental concepts needed to work with the Atlassian Organizations REST API.

---

## API Overview

The Atlassian Organizations REST API is a **cross-product admin API** that manages organization-level settings for Atlassian Cloud. Unlike the Confluence API (`/wiki/api/v2`) or Jira API (`/rest/api/3`), this API operates at the **organization level** and affects ALL Atlassian Cloud products (Jira, Confluence, Bitbucket, Statuspage, etc.).

### Key Characteristics

| Characteristic | Description |
|----------------|-------------|
| **Base URL** | `https://api.atlassian.com/admin/{version}` |
| **Versions** | v1 (legacy), v2 (current) |
| **Authentication** | Bearer token (Admin API key or OAuth 2.0 3LO access token) |
| **Response Format** | JSON (RFC 7807 problem details for errors) |
| **Pagination** | Cursor-based |
| **Rate Limiting** | Strict per-org limits |

---

## API Versions

### v1 (Legacy)

```
https://api.atlassian.com/admin/v1
```

- Contains many deprecated endpoints
- Some endpoints still functional but scheduled for deprecation
- Recommended to migrate to v2 where available

### v2 (Current)

```
https://api.atlassian.com/admin/v2
```

- Current recommended version
- More consistent pagination
- New endpoints not available in v1
- Better support for multi-directory organizations

### Version Selection Guide

| Use Case | Recommended Version |
|----------|-------------------|
| List/get organizations | v1 (no v2 equivalent) |
| User management | v2 (v1 endpoints deprecated) |
| Group management | v2 |
| Directory management | v2 |
| Domain management | v1 (no v2 equivalent) |
| Events/audit log | v1 (no v2 equivalent) |
| Policies | v1 (no v2 equivalent) |
| Workspaces | v2 only |
| App access settings | v2 only |

---

## Authentication

Every endpoint takes a **Bearer token** in the `Authorization` header. The official intro is explicit: "Authentication is implemented via an API key. Use the API Key as a Bearer access token to authenticate."

There are three practical ways to obtain a token:

### 1. Admin API key (most common for backend automation)

Create the key at **admin.atlassian.com → Settings → API keys**. The key inherits the creator's organization-admin permissions. Use it directly as a Bearer token:

```bash
curl -H "Authorization: Bearer YOUR_ADMIN_API_KEY" \
  https://api.atlassian.com/admin/v1/orgs
```

This is the **only auth mode accepted** by some sub-APIs (DLP, API Access, Admin Control) — see `gotchas.md`.

### 2. OAuth 2.0 (3LO) — for apps acting on behalf of an org admin

```bash
# Step 1 — open in a browser to get an authorization code
# https://auth.atlassian.com/authorize?
#   client_id=YOUR_CLIENT_ID&
#   scope=read:orgs:admin+read:users:admin+write:users:admin&
#   redirect_uri=https://YOUR_REDIRECT_URI&
#   state=UNIQUE_STATE&
#   response_type=code&
#   prompt=consent

# Step 2 — exchange the code for an access token
curl -X POST https://auth.atlassian.com/oauth/token \
  -H 'Content-Type: application/json' \
  -d '{
    "client_id": "YOUR_CLIENT_ID",
    "client_secret": "YOUR_CLIENT_SECRET",
    "code": "AUTHORIZATION_CODE",
    "grant_type": "authorization_code"
  }'

# Response (truncated):
# {
#   "access_token": "eyJhbGciOiJSUzI1NiIs...",
#   "token_type": "Bearer",
#   "expires_in": 7200,
#   "refresh_token": "dGhpcyBpcyBhIHJlZnJl...",
#   "scope": "read:orgs:admin read:users:admin write:users:admin"
# }

# Step 3 — use the access_token
curl -H "Authorization: Bearer eyJhbGciOiJSUzI1NiIs..." \
  https://api.atlassian.com/admin/v1/orgs
```

Refresh tokens via `grant_type=refresh_token` before `expires_in` lapses (default 2 h).

### 3. From a Forge app

`api.atlassian.com/admin/...` is **not a Jira or Confluence product surface**, so `api.asApp().requestJira(...)` / `requestConfluence(...)` cannot reach it. Allowlist the host in your manifest and use `api.fetch` (or plain `fetch`) with a Bearer token you've already obtained (Admin API key stored as a KVS secret, or an OAuth access token):

```yaml
# manifest.yml
permissions:
  external:
    fetch:
      backend:
        - api.atlassian.com
```

```javascript
import api from '@forge/api';
import { kvs } from '@forge/kvs';

const apiKey = await kvs.getSecret('atlassian-admin-api-key');

const r = await api.fetch('https://api.atlassian.com/admin/v1/orgs', {
  headers: {
    Authorization: `Bearer ${apiKey}`,
    Accept: 'application/json',
  },
});
const orgs = await r.json();
```

> Forge apps do **not** sign their own JWT for `api.atlassian.com/admin/`. Locally-signed JWTs (Connect-style HS256 with a client secret, or any `jsonwebtoken.sign(...)` pattern) are not validated by this API. Always use a Bearer token issued by Atlassian — Admin API key or OAuth access token.

### Personal access tokens (development only)

If you need to experiment quickly, you can create a personal API token at admin.atlassian.com and use it as a Bearer token. Don't ship one in production code.

---

## Pagination

All list endpoints use cursor-based pagination.

### Response Format

```json
{
  "data": [
    { "id": "1", "name": "Org 1" },
    { "id": "2", "name": "Org 2" }
  ],
  "links": {
    "self": "https://api.atlassian.com/admin/v1/orgs?cursor=abc123",
    "prev": null,
    "next": "xyz789"
  },
  "meta": {
    "pageSize": 25,
    "startIndex": 0,
    "total": 50
  }
}
```

### Pagination Pattern

```javascript
async function paginateAll(endpoint, token, limit = 100) {
  let allResults = [];
  let cursor = null;

  do {
    const url = cursor
      ? `${endpoint}?cursor=${cursor}&limit=${limit}`
      : `${endpoint}?limit=${limit}`;

    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const data = await response.json();
    allResults = allResults.concat(data.data);

    cursor = data.links?.next || null;
  } while (cursor);

  return allResults;
}
```

---

## Rate Limiting

The Organizations API enforces strict rate limits per organization.

### Rate Limit Headers

| Header | Description |
|--------|-------------|
| `X-RateLimit-Limit` | Maximum requests per window |
| `X-RateLimit-Remaining` | Remaining requests in current window |
| `X-RateLimit-Reset` | Unix timestamp when the window resets |

### Handling Rate Limits

```javascript
async function rateLimitedRequest(url, token, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After') || Math.pow(2, i);
      await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
      continue;
    }

    return response;
  }

  throw new Error('Rate limit exceeded after retries');
}
```

### Documented limits

| Endpoint Group | Known Limit |
|----------------|-------------|
| Events (`/admin/v1/orgs/{orgId}/events`) | 10 req/min per user AND 10 req/min per API path (lowered end of May 2025). For higher throughput, switch to `/events-stream` polling. |

For other endpoint groups Atlassian does not publish exact numbers — read the `X-RateLimit-*` headers on each response and back off when `X-RateLimit-Remaining` approaches zero or you receive `429`.

---

## Error Response Format

### Standard Error Format (RFC 7807)

```json
{
  "type": "about:blank",
  "title": "Bad Request",
  "status": 400,
  "detail": "The request body is malformed",
  "instance": "/admin/v2/orgs/abc123/directories/xyz789/users"
}
```

### Error Response Format (v1)

```json
{
  "error": "Bad Request",
  "error_description": "The request body is malformed",
  "status": 400
}
```

### Common Error Codes

| Code | Meaning | Action |
|------|---------|--------|
| 400 | Bad request | Check request body and parameters |
| 401 | Unauthorized | Token missing, expired, or invalid |
| 403 | Forbidden | Insufficient permissions/scopes |
| 404 | Not found | Resource (org, user, etc.) doesn't exist |
| 409 | Conflict | Resource already exists or limit exceeded |
| 422 | Unprocessable entity | Validation error in request body |
| 429 | Rate limited | Back off and retry |
| 500 | Internal error | Retry with jitter, contact support if persistent |

---

## Vocabulary

| Term | Description |
|------|-------------|
| **Organization (Org)** | Your Atlassian Cloud tenant containing users, products, and settings |
| **Org ID** | Unique identifier for an organization (UUID string) |
| **Directory** | A user source (Atlassian-managed, LDAP, SAML IdP, etc.) |
| **Directory ID** | Unique identifier for a directory within an org |
| **Account ID** | Unique user identifier across all Atlassian products (UUID format) |
| **User ID** | Legacy identifier used in v1 endpoints |
| **Platform Role** | Organization-level role (org-admin, site-admin, etc.) |
| **Product Role** | Role within a specific product (Jira admin, Confluence editor, etc.) |
| **Domain** | A verified email domain associated with the organization |
| **Policy** | An organization-level security or access policy |
| **Workspace** | A Confluence workspace (collection of spaces) |

---

## Next Steps

- **[02-orgs.md](02-orgs.md)** — Organization endpoints
- **[03-users.md](03-users.md)** — User management endpoints
- **[11-permissions-scopes.md](11-permissions-scopes.md)** — Complete OAuth scopes reference
