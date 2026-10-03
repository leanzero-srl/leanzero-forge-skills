# JSM (Jira Service Management) Migration Patterns

JSM projects carry a permission model that ordinary Jira migration scripts ignore — and that model is the single biggest production blocker when scripting against migrated service-desk projects. This doc captures the gotchas distilled from the OpenBet cloud→cloud consolidation (`cloudtocloud-automation-helpers-v3`, `disable_sgdigital_accounts`).

## 1. The Service Desk Team role requirement (the big one)

**Symptom:** any mutation that runs *as an actor on a JSM project* — creating/importing an automation rule, asset/ticket association, transition, comment — fails with:

```
400 component.missing.permissions.actor
  ("EDIT_ISSUES / TRANSITION_ISSUES / ADD_COMMENTS / BROWSE_PROJECTS (Spaces <projectId>)")
```

**The trap:** the actor account *is* a Jira/site admin, and `GET /rest/api/3/mypermissions` reports `havePermission: true` for those very permissions. The check lies. The JSM automation engine gates agent actions on **real `Service Desk Team` (agent) role membership** on the project — not site-admin, not generic browse/edit grants surfaced by `/mypermissions`.

**The fix — pre-flight `ensureProjectRole("Service Desk Team")` before any JSM mutation.** Add the actor to the agent role on every target JSM project. From `ensure_actor_access.js`:

```javascript
const ROLE_NAME = "Service Desk Team";

// 1. List the project's roles → { "Service Desk Team": "<roleUrl>", ... }
const roles  = await get(`${base}/rest/api/3/project/${projectId}/role`);
const roleUrl = roles[ROLE_NAME];
if (!roleUrl) return "noRole";          // non-JSM project → skip
const roleId = roleUrl.split("/").pop();

// 2. Idempotency: is the actor already an actorUser of that role?
const role = await get(roleUrl);
const present = (role.actors || []).some(
  (a) => a.actorUser && a.actorUser.accountId === ACTOR,
);
if (present) return "already";

// 3. Grant it
await post(`${base}/rest/api/3/project/${projectId}/role/${roleId}`, { user: [ACTOR] });
```

