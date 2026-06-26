# Forge Development Gotchas (Jira)

This document contains environment-specific facts and common pitfalls that defy reasonable assumptions. Use this to avoid common mistakes during development.

## 🛠️ Development Environment

### Forge Tunnel & Manifest Changes
When you modify `manifest.yml` (e.g., adding a new scope or module), **the running `forge tunnel` will not automatically pick up the changes.**
- **Fix**: Stop the tunnel (`Ctrl+C`) and restart it to apply the new manifest configuration.

### Authentication Context
The behavior of your app changes significantly depending on the authentication method used:
- `api.asApp()`: Executes with the app's own permissions. Best for background tasks and system-level operations.
- `api.asUser()`: Executes with the permissions of the user who triggered the event. Best for UI interactions where user context is required.
- **Gotcha**: If you use `asApp()` for a UI interaction, the user might see data they shouldn't, or the app might perform actions on their behalf that they didn't intend.

## 🌐 Network & Security

### CSP (Content Security Policy) in Custom UI
Custom UI apps run in a highly restrictive sandbox.
- **Issue**: "Refused to load script" or "Refused to connect to..." errors.
- **Fix**: Ensure all external domains are explicitly declared in the `permissions.external.fetch.client` section of your `manifest.yml`.
- **Note**: You cannot use inline `<script>` tags or inline styles in Custom UI.

### Rate Limiting (429)
Jira Cloud has strict rate limits on REST API calls.
- **Issue**: Your app suddenly starts receiving `429 Too Many Requests` errors.
- **Fix**: Implement exponential backoff in your resolver functions. Avoid making massive batches of requests in a single loop.

## 🧩 Module Specifics

### Workflow Validator Errors
When a `jira:workflowValidator` fails, the error message returned via `errorMessage` is what the user sees in the Jira UI.
- **Gotcha**: Keep error messages concise and actionable. Avoid technical jargon or stack traces.

### Custom UI Modal Sizing
The `viewportSize` property for `contentAction` (e.g., `small`, `medium`, `large`) is a hint, not a strict rule.
- **Gotcha**: Extremely complex UIs might feel cramped in `small` or `medium` viewports. Test your UI layout across different sizes.

## Writing Fields (REST)

### Field writes can silently no-op (editmeta before write)
A `PUT /rest/api/3/issue/{key}` to a field that isn't on that issue's **edit screen** (for its project + issue type) returns **2xx but never applies the value** — no error, no warning.
- **Fix**: Pre-flight with `GET /rest/api/3/issue/{key}/editmeta` and only write fields present in `data.fields`. Run it per project/issue-type combo, not per issue, for homogeneous batches. See `06-api-endpoints.md`.
- **Escape hatch**: `PUT ...?overrideScreenSecurity=true` writes off-screen fields anyway, but needs admin permission (non-admin → 403) and bypasses the protection editmeta reports on — use deliberately, not as a default.

### Verify after write — re-read to confirm Jira accepted it
Because writes can be silently dropped (off-screen fields, automation rules, validators, or workflow conditions rewriting your value), a 2xx is **not** proof the change landed. se-ppm-forge re-fetches written issues with `POST /rest/api/3/issue/bulkfetch` and compares each field's actual value against what it intended to write; a mismatch is reported as a real failure.
- **Fix**: For anything you must guarantee (bulk migrations, scheduling writes), re-read the issues after writing and diff expected vs actual. Normalize before comparing (dates, durations) so formatting differences don't read as false mismatches.

### Suppress notification spam on bulk writes (notifyUsers=false)
By default every `PUT /rest/api/3/issue/{key}` e-mails watchers and the assignee.
- **Gotcha**: A loop over hundreds of issues sends hundreds of e-mails and can itself trip rate limits / mail throttling.
- **Fix**: Append `?notifyUsers=false` to bulk/automation writes. Keep notifications on only for genuinely user-initiated single edits.

### Issue-link direction is counter-intuitive
`POST /rest/api/3/issueLink` reads as `outwardIssue <type.outward> inwardIssue`. For **Blocks**, `outwardIssue` is the blocker/predecessor and `inwardIssue` is blocked-by/successor — the field names feel reversed vs the UI wording, and admins rename link descriptions per site.
- **Fix**: Before any bulk link creation, GET `/rest/api/3/issueLinkType` to read the inward/outward labels, create one probe link, and re-read the issue (`?fields=issuelinks`) to confirm direction. Details + worked example in `06-api-endpoints.md`.