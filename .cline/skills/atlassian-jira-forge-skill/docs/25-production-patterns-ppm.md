# Production-Proven Forge + Jira Patterns

> Extracted from the PPM Pro Forge app (se-ppm-forge). Every pattern in this document has been deployed, tested in production against real Jira Cloud instances, and verified to work correctly. These are not theoretical examples — they are the actual implementations that power a plan management tool handling 285+ issues with dependency chains, sharded KVS storage, chunked write-back, and multi-user concurrency.

---

## Table of Contents

1. [Jira REST API Calls from Forge](#1-jira-rest-api-calls-from-forge)
2. [Forge KVS Sharded Storage](#2-forge-kvs-sharded-storage)
3. [Retry with Exponential Backoff and Jitter](#3-retry-with-exponential-backoff-and-jitter)
4. [Issue Search with POST /search/jql (Paginated)](#4-issue-search-with-post-searchjql-paginated)
5. [Bulk Fetch Issues](#5-bulk-fetch-issues)
6. [Update Issues with overrideScreenSecurity](#6-update-issues-with-overridescreensecurity)
7. [Jira Agile API: Board Issues and Ranking](#7-jira-agile-api-board-issues-and-ranking)
8. [Issue Links: Create, Find, Delete](#8-issue-links-create-find-delete)
9. [ADF Comments on Issues](#9-adf-comments-on-issues)
10. [Custom Field Creation and Screen Configuration](#10-custom-field-creation-and-screen-configuration)
11. [Forge Trigger: Issue Updated with Plan Protection](#11-forge-trigger-issue-updated-with-plan-protection)
12. [Chunked Write-Back with Locking](#12-chunked-write-back-with-locking)
13. [Concurrency: Drafts, Locks, Conflict Detection](#13-concurrency-drafts-locks-conflict-detection)
14. [Custom UI: Bridge Invoke Pattern](#14-custom-ui-bridge-invoke-pattern)
15. [Custom UI: Jira Bridge Modal](#15-custom-ui-jira-bridge-modal)
16. [Manifest Configuration: Multi-Module App](#16-manifest-configuration-multi-module-app)
17. [KVS Cost Control Strategies](#17-kvs-cost-control-strategies)

---

## 1. Jira REST API Calls from Forge

All Jira API calls in Forge use the `@forge/api` module. The `route` tagged template literal handles URL encoding. Always use `api.asApp()` for backend operations and `api.asUser()` only when you need the calling user's permissions.

```javascript
import api, { route } from '@forge/api';

// GET request — read issue data
const response = await api.asApp().requestJira(
  route`/rest/api/3/issue/${issueKey}?fields=summary,status,customfield_10015`
);
const data = await response.json();

// POST request — create resource
const response = await api.asApp().requestJira(
  route`/rest/api/3/issueLink`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: { name: 'Blocks' },
      outwardIssue: { key: 'PROJ-1' },
      inwardIssue: { key: 'PROJ-2' },
    }),
  }
);

// PUT request — update issue fields
const response = await api.asApp().requestJira(
  route`/rest/api/3/issue/${issueKey}?notifyUsers=false&overrideScreenSecurity=true`,
  {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: { duedate: '2026-05-15', customfield_10015: '2026-05-01' },
    }),
  }
);

// DELETE request — remove resource
await api.asApp().requestJira(
  route`/rest/api/3/issueLink/${linkId}`,
  { method: 'DELETE' }
);
```

**Key rules:**
- `route` is required — it prevents path traversal attacks and encodes parameters safely.
- `api.asApp()` runs with the app's OAuth scopes. `api.asUser()` runs with the current user's permissions.
- Always check `response.status` or `response.ok` before calling `.json()`.
- Jira returns empty body for DELETE (204) and some PUT (204) — do not call `.json()` on those.

---

## 2. Forge KVS Sharded Storage

Forge KVS has a 240KB per-key limit. For apps storing hundreds of objects (issues, records), you must shard the data across multiple keys. This pattern stores up to 100 items per shard with an index for O(1) lookups.

```javascript
import { kvs as storage } from '@forge/kvs';

const SHARD_SIZE = 100;

// Key schema — short prefixes stay under 500-char key limit
const keys = {
  planMeta:  (planId) => `p:${planId}:meta`,
  planIndex: (planId) => `p:${planId}:idx`,
  planShard: (planId, n) => `p:${planId}:s:${n}`,
};

// SAVE: shard items deterministically by sorted key
async function saveAllItems(planId, items) {
  // Sort keys deterministically for consistent shard assignment
  const sorted = [...items].sort((a, b) => a.key.localeCompare(b.key));
  
  const index = {};    // { itemKey: shardNumber }
  const shards = [];   // [ [item, item, ...], [item, ...], ... ]
  let current = [];

  for (const item of sorted) {
    if (current.length >= SHARD_SIZE) {
      shards.push(current);
      current = [];
    }
    index[item.key] = shards.length; // shard number = current shards array length
    current.push(item);
  }
  if (current.length > 0) shards.push(current);

  // Save index first, then shards in parallel batches of 5
  await storage.set(keys.planIndex(planId), index);
  
  for (let i = 0; i < shards.length; i += 5) {
    const batch = shards.slice(i, i + 5);
    await Promise.all(
      batch.map((shard, j) => storage.set(keys.planShard(planId, i + j), shard))
    );
  }
  
  return shards.length;
}

// READ: load a single item via index lookup (1 read for index + 1 read for shard)
async function getItem(planId, itemKey) {
  const index = await storage.get(keys.planIndex(planId));
  if (!index || index[itemKey] === undefined) return null;
  
  const shard = await storage.get(keys.planShard(planId, index[itemKey]));
  return (shard || []).find((item) => item.key === itemKey) || null;
}

// READ ALL: load all items across all shards
async function getAllItems(planId) {
  const index = await storage.get(keys.planIndex(planId));
  if (!index) return [];
  
  // Determine shard count from max shard number in index
  const shardNums = new Set(Object.values(index));
  const items = [];
  
  // Load shards in parallel batches of 5 to avoid KVS throughput limits
  const shardArray = [...shardNums];
  for (let i = 0; i < shardArray.length; i += 5) {
    const batch = shardArray.slice(i, i + 5);
    const results = await Promise.all(
      batch.map((n) => storage.get(keys.planShard(planId, n)))
    );
    for (const shard of results) {
      if (shard) items.push(...shard);
    }
  }
  
  return items;
}

// UPDATE: modify a single item in its shard
async function updateItemInShard(planId, itemKey, updatedItem) {
  const index = await storage.get(keys.planIndex(planId));
  if (!index || index[itemKey] === undefined) return false;
  
  const shardIdx = index[itemKey];
  const shard = await storage.get(keys.planShard(planId, shardIdx));
  if (!shard) return false;
  
  const itemIdx = shard.findIndex((item) => item.key === itemKey);
  if (itemIdx === -1) return false;
  
  shard[itemIdx] = updatedItem;
  await storage.set(keys.planShard(planId, shardIdx), shard);
  return true;
}

// DELETE ALL: remove all shards, index, and metadata
async function deleteAllData(planId) {
  const index = await storage.get(keys.planIndex(planId));
  const shardNums = index ? new Set(Object.values(index)) : new Set();
  
  // Delete in small batches with pauses to avoid throughput errors
  const toDelete = [
    keys.planMeta(planId),
    keys.planIndex(planId),
    ...[...shardNums].map((n) => keys.planShard(planId, n)),
  ];
  
  for (let i = 0; i < toDelete.length; i += 3) {
    const batch = toDelete.slice(i, i + 3);
    await Promise.all(batch.map((k) => storage.delete(k).catch(() => {})));
    if (i + 3 < toDelete.length) {
      await new Promise((r) => setTimeout(r, 200)); // avoid throughput limit
    }
  }
}
```

**Why batch in groups of 5?** Forge KVS has throughput limits. Parallel reads/writes of more than ~5 concurrent operations can hit `429 Too Many Requests`. The 200ms pause between delete batches prevents the same issue during cleanup.

---

## 3. Retry with Exponential Backoff and Jitter

Jira Cloud enforces rate limits. This retry wrapper handles 429 (rate limited) and 5xx (server error) responses automatically.

```javascript
const MAX_RETRIES = 4;
const BASE_DELAY = 2000;
const MAX_DELAY = 30000;

async function requestWithRetry(requestFn, label) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await requestFn();
      
      if (response.ok || response.status < 400) return response;
      
      // Rate limited — respect Retry-After header
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers?.get('Retry-After') || '0', 10);
        const delay = retryAfter > 0
          ? retryAfter * 1000
          : Math.min(BASE_DELAY * Math.pow(2, attempt - 1), MAX_DELAY);
        // Add jitter: multiply by random factor between 0.7 and 1.3
        const jitter = 0.7 + Math.random() * 0.6;
        console.warn(`[Retry] ${label} — 429, waiting ${Math.round(delay * jitter)}ms (attempt ${attempt})`);
        await new Promise((r) => setTimeout(r, delay * jitter));
        continue;
      }
      
      // Server error — retry with backoff
      if (response.status >= 500) {
        const delay = Math.min(BASE_DELAY * Math.pow(2, attempt - 1), MAX_DELAY);
        const jitter = 0.7 + Math.random() * 0.6;
        await new Promise((r) => setTimeout(r, delay * jitter));
        continue;
      }
      
      // Client error (4xx except 429) — do not retry
      const errText = await response.text().catch(() => '');
      throw new Error(`${label}: HTTP ${response.status} — ${errText}`);
      
    } catch (err) {
      if (attempt === MAX_RETRIES) throw err;
      if (err.message?.includes('HTTP 4')) throw err; // Don't retry 4xx
      const delay = Math.min(BASE_DELAY * Math.pow(2, attempt - 1), MAX_DELAY);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}
```

**Key decisions:**
- Jitter range 0.7–1.3 prevents thundering herd when multiple functions retry simultaneously.
- `Retry-After` header is checked first — Jira sometimes tells you exactly how long to wait.
- 4xx errors (except 429) are never retried — they indicate a bug in your code, not a transient failure.
- Max delay capped at 30 seconds — Forge functions have execution time limits.

---

## 4. Issue Search with POST /search/jql (Paginated)

**CRITICAL:** The old `GET /rest/api/3/search` endpoint was removed (HTTP 410). You must use `POST /rest/api/3/search/jql` with a JSON body.

```javascript
const INDEX_FIELDS = [
  'summary', 'issuetype', 'status', 'priority', 'parent', 'assignee',
  'reporter', 'labels', 'resolution', 'issuelinks',
  'customfield_10015', 'duedate', 'customfield_11581', 'customfield_12399',
  'created', 'updated', 'customfield_10016', // story points
];

async function searchIssues(jql, fields = INDEX_FIELDS) {
  const allIssues = [];
  let nextPageToken = null;

  do {
    const body = {
      jql,
      fields,
      maxResults: 100,
    };
    if (nextPageToken) body.nextPageToken = nextPageToken;

    const response = await requestWithRetry(
      () => api.asApp().requestJira(route`/rest/api/3/search/jql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
      `search: ${jql.substring(0, 50)}`
    );

    const data = await response.json();
    allIssues.push(...(data.issues || []));
    nextPageToken = data.nextPageToken || null;
  } while (nextPageToken);

  return allIssues;
}
```

**Pagination difference from the old API:**
- Old: `startAt` + `maxResults` (offset-based)
- New: `nextPageToken` (cursor-based, more efficient for large result sets)
- The response includes `nextPageToken` — if null or absent, you've reached the end.

---

## 5. Bulk Fetch Issues

When you need to fetch specific issues by key (not by JQL), use `POST /rest/api/3/issue/bulkfetch`. This is more efficient than individual GET requests.

```javascript
async function bulkFetchIssues(issueKeys, fields = INDEX_FIELDS) {
  const allIssues = [];
  
  // API limit: 100 keys per request
  for (let i = 0; i < issueKeys.length; i += 100) {
    const chunk = issueKeys.slice(i, i + 100);
    
    const response = await requestWithRetry(
      () => api.asApp().requestJira(route`/rest/api/3/issue/bulkfetch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issueIdsOrKeys: chunk,
          fields,
        }),
      }),
      `bulkfetch ${chunk.length} issues`
    );

    const data = await response.json();
    allIssues.push(...(data.issues || []));
  }
  
  return allIssues;
}
```

**When to use bulkfetch vs search/jql:**
- `bulkfetch`: You have specific issue keys (e.g., after a write-back, re-fetch those exact issues to verify)
- `search/jql`: You have a query expression (e.g., "all issues in project X")

---

## 6. Update Issues with overrideScreenSecurity

When updating custom fields programmatically, the field may not be on the issue's edit screen. Without `overrideScreenSecurity=true`, the API returns `400: Field 'customfield_XXXXX' cannot be set`. Always include both flags.

```javascript
async function updateIssue(issueKey, fields) {
  const response = await requestWithRetry(
    () => api.asApp().requestJira(
      // notifyUsers=false: don't spam watchers on automated updates
      // overrideScreenSecurity=true: bypass screen-level field restrictions
      route`/rest/api/3/issue/${issueKey}?notifyUsers=false&overrideScreenSecurity=true`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields }),
      }
    ),
    `update ${issueKey}`
  );
  return response;
}

// Example usage: update start date, due date, and custom duration field
await updateIssue('PROJ-123', {
  customfield_10015: '2026-05-01',   // Start Date (date field)
  duedate: '2026-05-15',              // Due Date (built-in)
  customfield_11581: 10,              // Duration (number field)
});
```

**Critical flags:**
- `notifyUsers=false` — Without this, every programmatic update sends email notifications to all watchers. In a batch update of 100 issues, that's 100 emails per watcher.
- `overrideScreenSecurity=true` — Required when the field exists on the issue type but is not present on the issue's edit screen. Without it, Jira rejects the update.

---

## 7. Jira Agile API: Board Issues and Ranking

The Agile API uses different base paths and pagination from the standard Jira API.

### Fetch Board Issues

```javascript
const MAX_RESULTS_PER_PAGE = 100;

async function getBoardIssues(boardId, fields = INDEX_FIELDS) {
  const fieldsParam = fields.join(',');
  const allIssues = [];
  let startAt = 0;
  let total = 0;

  do {
    const response = await requestWithRetry(
      () => api.asApp().requestJira(
        route`/rest/agile/1.0/board/${boardId}/issue?startAt=${startAt}&maxResults=${MAX_RESULTS_PER_PAGE}&fields=${fieldsParam}`
      ),
      `getBoardIssues ${boardId} startAt=${startAt}`
    );

    const data = await response.json();
    total = data.total || 0;
    allIssues.push(...(data.issues || []));
    startAt += MAX_RESULTS_PER_PAGE;
  } while (allIssues.length < total);

  return allIssues;
}
```

**Note:** Agile endpoints use offset-based pagination (`startAt`), NOT `nextPageToken`.

### Rank Issues

```javascript
async function rankIssues(issueKeys, position) {
  const body = { issues: issueKeys };
  if (position.rankBefore) body.rankBeforeIssue = position.rankBefore;
  if (position.rankAfter) body.rankAfterIssue = position.rankAfter;

  await requestWithRetry(
    () => api.asApp().requestJira(route`/rest/agile/1.0/issue/rank`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    `rank ${issueKeys.length} issues`
  );
}
```

**Required scope:** `write:issue:jira-software` and `read:board-scope:jira-software`

---

## 8. Issue Links: Create, Find, Delete

Jira issue links model dependencies between issues. The link type has two descriptions: outward ("blocks") and inward ("is blocked by").

### Create Link

```javascript
// CRITICAL: Jira's issueLink API semantics are counter-intuitive.
// For "A blocks B":
//   - outwardIssue = B (the BLOCKED issue, receives "is blocked by" description)
//   - inwardIssue  = A (the BLOCKER, receives "blocks" description)
//
// This is because:
//   - outwardIssue gets the INWARD description on its link list
//   - inwardIssue gets the OUTWARD description on its link list

async function createIssueLink(blockerKey, blockedKey, linkTypeName = 'Blocks') {
  await requestWithRetry(
    () => api.asApp().requestJira(route`/rest/api/3/issueLink`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: { name: linkTypeName },
        outwardIssue: { key: blockedKey },   // The blocked issue
        inwardIssue: { key: blockerKey },     // The blocker
      }),
    }),
    `createLink ${blockerKey} blocks ${blockedKey}`
  );
}
```

**WARNING:** The outward/inward semantics in the API body are the OPPOSITE of what you would expect. `outwardIssue` is the issue that receives the *inward* description in its link list, and `inwardIssue` receives the *outward* description. Test by creating a link and verifying in Jira's UI which issue shows "blocks" and which shows "is blocked by".

### Find Link ID

To delete a link, you need its numeric ID. Fetch the issue's links and search:

```javascript
async function findLinkId(issueKey, linkedKey, linkTypeName = 'Blocks') {
  const response = await requestWithRetry(
    () => api.asApp().requestJira(route`/rest/api/3/issue/${issueKey}?fields=issuelinks`),
    `findLink ${issueKey}`
  );
  const data = await response.json();
  const links = data.fields?.issuelinks || [];

  for (const link of links) {
    if (link.type?.name !== linkTypeName) continue;
    // Check both directions since we may be looking from either side
    if (link.outwardIssue?.key === linkedKey || link.inwardIssue?.key === linkedKey) {
      return link.id;
    }
  }
  return null;
}
```

### Delete Link

```javascript
async function deleteIssueLink(linkId) {
  await requestWithRetry(
    () => api.asApp().requestJira(route`/rest/api/3/issueLink/${linkId}`, {
      method: 'DELETE',
    }),
    `deleteLink ${linkId}`
  );
}
```

---

## 9. ADF Comments on Issues

Jira Cloud uses Atlassian Document Format (ADF) for all rich text content including comments. You cannot send plain text — it must be wrapped in ADF structure.

```javascript
async function addComment(issueKey, text) {
  await requestWithRetry(
    () => api.asApp().requestJira(route`/rest/api/3/issue/${issueKey}/comment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        body: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: text }
              ],
            },
          ],
        },
      }),
    }),
    `comment on ${issueKey}`
  );
}

// With formatting (bold, multiple paragraphs):
const adfBody = {
  type: 'doc',
  version: 1,
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'PPM Pro: ', marks: [{ type: 'strong' }] },
        { type: 'text', text: 'Date change reverted. The new start date would violate the dependency chain.' },
      ],
    },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: `Original: ${oldStart} → ${oldDue}` },
      ],
    },
  ],
};
```

---

## 10. Custom Field Creation and Screen Configuration

Creating a custom field programmatically requires a multi-step chain: create the field, find the edit screen, find the first tab, and add the field to it.

### Step 1: Create Custom Field

```javascript
async function createCustomField(name, description) {
  const response = await api.asApp().requestJira(route`/rest/api/3/field`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      description: description || '',
      type: 'com.atlassian.jira.plugin.system.customfieldtypes:float',
      searcherKey: 'com.atlassian.jira.plugin.system.customfieldtypes:exactnumber',
    }),
  });
  return response.json(); // { id: 'customfield_XXXXX', name, ... }
}
```

**Common field types:**
- Number: `com.atlassian.jira.plugin.system.customfieldtypes:float`
- Text: `com.atlassian.jira.plugin.system.customfieldtypes:textfield`
- Select: `com.atlassian.jira.plugin.system.customfieldtypes:select`

### Step 2: Find Edit Screen (4-Step Chain)

```javascript
async function getEditScreenId(projectKey) {
  // 1. Get project ID
  const proj = await api.asApp().requestJira(route`/rest/api/3/project/${projectKey}`);
  const { id: projectId } = await proj.json();

  // 2. Get issue type screen scheme
  const itsRes = await api.asApp().requestJira(
    route`/rest/api/3/issuetypescreenscheme/project?projectId=${projectId}`
  );
  const { values: itsValues } = await itsRes.json();
  const issueTypeScreenSchemeId = itsValues?.[0]?.issueTypeScreenScheme?.id;

  // 3. Get screen scheme mapping
  const mapRes = await api.asApp().requestJira(
    route`/rest/api/3/issuetypescreenscheme/mapping?issueTypeScreenSchemeId=${issueTypeScreenSchemeId}`
  );
  const { values: mapValues } = await mapRes.json();
  const screenSchemeId = mapValues?.[0]?.screenSchemeId;

  // 4. Get actual screen from screen scheme
  const ssRes = await api.asApp().requestJira(
    route`/rest/api/3/screenscheme?id=${screenSchemeId}`
  );
  const { values: ssValues } = await ssRes.json();
  return ssValues?.[0]?.screens?.edit || ssValues?.[0]?.screens?.default;
}
```

### Step 3: Add Field to Screen Tab

```javascript
async function addFieldToScreen(screenId, fieldId) {
  // Get first tab
  const tabsRes = await api.asApp().requestJira(
    route`/rest/api/3/screens/${screenId}/tabs`
  );
  const tabs = await tabsRes.json();
  const tab = tabs[0];

  // Add field (gracefully handles "already exists")
  try {
    await api.asApp().requestJira(
      route`/rest/api/3/screens/${screenId}/tabs/${tab.id}/fields`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fieldId }),
      }
    );
  } catch (err) {
    // Field may already be on the screen — not an error
    if (!err.message?.includes('already')) throw err;
  }
}
```

**Required scope:** `manage:jira-configuration`

---

## 11. Forge Trigger: Issue Updated with Plan Protection

Forge triggers listen to Jira events. The `avi:jira:updated:issue` trigger fires on every issue update across the entire Jira site.

### Manifest

```yaml
trigger:
  - key: ppm-issue-guard
    function: issueGuard
    events:
      - avi:jira:updated:issue
