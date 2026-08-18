# Testing & Tunneling

How to validate Forge code locally — `forge tunnel` for live integration, jest for unit tests with mocked Forge SDKs.

## `forge tunnel` (live development)

The tunnel runs your local code against the deployed app's modules and routes Jira invocations to your machine. Resolvers, validators, post-functions, and consumers all execute locally.

```bash
forge tunnel                    # default (development) environment
forge tunnel -e staging         # custom environment
```

### What works in tunnel

- Resolvers, validators, conditions, post-functions, scheduled triggers, consumers, web triggers.
- Custom UI assets are served from `localhost` (configurable port in `manifest.yml`).
- `console.log` shows in the tunnel terminal AND in `forge logs`.

### What does *not* work without a restart

- **Manifest changes**. Adding scopes, modules, external-fetch hosts, function definitions — none of these are picked up by the running tunnel.
- After editing `manifest.yml`:
  1. Stop the tunnel (Ctrl+C).
  2. `forge deploy`.
  3. `forge install --upgrade` if you added scopes (users must approve).
  4. `forge tunnel` again.

### Tunneling Custom UI

Add a `tunnel.port` to the resource in `manifest.yml`:

```yaml
resources:
  - key: my-ui
    path: static/ui/build
    tunnel:
      port: 3000
```

Then run `npm run dev` (or whatever serves your dev build at `:3000`) in another terminal. The tunnel will route the iframe to `localhost:3000`.

### Auth in tunnel

The tunnel uses *your* Atlassian session for `asUser()` calls and the app's identity for `asApp()`. Test with both contexts.

## Logs

```bash
forge logs                       # most recent
forge logs -n 50                 # last 50
forge logs --follow              # live stream
forge logs --environment staging
```

Logs are retained ~7 days. Pull anything you need long-term into your own observability.

## Unit tests with jest

The Forge SDK isn't a regular npm package you can require in jest — it's resolved at runtime. Mock it.

### `package.json`

```json
{
  "scripts": { "test": "jest" },
  "devDependencies": {
    "jest": "^29.0.0",
    "@types/jest": "^29.0.0"
  },
  "jest": {
    "testEnvironment": "node",
    "moduleNameMapper": {
      "^@forge/api$": "<rootDir>/test/__mocks__/forge-api.js",
      "^@forge/kvs$": "<rootDir>/test/__mocks__/forge-kvs.js",
      "^@forge/resolver$": "<rootDir>/test/__mocks__/forge-resolver.js",
      "^@forge/events$": "<rootDir>/test/__mocks__/forge-events.js"
    }
  }
}
```

### `test/__mocks__/forge-kvs.js`

```javascript
const store = new Map();
module.exports = {
  kvs: {
    get: jest.fn(async (k) => store.get(k)),
    set: jest.fn(async (k, v) => { store.set(k, v); }),
    delete: jest.fn(async (k) => { store.delete(k); }),
    setSecret: jest.fn(async (k, v) => { store.set(`secret:${k}`, v); }),
    getSecret: jest.fn(async (k) => store.get(`secret:${k}`)),
    query: () => ({
      where: () => ({
        getMany: jest.fn(async () => ({ results: [] })),
      }),
    }),
  },
  WhereConditions: {
    beginsWith: (s) => ({ op: 'beginsWith', value: s }),
    equalTo: (s) => ({ op: 'equalTo', value: s }),
  },
  __reset: () => store.clear(),  // helper for tests
};
```

### `test/__mocks__/forge-api.js`

```javascript
const requestJira = jest.fn();
module.exports = {
  __esModule: true,
  default: {
    asApp: () => ({ requestJira }),
    asUser: () => ({ requestJira }),
  },
  route: (strings, ...values) =>
    strings.reduce(
      (acc, s, i) => acc + s + (values[i] != null ? encodeURIComponent(values[i]) : ''),
      ''
    ),
  __requestJira: requestJira,  // expose for assertion
};
```

### `test/__mocks__/forge-resolver.js`

```javascript
class Resolver {
  constructor() { this.handlers = {}; }
  define(key, fn) { this.handlers[key] = fn; }
  getDefinitions() {
    // Return an invoker test code can use directly:
    return async ({ payload, context, key }) =>
      this.handlers[key]({ payload, context });
  }
}
module.exports = { __esModule: true, default: Resolver };
```

### `test/__mocks__/forge-events.js`

