# Macros & Section Sealing

How to use a **bodied macro** as a durable, tamper-detectable anchor inside a page body, and the KVS/content-property machinery that backs it. Grounded in Sentinel Vault's Content Sealing feature (`src/server/capsules/sealing/`, `src/server/capsules/section-seals/`, `src/server/infra/doc-surgery.js`).

This extends `content-macro.yml` (standard inline macro) and `21-custom-content.md`. The new idea here is using a macro's **own stable identifier** to correlate an in-body node with an app-side record across arbitrary user edits.

## Standard vs bodied macro

| | Standard `macro` | **Bodied `macro`** (`layout: bodied`) |
|---|---|---|
| ADF node type | `extension` | `bodiedExtension` (has its own `content[]` you wrap user content in) |
| Use | Render dynamic content from config | Seal/annotate a *region* of the page; the user's own content lives inside |
| Config UI | `config.resource` + `openOnInsert` | same |

Sentinel declares both in one manifest (`manifest.yml`):

```yaml
macro:
  - key: sentinel-vault-panel            # standard: file-reservation status panel
    resource: inline-panel-ui
    resolver: { function: action-router }
    layout: block
    config: { resource: panel-setup-ui, openOnInsert: false, viewportSize: medium }

  - key: sentinel-vault-sealed-section   # bodied: locks the content inside this section
    resource: section-setup-ui
    resolver: { function: action-router }
    layout: bodied
    config: { resource: section-setup-ui, openOnInsert: true, viewportSize: medium }
```

`openOnInsert: true` opens the config dialog the moment the author inserts the macro — that's where you mint and persist the section's identity (below).

## The stable `sectionId` trick

A `bodiedExtension` node Confluence regenerates `localId` on across saves, so you can't rely on `localId` alone to recognise "the same sealed section" after an edit. Sentinel issues its **own** `sectionId` at seal time and stores it in the macro's config parameters, falling back to `localId`:

```javascript
// doc-surgery.js
export function getSectionId(node) {
  return (
    node?.attrs?.parameters?.guestParams?.sectionId ||   // app-issued, survives edits
    node?.attrs?.parameters?.sectionId ||
    node?.attrs?.localId ||                               // last-resort platform id
    null
  );
}

export function buildSealedSectionNode({ sectionId, extensionKey, bodyContent }) {
  const [appId, envId] = extensionKey.split("/");
  return {
    type: "bodiedExtension",
    attrs: {
      extensionType: "com.atlassian.ecosystem",
      extensionKey,
      layout: "default",
      parameters: {
        extensionId: `ari:cloud:ecosystem::extension/${appId}/${envId}${SEALED_SECTION_KEY_SUFFIX}`,
        extensionTitle: "Sentinel Vault Sealed Section",
        guestParams: { sectionId },           // ← stable correlation key
      },
    },
    content: Array.isArray(bodyContent) && bodyContent.length ? bodyContent
      : [{ type: "paragraph", content: [] }],
  };
}
```

The extension key is derived at runtime from `getAppContext()` (`<appId>/<envId>/static/<module-key>`) and cached in KVS — never hardcoded, because it differs per environment. See `resolveSealedSectionKey()` in `doc-surgery.js`.

## KVS key schemes

Sentinel's whole feature is built on prefix-addressable KVS keys (see `24-production-patterns.md` Pattern 2 for the general technique). The seal feature uses:

| Key | Holds | TTL |
|---|---|---|
| `protection-{artifactId}` | attachment seal: `{ lockedBy, expiresAt, sealedVersion, sealedFileId, contentId, spaceId, attachmentName }` | none |
| `space-protection-{spaceId}-{artifactId}` | per-space seal index entry (realm-scoped queries) | none |
| `section-protection-{sectionId}` | section seal: `{ pageId, lockedBy, expiresAt, sectionId, sectionTitle, contentHash }` | none |
| `section-snapshot-{sectionId}` | `{ wrapperNode, bodyContent, hash, originalIndex }` — the sealed body, for restore | none |
| `edit-grant-{artifactId}-{editorAccountId}` | active edit authority | = `seal.expiresAt` |
| `edit-request-{artifactId}-{requesterAccountId}` | pending/denied edit request | — |
| `section-edit-grant-{sectionId}-{accountId}` / `section-edit-request-{sectionId}-{accountId}` | section variants | — |
| `protections-last-modified` | global timestamp so the index cron can skip a no-op scan | — |
| `app-account-id` / `macro-extension-key` / `section-macro-extension-key` | cached app identity / derived extension keys | — |

**Content-property fast-path marker.** Before doing an expensive `kvs.query().beginsWith(...)`, Sentinel asks Confluence whether the page even carries a seal, using a content property keyed `protection-` (and `section-protection-`) written via `writeSealContentProp()`. The page-content trigger probes this first and bails with zero ADF reads if the page has no seal property:

```javascript
// triggers.js — collectMediaSealsForPage()
const propsResponse = await asApp().requestConfluence(
  route`/wiki/api/v2/pages/${pageId}/properties?key=protection-`);
if (!propsResponse.ok) return [];
const propsData = await propsResponse.json();
if (!propsData.results?.length) return [];   // no seal on this page → skip entirely
// only now run the KVS prefix query
```