```

### Handler

```javascript
// src/triggers/issue-updated.js
import { validateAndProtect } from '../services/plan-protection';
import { incrementalUpdateIssue } from '../services/indexing/incremental-updater';

export async function onIssueUpdated(event) {
  const issueKey = event?.issue?.key;
  if (!issueKey) return;

  const changelog = event?.changelog?.items || event?.issue?.changelog?.items || [];
  const userId = event?.atlassianId;

  // Phase 1: Validate against Iron Clad Rule — revert if violated
  try {
    const result = await validateAndProtect(issueKey, changelog, userId);
    if (result?.reverted) {
      console.log(`[PPM] Reverted ${issueKey}: ${result.reason}`);
      return; // Skip sync — we just reverted the change
    }
  } catch (err) {
    console.warn(`[PPM] Protection check failed for ${issueKey}:`, err.message);
  }

  // Phase 2: Incremental sync — update KVS with latest Jira data
  try {
    await incrementalUpdateIssue(issueKey);
  } catch (err) {
    console.warn(`[PPM] Incremental sync failed for ${issueKey}:`, err.message);
  }
}
```

**Key pattern:** Two-phase trigger — validate first, then sync. If validation reverts the change, skip the sync to avoid storing the reverted data.

**Cost warning:** This trigger fires on EVERY issue update site-wide. Keep the handler lightweight. Load plan data only for issues that actually belong to a protected plan. Consider disabling the trigger if KVS costs are a concern.

---

## 12. Chunked Write-Back with Locking

When writing changes to Jira for many issues, batch them to respect rate limits and provide progress feedback.

### Write Flow

```javascript
// 1. Start write — acquire lock
resolver.define('startWrite', async ({ payload, context }) => {
  const { planId } = payload;
  const lock = await storage.get(keys.planLock(planId));
  
  if (lock && lock.accountId !== context.accountId) {
    return { success: false, error: 'Plan is locked', holder: lock.displayName };
  }
  
  await storage.set(keys.planLock(planId), {
    accountId: context.accountId,
    displayName: payload.displayName,
    lockedAt: new Date().toISOString(),
  });
  
  return { success: true };
});

