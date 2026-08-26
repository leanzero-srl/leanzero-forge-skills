---
name: jira-api-skill
description: Atlassian Jira Cloud REST API v3 integration from external apps — issues, projects, workflows, JQL search, ADF bodies, OAuth 2.0 / API-token auth, rate-limit handling. Use for non-Forge integrations calling Jira Cloud over HTTPS.
---

# Atlassian Jira Cloud REST API v3

Build external apps that talk to Jira Cloud over HTTPS — bots, integrations, sync jobs, scripts.

## When to Use This Skill

Use this skill when:
- You're integrating with Jira Cloud from an **external system** (a Node/Python service, a CI job, a Slack bot, etc.).
- The communication is HTTPS to `https://{your-domain}.atlassian.net/rest/api/3/...`.
- You're authenticating with an Atlassian API token (Basic auth) or OAuth 2.0 (3LO).

Skip this skill for:
- Apps that run *inside* Atlassian as Forge functions → use `atlassian-jira-forge-skill`.
- Pure org-admin operations (users/groups/policies across products) → use `atlassian-organizations-api-skill`.
- Confluence Cloud → use `confluence-api-skill` or `atlassian-confluence-forge-skill`.

## Pick a starting point

- **Production patterns** (auth refresh, retry+jitter, idempotent writes, pagination): `docs/24-rest-integration-patterns.md`.
- **Rate limits & quotas**: `docs/27-rate-limits-and-quotas.md`.
- **ADF (descriptions, comments, worklog bodies)**: `docs/28-adf-construction.md`.
- **Testing your integration**: `docs/30-testing-rest-integrations.md`.
- **Endpoint reference**: `docs/06-api-endpoints.md` (and the per-resource appendix in `docs/api/`).

## API Base URL

```
https://{your-domain}.atlassian.net/rest/api/3
```

Example: `https://mycompany.atlassian.net/rest/api/3/issue/PROJ-123`

## Authentication — what's correct, what's wrong

The Jira Cloud REST API accepts the following auth methods:

| Method | When to use | Header shape |
|---|---|---|
| **API token + email (Basic auth)** | Personal scripts, CI jobs, simple integrations | `Authorization: Basic base64(email:api_token)` |
| **OAuth 2.0 (3LO)** — access token | Apps acting on behalf of an Atlassian user | `Authorization: Bearer <access_token>` |
| **From a Forge app** | App code running inside Atlassian | `api.asUser().requestJira(route\`...\`)` from `@forge/api` |

> **Don't** sign your own JWT with `jsonwebtoken` and pass it as a Bearer token. That's the legacy Atlassian Connect "user-impersonation JWT" flow, and the Jira Cloud REST API does not validate locally-signed JWTs for general server-to-server use. Use an API token (Basic auth) or an OAuth 2.0 access token issued by `auth.atlassian.com`.

### API token (simplest)

Create at <https://id.atlassian.com/manage-profile/security/api-tokens>. Then:

```bash
curl -u "$ATLASSIAN_EMAIL:$ATLASSIAN_API_TOKEN" \
  https://your-domain.atlassian.net/rest/api/3/myself
```

Or in Node:

```javascript
const auth = Buffer
  .from(`${process.env.ATLASSIAN_EMAIL}:${process.env.ATLASSIAN_API_TOKEN}`)
  .toString('base64');

const r = await fetch('https://your-domain.atlassian.net/rest/api/3/myself', {
  headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
});
```

### OAuth 2.0 (3LO) — for end-user-facing apps

```bash
# Step 1 — open this URL in a browser to get an authorization code
# https://auth.atlassian.com/authorize?
#   audience=api.atlassian.com&client_id=YOUR_CLIENT_ID&
#   scope=read:jira-work+write:jira-work+offline_access&
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

# Step 3 — discover the cloudid for the site (one-time per site)
curl -H "Authorization: Bearer <access_token>" \
  https://api.atlassian.com/oauth/token/accessible-resources

# Step 4 — make REST calls via the Atlassian gateway
curl -H "Authorization: Bearer <access_token>" \
  https://api.atlassian.com/ex/jira/{cloudid}/rest/api/3/myself
```

Refresh tokens via `grant_type=refresh_token` before `expires_in` lapses (default ~1 h). See `docs/24-rest-integration-patterns.md`.

## Quick Reference: Common Endpoints

