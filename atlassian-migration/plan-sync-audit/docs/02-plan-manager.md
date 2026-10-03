# PlanManager

The class at `templates/plan-manager.js` is the persistence layer for every migration job in this skill. This doc covers its API, the plan JSON shape, and the rules around concurrency and large datasets.

## API at a glance

```javascript
const PlanManager = require("../src/planManager");
const pm = new PlanManager("logs", (msg) => console.log(msg));   // dir + optional logger

// Phase 1 — discovery writes the plan
pm.createPlan(String(Date.now()));
pm.addEntry("ABC-1234", { issueKey: "ABC-1234", newValue: "X" });
pm.addEntry("ABC-1235", { issueKey: "ABC-1235", newValue: "Y" });
pm.savePlan();

// Phase 2 — sync loads and updates statuses in place
pm.loadPlan("logs/plan_1747549872311.json");
for (const [id, data] of pm.getEntriesToProcess(/* retryFailed */ false)) {
  // do work...
  pm.updateEntryStatus(id, "completed");
  pm.patchEntry(id, { destIssueId: "10042" });   // optional — merge custom fields
}
pm.savePlan();
console.log(pm.formatStats());
```

Full method reference:

| Method | Purpose |
|---|---|
| `createPlan(runId)` | Start a new plan file at `<planDir>/plan_<runId>.json` |
| `addEntry(id, data)` | Add an entry; bookkeeping (`status`, `error`, `updatedAt`) is set automatically |
| `loadPlan(filePath?)` | Load a plan; if `filePath` omitted, scans `planDir` for the latest |
| `findLatestPlan()` | Return the path of the most recent `plan_*.json` in `planDir` |
| `getEntriesToProcess(retryFailed)` | Return `[id, data]` pairs whose status is `pending` (or also `failed` if `retryFailed`) |
| `updateEntryStatus(id, status, error?)` | Set the bookkeeping fields on an entry |
| `patchEntry(id, patch)` | Merge arbitrary fields into an entry; does NOT touch bookkeeping |
| `savePlan()` | Stream-write the plan to disk (atomic via `.tmp` + rename) |
| `recalculateStats()` | Recompute the `stats` block from the current entries |
| `formatStats()` | Human-readable one-liner of the current stats |
| `getPlanSummary()` | Programmatic stats summary including the plan file path |

## Plan JSON shape

```json
{
  "version":   "1.0",
  "runId":     "1747549872311",
  "createdAt": "2026-05-18T08:00:00.000Z",
  "updatedAt": "2026-05-18T08:34:12.117Z",
  "stats": {
    "total":     1234,
    "pending":   42,
    "completed": 1180,
    "failed":    8,
    "skipped":   4
  },
  "entries": {
    "ABC-1234": {
      "issueKey":   "ABC-1234",
      "fieldId":    "customfield_10318",
      "oldValue":   null,
      "newValue":   "approved",
      "status":     "completed",
      "error":      null,
      "updatedAt":  "2026-05-18T08:23:11.882Z"
    }
  }
}
```

`version` is for future schema migrations. Bump it when you change the entry shape in an incompatible way; consumers can branch on it.

## Three rules for adding entries

1. **Entry IDs are strings.** `addEntry(id, ...)` calls `String(id)` internally to normalize numeric IDs (Jira issueId, Confluence pageId). Always look up entries by the same shape.
2. **Don't mutate `data` after `addEntry`.** The class stores a reference for performance, not a copy. If you need to update later, use `patchEntry`.
3. **Caller fields beat reserved fields.** If you pass `{status: "X"}` to `addEntry`, your value is overwritten by the manager's `pending`. The reserved trio is `status`/`error`/`updatedAt` — name your custom fields anything else.

## Autosave

The manager calls `savePlan()` automatically every 50 `addEntry` or `updateEntryStatus` calls. The threshold is `autoSaveThreshold` on the instance — tweak it if your plans are tiny (lower) or huge (higher) but don't set it to 0; you'd thrash the disk.

`savePlan()` is also implicit at the end of `createPlan`. You should still call it explicitly at the end of each phase so the final state lands.

## Atomic writes

The plan file is written via `.tmp` + `rename`:

```javascript
fs.openSync(filePath + ".tmp", "w");
// ... write content ...
fs.closeSync(fd);
fs.renameSync(filePath + ".tmp", filePath);
```

If the process is killed mid-write, the previous good plan stays intact. The `.tmp` file may linger; sweep it manually if you see one in `logs/`.

## Large datasets

`_streamWritePlan` walks the entries object key-by-key and writes each JSON value separately, avoiding a single `JSON.stringify(plan)` that would buffer the whole tree. This handles plans well into the gigabyte range — assuming each individual entry is reasonable, the manager itself never blocks the event loop on a hot stringify.

If your entries themselves get huge (e.g. embedded ADF documents), consider:

