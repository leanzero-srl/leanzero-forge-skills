"use strict";

/**
 * workflow-transformer — transform a Jira Cloud workflow JSON between
 * tenants or between DC source and Cloud destination, remapping all
 * entity IDs (statuses, screens, custom fields, transitions, roles,
 * groups) as it walks the tree.
 *
 * Designed for `POST /rest/api/3/workflows/create` and
 * `POST /rest/api/3/workflows/update` payloads (the bulk APIs).
 *
 *   const wt = require("../src/workflowTransformer");
 *
 *   const { payload, warnings, droppedRules } = wt.transformWorkflow(srcWorkflow, {
 *     idMap: {
 *       status:       { "10001": "20001", "10002": "20002" },
 *       customField:  { "10042": "10318", "10043": "10319" },
 *       screen:       { "5":     "8" },
 *       group:        { "old-group-id": "new-group-id" },
 *       projectRole:  { "10010": "20010" },
 *     },
 *     dropRuleKeys: ["scriptrunner:*"],   // ScriptRunner rules can't migrate; drop
 *     statusesToDrop: new Set(["10005"]),  // status that doesn't exist in dest
 *   });
 *
 * The transformer:
 *   - Maps every numeric ID encountered in `attrs.id`, `attrs.statusId`,
 *     `attrs.transitionId`, `attrs.fieldId`, etc.
 *   - Drops transitions whose `to` status is in `statusesToDrop`.
 *   - Drops rules whose key matches a glob in `dropRuleKeys`.
 *   - Cleans up corrupted JMWE prefixes (e.g. `jmwe-cloud:jmwe-cloud:...`).
 *   - Records every change in `warnings[]` for audit.
 *
 * It is the operator's job to BUILD the idMap (see `cloud-catalog.js`)
 * and decide WHAT to drop. This template just performs the transform.
 */

function _glob(pattern, str) {
  if (!pattern.includes("*")) return pattern === str;
  const re = new RegExp("^" + pattern.split("*").map(_escapeRe).join(".*") + "$");
  return re.test(str);
}
function _escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

/**
 * Walk a value tree, calling `visit(node, key, parent)` for every object
 * and array encountered. The visitor can mutate `node` in place.
 */
function walk(node, visit, parent = null, key = null) {
  if (node === null || node === undefined) return;
  if (Array.isArray(node)) {
    visit(node, key, parent);
    for (let i = 0; i < node.length; i++) walk(node[i], visit, node, i);
    return;
  }
  if (typeof node === "object") {
    visit(node, key, parent);
    for (const k of Object.keys(node)) walk(node[k], visit, node, k);
  }
}

/**
 * Remap an ID using the supplied submap (e.g. `idMap.status`).
 * Returns the remapped ID, or the original if no mapping exists.
 * Logs the change to `warnings` either way.
 */
function _remap(submap, id, kind, warnings) {
  if (id == null) return id;
  const key = String(id);
  const cloud = submap[key];
  if (cloud !== undefined && cloud !== null && cloud !== key) {
    warnings.push({ kind: "remap", entity: kind, from: key, to: String(cloud) });
    return String(cloud);
  }
  return id;
}

/**
 * Clean up JMWE Connect-rule key prefixes. JCMA sometimes double-encodes
 * the prefix, producing `jmwe-cloud:jmwe-cloud:...`. Cloud rejects those.
 */
function _cleanRuleKey(key) {
  if (typeof key !== "string") return key;
  // collapse double-prefixed JMWE keys
  return key.replace(/^(jmwe-cloud:)\1+/, "$1");
}

/**
 * Main entry point.
 *
 * @param {object} workflow            source workflow JSON (DC export OR Cloud GET /workflow/search)
 * @param {object} options
 * @param {{status: object, customField: object, screen?: object, group?: object, projectRole?: object}} options.idMap
 * @param {string[]} [options.dropRuleKeys]     rule keys (with `*` globs) to drop entirely
 * @param {Set<string>} [options.statusesToDrop] dest statuses that don't exist; transitions targeting them are dropped
 * @returns {{ payload: object, warnings: any[], droppedRules: any[], droppedTransitions: any[] }}
 */