// 2. Write chunk — process N issues at a time
resolver.define('writeChunk', async ({ payload }) => {
  const { planId, changes, offset } = payload;
  const CHUNK_SIZE = 10;
  const chunk = changes.slice(offset, offset + CHUNK_SIZE);
  
  let written = 0, failed = 0;
  const errors = [];
  
  for (const change of chunk) {
    try {
      const fields = {};
      if (change.startDate !== undefined) fields.customfield_10015 = change.startDate;
      if (change.dueDate !== undefined) fields.duedate = change.dueDate;
      if (change.duration !== undefined) fields.customfield_11581 = change.duration;
      
      await updateIssue(change.issueKey, fields);
      written++;
      
      // 250ms delay between individual writes
      await new Promise((r) => setTimeout(r, 250));
    } catch (err) {
      failed++;
      errors.push({ issueKey: change.issueKey, error: err.message });
    }
  }
  
  const newOffset = offset + CHUNK_SIZE;
  return {
    success: true,
    written,
    failed,
    errors,
    offset: newOffset,
    isComplete: newOffset >= changes.length,
    totalProcessed: Math.min(newOffset, changes.length),
    totalChanges: changes.length,
  };
});

// 3. Complete write — verify, re-index, release lock
resolver.define('completeWrite', async ({ payload }) => {
  const { planId, writtenKeys } = payload;
  
  try {
    // Re-fetch from Jira to verify writes landed correctly
    const verification = await verifyWrittenIssues(planId, writtenKeys);
    
    // Re-index written issues from fresh Jira data
    await reindexWrittenIssues(planId, writtenKeys);
    
    return { success: true, verification };
  } finally {
    // ALWAYS release lock, even on error
    await storage.delete(keys.planLock(planId));
  }
});
```

**Why chunk?** Jira's rate limit is ~20 writes per 2 seconds per issue. Writing 100 issues sequentially with 250ms delays takes ~25 seconds. Chunking with frontend progress reporting gives users visibility into the operation.

---

## 13. Concurrency: Drafts, Locks, Conflict Detection

Multi-user editing requires three mechanisms: drafts (awareness), locks (exclusion), and conflict detection (validation).

```javascript
// Draft: lightweight record of who is editing what
// Stored per-user, per-plan. Polled every 60 seconds by all users.
const draft = {
  accountId: 'user-123',
  displayName: 'Jane',
  issueKeys: ['PROJ-1', 'PROJ-5'],
  savedAt: '2026-04-10T15:30:00Z',
};
await storage.set(keys.planDraft(planId, accountId), draft);

