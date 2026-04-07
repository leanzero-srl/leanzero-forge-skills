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