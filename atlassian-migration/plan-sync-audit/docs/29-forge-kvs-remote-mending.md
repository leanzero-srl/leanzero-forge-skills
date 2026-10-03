# Forge KVS Remote Mending

JCMA does **not** migrate Forge app data. After a Cloud→Cloud move (or a DC→Cloud migration where the source had a Forge app installed), every key in your app's KVS still references the old tenant's entity IDs — broken.

This doc covers the remote-access pattern for fixing KVS data from outside the Forge runtime, so you can run a regular Node migration script against your app's storage.

## The basic problem

Inside a Forge function, you access KVS like this:

```javascript
import { kvs } from "@forge/kvs";
await kvs.set("user_settings:557058:f5...", { theme: "dark" });
const v = await kvs.get("user_settings:557058:f5...");
```

That code only runs inside the Forge runtime. There's no `node main/sync.js`. To mend data at scale from a Node migration script, you have to go through Atlassian's **remote KVS REST endpoint**, authenticated with a system-issued bearer token.

## Setup — manifest & scopes

```yaml
modules:
  endpoint:
    - key: remote-kvs-mender
      url: https://your-remote.example.com/mend
      auth:
        appSystemToken: true                  # ← required
permissions:
  scopes:
    - storage:app                              # ← required
    - read:app-system-token                    # ← required
app:
  id: ari:cloud:ecosystem::app/YOUR-APP-ID
```

Two scopes plus `appSystemToken: true` on the endpoint. Without all three, the token isn't issued.

## Setup — token handoff

When Atlassian invokes your remote endpoint, it sends:

```
POST https://your-remote.example.com/mend
x-forge-oauth-system: <bearer-token>
Content-Type: application/json

{ ... your payload ... }
```

The token has a 55+ minute validity. Forward it as `Authorization: Bearer <token>` to `https://api.atlassian.com/forge/storage/kvs/v1/...`.

Cleaning script shape (your Node migration script is the "remote" being invoked):

```javascript
const https = require("https");

async function mendKvs(payload, systemToken) {
  // Pull keys to fix from `payload`, compute new values, then:
  for (const update of payload.updates) {
    await kvsPost("/set", { key: update.key, value: update.value }, systemToken);
  }
}

function kvsPost(path, body, token) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request({
      hostname: "api.atlassian.com",
      path: `/forge/storage/kvs/v1${path}`,
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data),
      },
    }, (res) => {
      let buf = "";
      res.on("data", (c) => (buf += c));
      res.on("end", () => {
        if (res.statusCode >= 400) reject(new Error(`KVS ${res.statusCode}: ${buf}`));
        else resolve(buf ? JSON.parse(buf) : null);
      });
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}
```

## KVS REST surface

| Operation | Path | Body |
|---|---|---|
| `get` | `POST /forge/storage/kvs/v1/get` | `{ key: "..." }` |
| `set` | `POST /forge/storage/kvs/v1/set` | `{ key: "...", value: {...} }` |
| `delete` | `POST /forge/storage/kvs/v1/delete` | `{ key: "..." }` |
| `list-keys` | `POST /forge/storage/kvs/v1/list-keys` | `{ prefix: "...", limit: 100, cursor: "..." }` |
| `batch-set` | `POST /forge/storage/kvs/v1/batch-set` | `{ items: [{key, value}, ...] }` (≤100) |
| `batch-delete` | `POST /forge/storage/kvs/v1/batch-delete` | `{ keys: ["...", ...] }` (≤100) |

Use `list-keys` to paginate through your app's storage. The response includes `cursor`; pass it on the next call. Response is **eventually consistent** — see below.

## Consistency model

| Operation | Consistency |
|---|---|
| `set` | Strictly consistent — the value is durable on return |
| `get` | Strictly consistent — returns the latest write |
| `query` / `list-keys` | **Eventually consistent** — may return stale or missing keys for a few seconds after `set` |

The trap: **never read-then-write on the same key via `query`**. Use `get` for read-then-write workflows:

```javascript
// BAD — eventually-consistent read
const items = await kvsPost("/list-keys", { prefix: "user:" });
for (const item of items) await kvsPost("/set", { key: item.key, value: { ... } });
//   ^ if you just wrote to user:557 a moment ago, list-keys might not see it yet

// GOOD — strictly-consistent read
const current = await kvsPost("/get", { key: "user:557" });
await kvsPost("/set", { key: "user:557", value: { ...current, theme: "dark" } });
```

## Error codes

| Code | Meaning |
|---|---|
| `KEY_TOO_LONG` | KVS keys are limited to 255 bytes. Truncate or hash. |
| `MAX_DEPTH` | Nested value structures are limited (~10 levels). Flatten. |
| `RATE_LIMIT_EXCEEDED` | Honor `Retry-After`; default backoff is 5s. |
| `INVALID_VALUE` | Value isn't JSON-serializable or contains unsupported types (functions, undefined, etc.). |
| `KEY_NOT_FOUND` | (on `get`) — not an error per se; check status before parsing. |

## Plan→Sync→Audit for KVS

A KVS mending script follows the same triad:

**Plan**: list all keys, identify those referencing old IDs, build a CSV.
```javascript
let cursor = null;
do {
  const page = await kvsPost("/list-keys", { prefix: "", limit: 100, cursor });
  for (const key of page.keys) {
    const value = await kvsPost("/get", { key });
    if (needsMend(value)) planManager.addEntry(key, { oldValue: value, newValue: mend(value, idMap) });
  }
  cursor = page.cursor;
} while (cursor);
```

**Sync**: read plan, batch-set 100 keys at a time.
```javascript
const updates = pending.map(([, e]) => ({ key: e.key, value: e.newValue }));
for (let i = 0; i < updates.length; i += 100) {
  await kvsPost("/batch-set", { items: updates.slice(i, i + 100) });
}
```

**Audit**: re-fetch sample, compare.
```javascript
const item = await kvsPost("/get", { key });
if (JSON.stringify(item) !== JSON.stringify(plan.entries[key].newValue)) {
  // record FAIL
}
```

## Local development

For local testing, you can run the Forge function with `forge tunnel` and let Atlassian route a test invocation to your laptop. The system token is real, scoped to the test environment. Don't develop directly against `production` — use `staging` or `development` environments.

## When NOT to use this pattern

- **Per-user data** that you'd rather rebuild from a settings UI than mend wholesale.
- **High-cardinality keys** (>1M) — KVS isn't a data warehouse. Consider whether you should be using a real database for that data instead.
- **Hot-path reads during the migration** — KVS query latency is ~50–200ms; doing it from a migration script that runs once is fine; doing it for every user request is not.

## See also

- [`atlassian-jira-forge-skill/docs/24-production-patterns.md`](../../atlassian-jira-forge-skill/docs/24-production-patterns.md) — Forge-side KVS patterns
- [Atlassian: Accessing Forge storage from a remote](https://developer.atlassian.com/platform/forge/remote/accessing-storage/)
- [`24-production-patterns.md`](24-production-patterns.md) — pattern 10 (Forge KVS bulk write)
