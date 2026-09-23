# Automation Rule Migration (DC→Cloud and Cloud→Cloud)

Migrating Automation for Jira rules is its own sub-discipline: rules are deeply ID-bound (projects, issue types, custom fields, statuses, users, Assets workspaces), the actor model gates creation (see `docs/19-jsm-migration-patterns.md`), and Data Center doesn't even expose rule bodies over REST. This doc distills `cloudtocloud-automation-helpers-v3` (OpenBet C2C, McLaren DC→Cloud).

## The non-interactive pipeline (the path actually used)

The interactive CLI modes are flaky. The reliable flow is standalone scripts run in order:

1. **`export_all.js`** — full export of source rules (summary + per-rule body) → `automation_rules_FULL_<site>_<date>.json`.
2. **`gen_mappings.js`** — cache source→target id maps → `mappings.json`.
3. **`ensure_actor_access.js`** — add the actor to each target JSM project's `Service Desk Team` role (and/or `ensure_addon_access.js` for the app actor). REQUIRED — see `docs/19-jsm-migration-patterns.md`.
4. **`import_clean.js`** — import the cleanly-mappable rules.

## The Cloud automation REST surface

Rules live behind a gateway path keyed by cloudId, **not** under `/rest/api/3`:

```
https://<site>/gateway/api/automation/public/jira/<cloudId>/rest/v1/rule/summary  # GET list (+POST search)
.../rest/v1/rule                                                                   # POST create
.../rest/v1/rule/{ruleUuid}                                                        # GET body / PUT update / DELETE
.../rest/v1/rule/{ruleUuid}/state                                                  # PUT enable/disable
```

`https://api.atlassian.com/automation/public/{product}/{cloudId}/rest/v1/...` is the same
API; `{product}` also accepts `confluence`. **CORRECTED 2026-08-19 (measured on wolfaenpak):**

- **`GET /rest/v1/rule` returns 404** — the list is `/rule/summary`. A 404 here looks exactly
  like a bad cloudId or bad token; it is neither.
- **`links.next` is a bare query string** (`"?cursor=...&limit=50"`), not an absolute URL and
  not a path. A `next.startsWith(basePath)` check falls through and silently stops at page one.
- **`PUT /rule/{uuid}/state` takes `{"value":"ENABLED"|"DISABLED"}`** — NOT `{"state":...}`,
  which returns the generic parse 400.
- **`DELETE` needs a `Content-Type: application/json` header even with no body**, else 415 with
  an empty response. And it refuses an enabled rule: *"Rule cannot be deleted unless it is
  already disabled."* Rollback is always disable-then-delete.
- **A missing required field returns a generic 400** — *"The request body could not be parsed"* —
  that names no field. Eight of the thirteen create fields do this: `actor`, `authorAccountId`,
  `canOtherRuleTrigger`, `name`, `notifyOnError`, `state`, `trigger`, `writeAccessType`.
  `components: []` and a missing `ruleScopeARIs` DO get specific messages. Optional:
  `collaborators`, `description`, `labels`.
- **A guessed component `type` returns 500 with an empty body**, not a validation error. Never
  hand-author component JSON; copy the source rule's blocks verbatim.

Create/update take a **wrapped** payload `{ rule: <body>, connections: [] }`. The body is reduced to a stable allow-list of fields before sending (verbatim from the scripts):

```javascript
const CREATE_FIELDS = ["actor","authorAccountId","canOtherRuleTrigger","collaborators",
  "components","description","labels","name","notifyOnError","ruleScopeARIs","state",
  "trigger","writeAccessType"];
```

A successful create returns `res.data.ruleUuid`. **CORRECTED 2026-08-19:** `state` on create
**IS** honored — created with `"state":"ENABLED"` and read back `ENABLED`; same for `DISABLED`
(measured both directions on wolfaenpak). The earlier "not reliably honored" note is struck.
This matters in the dangerous direction: replay a source export verbatim and an enabled rule is
**live the moment it is created**. Force `state: "DISABLED"` on import and enable in a reviewed
second pass. Note both migration routes already do this — JCMA and the UI import both land rules
disabled.

## The rule actor ("Run rule as") — the #1 create failure

**CORRECTED 2026-08-19 — measured, and the old text was wrong twice over.** There are exactly
two actor failures and neither uses the code this doc used to quote:

```
actor does not exist on the target
  400  "The selected actor does not exist. Please chose an actor that exists. ..."   (Atlassian's typo)
actor exists but is deactivated / has no product access
  400  "The selected actor does not have access to this product. Please choose another user."
```

The second is the one that ambushes real migrations: on wolfaenpak **11 of 18 rules ran as a
deactivated account**. Rules already running are never re-validated; creation validates. Resolve
every distinct source `actorAccountId` against the TARGET's `GET /rest/api/3/user?accountId=`
before writing any import code.