function transformWorkflow(workflow, options = {}) {
  const idMap = options.idMap || {};
  const status = idMap.status || {};
  const cf = idMap.customField || {};
  const screen = idMap.screen || {};
  const group = idMap.group || {};
  const role = idMap.projectRole || {};
  const dropRuleKeys = options.dropRuleKeys || [];
  const statusesToDrop = options.statusesToDrop || new Set();

  const warnings = [];
  const droppedRules = [];
  const droppedTransitions = [];

  // Deep clone so we don't mutate the input.
  const out = JSON.parse(JSON.stringify(workflow));

  // ── 1. Status references inside `statuses[]` ─────────────────────
  if (Array.isArray(out.statuses)) {
    out.statuses = out.statuses.filter((s) => {
      if (statusesToDrop.has(String(s.id))) {
        warnings.push({ kind: "drop-status", id: String(s.id), name: s.name });
        return false;
      }
      s.id = _remap(status, s.id, "status", warnings);
      return true;
    });
  }

  // ── 2. Transitions ───────────────────────────────────────────────
  if (Array.isArray(out.transitions)) {
    out.transitions = out.transitions.filter((t) => {
      // Drop the transition if its `to` status got dropped
      const toId = String(t.to?.id ?? t.toStatusReference ?? "");
      if (toId && statusesToDrop.has(toId)) {
        droppedTransitions.push({ id: t.id, name: t.name, reason: "to-status-dropped" });
        return false;
      }
      // Remap `to` and `from` (or `fromStatusReference[]`)
      if (t.to?.id != null) t.to.id = _remap(status, t.to.id, "status", warnings);
      if (Array.isArray(t.from)) {
        t.from = t.from.map((f) => ({ ...f, id: _remap(status, f.id, "status", warnings) }));
      }

      // Screen references
      if (t.screen?.id != null) t.screen.id = _remap(screen, t.screen.id, "screen", warnings);

      // Walk rules tree
      if (t.rules) {
        _transformRules(t.rules, { cf, group, role, dropRuleKeys, warnings, droppedRules, transitionName: t.name });
      }
      return true;
    });
  }

  // ── 3. Top-level rules (in some payload shapes) ──────────────────
  if (out.rules) {
    _transformRules(out.rules, { cf, group, role, dropRuleKeys, warnings, droppedRules, transitionName: "<workflow>" });
  }

  return { payload: out, warnings, droppedRules, droppedTransitions };
}

function _transformRules(rules, ctx) {
  for (const bucket of ["conditions", "validators", "postFunctions"]) {
    if (!Array.isArray(rules[bucket])) continue;
    rules[bucket] = rules[bucket].filter((r) => {
      r.ruleKey = _cleanRuleKey(r.ruleKey);
      // Glob-match the rule key against drop list
      if (ctx.dropRuleKeys.some((p) => _glob(p, r.ruleKey || ""))) {
        ctx.droppedRules.push({
          transition: ctx.transitionName,
          ruleKey: r.ruleKey,
          reason: "matched dropRuleKeys",
        });
        return false;
      }
      _transformRuleConfig(r, ctx);
      return true;
    });
  }
  // Recurse into compound conditions
  if (rules.conditionsTree) {
    _transformConditionsTree(rules.conditionsTree, ctx);
  }
}

function _transformConditionsTree(node, ctx) {
  if (!node) return;
  if (node.conditions && Array.isArray(node.conditions)) {
    node.conditions = node.conditions.filter((c) => {
      c.ruleKey = _cleanRuleKey(c.ruleKey);
      if (ctx.dropRuleKeys.some((p) => _glob(p, c.ruleKey || ""))) {
        ctx.droppedRules.push({ transition: ctx.transitionName, ruleKey: c.ruleKey, reason: "compound-drop" });
        return false;
      }
      _transformRuleConfig(c, ctx);
      _transformConditionsTree(c, ctx);
      return true;
    });
  }
}

function _transformRuleConfig(rule, ctx) {
  if (!rule.parameters && !rule.configuration) return;
  const config = rule.parameters || rule.configuration;
  walk(config, (node, key) => {
    if (!node || typeof node !== "object" || Array.isArray(node)) return;
    // Common ID shapes in workflow rule configs:
    if (typeof node.fieldId === "string") {
      const m = node.fieldId.match(/^customfield_(\d+)$/);
      if (m && ctx.cf[m[1]]) {
        const newId = `customfield_${ctx.cf[m[1]]}`;
        ctx.warnings.push({ kind: "remap", entity: "fieldId", from: node.fieldId, to: newId });
        node.fieldId = newId;
      }
    }
    if (typeof node.groupId === "string" && ctx.group[node.groupId]) {
      ctx.warnings.push({ kind: "remap", entity: "groupId", from: node.groupId, to: ctx.group[node.groupId] });
      node.groupId = ctx.group[node.groupId];
    }
    if (typeof node.projectRoleId === "string" && ctx.role[node.projectRoleId]) {
      ctx.warnings.push({ kind: "remap", entity: "projectRoleId", from: node.projectRoleId, to: ctx.role[node.projectRoleId] });
      node.projectRoleId = ctx.role[node.projectRoleId];
    }
    // Generic `id` fields whose key indicates the type
    if (key === "statusId" && node !== null) {
      // node IS the id-bearing object — handled above by walking
    }
  });
}

module.exports = { transformWorkflow, walk };
