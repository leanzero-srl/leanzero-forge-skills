# Transitive Discovery (Reverse Graph Walks)

A migration plan built from a JQL query covers what the operator asked for. It does **not** cover what's structurally related. For relationship-shaped data — subtasks, epic children, issue links, blocked-by chains — naive scripts only fix what's in the JQL and leave orphaned children, broken epics, and one-sided links.

This doc covers the "Phase 1b" pattern lifted from `sync_issue_parents/src/parentProcessor.js:243–501`: after building the primary plan from explicit input, walk the **inverse** of every relevant relationship to discover entities that should also be in scope, then filter to those the operator hasn't already covered and that need fixing.

## The shape of the problem

```
   Operator's JQL: "project = PROJ"
   ┌─────────────────────────────────┐
   │ PROJ-1 (epic)                   │
   │ PROJ-2 (story, parent=PROJ-1)   │  ← in scope ✓
   │ ...                             │
   └─────────────────────────────────┘

   But also exists, NOT in the JQL:
   ┌─────────────────────────────────┐
   │ OTHER-99  (sub-task, parent=PROJ-2)
   │   — exists in Cloud, but no parent set after JCMA
   │   — operator didn't ask for OTHER-* because it wasn't "their" project
   │   — silently leaves a broken subtask tree
   └─────────────────────────────────┘
```

The migration is "correct" against the JQL but wrong against the structure. The operator finds out months later when a board doesn't show subtasks.

## Phase 1b — the pattern

After the primary scan, the planner does a **second** scan, this time querying DC by inverse JQL: "find every issue whose parent points back into my imported set."

```javascript
async _enrichWithChildren(importedKeys, importedTypes, issuesMap) {
  // Partition the imported set by what kinds of children each can have.
  const nonSubtaskParents = importedKeys.filter((k) => !isSubtaskType(importedTypes.get(k)));
  const epicParents       = importedKeys.filter((k) => isEpicType(importedTypes.get(k)));

  const candidatesByChild = new Map();
  // First-writer-wins dedup across relationship sources:
  //   parent.key   beats   Epic Link   beats   Parent Link
  const recordChild = (issue, parentKey, source) => {
    if (!issue.key || !parentKey) return;
    if (candidatesByChild.has(issue.key)) return;
    candidatesByChild.set(issue.key, { parentKey, source });
  };

  // ── inverse #1: sub-tasks ────────────────────────────────
  if (nonSubtaskParents.length > 0) {
    await batchedDcSearch(
      nonSubtaskParents,
      (batch) => `parent in (${batch.join(",")})`,
      "parent,issuetype",
      (issue) => recordChild(issue, issue.fields?.parent?.key, "fields.parent"),
    );
  }
  // ── inverse #2: Epic Link (custom field) ─────────────────
  if (epicLinkFieldId && epicParents.length > 0) {
    const num = epicLinkFieldId.replace("customfield_", "");
    await batchedDcSearch(
      epicParents,
      (batch) => `cf[${num}] in (${batch.join(",")})`,
      `${epicLinkFieldId},issuetype`,
      (issue) => {
        const raw = issue.fields?.[epicLinkFieldId];
        const ek = typeof raw === "string" ? raw : raw?.key || null;
        recordChild(issue, ek, epicLinkFieldId);
      },
    );
  }
  // ── inverse #3: Parent Link (Portfolio/Advanced Roadmaps) ─
  if (parentLinkFieldId && nonSubtaskParents.length > 0) {
    /* analogous to #2 */
  }

  // Filter to children NOT already in imported set, then batch-fetch Cloud
  // state and queue only those that exist in Cloud and have no parent set.
  const newChildKeys = [];
  for (const childKey of candidatesByChild.keys()) {
    if (issuesMap[childKey]) continue;       // already in plan
    newChildKeys.push(childKey);
  }
  const cloudState = await cloudClient.batchGetIssueParents(newChildKeys);
  for (const childKey of newChildKeys) {
    const cs = cloudState.get(childKey);
    if (!cs) continue;                                  // not in Cloud — skip
    if (cs.parent) continue;                            // already parented — skip
    queueForRepair(childKey, candidatesByChild.get(childKey));
  }
}
```

