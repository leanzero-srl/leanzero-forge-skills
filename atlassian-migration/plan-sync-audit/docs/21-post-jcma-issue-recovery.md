# Post-JCMA Issue Recovery (the find-missing suite)

JCMA can silently leave issues behind — pagination gaps, validation-blocked creates, parent/child trees the operator's scoping JQL didn't cover. Recovering them is not one script; it's a **staged pipeline of small, independently-resumable steps**, each one the operator's checkpoint. This doc distills the 14-script `find_missing_issues` suite (McLaren DC→Cloud, June 2026, ~1,242 issues recovered).

## Why a pipeline, not a monolith

Each stage writes an artifact the next stage reads. A stage can be re-run in isolation; a human inspects its output before the next runs. This is the same plan/sync/audit discipline (`docs/01-core-concepts.md`) applied at suite granularity — three small scripts beat one big one because each step is a gate.

## The 14 steps

| # | Script | Reads | Writes | Purpose |
|---|---|---|---|---|
| 1 | `find_missing_issues.js` | DC + Cloud | `reports/missing_issues_<ts>.xlsx`, `checkpoint.jsonl` | Diff DC key set vs Cloud key set → candidate-missing keys. |
| 2 | `gather_missing_data.js` | DC | per-project workbook | Pull full issue + history + comments + attachments + links from DC for the missing set. |
| 3 | `probe_required_fields.js` | Cloud | `reports/_required_fields.json` | Discover EVERY required field per (project, issue type) by trial-create. |
| 4 | `generate_import_csvs.js` | gathered data + maps | `reports/import_csvs/*.csv` | Build Cloud-importer CSVs, hierarchy + key preservation. |
| 5 | `validate_csvs.js` | the CSVs | report | Structural + hierarchy integrity; re-confirm every Parent key exists in Cloud. |
| 6 | `build_status_map.js` | Cloud | `reports/_status_map.json` | Per-project DC-status → exact Cloud-status-name spelling. |
| 7 | `check_keys_free.js` | Cloud | exit code | Re-confirm every target key is still FREE (importer EDITs if taken). |
| 8 | `resolve_parents.js` | Cloud | report | Current Cloud key for every referenced parent/epic; flag co-created parents. |
| 9 | `check_dc_completeness.js` | DC | mismatches | False-negative guard: distinct DC keys retrieved == DC's reported total. |
| 10 | `rest_create_gaming.js` | Cloud | created issues | REST fallback for issues the CSV importer rejects (per-issue, isolated). |
| 11 | `add_backfill_label.js` | Cloud | labels | Tag every recovered issue with a marker label so `sync_*` scripts can scope to the batch. |
| 12 | `audit_missing_v2.js` | DC + Cloud | fresh report | Re-audit with a date cutoff + remap-aware check. |
| 13 | `validate_missing.js` | report + both | proof | Independently prove each listed key is a pre-cutoff DC issue absent from Cloud. |
| 14 | `finalize_report.js` | report + Cloud | corrected workbook | Exact `key = "OLD"` resolution to drop keys that are present-but-re-keyed. |

## The DC↔Cloud search-endpoint key diff (step 1)

The two sides use different search APIs with different page caps — get this wrong and you under-report:

```javascript
// DC: classic v2 search, fields=*none, 1000/page (DC allows it) — key-only listing
GET /rest/api/2/search?jql=<jql>&fields=*none&startAt=<n>&maxResults=1000
//   paginate with startAt; stop when startAt + issues.length >= total

// Cloud: post-Aug-2025 search/jql, NO startAt, opaque nextPageToken, 100/page hard cap
GET /rest/api/3/search/jql?jql=<jql>&fields=summary&maxResults=100&nextPageToken=<tok>
//   stop when isLast === true || !nextPageToken
```

Cross-project concurrency offsets Cloud's 100/page cap. **`check_dc_completeness.js`** is the safety net: re-enumerate DC keys per project and assert `distinctKeysRetrieved === total` for the same JQL — a mismatch means DC pagination skipped issues and "missing" is under-reported.

## Re-keyed-but-present is NOT missing (the false-positive trap)

