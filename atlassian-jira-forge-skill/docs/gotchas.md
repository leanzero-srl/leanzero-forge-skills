# Forge Development Gotchas (Jira)

Environment-specific facts and pitfalls that defy reasonable assumptions. Read once before you start; revisit when something's mysteriously broken.

## Development Environment

### `forge tunnel` doesn't pick up manifest changes
Adding a scope, module, or external-fetch entry to `manifest.yml` while the tunnel is running will *not* apply.
- Stop the tunnel (`Ctrl+C`).
- Run `forge deploy` (or `forge install --upgrade` if scopes changed — users must approve new scopes).
- Restart `forge tunnel`.

### `api.asApp()` vs `api.asUser()`
- `asApp()` runs with the app's own permissions — use for background tasks, scheduled triggers, post-functions, async consumers.
- `asUser()` runs with the invoking user's permissions — use for UI interactions where row-level visibility matters.
- Mixing them up leaks data: `asApp()` in a UI handler can show users data they shouldn't see; `asUser()` in a scheduled trigger fails because there is no user.

### Auth context vanishes outside an invocation
Timers and unawaited promises that fire after a handler returns lose their auth context (and may also be killed mid-flight). Don't `setTimeout` from a Forge function — push to an async queue (`@forge/events`) instead.

## Network & Security

### CSP blocks Custom UI by default
Custom UI is iframed with strict CSP. Symptoms: "Refused to load script", "Refused to connect to..."
- Declare every external host in `permissions.external.fetch.client` (frontend) or `permissions.external.fetch.backend` (resolvers).
- Inline `<script>` and inline event handlers are forbidden. Use `addEventListener` from a bundled file.
- Inline `<style>` *is* allowed in Custom UI HTML, but external stylesheets must also be allowlisted.

### `permissions.external.images` is separate from `fetch`
Images on `<img src=…>` need `permissions.external.images`, not `permissions.external.fetch`.

### Rate limiting (429)
Jira Cloud rate-limits REST. Symptoms: bursts of `429 Too Many Requests`.
- Implement exponential backoff with jitter (see `19-rate-limit-handling.md` and `24-production-patterns.md`).
- Honor `Retry-After` when present.
- Per-issue write limit: 20 writes / 2s. Burst limit: 100 writes/s. Plan chunked write-back accordingly.

## Storage & KVS

### Use `@forge/kvs`, not `storage` from `@forge/api`
The legacy `storage` API stopped receiving feature updates after **2025-03-17**. New apps should use `import { kvs } from '@forge/kvs'` (named import). Required scope: `storage:app`.

### KVS limits worth remembering
- 500-char key, regex `/^(?!\s+$)[a-zA-Z0-9:._\s-#]+$/`.
- 240 KiB per value, max object depth 31.
- 12 MB/s reads & 1 MB/s writes per key — shard hot keys.
- 24 MB/s queries per index value.
- See `27-faas-limits-and-cost.md` for what to do when you hit each.

### Secrets need `setSecret` / `getSecret`
Plain `kvs.set` is *not* encrypted at rest in the same way. Use `kvs.setSecret(key, value)` / `kvs.getSecret(key)` for credentials.

### KVS has no atomic compare-and-set (TOCTOU on locks)
`acquireLock` style check-then-set is racy: two callers who pass the check in the same window both `set`, last write wins. **There is no CAS primitive.** Narrow the window with **acquire-then-reread** (write, then re-read the holder; if someone else's write landed last, treat it as a lost race and back off) — but understand this does *not* eliminate the race. For exactly-once side effects use `keyPolicy: 'FAIL_IF_EXISTS'` (an atomic conditional create), see `26-async-events-and-queues.md`. Source: se-ppm `src/services/concurrency/write-lock.js:44-50`.

## Module Specifics

### Workflow validator error messages
`{ result: false, errorMessage: "..." }` — the field is `errorMessage`, not `message`. The user sees this string verbatim in the Jira UI.
- Keep messages short and actionable.
- Fail-open in `catch` blocks for external-dependency validators — never block a transition on your dependency's outage.

### `expression: "true"` is required on `jira:workflowCondition`
Without it, Jira treats the condition as static and **never invokes your Forge function** to compute transition-button visibility. With it, the function runs on every issue view — keep it cheap. See `25-workflow-modules-deep-dive.md`.

### Warm-container registry/cache staleness (~30 s)
A module-scoped cache (e.g. a disabled-rules registry read on the hot path) persists across invocations in a warm container. If you invalidate it only on the resolver write path, *another* warm container won't see the change — so a just-disabled rule can run for up to your cache TTL (~30 s in CogniRunner). Bounded staleness is fine for advisory data; never cache credentials this way (a stale key is binary-wrong).

### Custom UI: stale closures after `await`
React handlers that read a value *after* an `await` capture the value from render time, not the latest. For values you read post-await (latest payload, a token, an abort flag) store them in a `useRef` and read `.current`, or you'll act on stale state.

### Custom UI manifest layout: `basic` → `blank`
The Custom UI resource `layout: basic` was deprecated in 2025; use `layout: blank` for full-page Custom UI. Verify against the current manifest reference if a page renders with unexpected Atlassian chrome.

### Async events: v2 manifest shape
`@forge/events` v2 declares consumers with `function:` (not v1's `resolver:`). The v1 shape still works but is deprecated. See `26-async-events-and-queues.md`.

### Custom field rendering
`jira:customField` view rendering must use UI Kit (`@forge/react`, `render: native`). Custom UI is **not** supported for view rendering. Edit can use either.

### Workflow update is a full-replacement POST
Programmatically adding a rule to a workflow requires GET → modify entire definition in memory → POST the whole thing back. Forgetting any transition or omitting the `system:update-issue-status` post-function breaks the transition.

### Custom UI modal sizing
The `viewportSize` (`small`, `medium`, `large`) is a hint, not a strict cap. Test layouts in each size; complex forms feel cramped in `small`.

## FaaS Limits

| Surface | Default Timeout | Hard Ceiling |
|---|---|---|
| Resolver / trigger / validator / post-function | 25 s | 25 s |
| `consumer` (async event handler) | 25 s default, set `timeoutSeconds:` to extend | 900 s |
| `preUninstall` | 55 s | 55 s |
| `queue.push` payload | — | 50 events / 200 KB combined |
| `InvocationError.retryData` | — | 4 KB |
| Async retries | — | 4 retries |

If you need >25 s, push to an async queue. See `26-async-events-and-queues.md`.