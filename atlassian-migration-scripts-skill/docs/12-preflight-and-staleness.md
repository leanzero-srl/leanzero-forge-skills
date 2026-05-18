# Preflight & Staleness

A plan built Monday and applied Friday isn't the same plan. Users edit, automation rules fire, attachments shift. The preflight phase exists to detect drift between plan creation and apply time, surface it to the operator, and (optionally) refuse to proceed if too much has changed.

This is the one phase missing from a strict Plan→Sync→Audit reading. The full sequence with preflight is:

```
PLAN  →  (review)  →  PREFLIGHT  →  (gate decision)  →  SYNC  →  AUDIT
```

Add a preflight step whenever the gap between plan and sync may be more than a few hours.

## When you need it

| Plan-to-sync gap | Preflight |
|---|---|
| Same run (no `--plan-only` / `--execute-only`) | Not needed |
| Same operator, same day | Optional |
| Plan from yesterday or older | Recommended |
| Plan from a different operator (handed off) | Mandatory |
| Plan from before a maintenance window | Mandatory |
| Plan against high-velocity data (active project, recent migration) | Mandatory |

## The drift buckets

A preflight check classifies every plan entry into one of these buckets:

| Bucket | Meaning | Recommended action |
|---|---|---|
| `same` | Source still matches what the plan recorded | Apply normally |
| `drift` | Source value changed between plan and now | Operator decides: re-plan, override, or skip per entry |
| `missing-in-source` | Source no longer has this entity (deleted, moved) | Skip; remove from plan or re-plan |
| `fetch-error` | Couldn't reach the source | Retry; if persistent, abort the sync |

You can add custom buckets for project-specific concerns ("permission-changed", "moved-projects"). The template returns whatever string your comparator emits and aggregates counts.

## The preflight template

```javascript
const { preflight } = require("../src/preflight");

const report = await preflight({
  entries: planManager.getEntriesToProcess(opts.retryFailed),
  fetchCurrent: async (id, data) => {
    return await dcClient.getIssue(data.sourceKey, "summary,parent,customfield_10042");
  },
  comparator: (planned, actual) => {
    if (!actual) return "missing-in-source";
    if (planned.sourceSummary !== actual.fields.summary) return "drift";
    return "same";
  },
  concurrency: 8,
  log: (m) => console.log(m),
  outFile: `logs/preflight_${runId}.csv`,
});

console.log(report.summary());
if (report.driftRatio > 0.10) {
  console.error("Drift > 10%. Re-plan recommended.");
  if (!opts.acceptDrift) process.exit(2);
}
```

The comparator is the only piece you write per migration. Everything else (concurrency, bucket counts, CSV output) is generic.

## Drift thresholds

Pick a threshold based on the migration's reversibility and audience:

| Migration kind | Suggested abort threshold |
|---|---|
| Reversible / safe to re-apply (additive, idempotent) | 25% |
| Mostly reversible (field backfill with backup) | 10% |
| Hard-to-reverse (cascading edits, bulk delete) | 2% |
| Audited / regulated (security, compliance) | 0.5% — investigate every drift row |

Default to 10% for general data fixups; tighten as risk increases.

## Stale snapshot CSV

Save the preflight result to `logs/preflight_<runId>.csv` so the operator can spot-check the drift rows directly:

```csv
entry_id,bucket,checked_at
ABC-1234,drift,2026-05-18T08:34:12.117Z
ABC-1235,same,2026-05-18T08:34:12.118Z
ABC-1236,missing-in-source,2026-05-18T08:34:12.119Z
```

The drift rows are the rows worth eyeballing. They tell you:

- Is the drift a real edit (skip / re-plan) or a benign refresh (proceed)?
- Is the drift concentrated in one project / one user / one field? (Suggests a single upstream cause.)
- Are the same entries drifting every time? (Suggests an active automation rule that needs to be paused for the sync window.)

## Buckets for sub-plan architecture

If you split a 150k-entry plan into per-field sub-plans (see `02-plan-manager.md#sub-plan-splitting`), run preflight per sub-plan. Each sub-plan's drift profile is independent — one field might drift heavily while another stays stable. Process sub-plans separately based on their own drift ratio, not the aggregate.

## Forward-roll vs backward-roll

When you find drift mid-flight, you have two recovery directions:

| Direction | When to use |
|---|---|
| **Forward-roll** | Drift is benign / expected. Update the plan to match the new source state, then continue applying. |
| **Backward-roll** | Drift means the source moved away from what you planned to do. Roll back any partial sync writes, re-plan from the new source state. |

Forward-roll is the default for most operations (drift is usually trivial); backward-roll is the right choice when the source change semantically contradicts the planned mutation (e.g., the source entity was deleted, or its status changed in a way that makes the planned mutation invalid).

The decision is per-migration. Document it in the sub-project's README.

## Per-entry preflight inside the sync phase

For high-stakes migrations, run a *per-entry* preflight right before each mutation, not just one big preflight at the start:

```javascript
async function _applyEntry(entryId, data) {
  const actual = await dcClient.getIssue(data.sourceKey, "summary");
  if (actual.fields.summary !== data.sourceSummary) {
    planManager.updateEntryStatus(entryId, "skipped", "source drifted between plan and apply");
    return;
  }
  // ... proceed with mutation ...
}
```

This is slower (one extra GET per entry) but gives you continuous drift detection. Worth it for migrations touching mutable production data over multiple hours.

## Preflight + audit symmetry

Notice that preflight is the inverse of audit:

- **Preflight**: "Does the **source** still match what the plan said it does?" (before mutation)
- **Audit**: "Does the **destination** match what the plan said we'd write?" (after mutation)

Both use the same plan as their source of truth. Both can sample (with seeded RNG) or sweep. Both write CSVs with the same column shape. Treat them as bookends of the sync phase.

## See also

- [`templates/preflight.js`](../templates/preflight.js) — full implementation
- [`02-plan-manager.md`](02-plan-manager.md) — plan entry shapes that store source snapshots
- [`07-audit-and-sampling.md`](07-audit-and-sampling.md) — the symmetric post-sync verification
- [`24-production-patterns.md`](24-production-patterns.md) — pattern 22 (preflight staleness)
