# Post-JCMA ID Mapping

The single largest source of broken integrations after a Data Center → Cloud migration is **changed entity IDs**. JCMA (Jira/Confluence Cloud Migration Assistant) re-mints every numeric ID — what was `issueId=12345` on DC becomes `issueId=10042` on Cloud. Any external system that hardcoded the old ID is now pointing at nothing (or worse, the wrong thing).

This doc enumerates which IDs change vs. survive, and how to build the mapping table your sync and audit scripts will consume.

## What changes vs. what survives

| Entity | What changes | What survives | Notes |
|---|---|---|---|
| **Jira issue** | `issueId` (numeric) | `issueKey` (usually) | Issue keys collide only if multiple projects on DC used the same key — JCMA renames in that case. |
| **Jira project** | `projectId` | `projectKey` (usually) | Same caveat as issue keys. |
| **Jira custom field** | `customfield_XXXXX` | Field name (loose) | New IDs minted on first save. Name match is fragile — fields with duplicate names get suffixed. |
| **Jira workflow** | Workflow ID | Workflow name | Names mostly survive; transition IDs change. |
| **Jira board / filter** | Numeric IDs | Names | Filter `id` becomes new; JQL referencing `filter=12345` is broken until rewritten. |
| **Jira attachment** | `attachmentId` | Filename + content hash | The binary survives; ID changes. Match by issue+filename+size. |
| **Jira comment** | `commentId` | Body + timestamp | Match by issue+timestamp for de-dup. |
| **Confluence page** | `pageId` (numeric) | `title` (usually) | Title collisions within a space get suffixed. |
| **Confluence space** | `id` (numeric) | `spaceKey` | Keys survive intact (case-sensitive). |
| **Confluence attachment** | Numeric ID | Filename + parent content | Match like Jira attachments. |
| **User** | `username`, `userKey` | `emailAddress` (sometimes), `accountId` (only after migration) | Cloud has no concept of `username` — see `05-identity-resolution.md`. |
| **Group** | Numeric `groupId` (Cloud) | Group name | Cloud groups have UUID `groupId`; DC had numeric IDs. Match by name. |

**Rules of thumb:**

- Anything called `id` in DC → assume changes.
- Anything called `key` → usually survives.
- Anything user-facing (titles, names, emails) → usually survives but is collision-prone.

## What JCMA does and doesn't migrate

JCMA migrates:

- Issues, projects, comments, attachments, links
- Custom fields (definitions; the IDs change)
- Workflows, schemes, screens
- Spaces, pages, attachments, comments
- Users (as accountId references)
- Groups

JCMA does **NOT** migrate:

- **Forge app data** — anything in `@forge/kvs`, content/issue properties owned by an app.
- **Marketplace app data** — depends on the vendor; most apps need their own migration.
- **Atlassian Connect app data** — Connect is end-of-life; no migration path.
- **Filter and Dashboard JQL references** that reference numeric `issueId` or `customfield_ID` — these break.
- **Saved searches** that JQL-reference removed system fields.
- **Webhooks** — recreate in Cloud after migration.
- **External integrations** that called the DC REST API by ID.

Anything in the "NOT" list is what migration scripts in this skill exist to repair.

## Building the mapping table

The canonical approach: build it once at plan time, persist to `mappings/`, consume everywhere else.

### Custom fields

```javascript
async function buildCustomFieldMap(sourceClient, destClient) {
  const src = await sourceClient.buildCustomFieldNameMap();  // Map<lowercaseName, {id, type}>
  const dst = await destClient.buildCustomFieldNameMap();
  const map = {};
  for (const [name, srcMeta] of src) {
    const dstMeta = dst.get(name);
    if (!dstMeta) {
      console.warn(`field "${name}" missing in destination`);
      map[srcMeta.id] = null;
      continue;
    }
    if (dstMeta.type !== srcMeta.type) {
      console.warn(`field "${name}" type changed: ${srcMeta.type} → ${dstMeta.type}`);
      map[srcMeta.id] = null;
      continue;
    }
    map[srcMeta.id] = dstMeta.id;
  }
  fs.writeFileSync("mappings/fields.json", JSON.stringify(map, null, 2));
  return map;
}
```

Run this once. Check `mappings/fields.json` into git. The file is a contract — if it's wrong, every dependent script is wrong.

### Users

See `05-identity-resolution.md` for the IdentityResolver. The mapping file `mappings/users.json` is `{ sourceEmail: destAccountId }` or `{ sourceUsername: destAccountId }` depending on the source identifier you used.

### Issues / pages

The full issueId/pageId map is huge — for production-scale migrations, persist it as JSONL (one line per pair):

```jsonl
{"src":"12345","dst":"10001"}
{"src":"12346","dst":"10002"}
...
```

Build during the plan phase, consume from sync. For audit, you can spot-check a sample.

To re-derive Cloud issueIds from issueKeys (which usually survive):

```javascript
const cloudIssue = await cloud.getIssue("ABC-123", "id");
mapping[sourceIssueId] = cloudIssue.id;
```

## When a mapping is missing

If you reach the sync phase with a missing mapping (e.g. a user without an accountId, a custom field without a destination ID), do **not** skip silently. Two acceptable patterns:

1. **Mark the entry as `failed` with a clear reason** so it surfaces in `failed_<runId>.csv`:
   ```javascript
   if (!fieldMap[entry.sourceFieldId]) {
     pm.updateEntryStatus(id, "failed", `No destination mapping for field ${entry.sourceFieldId}`);
     continue;
   }
   ```

2. **Abort the whole run** with a count of missing mappings:
   ```javascript
   const missing = entries.filter((e) => !fieldMap[e[1].sourceFieldId]);
   if (missing.length > 0) {
     throw new Error(`${missing.length} entries have unmapped fields. Fix mappings/fields.json before re-running.`);
   }
   ```

Pattern 1 is more permissive (most of the run succeeds); pattern 2 is safer (no partial mutation when a fundamental input is wrong). Choose based on the migration's risk profile.

## Audit verifies the mapping

The audit phase is where you confirm the mapping was correct. Compare the destination's actual field/user/issue against what the plan said it should be — if PASS rates are high, your mapping was correct.

If you see systematic FAILs on one mapping (e.g. all "field X" rows fail), the destination's field has a different ID than the mapping says, or its type changed. Re-run `buildCustomFieldMap` and check the diff.

## See also

- [`05-identity-resolution.md`](05-identity-resolution.md) — user/group mapping deep-dive
- [`24-production-patterns.md`](24-production-patterns.md) — pattern 6 (ID-map persistence)
- [Atlassian: Migration best practices](https://support.atlassian.com/migration/docs/migration-best-practices/)
