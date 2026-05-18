# Production Patterns

Thirty patterns extracted from real production migration scripts. Each is a small, self-contained idiom you can adapt for new jobs.

## 1. Resumable plan with autosave

Every mutating run can crash mid-flight. The PlanManager autosaves every 50 updates so a crash never costs more than ~50 entries of state. On restart, `getEntriesToProcess()` skips `completed` rows automatically.

```javascript
const pm = new PlanManager("logs");
pm.loadPlan(planFile);
for (const [id, data] of pm.getEntriesToProcess(opts.retryFailed)) {
  // process ...
  pm.updateEntryStatus(id, "completed");   // autosaves every 50
}
pm.savePlan();                              // final flush
```

**When to use:** every migration script. There is no good reason to opt out.

## 2. Two-gate safety

The mutating script refuses to run without explicit operator confirmation. `--dry-run` is the override that produces a safe preview.

```javascript
if (!opts.dryRun && !opts.confirm) {
  console.error("Refusing to mutate without --confirm. Use --dry-run for a preview.");
  process.exit(2);
}
```

**When to use:** any script that writes to a destination. Add this in the first ten lines of `sync.js`.

## 3. 409 retry on version conflict

Confluence pages and content properties have an optimistic-locking `version.number`. If two writers race, the second `PUT` returns 409. The fix is to re-fetch, bump the version, and replay:

```javascript
async updatePageStorage(pageId, ..., currentVersion, ...) {
  const payload = { ..., version: { number: currentVersion + 1, ... } };
  try {
    return await this.makeRequest("PUT", `/rest/api/content/${pageId}`, payload);
  } catch (err) {
    if (err.statusCode === 409) {
      const fresh = await this.getPageStorage(pageId);
      payload.version.number = fresh.version.number + 1;
      return await this.makeRequest("PUT", `/rest/api/content/${pageId}`, payload);
    }
    throw err;
  }
}
```

**When to use:** any Confluence page or property update. Built into `cloud-confluence-client.js`.

## 4. ADF surgery (mutate-by-id only)

ADF (Atlassian Document Format) JSON is a tree of nodes. Each macro / mention / link has a stable `marks[].attrs.id` or `attrs.id`. Surgical edits should match on these IDs, not on tree position:

```javascript
function mutateAdfById(adf, targetId, transform) {
  function walk(node) {
    if (!node || typeof node !== "object") return;
    if (node.attrs?.id === targetId) {
      transform(node);
    }
    for (const child of node.content || []) walk(child);
  }
  walk(adf);
  return adf;
}
```

**When to use:** Confluence storage-format or ADF rewriting (e.g. translating macros, fixing broken IDs post-migration). NEVER use array indices to identify nodes — they're not stable across edits.

## 5. Attachment upload with CSRF header

Jira's attachment endpoint rejects POSTs without the `X-Atlassian-Token: no-check` header (CSRF protection). The error message doesn't mention CSRF — it just says 403.

```javascript
options.headers["X-Atlassian-Token"] = "no-check";
```

**When to use:** every multipart upload. Always. Built into `cloud-jira-client.js#uploadAttachment`.

## 6. ID-map persistence as single source of truth

Every entity ID changes during migration. Persist the source→destination map once at plan time, consume it everywhere else:

```javascript
// During plan
const userMap = {};
for (const u of usersToMigrate) {
  userMap[u.email] = (await resolver.resolveUser(u)).accountId;
}
fs.writeFileSync("mappings/users.json", JSON.stringify(userMap, null, 2));

// During sync
const userMap = require(path.resolve("mappings/users.json"));
const reporterAccountId = userMap[entry.reporterEmail];
```

The map is committed to git. It's small (one row per entity), reviewable, and the audit script can verify it against the actual destination.

**When to use:** every multi-phase migration.

## 7. displayName disambiguation when email is null

When email lookup fails (privacy-restricted users), display-name search may return multiple matches. Don't guess:

```javascript
const matches = await client.searchUsers(displayName);
const exact = matches.filter((u) =>
  (u.displayName || "").toLowerCase() === displayName.toLowerCase(),
);
if (exact.length === 1) return exact[0].accountId;
if (exact.length > 1) return { accountId: null, multiMatch: true };  // require operator
return { accountId: null, source: "miss" };
```

