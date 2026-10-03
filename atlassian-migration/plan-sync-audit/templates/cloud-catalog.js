"use strict";

/**
 * CloudCatalog — snapshot the destination's "shape" once at the start of
 * a migration, then consume the cached view in plan / sync / audit.
 *
 * Why: every migration ends up resolving lots of "what's the destination
 * ID for X" lookups — custom fields by name, statuses by name, project
 * roles by name, permission schemes by ID, groups by name. Doing these
 * one-at-a-time during sync wastes rate-limit points and adds latency.
 * Doing them once up-front and caching to disk is faster, cheaper, and
 * makes the run reproducible from the cached snapshot.
 *
 * Usage:
 *
 *   const CloudCatalog = require("../src/cloudCatalog");
 *   const cat = new CloudCatalog(jiraClient, "mappings/cloud-catalog.json");
 *
 *   await cat.refresh();   // fetch fresh from API; pass {force: true} to bust cache
 *   const fieldId = cat.fieldByName("Story Points")?.id;
 *   const statusId = cat.statusByName("In Progress")?.id;
 *   const groupId = cat.groupByName("jira-users")?.groupId;
 *
 * The cache is a JSON file you can check in (audit-friendly). When the
 * destination changes substantially (new project, new custom field), bust
 * the cache with `--refresh-catalog`.
 */

const fs = require("fs");
const path = require("path");

class CloudCatalog {
  /**
   * @param {object} jiraClient                   instance of CloudJiraClient
   * @param {string} cacheFile                    e.g. "mappings/cloud-catalog.json"
   * @param {object} [opts]
   * @param {number} [opts.maxAgeMs=86400000]    invalidate cache after this many ms (default 24h)
   */
  constructor(jiraClient, cacheFile, opts = {}) {
    this.jira = jiraClient;
    this.cacheFile = cacheFile;
    this.maxAgeMs = opts.maxAgeMs || 86_400_000;
    this.catalog = null;
  }

  async refresh(opts = {}) {
    if (!opts.force && this._loadCache()) {
      return this.catalog;
    }

    const log = opts.log || console.log;
    log("[cloud-catalog] refreshing snapshot from Cloud...");

    const [fields, statuses, roles, groups, projects] = await Promise.all([
      this._fetchFields(),
      this._fetchStatuses(),
      this._fetchProjectRoles(),
      this._fetchGroups(),
      this._fetchProjects(),
    ]);

    this.catalog = {
      capturedAt: new Date().toISOString(),
      destination: this.jira.baseUrl,
      fields,
      statuses,
      roles,
      groups,
      projects,
    };
    this._saveCache();
    log(`[cloud-catalog] cached ${fields.length} fields, ${statuses.length} statuses, ${roles.length} roles, ${groups.length} groups, ${projects.length} projects to ${this.cacheFile}`);
    return this.catalog;
  }

  _loadCache() {
    if (!this.cacheFile || !fs.existsSync(this.cacheFile)) return false;
    try {
      const cached = JSON.parse(fs.readFileSync(this.cacheFile, "utf8"));
      const age = Date.now() - new Date(cached.capturedAt).getTime();
      if (age > this.maxAgeMs) return false;
      if (cached.destination !== this.jira.baseUrl) return false;
      this.catalog = cached;
      return true;
    } catch {
      return false;
    }
  }

  _saveCache() {
    if (!this.cacheFile) return;
    const dir = path.dirname(this.cacheFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.cacheFile, JSON.stringify(this.catalog, null, 2));
  }

  // ─── Lookups ──────────────────────────────────────────────────────

  fieldByName(name) {
    const k = (name || "").trim().toLowerCase();
    return this.catalog?.fields.find((f) => (f.name || "").toLowerCase() === k) || null;
  }
  fieldById(id) {
    return this.catalog?.fields.find((f) => f.id === id) || null;
  }
  statusByName(name) {
    const k = (name || "").trim().toLowerCase();
    return this.catalog?.statuses.find((s) => (s.name || "").toLowerCase() === k) || null;
  }
  roleByName(name) {
    const k = (name || "").trim().toLowerCase();
    return this.catalog?.roles.find((r) => (r.name || "").toLowerCase() === k) || null;
  }
  groupByName(name) {
    const k = (name || "").trim().toLowerCase();
    return this.catalog?.groups.find((g) => (g.name || "").toLowerCase() === k) || null;
  }
  projectByKey(key) {
    return this.catalog?.projects.find((p) => p.key === key) || null;
  }

  /**
   * Build a `{sourceFieldId: destFieldId}` map by joining a source
   * catalog's fields against this destination catalog by name + type.
   */
  buildFieldMapFrom(sourceCatalog) {
    const map = {};
    const warnings = [];
    for (const src of sourceCatalog.fields || []) {
      const key = (src.name || "").toLowerCase();
      const srcType = src.schema?.custom || src.schema?.type || "";
      const dst = this.catalog.fields.find(
        (f) => (f.name || "").toLowerCase() === key &&
               ((f.schema?.custom || f.schema?.type || "") === srcType),
      );
      if (!dst) {
        warnings.push(`no dest match for "${src.name}" (${srcType})`);
        map[src.id] = null;
        continue;
      }
      map[src.id] = dst.id;
    }
    return { map, warnings };
  }

  // ─── Fetchers ─────────────────────────────────────────────────────

  async _fetchFields() {
    let startAt = 0;
    const out = [];
    while (true) {
      const res = await this.jira.makeRequest(
        "GET",
        `/rest/api/3/field/search?startAt=${startAt}&maxResults=100&expand=key`,
      );
      const values = res.values || [];
      out.push(...values);
      if (res.isLast || values.length === 0) break;
      startAt += values.length;
    }
    return out.map((f) => ({
      id: f.id,
      name: f.name,
      custom: !!f.custom,
      schema: f.schema || null,
    }));
  }

  async _fetchStatuses() {
    const res = await this.jira.makeRequest("GET", "/rest/api/3/status");
    return (Array.isArray(res) ? res : []).map((s) => ({
      id: s.id,
      name: s.name,
      category: s.statusCategory?.key || null,
    }));
  }

  async _fetchProjectRoles() {
    const res = await this.jira.makeRequest("GET", "/rest/api/3/role");
    return (Array.isArray(res) ? res : []).map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description || "",
    }));
  }

  async _fetchGroups() {
    // Group search returns up to 50 per page by default; only the first
    // page is fetched here. If your tenant has > 50 groups and you need
    // them all, paginate by name prefix (a-z, then -, then _, etc.).
    const res = await this.jira.makeRequest(
      "GET",
      "/rest/api/3/groups/picker?query=&maxResults=200",
    );
    return (res.groups || []).map((g) => ({
      groupId: g.groupId || null,
      name: g.name,
      html: g.html || null,
    }));
  }

  async _fetchProjects() {
    let startAt = 0;
    const out = [];
    while (true) {
      const res = await this.jira.makeRequest(
        "GET",
        `/rest/api/3/project/search?startAt=${startAt}&maxResults=50`,
      );
      const values = res.values || [];
      out.push(...values);
      if (res.isLast || values.length === 0) break;
      startAt += values.length;
    }
    return out.map((p) => ({
      id: p.id,
      key: p.key,
      name: p.name,
      projectTypeKey: p.projectTypeKey,
    }));
  }
}

module.exports = CloudCatalog;