// Drafts registry: lightweight map of all active drafts for a plan
// { accountId: { displayName, issueKeys, savedAt } }
const registry = await storage.get(keys.planDrafts(planId)) || {};

// Lock: prevents concurrent writes
const lock = {
  accountId: 'user-123',
  displayName: 'Jane',
  lockedAt: '2026-04-10T15:35:00Z',
};
await storage.set(keys.planLock(planId), lock);

// Conflict check: compare current Jira state with what user last indexed
async function checkConflicts(planId, userAccountId) {
  const userDraft = await storage.get(keys.planDraft(planId, userAccountId));
  if (!userDraft?.issueKeys?.length) return { hasConflicts: false };
  
  // Re-fetch the user's draft issues from Jira
  const fresh = await bulkFetchIssues(userDraft.issueKeys);
  const conflicts = [];
  
  for (const issue of fresh) {
    const stored = await getItem(planId, issue.key);
    if (!stored) continue;
    
    // Compare dates — if Jira changed since our last index, it's a conflict
    if (issue.fields.duedate !== stored._original?.dueDate) {
      conflicts.push({
        issueKey: issue.key,
        field: 'dueDate',
        ours: stored.dueDate,
        theirs: issue.fields.duedate,
      });
    }
  }
  
  return { hasConflicts: conflicts.length > 0, conflicts };
}
```

---

## 14. Custom UI: Bridge Invoke Pattern

The frontend communicates with backend resolvers via `@forge/bridge`. This is the ONLY way to call backend functions from Custom UI.

```javascript
import { invoke } from '@forge/bridge';