Record `multiMatch` in the plan and surface in `failed_<runId>.csv` for operator triage.

**When to use:** any DC→Cloud migration touching users.

## 8. Custom-field-by-name lookup with type check

Custom field IDs never carry. Build a name+type map at the start of every run:

```javascript
async function buildFieldMap(sourceClient, destClient) {
  const src = await sourceClient.buildCustomFieldNameMap();
  const dst = await destClient.buildCustomFieldNameMap();
  const map = {};
  for (const [name, srcMeta] of src) {
    const dstMeta = dst.get(name);
    if (!dstMeta) { map[srcMeta.id] = null; continue; }   // missing in destination
    if (dstMeta.type !== srcMeta.type) { map[srcMeta.id] = null; continue; }   // type mismatch
    map[srcMeta.id] = dstMeta.id;
  }
  return map;
}
```

**When to use:** any migration moving values through custom fields. Required.

## 9. Audit-after-sync sample sweep

Every sync script must have a matching audit script. Sample 150 entries with a seeded RNG, re-fetch from the destination, compare:

```javascript
const sample = seededSample(completedEntries, 150, opts.seed || 42);
for (const [id, data] of sample) {
  const issue = await cloud.getIssue(data.destKey);
  const actual = issue.fields[data.fieldId];
  const match = JSON.stringify(actual) === JSON.stringify(data.newValue) ? "PASS" : "FAIL";
  await csv.writeRow({ source_id: id, field: data.fieldId, expected: data.newValue, actual, match, ... });
}
```

