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

## Bundling

### An ESM-only subpath export is a landmine in the backend bundle
The Forge backend bundler is **webpack 5, target node18, CommonJS output**. A
package whose subpath is exported only under the `import` condition resolves
fine in plain `node` and fails **only inside the bundle** — which is the one
place you cannot easily debug.

Real case: `unpdf` loads PDF.js with `await import("unpdf/pdfjs")`. Under
`require` conditions that throws `ERR_PACKAGE_PATH_NOT_EXPORTED`, surfacing to
the user as *"Serverless PDF.js bundle could not be resolved"* — which reads
like a corrupt PDF, not a build problem.

The fix removes both possible mechanisms rather than betting on which one bit:

```js
import * as pdfjsModule from "unpdf/pdfjs";   // STATIC — same chunk, no runtime resolution
import { definePDFJSModule } from "unpdf";
export const ensurePdfjs = () => definePDFJSModule(() => Promise.resolve(pdfjsModule));
```

Verify against the deployed bundle, never locally: this class of bug is invisible
in `node`.

### Async chunks land OUTSIDE the Custom UI resource directory
A Custom UI resource is a **directory** (`resources: [{key, path: src/chat/globalPage}]`).
Webpack emits async chunks next to `output.path`, which is usually the parent —
so `import()` anywhere in the frontend produces a chunk that **404s at runtime
with no useful error**. A third-party library doing `import()` internally
(tesseract.js does) cannot be fixed by a static import on your side.

```js
// webpack.config.js
module: {
  parser: { javascript: { dynamicImportMode: "eager" } },  // inline every import()
  rules: [...],
}
```

Beware: a second `module:` key silently replaces the first. Merge into the
existing block.

## Storage

### `kvs.query()` has no `sort()`
Only the **entity store** sorts. The plain KVS query exposes `where`, `limit`
and `cursor` — nothing else. Keys come back in an order the docs do not promise,
so `beginsWith(prefix).limit(50)` on `conv:<id>:msg:<timestamp>` returns the
**oldest** 50, not the newest.

Symptom in production: past 50 messages a chat silently stops showing the model
the user's newest turn, sidebar previews show the opening line forever, and a
message count saturates at exactly the limit. Maintain your own ordered index
instead, and back it with a cursor walk for rows that predate it.

Other shapes worth knowing: the cursor field is `nextCursor`; `batchGet` answers
`{successfulKeys, failedKeys}`; and TTL **is** supported —
`kvs.set(k, v, { ttl: { value: 30, unit: "DAYS" } })`.

### There is no compare-and-swap on a plain KVS key
`kvs.transact()`'s conditional `check` requires the **entity** store. On plain
keys, read-modify-write is all you have — so any value written concurrently WILL
lose writes.

Real case: an index array of uploaded files, updated by up to five concurrent
uploads. Each read `[]`, each wrote `[itself]`, last writer won, and the losers'
data rows were orphaned with nothing referencing them. The fix is structural,
not defensive: **one row per item**, enumerated with a prefix query. Separate
keys cannot collide.

### `beginsWith` matches more than you think
`upload:<id>` and `upload:<id>:c:<n>` share a prefix, and KVS has **no keys-only
projection** — every result carries its full value. A sweep over `upload:` to
find manifests therefore drags every chunk body through a 25-second resolver.
Give different record types **different key prefixes**, not different suffixes.

## Jira REST

### `GET /rest/api/3/field/{fieldId}` does not exist
It answers **405 Method Not Allowed** — "Method 'GET' is not supported" —
while `GET /rest/api/3/field` (the list form) succeeds on the same credentials.
Probed live; it is not a permissions problem. Any tool built on it can only ever
fail.

### Bulk endpoints need the *Global bulk change* permission
`POST /rest/api/3/bulk/issues/fields`, `/transition` and `/move` all require it,
and ordinary users do not have it. Treat them as an admin-only accelerator and
translate the 403 into that sentence; the default path for "change N issues"
should be a capped sequential loop with partial-failure reporting.

### Creating components and versions needs `manage:jira-project`
If the app does not hold it, `setComponents` / `setFixVersions` can only use
values that already exist. Say so rather than failing on a name the user
invented.

### `archiveIssues` needs Premium/Enterprise AND admin
Under `asUser` it 403s for almost everyone. A tool that always fails is worse
than no tool.

### JQL is eventually consistent
`parent = KEY` can return **zero** seconds after the children were created,
while a direct `GET /issue/{key}` shows `fields.parent` set correctly. Verified
live. Read back **by key** after a write; an empty JQL result looks exactly like
"nothing was created", which is a completely different diagnosis.

Also: `~` is a **tokenised** text match, not a substring match. `summary ~ "a b"`
matches those words in any order and will not match the phrase you expect.
