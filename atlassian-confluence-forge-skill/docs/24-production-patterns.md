# Production Patterns (Confluence)

Production-tested patterns lifted from two shipping Confluence Forge apps:

- **Sentinel Vault** — content protection / attachment-locking app, real-time event triggers, scheduled trigger fan-out, ADF surgery on every page open, three-level steward authorization, native @mention notifications.
- **License Leash (Axpo License Manager)** — cross-product Confluence + Atlassian Admin (Organizations) API license manager, HMAC-token web triggers, dual-strategy `asUser` → `asApp` REST fallback, Forge SQL config, scheduled deactivation pipeline.

Each pattern lists the problem it solves, a copy-pasteable code excerpt, and a source pointer.

## Index

1. [Capsule-style resolver registration](#1-capsule-style-resolver-registration)
2. [KVS prefix indexing with `WhereConditions.beginsWith`](#2-kvs-prefix-indexing-with-whereconditionsbeginswith)
3. [Content-property version handling](#3-content-property-version-handling)
4. [ADF tree surgery (recursive traversal)](#4-adf-tree-surgery-recursive-traversal)
5. [App-account-id loop prevention](#5-app-account-id-loop-prevention)
6. [Native `@mention` notifications via storage-format XML](#6-native-mention-notifications-via-storage-format-xml)
7. [Cursor-paginated space scan from a queue](#7-cursor-paginated-space-scan-from-a-queue)
8. [Three-level Confluence authorization](#8-three-level-confluence-authorization)
9. [HMAC-signed web trigger for self-service flows](#9-hmac-signed-web-trigger-for-self-service-flows)
10. [Dual-strategy `asUser` → `asApp` fallback](#10-dual-strategy-asuser--asapp-fallback)
11. [Forge SQL config table with type helpers](#11-forge-sql-config-table-with-type-helpers)
12. [Resolver middleware (`withMigrations`) wrapper](#12-resolver-middleware-withmigrations-wrapper)
13. [Atlassian Admin (Org) API integration from a Forge app](#13-atlassian-admin-org-api-integration-from-a-forge-app)
14. [Email without a third-party provider (Jira issue notify trick)](#14-email-without-a-third-party-provider-jira-issue-notify-trick)
15. [Eventual-consistency protection (trust your local audit, not the REST group)](#15-eventual-consistency-protection-trust-your-local-audit-not-the-rest-group)

---

## 1. Capsule-style resolver registration

**Problem:** A single `src/index.js` with 50+ `resolver.define(...)` calls becomes unmaintainable, but splitting into many `Resolver` instances complicates the manifest mapping.

**Pattern:** One `Resolver` instance, multiple per-domain "capsule" files that each export an `actions` array of `[key, handler]` tuples. The root file aggregates and registers.

```javascript
// src/server/registry.js  (Sentinel Vault)
import Resolver from '@forge/resolver';
import { actions as sealingActions }      from './capsules/sealing/actions.js';
import { actions as policyActions }       from './capsules/policies/actions.js';
import { actions as realmActions }        from './capsules/realms/actions.js';
import { actions as bulletinActions }     from './capsules/bulletins/actions.js';
import { actions as entitlementActions }  from './capsules/entitlements/actions.js';
import { actions as panelActions }        from './capsules/panels/actions.js';

const router = new Resolver();
const allActions = [
  ...sealingActions, ...policyActions, ...realmActions,
  ...bulletinActions, ...entitlementActions, ...panelActions,
];
allActions.forEach(([key, fn]) => router.define(key, fn));
router.define('heartbeat', async () => 'operational');

export const actionRouter = router.getDefinitions();
```

**Why tuples not objects:** insertion order is preserved, multiple capsules can share a key prefix without object-property collisions, and adding a new action is a single export append.

**Source:** Sentinel Vault `src/server/registry.js`.

---

## 2. KVS prefix indexing with `WhereConditions.beginsWith`

**Problem:** You want O(1) "list everything for resource X" without maintaining a separate index value (which is itself rate-limited per key).

**Pattern:** Encode the relationship in the *key*. Then `kvs.query().where('key', WhereConditions.beginsWith('prefix'))` is your index.

```javascript
import { kvs, WhereConditions } from '@forge/kvs';

// Sentinel Vault key conventions
//   protection-{attachmentId}                  ← seal record
//   space-protection-{spaceId}-{attachmentId}  ← per-space index entry
//   admin-settings-global                      ← global policy
//   admin-settings-space-{spaceKey}            ← per-space policy
//   notification-{timestamp}-{random}          ← TTL=5min toast/banner
//   recent-notifications                       ← TTL=1h, last 10 events
//   space-scan-status-{spaceId}                ← long-running job state

// "Show me every seal in this space":
const sealsInSpace = await kvs
  .query()
  .where('key', WhereConditions.beginsWith(`space-protection-${spaceId}-`))
  .limit(100)
  .getMany();

// Cursor-paginate when the result might exceed 100:
let cursor;
do {
  const page = await kvs.query()
    .where('key', WhereConditions.beginsWith('protection-'))
    .limit(100)
    .cursor(cursor)
    .getMany();
  for (const r of page.results) yield r;
  cursor = page.nextCursor;
} while (cursor);
```

**Tradeoffs:** Prefix queries scale to ~24 MB/s per index value (the KVS limit). Above that, switch to bucketed prefixes (`protection-{shard}-{attachmentId}`).

**Source:** Sentinel Vault `src/server/capsules/sealing/logic.js`, `src/server/capsules/policies/logic.js`.

---

## 3. Content-property version handling

**Problem:** Content properties (per-page metadata exposed via `/wiki/api/v2/pages/{id}/properties`) require a **version number** on PUT. A mismatched version returns `409 Conflict`. Forgetting this is the #1 content-property bug.

**Pattern:** GET first, increment, PUT with the new number.

```javascript
import api, { route } from '@forge/api';

async function setContentProperty(pageId, key, value) {
  // 1) Look up the existing property (if any) to read its current version
  const get = await api.asApp().requestConfluence(
    route`/wiki/api/v2/pages/${pageId}/properties?key=${key}&limit=1`
  );
  const list = await get.json();
  const existing = list.results?.[0];

  if (!existing) {
    // First-time create: no version, just POST
    return api.asApp().requestConfluence(
      route`/wiki/api/v2/pages/${pageId}/properties`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value }),
      }
    );
  }

  // Existing: PUT with version.number = current + 1
  const next = (existing.version?.number ?? 1) + 1;
  return api.asApp().requestConfluence(
    route`/wiki/api/v2/pages/${pageId}/properties/${existing.id}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value, version: { number: next } }),
    }
  );
}
```

**Same trap exists for page bodies** — see `28-adf-and-storage-format.md`.

**Source:** Sentinel Vault `src/server/infra/doc-surgery.js` (write-flag pattern around content properties).

---

## 4. ADF tree surgery (recursive traversal)

**Problem:** You need to find or remove specific nodes in a page's ADF body — e.g. an extension/macro your app placed earlier — without rewriting the whole page or losing user content.

**Pattern:** Recursive walker that returns a *new* tree with the targeted nodes filtered.

```javascript
// Find every media file id referenced in the doc (used by content protection)
export function collectMediaFileIds(node, out = new Set()) {
  if (node?.type === 'media' && node.attrs?.id) out.add(node.attrs.id);
  if (Array.isArray(node?.content)) {
    for (const child of node.content) collectMediaFileIds(child, out);
  }
  return out;
}

// Remove all extension nodes whose extensionKey matches a target value
export function removeExtensions(node, extensionKey) {
  if (Array.isArray(node?.content)) {
    node.content = node.content
      .filter((c) => !(c.type === 'extension' && c.attrs?.extensionKey === extensionKey))
      .map((c) => removeExtensions(c, extensionKey));
  }
  return node;
}

// Inject your macro extension at the top of a page body
export function injectExtensionAtTop(adfDoc, extensionKey, parameters) {
  const node = {
    type: 'extension',
    attrs: {
      extensionType: 'com.atlassian.ecosystem',
      extensionKey,
      parameters,
    },
  };
  return { ...adfDoc, content: [node, ...(adfDoc.content ?? [])] };
}
```

**Source:** Sentinel Vault `src/server/infra/doc-surgery.js`.

---

## 5. App-account-id loop prevention

**Problem:** Your trigger fires on `avi:confluence:updated:page`. Your handler updates the page. The update fires the trigger again. Infinite loop.

**Pattern:** First defense is `filter.ignoreSelf: true` in the manifest. Belt-and-braces: cache the app's own `accountId` in KVS and discard events where the actor matches.

```javascript
// One-time bootstrap, cached in KVS
import api, { route } from '@forge/api';
import { kvs } from '@forge/kvs';

let _appAccountId = null;
export async function getAppAccountId() {
  if (_appAccountId) return _appAccountId;
  const cached = await kvs.get('app-account-id');
  if (cached) return (_appAccountId = cached);

  const r = await api.asApp().requestConfluence(route`/wiki/rest/api/user/current`);
  const { accountId } = await r.json();
  await kvs.set('app-account-id', accountId);
  return (_appAccountId = accountId);
}

// In every trigger handler:
export async function onPageUpdated(event) {
  const appId = await getAppAccountId();
  if (event.atlassianId === appId) return; // skip our own writes
  // …real work…
}
```

**Source:** Sentinel Vault `src/server/triggers.js` (uses cached app account ID from KVS).

---

## 6. Native @mention notifications via storage-format XML

**Problem:** You want to notify a specific user when something happens on a page (seal violation, license expiring, etc.) without integrating SendGrid / Resend / SMTP.

**Pattern:** Post a footer comment that contains an `<ac:link><ri:user/>` mention. Confluence's notification engine emails the mentioned user according to *their* preferences — no external service required.

```javascript
import api, { route } from '@forge/api';

export async function postMentionComment({ pageId, accountId, message }) {
  // Storage format — note the lowercase ac: and ri: namespaces
  const storageBody = `
    <p>
      <ac:link>
        <ri:user ri:account-id="${accountId}"/>
      </ac:link>
      ${escapeXml(message)}
    </p>
  `;

  return api.asApp().requestConfluence(route`/wiki/api/v2/footer-comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pageId,
      body: { representation: 'storage', value: storageBody },
    }),
  });
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
```

**Why storage format and not ADF mention?** Both formats accept mentions, but in practice the storage form is more reliable for triggering Confluence's email notification path. Sentinel Vault uses this exclusively.

**Source:** Sentinel Vault `src/server/infra/notice-blueprints.js`, `outbound-notify.js`.

---

## 7. Cursor-paginated space scan from a queue

**Problem:** Scanning every page in a 10k-page space can't fit in a 25-second resolver, can't fit in a single 25-second trigger, and even a 900-second consumer can't always do it in one shot if you respect rate limits.

**Pattern:** A scheduled trigger pushes a "scan job" onto a queue. The consumer pages through `/wiki/api/v2/spaces/{id}/pages?limit=100&cursor=...` until exhausted. State is keyed by `jobId` so reruns are idempotent.

```javascript
import api, { route } from '@forge/api';
import { kvs } from '@forge/kvs';
import { Queue } from '@forge/events';

const scanQueue = new Queue({ key: 'space-scan-queue' });

export async function scanScheduledTrigger() {
  const tracked = (await kvs.get('tracked-spaces')) ?? [];
  for (const space of tracked) {
    const meta = await kvs.get(`space-scan-status-${space.id}`);
    if (meta?.status === 'scanning') continue; // already in flight
    const jobId = `${space.id}-${Date.now()}`;
    await kvs.set(`space-scan-status-${space.id}`, { status: 'scanning', jobId });
    await scanQueue.push({ body: { jobId, spaceId: space.id } });
  }
}

export async function spaceScanConsumer(event) {
  const { jobId, spaceId } = event.body;
  let cursor;
  let processed = 0;

  do {
    const url = cursor
      ? `/wiki/api/v2/spaces/${spaceId}/pages?limit=100&cursor=${cursor}`
      : `/wiki/api/v2/spaces/${spaceId}/pages?limit=100`;
    const r = await api.asApp().requestConfluence(route`${url}`);
    const data = await r.json();
    for (const page of data.results) await visit(page); // rate-limit-aware
    processed += data.results.length;
    cursor = data._links?.next
      ? new URL(data._links.next, 'https://x').searchParams.get('cursor')
      : null;
  } while (cursor);

  await kvs.set(`space-scan-status-${spaceId}`, {
    status: 'done', jobId, processed, finishedAt: new Date().toISOString(),
  });
}
```

**Optimization:** keep a `protections-last-modified` (or similar) timestamp in KVS. Skip the scan entirely if nothing has changed since the last run. Sentinel Vault's hourly index cron does this — without it, every hourly run re-scans every page in every space, which is prohibitive.

**Source:** Sentinel Vault `src/server/capsules/realms/scan-worker.js`.

---

## 8. Three-level Confluence authorization

**Problem:** Different actions need different authority — anyone can manage their own seals, only space admins can force-unseal, only site admins can change global policy. You also want a configurable "steward group" mechanism.

**Pattern:** OR three checks: site admin (Confluence groups), space admin (`/wiki/rest/api/space/{spaceKey}/permission/check`), explicit allowlist in KVS.

```javascript
async function isSiteAdmin(accountId) {
  const r = await api.asApp().requestConfluence(
    route`/wiki/rest/api/user?accountId=${accountId}&expand=groups`
  );
  if (!r.ok) return false;
  const { groups } = await r.json();
  return (groups?.results ?? []).some(
    (g) => g.name === 'site-admins' || g.name === 'confluence-administrators'
  );
}

async function hasSpaceAdmin(accountId, spaceKey) {
  const r = await api.asApp().requestConfluence(
    route`/wiki/rest/api/space/${spaceKey}/permission/check`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject: { type: 'user', identifier: accountId }, operation: 'administer' }),
    }
  );
  if (!r.ok) return false;
  const { hasPermission } = await r.json();
  return Boolean(hasPermission);
}

async function isInExplicitAllowlist(accountId, spaceKey) {
  const policy = await kvs.get(`admin-settings-space-${spaceKey}`);
  return Boolean(policy?.stewards?.includes(accountId));
}

export async function isSteward(accountId, spaceKey) {
  if (await isSiteAdmin(accountId)) return true;
  if (await hasSpaceAdmin(accountId, spaceKey)) return true;
  return isInExplicitAllowlist(accountId, spaceKey);
}
```

**Source:** Sentinel Vault `src/server/shared/steward-checks.js`.

---

## 9. HMAC-signed web trigger for self-service flows

**Problem:** You want to send a user an email link that lets them perform a privileged action (reactivate their account, approve a change, etc.) without forcing them through Atlassian login first.

**Pattern:** Sign a token with HMAC-SHA256 over `{accountId, action, expiresAt}`, embed it in the URL, and verify on receipt with `timingSafeEqual`.

```javascript
import { createHmac, timingSafeEqual } from 'crypto';
import { kvs } from '@forge/kvs';

async function getSecret() {
  return (await kvs.getSecret('hmac-secret')) || process.env.HMAC_SECRET;
}

export async function mintToken({ accountId, action, ttlMs = 24 * 3600 * 1000 }) {
  const secret = await getSecret();
  const expiresAt = Date.now() + ttlMs;
  const payload = `${accountId}:${action}:${expiresAt}`;
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return Buffer.from(`${payload}:${sig}`).toString('base64url');
}

export async function verifyToken(token) {
  const decoded = Buffer.from(token, 'base64url').toString('utf8');
  const [accountId, action, expiresAtStr, sig] = decoded.split(':');
  if (!sig || Date.now() > Number(expiresAtStr)) return null;
  const secret = await getSecret();
  const expected = createHmac('sha256', secret)
    .update(`${accountId}:${action}:${expiresAtStr}`)
    .digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return { accountId, action, expiresAt: Number(expiresAtStr) };
}

// Web trigger handler
export async function handleReactivation(event) {
  const url = new URL(event.url);
  const token = url.searchParams.get('t');
  const claims = await verifyToken(token);
  if (!claims) return { statusCode: 401, body: 'invalid or expired' };
  if (claims.action !== 'reactivate') return { statusCode: 400, body: 'wrong action' };
  await reactivateUser(claims.accountId);
  return { statusCode: 200, body: 'reactivated' };
}
```

**Source:** License Leash `src/services/auth-service.ts` (HMAC-signed reactivation links).

---

## 10. Dual-strategy `asUser` → `asApp` fallback

**Problem:** Some Confluence operations work better with user context (correct permissions); others fail entirely without app context (no user in scheduled triggers). A single helper that tries both gives you maximum coverage.

**Pattern:** Try `asUser` first; on `AUTH_TYPE_UNAVAILABLE` or transient `Hystrix`/5xx errors, fall through to `asApp`.

```typescript
import api, { route } from '@forge/api';

export async function requestWithFallback(path, opts = {}) {
  const strategies = [
    { label: 'asUser', call: () => api.asUser().requestConfluence(route`${path}`, opts) },
    { label: 'asApp',  call: () => api.asApp().requestConfluence(route`${path}`, opts) },
  ];

  for (const s of strategies) {
    try {
      const r = await s.call();
      if (r.ok) return r;
      // Hystrix circuit-breaker often returns 5xx with the word "Hystrix" in body
      const text = await r.clone().text();
      if (r.status >= 500 && text.includes('Hystrix') && s.label !== 'asApp') {
        await sleep(2000);
        continue;
      }
      return r; // any non-5xx, non-Hystrix → return for caller to inspect
    } catch (err) {
      // Forge surfaces "no user context" as PROXY_ERR AUTH_TYPE_UNAVAILABLE in scheduled triggers
      if (/AUTH_TYPE_UNAVAILABLE/i.test(String(err)) && s.label !== 'asApp') continue;
      throw err;
    }
  }
}
```

**When this matters:** scheduled triggers and consumers run with no user context — `asUser()` will throw. Wrapping every call in this fallback means the same code paths work both in user-initiated UI flows and in background jobs.

**Source:** License Leash `src/services/group-service.ts`.

---

## 11. Forge SQL config table with type helpers

**Problem:** Storing dozens of admin-tunable settings (thresholds, feature flags, secrets, schedule intervals) as individual KVS keys gets messy fast — typos, no schema, no clear "what settings exist?" answer.

**Pattern:** A single `app_config (config_key, config_value, updated_at)` table in Forge SQL, accessed via typed helpers and a constant manifest of key names.

```typescript
// src/utils/constants.ts
export const CONFIG_KEYS = {
  INACTIVITY_DAYS:  'inactivity_days',
  LICENSE_LIMIT:    'license_limit',
  DRY_RUN:          'dry_run',
  HMAC_SECRET:      'hmac_secret',
  ORG_API_KEY:      'org_api_key',
  ORG_ID:           'org_id',
  REACTIVATION_URL: 'reactivation_url',
} as const;
```

```typescript
// src/services/config-service.ts
import { sql } from '@forge/sql';
import { CONFIG_KEYS } from '../utils/constants.js';

export async function getConfigValue(key: string): Promise<string | null> {
  const r = await sql
    .prepare<{ config_value: string }>('SELECT config_value FROM app_config WHERE config_key = ?')
    .bindParams(key)
    .execute();
  return r.rows[0]?.config_value ?? null;
}

export async function getConfigNumber(key: string, fallback: number): Promise<number> {
  const v = await getConfigValue(key);
  return v == null ? fallback : Number(v);
}

export async function getConfigBoolean(key: string, fallback: boolean): Promise<boolean> {
  const v = await getConfigValue(key);
  return v == null ? fallback : v === 'true';
}

export async function setConfigValue(key: string, value: string): Promise<void> {
  await sql
    .prepare(
      `INSERT INTO app_config (config_key, config_value, updated_at)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE config_value = VALUES(config_value), updated_at = VALUES(updated_at)`
    )
    .bindParams(key, value, new Date().toISOString())
    .execute();
}
```

**Why SQL not KVS:** atomic upserts (`ON DUPLICATE KEY UPDATE`), one row per setting (not one KVS write per setting → less rate-limit pressure), and you get a real schema for migrations.

**Source:** License Leash `src/services/config-service.ts`.

---

## 12. Resolver middleware (`withMigrations`) wrapper

**Problem:** Every resolver action needs the SQL schema present and up-to-date, but you don't want to run migrations on every cold start manually.

**Pattern:** A higher-order function that wraps every action with an idempotent `ensureMigrations()` call.

```typescript
import Resolver from '@forge/resolver';
import { ensureMigrations } from '../services/migration-service.js';

const resolver = new Resolver();

function withMigrations<A extends any[], R>(fn: (...args: A) => Promise<R>) {
  return async (...args: A) => {
    await ensureMigrations(); // idempotent — uses a "current_schema_version" row
    return fn(...args);
  };
}

resolver.define('getStats',     withMigrations(getStats));
resolver.define('syncNow',      withMigrations(syncNow));
resolver.define('updateConfig', withMigrations(updateConfig));
// 13 more…

export const handler = resolver.getDefinitions();
```

**Source:** License Leash `src/resolvers/admin-resolver.ts`.

---

## 13. Atlassian Admin (Org) API integration from a Forge app

**Problem:** You need data from `https://api.atlassian.com/admin/...` (org users, group memberships, last-active timestamps) — but Forge's `api.asApp().requestConfluence()` cannot reach that host.

**Pattern:** Allowlist `api.atlassian.com`, store an Admin API key as a KVS secret (or read from `process.env`), and call out via `api.fetch`.

```typescript
import api from '@forge/api';
import { kvs } from '@forge/kvs';

let cachedKey: string | null = null;
let cachedOrgId: string | null = null;

async function getCredentials() {
  if (!cachedKey || !cachedOrgId) {
    cachedKey   = process.env.ORG_API_KEY  ?? (await kvs.getSecret('org_api_key'));
    cachedOrgId = process.env.ORG_ID       ?? (await kvs.get('org_id'));
  }
  return cachedKey && cachedOrgId ? { apiKey: cachedKey, orgId: cachedOrgId } : null;
}

export async function orgFetch(path: string, init: RequestInit = {}) {
  const creds = await getCredentials();
  if (!creds) throw new Error('Admin API credentials not configured');
  return api.fetch(`https://api.atlassian.com/admin${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${creds.apiKey}`,
      Accept: 'application/json',
      ...(init.headers ?? {}),
    },
  });
}
```

```yaml
# manifest.yml — required for the fetch above to work
permissions:
  external:
    fetch:
      backend:
        - api.atlassian.com
```

> **Don't** sign a JWT locally and pass it as a Bearer token — `api.atlassian.com/admin` does not validate locally-signed JWTs. Use an Admin API key (issued at admin.atlassian.com → Settings → API keys) or an OAuth 2.0 access token. See the sibling `atlassian-organizations-api-skill` for full coverage.

**Source:** License Leash `src/services/org-api-service.ts`.

---

## 14. Email without a third-party provider (Jira issue notify trick)

**Problem:** You want to email a user but don't want to integrate Resend/SendGrid/SMTP and the Confluence "post a mention comment" trick (Pattern 6) doesn't fit your flow (no page context, etc.).

**Pattern:** If you have Jira in the same site, create a single dummy issue per app installation, then `POST /rest/api/3/issue/{key}/notify`. Jira's notification engine emails the chosen recipients with your subject + HTML body.

```typescript
import api, { route } from '@forge/api';

export async function sendEmailViaJira({
  issueKey,           // a dummy issue you created at install time, persisted in config
  toAccountIds,
  subject,
  htmlBody,
}: { issueKey: string; toAccountIds: string[]; subject: string; htmlBody: string }) {
  return api.asApp().requestJira(route`/rest/api/3/issue/${issueKey}/notify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subject,
      htmlBody,
      to: { users: toAccountIds.map((accountId) => ({ accountId })) },
    }),
  });
}
```

**Constraints:**
- Requires Jira on the same site, plus `write:jira-work` and the persisted issue key.
- Recipients must be Jira users.
- Body is HTML (subset). Don't expect the same fidelity as a real mail provider.

**Source:** License Leash `src/services/email-service.ts`.

---

## 15. Eventual-consistency protection (trust your local audit, not the REST group)

**Problem:** You remove user X from a group via the Org API or Confluence REST. Two minutes later, your "is X in group?" check returns `true` because the index hasn't propagated yet. Your reactivation flow now lets X "reactivate" even though they were never actually deactivated.

**Pattern:** Treat REST group membership as eventual; trust your local audit log (the row your app wrote when it called the deactivation endpoint) as the source of truth for app-level state machines.

```typescript
// reactivation-eligibility.ts
export async function isUserDeactivatedByApp(accountId: string): Promise<boolean> {
  // Read OUR audit table, not a Confluence REST group check
  const r = await sql.prepare<{ action: string; performed_at: string }>(
    `SELECT action, performed_at
       FROM deactivation_log
      WHERE account_id = ?
      ORDER BY performed_at DESC
      LIMIT 1`,
  ).bindParams(accountId).execute();

  const last = r.rows[0];
  if (!last) return false;
  return last.action === 'deactivate';
}
```

```typescript
// In the reactivation handler:
if (!(await isUserDeactivatedByApp(accountId))) {
  return { statusCode: 400, body: 'not eligible — no record of app-initiated deactivation' };
}
// proceed with reactivation
```

**Why this matters:** without this, race conditions between trigger handlers, REST writes, and group-index propagation cause spurious "user deactivated and reactivated three times in 90 seconds" loops. Trusting your own log breaks the tie.

**Source:** License Leash `src/services/reactivation-eligibility.ts`.

---

## See also

- `26-async-events-and-queues.md` — `@forge/events` reference (queues, retries)
- `27-faas-limits-and-cost.md` — quotas these patterns work around
- `28-adf-and-storage-format.md` — page body formats, `version.number`, ADF construction helpers
- `12-permissions-scopes.md` — required scopes for the REST calls used above