**When to use:** every migration. The cost is small (1 read per sampled entry); the value is high (proves the sync's claims).

## 10. Forge KVS bulk write with appSystemToken

When mending Forge app data from outside the app, request the system token via manifest and forward to the KVS REST endpoint:

```javascript
// Inside the Forge app's remote handler
const systemToken = req.headers["x-forge-oauth-system"];
await fetch("https://api.atlassian.com/forge/storage/kvs/v1/set", {
  method: "POST",
  headers: { Authorization: `Bearer ${systemToken}`, "Content-Type": "application/json" },
  body: JSON.stringify({ keys: bulkKvs }),
});
```

**When to use:** mending Forge app data after JCMA (where stable IDs changed but the app's KVS records still reference the old ones). See `29-forge-kvs-remote-mending.md`.

## 11. macroId-then-ordinal hybrid matching

When rewriting Confluence macros, prefer matching by stable `macroId`; fall back to ordinal position when the macroId is unavailable or was lost in migration:

```javascript
for (let j = 0; j < plannedMacros.length; j++) {
  const planned = plannedMacros[j];
  const matched =
    (planned.macroId && !planned.macroId.startsWith("idx-") && idMap.get(planned.macroId))
    || actualMacrosOnPage[j]    // ordinal fallback
    || null;
  if (!matched) { /* record as failed */ continue; }
  // ... apply rewrite to matched ...
}
```

Always record which path was taken (`matched=byId` vs `matched=ordinal`) so the audit phase can see the data quality.

**When to use:** content-format migrations (macros, content properties, anchored references).

## 12. Bulk endpoints to save rate-limit points

Replace single-entity loops with bulk calls wherever the API offers them:

| One-at-a-time | Bulk equivalent | Savings |
|---|---|---|
| `GET /issue/{key}` × N | `POST /issue/bulkfetch` (N ≤ 100) | 100× |
| `GET /issue/{key}/changelog` × N | `POST /changelog/bulkfetch` (N ≤ 100) | 100× |
| `GET /user?accountId=X` × N | `GET /user/bulk?accountId=X1&accountId=X2&...` (N ≤ 90) | 90× |
| `POST /issue` × N (create) | `POST /issue/bulk` (N ≤ 50) | 50× |
| `DELETE /issue/{key}` × N | `POST /bulk/issues/delete` (N ≤ 1000) | 1000× |

**When to use:** any time you're processing N entities of the same type. The bulk endpoint costs the same as a single call.

## 13. Semantic-hash no-op detection

Before writing, compare a semantic hash of the planned state against the current destination. Equal hashes mean the write is a no-op — skip it. Avoids version-number bumps and wasted rate-limit points.

```javascript
const adf = require("../src/adfBuilders");
const current = await jira.getIssue(issueKey, "description");
if (adf.semanticHash(planned) === adf.semanticHash(current.fields.description)) {
  planManager.updateEntryStatus(issueKey, "skipped", "destination already matches");
  return;
}
```

For Confluence storage XHTML, use `BackupManager.storageHash(xml)` (whitespace-collapse + SHA1).

**When to use:** any mutation where the destination might already match the plan (re-runs, planned-from-stale-source scenarios).

## 14. Intervention detection on rollback

Before rolling back a write, check whether someone else has edited the entity in the meantime. If the current version > the recorded post-write version, refuse to clobber:

```javascript
if (currentVersion > recordedVersion) {
  return { status: "skipped-intervening", reason: "third-party edit; manual rollback required" };
}
```

**When to use:** any rollback path. Built into `backupManager.rollbackFromConfluenceHistory`. Auto-rolling-back a freshly-edited page destroys the new content.

## 15. Multi-pass rewrite pipeline

Complex transforms (JQL post-JCMA cleanup, ADF migration) are easier as several pure-function passes than one mega-function. Each pass is idempotent and testable in isolation.

```javascript
let jql = filter.jql;
let r;
r = rewriteFilterIds(jql, filterMap);    jql = r.rewritten;
r = rewriteAqlFunctionBodies(jql, aql);  jql = r.rewritten;
r = sanitizeJql(jql, { cfMap, fieldRenames }); jql = r.sanitized;
// ... etc
```

**When to use:** any transform that's a chain of independent rules. Order matters — sanitization usually runs last because earlier passes introduce strings that need quoting.

## 16. State-machine per entity for resumable sync

Long-running per-entity flows (e.g. filter rewrite: fetch → owner-swap → update → owner-restore → verify) checkpoint at each step. A crash resumes from the last completed step, not from scratch.

```javascript
planManager.addEntry(id, { state: "fetched", currentJql: jql, /* ... */ });
// ... step 1: owner swap
planManager.patchEntry(id, { state: "owner-swapped", originalOwner: prev });
// ... step 2: update
planManager.patchEntry(id, { state: "updated", newJql });
// ... step 3: restore owner
planManager.patchEntry(id, { state: "owner-restored" });
planManager.updateEntryStatus(id, "completed");
```

**When to use:** multi-step mutations where partial completion leaves the destination in a weird state. The state field tells re-runs where to pick up.

## 17. Owner-swap to bypass permission denials

Some Jira admin operations require the operator to own the target (e.g. updating a filter you don't own returns 403). Workaround: temporarily change the owner to yourself, update, then restore. Always paired with a try/finally so the restore happens even on failure:

```javascript
const original = filter.owner.accountId;
await jira.makeRequest("PUT", `/rest/api/3/filter/${filter.id}/owner`, { accountId: myAccountId });
try {
  await jira.makeRequest("PUT", `/rest/api/3/filter/${filter.id}`, { jql: newJql });
} finally {
  await jira.makeRequest("PUT", `/rest/api/3/filter/${filter.id}/owner`, { accountId: original });
}
```

**When to use:** filter updates, dashboard updates, any owner-locked endpoint. Record the original owner in the plan so failures don't leave swapped ownership.

## 18. Multi-source resolution with fallbacks

Some destination identifiers can be resolved from multiple source fields. Look in order:

```javascript
function findIssueParent(issue) {
  // 1. Native subtask relationship
  if (issue.fields.parent) return issue.fields.parent.key;
  // 2. Epic Link custom field
  if (issue.fields.customfield_10014) return issue.fields.customfield_10014;
  // 3. Parent Link custom field
  if (issue.fields.customfield_10500) return issue.fields.customfield_10500;
  // 4. Generic parent
  if (issue.fields.parent?.key) return issue.fields.parent.key;
  return null;
}
```

Record which source resolved the value in the plan (`{parentSource: "epicLink"}`) so the audit can verify the right relationship type.

**When to use:** identity resolution, parent/child relationships, custom-field cascades. Always log the source for traceability.

## 19. Sub-plan splitting for huge datasets

A 150,000-entry plan file is unwieldy — slow to load, hard to diff, OOM risk. Split by entity sub-type or partition key:

```javascript
// instead of one plan_<runId>.json with 150k entries
// → many plan_<runId>_<fieldId>.json files, one per custom field

for (const fieldId of customFieldIds) {
  const pm = new PlanManager(`logs/sub-plans`, console.log);
  pm.createPlan(`${runId}_${fieldId}`);
  for (const issue of issuesWithField(fieldId)) {
    pm.addEntry(issue.key, { fieldId, /* ... */ });
  }
  pm.savePlan();
}
```

A master plan_master.json then indexes the sub-plans:

```json
{ "version": "1.0", "runId": "...", "subPlans": [
  "plan_1779_customfield_10318.json",
  "plan_1779_customfield_10319.json"
]}
```

Sync can target a single sub-plan: `--plan-file logs/plan_1779_customfield_10318.json`.

**When to use:** plans >50k entries, plans you want to parallelize across operators, plans where re-running a single shard is desirable.

## 20. Cloud catalog snapshot at run start

Resolving "what's the destination's ID for X" lookups (custom field by name, status by name, group by name) is repetitive and rate-limit-expensive. Snapshot once at the start; consume the cached catalog everywhere:

```javascript
const CloudCatalog = require("../src/cloudCatalog");
const cat = new CloudCatalog(jira, "mappings/cloud-catalog.json");
await cat.refresh();   // hits API once; subsequent runs read the JSON cache

const fieldId = cat.fieldByName("Story Points")?.id;
const statusId = cat.statusByName("In Progress")?.id;
const { map: fieldMap, warnings } = cat.buildFieldMapFrom(sourceCatalog);
```

The catalog file is JSON and reviewable. Check it into git for audit.

**When to use:** any migration that resolves more than a handful of cross-tenant identifiers.

## 21. Instance fingerprinting

Stamp the (sourceBaseUrl, destBaseUrl) pair into the plan at creation time. At sync time, verify the pair matches the current configuration. If not, refuse to proceed unless explicitly overridden:

```javascript
// Plan time
planManager.addEntry("__meta__", {
  instanceSignature: instanceFingerprint.build({
    destBaseUrl: process.env.CLOUD_BASE_URL,
    sourceBaseUrl: process.env.DC_BASE_URL,
  }),
});

// Sync time
instanceFingerprint.verify(plan.entries.__meta__.instanceSignature, {
  destBaseUrl: process.env.CLOUD_BASE_URL,
  sourceBaseUrl: process.env.DC_BASE_URL,
  allowMismatch: opts.allowInstanceMismatch,
});   // throws on mismatch
```

**When to use:** every plan that mutates. Prevents catastrophic wrong-tenant writes when someone re-uses a plan against the wrong destination.

## 22. Preflight staleness check

Before the sync phase mutates anything, re-fetch the source for each plan entry and compare against what the plan recorded. Bucket the results (same / drift / missing-in-source / fetch-error). Refuse to proceed if drift exceeds a threshold.

```javascript
const { preflight } = require("../src/preflight");
const report = await preflight({
  entries: planManager.getEntriesToProcess(opts.retryFailed),
  fetchCurrent: async (id, data) => await dcClient.getIssue(data.sourceKey, "summary,parent"),
  comparator: (planned, actual) => {
    if (!actual) return "missing-in-source";
    return planned.sourceSummary === actual.fields.summary ? "same" : "drift";
  },
});
if (report.driftRatio > 0.10) process.exit(2);
```

**When to use:** any plan applied more than a few hours after creation. Mandatory for handed-off plans, maintenance-window plans, plans against high-velocity data. See `docs/12-preflight-and-staleness.md` for the full pattern.

## 23. Owner-swap with try/finally + orphan CSV

Jira's filter/dashboard PUT endpoints reject non-owners with 403. Temporarily change owner to yourself, mutate, restore — wrapped in a try/finally that logs orphaned swaps to a CSV if the restore itself fails.

```javascript
const { withOwnerSwap } = require("../src/ownerSwap");

await withOwnerSwap(jira, "filter", filter.id, filter.owner.accountId, myAccountId, async () => {
  await jira.makeRequest("PUT", `/rest/api/3/filter/${filter.id}`, { jql: newJql });
});
// → If the inner mutation succeeded but restoreOwner failed, the orphan is
//   appended to logs/orphan_owner_swaps.csv for manual cleanup.
```

**When to use:** filter rewrites, dashboard updates, any owner-locked endpoint. Never wrap the swap and restore in raw try/catch — the orphan-CSV path is essential for accountability.

## 24. ARI parsing for asset references

Asset / CMDB references in JQL appear in three shapes after JCMA: ARI (`ari:cloud:cmdb::object/<workspaceId>/<objectId>`), asset key (`CI-21171`), or DC numeric objectId. The ARI tail is always the most-specific identifier — parse and dispatch to the right lookup map:

```javascript
const ARI_RE = /^ari:cloud:[^/]+\/(?:[^/]+\/)*([A-Z][A-Z0-9_]*-\d+|\d+)$/i;
const m = value.match(ARI_RE);
if (m) {
  const tail = m[1];
  const name = /^\d+$/.test(tail)
    ? cloudObjectIdToCloudName.get(tail)     // numeric → objectId lookup
    : cloudKeyToCloudName.get(tail);          // alphanumeric → asset key lookup
}
```

**When to use:** any post-JCMA filter JQL cleanup involving Assets/CMDB fields. The `templates/asset-field-rewriter.js` template handles the full resolution chain (ARI → DC key → DC objectId → fallback).

## 25. Stable cursor sorting for resumable discovery

When paginating discovery with cursors, sort by an immutable field (issue `key ASC`, `created ASC`, page `id ASC`). Mutable sorts like `updated DESC` shift between pages — pages 2-N may miss issues that moved up.

```javascript
// GOOD — stable
await jira.searchIssuesByJql(
  `project = ABC AND status != Done ORDER BY key ASC`,
  { fields: ["summary"] },
  async (issues) => { /* ... */ },
);

// BAD — pages drift as new issues are created/updated
await jira.searchIssuesByJql(
  `project = ABC ORDER BY updated DESC`,
  { fields: ["summary"] },
  async (issues) => { /* ... */ },
);
```

**When to use:** any pagination that may resume after a crash, span multiple operator sessions, or compare to a previous run. The order doesn't need to be meaningful — it just needs to be stable.

## 26. Two-sided DC↔Cloud backup-restore pair

For entities that exist as different identifier shapes in DC vs Cloud (page restrictions with usernames, space admins, permission overrides), ship a *pair* of scripts: one runs on DC to capture state to a portable JSON, the second runs against Cloud to re-apply after the migration cutover.

```
DC side:
  remove_restrictions_dc.js
    → scan all restrictions
    → backup to backups/restrictions_<ts>.json (with DC usernames)
    → DELETE the restrictions

Cloud side (post-migration):
  restore_restrictions_cloud.js --backup backups/restrictions_<ts>.json
    → load backup
    → for each entity: resolve username → accountId via IdentityResolver
    → re-apply restrictions on the Cloud side
```

**When to use:** any cleanup that must straddle the source-shutdown / cloud-cutover boundary. The portable JSON is your single source of truth across the gap. See `templates/backup-manager.js` for the snapshot half; the restore half is per-domain.

## 27. Stratified audit sampling by bucket

Uniform random sampling biases toward whichever bucket has the most entries (one big project drowns out ten small ones). For audits that need fair coverage across projects/spaces/categories, stratify: sample N per bucket, sort buckets largest-first, cap at a max total.

```javascript
function sampleByBucket(pool, perBucket, maxTotal, rng, keyFn) {
  const buckets = new Map();
  for (const item of pool) {
    const k = keyFn(item);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(item);
  }
  // Process largest buckets first so we don't run out of budget on tiny ones
  const ordered = [...buckets.entries()].sort((a, b) => b[1].length - a[1].length);
  const sampled = [];
  for (const [, items] of ordered) {
    if (sampled.length >= maxTotal) break;
    const remaining = maxTotal - sampled.length;
    const take = Math.min(perBucket, items.length, remaining);
    for (let i = 0; i < take; i++) {
      const idx = Math.floor(rng() * items.length);
      sampled.push(items.splice(idx, 1)[0]);
    }
  }
  return sampled;
}
```

**When to use:** audit phase where coverage across buckets (projects, spaces, categories) matters more than uniform statistical sampling. Pair with Mulberry32 for reproducibility.

## 28. Discovery-dump for reverse-engineering vendor macros

When migrating data inside third-party macros (or vendor app data, or undocumented payloads), you often don't know the exact field names up front. Add a `--discovery-dump --limit 5` mode that writes raw responses to disk for inspection:

```
node main/plan.js --discovery-dump --space TEST --limit 5
  → logs/discovery_<runId>/page_<id>.xhtml         (raw storage)
  → logs/discovery_<runId>/page_<id>.macros.json   (extracted macro objects)
```

The operator opens these in an editor, identifies the relevant parameters, then tunes `--source-macro-name` / `--target-macro-name` / `--source-param` flags before running the real plan.

**When to use:** any migration touching a vendor macro / custom field / app data whose schema isn't documented or has changed across versions.

## 29. Lossy parameter audit CSV

When the source supports a parameter the destination doesn't (e.g. macro X has `additionalInformation`, macro Y has no equivalent), record the dropped data to `logs/lossy_params_<runId>.csv` so operators see what was discarded:

```csv
entity_id,kind,field,original_value,dropped_at
12345,macro,additionalInformation,"Legacy migration note",2026-05-18T08:34:12Z
```

The sync still proceeds — but the CSV gives a paper trail for "we lost X data on Y entities" so it can be re-applied manually if business-critical.

**When to use:** any transform where the destination schema is a subset of the source. Almost every Confluence macro migration. Always pair the lossy CSV with a count in the run-end summary.

## 30. Excluded-container fallback strategy

When un-nesting / flattening content, some container elements can't be split (Confluence `column`, `section`, `layout`, `details`, `tabs-group`). Offer three strategies via `--fallback-strategy`:

| Strategy | Behavior | When to use |
|---|---|---|
| `skip` | Leave the nested content where it is, mark `unfixable` in the plan | Default; safest |
| `promote` | Unwrap the container, lifting children to the parent's level | Acceptable layout simplification |
| `fail` | Treat as a hard error, refuse to plan this entity | High-stakes layouts |

```javascript
if (excludedContainers.has(node.tag)) {
  switch (opts.fallbackStrategy) {
    case "skip":    stats.unfixable++;       return null;
    case "promote": stats.promoted++;        return promoteChildren(node);
    case "fail":    throw new Error(`Cannot un-nest inside ${node.tag}`);
  }
}
```

**When to use:** any structural rewrite (un-nesting, splitting, flattening) where the tree shape constrains what's mechanically possible. The choice is per-migration — document the default in the sub-project README.

## See also

- [`templates/`](../templates/) — all of these patterns are implemented in the templates
- [`27-rate-limits-and-quotas.md`](27-rate-limits-and-quotas.md) — points math behind pattern 12
- [`28-adf-and-attachments.md`](28-adf-and-attachments.md) — ADF reference for patterns 4, 5, 13
- [`29-forge-kvs-remote-mending.md`](29-forge-kvs-remote-mending.md) — full setup for pattern 10
- [`09-backup-and-rollback.md`](09-backup-and-rollback.md) — rollback strategies behind patterns 13, 14, 26
- [`10-jql-and-aql-rewriting.md`](10-jql-and-aql-rewriting.md) — the rewriters behind patterns 15, 23, 24
- [`11-storage-format-and-adf.md`](11-storage-format-and-adf.md) — semantic hashing for pattern 13, structural rewrites for pattern 30
- [`12-preflight-and-staleness.md`](12-preflight-and-staleness.md) — drift detection behind pattern 22