```javascript
const pushed = [];
module.exports = {
  Queue: class {
    constructor({ key }) { this.key = key; }
    async push(events) { pushed.push({ queue: this.key, events }); }
  },
  InvocationError: class extends Error {
    constructor(opts) { super('InvocationError'); Object.assign(this, opts); }
  },
  InvocationErrorCode: {
    FUNCTION_RETRY_REQUEST: 'FUNCTION_RETRY_REQUEST',
    FUNCTION_UPSTREAM_RATE_LIMITED: 'FUNCTION_UPSTREAM_RATE_LIMITED',
  },
  RateLimitError: class extends Error {},
  __pushed: pushed,
};
```

### Example test

```javascript
import { handler as enqueue } from '../src/index';
import { __pushed } from '@forge/events';
import { __reset } from '@forge/kvs';

beforeEach(() => { __reset(); __pushed.length = 0; });

test('enqueue pushes a task with the issue key', async () => {
  await enqueue(
    { issue: { key: 'PROJ-1' } },
    { accountId: 'user-1' }
  );
  expect(__pushed).toHaveLength(1);
  expect(__pushed[0].events.body.issueKey).toBe('PROJ-1');
});
```

## Offline harnesses & parity testing

Mocked jest tests can pass while real behaviour diverges. Three higher-confidence harnesses from the PPM apps and CogniRunner, none of which need a live Forge bridge:

### Committed offline UI harness (`?harness`)

Ship a **code-split** standalone build of the real UI that loads only on a URL flag, so production never pulls it in. SE-PPM renders the real Gantt + calculation hook with synthetic data and no Forge bridge:

```javascript
// static/ppm-ui/src/index.jsx
if (typeof window !== 'undefined' && window.location.search.includes('harness')) {
  import('./harness/GanttHarness').then(({ default: GanttHarness }) => { /* render */ });
}
// GanttHarness.jsx exposes a console/Playwright API:
window.__ppm = { /* drive synthetic edits, read computed bars, assert cascade scope */ };
```

Build, serve `static/ppm-ui/build`, open `…/index.html?harness=1`, and drive it from the browser console or Playwright. Cascade scope, row order, and bar colour become testable **outside Atlassian, before deploying**.

### Two-engine parity harness