Content-property writes follow the GET→bump version→PUT rule (see Pattern 3 in `24-production-patterns.md`).

## Three-way seal lifecycle

`computeSealStatus(artifactId, operatorAccountId)` (`sealing/logic.js`) collapses the record + expiry + actor into one of three states:

```javascript
// OPEN          → no live seal (or it just expired and was auto-cleaned)
// HELD          → sealed by someone else
// HELD_BY_ACTOR → sealed by the current operator (they may edit freely)
```

Expiry is **lazy + swept**: a read that finds `expiresAt < now` deletes the record inline (`computeSealStatus`, `breakSeal`), and the hourly `expirySweepTask` notifies owners. Auto-unseal is feature-flagged by `admin-settings-global.autoUnlockEnabled` — when off, the seal is kept and a `recurringNudgeTask` records a banner-only reminder every `reminderIntervalDays`.

## Edit-request grants

Rather than mutate the seal record (which many flows rewrite), grants live in **sidecar keys** that carry a KVS TTL equal to the seal's `expiresAt`, so they self-expire with the seal:

```javascript
// editreq/logic.js — single O(1) read the trigger uses to authorize an edit
export async function getActiveEditGrant(attachmentId, accountId) {
  const grant = await kvs.get(`edit-grant-${attachmentId}-${accountId}`);
  if (!grant) return null;
  if (grant.expiresAt && new Date(grant.expiresAt).getTime() <= Date.now()) return null;
  return grant;
}
```

When an approved editor edits, the trigger **re-baselines** instead of reverting — it stores the new `sealedVersion`/`sealedFileId` (attachments) or the new `contentHash` + snapshot (sections), so future reverts compare against the edited content (`triggers.js` `handleSealedArtifactEdit`, `restoreSealedSectionsPass`). On any seal teardown, `sweepEditAccess(artifactId)` prefix-deletes all grants and requests so a re-seal starts clean.

## Attachment version reversion — there is no v2 "revert" API

To roll a tampered attachment back to its sealed version, you cannot call a v2 "set version" endpoint — it doesn't exist. The working recipe (`triggers.js:510-614`) is **download the old version (v1), re-upload it as new data (v1)**:

```javascript
// 1) download the sealed version (v1 download endpoint takes ?version=N)
const dl = await asApp().requestConfluence(
  route`/wiki/rest/api/content/${contentId}/child/attachment/${artifactId}/download?version=${targetVersion}`);
const fileBuffer = await dl.arrayBuffer();

// 2) re-upload as the current data — v1 data endpoint, multipart, nocheck token
const form = new FormData();
form.append("file", new Blob([fileBuffer]), artifactDetails.title);
form.append("comment", "(Sentinel Vault automatically reversed modifications)");
form.append("minorEdit", "true");                       // don't spam the activity feed
await asApp().requestConfluence(
  route`/wiki/rest/api/content/${contentId}/child/attachment/${artifactId}/data`,
  { method: "POST", headers: { "X-Atlassian-Token": "nocheck" }, body: form });
```

`X-Atlassian-Token: nocheck` is **required** for the multipart upload (XSRF bypass for API clients). Prefer `sealedVersion` captured at seal time as the revert target; fall back to `currentVersion - 1`.

**Trash vs permanent-delete are separate events** with different recovery:
- `avi:confluence:trashed:attachment` → restorable: `PUT /wiki/rest/api/content/{pageId}/child/attachment/{artifactId}` with `status: "current"` and `version.number: current+1`. If the PUT fails the attachment is unrecoverable → clean up the seal.
- `avi:confluence:deleted:attachment` → permanent; you can only notify and clean up KVS/content-property/grants.

## Realm/space seal index via prefix query

For a space-admin console that lists every seal in a space, write a per-artifact index key at seal time and query it by prefix (`confluence-sync.js`):

```javascript
// write index entry
await kvs.set(`space-protection-${realmId}-${artifactId}`, {
  attachmentId, attachmentName, lockedBy, timestamp, expiresAt, contentId, spaceKey, pageTitle, ...
});

// later: every seal in this realm, O(prefix)
const { results } = await kvs.query()
  .where("key", WhereConditions.beginsWith(`space-protection-${realmId}-`))
  .limit(100).getMany();
```

When a realm's seal volume exceeds the per-index-value throughput (24 MB/s — see `27-faas-limits-and-cost.md`), bucket the prefix (`space-protection-{realmId}-{shard}-{artifactId}`) and fan the query across buckets.

## See also

- `16-unified-content-triggers.md` — the single-read/passes/single-write trigger that enforces these seals, canonical ADF hashing, loop prevention.
- `24-production-patterns.md` — Pattern 2 (KVS prefix indexing), Pattern 3 (content-property versioning), Pattern 4 (ADF surgery).
- `28-adf-and-storage-format.md` — `bodiedExtension` node shape, `version.number` rules.
- `06-content-properties.md` — content-property CRUD and CQL indexing.
