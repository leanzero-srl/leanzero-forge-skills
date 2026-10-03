# Audit & Sampling

Phase 3 of every migration job. The audit script re-fetches a sample (or all) of the entries the sync phase marked `completed`, compares the destination's actual state to what the plan said it should be, and writes a CSV proving the change landed.

If you don't run the audit, you don't actually know if the migration worked. The sync log says what the sync script *intended* to do; the audit proves what *happened*.

## Why sampling?

Full-sweep audits work great on small jobs (<2,000 entries). Beyond that, they double the rate-limit cost of the whole migration. A statistically reasonable sample (150 entries, seeded) gives you 95% confidence that the actual error rate is within ±5% — usually enough to ship.

Use a full sweep when:

- The dataset is small (<2,000 entries).
- The data is high-stakes (financial figures, security-sensitive configs).
- A regression would be hard to detect downstream (rare-but-critical entities).
- Your operator wants a green-light certificate signed off on every row.

Use sampling when:

- The dataset is large (>10,000 entries).
- Errors would surface quickly via user reports or downstream tooling.
- You can re-run the audit cheaply if the first sample raises concern.

## Mulberry32 seeded RNG

Reproducible sampling is essential: if the audit fails, the operator wants to re-run with the same sample and verify the fix. Mulberry32 is a 32-bit hash-based PRNG with these properties:

- Deterministic for a given seed.
- Fast (no `Math.random()` non-determinism).
- Good enough distribution for sampling (don't use it for cryptography).

```javascript
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

Use a memorable seed (42, 1337, your team's ZIP code) and write it into the audit CSV header comment so reviewers can reproduce.

## Sample size guidance

| Pool size | Sample (95% confidence, ±5% margin) | Notes |
|---|---|---|
| ≤500 | full sweep | Cheap; no reason to sample |
| 500–2,000 | 250 | Comfortable margin, modest API cost |
| 2,000–10,000 | 150 | Standard sanity-check size |
| 10,000–100,000 | 200 | Slightly higher to absorb concentration in some buckets |
| 100,000+ | 400 stratified by status / project / time window | Don't trust uniform sampling alone |

If the first sample shows >2 FAILs, escalate to a full sweep. The cost of a full sweep is acceptable once you know there's a real problem.

## Pool selection

The audit script samples from a **pool** — a filtered subset of plan entries. The default pool is all `completed` entries. Custom predicates:

```javascript
const pool = Object.entries(plan.entries)
  .filter(([, e]) => e.status === "completed")
  .filter(([, e]) => e.field === "customfield_10318")        // narrow to one field
  .filter(([, e]) => e.completedVersion === 7);              // only specific page versions
```

You can also pool by `failed` to dig into why each failure happened — re-fetch from the destination and check if it actually wasn't applied (vs the sync just lost track).

## Expected vs actual comparison

The audit script's `_check(entryId, data)` returns:

```javascript
{ match: "PASS" | "FAIL" | "MISSING", field, expected, actual, dest_id }
```

- **PASS** — destination state matches `expected`. Most rows.
- **FAIL** — destination has a different value (something else wrote over it, or the sync silently no-op'd).
- **MISSING** — destination doesn't have the entity at all (deleted? wrong ID?).

For complex shapes (ADF documents, nested objects), use a structural compare:

```javascript
const isEqual = JSON.stringify(actual) === JSON.stringify(expected);
```

This is brittle for whitespace and key ordering. For ADF specifically, normalize first — strip empty `text` nodes, collapse single-element `content` arrays, sort attributes. There's no silver bullet; the comparator is part of the migration script.

## CSV layout

```
source_id, dest_id, field, expected, actual, match, checked_at
```

Sorted with `FAIL` at top, then `MISSING`, then `PASS`. Last line is a comment footer:

```
# total=150 pass=147 fail=2 missing=1
```

Excel and Numbers ignore lines starting with `#`. The footer makes it easy to skim the result without summing the rows yourself.

## Audit output → action

| Audit result | Action |
|---|---|
| All PASS | Sign off. Attach CSV to the change ticket. |
| 1–2 FAIL, plausibly due to user activity post-sync | Re-fetch with a different seed; if it stabilizes, accept. |
| FAIL > expected error rate | Re-run sync with `--retry-failed` (clears the planned values back over user edits). |
| MISSING entries exist | Check the sync log for that entry's status. If `completed`, the destination ID was wrong — your ID mapping is corrupt. |
| Crash mid-audit | Resume from a fresh runId; the audit doesn't mutate, no harm done. |

## Programmatic exit code

The audit script sets `process.exitCode = 1` if there are any FAIL or MISSING rows. CI/CD can wire this into a deploy gate:

```yaml
- run: node main/audit.js --plan-file logs/plan_*.json --seed 42
- name: Audit must pass to deploy
  run: [[ $? -eq 0 ]] || exit 1
```

## Re-running the audit

You can re-run the audit any number of times against the same plan — it's read-only. Common pattern:

```bash
# Initial audit, day of migration
node main/audit.js --plan-file logs/plan_X.json --seed 42 --sample 150

# Week later, re-audit to catch drift
node main/audit.js --plan-file logs/plan_X.json --seed 17 --sample 150

# Or full sweep before sign-off
node main/audit.js --plan-file logs/plan_X.json --full
```

Different seeds give different samples — if all three runs PASS, you have very high confidence the destination is correct.

## See also

- [`06-csv-and-cli-conventions.md`](06-csv-and-cli-conventions.md) — column conventions
- [`templates/audit-script.template.js`](../templates/audit-script.template.js) — the template implementing this pattern
- [`24-production-patterns.md`](24-production-patterns.md) — pattern 9 (audit-after-sync)
