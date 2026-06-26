# Production Patterns

Thirty-five patterns extracted from real production migration scripts. Each is a small, self-contained idiom you can adapt for new jobs.

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

## 31. Streaming multipart upload with retry-safe body factory

The naive multipart upload (`Buffer.concat([head, fileContents, tail])`) reads the whole file into memory and dies on big attachments — and worse, it cannot be retried after a 429/5xx because the request body has already been consumed. The correct shape is a *body factory* that returns a fresh `Readable` every time the HTTP client needs to send the request:

```javascript
const mp = buildSingleFileMultipart({ filePath, filename, mimeType });
await client.makeMultipartRequest(
  "POST", `/rest/api/3/issue/${key}/attachments?notifyUsers=false`,
  mp.contentType, mp.contentLength, mp.createBodyStream,
  { "X-Atlassian-Token": "no-check" },
);
```

Inside the client's retry loop:

```javascript
const bodyStream = bodyFactory();          // fresh Readable on every attempt
bodyStream.on("error", (err) => { req.destroy(); reject(err); });
bodyStream.pipe(req);
```

**When to use:** every multipart upload in a script that retries. Required for attachments > a few MB. See `templates/multipart-builder.js`.

## 32. Streaming binary download with redirect-following

Jira DC attachments respond with absolute URLs (or 302/303/307 redirects to signed storage URLs). A correct downloader streams the response straight to disk, follows redirects, and applies the same 429 / 5xx / network retry policy as the JSON client — but with a longer timeout and a re-creatable destination file.

```javascript
async function downloadAttachmentToFile(downloadUrl, destPath, retryState = null) {
  // parse URL; pick http/https module by scheme
  // on 301/302/303/307/308 → recurse with state.redirects + 1 (cap at 5)
  // on 429 → honor Retry-After, exp-backoff cap 120s, cap 5 attempts
  // on 5xx → exp-backoff cap 30s, cap 5 attempts
  // on 2xx → res.pipe(fs.createWriteStream(destPath)); resolve({ bytesWritten, mimeType })
  // on out.error → fs.unlinkSync(destPath) so the next attempt starts clean
}
```

Three things the naive version gets wrong:
- Forgetting `res.resume()` on a redirect leaves the socket half-read.
- Not following 307/308 — those are the modern signed-URL redirects from Jira DC.
- Not deleting the partial file on disk error — the next retry sees a half-file and either appends garbage or silently succeeds.

**When to use:** any post-JCMA / Cloud-to-Cloud script that needs the actual bytes of an attachment, not just the metadata. `sync_issue_attachments` in jira-data is the canonical reference.

## 33. Filename + size fingerprint as idempotency key

Attachment IDs change between systems. Filename alone collides (two `screenshot.png` files on the same issue is normal). Use `${filename}::${size}` as the join key — this is exactly what Jira's web UI does for deduplication too:

```javascript
const fingerprint = (filename, size) => `${filename}::${size == null ? "?" : size}`;

const cloudFps = new Set(cloudAttachments.map((a) => fingerprint(a.filename, a.size)));
for (const dc of dcAttachments) {
  if (cloudFps.has(fingerprint(dc.filename, dc.size))) {
    // Already there — skip the upload
  }
}
```

Re-check the fingerprint set **at execute time**, not just at plan time. Between plan and execute, someone (or another worker) may have uploaded the same file:

```javascript
async _processIssue(issueKey, data) {
  this.cloudClient.invalidateAttachmentCache(issueKey);
  const fresh = await this.cloudClient.listAttachments(issueKey);
  const freshFps = new Set(fresh.map((a) => fingerprint(a.filename, a.size)));
  for (const att of data.attachments) {
    if (att.status === "pending" && freshFps.has(fingerprint(att.filename, att.size))) {
      att.status = "skipped-already-present";       // dedup during execute
    }
  }
}
```

**When to use:** any attachment re-stitching after JCMA, any Cloud↔Cloud attachment copy, any idempotent file-import script. The cost is one extra HEAD-equivalent per issue; the value is never double-uploading.

