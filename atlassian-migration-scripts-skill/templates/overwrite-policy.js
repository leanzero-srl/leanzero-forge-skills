"use strict";

/**
 * Three-way overwrite policy for value writes.
 *
 * Pattern lifted from field-merge-script/merge_field_data.js. Whenever a
 * sync writes a value to a destination field that may ALREADY have a
 * value, three operator-controlled flags determine the outcome:
 *
 *   --skip-empty             (default: true)   — never write when source is empty
 *   --overwrite-existing     (default: false)  — overwrite an already-populated dest
 *   --treat-equal-as-noop    (default: true)   — skip when source == dest (no version bump)
 *
 * Decision matrix:
 *
 *   ┌──────────────┬──────────────┬─────────────┬───────────────┐
 *   │ Source       │ Dest         │ Flags       │ Action        │
 *   ├──────────────┼──────────────┼─────────────┼───────────────┤
 *   │ empty        │ —            │ skipEmpty   │ skip-empty    │
 *   │ non-empty    │ empty        │ —           │ write         │
 *   │ non-empty    │ equal to src │ noop        │ skip-noop     │
 *   │ non-empty    │ diff, non-Ø  │ !overwrite  │ skip-target-not-empty │
 *   │ non-empty    │ diff, non-Ø  │ overwrite   │ overwrite     │
 *   └──────────────┴──────────────┴─────────────┴───────────────┘
 *
 * Why "skip-target-not-empty" is the safe default:
 *
 *   The destination value may have been edited by a USER after the
 *   plan was built (hours-old plans, multi-day migrations). Silently
 *   overwriting their edit corrupts data and loses trust. Default to
 *   skip with a recorded reason; let the operator opt in to overwrite
 *   per-run with --overwrite-existing.
 *
 * Usage:
 *
 *   const { decide, isEmpty } = require("./overwrite-policy");
 *   for (const issue of plan.entries) {
 *     const decision = decide({
 *       source: issue.sourceValue,
 *       dest:   issue.destValue,
 *       opts:   { skipEmpty: true, overwrite: opts.overwriteExisting, noopEqual: true },
 *     });
 *     switch (decision.action) {
 *       case "write":
 *       case "overwrite":
 *         await client.setField(issue.key, issue.destFieldId, issue.sourceValue);
 *         planManager.updateEntryStatus(issue.key, "completed", decision.action);
 *         break;
 *       case "skip-empty":
 *       case "skip-noop":
 *       case "skip-target-not-empty":
 *         planManager.updateEntryStatus(issue.key, "skipped", decision.reason);
 *         break;
 *     }
 *   }
 */

/**
 * Determine whether a value is "empty" for write-policy purposes.
 * Handles the four shapes Jira returns for field values:
 *   - undefined / null
 *   - "" (empty string)
 *   - [] (empty array — multi-select with no selection)
 *   - {} with no value/name/id (option-field "no selection")
 */
function isEmpty(v) {
  if (v == null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") {
    // Common Jira shapes: { value, id } / { name } / { displayName }
    const hasContent =
      v.value != null || v.name != null || v.id != null ||
      v.displayName != null || v.key != null;
    return !hasContent;
  }
  return false;
}

/**
 * Loose value equality covering Jira's three field shapes:
 *   string → string
 *   option → option        (compare by .id if present, else .value/.name)
 *   array  → array         (set equality of normalized elements; order-insensitive)
 *
 * Cascade-selects, dates, user pickers, and other types should be
 * compared with type-specific helpers — this function bails out
 * (returns false) for anything it doesn't recognize, which yields
 * a "write" decision and avoids silently treating non-equal values
 * as equal.
 */
function valuesEqual(a, b) {
  if (a == null && b == null) return true;
  if (isEmpty(a) && isEmpty(b)) return true;
  if (isEmpty(a) !== isEmpty(b)) return false;

  if (typeof a === "string" && typeof b === "string") return a === b;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    const norm = (x) => (typeof x === "string" ? x : x?.id || x?.value || x?.name || JSON.stringify(x));
    const sa = a.map(norm).sort();
    const sb = b.map(norm).sort();
    return sa.every((v, i) => v === sb[i]);
  }

  if (typeof a === "object" && typeof b === "object") {
    if (a.id != null && b.id != null) return String(a.id) === String(b.id);
    const av = a.value ?? a.name ?? a.displayName ?? null;
    const bv = b.value ?? b.name ?? b.displayName ?? null;
    if (av != null && bv != null) return av === bv;
  }

  return false;
}

/**
 * Apply the three-way decision matrix.
 *
 * @param {object} ctx
 * @param {*}      ctx.source     — the source value to write
 * @param {*}      ctx.dest       — the current destination value (may be empty)
 * @param {object} ctx.opts       — { skipEmpty=true, overwrite=false, noopEqual=true }
 * @returns        { action, reason } where action ∈
 *                   "write" | "overwrite" | "skip-empty" |
 *                   "skip-noop" | "skip-target-not-empty"
 */
function decide(ctx) {
  const { source, dest, opts = {} } = ctx;
  const skipEmpty = opts.skipEmpty !== false;     // default: true
  const overwrite = opts.overwrite === true;       // default: false
  const noopEqual = opts.noopEqual !== false;     // default: true

  if (isEmpty(source)) {
    if (skipEmpty) return { action: "skip-empty", reason: "source-empty" };
    // skipEmpty=false: writing an explicit empty (clearing the field)
    return { action: "write", reason: "explicit-empty-write" };
  }

  if (isEmpty(dest)) {
    return { action: "write", reason: "dest-empty" };
  }

  if (noopEqual && valuesEqual(source, dest)) {
    return { action: "skip-noop", reason: "source-equals-dest" };
  }

  if (overwrite) {
    return { action: "overwrite", reason: "operator-allowed-overwrite" };
  }

  return { action: "skip-target-not-empty", reason: "dest-non-empty-no-overwrite" };
}

module.exports = { decide, isEmpty, valuesEqual };