Notes grounded in the script:
- **Idempotent**: skip projects where the actor is already present, and skip projects with no `Service Desk Team` role (they're non-JSM).
- **No new agent seat is consumed** if the account already holds a JSM agent licence elsewhere on the site.
- Resolve the role **id per project by name** — role ids are not stable across projects/sites.
- `ROLE_NAME` is parameterised (default `Service Desk Team`) so the same pre-flight works against renamed roles.

See `templates/jsm-role-preflight.js` for the copy-pasteable version.

## 2. The add-on / app actor role (`atlassian-addons-project-access`)

When the rule actor is the **app** ("Run rule as Jira" / Automation for Jira), the action runs through a *different* role: **`atlassian-addons-project-access`**. Connect/Forge apps (Automation for Jira, JMWE, Assets, Email This Issue) act on issues through that role. If a project's **permission scheme** does not grant the role the issue-action permissions, app/automation actions fail with the same `component.missing.permissions.actor` shape.

`ensure_addon_access.js` normalises every project's permission scheme so the add-on role can act:

```javascript
const ROLE_NAME = "atlassian-addons-project-access";
const PERMS = ["BROWSE_PROJECTS","CREATE_ISSUES","EDIT_ISSUES","ADD_COMMENTS",
  "TRANSITION_ISSUES","ASSIGN_ISSUES","LINK_ISSUES","RESOLVE_ISSUES",
  "CLOSE_ISSUES","SCHEDULE_ISSUES"];

// dedupe by scheme id — schemes are shared across projects
const scheme = await get(`${base}/rest/api/3/project/${pid}/permissionscheme?expand=permissions`);
if (doneSchemes.has(scheme.id)) continue;
doneSchemes.add(scheme.id);
// grant each missing perm to the projectRole holder
await post(`${base}/rest/api/3/permissionscheme/${scheme.id}/permission`, {
  holder: { type: "projectRole", parameter: roleId },
  permission: perm,
});
```

Key points: **dedupe by permission-scheme id** (schemes are shared across many projects — granting once covers all), resolve the role id **per project by name**, and check `holder.type === "projectRole"` with `holder.parameter` matching the role id before deciding a perm is already present.

**Which role do you need?** Actor = a real user → `Service Desk Team` (§1). Actor = the app ("Jira" actor, accountId prefix `557058:`) → `atlassian-addons-project-access` permission-scheme grant (§2). The automation migrator's correct default is the **app actor**, so §2 is usually the one you run; §1 is for `ACTOR_OVERRIDE=<user>` runs.

## 3. Assets / CMDB workspace and object-type remapping

JSM Assets (Insight) is **single-workspace per site**. Discover the workspace id with:

```javascript
GET /rest/servicedeskapi/assets/workspace   // → values[0].workspaceId
```

When migrating asset-touching automation rules cloud→cloud, two layers don't remap automatically:
- The **workspaceId** appears verbatim in rule bodies — string-replace src→tgt across the serialized rule.
- `cmdb.object.create` actions carry numeric `objectTypeId` / `schemaId` that are **local to the source workspace**. The generic field-mapper does NOT remap them, so a verbatim copy points at the wrong (or non-existent) target type and create fails with *"User does not have permission to create rule with this object type."* Remap by **label** (`schemaLabel::objectTypeLabel`), which the action conveniently also stores. Build the target catalog from:

```
GET https://api.atlassian.com/jsm/assets/workspace/{workspaceId}/v1/objectschema/list
GET .../objectschema/{id}/objecttypes/flat
```

## 4. Customer / portal account types

JSM introduces account types beyond the Jira norm. When operating on the org user list (suspension, identity resolution), each account has `account_type ∈ { atlassian | app | customer }`:
- `customer` = JSM portal users.
- `app` = Connect/Forge service accounts.
- `atlassian` = real staff accounts.

`disable_sgdigital_accounts` skips non-`atlassian` types by default with `skipReason=non-atlassian-type:<type>` — customer/app accounts are usually handled separately, not bulk-mutated alongside staff. Filter on `account_type` before any user mutation. (Account suspension itself is an **org-admin** operation — see `gotchas.md`.)

## 5. JCMA-specific JSM rough edges

These are JCMA behaviours you clean up *after* the bulk move (standard JCMA limitations, confirm against current Atlassian docs):

- **`Customer Request Type` → `Request Type` rename.** JCMA renames the request-type field on Cloud JSM projects. Any JQL, automation, or saved filter that referenced `Customer Request Type` by name breaks — sanitize it (see `docs/10-jql-and-aql-rewriting.md`).
- **Approval-step field references** inside workflow/automation rules need field-id remapping like any other custom-field reference (`docs/post-jcma-id-mapping.md`).
- **SLAs are not migrated.** JCMA does not carry over JSM SLA configurations or running SLA clocks — re-create SLA definitions manually or via API on the target after cutover.

## Pre-flight order for any JSM mutation script

1. Resolve the actor accountId (real user, or the target's app actor `557058:<uuid>`).
2. If actor is a **user** acting on JSM projects → `ensureProjectRole("Service Desk Team")` on every target project (`templates/jsm-role-preflight.js`).
3. If actor is the **app** → ensure `atlassian-addons-project-access` has the needed perms in every project's permission scheme.
4. Discover the Assets workspaceId (and build the target object-type-by-label catalog if rules create CMDB objects).
5. Only then run the mutation. Without 2/3 you will hit `component.missing.permissions.actor` on the first JSM project.

## See also

- [`20-automation-rule-migration.md`](20-automation-rule-migration.md) — the migrator that needs all of the above
- [`10-jql-and-aql-rewriting.md`](10-jql-and-aql-rewriting.md) — `Customer Request Type` rename, JQL sanitization
- [`gotchas.md`](gotchas.md) — Service Desk Team trap, org-admin account suspension
- [`templates/jsm-role-preflight.js`](../templates/jsm-role-preflight.js)