## 34. Destination policy preflight with override

Jira Cloud's `GET /rest/api/3/configuration` returns `maxAttachmentSize` (in bytes) and `attachmentsEnabled` (boolean). Check this *before* planning so the plan can classify oversize attachments as `skipped-too-large` instead of failing them at upload time. Also accept a `--max-bytes` CLI override for instances where the operator already knows the limit was raised:

```javascript
const cfg = await cloud.getConfiguration();       // cached on client (_configCache)
const maxBytes = opts.maxBytes > 0 ? opts.maxBytes
              : cfg.attachmentsEnabled === false ? 0
              : typeof cfg.maxAttachmentSize === "number" ? cfg.maxAttachmentSize
              : null;

for (const att of dcAttachments) {
  if (maxBytes != null && att.size != null && att.size > maxBytes) {
    plan.push({ ...att, status: "skipped-too-large", error: `size ${att.size} > max ${maxBytes}` });
    oversizeRows.push({ issueKey, filename: att.filename, size: att.size, maxAllowed: maxBytes });
  }
}
```

At execute time, **still handle a 413 from the actual upload** and reclassify the row as `skipped-too-large` even if the preflight said it was fine — the tenant config may have changed mid-run:

```javascript
if (result.statusCode === 413) {
  att.status = "skipped-too-large";
  att.error = `upload 413: ${result.error}`;
}
```

Always emit a separate `oversize_<runId>.csv` so the operator has a clean list of files that need to be migrated by some other means (shared drive, Confluence space, etc.).

**When to use:** every attachment migration. Also useful as a template for *any* destination-policy preflight where the destination publishes a configuration endpoint (e.g. Confluence page size limits).

## 35. Graceful shutdown that flushes plan + master index

Long-running scripts must save state on SIGINT and SIGTERM. Otherwise an operator's Ctrl+C destroys the last N updates and a re-run repeats them. Install handlers in `main()` *before* constructing the sync class, and have them save both the plan and the master index:

```javascript
async function main() {
  let sync = null;
  const shutdown = () => {
    if (sync?.planManager) {
      console.log("\nShutting down gracefully...");
      if (sync.planManager.plan)        sync.planManager.savePlan();
      if (sync.planManager.masterIndex) sync.planManager.saveMasterIndex();
    }
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  try {
    sync = new SyncClass(parseArgs());
    await sync.run();
    process.exit(0);
  } catch (error) {
    // ALSO save plan + master here — uncaught throws from the run path are the
    // most common reason state goes missing.
    if (sync?.planManager?.plan)        sync.planManager.savePlan();
    if (sync?.planManager?.masterIndex) sync.planManager.saveMasterIndex();
    console.error("Fatal:", error.message);
    process.exit(1);
  }
}
```

Two subtle requirements:
- **The throw path saves too.** A bug in the run path is the most common reason state goes missing. The catch block must mirror the SIGINT handler.
- **`kill -9` skips Node's signal handlers.** If an operator needs to force-stop, they lose the last autosave window of work. Document this — Ctrl+C is safe; SIGKILL is not.

**When to use:** every entry point in `main/*.js`. The skill's `templates/sync-script.template.js` ships the handler — keep it when you copy.

## 36. Three-way overwrite policy on value writes

When a sync writes a value to a destination field that may already have a value, three flags control the outcome — `--skip-empty` (default true), `--overwrite-existing` (default false), `--treat-equal-as-noop` (default true). The decision matrix:

| Source | Dest | Flag state | Action |
|---|---|---|---|
| empty | – | `skipEmpty` | skip-empty |
| non-empty | empty | – | write |
| non-empty | equal to source | `noopEqual` | skip-noop (no version bump) |
| non-empty | different, non-empty | `!overwrite` | **skip-target-not-empty** (default-safe) |
| non-empty | different, non-empty | `overwrite` | overwrite |

