# Backup & Rollback

A migration script that can't be rolled back is a single-shot weapon — fire-once, hope it works. This doc covers the three strategies for making mutations reversible, and the rules around detecting third-party edits that would make automatic rollback unsafe.

## Three rollback strategies

| Strategy | When to use | Mechanism |
|---|---|---|
| **Version history (Confluence)** | Any Confluence page / blogpost / content edit | Cloud already keeps every version. Record the post-write version in the plan, restore the prior version via `?status=historical&version=N` GET + PUT. Non-destructive — the intermediate version stays in history. |
| **Per-entity backup file (Jira)** | Issue field updates, attachment ID changes, custom-field config edits | Before the mutation, snapshot the pre-state to `backups/<runId>/<entityId>.json`. Roll back by replaying the saved value. |
| **No backup, idempotent re-apply** | Pure additive operations (granting a permission, adding a member, creating a brand-new entity with an idempotency key) | Re-run the script with corrected inputs; no rollback needed because the original write was safe. |

Confluence's version history is the gold standard — atomic, audited, free. Use it whenever you can. Jira has no equivalent for issue field changes; per-entity backups fill the gap.

## Confluence version-history rollback

The `cloud-confluence-client.js` template ships `restoreVersion(pageId, prevVersionNumber, message)` which calls `POST /wiki/rest/api/content/{id}/version` with `{ operationKey: "RESTORE", params: ... }`. This is the recommended atomic-restore endpoint.

For partial-history workflows (e.g. "restore version N but keep my new metadata"), use the manual pattern:

```javascript
const { rollbackFromConfluenceHistory } = require("../src/backupManager");

const result = await rollbackFromConfluenceHistory(cf, pageId, recordedVersion);
// → { status: "rolled-back", currentVersion, newVersion, restoredFromVersion }
// → { status: "skipped-intervening", reason: "v23 > recorded v21 — third-party edit; manual rollback required" }
// → { status: "skipped-rolled-back", reason: "already rolled back or never matched plan" }
// → { status: "failed", reason: "..." }
```

The helper:

1. Fetches the current Cloud state.
2. Compares `currentVersion` to the `recordedVersion` the sync phase wrote into the plan.
3. If `currentVersion > recordedVersion` — someone edited the page after the sync. **Refuse to clobber.** Surface the page in a "needs manual rollback" list.
4. If `currentVersion === recordedVersion` — fetch `recordedVersion - 1` via the historical API, PUT it back as a new version.
5. If `currentVersion < recordedVersion` — already rolled back (or the sync never landed). Skip.

This intervention detection is mandatory. Auto-rolling-back a page that's been freshly edited destroys the new content.

## Per-entity backup files (Jira + other)

The `backup-manager.js` template:

```javascript
const { BackupManager } = require("../src/backupManager");
const backup = new BackupManager(runId);

// Before the mutation
const preState = await jira.getIssue(issueKey, "*all");
const backupFile = backup.snapshot(issueKey, preState);
planManager.patchEntry(issueKey, { backupFile });

// ... mutation ...

// To roll back later
const saved = backup.load(issueKey);
await jira.updateIssue(issueKey, { fields: saved.fields });
```

Files live in `backups/<runId>/<entityId>.json`. Gitignored. Operator can keep them around for the duration of the change window, then delete.

Rolling back from a per-entity backup needs human review more than the Confluence flow — Jira issue fields can be touched by automation rules, integrations, or users between the sync and the rollback. Always diff the current state against the backup before writing.

## Semantic hashing — no-op detection

Sometimes the sync phase's planned mutation matches the destination's current state byte-for-byte. Writing in that case is a waste — and worse, it bumps the version number, which breaks downstream tooling (Confluence's history widget, Jira's "last edited" timestamps).

Detect with a semantic hash:

```javascript
const { BackupManager } = require("../src/backupManager");

const planned = buildAdfDescription(...);
const current = await jira.getIssue(issueKey, "description");

const plannedHash = BackupManager.hash(canonicalize(planned));
const currentHash = BackupManager.hash(canonicalize(current.fields.description));

if (plannedHash === currentHash) {
  planManager.updateEntryStatus(issueKey, "skipped", "destination already matches plan");
  return;
}
```

For ADF, use `adfBuilders.semanticHash(doc)` which normalizes whitespace, drops empty text nodes, sorts attribute keys, and collapses empty marks/attrs before hashing.

For Confluence storage XHTML, use `BackupManager.storageHash(xml)` which collapses whitespace between tags and within attribute strings.

## Recording version & hash in the plan

Stamp both before and after a mutation:

```javascript
// In plan phase
planManager.addEntry(pageId, {
  cloudPageId: pageId,
  currentVersion: storagePage.version.number,
  beforeHash: BackupManager.storageHash(storagePage.body.storage.value),
  /* ... */
});

// In sync phase
const result = await cf.updatePageStorage(...);
planManager.patchEntry(pageId, {
  completedVersion: result.newVersion,
  afterHash: BackupManager.storageHash(newStorageXml),
});
```

Then on rollback, you can:

```javascript
const entry = plan.entries[pageId];
if (entry.beforeHash === entry.afterHash) {
  // No semantic change — no rollback needed
  continue;
}
```

This skips no-op completions automatically and reduces rollback noise.

## Rollback CLI script

The convention is a separate `tools/rollback.js` (not a fourth mandatory phase). It loads the plan, iterates `completed` entries, runs the appropriate rollback strategy per entity, updates the entry status to `rolled-back`, and writes an audit CSV:

```bash
node tools/rollback.js --plan-file logs/plan_<runId>.json --dry-run
node tools/rollback.js --plan-file logs/plan_<runId>.json --confirm
node tools/rollback.js --plan-file logs/plan_<runId>.json --confirm --space DOCS    # scoped
node tools/rollback.js --plan-file logs/plan_<runId>.json --confirm --page-id 12345 # specific entities
```

Rollback is sensitive. Default to `--dry-run` first, review the "would-rollback" list, then `--confirm`. Rollbacks that hit intervening-edit detection surface in a separate "manual handling needed" list — surface that to the operator clearly.

## When NOT to roll back

- **Intervening third-party edits** detected — manually triage via Cloud history UI.
- **Mutations to data the source no longer has** — your backup file is the only source of truth; if it's missing or corrupted, abort.
- **Cascading side effects** (e.g. you rolled back issue A; rule B fired on the rollback and modified issue C). Forward roll instead: fix the data, re-run sync with `--retry-failed`.
- **Operations to deleted entities** — restoring an attachment that's referenced by a deleted issue is futile.

## Tying rollback to the audit phase

A common workflow:

1. Run sync.
2. Run audit. If pass rate ≥ 99%, sign off.
3. If audit shows >1% FAIL, immediately run rollback against the FAIL entries:

```bash
node tools/rollback.js --plan-file logs/plan_<runId>.json --confirm \
  --filter-by-csv logs/audit_<runId>.csv --status FAIL
```

Then triage the source data, fix the mapping, re-run sync.

## See also

- [`02-plan-manager.md`](02-plan-manager.md) — how to stamp version + hash into a plan entry
- [`24-production-patterns.md`](24-production-patterns.md) — pattern 13 (no-op semantic-hash detection), pattern 14 (intervention detection)
- [`templates/backup-manager.js`](../templates/backup-manager.js) — full implementation
- [`templates/adf-builders.js`](../templates/adf-builders.js) — `semanticHash` for ADF