- **Sidecar JSON per entry**: write `logs/entry_<id>.json` and store only `{sidecar: "..."}` in the plan.
- **Plan splitting**: divide by entity type or project and run multiple plans concurrently from independent sub-projects.
- **JSONL plan format**: a future schema where each entry is a line. Not currently implemented; if you need it, drop in a `streamWritePlanJsonl` method alongside the JSON one.

## Concurrency model

The PlanManager is **not thread-safe** and **not multi-process-safe**. Don't:

- Open the same plan file from two scripts at once.
- Call `updateEntryStatus` from multiple Promises that don't share the single instance.
- Mix `--plan-only` and `--execute-only` runs against the same file from different terminals.

It IS safe to:

- Read the plan from a tool that doesn't write it (e.g. a CSV exporter, the `audit.js` phase).
- Run `sync.js` and `audit.js` simultaneously on the same plan — audit only reads.
- Call `updateEntryStatus` from inside a worker pool, since all workers share one instance.

## Sub-plan splitting for huge datasets

A 150,000-entry plan file is unwieldy: slow to load, hard to diff, OOM risk. Split it by entity sub-type, project, or partition key.

Pattern: each sub-plan is its own `PlanManager`-backed file, plus a `plan_master.json` index that lists them.

```javascript
// In plan.js
const customFieldIds = [...];
const masterIndex = { version: "1.0", runId, subPlans: [] };

for (const fieldId of customFieldIds) {
  const pm = new PlanManager(`logs/sub-plans`, console.log);
  pm.createPlan(`${runId}_${fieldId}`);
  for (const issue of issuesWithField(fieldId)) {
    pm.addEntry(issue.key, { fieldId, /* per-entry data */ });
  }
  pm.savePlan();
  masterIndex.subPlans.push(`plan_${runId}_${fieldId}.json`);
}

fs.writeFileSync(`logs/plan_master_${runId}.json`, JSON.stringify(masterIndex, null, 2));
```

Sync can target a single sub-plan or all of them:

```bash
# Single shard
node main/sync.js --plan-file logs/sub-plans/plan_1779_customfield_10318.json --confirm

# All shards (parallelizable across terminals)
for f in logs/sub-plans/plan_${runId}_*.json; do
  node main/sync.js --plan-file "$f" --confirm &
done
wait
```

Each sub-plan is independent — workers don't share state — so this scales linearly with parallelism (up to your concurrency × rate-limit ceiling).

## Backup & rollback fields on each entry

Store version numbers and semantic hashes alongside your per-entity payload so rollback and idempotency just work:

```javascript
planManager.addEntry(pageId, {
  cloudPageId: pageId,
  title: page.title,
  currentVersion: page.version.number,
  beforeHash: BackupManager.storageHash(page.body.storage.value),
  /* ... */
});

// After the write
planManager.patchEntry(pageId, {
  completedVersion: result.newVersion,
  afterHash: BackupManager.storageHash(newStorageXml),
});
```

`beforeHash` enables no-op detection in re-runs; `completedVersion` makes Confluence version-history rollback trivial (see `09-backup-and-rollback.md`).

## Instance signature

Stamp the (sourceBaseUrl, destBaseUrl) pair into a special `__meta__` entry at plan creation time so the sync phase can refuse to mutate the wrong tenant:

```javascript
const fp = require("../src/instanceFingerprint");

planManager.createPlan(runId);
planManager.addEntry("__meta__", {
  instanceSignature: fp.build({
    destBaseUrl: process.env.CLOUD_BASE_URL,
    sourceBaseUrl: process.env.DC_BASE_URL,
  }),
});

// In sync.js, before any worker fires
fp.verify(plan.entries.__meta__.instanceSignature, {
  destBaseUrl: process.env.CLOUD_BASE_URL,
  sourceBaseUrl: process.env.DC_BASE_URL,
  allowMismatch: opts.allowInstanceMismatch,
});
```

The `__meta__` entry is exempt from `getEntriesToProcess` because its status is never `pending` — it's set during `addEntry`'s side effect but its purpose is metadata, not work.

## Resuming a plan after a crash

```bash
# Original run dies halfway through
node main/sync.js --plan-file logs/plan_1747549872311.json --confirm

# Re-run — only pending entries are re-processed
node main/sync.js --plan-file logs/plan_1747549872311.json --confirm

# Also re-attempt failures (e.g. after fixing a permissions bug)
node main/sync.js --plan-file logs/plan_1747549872311.json --confirm --retry-failed
```

`getEntriesToProcess(retryFailed)` filters by status, so the resume logic is just "load + run". No special "resume mode" — every run resumes by default.

## See also

- [`01-core-concepts.md`](01-core-concepts.md) — the triad and the safety gates
- [`06-csv-and-cli-conventions.md`](06-csv-and-cli-conventions.md) — naming conventions for plan files
- [`09-backup-and-rollback.md`](09-backup-and-rollback.md) — using `beforeHash` / `completedVersion` for rollback
- [`24-production-patterns.md`](24-production-patterns.md) — patterns 19 (sub-plan splitting), 21 (instance fingerprinting)