The dangerous case is "destination has a different non-empty value." A long-running migration's plan may be hours old by the time apply reaches a given issue; a user editing the same field in the meantime is silently overwritten by a naive script. **Default to skip with reason `dest-non-empty-no-overwrite`**, let the operator opt in per-run.

```javascript
const { decide } = require("./overwrite-policy");
const d = decide({
  source: planEntry.sourceValue,
  dest:   currentCloudValue,
  opts:   { overwrite: opts.overwriteExisting },
});
if (d.action === "write" || d.action === "overwrite") {
  await client.setField(planEntry.key, planEntry.fieldId, planEntry.sourceValue);
  planManager.updateEntryStatus(planEntry.key, "completed", d.action);
} else {
  planManager.updateEntryStatus(planEntry.key, "skipped", d.reason);
}
```

Equality detection is type-aware: strings compare ===, options compare by `id` (then `value`/`name`), arrays compare set-equal after normalization. Anything else falls through to "not equal" → write (safer than silent equality).

**See:** `templates/overwrite-policy.js`. Lifted from `field-merge-script/merge_field_data.js`.

## 37. Auxiliary cache flush on shutdown

Pattern 35 saves the plan and master index. That covers the **per-entity** state. But long runs also build **auxiliary** caches in memory that aren't part of the plan: email→accountId lookups, fieldName→fieldId resolution, projectKey→permissions, attachment-list-per-issue. Each is small, but together they represent thousands of API calls already paid for.

Lose them on Ctrl-C and resume re-queries every single one. On a 4-hour run with 3,000 identity resolutions, that's an extra 3,000 rate-limit points on resume — sometimes enough to push the run into the next hour's quota window.

Add cache-flush calls to the shutdown handler for every cache holder:

```javascript
const shutdown = () => {
  // Per-entity state (pattern 35)
  if (sync?.planManager?.plan)        sync.planManager.savePlan();
  if (sync?.planManager?.masterIndex) sync.planManager.saveMasterIndex();

  // Auxiliary caches — each owns its own disk file
  if (sync?.identityResolver) {
    const info = sync.identityResolver.flushCache();
    console.log(`  identity: ${info.userEntries} users, ${info.groupEntries} groups → disk`);
  }
  if (sync?.fieldCatalog?.flush)      sync.fieldCatalog.flush();
  if (sync?.permsCache?.flush)        sync.permsCache.flush();
  if (sync?.cloudClient?.flushAttachmentCache)
    sync.cloudClient.flushAttachmentCache();

  process.exit(0);
};
```

The skill's `templates/identity-resolver.js` ships a `flushCache()` method — it's a defensive sync write that ensures the OS buffer is committed. Most caches in the skill's templates already persist per-write, but several intentionally batch (perms cache, field catalog), and those MUST flush on shutdown.

### Caches that should NOT flush

- **Negative caches** keyed on transient state (e.g. "this account was 404 once"). On resume, the user may have been re-invited; let the next run re-check.
- **Per-run caches** sized in MB+ (e.g. an attachment-list-by-issue cache). These exist to skip duplicate calls within the run and aren't useful across runs.

Default: flush by default, opt out for the two cases above. The downside of an extra disk write is zero; the downside of a missing flush is rate-limit money next run.

## 38. Service Desk Team actor pre-flight (JSM)

Any mutation that runs *as an actor* on a JSM project fails `400 component.missing.permissions.actor` unless the actor holds the right project role — and `GET /rest/api/3/mypermissions` lies (reports `havePermission: true` anyway). Before any JSM mutation, grant the actor its role:

```javascript
// real user actor  -> "Service Desk Team" (agent) role on each project
const roles = await get(`/rest/api/3/project/${pid}/role`);
const roleUrl = roles["Service Desk Team"];           // absent => non-JSM, skip
const roleId = roleUrl.split("/").pop();              // ids NOT stable across projects
const role = await get(roleUrl);
if (!(role.actors||[]).some(a => a.actorUser?.accountId === ACTOR))
  await post(`/rest/api/3/project/${pid}/role/${roleId}`, { user: [ACTOR] });
```

