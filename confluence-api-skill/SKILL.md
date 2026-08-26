---
name: confluence-api-skill
description: Atlassian Confluence Cloud REST API v2 integration from external apps — pages, blogposts, spaces, attachments, content properties, ADF/storage bodies, OAuth 2.0 / API-token auth, rate-limit handling. Use for non-Forge integrations calling Confluence Cloud over HTTPS.
---

# Atlassian Confluence Cloud REST API v2

Build external apps that talk to Confluence Cloud over HTTPS — bots, integrations, content sync jobs, doc-as-code pipelines.

## When to Use This Skill

Use this skill when:
- You're integrating with Confluence Cloud from an **external system** (a Node/Python service, a CI job, a doc generator, etc.).
- The communication is HTTPS to `https://{your-domain}.atlassian.net/wiki/api/v2/...` (preferred) or `/wiki/rest/api/...` (legacy).
- You're authenticating with an Atlassian API token (Basic auth) or OAuth 2.0 (3LO).

Skip this skill for:
- Apps that run *inside* Atlassian as Forge functions → use `atlassian-confluence-forge-skill`.
- Pure org-admin operations (users/groups/policies across products) → use `atlassian-organizations-api-skill`. Also go there for **per-product license management** and **suspended-user visibility** — Confluence group reads silently omit suspended accounts (see `docs/31-groups-users-and-activity.md`).
- Jira Cloud → use `jira-api-skill` or `atlassian-jira-forge-skill`.

## Pick a starting point

- **Production patterns** (auth refresh, retry+jitter, idempotent writes, cursor pagination): `docs/24-rest-integration-patterns.md`.
- **Rate limits & quotas**: `docs/27-rate-limits-and-quotas.md`.
- **ADF (page/comment bodies) and storage format**: `docs/28-adf-and-storage.md`.
- **Testing your integration**: `docs/30-testing-rest-integrations.md`.
- **Endpoint reference**: `docs/08-api-endpoints.md`.

## API Base URLs

| Surface | Base URL | When |
|---|---|---|
| **v2 (preferred)** | `https://{your-domain}.atlassian.net/wiki/api/v2` | Pages, blogposts, comments, attachments, properties, labels, spaces, users |
| **v1 (legacy)** | `https://{your-domain}.atlassian.net/wiki/rest/api` | CQL search, certain space operations, content-by-CQL — only when v2 lacks the operation |

Example: `https://mycompany.atlassian.net/wiki/api/v2/pages/123456?body-format=atlas_doc_format`

## Authentication — what's correct, what's wrong

The Confluence Cloud REST API accepts:

| Method | When to use | Header shape |
|---|---|---|
| **API token + email (Basic auth)** | Personal scripts, CI jobs, simple integrations | `Authorization: Basic base64(email:api_token)` |
| **OAuth 2.0 (3LO)** — access token | Apps acting on behalf of an Atlassian user | `Authorization: Bearer <access_token>` |
| **From a Forge app** | App code running inside Atlassian | `api.asUser().requestConfluence(route\`...\`)` from `@forge/api` |

> **Don't** sign your own JWT with `jsonwebtoken` and pass it as a Bearer token. That's the legacy Atlassian Connect "user-impersonation JWT" flow, and the Confluence Cloud REST API does not validate locally-signed JWTs. Use an API token (Basic auth) or an OAuth 2.0 access token issued by `auth.atlassian.com`.

### API token (simplest)

Create at <https://id.atlassian.com/manage-profile/security/api-tokens>. Then:

```bash
curl -u "$ATLASSIAN_EMAIL:$ATLASSIAN_API_TOKEN" \
  https://your-domain.atlassian.net/wiki/api/v2/spaces?limit=5
```

Or in Node:

```javascript
const auth = Buffer
  .from(`${process.env.ATLASSIAN_EMAIL}:${process.env.ATLASSIAN_API_TOKEN}`)
  .toString('base64');

const r = await fetch('https://your-domain.atlassian.net/wiki/api/v2/spaces?limit=5', {
  headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
});
```