## Generalizing — when to walk the inverse graph

| Relationship | Forward query | Inverse query (what Phase 1b adds) |
|---|---|---|
| Subtask / parent | `parent = X` (children of X) | `parent in (importedSet)` (children we missed) |
| Epic Link | `"Epic Link" = X` | `cf[10014] in (epicsImported)` |
| Parent Link (Roadmaps) | `parentLink = X` | `cf[parentLink] in (importedSet)` |
| `is blocked by` | `linkType = blocks AND issue = X` | `issue in linkedIssues("is blocked by", importedSet)` |
| `cloners` | similar | similar |
| Confluence "child of" | tree traversal forward | walk pages whose `parent.id` ∈ imported |
| Project's components/versions | `component = X` | sweep components/versions for issues *not* in imported but referencing an imported component |

The pattern applies any time a relationship is recorded on the *child* side (the field is on the child, pointing at the parent), AND the operator's input doesn't naturally cover both sides.

## Dedup precedence — first writer wins

Jira lets the same child have *both* an Epic Link and a Parent Link, or a parent + a Parent Link. Phase 1b's `recordChild` enforces a precedence:

```
fields.parent  >  Epic Link  >  Parent Link
```

Why this order: `fields.parent` is the official subtask/parent relation Cloud will write to. The other two are legacy from Portfolio / Advanced Roadmaps and JCMA migrates them inconsistently. If a child has multiple, the canonical Cloud setting is what `fields.parent` resolves to.

Adjust the precedence to match your migration's intent — but pick one and document it. Silent winner-by-Map-iteration-order is a footgun.

## Filtering before re-queueing

Three filters between "candidate discovered in DC" and "row added to plan":

1. **Not already in imported set.** The candidate is something we'd otherwise miss.
2. **Exists in Cloud.** Did the child actually migrate? If JCMA dropped it, no work to do here.
3. **Cloud field is empty (or wrong).** Don't overwrite a parent that's already correctly set. See `docs/12-preflight-and-staleness.md` for the same pattern at apply time.

The first filter is cheap (a `Set.has` lookup). The other two cost one batch-fetch per ~50 candidates. **Always bulk-fetch** the Cloud check, never one-at-a-time — this is otherwise the dominant cost of the phase.

## Reporting

Phase 1b should log a separate counter set so the operator sees what it discovered:

```
Phase 1b — reverse children search:
  Children found (DC):                 1247
  Already in imported set:              892
  New, in Cloud, parented OK:           201   ← already fine, skipped
  New, in Cloud, NEEDS repair:          136   ← added to plan
  New, NOT in Cloud (dropped by JCMA):   18   ← logged for the verify phase
```

The "needs repair" count is the operator's signal that Phase 1b is doing real work; if it's always 0, you probably don't need Phase 1b for this relationship.

## When Phase 1b is overkill

- The operator's JQL is already structural ("project = X" → covers all subtasks naturally).
- The relationship isn't migrated at all (e.g., issue links, which JCMA migrates well by default).
- The cost of the inverse query exceeds the cost of an audit script after the fact.

Rule of thumb: implement Phase 1b when **(a)** the operator typically passes individual issue keys or a non-project JQL, **AND (b)** the relationship is on the *child* side. If both are true, Phase 1b is the difference between a clean migration and one with months-of-tail orphan reports.

## See also

- [`02-plan-manager.md`](02-plan-manager.md) — the planner that Phase 1b extends
- [`12-preflight-and-staleness.md`](12-preflight-and-staleness.md) — the "don't overwrite a correct value" check at apply time
- [`24-production-patterns.md`](24-production-patterns.md) — pattern 18 (multi-source resolution with fallbacks) is the same dedup-precedence idea at the value layer
- [`27-rate-limits-and-quotas.md`](27-rate-limits-and-quotas.md) — bulk-fetch is non-negotiable for the Phase 1b Cloud-state check