// Simple one-shot call
export async function callResolver(resolverName, payload = {}) {
  const result = await invoke(resolverName, payload);
  if (result?.success === false) {
    throw new Error(result.error || `${resolverName} failed`);
  }
  return result;
}

// React hook with loading/error state
export function useResolver(resolverName, options = {}) {
  const [data, setData] = useState(null);
  const [state, setState] = useState('idle');
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);

  useEffect(() => () => { mountedRef.current = false; }, []);

  const execute = useCallback(async (payload) => {
    setState('loading');
    setError(null);
    try {
      const result = await invoke(resolverName, payload || options.payload || {});
      if (!mountedRef.current) return result;
      if (result?.success === false) throw new Error(result.error || 'Failed');
      setData(result);
      setState('success');
      return result;
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err.message);
      setState('error');
    }
  }, [resolverName, options.payload]);

  // Auto-fetch on mount if configured
  useEffect(() => {
    if (options.autoFetch) execute();
  }, []);

  return { data, state, error, execute, retry: execute };
}
```

**CRITICAL:** The `invoke` function sends the payload as-is to the resolver. Do NOT double-wrap it:
- Correct: `invoke('getIssues', { planId: '123' })`
- Wrong: `invoke('getIssues', { payload: { planId: '123' } })`

The resolver receives `{ payload }` automatically from the Forge framework.

---

## 15. Custom UI: Jira Bridge Modal

Open native Jira issue views from within your Forge app:

```javascript
import { ViewIssueModal } from '@forge/jira-bridge';

function useIssueModal() {
  return useCallback((issueKey) => {
    const modal = new ViewIssueModal({
      context: { issueKey },
      onClose: () => {}, // Optional: refresh data after modal closes
    });
    modal.open();
  }, []);
}

// Usage in component
const openIssue = useIssueModal();
<button onClick={() => openIssue('PROJ-123')}>View in Jira</button>
```

**Required package:** `@forge/jira-bridge`

---

## 16. Manifest Configuration: Multi-Module App

A production Forge app typically uses multiple modules. Here is the manifest pattern for an app with a main page, issue panel, admin settings, and a trigger:

```yaml
app:
  id: "ari:cloud:ecosystem::app/YOUR-APP-ID"
  runtime:
    name: nodejs22.x

modules:
  jira:globalPage:
    - key: app-dashboard
      resource: app-ui
      resolver:
        function: resolver
      title: My App
      layout: basic

  jira:issuePanel:
    - key: app-issue-panel
      resource: app-ui
      resolver:
        function: resolver
      title: My App Panel
      icon: https://developer.atlassian.com/platform/forge/images/icons/issue-panel-icon.svg

  jira:adminPage:
    - key: app-admin
      resource: app-ui
      resolver:
        function: resolver
      title: My App Settings

  trigger:
    - key: app-issue-guard
      function: issueGuard
      events:
        - avi:jira:updated:issue

  function:
    - key: resolver
      handler: index.handler
    - key: issueGuard
      handler: index.onIssueUpdated

resources:
  - key: app-ui
    path: static/app-ui/build
    tunnel:
      port: 3000

permissions:
  scopes:
    - read:issue-details:jira
    - read:jira-work
    - write:jira-work
    - write:issue:jira-software
    - read:board-scope:jira-software
    - manage:jira-project
    - read:jira-user
    - manage:jira-configuration
    - storage:app
  content:
    styles:
      - unsafe-inline    # Required for inline styles in Custom UI
