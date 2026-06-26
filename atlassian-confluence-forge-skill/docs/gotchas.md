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

## Auth & background-job pitfalls

### `asUser()` throws in scheduled triggers and consumers
Scheduled triggers, consumers, and (often) web triggers run with **no user context**. Calling `api.asUser()` there throws `PROXY_ERR: AUTH_TYPE_UNAVAILABLE`.
- **Fix**: use `api.asApp()` in any background path. For data only available with user permissions, persist it during a user-initiated flow, or use the Org API with an app credential. A dual-strategy helper (try `asUser`, fall back to `asApp`) keeps one code path working in both UI and background contexts — see `24-production-patterns.md` Pattern 10.

### Content-property PUT needs `version.number = current + 1`
Updating a content property (or page body) with a stale version returns `409 Conflict`. There is no "upsert" — you must GET the existing property to read its `version.number`, increment, then PUT. First-time create is a POST with no version. See `24-production-patterns.md` Pattern 3.

### Confluence event payloads carry top-level fields
Confluence product events (e.g. `avi:confluence:updated:page`, `avi:confluence:updated:attachment`) expose the actor and type as **top-level** `event.atlassianId` and `event.eventType`, plus `event.content` / `event.attachment`. Older code that reads `event.context.principal.accountId` will get `undefined` — breaking loop-prevention (the app then reacts to its own writes). Read `event.atlassianId`.

## Group / user API pitfalls

### Suspended users are invisible to the Confluence group API
A user suspended/deactivated at the org level disappears from Confluence group-membership reads, even though they still occupy state. Don't infer "removed from group → fully gone"; if you need authoritative status for suspended accounts, use the Org API (`atlassian-organizations-api-skill`). License Leash treats any non-`active` org status (`suspended`/`deactivated`/`for_deletion`/`inactive`/`closed` — the value varies by endpoint) as org-disabled.

### Multi-site orgs return groups from every site
In an org with multiple Confluence sites, group reads can return groups from **all** sites. Site-scoped groups are named `confluence-users-{site}` / `confluence-guests-{site}` — filter by the `-{site}` suffix to act on the right one. Don't assume `confluence-users` is unique.

## External fetch (egress)

Forge external fetch requires **HTTPS** (plain HTTP → HTTP 400; WSS allowed). Allowed ports are **80, 8080, 443, 8443, 8444, 7990, 8089, 8090, 8085, 8060** — not "443 only". Declare each backend host under `permissions.external.fetch.backend`; a self-hosted endpoint must be exposed on a supported port over HTTPS. Adding the same address under a different egress category (backend vs client) triggers a major update + re-consent.