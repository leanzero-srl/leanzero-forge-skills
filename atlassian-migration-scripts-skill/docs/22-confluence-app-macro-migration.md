# Confluence App-Macro Migration (Appfire Composition Tabs & family)

When a Confluence DC→Cloud migration carries pages that use third-party app macros, JCMA frequently mis-migrates them — and the failure is subtle because the page still *exists*, it just renders wrong. This doc distills `confluence/composition-tabs` (Appfire Composition Tabs fix) and names the related macro-fix family.

## The problem: macro-name collision

After JCMA, Appfire Composition's **Deck of Cards / Card** macros land in Cloud as raw storage names `<ac:structured-macro ac:name="deck">` / `ac:name="card">`. Those names **collide with Confluence Cloud native macros** and break rendering. Appfire's Cloud-compatible legacy equivalents are `tab-group` / `tab`. The fix is a storage-format (XHTML) rewrite: `deck → tab-group` (renaming the deck's `id` param to `deckId`), `card → tab`, card `label` param → tab `title` param.

This operates on **storage format, not ADF** — the target structure is itself storage-format, so a pure splice rewrite **preserves macro ids, schema versions, rich-text-body content, and unsupported parameters byte-for-byte**.

## Discovery via CQL

```javascript
// per space, or omit the space clause for --all
const cql = `space = "${spaceKey}" AND macro in ("deck","card") AND type = page ORDER BY id`;
```

`ORDER BY id` gives a stable scan order for resumable pagination.

## Default-deny verification (don't rewrite Cloud-native cards)

A CQL hit on `macro = "card"` is not proof it's a Composition card — Cloud has its own `card`. **Default-deny:** rewrite `deck` always (Cloud-native panels never use `ac:name="deck"`), but rewrite `card` only with positive evidence:

```javascript
shouldRewrite(instance) {
  if (oldDeckSet.has(instance.name)) return { rewrite: true, reason: "deck-always" };
  if (oldCardSet.has(instance.name)) {
    // (a) it has a Composition ancestor (deck / tab-group / tab) up the stack, OR
    const hasCompositionAncestor = (instance.ancestors || []).some(a => compositionAncestors.has(a));
    if (hasCompositionAncestor) return { rewrite: true, reason: "card-composition-ancestor" };
    // (b) it carries a Composition-shaped param (defaults to "label")
    if (labelKey in (instance.params || {})) return { rewrite: true, reason: `card-has-${labelKey}-param` };
    return { rewrite: false, reason: "ambiguous-card-no-deck-ancestor-no-label" };  // skip, recorded
  }
  return { rewrite: false, reason: "name-not-in-old-keys" };
}
```

Ambiguous cards are **skipped with a recorded reason**, never silently dropped.

## Ancestor-stack tracking

To know whether a `card` sits inside a `deck`, the parser walks the XHTML maintaining an `ancestorStack` of currently-open structured-macros: push the macro name on a non-self-closing open, pop on its close. Each found instance records `parent_name` and the full `ancestors[]`, which `shouldRewrite` consults. A self-close (or null-id) macro doesn't push.

## Splice rewrite, back-to-front

Edits are byte-offset splices into the storage string. **Apply them descending by start position** so an earlier rewrite never shifts the offsets of a later one:

```javascript
accepted.sort((a, b) => b.inst.span[0] - a.inst.span[0]);   // descending
for (const { inst } of accepted) {
  const [start, end] = inst.span;
  const macroXml = cur.slice(start, end);
  // rewrite ac:name on the OPENING tag only; rename/delete top-level ac:parameter blocks
  cur = cur.slice(0, start) + newMacro + cur.slice(end);
}
```

Param rewrite within a macro is also applied back-to-front. **Conflict rule:** if renaming `label → title` and a `title` param already exists, **delete the `label` block** instead (the canonical `title` wins) — avoids producing a duplicate param.

## Re-derive from fresh storage at execute time

The plan records spans seen at plan time, but the execute phase **re-fetches fresh storage and re-derives instances**, then matches plan-accepted macros to fresh ones by **`macroId` (stable across version bumps)**, falling back to **ordinal alignment** for self-closing / null-id macros. Stale spans are ignored. If no instances match the fresh storage, the page is `skipped` with `no-matching-instances-in-fresh-storage` (someone edited it independently).

## Idempotency, 409s, and backups

- **Idempotency:** after the rewrite, if `newXml === storage` the page is `skipped` as `no-op` (already converted) — and a SHA-1 of before/after is recorded in the per-page meta.
- **PUT via v1 storage representation** (`updatePageStorage`) — preserves macro ids. The 409 (version conflict) retry lives *inside* the client: on conflict it re-fetches and retries once. Record the **server-truth new version** (`result.newVersion`), not `freshVersion + 1` — a post-409 retry that raced a third-party edit lands at `freshVersion + 2`, and recording the truth means rollback computes the right previous version instead of clobbering the third party's work.
- **Per-page backup before PUT:** `page_<id>_v<v>.xhtml` (raw storage) + `.diff.patch` (unified diff) + `.meta.json` (ids, versions, sha1Before/After, change counts). Written even in `--dry-run`.

## Rollback (two strategies)

`restore_composition_tabs.js`:
1. **Native version restore (default, preferred):** `POST /wiki/rest/api/content/{id}/version` with `{ operationKey: "RESTORE", params: { versionNumber: prev, message } }` — atomic, audited, the official mechanism. Works while the historical version still exists.
2. **Local-backup PUT (`--from-backup`):** read the saved `.xhtml`, fetch current version, PUT at `currentVersion + 1`. Use only if version history was compacted/pruned, or you deliberately want to overwrite back to pre-migration content.

## Post-run verification

Re-run the discovery CQL after applying: residual `deck/card` pages should drop to `ambiguous-skipped + failures`, and `tab-group/tab` pages should appear. The script warns if `residual > (ambiguousSkipped + failures)` — a signal to investigate the offending pages.

```javascript
residualCql = `${spaceClause}macro in ("deck","card") AND type = page`;
landedCql   = `${spaceClause}macro in ("tab-group","tab") AND type = page`;
```

## The related macro-fix family (same playbook)

Other app macros mis-migrate the same way; the same CQL-discover → verify → splice → backup → verify pipeline applies:
- **nested-macro** — un-nest bodied macros so the Cloud Fabric editor accepts them.
- **html-macro** — convert/repair raw HTML macros.
- **visibility-macro** — ID remap of visibility/group references.
- **responsibility-to-aura** — vendor macro swap (Responsibility → Aura).
- **scaffold-fix** — strip page restrictions before edit, restore them after.

## See also

- [`11-storage-format-and-adf.md`](11-storage-format-and-adf.md) — storage-XHTML surgery (regex vs tree), semantic hash
- [`09-backup-and-rollback.md`](09-backup-and-rollback.md) — Confluence version-history restore
- [`24-production-patterns.md`](24-production-patterns.md) — pattern 40 (Composition splice rewrite)
- [`templates/composition-macro-rewriter.js`](../templates/composition-macro-rewriter.js)
