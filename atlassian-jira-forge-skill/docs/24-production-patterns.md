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
13. [Concurrency deep-dive: stale-draft invalidation + cleanup](#13-concurrency-deep-dive-stale-draft-invalidation--cleanup)
14. [Chunked write-back with a post-write VERIFY step](#14-chunked-write-back-with-a-post-write-verify-step)
15. [Two-engine parity (backend authoritative + frontend mirror)](#15-two-engine-parity-backend-authoritative--frontend-mirror)
16. [Layered config loader, loaded fresh per invocation](#16-layered-config-loader-loaded-fresh-per-invocation)
17. [KVS cost control (zero writes during edit)](#17-kvs-cost-control-zero-writes-during-edit)
18. [Issue-link inward/outward semantics](#18-issue-link-inwardoutward-semantics)
19. [Custom-field auto-setup: the 4-step screen chain](#19-custom-field-auto-setup-the-4-step-screen-chain)
20. [Field-screen warning preflight](#20-field-screen-warning-preflight)

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

## 13. Concurrency deep-dive: stale-draft invalidation + cleanup

**Problem:** Patterns 4–5 set up drafts + locks. But after user A writes, user B's draft now describes a world that no longer exists. And abandoned drafts accumulate forever.

**Pattern:** After a successful write-back, **flag overlapping drafts stale** (don't delete — the owner should see *why* their draft is invalid). On plan load, **garbage-collect** drafts older than 24 h. The write lock has a **5-min TTL refreshed per chunk** (pattern 4), so an abandoned tab self-heals.

```javascript
// src/services/concurrency/draft-manager.js
export async function invalidateStaleDrafts(planId, writerAccountId, writtenKeys) {
  const registry = await kvsStore.getDraftsRegistry(planId);   // p:{id}:drafts
  const written = new Set(writtenKeys);
  for (const [accountId, entry] of Object.entries(registry)) {
    if (accountId === writerAccountId) continue;
    if ((entry.issueKeys || []).some((k) => written.has(k))) {
      const draft = await kvsStore.getDraft(planId, accountId);
      if (draft) {
        draft.stale = true;
        draft.staleReason = `Issues were written by another user at ${new Date().toISOString()}`;
        await kvsStore.saveDraft(planId, accountId, draft);
      }
      entry.stale = true;                                       // mirror on the lightweight registry
    }
  }
  await kvsStore.saveDraftsRegistry(planId, registry);
}

const MAX_AGE_MS = 24 * 60 * 60 * 1000;                         // 24h GC on load
export async function cleanupExpiredDrafts(planId) {
  const registry = await kvsStore.getDraftsRegistry(planId);
  const now = Date.now();
  for (const [accountId, entry] of Object.entries(registry)) {
    if (now - new Date(entry.timestamp || 0).getTime() > MAX_AGE_MS || entry.stale) {
      await kvsStore.deleteDraft(planId, accountId).catch(() => {});
      delete registry[accountId];
    }
  }
  await kvsStore.saveDraftsRegistry(planId, registry);
}
```

**TOCTOU caveat (important):** `acquireLock` does check-then-set, but **Forge KVS has no atomic compare-and-set**, so two users who pass the check in the same window can both `setLock` — last write wins. SE-PPM narrows (does not eliminate) the race with an **acquire-then-reread** backstop:

```javascript
// se-ppm src/services/concurrency/write-lock.js (lines 44-50)
await kvsStore.setLock(planId, lockData);
const confirm = await kvsStore.getLock(planId);       // re-read after writing
if (confirm && confirm.accountId !== accountId) {
  return { acquired: false, holder: confirm };        // someone else's write landed last → lost the race
}
return { acquired: true };
```

This is a documented limitation — true safety would need a CAS primitive Forge KVS doesn't expose. `completeWrite` re-reads the holder before finishing as a second backstop.

**Source:** lz-ppm-forge / se-ppm-forge `src/services/concurrency/{draft-manager,write-lock}.js`. See `gotchas.md` for the TOCTOU note.

---

## 14. Chunked write-back with a post-write VERIFY step

**Problem:** Pattern 4 writes issues in chunks. But a write can be **silently dropped** — a validator, automation rule, or screen config can reject a field without surfacing an error to the REST caller. The user thinks their schedule was applied; it wasn't.

**Pattern:** After writing, **re-fetch the written issues and compare intended vs actual**. Normalise so "no value" forms compare equal, and compare *every load-bearing field*, not just the obvious ones.

```javascript
// src/resolvers/write-resolvers.js — verifyWrittenIssues
async function verifyWrittenIssues(planId, writtenKeys) {
  if (writtenKeys.length === 0) return { verified: 0, mismatches: [] };
  const fresh = await jiraClient.bulkFetch(writtenKeys);   // POST /rest/api/3/issue/bulkfetch
  const mismatches = [];
  for (const key of writtenKeys) {
    const expected = await kvsStore.getIssue(planId, key); // intended values (verify runs BEFORE re-index)
    const got = fresh.get(key);
    const diff = {};
    if (normDate(got.startDate) !== normDate(expected.startDate)) { diff.startDate = { expected: expected.startDate, actual: got.startDate }; }
    if (normDate(got.dueDate)   !== normDate(expected.dueDate))   { diff.dueDate   = { expected: expected.dueDate,   actual: got.dueDate }; }
    if (normDur(got.duration)   !== normDur(expected.duration))   { diff.duration  = { expected: expected.duration,  actual: got.duration }; } // load-bearing — a silently-dropped duration used to pass unnoticed
    if (Object.keys(diff).length) mismatches.push({ key, diff });
  }
  return { verified: writtenKeys.length - mismatches.length, mismatches };
}
```

**Throughput:** with `WRITE_CHUNK_SIZE=10` + `WRITE_DELAY_MS=250` (pattern 4) you write **~10–13 issues/s**, comfortably under Jira's ~50/s ceiling and the per-issue ~20/2 s limit. Surface `mismatches` in the UI so the user knows exactly which issues didn't take.

**Source:** lz-ppm-forge `src/resolvers/write-resolvers.js` (`verifyWrittenIssues`, `completeWrite`).

---

## 15. Two-engine parity (backend authoritative + frontend mirror)

**Problem:** A Gantt UI computes a *preview* of a schedule edit in the browser (instant feedback, zero KVS writes during drag), then the backend recomputes the *authoritative* result on Apply. If the two diverge, the user sees one thing and Apply writes another — a trust-destroying bug.

**Pattern:** The frontend preview must be a **fixed point** of the backend engine — same inputs, identical outputs. SE-PPM keeps the schedule math in `src/services/calculation/*` (authoritative) and a faithful mirror in the browser (`utils/user-intent.js` mirrors `services/calculation/user-intent.js`, same decision matrix, same `changeType` strings). The engine pipeline order is fixed and both sides follow it:

1. topological sort (processing order)
2. per issue: **iron-clad rule → user-intent → buffer logic**
3. cascade to successors (smart cascading)
4. parent roll-up from children
5. working-day snap throughout (duration is **working days**, 1-indexed: `duration === 1` ⇒ start == due)

**Prove it:** a Node **engine-parity harness** runs the frontend `utils/` mirror against `src/services/calculation/*` over all date primitives + the full user-intent matrix and must report identical results (last run **232/232**). Any scheduling-rule change must keep both 1:1, then prove `preview == applied` on a plan with dependencies, a buffer issue, and a parent roll-up.

**When to apply:** any app with optimistic client-side compute that a server later authoritatively redoes (schedulers, pricing, validation previews).

**Source:** se-ppm-forge `AGENTS.md` (Golden rules), `src/services/calculation/engine.js`, `static/ppm-ui/src/{hooks,utils}/`.

---

## 16. Layered config loader, loaded fresh per invocation

**Problem:** Field ids, link-type names, engine limits, and working-day calendars are all admin-configurable. Hard-coding them breaks on the next tenant; caching them in a module global breaks because **Forge functions are stateless** — a warm container may serve a *different* install.

**Pattern:** One `loadConfig()` that reads KVS and deep-merges over a `DEFAULTS` object, **called once per resolver invocation** and threaded through the pipeline. Never a global cache.

```javascript
// src/services/config-loader.js
const DEFAULTS = {
  fields: { startDate: 'customfield_10015', dueDate: 'duedate', rank: 'customfield_10019', /* ... */ },
  dependencies: { linkTypeName: 'Blocks', inwardDescription: 'is blocked by', outwardDescription: 'blocks' },
  engine: { maxCascadeDepth: 10, maxIssuesPerTraversal: 150 /* circuit breaker */ },
  indexing: { issuesPerShard: 100, batchSize: 5 },
  workingDays: { activeCalendar: 'standard', calendars: { standard: { days: [1,2,3,4,5] } } },
};

export async function loadConfig() {                       // call ONCE per invocation
  const [fieldCfg, engineCfg, wdCfg] = await Promise.all([
    storage.get(keys.fieldConfig()), storage.get('cfg:engine'), storage.get('cfg:working-days'),
  ]);
  return {
    fields: { ...DEFAULTS.fields, ...(fieldCfg || {}) },
    engine: { ...DEFAULTS.engine, ...(engineCfg?.engine || {}) },
    indexing: { ...DEFAULTS.indexing, ...(engineCfg?.indexing || {}) },
    workingDays: mergeWorkingDays(wdCfg),
  };
}
```

Offer lightweight variants (`loadFieldConfig`, `loadEngineConfig`) so a hot path doesn't read KVS keys it won't use.

**Source:** lz-ppm-forge `src/services/config-loader.js`.

---

## 17. KVS cost control (zero writes during edit)

**Problem:** A drag-heavy UI that writes to KVS on every interaction shreds the 1 MB/s-per-key write limit and runs up cost.

**Pattern:** Drive cost to near-zero with five rules lz-ppm follows:

- **Frontend-only editing** — drag/recalculate entirely in the browser (pattern 15); **zero KVS writes during the edit**.
- **Batch save on an explicit button** — one chunked write-back (pattern 14) when the user commits, not continuously.
- **Poll at 60 s, not 10 s** — multi-user awareness reads the lightweight drafts registry on a slow timer; realtime (`32-forge-realtime.md`) shortens perceived latency without more polling.
- **Lean issue model** — store ~15 fields per issue, truncate summaries (`maxSummaryLength: 80`), not the whole Jira issue.
- **Index-then-shard lookup** — one small index value maps `issueKey → shardIdx`; reads hit only the shards they need (pattern 1).

**Source:** lz-ppm-forge `src/services/{kvs-store,config-loader}.js`, `src/resolvers/write-resolvers.js`.

---

## 18. Issue-link inward/outward semantics

**Problem:** `POST /rest/api/3/issueLink` takes `inwardIssue` and `outwardIssue` and the mapping to "blocker/blocked" is counter-intuitive — get it backwards and every dependency points the wrong way.

**Pattern:** For a `Blocks` link, **`outwardIssue` is the blocker / predecessor** and **`inwardIssue` is the blocked / successor**. Wrap it so call sites read naturally, and **test against a real instance** — link-type direction wording varies per site.

```javascript
// src/services/jira-client.js
// outwardKey BLOCKS inwardKey  (outward = predecessor, inward = successor)
export async function createIssueLink(outwardKey, inwardKey, linkTypeName = 'Blocks') {
  return requestWithRetry(() => api.asApp().requestJira(route`/rest/api/3/issueLink`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: { name: linkTypeName },
      outwardIssue: { key: outwardKey },   // the blocker
      inwardIssue:  { key: inwardKey },    // the blocked
    }),
  }), `createLink ${outwardKey} blocks ${inwardKey}`);
}
```

The default link type names (`Blocks` / `is blocked by` / `blocks`) are themselves config (pattern 16) — don't hard-code the descriptions.

**Source:** lz-ppm-forge `src/services/jira-client.js` (`createIssueLink`, `findLinkId`).

---

## 19. Custom-field auto-setup: the 4-step screen chain

**Problem:** Creating a custom field via `POST /rest/api/3/field` is the easy part. A created field is **invisible until it's on a screen tab** — and finding the right edit screen per project is a four-hop traversal. Requires `manage:jira-configuration`.

**Pattern:** Create the field, then for each project walk the screen chain and `POST` the field onto the first tab of the edit screen (plus the Default Screen as a fallback for project types you missed):

```text
POST /rest/api/3/field                                              → fieldId
per project:
  1. GET /rest/api/3/issuetypescreenscheme/project?projectId={id}   → issueTypeScreenSchemeId
  2. GET /rest/api/3/issuetypescreenscheme/mapping
         ?issueTypeScreenSchemeId={id}                              → screenSchemeId (default mapping)
  3. GET /rest/api/3/screenscheme?id={screenSchemeId}              → screens.editIssue
  4. GET /rest/api/3/screens/{editScreenId}/tabs                   → first tab id
  5. POST /rest/api/3/screens/{editScreenId}/tabs/{tabId}/fields   → { fieldId }
fallback: also add to the Default Screen for any project type missed above
```

De-dupe processed screen ids (multiple projects share screens) so you don't `POST` the same field twice.

**Source:** lz-ppm-forge `src/services/field-setup.js` (`addFieldsToEditScreens`). See `29-custom-field-types.md` for the field *type* module.

---

## 20. Field-screen warning preflight

**Problem:** "Apply" can silently no-op if your fields aren't on a project's edit screen — the write succeeds at REST level but the field never lands (the silent-drop class verify step 14 catches *after* the fact). Better to warn *before* the user commits.

**Pattern:** Sample **one issue per project** via `GET /rest/api/3/issue/{key}/editmeta` and check the target fields appear in `editMeta.fields`. If a field is missing, warn the user that Apply would silently skip it for that project — and offer the auto-setup (pattern 19).

```javascript
const editMeta = await (await api.asApp().requestJira(
  route`/rest/api/3/issue/${sampleKey}/editmeta`, { headers: { Accept: 'application/json' } })).json();
const missing = targetFieldIds.filter((id) => !editMeta.fields[id]);
if (missing.length) warn(`These fields aren't on ${projectKey}'s edit screen and won't be written: ${missing.join(', ')}`);
```

`editmeta` also tells you each field's `operations` (must include `"set"`) and `schema` — the same pre-flight CogniRunner runs before a semantic post-function (`25-workflow-modules-deep-dive.md`).

**Source:** lz-ppm-forge field setup + CogniRunner `src/index.js` editmeta pre-flight.

---

## See also

- `26-async-events-and-queues.md` — full `@forge/events` reference
- `27-faas-limits-and-cost.md` — quotas these patterns work around
- `19-rate-limit-handling.md` — rate-limit deep dive
- `25-workflow-modules-deep-dive.md` — workflow rule internals (agentic validation, editmeta pre-flight)
- `31-forge-ai-and-llm.md` — cost guards + BYOK for AI patterns
- `32-forge-realtime.md` — live multi-user awareness on top of patterns 5/13/17
- `templates/async-queue-consumer.yml`, `templates/capability-token-webtrigger.yml` — copy-paste skeletons for patterns 6 and 7
