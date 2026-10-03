"use strict";

/**
 * Config-driven multi-field mapper.
 *
 * Pattern lifted from sync_traffic_light_fields/src/trafficLightProcessor.js.
 * One script processes N fields by reading a JSON config that maps:
 *   - dcFieldId  → cloudFieldId      (the field-ID mapping per instance)
 *   - DC option label → Cloud option (per-field value mapping)
 *
 * Solves the "one-script-per-field" sprawl when you have a dozen
 * option-based custom fields (traffic lights, dropdowns, multi-selects)
 * that all need value remapping post-JCMA.
 *
 * Config shape (config/field_mappings.json):
 *
 *   {
 *     "fields": [
 *       {
 *         "name":         "Traffic Light",
 *         "dcFieldId":    "customfield_10042",
 *         "cloudFieldId": "customfield_10318",
 *         "options": [
 *           { "label": "Red",   "cloudValue": "Red Risk",   "shape": "🔴" },
 *           { "label": "Green", "cloudValue": "Green Go",   "shape": "🟢" },
 *           { "label": "Amber", "cloudValue": "Amber Hold", "shape": "🟠" }
 *         ]
 *       },
 *       { ... }
 *     ]
 *   }
 *
 * Usage:
 *
 *   const mapper = new FieldConfigMapper("config/field_mappings.json");
 *   for (const field of mapper.fields()) {
 *     for (const issue of dcIssues) {
 *       const dcValue = issue.fields[field.dcFieldId];
 *       const mapped = mapper.mapValue(field, dcValue);
 *       if (!mapped.ok) {
 *         mapper.recordUnmapped(field, dcValue, issue.key);
 *         continue;
 *       }
 *       // queue { issueKey, cloudFieldId: field.cloudFieldId, value: mapped.cloudValue }
 *     }
 *   }
 *   mapper.reportUnmapped();          // log + CSV of value labels not in config
 */

const fs = require("fs");

class FieldConfigMapper {
  constructor(configPath, opts = {}) {
    this.configPath = configPath;
    this.log = opts.log || console.log;
    this.caseSensitive = opts.caseSensitive || false;
    this._unmapped = new Map(); // `${fieldName}::${label}` → { count, examples: [issueKey,...] }

    const raw = JSON.parse(fs.readFileSync(configPath, "utf8"));
    if (!Array.isArray(raw.fields)) {
      throw new Error(`${configPath}: expected { fields: [...] }`);
    }

    this._fields = raw.fields.map((f) => this._compileField(f));
  }

  _compileField(f) {
    const labelKey = (s) => (this.caseSensitive ? String(s || "") : String(s || "").toLowerCase());
    const optionsByLabel = new Map();
    for (const opt of f.options || []) {
      if (!opt.label) continue;
      optionsByLabel.set(labelKey(opt.label), opt);
    }
    return {
      name: f.name,
      dcFieldId: f.dcFieldId,
      cloudFieldId: f.cloudFieldId,
      options: f.options || [],
      _optionsByLabel: optionsByLabel,
      _labelKey: labelKey,
    };
  }

  /** Iterate over compiled field configs. */
  fields() { return this._fields; }

  /** Look up a single field by name (or dcFieldId, or cloudFieldId). */
  find(nameOrId) {
    return this._fields.find(
      (f) => f.name === nameOrId || f.dcFieldId === nameOrId || f.cloudFieldId === nameOrId,
    );
  }

  /**
   * Map a DC value to its Cloud counterpart.
   *
   * Returns:
   *   { ok: true,  cloudValue }   — value was in the config
   *   { ok: false, reason }       — value is null / missing / not in config
   *
   * Callers that get `ok: false` should record unmapped via recordUnmapped()
   * and skip the issue.
   */
  mapValue(field, dcValue) {
    if (dcValue == null) return { ok: false, reason: "empty" };

    // Option fields come as { value, id } or { name }; multi-select as arrays.
    // Strings (plain text values) pass through if config has the label.
    let label;
    if (typeof dcValue === "string") {
      label = dcValue;
    } else if (Array.isArray(dcValue)) {
      // multi-select: map each element separately, fail on first unknown
      const out = [];
      for (const item of dcValue) {
        const r = this.mapValue(field, item);
        if (!r.ok) return r;
        out.push(r.cloudValue);
      }
      return { ok: true, cloudValue: out };
    } else if (typeof dcValue === "object") {
      label = dcValue.value || dcValue.name || dcValue.label || null;
    }
    if (!label) return { ok: false, reason: "no-label-on-dc-value" };

    const opt = field._optionsByLabel.get(field._labelKey(label));
    if (!opt) return { ok: false, reason: `no-mapping-for "${label}"` };

    // Prefer cloudValue (the renamed Cloud option). Fall back to label if
    // the operator didn't rename, just remapped the field ID.
    return { ok: true, cloudValue: opt.cloudValue || opt.label, mappedFrom: label };
  }

  /**
   * Record a value label that we couldn't map. Aggregate counts so the
   * end-of-run report shows which labels are missing from the config
   * (and how many issues are affected) without flooding the log.
   */
  recordUnmapped(field, dcValue, issueKey) {
    let label;
    if (typeof dcValue === "string") label = dcValue;
    else if (typeof dcValue === "object" && dcValue) label = dcValue.value || dcValue.name || JSON.stringify(dcValue);
    else label = String(dcValue);

    const key = `${field.name}::${label}`;
    if (!this._unmapped.has(key)) {
      this._unmapped.set(key, { field: field.name, dcLabel: label, count: 0, examples: [] });
    }
    const rec = this._unmapped.get(key);
    rec.count++;
    if (rec.examples.length < 5 && issueKey) rec.examples.push(issueKey);
  }

  /** Emit a CSV of unmapped (field, label) pairs for operator review. */
  writeUnmappedCsv(csvPath) {
    const fd = fs.openSync(csvPath, "w");
    try {
      fs.writeSync(fd, "field,dc_label,count,example_issue_keys\n");
      for (const rec of this._unmapped.values()) {
        const esc = (s) => `"${String(s).replace(/"/g, '""')}"`;
        fs.writeSync(
          fd,
          `${esc(rec.field)},${esc(rec.dcLabel)},${rec.count},${esc(rec.examples.join(" "))}\n`,
        );
      }
    } finally {
      try { fs.closeSync(fd); } catch { /* ignore */ }
    }
    return { csvPath, distinctMissing: this._unmapped.size };
  }

  /** Log a one-page summary of unmapped values. */
  reportUnmapped() {
    if (this._unmapped.size === 0) {
      this.log("  All values mapped — no unmapped report needed.");
      return;
    }
    this.log(`  Unmapped values: ${this._unmapped.size} distinct (field, label) pairs`);
    const rows = [...this._unmapped.values()].sort((a, b) => b.count - a.count);
    for (const r of rows.slice(0, 25)) {
      this.log(`    [${r.field}] "${r.dcLabel}" — ${r.count} issues (e.g. ${r.examples.slice(0, 3).join(", ")})`);
    }
    if (rows.length > 25) this.log(`    ...and ${rows.length - 25} more (see CSV)`);
  }
}

module.exports = FieldConfigMapper;