```

**Key notes:**
- `runtime: nodejs22.x` — Use the latest Node.js runtime. `nodejs18.x` may be rejected.
- `handler: index.handler` — Forge bundler roots at `src/`, so the path is relative to `src/index.js`.
- `layout: basic` — Uses the full page without Jira's standard navigation chrome.
- `unsafe-inline` under `content.styles` — Required if your React app uses inline styles (which most do).
- The `icon` property on `jira:issuePanel` is required — the module will fail validation without it.

---

## 17. KVS Cost Control Strategies

Forge charges for KVS reads and writes. In a plan management app, costs can spiral if you write on every user action. These strategies kept the PPM Pro app under budget:

1. **Frontend-only editing.** All date changes, drag operations, and recalculations happen in React state. Zero KVS writes during editing. Only the explicit Save button writes to KVS.

2. **Batch saves.** Instead of writing individual issues, the Save operation sends all changed issues in one resolver call, which writes them to the minimal number of affected shards.

3. **Reduced polling.** Draft awareness polling runs every 60 seconds, not every 10 seconds. Each poll is 1 KVS read.

4. **Disabled expensive triggers.** The `avi:jira:updated:issue` trigger fires on EVERY issue update site-wide. If your app doesn't need real-time protection, disable the trigger module in the manifest to eliminate background KVS reads.

5. **Lean issue model.** The issue transformer strips all unnecessary fields before storing in KVS. Only fields needed for display and calculation are kept (~15 fields instead of 50+).

6. **Index-then-shard.** The index map (`{ issueKey: shardNumber }`) avoids loading all shards to find one issue. Single-issue lookup is 2 KVS reads (index + shard), not N reads (all shards).

---

## Appendix: Jira REST API Endpoint Reference (Verified Working)

| Method | Endpoint | Purpose | Scope Required |
|--------|----------|---------|---------------|
| POST | `/rest/api/3/search/jql` | Search issues by JQL | `read:jira-work` |
| GET | `/rest/api/3/issue/{key}?fields=...` | Get single issue | `read:issue-details:jira` |
| POST | `/rest/api/3/issue/bulkfetch` | Bulk fetch by keys | `read:issue-details:jira` |
| PUT | `/rest/api/3/issue/{key}?notifyUsers=false&overrideScreenSecurity=true` | Update issue fields | `write:jira-work` |
| GET | `/rest/api/3/myself` | Get current user | `read:jira-user` |
| GET | `/rest/agile/1.0/board/{id}/issue?startAt=...&maxResults=...&fields=...` | Board issues | `read:board-scope:jira-software` |
| PUT | `/rest/agile/1.0/issue/rank` | Rank/reorder issues | `write:issue:jira-software` |
| POST | `/rest/api/3/issueLink` | Create issue link | `write:jira-work` |
| DELETE | `/rest/api/3/issueLink/{id}` | Delete issue link | `write:jira-work` |
| GET | `/rest/api/3/issue/{key}?fields=issuelinks` | Find link ID | `read:issue-details:jira` |
| POST | `/rest/api/3/issue/{key}/comment` | Add ADF comment | `write:jira-work` |
| GET | `/rest/api/3/field` | List all fields | `read:jira-work` |
| POST | `/rest/api/3/field` | Create custom field | `manage:jira-configuration` |
| GET | `/rest/api/3/project/{key}` | Get project | `manage:jira-project` |
| GET | `/rest/api/3/issuetypescreenscheme/project?projectId={id}` | Screen scheme | `manage:jira-configuration` |
| GET | `/rest/api/3/issuetypescreenscheme/mapping?issueTypeScreenSchemeId={id}` | Scheme mapping | `manage:jira-configuration` |
| GET | `/rest/api/3/screenscheme?id={id}` | Screen scheme details | `manage:jira-configuration` |
| GET | `/rest/api/3/screens/{id}/tabs` | Screen tabs | `manage:jira-configuration` |
| POST | `/rest/api/3/screens/{id}/tabs/{tabId}/fields` | Add field to screen | `manage:jira-configuration` |

---

## 18. Resolver Registration Pattern (Modular Backend)

A production Forge app should split resolvers by domain into separate files. Each file exports a registration function that receives the Resolver instance and defines its handlers.

### Entry Point (`src/index.js`)

```javascript
import Resolver from '@forge/resolver';
import { registerPlanResolvers } from './resolvers/plan-resolvers';
import { registerIndexingResolvers } from './resolvers/indexing-resolvers';
import { registerWriteResolvers } from './resolvers/write-resolvers';
import { registerAdminResolvers } from './resolvers/admin-resolvers';
import { registerConcurrencyResolvers } from './resolvers/concurrency-resolvers';
import { registerDependencyResolvers } from './resolvers/dependency-resolvers';

const resolver = new Resolver();

// Each module registers its own resolvers on the shared instance
registerPlanResolvers(resolver);
registerIndexingResolvers(resolver);
registerWriteResolvers(resolver);
registerAdminResolvers(resolver);
registerConcurrencyResolvers(resolver);
registerDependencyResolvers(resolver);

// Export for Forge runtime
export const handler = resolver.getDefinitions();

// Separate export for trigger functions
export { onIssueUpdated } from './triggers/issue-updated';
```

### Resolver Module Pattern

```javascript
// src/resolvers/plan-resolvers.js
export function registerPlanResolvers(resolver) {
  resolver.define('createPlan', async ({ payload, context }) => {
    const { name, sources } = payload;
    const userId = context.accountId;
    // ... implementation
    return { success: true, plan: { id, name } };
  });

  resolver.define('getPlan', async ({ payload }) => {
    const { planId } = payload;
    // ... implementation
    return { success: true, plan };
  });

  resolver.define('listPlans', async () => {
    // ... implementation
    return { success: true, plans };
  });
}
```

**Key rules:**
- The `context` object provides `context.accountId` (the current user's Atlassian account ID) and `context.displayName`.
- The `payload` object is the data sent from the frontend via `invoke('resolverName', payload)`.
- Always return `{ success: true/false }` so the frontend can distinguish errors from data.
- Each resolver file stays under 300 lines — when it grows, split further by sub-domain.

---

## 19. Issue Transformer: Jira Raw → Lean KVS Model

Raw Jira issues contain 50+ fields. Storing them all wastes KVS space and makes shards hit the 240KB limit faster. The transformer extracts only the fields needed for display and calculation, reducing each issue from ~5KB to ~500 bytes.

```javascript
/**
 * Transform a raw Jira API issue into a lean storage model.
 * Two-pass approach: first collect all keys, then transform with full key set
 * (needed to filter dependencies to only plan-scoped issues).
 */
