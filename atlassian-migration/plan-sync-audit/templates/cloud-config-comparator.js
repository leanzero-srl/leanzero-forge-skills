"use strict";

/**
 * cloud-config-comparator — diff the "shape" of two Cloud Jira tenants.
 *
 * For a Cloud→Cloud migration (or a post-migration sanity check), you
 * want to know what's missing, what's extra, and where the destination's
 * configuration differs from the source. This template fetches catalogs
 * from two clients in parallel and produces a structured diff:
 *
 *   {
 *     fields:    { missingInDest: [], extraInDest: [], changed: [] },
 *     statuses:  { missingInDest: [], extraInDest: [], changed: [] },
 *     issueTypes:{ missingInDest: [], extraInDest: [], changed: [] },
 *     ... per resource ...
 *     summary:   "total=512 missing=23 extra=4 changed=17"
 *   }
 *
 * Usage:
 *
 *   const CloudConfigComparator = require("../src/cloudConfigComparator");
 *   const cmp = new CloudConfigComparator(sourceJira, destJira);
 *   const diff = await cmp.diffAll({ resources: ["fields", "statuses", "issueTypes", "linkTypes", "priorities"] });
 *   console.log(diff.summary);
 *   fs.writeFileSync("logs/config-diff.json", JSON.stringify(diff, null, 2));
 *
 * Used in two scenarios:
 *   1. Pre-migration: identify what needs to be created in the destination
 *      tenant before issues can be moved.
 *   2. Post-migration: confirm the destination really has the shape the
 *      source had (audit, regression detection).
 */

class CloudConfigComparator {
  constructor(sourceClient, destClient) {
    this.src = sourceClient;
    this.dst = destClient;
  }

  /**
   * Diff multiple resources in parallel.
   *
   * @param {object} options
   * @param {string[]} options.resources  one or more of:
   *   "fields" | "statuses" | "issueTypes" | "linkTypes" | "priorities" | "resolutions"
   * @returns {Promise<object>}
   */
  async diffAll(options = {}) {
    const resources = options.resources || ["fields", "statuses", "issueTypes", "linkTypes", "priorities"];
    const result = { capturedAt: new Date().toISOString(), summary: "" };
    let totalMissing = 0, totalExtra = 0, totalChanged = 0;

    const tasks = resources.map(async (r) => {
      const fn = this[`_diff${r[0].toUpperCase()}${r.slice(1)}`];
      if (typeof fn !== "function") throw new Error(`No comparator for resource "${r}"`);
      const diff = await fn.call(this);
      result[r] = diff;
      totalMissing += diff.missingInDest.length;
      totalExtra += diff.extraInDest.length;
      totalChanged += diff.changed.length;
    });
    await Promise.all(tasks);

    result.summary = `resources=${resources.length} missing=${totalMissing} extra=${totalExtra} changed=${totalChanged}`;
    return result;
  }

  // ──────────────────────────────────────────────────────────────────
  //  RESOURCE-SPECIFIC FETCH + DIFF
  // ──────────────────────────────────────────────────────────────────

  async _diffFields() {
    const [srcFields, dstFields] = await Promise.all([
      this._fetchAllFields(this.src),
      this._fetchAllFields(this.dst),
    ]);
    return _diffByKey(srcFields, dstFields, (f) => (f.name || "").toLowerCase(), (src, dst) => {
      const srcType = src.schema?.custom || src.schema?.type || "";
      const dstType = dst.schema?.custom || dst.schema?.type || "";
      const changes = [];
      if (srcType !== dstType) changes.push({ field: "type", from: srcType, to: dstType });
      if (src.id !== dst.id) changes.push({ field: "id", from: src.id, to: dst.id });
      return changes;
    });
  }

  async _diffStatuses() {
    const [src, dst] = await Promise.all([
      this.src.makeRequest("GET", "/rest/api/3/status"),
      this.dst.makeRequest("GET", "/rest/api/3/status"),
    ]);
    return _diffByKey(src, dst, (s) => (s.name || "").toLowerCase(), (a, b) => {
      const changes = [];
      const ac = a.statusCategory?.key, bc = b.statusCategory?.key;
      if (ac !== bc) changes.push({ field: "category", from: ac, to: bc });
      return changes;
    });
  }

  async _diffIssueTypes() {
    const [src, dst] = await Promise.all([
      this.src.makeRequest("GET", "/rest/api/3/issuetype"),
      this.dst.makeRequest("GET", "/rest/api/3/issuetype"),
    ]);
    return _diffByKey(src, dst, (t) => (t.name || "").toLowerCase(), (a, b) => {
      const changes = [];
      if ((a.hierarchyLevel ?? null) !== (b.hierarchyLevel ?? null)) {
        changes.push({ field: "hierarchyLevel", from: a.hierarchyLevel, to: b.hierarchyLevel });
      }
      if ((a.subtask ?? false) !== (b.subtask ?? false)) {
        changes.push({ field: "subtask", from: a.subtask, to: b.subtask });
      }
      return changes;
    });
  }

  async _diffLinkTypes() {
    const [src, dst] = await Promise.all([
      this.src.makeRequest("GET", "/rest/api/3/issueLinkType"),
      this.dst.makeRequest("GET", "/rest/api/3/issueLinkType"),
    ]);
    return _diffByKey(src.issueLinkTypes || [], dst.issueLinkTypes || [],
      (t) => (t.name || "").toLowerCase(),
      (a, b) => {
        const changes = [];
        if (a.inward !== b.inward) changes.push({ field: "inward", from: a.inward, to: b.inward });
        if (a.outward !== b.outward) changes.push({ field: "outward", from: a.outward, to: b.outward });
        return changes;
      });
  }

  async _diffPriorities() {
    const [src, dst] = await Promise.all([
      this.src.makeRequest("GET", "/rest/api/3/priority"),
      this.dst.makeRequest("GET", "/rest/api/3/priority"),
    ]);
    return _diffByKey(src, dst, (p) => (p.name || "").toLowerCase(), () => []);
  }

  async _diffResolutions() {
    const [src, dst] = await Promise.all([
      this.src.makeRequest("GET", "/rest/api/3/resolution"),
      this.dst.makeRequest("GET", "/rest/api/3/resolution"),
    ]);
    return _diffByKey(src, dst, (r) => (r.name || "").toLowerCase(), () => []);
  }

  async _fetchAllFields(client) {
    const all = [];
    let startAt = 0;
    while (true) {
      const r = await client.makeRequest("GET", `/rest/api/3/field/search?startAt=${startAt}&maxResults=100&expand=key`);
      all.push(...(r.values || []));
      if (r.isLast || (r.values || []).length === 0) break;
      startAt += (r.values || []).length;
    }
    return all;
  }
}

function _diffByKey(srcList, dstList, keyFn, compareFn) {
  const srcMap = new Map();
  for (const s of srcList) srcMap.set(keyFn(s), s);
  const dstMap = new Map();
  for (const d of dstList) dstMap.set(keyFn(d), d);

  const missingInDest = [];
  const extraInDest = [];
  const changed = [];

  for (const [k, s] of srcMap) {
    const d = dstMap.get(k);
    if (!d) { missingInDest.push(s); continue; }
    const changes = compareFn(s, d);
    if (changes.length > 0) changed.push({ key: k, source: s, dest: d, changes });
  }
  for (const [k, d] of dstMap) {
    if (!srcMap.has(k)) extraInDest.push(d);
  }
  return { missingInDest, extraInDest, changed };
}

module.exports = CloudConfigComparator;
