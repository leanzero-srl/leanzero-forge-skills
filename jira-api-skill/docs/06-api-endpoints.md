# Jira API Endpoints Reference

This document serves as a high-level index for all Atlassian Jira Cloud API endpoints available via Forge. For detailed technical specifications, including request/response schemas and code examples, please refer to the specific module in the [API Documentation](./api/index.md) directory.

## API Modules

### [Core Issue Operations](./api/issues.md)
Covers CRUD operations for issues, comments, attachments, transitions, worklogs, and issue properties.

### [Workflow Management](./api/workflows.md)
Covers workflow definitions, workflow schemes, and managing transitions.

### [Project Management](./api/projects.md)
Covers project lifecycle, components, versions, categorization, and project-level roles/properties.

### [Users, Groups & Permissions](./api/users.md)
Covers user management, group memberships, and permission/security schemes.

### [Configuration & Administration](./api/configuration.md)
Covers Jira configuration elements such as fields, issue types, screens, and various schemes (priority, status, resolution).

### [Search & JQL](./api/search_and_jql.md)
Covers JQL (Jira Query Language), issue searching, filters, and dashboard management.

---

## Getting Started with Forge API

When using these endpoints within a Forge app, always use the `@forge/api` package and the `api.asApp().requestJira()` method to handle authentication and routing.

```javascript
import api, { route } from '@forge/api';

// Example: Fetching an issue
const response = await api.asApp().requestJira(route`/rest/api/3/issue/${issueKey}`);
const issue = await response.json();
```

## Common Error Codes

| Status Code | Meaning | Description |
| :--- | :--- | :--- |
| `400` | Bad Request | The request was invalid (e.g., malformed JQL or missing required fields). |
| `401` | Unauthorized | Authentication failed or token is invalid. |
| `403` | Forbidden | The authenticated user/app does not have sufficient permissions. |
| `404` | Not Found | The specified resource (issue, project, user) could not be found. |
| `500` | Internal Server Error | An error occurred on the Jira server side. |

---

## REST edge-cases for external integrators

The patterns below were distilled from two production Forge apps (se-ppm-forge `services/jira-client.js`, CogniRunner) that talk to the same v3 endpoints an external integrator uses. They apply identically over HTTPS with API-token (Basic) or OAuth 2.0 auth — just swap `api.asApp().requestJira(route\`...\`)` for `fetch('https://your-domain.atlassian.net/rest/api/3/...')`.

### Issue links — inward/outward is counter-intuitive (`POST /rest/api/3/issueLink`)

The body names two issues by their *role in the link type*, not by argument order:

```json
POST /rest/api/3/issueLink
{
  "type": { "name": "Blocks" },
  "outwardIssue": { "key": "PROJ-1" },
  "inwardIssue":  { "key": "PROJ-2" }
}
```

Read it as `outwardIssue <type.outward> inwardIssue`. For the built-in **Blocks** type (`outward = "blocks"`, `inward = "is blocked by"`) this means:

- `outwardIssue` (PROJ-1) is the **blocker / predecessor** — the thing that must finish first.
- `inwardIssue` (PROJ-2) is the **blocked / successor** — `PROJ-2` "is blocked by" `PROJ-1`.

This trips people up because the *field names* (inward/outward) feel reversed relative to the *semantics* you read in the UI. se-ppm-forge's `jira-client` uses this interpretation (`createIssueLink(outwardKey, inwardKey)` with `outwardKey` documented as "the issue that BLOCKS (predecessor)") — but note even that app contradicts itself in a second module, which is exactly why you should **probe a known link on the target site and read it back** rather than trust intuition.

The outward/inward descriptions differ per link type and per site (admins rename them). **Before any bulk link creation, GET the link type and create one probe link, then re-read it** to confirm the direction:

```bash
# 1. inspect the link type's directional labels
curl -u "$EMAIL:$TOKEN" \
  https://your-domain.atlassian.net/rest/api/3/issueLinkType
# -> [{ "name":"Blocks", "outward":"blocks", "inward":"is blocked by" }, ...]

# 2. create one link, then re-read the source issue to confirm direction
curl -u "$EMAIL:$TOKEN" \
  "https://your-domain.atlassian.net/rest/api/3/issue/PROJ-1?fields=issuelinks"
```

To **find a link's id for deletion**, GET the issue with `fields=issuelinks` and scan `fields.issuelinks[]` for the entry whose `type.name` matches and whose `outwardIssue.key` *or* `inwardIssue.key` is the other issue — there is no "search links" endpoint. Delete with `DELETE /rest/api/3/issueLink/{linkId}`.

### Cursor-paginated JQL (`POST /rest/api/3/search/jql`)

The old `POST /rest/api/3/search` (offset/`startAt` pagination) was removed. The current endpoint is `POST /rest/api/3/search/jql` and paginates with an opaque **`nextPageToken`** cursor, not `startAt`:

```json
{ "jql": "project = PROJ ORDER BY created DESC",
  "fields": ["summary", "status"],
  "maxResults": 100,
  "nextPageToken": "<token-from-previous-page-or-omit-on-first-call>" }
```

Loop until the response omits `nextPageToken` (or returns an empty `issues` array). Don't compute offsets — carry the cursor verbatim. Note the **Agile** API (`/rest/agile/1.0/board/{id}/issue`) still uses classic `startAt`/`total`, so a codebase touching both paginates two different ways.

### Bulk-read many issues in one call (`POST /rest/api/3/issue/bulkfetch`)

When you already hold a set of keys (e.g. from a prior search), don't loop `GET /issue/{key}`. Fetch up to **100 per request**:

```json
POST /rest/api/3/issue/bulkfetch
{ "issueIdsOrKeys": ["PROJ-1","PROJ-2", "..."], "fields": ["summary","duedate","customfield_10030"] }
```

Chunk the key list by 100 and concatenate `data.issues` from each response. se-ppm-forge uses this both for change-detection (fetch live values before writing) and for post-write verification.

### Pre-flight a field write (`GET /rest/api/3/issue/{key}/editmeta`)

A `PUT` to a field that isn't on the issue's **edit screen** for that project/issue-type is **silently dropped** — you get a 2xx and the value never lands. `editmeta` returns the fields actually editable for *this* issue, by the *same identity* that will perform the write:

```bash
curl -u "$EMAIL:$TOKEN" \
  https://your-domain.atlassian.net/rest/api/3/issue/PROJ-123/editmeta
# -> { "fields": { "duedate": {...}, "customfield_10030": {...}, ... } }
```

Take `Object.keys(data.fields)` as the editable set; if your target field id isn't in it, skip (or surface) the write rather than firing a no-op. Run `editmeta` per project/issue-type combo, not per issue, when bulk-writing a homogeneous batch.

### Suppress notifications and screen security on writes (`PUT /rest/api/3/issue/{key}`)

Two query flags matter for bulk/automation writes:

```
PUT /rest/api/3/issue/PROJ-123?notifyUsers=false&overrideScreenSecurity=true
{ "fields": { "duedate": "2026-07-01" } }
```

- **`notifyUsers=false`** — suppresses the e-mail blast Jira would otherwise send to watchers/assignee on every edit. Essential when touching hundreds of issues; without it you spam the whole project.
- **`overrideScreenSecurity=true`** — lets you write fields that aren't on the edit screen. Use **deliberately**: it bypasses the very protection `editmeta` reports on, so it's the escape hatch *after* you've decided a field-not-on-screen should still be written, not a substitute for checking. Requires admin-level permission; a non-admin token gets 403.

se-ppm-forge sets both on its app-identity writes (`?notifyUsers=false&overrideScreenSecurity=true`).