| Task | Endpoint | Method |
|---|---|---|
| Get issue by key | `/rest/api/3/issue/{issueKey}` | GET |
| Create issue | `/rest/api/3/issue` | POST |
| Update issue | `/rest/api/3/issue/{issueIdOrKey}` | PUT |
| Delete issue | `/rest/api/3/issue/{issueIdOrKey}` | DELETE |
| Transition issue | `/rest/api/3/issue/{issueIdOrKey}/transitions` | POST |
| List transitions | `/rest/api/3/issue/{issueIdOrKey}/transitions` | GET |
| Add comment (ADF body) | `/rest/api/3/issue/{issueIdOrKey}/comment` | POST |
| Get project | `/rest/api/3/project/{projectIdOrKey}` | GET |
| Search (JQL, `nextPageToken` cursor) | `/rest/api/3/search/jql` | POST |
| Bulk-read issues (chunk 100) | `/rest/api/3/issue/bulkfetch` | POST |
| Editable fields pre-flight | `/rest/api/3/issue/{issueKey}/editmeta` | GET |
| Create/delete issue link | `/rest/api/3/issueLink` (`/{linkId}` to delete) | POST/DELETE |
| Get current user | `/rest/api/3/myself` | GET |
| User search | `/rest/api/3/user/search?query=...` | GET |
| Notify users about issue | `/rest/api/3/issue/{issueKey}/notify` | POST |

> Issue descriptions, comments, and worklog bodies use **ADF** (Atlassian Document Format) — a JSON tree, not Markdown or HTML. See `docs/28-adf-construction.md`.

## Get an issue (full request/response shape)

```http
GET /rest/api/3/issue/PROJ-123 HTTP/1.1
Host: your-domain.atlassian.net
Authorization: Basic <base64(email:api_token)>
Accept: application/json
```

```json
{
  "key": "PROJ-123",
  "id": "10042",
  "fields": {
    "summary": "Login button broken in Safari",
    "status": { "name": "In Progress" },
    "issuetype": { "name": "Bug" },
    "project": { "key": "PROJ", "name": "My Project" },
    "description": { "type": "doc", "version": 1, "content": [/* ADF nodes */] }
  }
}
```

## Search with JQL (`POST /rest/api/3/search/jql`)

```http
POST /rest/api/3/search/jql HTTP/1.1
Host: your-domain.atlassian.net
Authorization: Bearer <access_token>
Content-Type: application/json
Accept: application/json

{
  "jql": "project = PROJ AND status = 'In Progress' ORDER BY created DESC",
  "fields": ["summary", "status", "assignee"],
  "maxResults": 50,
  "nextPageToken": null
}
```

> Jira's search endpoint paginates with `nextPageToken` (cursor-based), not `startAt`. Save the cursor between calls.

## Failure strategies

| Status | First-pass fix | Detail |
|---|---|---|
| 401 | Token missing/expired/revoked. Refresh OAuth or rotate API token. | `01-core-concepts.md` |
| 403 | Token's user/scope lacks the operation. Add scope or grant project permission. | `07-permissions-scopes.md` |
| 404 | Issue/project/user doesn't exist *or* isn't visible to the auth context (e.g. private project). | — |
| 409 | You sent a stale `version` or duplicated a unique value. | `24-rest-integration-patterns.md` |
| Bulk create attributes keys to the wrong issues | `body.issues` holds only the SUCCESSES; read `body.errors[].failedElementNumber` FIRST, and treat a count mismatch as "record nothing" | `gotchas.md` |
| 410 | Endpoint removed; check v2 → v3 deprecations. | `06-api-endpoints.md` |
| 429 | Honor `Retry-After`; exponential backoff with jitter. | `27-rate-limits-and-quotas.md` |
| 5xx | Atlassian-side. Retry with backoff; surface a friendly error. | `24-rest-integration-patterns.md` |

## Documentation map

### Core
| File | Topic |
|---|---|
| `01-core-concepts.md` | API overview, auth, versioning |
| `06-api-endpoints.md` | Endpoint reference (with per-resource appendix in `docs/api/`) |
| `07-permissions-scopes.md` | OAuth 2.0 scopes |
| `08-cli-commands.md` | curl & dev-loop helpers |

### Production
| File | Topic |
|---|---|
| `24-rest-integration-patterns.md` | OAuth refresh, retry+jitter, idempotency, cursor pagination |
| `27-rate-limits-and-quotas.md` | 429 behavior, per-endpoint guidance, batching |
| `28-adf-construction.md` | Building ADF for descriptions, comments, worklogs |
| `30-testing-rest-integrations.md` | Mocking, fixtures, dev-loop patterns |