export function transformIssues(rawIssues, config = {}) {
  // Pass 1: collect all issue keys in this plan
  const planIssueKeys = new Set(rawIssues.map((i) => i.key));
  
  // Pass 2: transform each issue with knowledge of the full key set
  const issuesMap = new Map();
  for (const raw of rawIssues) {
    const transformed = transformIssue(raw, planIssueKeys, config);
    issuesMap.set(transformed.key, transformed);
  }
  return issuesMap;
}

function transformIssue(rawIssue, planIssueKeys, config) {
  const f = rawIssue.fields || {};
  const fieldIds = config.fields || FIELD_DEFAULTS;
  const linkTypeName = config.dependencies?.linkTypeName || 'Blocks';

  // Extract configured field values (field IDs come from admin config, not hardcoded)
  const startDate = f[fieldIds.startDate] || null;
  const dueDate = f[fieldIds.dueDate] || null;
  const duration = parseFloat(f[fieldIds.duration]) || null;
  const buffer = f[fieldIds.buffer]?.value || f[fieldIds.buffer] || 'No';

  // Extract dependencies: filter to only links of the configured type
  // and only issues within this plan
  const predecessors = [];
  const successors = [];
  for (const link of (f.issuelinks || [])) {
    if (link.type?.name !== linkTypeName) continue;
    if (link.inwardIssue && planIssueKeys.has(link.inwardIssue.key)) {
      predecessors.push(link.inwardIssue.key);
    }
    if (link.outwardIssue && planIssueKeys.has(link.outwardIssue.key)) {
      successors.push(link.outwardIssue.key);
    }
  }

  return {
    key: rawIssue.key,
    summary: (f.summary || '').slice(0, 80),  // Truncate to save space
    type: f.issuetype?.name || 'Unknown',
    status: f.status?.name || 'Unknown',
    statusCategory: f.status?.statusCategory?.key || 'undefined',
    parentKey: f.parent?.key && planIssueKeys.has(f.parent.key) ? f.parent.key : null,
    assigneeName: f.assignee?.displayName || null,
    startDate,
    dueDate,
    duration,
    buffer,
    predecessors,
    successors,
    // Frozen snapshot of Jira baseline — used to detect what changed
    _original: {
      startDate,
      dueDate,
      duration,
      buffer,
      predecessors: [...predecessors],
      successors: [...successors],
    },
  };
}
```

**Why two passes?** Dependencies (predecessors/successors) reference other issue keys. You must know the full set of plan issue keys BEFORE transforming, so you can filter out links to issues outside the plan. Without this, a plan for "Project A" would include dependency arrows pointing to "Project B" issues that don't exist in the plan.

**Why `_original`?** The frontend edits `startDate`, `dueDate`, etc. directly on the issue object. `_original` preserves the Jira baseline so you can compute diffs: which issues actually changed (for the Apply button) and which links are staged vs actual (for arrow rendering).

---

## 20. Full Indexing Flow: Sources → Transform → Shard → KVS

The indexing resolver orchestrates the complete data pipeline from Jira to KVS.

```javascript
resolver.define('indexPlan', async ({ payload }) => {
  const { planId } = payload;
  const meta = await kvsStore.getPlanMeta(planId);
  if (!meta) return { success: false, error: 'Plan not found' };

  // 1. Set status to "indexing" so the UI shows a spinner
  meta.status = 'indexing';
  await kvsStore.savePlanMeta(planId, meta);

  try {
    // 2. Load admin config (field IDs, link type name, etc.)
    const config = await loadConfig();

    // 3. Fetch from all sources, deduplicate by issue key
    const rawIssuesMap = new Map();
    for (const source of meta.sources) {
      const issues = await fetchFromSource(source); // JQL, Board, or Project
      for (const issue of issues) {
        rawIssuesMap.set(issue.key, issue); // Later sources overwrite
      }
    }
    const rawIssues = Array.from(rawIssuesMap.values());
    rawIssuesMap.clear(); // Free memory early

    // 4. Transform: strip unnecessary fields, extract deps, create lean model
    const issuesMap = transformIssues(rawIssues, config);

    // 5. Save with auto-sharding (100 issues per shard)
    const shardCount = await kvsStore.saveAllIssues(planId, issuesMap);

    // 6. Update metadata
    meta.status = 'indexed';
    meta.issueCount = issuesMap.size;
    meta.shardCount = shardCount;
    meta.lastIndexedAt = new Date().toISOString();
    meta.version += 1;
    await kvsStore.savePlanMeta(planId, meta);

    const count = issuesMap.size;
    issuesMap.clear(); // GC hint
    return { success: true, issueCount: count, shardCount };

  } catch (err) {
    // 7. Mark plan as errored — UI shows error state with retry button
    meta.status = 'error';
    meta.statusMessage = err.message;
    await kvsStore.savePlanMeta(planId, meta);
    return { success: false, error: err.message };
  }
});
```

**Source dispatch pattern:**

```javascript
async function fetchFromSource(source) {
  switch (source.type) {
    case 'jql':
      return fetchIssuesFromJql(source.query);        // POST /search/jql
    case 'board':
      return fetchIssuesFromBoard(source.boardId);     // GET /agile/1.0/board/{id}/issue
    case 'project':
      return fetchIssuesFromProject(source.projectKey); // Converts to JQL internally
    default:
      throw new Error(`Unknown source type: ${source.type}`);
  }
}
```

All three sources return the same shape: `Object[]` of raw Jira issue objects. This makes them interchangeable — the indexer doesn't need to know which source produced which issue.

---

## 21. Field Payload Builder: Config-Driven Updates

Never hardcode custom field IDs in your update logic. Use a config-driven builder that reads field IDs from admin settings.

```javascript
const FIELD_DEFAULTS = {
  startDate: 'customfield_10015',
  dueDate: 'duedate',
  duration: 'customfield_11581',
  buffer: 'customfield_12399',
};

/**
 * Build the fields object for a Jira PUT request using configured field IDs.
 * Only includes fields that are present in the changes object.
 */
