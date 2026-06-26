"use strict";

/**
 * JSM actor pre-flight — grant an actor the role it needs before mutating
 * JSM (Jira Service Management) projects.
 *
 * Distilled from cloudtocloud-automation-helpers-v3/{ensure_actor_access,ensure_addon_access}.js
 * (OpenBet C2C consolidation). See docs/19-jsm-migration-patterns.md.
 *
 * WHY: any mutation that runs AS AN ACTOR on a JSM project (importing an
 * automation rule, asset/ticket association, transition, comment) fails with
 *   400 component.missing.permissions.actor
 *     ("EDIT_ISSUES / TRANSITION_ISSUES / ADD_COMMENTS / BROWSE_PROJECTS (Spaces <projectId>)")
 * unless the actor holds the right role. Being a Jira/site admin is NOT enough,
 * and GET /rest/api/3/mypermissions can misleadingly report havePermission=true.
 *
 * Two cases:
 *   - actor is a REAL USER  -> must be in the project's "Service Desk Team"
 *                             (agent) role.  ensureProjectRole(...)
 *   - actor is the APP      -> the "atlassian-addons-project-access" project role
 *     ("Run rule as Jira")   must be granted issue-action perms in each project's
 *                             permission scheme.  ensureAddonSchemeAccess(...)
 *
 * Idempotent: skips projects/perms already satisfied; skips non-JSM projects
 * (no Service Desk Team role); dedupes shared permission schemes.
 *
 * Auth: Cloud Basic auth — pass an object with { request } that performs
 * `Authorization: Basic base64(email:apiToken)` GET/POST returning parsed JSON.
 * Reuse templates/cloud-jira-client.js (its makeRequest fits this shape).
 *
 * No external deps. No emoji (CI-safe).
 */

const SDT_ROLE = "Service Desk Team";
const ADDON_ROLE = "atlassian-addons-project-access";
const DEFAULT_ADDON_PERMS = [
  "BROWSE_PROJECTS", "CREATE_ISSUES", "EDIT_ISSUES", "ADD_COMMENTS",
  "TRANSITION_ISSUES", "ASSIGN_ISSUES", "LINK_ISSUES", "RESOLVE_ISSUES",
  "CLOSE_ISSUES", "SCHEDULE_ISSUES",
];

/**
 * @param {object} client  - has async request(method, path, body?) -> parsed JSON
 *                            (path is relative to the site base, e.g. "/rest/api/3/...")
 */
async function getAllProjects(client) {
  const out = [];
  let startAt = 0;
  for (;;) {
    const data = await client.request("GET", `/rest/api/3/project/search?startAt=${startAt}&maxResults=50`);
    const vals = (data && data.values) || [];
    out.push(...vals);
    if (vals.length < 50) break;
    startAt += vals.length;
  }
  return out;
}

function filterProjects(projects, only) {
  if (!only || !only.length) return projects;
  const want = new Set(only.map((s) => String(s).trim().toLowerCase()));
  return projects.filter((p) => want.has(String(p.id)) || want.has(String(p.key).toLowerCase()));
}

/**
 * Ensure `actorAccountId` is in the named project role on every (matching) project.
 * Default role = "Service Desk Team". Returns a result summary.
 *
 * @param {object} client
 * @param {string} actorAccountId
 * @param {object} [opts] - { roleName, only:[keys|ids], dryRun, log }
 */