### OAuth 2.0 (3LO) — for end-user-facing apps

```bash
# Step 1 — open in a browser to get an authorization code
# https://auth.atlassian.com/authorize?
#   audience=api.atlassian.com&client_id=YOUR_CLIENT_ID&
#   scope=read:confluence-content.summary+write:confluence-content+offline_access&
#   redirect_uri=https://YOUR_REDIRECT_URI&state=UNIQUE_STATE&response_type=code&prompt=consent

# Step 2 — exchange the code for an access token
curl -X POST https://auth.atlassian.com/oauth/token \
  -H 'Content-Type: application/json' \
  -d '{
    "grant_type": "authorization_code",
    "client_id": "YOUR_CLIENT_ID",
    "client_secret": "YOUR_CLIENT_SECRET",
    "code": "AUTHORIZATION_CODE",
    "redirect_uri": "https://YOUR_REDIRECT_URI"
  }'

# Step 3 — discover cloudid for the site (one-time per site)
curl -H "Authorization: Bearer <access_token>" \
  https://api.atlassian.com/oauth/token/accessible-resources

# Step 4 — make REST calls via the Atlassian gateway
curl -H "Authorization: Bearer <access_token>" \
  https://api.atlassian.com/ex/confluence/{cloudid}/wiki/api/v2/spaces?limit=5
```

Refresh tokens via `grant_type=refresh_token` before `expires_in` lapses. See `docs/24-rest-integration-patterns.md`.

## Quick Reference: Common Endpoints (v2 unless noted)

| Task | Endpoint | Method |
|---|---|---|
| Get page (with ADF body) | `/wiki/api/v2/pages/{pageId}?body-format=atlas_doc_format` | GET |
| Create page | `/wiki/api/v2/pages` | POST |
| Update page (full replacement) | `/wiki/api/v2/pages/{pageId}` | PUT |
| Delete page (trash) | `/wiki/api/v2/pages/{pageId}` | DELETE |
| List pages in space | `/wiki/api/v2/spaces/{spaceId}/pages?limit=100&cursor=...` | GET |
| Get page versions | `/wiki/api/v2/pages/{pageId}/versions` | GET |
| List footer comments | `/wiki/api/v2/pages/{pageId}/footer-comments` | GET |
| Post footer comment | `/wiki/api/v2/footer-comments` | POST |
| List/get content properties | `/wiki/api/v2/pages/{pageId}/properties` | GET |
| Set content property | `/wiki/api/v2/pages/{pageId}/properties` | POST/PUT |
| List spaces | `/wiki/api/v2/spaces?limit=25&cursor=...` | GET |
| Upload attachment (legacy v1) | `/wiki/rest/api/content/{pageId}/child/attachment` | POST |
| Search (CQL — v1 only) | `/wiki/rest/api/search?cql=...` | GET |
| Add/remove group member (v1 only) | `/wiki/rest/api/group/userByGroupId?groupId={id}` (POST `{accountId}` / DELETE `&accountId=`) | POST/DELETE |
| List/count group members (v1) | `/wiki/rest/api/group/{id}/membersByGroupId?start=0&limit=200` (`&limit=1&shouldReturnTotalSize=true` to count) | GET |
| Guest group seat semantics | `confluence-guests-{site}` (built-in) — adding a revoked user keeps login but drops the seat; see `31-groups-users-and-activity.md` | — |
| User's group memberships (v1) | `/wiki/rest/api/user/memberof?accountId={aid}` | GET |
| User email (needs `read:email-address`) | `/wiki/rest/api/user/email?accountId={aid}` | GET |
| Last activity from history (CQL v1) | `/wiki/rest/api/search?cql=contributor="{aid}" ORDER BY lastmodified DESC` | GET |
| Email a user (no native API → via Jira) | `/rest/api/3/issue/{key}/notify` (Jira) | POST |