### Reference (inherited content)
| File | Topic |
|---|---|
| `gotchas.md` | Pitfalls & edge cases |
| `problem-patterns.md` | Common problem snippets |
| `when-to-use-which.md` | When this skill vs the Forge skill |

> **Note on the bundled docs and templates.** This skill ships several `docs/02-*` through `docs/22-*` files and `templates/*.yml` that overlap heavily with the `atlassian-jira-forge-skill` directory. They cover Forge-specific surfaces (workflow validators, custom UI, scheduled triggers) and are kept here as a convenience reference for cross-context lookups. For pure REST integration work, the canonical files are the ones listed in **Core** and **Production** above.

## Templates

Copy-paste-ready helpers in `templates/`:

| Template | Purpose |
|---|---|
| `webhook-handler.yml` | Receive Jira webhook events |
| `bulk-operation.yml` | Batch-update many issues with rate-limit handling |
| `scheduled-trigger.yml` | Periodic sync skeleton (Forge or external scheduler) |
| `storage-kvs-example.yml` | KVS patterns (Forge) |

## Scripts

CI-safe helpers in `scripts/`:

| Script | Purpose |
|---|---|
| `test-auth.sh` | Verify your API token / OAuth bearer hits `/rest/api/3/myself` |
| `test-api-endpoint.sh` | Probe a few common endpoints |
| `test-jql.sh` | Run a JQL query and dump the first page of results |
| `preflight-check.sh` | Verify environment vars and CLI tools are present |
| `validate-manifest.sh` | (Forge) `forge lint` wrapper — for the bundled Forge templates |
| `deploy-and-install.sh` | (Forge) deploy + install upgrade |
| `dev-setup.sh` | (Forge) start tunnel |

## Support & Resources

- [Jira REST API v3 Reference](https://developer.atlassian.com/cloud/jira/platform/rest/v3/)
- [JQL — Jira Query Language](https://support.atlassian.com/jira-cloud-administration/docs/use-advanced-search-with-jira-query-language-jql/)
- [OAuth 2.0 (3LO) for Atlassian Cloud](https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/)
- [API tokens](https://id.atlassian.com/manage-profile/security/api-tokens)

## Changelog

- **2026-08-26** — `gotchas.md` gains the `POST /issue/bulk` result-mapping trap,
  found while building a document→backlog generator: the response carries only
  the SUCCESSES in `body.issues` and reports failures separately by
  `failedElementNumber`, so positional mapping mis-attributes every key after a
  rejected element — cosmetic on a flat batch, and silently wrong parenthood on
  a hierarchy. Includes the failures-first mapping and the rule that a count
  mismatch must record nothing rather than guess.

- **2026-08-26** — `27-rate-limits-and-quotas.md` now states plainly that the 2026 **points-based model does NOT govern API-token integrations** — CHANGE-2958: "API token-based traffic is not affected by this change" — so token auth stays on the classic burst limits and must not be re-architected around points. Flags the exception that DOES reach here (OAuth 2.0 3LO is app-initiated backend traffic and IS in scope, sharing one 65k/hr pool across every tenant of the client id) and points at the Forge points guide for that case. Plus: the delta in `X-RateLimit-Remaining` across two consecutive responses is the real cost of what happened between them — log it before modelling anything.
- 2026-06-26: Distilled REST edge-cases from production Forge apps (se-ppm-forge `services/jira-client.js`, CogniRunner) into `06-api-endpoints.md` and `gotchas.md`: issue-link inward/outward direction (counter-intuitive — verify before bulk), cursor-paginated `POST /rest/api/3/search/jql` (`nextPageToken`), `POST /rest/api/3/issue/bulkfetch` (chunk 100), `GET /editmeta` pre-flight to avoid silent no-op field writes, verify-after-write (re-read + diff), and `notifyUsers=false` / `overrideScreenSecurity=true` write flags.
- Replaced the legacy "JWT — Server-to-server authentication" claim with the three actually-valid Cloud REST options (API token Basic auth, OAuth 2.0 3LO, Forge `api.asUser/asApp`). Locally-signed JWTs are an Atlassian Connect pattern and are not validated by the v3 REST API.
- Added four new REST-API-specific docs: `24-rest-integration-patterns.md`, `27-rate-limits-and-quotas.md`, `28-adf-construction.md`, `30-testing-rest-integrations.md`.
- Standardized scripts: stripped emoji, added `set -euo pipefail`, made CI-safe.
- Added a "Pick a starting point" block and a documentation map that distinguishes canonical REST coverage from the bundled Forge-flavored reference content.