For an **app** actor ("Run rule as Jira", accountId prefix `557058:`), grant the `atlassian-addons-project-access` role the issue-action perms in each project's permission scheme instead (dedupe by scheme id). Idempotent, resolve role id per project by name. Source: `cloudtocloud-automation-helpers-v3/ensure_actor_access.js`, `templates/jsm-role-preflight.js`. Full detail in `docs/19-jsm-migration-patterns.md`.

## 39. Transitive inverse walk for issue recovery

When recovering issues JCMA dropped, the operator's scoping JQL misses children whose parents/epics it didn't cover. Walk the **inverse** graph: for each recovered issue, pull the subtasks/epic-children that reference it, and resolve each child's parent to the **current Cloud key** — or, if the parent is *also* missing, co-create it in the **same import CSV** with the child referencing the parent's in-file row id (order: parent before child). This recovers whole subtask/epic trees with correct parent links even when the parents were themselves missing. Source: `find_missing_issues` suite; see `docs/21-post-jcma-issue-recovery.md` and `docs/15-transitive-discovery.md`.

## 40. Composition / app-macro splice rewrite (default-deny + back-to-front)

Mis-migrated Confluence app macros (Appfire Composition `deck`/`card` colliding with native Cloud macros) are fixed by a **storage-XHTML splice rewrite**, never ADF — the target is itself storage-format, so splicing preserves macro ids and bodies byte-for-byte. Three load-bearing rules:

```javascript
// 1. DEFAULT-DENY: rewrite "deck" always; rewrite "card" only with positive evidence
//    (a Composition ancestor up the ancestorStack, OR a Composition-shaped param).
//    Ambiguous cards are SKIPPED with a recorded reason (don't touch native cards).
// 2. BACK-TO-FRONT: apply splices descending by span start so earlier edits never
//    shift later offsets.
accepted.sort((a, b) => b.span[0] - a.span[0]);
// 3. semantic-hash idempotency: if newXml === storage, skip as no-op (already converted).
```

Plus: re-derive instances from **fresh** storage at execute time (match by `macroId`, ordinal fallback), record the **server-truth** post-PUT version (a 409 retry that raced a third-party edit lands at +2, not +1), and roll back via native version restore. Source: `confluence/composition-tabs/src/compositionMacroProcessor.js`; `templates/composition-macro-rewriter.js`. Full detail in `docs/22-confluence-app-macro-migration.md`.

## See also

- [`13-running-and-monitoring.md`](13-running-and-monitoring.md) — the progress-line contract used by an agent observer (patterns 31, 32, 35)
- [`19-jsm-migration-patterns.md`](19-jsm-migration-patterns.md) — the actor/role model behind pattern 38
- [`21-post-jcma-issue-recovery.md`](21-post-jcma-issue-recovery.md) — the recovery pipeline behind pattern 39
- [`22-confluence-app-macro-migration.md`](22-confluence-app-macro-migration.md) — the macro rewriter behind pattern 40

- [`templates/`](../templates/) — all of these patterns are implemented in the templates
- [`27-rate-limits-and-quotas.md`](27-rate-limits-and-quotas.md) — points math behind pattern 12
- [`28-adf-and-attachments.md`](28-adf-and-attachments.md) — ADF reference for patterns 4, 5, 13
- [`29-forge-kvs-remote-mending.md`](29-forge-kvs-remote-mending.md) — full setup for pattern 10
- [`09-backup-and-rollback.md`](09-backup-and-rollback.md) — rollback strategies behind patterns 13, 14, 26
- [`10-jql-and-aql-rewriting.md`](10-jql-and-aql-rewriting.md) — the rewriters behind patterns 15, 23, 24
- [`11-storage-format-and-adf.md`](11-storage-format-and-adf.md) — semantic hashing for pattern 13, structural rewrites for pattern 30
- [`12-preflight-and-staleness.md`](12-preflight-and-staleness.md) — drift detection behind pattern 22