> Page bodies use **ADF** (`?body-format=atlas_doc_format`) or **storage format** (XHTML). PUT requires the current `version.number` + 1. See `docs/28-adf-and-storage.md`.

## Get a page (full request/response shape)

```http
GET /wiki/api/v2/pages/123456?body-format=atlas_doc_format HTTP/1.1
Host: your-domain.atlassian.net
Authorization: Basic <base64(email:api_token)>
Accept: application/json
```

```json
{
  "id": "123456",
  "title": "Onboarding Checklist",
  "spaceId": "987654",
  "status": "current",
  "version": { "number": 7 },
  "body": {
    "atlas_doc_format": { "value": "{\"type\":\"doc\",\"version\":1,\"content\":[...]}" }
  }
}
```

> `body.atlas_doc_format.value` is a *stringified* JSON tree. `JSON.parse` it before traversing.

## Update a page (PUT — version bump required)

```http
PUT /wiki/api/v2/pages/123456 HTTP/1.1
Authorization: Basic <base64(email:api_token)>
Content-Type: application/json

{
  "id": "123456",
  "status": "current",
  "title": "Onboarding Checklist",
  "spaceId": "987654",
  "body": { "representation": "atlas_doc_format", "value": "{\"type\":\"doc\",\"version\":1,\"content\":[...]}" },
  "version": { "number": 8 }
}
```

A mismatched `version.number` returns `409 Conflict`. GET → bump → PUT, never compute it from a cached value.

## Failure strategies

| Status | First-pass fix | Detail |
|---|---|---|
| 401 | Token missing/expired/revoked. Refresh OAuth or rotate API token. | `01-core-concepts.md` |
| 403 | Token's user/scope lacks the operation. Add scope or grant space permission. | `12-permissions-scopes.md` |
| 404 | Page/space/property doesn't exist *or* isn't visible to the auth context. | — |
| 409 | Stale `version.number` on PUT — GET → bump → PUT. | `28-adf-and-storage.md` |
| 410 | Endpoint removed; check v1 → v2 migration. | `08-api-endpoints.md` |
| 429 | Honor `Retry-After`; exponential backoff with jitter. | `27-rate-limits-and-quotas.md` |
| 5xx | Atlassian-side. Retry with backoff. | `24-rest-integration-patterns.md` |

## Documentation map

### Core
| File | Topic |
|---|---|
| `01-core-concepts.md` | API overview, auth, versioning |
| `08-api-endpoints.md` | Endpoint reference (with per-resource appendix in `docs/api/`) |
| `12-permissions-scopes.md` | OAuth 2.0 scopes |

### Production
| File | Topic |
|---|---|
| `24-rest-integration-patterns.md` | OAuth refresh, retry+jitter, idempotency, cursor pagination |
| `27-rate-limits-and-quotas.md` | 429 behavior, per-endpoint guidance, batching |
| `28-adf-and-storage.md` | ADF vs storage format, version handling, building ADF nodes |
| `30-testing-rest-integrations.md` | Mocking, fixtures, dev-loop patterns |
| `31-groups-users-and-activity.md` | v1-only group membership/audit, user/email lookup, CQL activity backfill, multi-site filtering, seat management (License Leash) |

### Topical (inherited content)
| File | Topic |
|---|---|
| `06-content-properties.md` | Per-content app data |
| `09-labels-management.md` | Labels CRUD |
| `10-user-permissions.md` | Users, groups, permissions |
| `11-version-history.md` | Page versions |
| `gotchas.md` | Pitfalls |
| `problem-patterns.md` | Common problem snippets |
| `when-to-use-which.md` | When this skill vs the Forge skill |

> **Note on the bundled docs and templates.** This skill ships several `docs/02-*` through `docs/21-*` files and `templates/*.yml` that overlap heavily with the `atlassian-confluence-forge-skill` directory. They cover Forge-specific surfaces (custom UI, content macros, scheduled triggers) and are kept here as a convenience reference for cross-context lookups. For pure REST integration work, the canonical files are the ones listed in **Core** and **Production** above.

