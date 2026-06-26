# Unified Page-Content Triggers

When several features all want to inspect and repair the **same** page body on the same `avi:confluence:(updated|created):page` event, naively giving each its own trigger causes 409 storms, ordering hazards, and infinite loops. The fix is one handler that does **a single read → ordered in-memory passes → a single write**. Grounded in Sentinel Vault's `src/server/triggers.js` (`pageContentTrigger`) and `src/server/infra/doc-surgery.js`.

## The single-read / passes / single-write pipeline

```javascript
// triggers.js — pageContentTrigger (abridged)
export async function pageContentTrigger(event) {
  const { atlassianId, content } = event;
  const pageId = content?.id;
  if (!pageId) return;

  // 1) Loop guard — ignore our own writes (see below).
  const appId = await resolveAppAccountId();
  if (appId && atlassianId === appId) return;

  // 2) Cheap probes decide whether there is ANY body work (no ADF read yet).
  const sealFileMap  = await collectMediaSealsForPage(pageId);    // content-property fast-path
  const sectionSeals = await collectSectionSealsForPage(pageId);
  const hasBodyWork  = sealFileMap.length || sectionSeals.length;

  const notifyMap = new Map();   // dedup notifications across retries
  const MAX_RETRIES = 3;

  for (let attempt = 0; hasBodyWork && attempt < MAX_RETRIES; attempt++) {
    const { pageData, adfDoc } = await readDocBody(pageId);       // SINGLE read per attempt
    const ctx = { pageId, atlassianId, pageData, adfDoc,
                  currentVersion: pageData.version?.number, changed: false, notifications: [] };

    // ordered passes mutate the ONE in-memory ADF
    if (sectionSeals.length) await restoreSealedSectionsPass(ctx, sectionSeals); // Pass A
    if (sealFileMap.length)  await restoreMediaPass(ctx, sealFileMap);           // Pass B
    // Pass C (validation enforcement) slots in here.

    for (const n of ctx.notifications) notifyMap.set(`${n.type}:${n.targetId || ""}`, n);
    if (!ctx.changed) break;                                       // nothing to write

    const putRes = await writeDocBody(ctx.pageId, ctx.pageData, ctx.adfDoc,
                                      "(Sentinel Vault restored protected content)"); // SINGLE write
    if (putRes.ok) break;
    if (putRes.status === 409) {                                   // shared backoff: 500ms→1s→2s
      await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 500));
      continue;
    }
    break;                                                         // other error: give up
  }

  for (const n of notifyMap.values()) await dispatchPipelineNotification(n); // notify once, post-loop
}
```

Key properties:
- **Each pass is wrapped in its own try/catch** so one failing feature never aborts the others.
- **Notifications accumulate into a Map** keyed `type:targetId` and are dispatched once after the write loop, regardless of write success — so a 409 retry doesn't double-notify.
- The whole write loop shares **one 409 exponential backoff** (`Math.pow(2, attempt) * 500` = 500ms, 1s, 2s).

## Loop prevention

Every restore is an `asApp()` PUT, which re-fires this same trigger. The defence is a **cached app accountId** check — note `filter.ignoreSelf` is **Jira-only and does not suppress Confluence self-events**, so it cannot be relied on here. Resolve `GET /wiki/rest/api/user/current` as the app once, cache in KVS `app-account-id`, and short-circuit any event whose actor is the app:

```javascript
async function resolveAppAccountId() {
  let id = await kvs.get("app-account-id");
  if (!id) {
    const r = await asApp().requestConfluence(route`/wiki/rest/api/user/current`);
    if (r.ok) { id = (await r.json()).accountId; await kvs.set("app-account-id", id); }
  }
  return id;
}
// in the handler:
if (appId && event.atlassianId === appId) return;
```

**Eventual-consistency caveat.** A page-version index can lag, so a restore pass also compares the attachment/page version and only reverts to an *older* version (`restoreMediaPass` bails if `currentVersion < 2`). Don't blindly re-apply if you can't prove the live state is newer than the sealed state.

## Canonical ADF hashing (tamper detection)

To detect "was this sealed region actually changed?" without false positives, hash a **canonical** form of the ADF subtree — sort every object's keys and drop volatile keys the editor regenerates on a no-op save:

