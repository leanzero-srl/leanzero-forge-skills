# Forge Development Gotchas (Confluence)

This document contains environment-specific facts and common pitfalls that defy reasonable assumptions. Use this to avoid common mistakes during development.

## 🛠️ Development Environment

### Forge Tunnel & Manifest Changes
When you modify `manifest.yml` (e.g., adding a new scope or module), **the running `forge tunnel` will not automatically pick up the changes.**
- **Fix**: Stop the tunnel (`Ctrl+C`) and restart it to apply the new manifest configuration.

### Authentication Context
The behavior of your app changes significantly depending the authentication method used:
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
Confluence Cloud has strict rate limits on REST API calls.
- **Issue**: Your app suddenly starts receiving `429 Too Many Requests` errors.
- **Fix**: Implement exponential backoff in your resolver functions. Avoid making massive batches of requests in a single loop.

## 🧩 Module Specifics

### Content Action Modal Sizing
The `viewportSize` property for `contentAction` (e.g., `small`, `medium`, `large`) is a hint, not a strict rule.
- **Gotcha**: Extremely complex UIs might feel cramped in `small` or `medium` viewports. Test your UI layout across different sizes.

### Page Context Loading
In Custom UI, `view.getContext()` is asynchronous and returns a Promise.
- **Issue**: `context.extension` is `undefined` when trying to access page/space info immediately.
- **Fix**: Always use `await view.getContext()` or `.then()` before accessing context properties.

### Large Page Content in Custom UI
Fetching large pages via `requestConfluence` can impact performance and memory in the Custom UI sandbox.
- **Issue**: Slow UI response or browser tab crashes when handling large page bodies.
- **Fix**: Use pagination where possible, or fetch only the necessary parts of the page (e.g., using specific fields in the REST API).

## Groups, users & activity (v1-only surfaces)

Source: License Leash (axpo-license-manager). Full detail in `31-groups-users-and-activity.md`.

### Group + CQL endpoints live only on v1
The v2 API (`/wiki/api/v2`) has **no group-member endpoints, no `user/memberof`, and no CQL search.** For seat management, membership audits, and content-activity lookups you must use v1 (`/wiki/rest/api/group/...`, `/wiki/rest/api/user/memberof`, `/wiki/rest/api/search?cql=...`). Membership reads use `start`/`limit` **offset** pagination (max `limit=200`), not v2 cursor pagination — stop when `results.length < limit`. Count members cheaply with `membersByGroupId?limit=1&shouldReturnTotalSize=true` and read `totalSize`.

### Suspended users are invisible to Confluence
- **Issue**: `membersByGroupId` results carry no `status`/`active` field, and a **suspended account is silently omitted** from the list. You cannot tell from Confluence alone whether a missing user is removed or merely suspended.
- **Fix**: Cross-reference the Org API (`/v1/orgs/{orgId}/directory/users`) for suspended visibility — see `atlassian-organizations-api-skill`.

### Eventual consistency after suspend/reactivate
- **Issue**: Suspending or reactivating a user at `admin.atlassian.com` / the Org API is **not** immediately reflected in Confluence group reads — propagation takes minutes (observed in production, 2026-06). The admin/org view can show the user Active while a group read still lags.
- **Fix**: Re-check the more-authoritative Org API before acting on a membership read; don't treat a just-changed user's stale membership as truth.

### Multi-site group contamination
- **Issue**: `GET /wiki/rest/api/group` returns groups from **all sites in the org**, not just the current site. A naive audit mixes `confluence-users-siteA` with `confluence-users-siteB`. The live listing also takes **20–30 s on large orgs** (observed 2026-06) and pickers hit it twice.
- **Fix**: Derive the site name from the `confluence-users-{site}` group (`/^confluence-users-(.+)$/`), filter to `*-{site}` plus explicit global admin groups (`site-admins`, `org-admins`), and cache the group list rather than paging it live on every UI load.

### Email address needs a scope
- **Issue**: A user-context token often can't read email; `GET /wiki/rest/api/user` usually returns `publicName` only.
- **Fix**: Read email from the separate `GET /wiki/rest/api/user/email?accountId=...` endpoint with the `read:email-address:confluence` scope (or an `asApp()` Forge call granted that scope).

### Not every group grants a seat — and revokes can strip admin rights
- Guest groups (`confluence-guests-{site}`) and `confluence-user-access-admins` grant **no** product seat; admin groups (`confluence-admins`, `site-admins`, `org-admins`) grant a seat **and** admin rights. A license-revoke that blindly removes a user from every Confluence group can strip admin access or push them into a guest group (a soft reactivation backdoor to unlicensed content). Only the `confluence-users[-{site}]` membership reclaims a plain seat.