An issue moved/re-created in Cloud keeps its **old key as a label** (e.g. `BUILD-90021` → re-created as `BUILD-96914` with label `BUILD-90021`). And Jira resolves a moved issue's pre-move key via its move-alias, so `key = "OLD"` still finds it. Two independent guards strip these false positives:
- `audit_missing_v2.js` re-checks each "missing" key against Cloud **labels**.
- `finalize_report.js` does an exact `key = "OLD"` resolution — if it resolves, the issue IS in Cloud (preserved/moved/re-keyed) and is dropped from the missing set.

Always run a **date cutoff** (`MIGRATION_CUTOFF`): issues created *after* the migration snapshot could never have been migrated and must not count as missing.

## Key preservation on re-import (steps 4, 7, 10)

The Cloud **System → External System Import** CSV importer keeps the numeric part of a mapped `Issue Key` and applies it to the destination project — so a recovered issue lands on its **original key** (`BUILD-90021` → `BUILD-90021`) *even when that number is below the project counter* — **as long as the key is still FREE in Cloud**. If the key is already TAKEN, the importer silently **EDITs** that issue instead of creating. Hence:
- `check_keys_free.js` runs **immediately before** import (keys at/above the project counter can be consumed by any normal issue created since the audit).
- **REST create CANNOT set the key.** `rest_create_gaming.js` is the fallback for issues the importer rejects: the next-in-counter issue is created first (keeps its real key); issues below the counter get a NEW key with the old key kept as a label.

## Hierarchy & transitive recovery (steps 4, 8)

Hierarchy is preserved through the unified `Parent` field, with three cases:
- Sub-task / epic-linked issue whose parent **exists** in Cloud → parent's current Cloud key (via `resolve_parents.js`).
- Sub-task whose parent is **also missing** (co-created) → reference the parent row's in-file Issue ID; order rows so a co-created parent precedes its child *in the same CSV file*.
- Rows ordered: Epics → standard issues → sub-tasks.

This is the **transitive inverse walk** from `docs/15-transitive-discovery.md` applied to recovery: children referenced by parents/epics that the operator's scoping JQL missed get pulled in, with correct parent ids even when the parents were themselves missing. DC field ids used for the walk (resolved per-instance via `/rest/api/2/field`): Epic Link `customfield_13520`, Epic Name `customfield_13521`, Parent Link `customfield_24021` — **these are instance-specific, always re-resolve by name.**

## Status-name exactness (step 6)

The CSV importer matches Status by **exact name**. DC often uses Title Case (`Under Investigation`) while Cloud uses sentence case (`Under investigation`) — a silent mismatch fails the row. `build_status_map.js` builds `{ project: { lowercased-DC-status → exact-Cloud-status-name } }` from each project's live workflow and flags any DC status with no Cloud match (those need a human decision).

## Required-field discovery by trial-create (step 3)

`createmeta` reports `required: false` for fields enforced by validators/behaviours/ScriptRunner. `probe_required_fields.js` finds the *real* required set by attempting a REST create, reading each `"Field X is required"` error, synthesizing a value, and retrying until the create succeeds — then **deletes the probe issue**. Output `reports/_required_fields.json` tells `generate_import_csvs.js` which columns/defaults each (project, issue type) CSV must carry.

## CSV-import + REST fallback (per-issue error isolation)

The two creation paths are complementary and both **isolate failures per issue** — one bad issue doesn't halt the run:
- **CSV import** (bulk, key-preserving) for the issues the importer accepts.
- **REST create** (per-issue POST with retries) for the handful the importer rejects (opaque validator failures). Each create is wrapped so its error is recorded against that issue and the loop continues.

## Output artifacts

`reports/missing_issues_<ts>.xlsx` (per-project tabs, the deliverable), `checkpoint.jsonl` (resumable diff state), `reports/import_csvs/*.csv`, `reports/_required_fields.json`, `reports/_status_map.json`, plus the audit/validate/finalize corrected workbooks.

## See also

- [`15-transitive-discovery.md`](15-transitive-discovery.md) — the inverse-graph walk this suite applies to recovery
- [`17-post-jcma-audit-endpoints.md`](17-post-jcma-audit-endpoints.md) — approximate-count for completeness checks
- [`04-pagination.md`](04-pagination.md) — the DC `startAt` vs Cloud `nextPageToken` split
- [`templates/find-missing-issues.skeleton.md`](../templates/find-missing-issues.skeleton.md) — the 14-step workflow as a runnable skeleton