```javascript
// doc-surgery.js
const VOLATILE_ADF_KEYS = new Set(["localId"]);   // harden empirically: round-trip a sealed
                                                  // page through the editor and diff to extend

export function canonicalizeAdf(value) {
  if (Array.isArray(value)) return value.map(canonicalizeAdf);
  if (value && typeof value === "object") {
    const out = {};
    for (const k of Object.keys(value).sort()) {   // stable key order
      if (VOLATILE_ADF_KEYS.has(k)) continue;
      const v = canonicalizeAdf(value[k]);
      if (v !== undefined) out[k] = v;
    }
    return out;
  }
  return value;
}

export function hashAdf(node) {                     // FNV-1a 32-bit, 8 hex chars
  const str = JSON.stringify(canonicalizeAdf(node));
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return ("0000000" + h.toString(16)).slice(-8);
}
```

> A plain `JSON.stringify(node)` is **not** safe to hash — object key order is not guaranteed stable across reads, so you'd get spurious "tampered" verdicts. Canonicalise first. `VOLATILE_ADF_KEYS` is an empirical set (2026-06): re-round-trip a page through the editor and diff the hash to extend it if no-op saves still differ.

The section pass compares `hashAdf(wrapper.node.content)` to the sealed `seal.contentHash`; equal → untouched, skip. Different → restore from the snapshot (or re-baseline if the actor holds a grant).

## ADF tree surgery primitives

`doc-surgery.js` provides the recursive walkers the passes use. The non-obvious rule: **splice at original indices in descending order** so earlier inserts don't shift later target indices:

```javascript
export function collectMediaFileIds(node, out = new Set()) {       // media nodes referenced anywhere
  if (node?.type === "media" && node.attrs?.type === "file" && node.attrs?.id) out.add(node.attrs.id);
  if (Array.isArray(node?.content)) for (const c of node.content) collectMediaFileIds(c, out);
  return out;
}

export function extractMediaSingleNodes(adfDoc, targetFileIds) {   // [{ node(cloned), originalIndex }]
  const out = [];
  adfDoc.content?.forEach((block, i) => {
    for (const id of collectMediaFileIds(block))
      if (targetFileIds.has(id)) { out.push({ node: JSON.parse(JSON.stringify(block)), originalIndex: i }); break; }
  });
  return out;
}

export function spliceMediaNodes(currentAdf, entries) {
  [...entries].sort((a, b) => b.originalIndex - a.originalIndex)   // DESCENDING — avoids offset drift
    .forEach(({ node, originalIndex }) =>
      currentAdf.content.splice(Math.min(originalIndex, currentAdf.content.length), 0, node));
  return currentAdf;
}
```

Companion helpers for bodied sections: `locateBodiedSectionNodes` (find wrappers + their `sectionId` + index), `replaceSectionBody` (swap a wrapper's `content` for a snapshot), `spliceSectionWrapper` (re-insert a deleted wrapper at its original index). See `14-macros-and-section-sealing.md`.

## Scheduled-task dedup flags

Background sweeps must be idempotent across the platform's at-least-once delivery and across multiple runs. The pattern: **read all records once, compute in memory, write a per-record dedup flag** — never make a per-record API call to ask "did I already notify?". Sentinel's `expirySweepTask` / `recurringNudgeTask` use:

| Flag key | Meaning |
|---|---|
| `expiry-notified-{id}` | expiry notice already sent for this seal |
| `fifty-percent-reminder-sent-{id}` | halfway reminder already sent |
| `reminder-sent-{id}` | last periodic-nudge timestamp (re-sent only after `reminderIntervalDays`) |

Halfway is computed as exactly 50% of the seal's lifetime: `midpoint = createdAt + (expiresAt - createdAt) * 0.5`, fired only when `now >= midpoint && now < expiresAt`.

## See also

- `14-macros-and-section-sealing.md` — the seal records / snapshots these passes restore.
- `24-production-patterns.md` — Pattern 5 (loop prevention), Pattern 4 (ADF surgery), Pattern 7 (cursor-paginated scan).
- `28-adf-and-storage-format.md` — ADF body read/write, `version.number`, canonical hashing.
- `07-webhooks-events.md` — Confluence event payload shape (`event.atlassianId`, `event.eventType`).