If a value is computed both in the browser (preview) and the backend (authoritative), a **Node parity harness** runs the frontend `utils/` mirror against `src/services/calculation/*` over all primitives + the full decision matrix and asserts **identical** output (SE-PPM's last run: **232/232**). Run it on every scheduling-rule change, then prove `preview == applied` on a real plan. See `24-production-patterns.md` pattern 15.

### Per-provider barrage test (BYOK)

For a multi-provider AI adapter, a fixture-driven barrage exercises every provider/model against the same prompts and checks the normalised `{ ok, content, tokens }` shape — catching per-provider translation bugs (Anthropic's required `max_tokens`, Bedrock's unencoded model id, OpenRouter rejecting `response_format`). CogniRunner keeps this under `test-harness/` (`PROVIDER-BARRAGE.md`, `fixtures/`, `lib/`). See `31-forge-ai-and-llm.md`.

## Lint your manifest

```bash
forge lint
forge lint --fix
```

Or use the bundled script:

```bash
./scripts/validate-manifest.sh
```

## Pre-flight checklist before deploying

```bash
./scripts/preflight-check.sh    # CLI installed, logged in, manifest lints
forge lint                       # manifest valid
npm test                         # unit tests pass
forge deploy                     # to development
forge install --upgrade          # apply scope changes
forge tunnel                     # test live
```

## Gotchas

- **Tunnel doesn't pick up manifest changes** — restart after every edit.
- **`forge install --upgrade`** is required when scopes or external hosts change. `forge deploy` alone isn't enough.
- **Mocked tests can pass while real Forge fails** — periodically run an actual `forge tunnel` integration test, especially before merging to main.
- **Custom UI dev server is its own process** — don't expect `forge tunnel` to start your `npm run dev`.
- **`process.env.NODE_ENV`** is `'production'` inside Forge functions, even in development. Don't use it to gate dev-only code.

## See also

- `08-cli-commands.md` — full CLI reference
- `gotchas.md` — environment-specific quirks
- `scripts/preflight-check.sh`, `scripts/validate-manifest.sh`, `scripts/dev-setup.sh`


## When a front-end access gate kills the static-server loop

The usual local loop — `python3 -m http.server` over the resource directory,
driven by Playwright — stops working the moment the app gains a gate that
**fails closed**. A typical one appends a full-page cover *synchronously* before
its first `await`, then denies when `invoke()` throws (which it always does with
no Forge bridge). The page stays covered and nothing initialises, so every
selector times out and the failure looks like a broken app rather than a missing
bridge.

### The stub harness that replaces it

Bundle the real component with `@forge/bridge` aliased to a stub, and mount it
into a copy of the surface's markup with that surface's own `<style>` block
inlined:

```js
resolve: { alias: { "@forge/bridge": path.resolve(__dirname, "bridge-stub.js") } },
output: { publicPath: "" },   // or the automatic-publicPath probe throws under file://
```

Two details decide whether it is worth anything:

- **Slice the markup out of the real `index.html`, verbatim** — balance `<div>`
  tags rather than regexing, and inline the real `<style>`. Element ids are the
  contract your components are parameterised by; a paraphrased skeleton tests a
  surface that does not ship.
- **Run it once per surface** if the surfaces have separate stylesheets.
  Verifying one proves nothing about the other, and duplicated CSS is exactly
  where they drift.

This tier verifies DOM, CSS, interaction and motion. It proves nothing about the
bundler, the resolvers, the queue or the model — that is what the deployed tier
is for.

### Verifying motion instead of eyeballing it
- Sample computed opacity of both layers through a crossfade and assert the sum
  never drops below 1.0.
- Record rAF deltas over ~2 s: average ≈16.7 ms, zero frames over 33 ms.
- Assert hover/focus/chosen colours with `getComputedStyle`, not a screenshot.
- Wait on `element.getAnimations()` rather than a fixed timeout — recording
  video stretches wall-clock enough that a 220 ms entrance is still in flight
  when a naive sample lands, and a mid-flight opacity reads as a stranded
  element.
- Re-run everything with reduced motion **emulated explicitly**
  (`page.emulateMedia`), and **assert the emulation took**. A reduced-motion
  suite that silently ran as the normal one reports green while testing nothing.

### Two traps in the deployed tier
- **A persistent browser profile caches your redeploy.** The giveaway is an
  implausibly fast run against a stale bundle reporting the previous failure.
  `Network.setCacheDisabled` via CDP.
- **`forge logs` lags and is filtered.** Do not iterate on a live bug by
  redeploying and re-reading logs; add the log line, yes, but favour a
  deterministic unit-level reproduction. Chasing a live symptom through a
  laggy log is how an afternoon disappears.

### Structural checkers must strip comments first
Any test that greps source for a pattern will eventually flag a *comment*
describing the thing it guards — an egress scan matching a comment that
mentions `fetch(`, a fence checker matching prose about `role:"tool"`. Strip
comments before the scan. A checker that reads prose teaches people to write
around it.


## One shared browser window for a live-harness run

A persistent Chrome profile (needed so Atlassian's device identity survives and
2FA stays quiet) can only be open ONCE — so per-test contexts serialise the
whole run behind the profile lock, and ~25 tests become the same window
opening, loading the same page, booting the same app and closing. The profile
already shares cookies/localStorage between tests, so per-test contexts buy no
isolation at all — only churn.

Worker-scope the context instead:

- launch once per worker; per-test evidence via `tracing.startChunk()` /
  `stopChunk({path})` (never `tracing.stop()` — on a shared context that ends
  tracing for every later test);
- disable HTTP cache once via CDP (a persistent profile happily serves the
  bundle from BEFORE your redeploy — the giveaway is an implausibly fast run
  reporting the previous failure);
- sweep `page.on(...)` listeners between tests, or one spec's watchers feed the
  next spec's noise assertions;
- keep a `VIDEO=1` escape hatch that launches the legacy per-test context and
  SKIPS the shared launch — video is context-scoped, and two launches of one
  profile die with "profile is already in use".

Isolation stays where it really was all along: each test navigates fresh (the
iframe re-boots) and uses its own fixture ids.

## Driving a UI Kit 2 page with Playwright

- UI Kit 2 renders into the **host DOM**, not an iframe — and text selectors
  collide with the product's own chrome ("Settings" matches Jira's settings
  hub before your tab). Role-scoped selectors only.
- Forge **prefixes element ids** — `inputId="pmodel"` becomes
  `forge-app-<hash>-pmodel`. Match with `[id$="-pmodel"]`.
- Assert dropdowns on real `role=option` elements after opening them. A
  body-text match will match a PARENT element's combined text and pass while
  the menu is wrong.
- The page exposes no bridge handle, so verify state through resolvers from a
  Custom UI surface in a second tab.
