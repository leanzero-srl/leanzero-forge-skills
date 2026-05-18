# CSV & CLI Conventions

The shared naming and column conventions that make every migration script in this skill feel the same to operators and reviewers.

## Standard CLI flags

| Flag | Type | Phase | Meaning |
|---|---|---|---|
| `--plan-only` | bool | combined | Phase 1 only — discover and write the plan |
| `--execute-only` | bool | combined | Phase 2 only — load a plan and process it |
| `--plan-file <path>` | path | sync / audit | Plan JSON to consume |
| `--dry-run` | bool | sync | Simulate, never mutate |
| `--confirm` | bool | sync | Required to mutate (paired with absence of `--dry-run`) |
| `--retry-failed` | bool | sync | Also re-attempt entries with status="failed" |
| `--seed <N>` | int | audit | RNG seed for reproducibility (default 42) |
| `--sample <N>` | int | audit | Sample size (default 150). Ignored with `--full` |
| `--full` | bool | audit | Audit every matching entry |
| `--status <S>` | string | audit | Which status to audit (default "completed") |
| `--limit <N>` | int | all | Cap planned/processed entries |
| `--concurrency <N>` | int | sync | Worker-pool size (default 5) |
| `--space <K>` | str (repeatable) | plan | Confluence space key(s) |
| `--project <K>` | str (repeatable) | plan | Jira project key(s) |
| `--user-mapping <path>` | path | plan / sync | CSV file overriding identity resolution |
| `--group-mapping <path>` | path | plan / sync | CSV file overriding group resolution |
| `--help` / `-h` | bool | all | Print usage |

This vocabulary is shared across every sub-project. Operators learn it once.

## `logs/` directory layout

Runtime artifacts live under `<sub-project>/logs/`:

```
logs/
├── plan_<runId>.json         ← phase 1 — the source of truth for phase 2
├── plan_<runId>.csv          ← phase 1 — human-friendly preview
├── plan_<runId>.log          ← phase 1 — line-by-line execution log
├── sync_<runId>.log          ← phase 2 — line-by-line execution log
├── failed_<runId>.csv        ← phase 2 — failures, one per row, with error message
├── audit_<runId>.csv         ← phase 3 — pass/fail diff, FAILs at top
├── cache_users.json          ← persistent — identity resolver
└── cache_groups.json         ← persistent — identity resolver
```

`runId` is `String(Date.now())` taken at the start of each run.

### gitignore

`logs/` is gitignored. The CSV outputs are sensitive (user identifiers, custom-field values) and the JSON plan can be huge. If you need to share a plan with a colleague, attach it directly to your change ticket.

## Plan CSV columns

```
source_id, source_url, dest_id_if_known, operation, field, old_value, new_value, reason, planned_at
```

| Column | Required | Notes |
|---|---|---|
| `source_id` | yes | Stable identifier in the source system (issue key, page id, user account id) |
| `source_url` | yes | Browser-clickable URL so reviewers can open the source record in one click |
| `dest_id_if_known` | no | Destination identifier if pre-mapped; blank for create operations |
| `operation` | yes | One of `create` / `update` / `skip-exists` / `skip-noop` / `delete` |
| `field` | yes | The specific field being changed; for whole-object operations, use `*` |
| `old_value` | no | Truncate to ~200 chars; full value goes in a sidecar JSON if needed |
| `new_value` | no | Same — truncate, sidecar if needed |
| `reason` | no | Why the operation is required (e.g. "field empty post-migration") |
| `planned_at` | yes | ISO 8601 timestamp |

The `operation` vocabulary is uniform across scripts so reviewers can sort and filter consistently:

- **`create`** — a new entity is being created in the destination
- **`update`** — an existing entity's field is being modified
- **`skip-exists`** — a planned create was elided because the entity already exists
- **`skip-noop`** — destination already matches the desired state
- **`delete`** — entity is being removed

## Audit CSV columns

```
source_id, dest_id, field, expected, actual, match, checked_at
```

| Column | Required | Notes |
|---|---|---|
| `source_id` | yes | Same identifier used in the plan CSV |
| `dest_id` | yes | Destination identifier (Cloud) |
| `field` | yes | The field being audited (or `*` for whole-object) |
| `expected` | yes | What the plan said the value should be |
| `actual` | yes | What the destination actually has now |
| `match` | yes | One of `PASS` / `FAIL` / `MISSING` |
| `checked_at` | yes | ISO 8601 timestamp |

After all rows are written, append a footer comment:

```
# total=12340 pass=12298 fail=37 missing=5
```

**Sort the file with FAILs at the top.** A reviewer opens the file, sees the failures first, and can triage in seconds. Easy to do at write time — sort the rows in memory by `{ FAIL: 0, MISSING: 1, PASS: 2 }[row.match]`.

## CSV escaping rules

RFC 4180:

- Quote any value containing `,`, `"`, CR, or LF.
- Escape embedded `"` by doubling: `she said "hi"` → `"she said ""hi"""`.
- Always start the file with a header row.
- Prepend a UTF-8 BOM (`﻿`) so Excel and Numbers open the file correctly.

The `csv-writer.js` template handles all of this automatically.

## Failed-entries CSV

When the sync phase records a failure, also emit a row to `logs/failed_<runId>.csv`:

```
entry_id, status, error, checked_at
```

This is redundant with the plan JSON (which has `error` per entry) but lets operators scan failures without running `jq` on a big JSON file. Most ops triage starts here.

## Plan JSON filename uniqueness

Every artifact for a run carries the same `runId`. If two runs collide (unlikely with millisecond resolution, possible with bad clocks), bump the second one by `+1`:

```javascript
let runId = String(Date.now());
while (fs.existsSync(path.join(logDir, `plan_${runId}.json`))) {
  runId = String(parseInt(runId, 10) + 1);
}
```

Or just accept that two runs in the same millisecond is operator error and crash with a clear message.

## See also

- [`02-plan-manager.md`](02-plan-manager.md) — the plan JSON shape
- [`07-audit-and-sampling.md`](07-audit-and-sampling.md) — what goes in the audit CSV
- [`01-core-concepts.md`](01-core-concepts.md) — the two-gate / two-phase model these flags implement