Also measured: the **Automation for Jira app account id is IDENTICAL across two unrelated
tenants** (same `557058:` id, different organisations). It is a global product identity, not a
per-site one — so it does not automatically need rewriting. Verify it exists on the target
rather than assuming either way.

Three strategies, in priority order:

1. **`ACTOR_OVERRIDE=<accountId>`** — run rules as a specific **user**. Only if you want actions attributed to a person; that user must hold the perms (for JSM, must be a `Service Desk Team` agent — run `ensure_actor_access.js` first).
2. **App actor (the correct default)** — set the actor to the *target's* Automation-for-Jira app account (the "Jira" actor) so rules run with app-level permissions and match native rules. Auto-discover it from existing target rules:

**DO NOT USE THE PREFIX HEURISTIC BELOW — measured unsound 2026-08-19.** On wolfaenpak the
`557058:` prefix matched **7 of 121** app accounts (93 were `712020:`, 21 were legacy 24-hex)
and ALSO matched **2 real humans**; on a second unrelated site, 6 of 101 apps and 3 humans.
The correct test is one field: `GET /rest/api/3/user` → **`accountType === "app"`**. Kept below
only so the old code is recognisable.

```javascript
const APP_ACTOR_PREFIX = "557058:";   // WRONG — see the correction above
function discoverAppActor(existingRules) {
  const counts = new Map();
  for (const r of existingRules || []) {
    const a = r.actorAccountId || (r.actor && (r.actor.actor || r.actor.value));
    if (typeof a === "string" && a.startsWith(APP_ACTOR_PREFIX)) counts.set(a, (counts.get(a)||0)+1);
  }
  // return the most common app-actor id (or null)
}
payload.actor = { type: "ACCOUNT_ID", actor: appActor };
```

3. On a **fresh** target with no existing rules to discover from, pass `APP_ACTOR=<accountId>` (format `557058:<uuid>`) explicitly, or the source actor stays and you 400.

`repoint_actor.js` does (2) standalone — change ONLY the `actor` field of named rules in place, leaving every other field verbatim.

## Operating modes

The v3 toolkit ships purpose-built scripts for different starting states. Pick by *what already exists on the target*:

| Script | Use when | What it does |
|---|---|---|
| `import_clean.js` | Target has **no** copy of the rules | Fix IDs → wrap → POST create → enforce state. Imports only the *clean* set (zero unmapped refs). |
| `reconcile_target.js` | Target **already has** the rules (e.g. JCMA-migrated) | Fix field refs + enable IN PLACE via PUT — **no re-import, no create**. |
| `fix_migrated_refs.js` / `repoint_actor.js` | Rules on target reference wrong fields/actors | Load live target rules, repoint refs (PUT in place), no re-import. |
| `ensure_actor_access.js` / `ensure_addon_access.js` | Before any of the above | Grant actor the `Service Desk Team` / `atlassian-addons-project-access` role. |

### reconcile-target (fix + enable in place — no import)

For JCMA-migrated rules that are already on the target but point at broken field ids and are disabled. It:
1. Reads every rule already on the **target** (full bodies).
2. Reads source-of-truth rules from a **Data Center** instance (`DC_RULES_BASE`, e.g. via `/rest/cb-automation/latest/project/GLOBAL/rule`) → desired ENABLED/DISABLED state + which rules are in scope.
3. Builds a **DC-authoritative field map**: DC field id → DC field name → target Cloud field by name → Cloud id. **Default-safe** — only remaps DC ids that are *broken* on the target; `AGGRESSIVE=1` also remaps id-collisions (where the same number is a different, valid field on Cloud — review the diff).
4. PUTs the corrected rule in place and sets its state to match DC.
5. **Surplus** target rules (no matching DC rule by name) are **NEVER touched**.

The collision-safety logic, verbatim:

```javascript
for (const [dcId, dcName] of dcIdToName) {
  const cloudId = tgtNameToId.get(dcName);
  if (!cloudId || cloudId === dcId) continue;
  const isCollision = tgtIdToName.has(dcId);   // dcId is ALSO a real (different) target field
  if (isCollision && !aggressive) { collisions++; continue; }  // don't clobber a valid ref
  customFieldMapping[dcId] = cloudId;
}
```

## Dedup-by-NAME gotcha (the silent skip)

`import_clean.js` dedupes by **rule name**: `existingNames = new Set(existing.map(r => r.name.trim().toLowerCase()))`. Any source rule whose name already exists on the target is skipped. **Implication:** if you have N per-project copies of a same-named rule (common — "Auto-assign on create" cloned across projects), only the first lands; copies 2..N are silently skipped once the name exists in the target. If you need all copies, rename them uniquely before import or import per-project into name-namespaced targets.