## Templates

Copy-paste-ready helpers in `templates/`:

| Template | Purpose |
|---|---|
| `webhook-handler.yml` | Receive Confluence webhook events |
| `content-property-storage.yml` | Content-property CRUD shape |
| `space-properties.yml` | Space-property CRUD shape |
| `attachment-management.yml` | Attachment upload/list/delete |
| `scheduled-trigger.yml` | Periodic sync skeleton (Forge or external scheduler) |
| `group-membership.yml` | v1 group add/remove/list/count, user/email lookup, CQL last-active recipes |

## Scripts

CI-safe helpers in `scripts/`:

| Script | Purpose |
|---|---|
| `test-auth.sh` | Verify your API token / OAuth bearer hits `/wiki/api/v2/spaces` |
| `test-api-endpoint.sh` | Probe a few common endpoints |
| `preflight-check.sh` | Verify environment vars and CLI tools are present |
| `validate-manifest.sh` | (Forge) `forge lint` wrapper — for the bundled Forge templates |
| `deploy-and-install.sh` | (Forge) deploy + install upgrade |
| `dev-setup.sh` | (Forge) start tunnel |

## Support & Resources

- [Confluence Cloud REST API v2 Reference](https://developer.atlassian.com/cloud/confluence/rest/v2/)
- [Confluence Cloud REST API v1 Reference](https://developer.atlassian.com/cloud/confluence/rest/) (legacy — for CQL etc.)
- [OAuth 2.0 (3LO) for Atlassian Cloud](https://developer.atlassian.com/cloud/confluence/oauth-2-3lo-apps/)
- [API tokens](https://id.atlassian.com/manage-profile/security/api-tokens)
- [Storage format reference](https://developer.atlassian.com/cloud/confluence/storage-format/)

## Changelog

- **2026-08-26** — `27-rate-limits-and-quotas.md` now states plainly that the 2026 **points-based model does NOT govern API-token integrations** — CHANGE-2958: "API token-based traffic is not affected by this change" — so token auth stays on the classic burst limits and must not be re-architected around points. Flags the exception that DOES reach here (OAuth 2.0 3LO is app-initiated backend traffic and IS in scope, sharing one 65k/hr pool across every tenant of the client id) and points at the Forge points guide for that case. Plus: the delta in `X-RateLimit-Remaining` across two consecutive responses is the real cost of what happened between them — log it before modelling anything.
- 2026-06-26 — Added `docs/31-groups-users-and-activity.md` + `templates/group-membership.yml` distilling the v1-only group/user/activity cluster from **License Leash** (axpo-license-manager): membership add/remove/list/count (`userByGroupId`, `membersByGroupId?shouldReturnTotalSize=true`), `user/memberof`, scoped `user/email`, CQL last-active backfill (`contributor`/`creator`/`watcher`), multi-site group filtering, guest-group seat semantics, and notify-via-Jira email. Added pattern 12 (privileged-identity-first group writes) to `24-rest-integration-patterns.md`; expanded `gotchas.md` (suspended-user invisibility, eventual consistency, multi-site contamination, email scope). Cross-skill see-also → `atlassian-organizations-api-skill` for suspended visibility and license management.
- Replaced the legacy "JWT — Server-to-server authentication" claim with the three actually-valid Cloud REST options (API token Basic auth, OAuth 2.0 3LO, Forge `api.asUser/asApp`). Locally-signed JWTs are an Atlassian Connect pattern and are not validated by the v2 REST API.
- Added four new REST-API-specific docs: `24-rest-integration-patterns.md`, `27-rate-limits-and-quotas.md`, `28-adf-and-storage.md`, `30-testing-rest-integrations.md`.
- Standardized scripts: stripped emoji, added `set -euo pipefail`, made CI-safe.
- Added a "Pick a starting point" block and a documentation map that distinguishes canonical REST coverage from the bundled Forge-flavored reference content.