function buildFieldsPayload(changes, fieldConfig) {
  const fc = fieldConfig || FIELD_DEFAULTS;
  const fields = {};

  if (changes.startDate !== undefined) {
    fields[fc.startDate || FIELD_DEFAULTS.startDate] = changes.startDate;
  }
  if (changes.dueDate !== undefined) {
    fields[fc.dueDate || FIELD_DEFAULTS.dueDate] = changes.dueDate;
  }
  if (changes.duration !== undefined) {
    fields[fc.duration || FIELD_DEFAULTS.duration] = changes.duration;
  }
  if (changes.buffer !== undefined) {
    // Select-type fields need { value: "Yes" } not plain "Yes"
    fields[fc.buffer || FIELD_DEFAULTS.buffer] = { value: changes.buffer };
  }

  return fields;
}

// Usage in write resolver:
const fieldConfig = await loadFieldConfig();
const fields = buildFieldsPayload(
  { startDate: '2026-05-01', dueDate: '2026-05-15' },
  fieldConfig
);
await updateIssue(issueKey, fields);
// Sends: { "customfield_10015": "2026-05-01", "duedate": "2026-05-15" }
```

**Why config-driven?** Different Jira instances use different custom field IDs. What's `customfield_10015` in one instance might be `customfield_10234` in another. The admin settings UI lets users map their actual field IDs, and all code reads from that config at runtime.

---

## 22. Dependency Extraction from Issue Links

Jira's `issuelinks` field contains both inward and outward links of all types. Extracting the correct predecessor/successor relationships requires careful filtering.

```javascript
// Raw Jira issue link structure:
// {
//   type: { name: "Blocks", inward: "is blocked by", outward: "blocks" },
//   inwardIssue: { key: "PROJ-1" },   // This issue IS BLOCKED BY PROJ-1
//   outwardIssue: { key: "PROJ-3" },  // This issue BLOCKS PROJ-3
// }

// From issue PROJ-2's perspective:
// - inwardIssue links mean: the linked issue DOES SOMETHING TO this issue
//   e.g., inwardIssue with "Blocks" type → "PROJ-1 blocks PROJ-2" → PROJ-1 is a PREDECESSOR
// - outwardIssue links mean: this issue DOES SOMETHING TO the linked issue
//   e.g., outwardIssue with "Blocks" type → "PROJ-2 blocks PROJ-3" → PROJ-3 is a SUCCESSOR

function extractDependencies(issueLinks, linkTypeName, planIssueKeys) {
  const predecessors = [];
  const successors = [];

  for (const link of issueLinks) {
    if (link.type?.name !== linkTypeName) continue;

    // inwardIssue = predecessor (blocks this issue)
    if (link.inwardIssue && planIssueKeys.has(link.inwardIssue.key)) {
      predecessors.push(link.inwardIssue.key);
    }
    // outwardIssue = successor (blocked by this issue)
    if (link.outwardIssue && planIssueKeys.has(link.outwardIssue.key)) {
      successors.push(link.outwardIssue.key);
    }
  }

  return { predecessors, successors };
}
```

**This is the READ direction — how to interpret links when reading from Jira.**
The WRITE direction (creating links) has the opposite mapping — see Section 8 above.

**Summary of the confusing Jira link semantics:**

| Operation | API field | Meaning |
|-----------|-----------|---------|
| **Reading** issue X's links | `inwardIssue: { key: 'A' }` with type "Blocks" | A blocks X (A is predecessor) |
| **Reading** issue X's links | `outwardIssue: { key: 'B' }` with type "Blocks" | X blocks B (B is successor) |
| **Creating** "A blocks B" | `inwardIssue: { key: 'A' }` | A is the blocker |
| **Creating** "A blocks B" | `outwardIssue: { key: 'B' }` | B is the blocked |

---

## 23. Post-Write Verification

After writing changes to Jira, verify that the values actually landed. Jira may silently reject or modify values due to automation rules, field validators, or screen configurations.

```javascript
async function verifyWrittenIssues(planId, writtenKeys, fieldConfig) {
  const fields = [
    fieldConfig.startDate,
    fieldConfig.dueDate,
    fieldConfig.duration,
    fieldConfig.buffer,
  ];

  // Re-fetch the exact issues we just wrote
  const fresh = await bulkFetchIssues(writtenKeys, fields);
  const verified = [];
  const mismatches = [];

  for (const issue of fresh) {
    const stored = await kvsStore.getItem(planId, issue.key);
    if (!stored) continue;

    const actualStart = issue.fields[fieldConfig.startDate] || null;
    const actualDue = issue.fields[fieldConfig.dueDate] || null;

    if (actualStart !== stored.startDate || actualDue !== stored.dueDate) {
      mismatches.push({
        issueKey: issue.key,
        expected: { startDate: stored.startDate, dueDate: stored.dueDate },
        actual: { startDate: actualStart, dueDate: actualDue },
      });
    } else {
      verified.push(issue.key);
    }
  }

  return { verified: verified.length, mismatches };
}
```

**When mismatches occur:**
- Jira automation rules may have changed the date after your write
- A workflow post-function may have recalculated the field
- The field may be read-only on certain issue types
- The value format may not match (e.g., you wrote `"2026-05-01"` but Jira stored `"2026-05-01T00:00:00.000+0000"`)

Always normalize date formats before comparing.

---

## 24. Memory Management in Forge Functions

Forge functions run in a constrained environment with limited memory and execution time. These patterns prevent out-of-memory errors when processing large datasets.

```javascript
// 1. Clear Maps and arrays after use
const rawIssuesMap = new Map();
// ... populate ...
const rawIssues = Array.from(rawIssuesMap.values());
rawIssuesMap.clear();  // Free the map immediately

// 2. Process in batches, not all at once
for (let i = 0; i < shards.length; i += 5) {
  const batch = shards.slice(i, i + 5);
  await Promise.all(batch.map(process));
  // Each batch is GC-eligible after this point
}

// 3. Don't hold references to intermediate data
const result = await fetchAndTransform(source);
const count = result.size;
result.clear();  // GC hint
return { success: true, count };

// 4. Truncate string fields to prevent oversized records
const summary = (fields.summary || '').slice(0, 80);

// 5. Only fetch the fields you need
const fields = ['summary', 'status', 'duedate']; // NOT '*' or all fields
await api.asApp().requestJira(
  route`/rest/api/3/issue/${key}?fields=${fields.join(',')}`
);
```

**Forge function limits (as of 2026):**
- Execution time: 25 seconds (standard), 55 seconds (async events/triggers)
- Memory: ~512MB
- KVS value size: 240KB per key
- KVS key length: 500 characters
