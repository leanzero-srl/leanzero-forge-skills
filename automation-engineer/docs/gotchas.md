# Gotchas — read this before calling `POST /rule`

## ✅ `POST /rule` (create) — the three rules, no exceptions

This endpoint returns the identical unhelpful `{"errors":[{"status":400,"code":"api.error.unknown",
"title":"The request body could not be parsed, please ensure the values provided are valid."}]}`
for **any payload that violates any one of the three rules below** — a hand-built two-field body,
a byte-perfect resubmission of a rule this exact API just created and handed back on `GET`, a fully
faithful remap of a real production rule — all fail identically until every rule is satisfied at
once. It gives zero indication of *which* rule you broke. Response headers, timing, which of the
two API hosts you use, CDN cache status — all checked live, all red herrings. The fix is these
three things and nothing else.

1. **Keep the ENTIRE structure exactly as `GET /rule/{uuid}` returned it.** Component `id`s,
   `parentId`/`conditionParentId`, `created`, `updated` — none of it needs stripping, despite how
   read-only-looking `created`/`updated` are and how tempting it is to null out `parentId` once
   you've removed the `id` it points to. The docs' own line — "Accepts a rule payload, which has
   the same structure as the get a rule by UUID response" — is literally, exactly true. Proven by
   bisection: substituting a *whole* production rule's `trigger` into a known-working rule
   succeeded, substituting its whole `components` tree succeeded, and substituting BOTH at once
   succeeded — the tree shape was never the problem. **A hand-built minimal payload still fails
   even with a correct uuid and author** (see rule 3) — always start from a real `GET` response
   (yours, or a `/template/create`-made one) and mutate only what needs to change; never assemble
   one from "the fields that sound required."
2. **Set `rule.uuid` to a freshly generated, valid UUID v7** (not v4, not omitted). This is stated
   only in the Postman collection's endpoint description, not the OpenAPI schema or the prose
   docs: *"If providing a UUID for your new rule, it must be unique and V7."* Omitting `uuid`
   entirely produces the same generic parse failure as everything else; reusing the source rule's
   own uuid is the ONE mistake that breaks through with a specific, honest error —
   `"Can't create a rule with a UUID that already exists"` — which is how this was finally cracked:
   that error proved the structure was fine and the uuid was the last, previously-hidden blocker.
   Python predating `uuid.uuid7` (3.9–3.13): build it by hand — 48-bit ms timestamp, version
   nibble `0111`, 12 bits random, variant bits `10`, 62 bits random.
3. **Set `rule.authorAccountId` to a real, valid accountId on the TARGET tenant — never omit it.**
   This was the actual final root cause, and the cruelest one: omitting it (a completely reasonable
   assumption — the field is clearly populated by the server on every `GET`, and every other
   optional-looking field really was optional) silently produces the identical generic parse error
   as every structural mistake above, with no hint it's an auth-adjacent field rather than a shape
   problem. accountIds are **org-shared** across every site in the same Atlassian organization
   (proven the same way group UUIDs are — see below), so the source rule's own author id is
   usually already valid on the target; the calling user's own accountId is always a safe choice.

## One more trap PAST the three rules — raw project/issuetype ids

A `jira.issue.create` action can set the `project` or `issuetype` field by **raw numeric ID**, not
an ARI: `{"field":{"type":"ID","value":"project"},"fieldType":"project","value":{"type":"ID",
"value":"<id>"}}`. This is invisible to any `cf[]`/ARI scanner (no `cf[]`, no `ari:` string) and
invisible to the generic parse-failure path — it fails LATE and SPECIFICALLY, *after* a successful
create, with `"CREATE_ISSUES (Spaces <id>) ... missing.permissions.connection-user"`, because the
connection-user genuinely lacks permission to create in what is, from the target tenant's
perspective, someone else's project. Scan every action for `fieldType in ("project", "issuetype")`
with `value.type == "ID"` and remap the raw id by name (project key or issue-type name), the same
as any other cross-tenant reference.

## The three ways a copied rule silently breaks on a different site