## DC does NOT expose rule bodies over REST — the hybrid flow

Jira Data Center has **no Automation REST API**. `GET` against the Cloud automation path returns `{}` on DC; rules live behind the UI / WebSudo. So DC→Cloud is necessarily **hybrid**:

1. **Manual export from the DC UI**: Project/Global Settings → Automation → Export → `automation.json`.
2. **Bash mapping generator** reads `automation.json`, extracts every entity id (projects, custom fields, issue types, statuses, user accountIds), queries DC APIs for names/keys/emails → `datacenter_cloud_mapping.json` with `cloud_id: null` placeholders.
3. **Node `datacenter-to-cloud` mode** auto-populates the Cloud ids by querying the Cloud API and matching: projects by **key**, issue types by **name**, custom fields by **name + field type**, statuses by **name + category**, users by **email**. Then it fixes the rule JSON and emits an import-ready file.

## ID / ARI remapping at a glance

The mapping file is the source of truth — `{ projects, custom_fields, issue_types, statuses, users }`, each entry `{ datacenter_id, key|name|email, cloud_id }`. Phase-1b auto-population fills `cloud_id` by querying the Cloud API. Beyond scalar ids:
- **Assets workspaceId** is string-replaced across the serialized rule (`docs/19-jsm-migration-patterns.md`).
- **`cmdb.object.create` object-type/schema ids** are remapped by label, not number.
- **`ruleScopeARIs`** must be regenerated for the Cloud tenant (ARI carries the cloudId).

## Email-action safety

Rules with an email/notify action are imported **DISABLED regardless of source state** and listed, so a migration can't accidentally blast notifications from half-migrated data. Re-enable deliberately after review.

## See also

- [`19-jsm-migration-patterns.md`](19-jsm-migration-patterns.md) — the actor/role pre-flight these scripts depend on
- [`post-jcma-id-mapping.md`](post-jcma-id-mapping.md) — which ids change, the mapping table layout
- [`10-jql-and-aql-rewriting.md`](10-jql-and-aql-rewriting.md) — rewriting field refs inside rule smart values
- [`24-production-patterns.md`](24-production-patterns.md) — pattern 38 (Service Desk Team pre-flight)


## ruleScopeARIs is the only scope that matters (measured 2026-08-19)

Two ARI shapes, and the cloudId sits in a different position in each:

```
ari:cloud:jira::site/<cloudId>                  # global rule (empty 4th segment)
ari:cloud:jira:<cloudId>:project/<projectId>    # project-scoped rule
```

- Leaving a **source cloudId** in `ruleScopeARIs` returns `400 "User does not have admin
  permission within this rule home"`. That message is misleading — it is not a grant problem,
  the target simply does not own that cloudId. Check ARIs before checking permissions.
- A rule's trigger carries its **own** project reference in `trigger.value.eventFilters`. Send a
  scope and a trigger filter that **disagree** and the API returns **201** and then **silently
  rewrites the trigger to match the scope**. Verified by readback AND by firing the rule: the
  scope project's issue transitioned in under 5s, the trigger-filter project's issue was
  untouched at 25s.
- **Consequence for the audit:** a source-vs-target diff of the rule JSON will always show the
  trigger matching, because the server wrote it. Assert `ruleScopeARIs` against the **mapping
  table**, never against the rule you just created.

## Two more corrections to the dedup-by-NAME section

- The **API accepts duplicate rule names** (two byte-identical names, both 201). The dedup is
  purely a script convention.
- The **UI import renames on collision** to `Copy of [flowname]` (Atlassian's own doc).
- So three tools give three different answers for the same input. On wolfaenpak, 18 rules carry
  only **4 distinct names** (two names appear 8× each) — a name-keyed importer lands 4 and
  silently skips 14. **Key on the source rule `uuid`, never the name.**

## What each migration route actually does (primary sources, read 2026-08-19)

- **DC → Cloud (JCMA):** rules DO migrate (project and/or global; needs A4J 7.2.6+ or A4J Lite
  7.3.3+). *"All migrated automation flows are disabled on the cloud by default post migration."*
  Not included: *"Flow actors, Automation audit logs, Performance insights, Global configuration
  settings."* — **the actor does not come with them.**
- **Cloud → Cloud ("Copy product data"):** automation is marked **❌ Automation flows (including
  project-level automation flows)** and, for JSM, **❌ Jira automation**. **Nothing comes across.**
- **UI export/import** (Jira settings → System → Automation flows → More actions): one JSON, all
  global + project flows, 5 MB cap, one-to-one only, and *"All imported flows will initially be
  disabled."*

Published as <https://leanzero.net/tutorials/jira-automation-rules-migration-actor-scope>.
