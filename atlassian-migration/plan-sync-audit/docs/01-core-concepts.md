# Core Concepts

The mental model behind every migration script in this skill.

## The Plan → Sync → Audit triad

Every migration job is **three scripts**, not one:

```
PHASE 1 — PLAN
  read source state → write logs/plan_<runId>.json + logs/plan_<runId>.csv
  no destination mutations

PHASE 2 — SYNC
  load plan → apply to destination → update each entry's status in place
  mutates the destination

PHASE 3 — AUDIT
  sample completed entries → re-fetch from destination → compare → write audit CSV
  read-only
```

Splitting the work into three phases is the single most important convention in this skill. Reasons:

1. **The plan is a contract.** An operator reads `plan_<runId>.csv`, spot-checks 20 rows, and only then runs `sync`. If the plan is wrong, you discover it before mutating production data.
2. **Resumability comes for free.** Each plan entry has a `status` (`pending`/`completed`/`failed`/`skipped`). Re-running `sync` skips `completed` rows, so a network blip or a transient 429 doesn't restart the whole job.
3. **Audit closes the loop.** The sync log says "I wrote field X to issue Y". The audit script re-fetches issue Y from Cloud and confirms field X actually equals the planned value. Without it, you're trusting your own logs.

## Two-phase execution

```
default              plan + execute in one run            (small jobs, one-off fixes)
--plan-only          phase 1 only                          (large jobs, review before mutating)
--execute-only --plan-file <p>   phase 2 only             (resumes a previous plan)
```

`--plan-only` is the safer default for jobs that touch >100 entities. Build the plan, eyeball the CSV, commit it (or attach it to the change request), then run `--execute-only` later.

## Two-gate safety

```
no --confirm  AND  no --dry-run   →  exit 2 (refuse)
--dry-run                          →  simulate, log, never mutate
--confirm                          →  mutate
--dry-run  --confirm               →  simulate (dry-run wins)
```

The intent: a single typo on the command line never causes a write. To mutate, the operator types both `--dry-run` (which is then *removed*) and `--confirm`. Two independent actions.

Implementation goes at the very top of `sync.js`:

```javascript
if (!opts.dryRun && !opts.confirm) {
  console.error("Refusing to mutate without --confirm. Use --dry-run for a preview.");
  process.exit(2);
}
```

`--dry-run` is also useful operationally: it produces backups, records what *would* have changed, and is the canonical regression test before re-running a failed migration.

## runId

Every run gets a `runId = String(Date.now())`. This is the timestamp in milliseconds — sortable, unique enough for human use, and short enough to type. All artifacts for that run share the same runId in their filename: `plan_1747549872311.json`, `sync_1747549872311.log`, `audit_1747549872311.csv`. The plan and audit naturally line up.

## The plan entry contract

The PlanManager class is entity-agnostic — it doesn't know what an "entry" represents. It only manages three fields:

- `status`: `pending`, `completed`, `failed`, or `skipped`
- `error`: human-readable error message if `failed`
- `updatedAt`: ISO timestamp of last status change

Everything else — the source ID, destination ID, payload, before/after values, version number, backup path — is stored under the entry too, but managed by the caller. This means one PlanManager codebase serves Jira issues, Confluence pages, user mappings, attachments, custom field configs, anything.

Example entry shape for a Jira custom-field backfill:

```json
{
  "issueKey": "ABC-1234",
  "fieldId": "customfield_10318",
  "oldValue": null,
  "newValue": "approved",
  "status": "pending",
  "error": null,
  "updatedAt": null
}
```

## Idempotency at the entry level

Re-running `sync` does NOT re-process completed entries — `getEntriesToProcess()` only returns `pending` (plus optionally `failed` with `--retry-failed`). This makes runs idempotent at the entry level.

For idempotency at the operation level — i.e. "if a partial write succeeded, don't half-write again" — you typically:

1. **Check before writing.** Read the destination state and compare to the planned change. If they match, mark `completed` without writing.
2. **Use stable external IDs.** Store the source system's stable ID in a destination custom field. JQL-query by that field before creating — if a match exists, skip.

See `docs/24-production-patterns.md` for concrete examples.

## What a "good" migration script looks like

- Has exactly three entry points: `plan.js`, `sync.js`, `audit.js`.
- Uses one PlanManager-backed JSON plan as its source of truth.
- Writes a parallel CSV preview during the plan phase for human review.
- Honors `--dry-run`, `--confirm`, `--plan-only`, `--execute-only`, `--retry-failed`.
- Recovers from transient failures (429, 5xx, network) without operator intervention.
- Records enough state per entry that any failure can be triaged from the plan file alone.
- Produces an audit CSV proving the changes landed.
- Is short — ideally <500 lines per phase. If a phase exceeds that, the domain transformer should live in `src/`.

## See also

- [`02-plan-manager.md`](02-plan-manager.md) — the PlanManager class in detail
- [`06-csv-and-cli-conventions.md`](06-csv-and-cli-conventions.md) — flag and CSV column conventions
- [`07-audit-and-sampling.md`](07-audit-and-sampling.md) — what an audit phase looks like
- [`24-production-patterns.md`](24-production-patterns.md) — patterns lifted from real scripts