A rule's JSON is full of numbers and strings that only mean something on the tenant they came
from. Blindly `POST`-ing a `GET`-ted rule body to a different site's `/rule` endpoint will create
*something*, but it may reference the wrong project, the wrong field, or the wrong Assets object —
and because none of these fail loudly (a JQL condition referencing a nonexistent field ID just
never matches, forever), this is exactly the kind of defect that survives silently.

1. **`ruleScopeARIs` and event-filter ARIs carry the source site's `cloudId` and object id.**
   `ari:cloud:jira:<sourceCloudId>:project/<id>` means nothing on a different cloudId — the same
   numeric project id on a different site is unrelated (or nonexistent). Resolve the target
   project's own id (`GET /project/{key}`) and rebuild the ARI with the TARGET's cloudId and
   project id. Never copy the ARI string across sites.

2. **JQL-type conditions/actions embed raw custom field IDs as `cf[NNNNN]`.** The equivalent field
   on another tenant has a different number entirely. A copied JQL string silently references
   either nothing (JQL error → fails loud, at least) or — worse — a real but unrelated field with
   that number on the target (silently wrong, no error). **Regex-scan every JQL string for
   `cf\[\d+\]`, resolve each field ID's NAME on the source (`GET /field/{id}`), find the matching
   field by name on the target, and rewrite the JQL before creating the rule there.**

3. **JQL can also embed a full Assets/Insight object reference as an ARI**, e.g.
   `cf[NNNNN] = "ari:cloud:cmdb::object/<workspaceUuid>/<objectId>"` — that string carries the
   source's Assets **workspace UUID** and a specific **object id**. The equivalent object on the
   target's own Assets workspace has both a different workspace UUID and a different object id.
   Resolve the object by its Assets AQL `Name` (or whatever business key identifies it) on the
   target workspace, and rewrite the ARI. Same class of problem as #2, one layer deeper — a single
   JQL string can carry BOTH a field-id trap and an object-ARI trap.

**What travels safely, unchanged:** smart-value templates that reference fields by NAME
(`{{triggerIssue.Field Name}}` — plain text, not a `cf[]` reference), rule `name`/`description`/
`labels`, action operations that address a field by `{"type": "NAME", "value": "Field Name"}`
rather than `{"type": "ID", ...}`, and — proven live — **group UUIDs and user accountIds**, which
are shared across every site in the same Atlassian organization and need zero remapping. Prefer
NAME-addressed fields when you have the choice while rebuilding a rule for a new tenant — the whole
reason `cf[NNNNN]` breaks is that it's an ID, not a name.

**Practical migration order:** (1) `GET /rule/summary` filtered by source scope ARI to get the rule
list; (2) `GET /rule/{uuid}` for each; (3) regex-scan every string value in the JSON for `cf\[\d+\]`
and `ari:cloud:` to find every reference that needs remapping, resolve each on the source, look up
the target equivalent by NAME; (4) also scan every action for raw `project`/`issuetype` ids (the
trap above — invisible to the `cf[]`/ARI scan); (5) rewrite `ruleScopeARIs`, the trigger's
`eventFilters`, and every found reference to the target's own ids; (6) `POST /rule` on the target
with the rewritten body (fresh v7 uuid, valid target-tenant `authorAccountId`), in `state:
DISABLED` first; (7) read it back, diff structurally against the rewritten source (not the raw
source — the ids are supposed to differ) by full-text-scanning the read-back for any surviving
source-tenant cloudId or project id; (8) only then flip `state` to `ENABLED` if the original was.

## Granular API tokens don't cover this API — don't waste one finding that out

Scoped ("granular") API tokens draw from a scope catalog tied to Jira/Confluence's classic
`/rest/api/...` surface. This API lives on a different host entirely and isn't in that catalog —
confirmed live: no automation/rule-related scope exists in the granular-token scope picker at all,
and a token scoped to anything else gets a distinct `401 "Unauthorized; scope does not match"` on
*every* call to this API, including plain reads that a classic (unrestricted) token handles fine.
If you hit an auth wall on this API, check whether you're on a granular token before assuming the
scope needs adjusting — the real fix is switching back to a classic token.
