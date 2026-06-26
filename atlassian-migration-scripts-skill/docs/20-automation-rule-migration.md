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
https://<site>/gateway/api/automation/public/jira/<cloudId>/rest/v1/rule        # POST create
.../rest/v1/rule/{ruleUuid}                                                      # PUT update
```

Create/update take a **wrapped** payload `{ rule: <body>, connections: [] }`. The body is reduced to a stable allow-list of fields before sending (verbatim from the scripts):

```javascript
const CREATE_FIELDS = ["actor","authorAccountId","canOtherRuleTrigger","collaborators",
  "components","description","labels","name","notifyOnError","ruleScopeARIs","state",
  "trigger","writeAccessType"];
```

A successful create returns `res.data.ruleUuid`. **`state` on create is not reliably honored** — after create, enforce the desired state with an explicit `enableRule` / `disableRule` call.

## The rule actor ("Run rule as") — the #1 create failure

The SOURCE rule's actor is the *source* site's Automation-for-Jira app account (`557058:<source-uuid>`). That account does not exist on the target, so creating with it fails `400 component.missing.permissions.actor`. Three strategies, in priority order:

1. **`ACTOR_OVERRIDE=<accountId>`** — run rules as a specific **user**. Only if you want actions attributed to a person; that user must hold the perms (for JSM, must be a `Service Desk Team` agent — run `ensure_actor_access.js` first).
2. **App actor (the correct default)** — set the actor to the *target's* Automation-for-Jira app account (the "Jira" actor) so rules run with app-level permissions and match native rules. Auto-discover it from existing target rules:

```javascript
const APP_ACTOR_PREFIX = "557058:";   // app account ids on every Cloud site share this prefix
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