async function ensureProjectRole(client, actorAccountId, opts = {}) {
  const roleName = opts.roleName || SDT_ROLE;
  const log = opts.log || (() => {});
  const projects = filterProjects(await getAllProjects(client), opts.only);
  const res = { added: [], already: [], noRole: [], failed: [] };

  for (const p of projects) {
    let roles;
    try {
      roles = await client.request("GET", `/rest/api/3/project/${p.id}/role`);
    } catch (e) {
      res.failed.push(`${p.key}: role list ${e.message}`);
      continue;
    }
    const roleUrl = roles[roleName];
    if (!roleUrl) { res.noRole.push(p.key); continue; }     // non-JSM project
    const roleId = String(roleUrl).split("/").pop();
    try {
      // role ids are NOT stable across projects/sites — resolve per project, by name
      const role = await client.request("GET", `/rest/api/3/project/${p.id}/role/${roleId}`);
      const present = (role.actors || []).some(
        (a) => a.actorUser && a.actorUser.accountId === actorAccountId,
      );
      if (present) { res.already.push(p.key); continue; }
      if (opts.dryRun) { res.added.push(`${p.key} (would add)`); continue; }
      await client.request("POST", `/rest/api/3/project/${p.id}/role/${roleId}`, { user: [actorAccountId] });
      res.added.push(p.key);
    } catch (e) {
      res.failed.push(`${p.key}: ${e.message}`);
    }
  }
  log(`ensureProjectRole "${roleName}": added=${res.added.length} already=${res.already.length} no-role=${res.noRole.length} failed=${res.failed.length}`);
  return res;
}

/**
 * Ensure the add-on project role has the required issue-action permissions in
 * every project's permission scheme (for app/"Run rule as Jira" actors).
 * Dedupes by scheme id (schemes are shared across projects).
 *
 * @param {object} client
 * @param {object} [opts] - { perms, only, dryRun, log, roleName }
 */
async function ensureAddonSchemeAccess(client, opts = {}) {
  const roleName = opts.roleName || ADDON_ROLE;
  const perms = opts.perms || DEFAULT_ADDON_PERMS;
  const log = opts.log || (() => {});
  const projects = filterProjects(await getAllProjects(client), opts.only);
  const res = { granted: [], already: [], noRole: [], failed: [] };
  const doneSchemes = new Set();

  for (const p of projects) {
    let scheme, roles;
    try {
      scheme = await client.request("GET", `/rest/api/3/project/${p.id}/permissionscheme?expand=permissions`);
      roles = await client.request("GET", `/rest/api/3/project/${p.id}/role`);
    } catch (e) { res.failed.push(`${p.key}: ${e.message}`); continue; }
    if (doneSchemes.has(scheme.id)) continue;   // shared scheme already handled
    doneSchemes.add(scheme.id);

    const roleUrl = roles[roleName];
    if (!roleUrl) { res.noRole.push(p.key); continue; }
    const roleId = String(roleUrl).split("/").pop();
    const has = (perm) => (scheme.permissions || []).some(
      (x) => x.permission === perm && x.holder && x.holder.type === "projectRole" &&
        String(x.holder.parameter || x.holder.value) === roleId,
    );
    for (const perm of perms) {
      if (has(perm)) { res.already.push(`${p.key}:${perm}`); continue; }
      if (opts.dryRun) { res.granted.push(`${p.key}:${perm} (would grant)`); continue; }
      try {
        await client.request("POST", `/rest/api/3/permissionscheme/${scheme.id}/permission`, {
          holder: { type: "projectRole", parameter: roleId },
          permission: perm,
        });
        res.granted.push(`${p.key}:${perm}`);
      } catch (e) { res.failed.push(`${p.key}:${perm}: ${e.message}`); }
    }
  }
  log(`ensureAddonSchemeAccess "${roleName}": granted=${res.granted.length} already=${res.already.length} no-role=${res.noRole.length} failed=${res.failed.length}`);
  return res;
}

/**
 * Discover the JSM Assets/CMDB workspace id (single workspace per site).
 * Returns the workspaceId string or null.
 */
async function assetsWorkspaceId(client) {
  try {
    const r = await client.request("GET", "/rest/servicedeskapi/assets/workspace");
    return (r && r.values && r.values[0] && r.values[0].workspaceId) || null;
  } catch (_) { return null; }
}

module.exports = {
  SDT_ROLE,
  ADDON_ROLE,
  DEFAULT_ADDON_PERMS,
  ensureProjectRole,
  ensureAddonSchemeAccess,
  assetsWorkspaceId,
};
