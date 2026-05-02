# Production Patterns

Production-tested patterns lifted from two shipping Forge apps: **PPM Pro** (Project-Portfolio-Management, sharded plans with thousands of issues, multi-user concurrency) and **CogniRunner** (AI-powered workflow validators / post-functions, async LLM calls, capability-token attachment bridge). Each pattern lists the problem it solves, a copy-pasteable code excerpt, and a source pointer.

Use these as templates for non-trivial Forge work — they encode lessons that are hard to find in the official docs.

## Index

1. [KVS sharding for >100-item collections](#1-kvs-sharding-for-100-item-collections)
2. [Two-pass dependency filtering](#2-two-pass-dependency-filtering)
3. [Exponential backoff with jitter](#3-exponential-backoff-with-jitter)
4. [Chunked write-back with lock refresh](#4-chunked-write-back-with-lock-refresh)
5. [Drafts + write-locks for multi-user concurrency](#5-drafts--write-locks-for-multi-user-concurrency)
6. [Capability-token web triggers](#6-capability-token-web-triggers)
7. [Async-queue offload for >25 s work](#7-async-queue-offload-for-25-s-work)
8. [Multi-provider AI key storage](#8-multi-provider-ai-key-storage)
9. [Fail-open workflow validators](#9-fail-open-workflow-validators)
10. [Workflow injection (programmatic rule add)](#10-workflow-injection-programmatic-rule-add)
11. [Hourly lazy-refresh scheduled trigger](#11-hourly-lazy-refresh-scheduled-trigger)
12. [Resolver registration as factory functions](#12-resolver-registration-as-factory-functions)

---

## 1. KVS sharding for >100-item collections

**Problem:** A single KVS value is capped at 240 KiB. A "plan" or "project" with hundreds of issues blows the cap immediately. Reads and writes are also rate-limited per key (12 MB/s read, 1 MB/s write), so a hot key throttles before you hit the size cap.

**Pattern:** Deterministically shard items into `SHARD_SIZE`-sized buckets. Maintain a single `index` value mapping `key → shardIdx`. Reads batch shards in parallel. Writes update only the shards that changed.

```javascript
// src/services/kvs-store.js
import { kvs } from '@forge/kvs';

export const SHARD_SIZE = 100;

export const keys = {
  planMeta:  (planId) => `p:${planId}:meta`,
  planIndex: (planId) => `p:${planId}:idx`,            // { issueKey: shardIdx, ... }
  planShard: (planId, i) => `p:${planId}:s:${i}`,      // [issue, issue, ...]
};

export async function getIssuesByKeys(planId, issueKeys) {
  const index = await kvs.get(keys.planIndex(planId)) ?? {};

  // Group keys by shard
  const groups = new Map();
  for (const k of issueKeys) {
    const i = index[k];
    if (i === undefined) continue;
    if (!groups.has(i)) groups.set(i, new Set());
    groups.get(i).add(k);
  }

  // Parallel batched reads (5 shards/batch keeps us under per-key rate limits)
  const results = new Map();
  const entries = [...groups.entries()];
  for (let i = 0; i < entries.length; i += 5) {
    const batch = entries.slice(i, i + 5);
    await Promise.all(batch.map(async ([shardIdx, wanted]) => {
      const shard = await kvs.get(keys.planShard(planId, shardIdx)) ?? [];
      for (const issue of shard) {
        if (wanted.has(issue.key)) results.set(issue.key, issue);
      }
    }));
  }
  return results;
}
```

**When to apply:**
- Any logical collection that may exceed ~200 items.
- Hot keys where you observe `RATE_LIMIT_EXCEEDED`.
- When you need partial updates (rewrite one shard, not the whole collection).

**Shard size tradeoff:**
- Smaller shards = more parallelism but more KVS calls and bookkeeping.
- Larger shards = fewer reads but slower per-shard writes and risk of size cap.
- 100 items / shard is a good default for issue-shaped objects (~1–2 KiB each).

**Source:** PPM Pro `src/services/kvs-store.js`, `src/services/kvs-keys.js`.

---

## 2. Two-pass dependency filtering

**Problem:** When importing a graph (issues with predecessors / successors / parents), naive serialization stores cross-graph edges that point outside the imported set. The result is bloat and broken references.

**Pattern:** First pass collects all keys in the imported set. Second pass filters each item's relations to only those in the set.

```javascript
// src/services/indexing/issue-transformer.js
export function transformIssues(rawIssues, config = {}) {
  // Pass 1: collect every key in the input set
  const inSet = new Set(rawIssues.map((i) => i.key));

  // Pass 2: transform each item, filtering relations to in-set keys
  const out = new Map();
  for (const raw of rawIssues) {
    out.set(raw.key, transformIssue(raw, inSet, config));
  }
  return out;
}

function transformIssue(raw, inSet, config) {
  return {
    key: raw.key,
    summary: raw.fields.summary,
    predecessors: extractDeps(raw, 'inward').filter((k) => inSet.has(k)),
    successors:   extractDeps(raw, 'outward').filter((k) => inSet.has(k)),
    parent:       raw.fields.parent?.key && inSet.has(raw.fields.parent.key)
                  ? raw.fields.parent.key
                  : null,
    children:     (raw.fields.subtasks ?? [])
                  .map((s) => s.key)
                  .filter((k) => inSet.has(k)),
  };
}
```

**When to apply:** Anytime you serialize a graph from a larger source (Jira project, external system) into a Forge-stored subset.

**Source:** PPM Pro `src/services/indexing/issue-transformer.js`.

---

## 3. Exponential backoff with jitter

**Problem:** `429 Too Many Requests` from Jira REST. Naive retries thunder against the limit and never recover. Naive uniform delay synchronizes all retriers.

**Pattern:** Honor `Retry-After` if present. Otherwise exponential backoff (`base × 2^attempt`) with multiplicative jitter (×0.7–1.3). Cap at a sensible ceiling (30 s).

```javascript
// src/services/jira-client.js
const RETRY_ATTEMPTS    = 4;
const BASE_RETRY_DELAY  = 2000;   // ms
const MAX_RETRY_DELAY   = 30000;  // ms

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function requestWithRetry(requestFn, contextLabel = '') {
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    let response;
    try {
      response = await requestFn();
    } catch (err) {
      if (attempt === RETRY_ATTEMPTS) throw err;
      const delay = jitter(BASE_RETRY_DELAY * 2 ** (attempt - 1));
      await sleep(Math.min(delay, MAX_RETRY_DELAY));
      continue;
    }

    if (response.ok) return response;

    if (response.status === 429) {
      const ra = response.headers?.get('Retry-After');
      const baseDelay = ra
        ? Math.min(parseInt(ra, 10) * 1000, MAX_RETRY_DELAY)
        : BASE_RETRY_DELAY * 2 ** (attempt - 1);
      if (attempt === RETRY_ATTEMPTS) {
        throw new Error(`429 after ${RETRY_ATTEMPTS} attempts (${contextLabel})`);
      }
      await sleep(Math.min(jitter(baseDelay), MAX_RETRY_DELAY));
      continue;
    }

    throw new Error(`HTTP ${response.status} (${contextLabel})`);
  }
}

function jitter(ms) {
  return ms * (0.7 + Math.random() * 0.6); // 0.7–1.3×
}
```

**When to apply:** Every external call that can rate-limit — Jira REST, OpenAI, Slack, etc. Wrap your client once, use everywhere.

**Source:** PPM Pro `src/services/jira-client.js`.

---

## 4. Chunked write-back with lock refresh

**Problem:** A user clicks "Save 200 changes." Per-issue Jira write limits (~20/2 s) and the 25 s function timeout mean you can't write all 200 in one resolver invocation. Multi-user environments need a write lock so two users don't clobber each other.

**Pattern:** UI calls `writeChunk(offset)` repeatedly. Each call writes a fixed slice (10 issues), pauses 250 ms between writes, and refreshes the lock TTL. UI repeats until `isComplete: true`.

```javascript
// src/resolvers/write-resolvers.js
const WRITE_CHUNK_SIZE = 10;
const WRITE_DELAY_MS   = 250;   // ~4 writes/sec, well under 20/2s limit

export function registerWriteResolvers(resolver) {
  resolver.define('writeChunk', async ({ payload, context }) => {
    const { planId, changes, offset = 0 } = payload;
    const slice = changes.slice(offset, offset + WRITE_CHUNK_SIZE);

    const out = { written: 0, failed: 0, errors: [] };
    for (let i = 0; i < slice.length; i++) {
      const change = slice[i];
      try {
        const fields = buildFieldsPayload(change);
        if (Object.keys(fields).length > 0) {
          await updateIssue(change.issueKey, fields);
          out.written++;
        }
      } catch (err) {
        out.failed++;
        out.errors.push({ issueKey: change.issueKey, error: err.message });
      }
      if (i < slice.length - 1) await sleep(WRITE_DELAY_MS);
    }

    await refreshLock(planId, context.accountId);

    const nextOffset = offset + WRITE_CHUNK_SIZE;
    return {
      success: true,
      ...out,
      offset: nextOffset,
      isComplete: nextOffset >= changes.length,
    };
  });
}
```

UI side:

```javascript
let offset = 0;
let isComplete = false;
while (!isComplete) {
  const r = await invoke('writeChunk', { planId, changes, offset });
  offset = r.offset;
  isComplete = r.isComplete;
  setProgress({ done: offset, total: changes.length });
}
```

**Source:** PPM Pro `src/resolvers/write-resolvers.js`.

---

## 5. Drafts + write-locks for multi-user concurrency

**Problem:** Two users editing the same plan / config / record. Last-writer-wins silently drops the first user's work.

**Pattern:** Per-user *drafts* let multiple users edit simultaneously without conflict. A *write lock* gates the actual save. Before saving, check for *overlapping drafts* — drafts that touch the same items the current user is about to write — and surface the conflict in the UI.

```javascript
// src/services/concurrency/write-lock.js
import { kvs } from '@forge/kvs';

const LOCK_TTL_MS = 5 * 60 * 1000;

export async function acquireLock(planId, accountId, displayName) {
  const existing = await kvs.get(`p:${planId}:lock`);
  if (existing && existing.accountId !== accountId) {
    if (Date.now() < new Date(existing.expiresAt).getTime()) {
      return { acquired: false, holder: existing };
    }
  }
  await kvs.set(`p:${planId}:lock`, {
    accountId, displayName,
    expiresAt: new Date(Date.now() + LOCK_TTL_MS).toISOString(),
  });
  return { acquired: true };
}

export async function refreshLock(planId, accountId) {
  const lock = await kvs.get(`p:${planId}:lock`);
  if (lock?.accountId === accountId) {
    lock.expiresAt = new Date(Date.now() + LOCK_TTL_MS).toISOString();
    await kvs.set(`p:${planId}:lock`, lock);
  }
}
```

```javascript
// src/services/concurrency/draft-manager.js
export async function checkDraftOverlaps(planId, currentAccountId, issueKeys) {
  const registry = await kvs.get(`p:${planId}:drafts`) ?? {};
  const wanted = new Set(issueKeys);
  const overlaps = [];
  for (const [accountId, entry] of Object.entries(registry)) {
    if (accountId === currentAccountId) continue;
    const overlapping = (entry.issueKeys ?? []).filter((k) => wanted.has(k));
    if (overlapping.length) {
      overlaps.push({
        accountId,
        displayName: entry.displayName,
        overlappingKeys: overlapping,
      });
    }
  }
  return { hasOverlap: overlaps.length > 0, overlaps };
}
```

**Why these specific numbers:**
- **5-minute lock TTL** is a safety net for abandoned tabs, not a real timeout. Refresh on every `writeChunk`.
- **Per-user drafts** are stored individually (`p:{id}:d:{accountId}`), but a lightweight registry (`p:{id}:drafts`) lets you poll for conflicts without reading every draft.

**Source:** PPM Pro `src/services/concurrency/{write-lock.js, draft-manager.js}`.

---

## 6. Capability-token web triggers

**Problem:** A web trigger URL is public — anyone with it can hit the endpoint. You need to grant a *narrow, time-limited* capability to a single caller (e.g. "this user can read attachment X for the next 10 minutes").

**Pattern:** Two-secret tokens. A 256-bit `t` query parameter and a 256-bit `Authorization: Bearer …` header. Both are stored in KVS along with a server-side **operation pin** (which issue, which attachment, which actor). The token is single-use: deleted from KVS *before* the heavy fetch so a stuck downstream can't replay it.

```javascript
import { randomBytes, timingSafeEqual } from 'crypto';
import { kvs } from '@forge/kvs';

const TOKEN_PREFIX = 'cap_token:';
const TTL_MS = 10 * 60 * 1000;

export async function mintCapability({ operation, issueKey, actorAccountId }) {
  const token  = randomBytes(32).toString('base64url');
  const bearer = randomBytes(32).toString('base64url');
  const record = {
    operation, issueKey, actorAccountId, bearer,
    expiresAt: Date.now() + TTL_MS,
  };
  await kvs.set(TOKEN_PREFIX + token, record, {
    ttl: { unit: 'SECONDS', value: TTL_MS / 1000 },
  });
  return {
    url: `${await webtriggerUrl()}?t=${token}`,
    authHeader: `Bearer ${bearer}`,
  };
}

export async function handleCapability(event) {
  const url = new URL(event.url);
  const token = url.searchParams.get('t');
  const bearer = (event.headers?.authorization ?? '').replace(/^Bearer\s+/i, '');
  if (!token || !bearer) return { statusCode: 401 };

  const record = await kvs.get(TOKEN_PREFIX + token);
  if (!record) return { statusCode: 401 };

  // Single-use: delete BEFORE the slow downstream call
  await kvs.delete(TOKEN_PREFIX + token);

  if (Date.now() > record.expiresAt) return { statusCode: 401 };

  const a = Buffer.from(bearer);
  const b = Buffer.from(record.bearer);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { statusCode: 401 };

  // Capability is verified — perform the (server-side) operation
  return performOperation(record);
}
```

**Why two secrets, not one:**
- A URL-only token leaks via browser history, server logs, analytics.
- A header-only bearer can't be used in `<img>` or naive copy-paste.
- Requiring **both** means a leak from any single channel doesn't grant access.

**Why pin the operation server-side:**
The holder of a capability can never widen its scope. They asked for "read attachment 42 on issue X"; that's all they get, even if they edit the URL.

**Source:** CogniRunner `src/index.js` — `mintAttachmentToken`, `mintUploadToken`, `serveAttachment`. Implements the doc-processor MCP `uploadUrl` / `uploadAuthHeader` upload contract.

---

## 7. Async-queue offload for >25 s work

**Problem:** AI inference, long-running REST imports, or anything genuinely slow blows the 25-second resolver/trigger timeout.

**Pattern:** Resolver pushes a task to a queue and returns `{ taskId }`. A consumer (`timeoutSeconds` up to 900) does the work and writes the result to KVS keyed by `taskId`. The frontend polls a resolver until `status === 'done'`.

```javascript
// src/index.js
import Resolver from '@forge/resolver';
import { kvs } from '@forge/kvs';
import { Queue } from '@forge/events';

const queue = new Queue({ key: 'ai-jobs' });
const resolver = new Resolver();

resolver.define('startReview', async ({ payload, context }) => {
  const taskId = `${context.accountId}-${Date.now()}`;
  await kvs.set(`task:${taskId}`, { status: 'queued' });
  await queue.push({
    body: { taskId, params: payload },
    concurrency: { key: context.accountId, limit: 1 },
  });
  return { taskId };
});

resolver.define('getTaskStatus', async ({ payload }) =>
  (await kvs.get(`task:${payload.taskId}`)) ?? null
);

export const handler = resolver.getDefinitions();
```

```javascript
// src/async-handler.js
import { kvs } from '@forge/kvs';

export async function consume(event) {
  const { taskId, params } = event.body;
  await kvs.set(`task:${taskId}`, { status: 'processing' });

  try {
    const result = await runReview(params);   // can take minutes
    await kvs.set(`task:${taskId}`, {
      status: 'done', result, finishedAt: new Date().toISOString(),
    });
  } catch (err) {
    await kvs.set(`task:${taskId}`, { status: 'failed', error: err.message });
  }
}
```

```yaml
# manifest.yml
modules:
  consumer:
    - key: ai-consumer
      queue: ai-jobs
      function: consume
  function:
    - key: consume
      handler: async-handler.consume
      timeoutSeconds: 120
```

**Source:** CogniRunner `src/async-handler.js`. See template `templates/async-queue-consumer.yml`.

---

## 8. Multi-provider AI key storage

**Problem:** Users may use OpenAI, Anthropic, Azure, OpenRouter, or self-hosted models. They want to switch providers without losing previously-configured keys. They also want a marketplace fallback (env var) for users who don't bring their own key.

**Pattern:** Per-provider KVS slots. In-memory cache (per Forge invocation) avoids re-reading on every call. Cache invalidated on save. `process.env.*` fallback for marketplace distribution.

```javascript
// src/index.js
import { kvs } from '@forge/kvs';

const PROVIDERS = {
  openai:     { baseUrl: 'https://api.openai.com/v1' },
  anthropic:  { baseUrl: 'https://api.anthropic.com/v1' },
  azure:      { baseUrl: null },              // user-provided
  openrouter: { baseUrl: 'https://openrouter.ai/api/v1' },
};

const slot      = (p) => `COGNIRUNNER_KEY_${p}`;
const modelSlot = (p) => `COGNIRUNNER_MODEL_${p}`;

let _cachedKey = null;
let _cachedKeyChecked = false;

export async function getApiKey() {
  if (_cachedKeyChecked) return _cachedKey ?? process.env.OPENAI_API_KEY;
  try {
    const provider = (await kvs.get('COGNIRUNNER_AI_PROVIDER')) ?? 'openai';
    let key = await kvs.get(slot(provider));
    if (!key) {
      // Migrate from a single legacy slot for backward compat
      const legacy = await kvs.get('COGNIRUNNER_OPENAI_API_KEY');
      if (legacy) key = legacy;
    }
    _cachedKey = key;
  } catch {
    _cachedKey = null;
  }
  _cachedKeyChecked = true;
  return _cachedKey ?? process.env.OPENAI_API_KEY;
}

export async function saveApiKey(provider, key) {
  await kvs.setSecret(slot(provider), key);
  _cachedKeyChecked = false;   // force re-read next time
  _cachedKey = null;
}
```

**Why this layout:**
- Switching `provider` doesn't delete the old provider's key — switching back is instant.
- Cache is *per Forge invocation*; each cold start re-reads (Forge is stateless across invocations).
- `setSecret` encrypts at rest; `set` doesn't.

**Source:** CogniRunner `src/index.js` — `getProviderConfig`, `getOpenAIKey`.

---

## 9. Fail-open workflow validators

**Problem:** Your validator depends on an external API (LLM, CRM, etc.). The dependency goes down. Without care, *every* Jira transition for *every* user is now blocked until the dependency comes back.

**Pattern:** In the `catch` block of an external-dependency validator, return `{ result: true }` — let the transition proceed. Log the failure but never block on infrastructure.

```javascript
// src/index.js
export const validate = async ({ issue, configuration, context }) => {
  // 1. Required: license check, allow if license inactive
  if (!context?.license?.active) return { result: true };

  // 2. Allow if missing config (admin hasn't set up the rule fully)
  if (!configuration?.fieldId || !configuration?.prompt) return { result: true };

  try {
    const result = await callExternalValidator(issue, configuration);
    return result.isValid
      ? { result: true }
      : { result: false, errorMessage: result.reason };
  } catch (err) {
    console.error('[validate] external check failed; failing open', err);
    return { result: true };   // <-- never block on app failure
  }
};
```

**Don't fail-open for:**
- Compliance / regulatory checks where a missing validation is itself a violation.
- Internal-only checks where the dependency is your own KVS (already inside Forge).

**Do fail-open for:**
- Calls to external services (LLMs, CRMs, third-party APIs).
- Calls dependent on user-provided credentials that may have been revoked.
- Anything that degrades user experience when broken.

**Bonus: deadline guard.**

```javascript
const deadline = Date.now() + 22_000; // 3s buffer below 25s
async function maybe(fn) {
  if (Date.now() > deadline) {
    return { result: true };   // out of time → fail open
  }
  return fn();
}
```

**Source:** CogniRunner `src/index.js` — `validate`, `executeSemanticPostFunction`.

---

## 10. Workflow injection (programmatic rule add)

**Problem:** You want your app to auto-attach a validator/condition/post-function to a workflow without making the admin click into the workflow editor. Jira's workflow API requires a *full-replacement POST* — you can't PATCH a single transition.

**Pattern:** GET the workflow with all transitions expanded. Modify the transitions array in memory to add your rule. POST the entire workflow definition back. Mind every transition (omitting one breaks it) and the mandatory `system:update-issue-status` post-function.

```javascript
import api, { route } from '@forge/api';

export async function injectValidator(workflowName, transitionId, ruleConfig, appAri) {
  // 1. GET workflow with transitions expanded
  const sr = await api.asApp().requestJira(
    route`/rest/api/3/workflows/search?queryString=${workflowName}&expand=values.transitions`
  );
  const { values: workflows } = await sr.json();
  const wf = workflows.find((w) => w.name === workflowName); // search is fuzzy
  if (!wf) throw new Error(`Workflow "${workflowName}" not found`);

  // 2. Find the transition and append the rule
  const t = wf.transitions.find((t) => t.id === transitionId);
  if (!t) throw new Error(`Transition ${transitionId} not in ${workflowName}`);
  t.validators = t.validators ?? [];
  t.validators.push({
    ruleKey: 'forge:expression-validator',
    parameters: {
      extension: `${appAri}/static/${ruleConfig.moduleKey}`,
      ...ruleConfig.parameters,
    },
  });

  // 3. POST the ENTIRE workflow back. Missing fields = broken transitions.
  const ur = await api.asApp().requestJira(route`/rest/api/3/workflows/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      workflows: [{
        name: wf.name,
        version: wf.version,
        description: wf.description,
        transitions: wf.transitions,        // ALL of them
        statuses: wf.statuses,
        statusMappings: wf.statusMappings,
      }],
    }),
  });
  if (!ur.ok) throw new Error(`Workflow update failed: ${await ur.text()}`);
}
```

**Gotchas:**
- Workflow `search` is a *partial-match fuzzy search* — filter by exact name in code.
- `version` must match the current server version, or you'll get a stale-update error. Re-GET on conflict.
- Status references vary across API versions: `toStatusReference`, `t.to.statusReference`, plain strings — try them in fallback order.
- Omitting `system:update-issue-status` from a transition's post-functions silently breaks the transition.

**Source:** CogniRunner `src/index.js` — `injectWorkflowRule`.

---

## 11. Hourly lazy-refresh scheduled trigger

**Problem:** A scheduled trigger that re-indexes every plan every hour wastes KVS reads and CPU. Most plans haven't changed.

**Pattern:** Check `lastIndexedAt` and skip plans that are recent (use 55 min threshold so an "hourly" trigger doesn't edge-loop). Skip in-flight plans (status `'writing'` or `'indexing'`).

```javascript
// src/triggers/scheduled-refresh.js
import { kvs } from '@forge/kvs';

const STALE_THRESHOLD_MS = 55 * 60 * 1000;  // not 60min — avoids edge re-loops

export async function onScheduledRefresh() {
  const plans = (await kvs.get('plans:list')) ?? [];
  const now = Date.now();

  for (const plan of plans) {
    const meta = await kvs.get(`p:${plan.id}:meta`);
    if (!meta) continue;

    if (meta.status === 'writing' || meta.status === 'indexing') continue;

    const last = new Date(meta.lastIndexedAt ?? 0).getTime();
    if (now - last < STALE_THRESHOLD_MS) continue;

    await refreshPlan(plan.id);
  }
}
```

**Source:** PPM Pro `src/triggers/scheduled-refresh.js`.

---

## 12. Resolver registration as factory functions

**Problem:** Putting all resolver definitions in one file works for ten handlers, breaks down at fifty. But splitting into many files often means many `Resolver` instances and many manifest entries.

**Pattern:** One `Resolver` instance, multiple module-scoped *register functions* that each call `resolver.define(...)` for their domain. Keeps the resolver tree flat in the manifest while allowing per-domain organization in source.

```javascript
// src/index.js
import Resolver from '@forge/resolver';
import { registerPlanResolvers } from './resolvers/plan-resolvers';
import { registerWriteResolvers } from './resolvers/write-resolvers';
import { registerAdminResolvers } from './resolvers/admin-resolvers';

const resolver = new Resolver();

registerPlanResolvers(resolver);
registerWriteResolvers(resolver);
registerAdminResolvers(resolver);

export const handler = resolver.getDefinitions();
```

```javascript
// src/resolvers/write-resolvers.js
export function registerWriteResolvers(resolver) {
  resolver.define('writeChunk', async ({ payload, context }) => { /* ... */ });
  resolver.define('saveDraft',  async ({ payload, context }) => { /* ... */ });
  resolver.define('discardDraft', async ({ payload, context }) => { /* ... */ });
}
```

**Why factory functions, not module-level instances:**
- Forge bundles a single entry point. Multiple `Resolver` instances mean you have to `getDefinitions()` from each, which complicates manifest module mapping.
- Factory functions are easy to test (pass a mock resolver, assert which keys got defined).
- Hot-paths can share helpers (a domain's `kvsStore` cache, etc.) at the file scope.

**Source:** PPM Pro `src/resolvers/*.js`, `src/index.js`.

---

## See also

- `26-async-events-and-queues.md` — full `@forge/events` reference
- `27-faas-limits-and-cost.md` — quotas these patterns work around
- `19-rate-limit-handling.md` — rate-limit deep dive
- `templates/async-queue-consumer.yml`, `templates/capability-token-webtrigger.yml` — copy-paste skeletons for patterns 6 and 7
