# Testing & Tunneling

How to validate Confluence Forge code locally — `forge tunnel` for live integration, jest for unit tests with mocked Forge SDKs.

## `forge tunnel`

The tunnel runs your local code against the deployed app. Resolvers, triggers, scheduled triggers, consumers, and web triggers all execute on your machine.

```bash
forge tunnel                # default (development) environment
forge tunnel -e staging     # custom environment
```

### What works

- Resolvers, validators, triggers, scheduled triggers, consumers, web triggers.
- Custom UI assets are served from `localhost` if the resource has a `tunnel.port`.
- `console.log` shows in the tunnel terminal AND in `forge logs`.

### What does **not** work without a restart

- **Manifest changes** — adding scopes, modules, external-fetch hosts, function definitions. None of these are picked up by the running tunnel.

After editing `manifest.yml`:
1. Stop the tunnel (Ctrl+C).
2. `forge deploy`.
3. `forge install --upgrade` if you added scopes (users must approve).
4. `forge tunnel` again.

### Tunneling Custom UI

```yaml
resources:
  - key: my-ui
    path: static/ui/build
    tunnel:
      port: 3000
```

Then run `npm run dev` (or whatever serves your dev build at `:3000`) in another terminal. The Confluence iframe will route to `localhost:3000`.

### Auth context inside tunnel

The tunnel uses *your* Atlassian session for `asUser()` calls and the app's identity for `asApp()`. Test with both.

## Logs

```bash
forge logs                       # most recent
forge logs -n 50                 # last 50
forge logs --follow              # live stream
forge logs --environment staging
```

Logs are retained ~7 days. Pull anything you need long-term into your own observability.

## Unit tests with jest

The Forge SDK isn't a regular npm package you can `require` in jest — it's resolved at runtime. Mock it.

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
      "^@forge/api$":      "<rootDir>/test/__mocks__/forge-api.js",
      "^@forge/kvs$":      "<rootDir>/test/__mocks__/forge-kvs.js",
      "^@forge/resolver$": "<rootDir>/test/__mocks__/forge-resolver.js",
      "^@forge/events$":   "<rootDir>/test/__mocks__/forge-events.js"
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
      where: () => ({ getMany: jest.fn(async () => ({ results: [] })) }),
    }),
  },
  WhereConditions: {
    beginsWith: (s) => ({ op: 'beginsWith', value: s }),
    equalTo:    (s) => ({ op: 'equalTo',    value: s }),
  },
  __reset: () => store.clear(),
};
```

### `test/__mocks__/forge-api.js`

```javascript
const requestConfluence = jest.fn();
const requestJira       = jest.fn();
module.exports = {
  __esModule: true,
  default: {
    asApp:  () => ({ requestConfluence, requestJira }),
    asUser: () => ({ requestConfluence, requestJira }),
  },
  route: (strings, ...values) =>
    strings.reduce(
      (acc, s, i) => acc + s + (values[i] != null ? encodeURIComponent(values[i]) : ''),
      ''
    ),
  __requestConfluence: requestConfluence,
  __requestJira:       requestJira,
};
```

### `test/__mocks__/forge-resolver.js`

```javascript
class Resolver {
  constructor() { this.handlers = {}; }
  define(key, fn) { this.handlers[key] = fn; }
  getDefinitions() {
    // Lets test code do: handler({ payload, context, key }) directly
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
    FUNCTION_RETRY_REQUEST:         'FUNCTION_RETRY_REQUEST',
    FUNCTION_UPSTREAM_RATE_LIMITED: 'FUNCTION_UPSTREAM_RATE_LIMITED',
  },
  RateLimitError: class extends Error {},
  __pushed: pushed,
};
```

### Example test

```javascript
import { onPageCreated } from '../src/index';
import { __requestConfluence } from '@forge/api';
import { __reset, kvs } from '@forge/kvs';
import { __pushed } from '@forge/events';

beforeEach(() => { __reset(); __pushed.length = 0; jest.clearAllMocks(); });

test('queues a scan job when a new page is created', async () => {
  await onPageCreated(
    { content: { id: 'PAGE-1', spaceId: 'SP1' }, eventType: 'avi:confluence:created:page' },
    { accountId: 'user-1' }
  );
  expect(__pushed).toHaveLength(1);
  expect(__pushed[0].events.body.pageId).toBe('PAGE-1');
});
```

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
./scripts/preflight-check.sh   # CLI installed, logged in, manifest lints
forge lint                       # manifest valid
npm test                         # unit tests pass
forge deploy                     # to development
forge install --upgrade          # apply scope changes
forge tunnel                     # test live
```

## Confluence-specific testing tips

- **Trigger handlers**: keep the I/O behind a single helper so the handler itself can be tested by feeding it a fake event payload.
- **ADF construction**: write pure functions that build ADF nodes; test them with snapshot assertions on the JSON.
- **Content properties**: when testing CRUD, hit a real dev site at least once — eventual-consistency means newly written values may not appear in CQL queries for a few seconds.
- **Web triggers**: validate the request signature/token in a small pure function that you can unit-test; keep the resolver thin.

## Gotchas

- **Tunnel doesn't pick up manifest changes.** Restart after every manifest edit.
- **`forge install --upgrade`** is required when scopes/external hosts change.
- **Mocked tests can pass while real Forge fails.** Run an actual `forge tunnel` integration test before merging.
- **Custom UI dev server is its own process.** Don't expect `forge tunnel` to start your `npm run dev`.

## See also

- `13-cli-commands.md` — full CLI reference
- `gotchas.md` — environment-specific quirks
- `scripts/preflight-check.sh`, `scripts/validate-manifest.sh`, `scripts/dev-setup.sh`
