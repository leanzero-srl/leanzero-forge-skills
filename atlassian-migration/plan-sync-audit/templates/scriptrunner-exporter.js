"use strict";

/**
 * ScriptRunner workflow-rule exporter.
 *
 * When a DC workflow has ScriptRunner conditions, validators, or post
 * functions, the Groovy body is NOT migrated by JCMA and is NOT in the
 * Cloud workflow API. This exporter:
 *
 *   1. Detects every ScriptRunner-shaped rule across a set of collected
 *      workflow JSON documents.
 *   2. Emits a ScriptRunner Migration Suite (SMS) scaffold:
 *        - `extensions.yaml` — manifest the operator imports into SMS
 *        - `scripts/<key>.groovy` — empty stub the operator pastes into
 *
 * The operator pastes the real Groovy body (from DC's
 * $JIRA_HOME/scripts/ filesystem, from a ScriptRunner Code Library
 * export, or copied verbatim if it was inline in the workflow XML).
 *
 * Usage:
 *
 *   const exporter = new ScriptRunnerExporter({ outDir: "out/sms" });
 *   for (const wf of collectedWorkflows) {
 *     exporter.detect(wf);
 *   }
 *   const report = exporter.write();
 *   console.log(`Exported ${report.rules} rules across ${report.workflows} workflows`);
 *
 * Pattern lifted from clone_workflow_rules/src/scriptRunnerExporter.js.
 */

const fs = require("fs");
const path = require("path");

class ScriptRunnerExporter {
  constructor(opts = {}) {
    this.outDir = opts.outDir || "out/sms";
    this.scriptsDir = path.join(this.outDir, "scripts");
    this.log = opts.log || console.log;
    this._rules = []; // { key, workflow, transition, phase, scriptKind, inlineBody? }
    this._seenKeys = new Set();
  }

  /**
   * Detect ScriptRunner-shaped rules in one workflow JSON. Idempotent —
   * call once per workflow before write().
   *
   * Detection is intentionally loose: ScriptRunner has shipped under
   * many type names over the years (GroovyFunctionPlugin, ScriptCondition,
   * ScriptValidator, ScriptPostFunction, scriptrunner-*). We'd rather
   * export false positives than silently drop a real script.
   */
  detect(workflow) {
    const name = workflow.name || workflow.id || "unnamed-workflow";
    for (const action of workflow.transitions || workflow.actions || []) {
      for (const phase of ["conditions", "validators", "postFunctions"]) {
        const rules = action[phase] || [];
        for (let i = 0; i < rules.length; i++) {
          const rule = rules[i];
          if (!this._isScriptRunner(rule)) continue;
          this._rules.push({
            key: this._uniqueKey(name, action.name || `transition-${action.id || "x"}`, phase, i),
            workflow: name,
            transition: action.name || null,
            phase,
            ruleType: rule.type || "(unknown)",
            scriptKind: this._classifyScriptKind(rule),
            inlineBody: this._extractInlineBody(rule),
          });
        }
      }
    }
  }

  _isScriptRunner(rule) {
    const t = String(rule?.type || "").toLowerCase();
    if (
      t.includes("groovy") ||
      t.includes("scriptcondition") ||
      t.includes("scriptvalidator") ||
      t.includes("scriptpostfunction") ||
      t.includes("scriptrunner") ||
      t.startsWith("com.onresolve.")
    ) return true;

    // Fallback: any configuration key naming a script
    const cfg = rule?.configuration || {};
    return Object.keys(cfg).some((k) => k.toLowerCase().includes("script"));
  }

  /**
   * Classify how the script body is stored, so the operator knows
   * where to find the real source:
   *   - "inline":    the body is in the workflow XML/JSON itself
   *   - "file-path": rule references a DC filesystem path (scp from DC)
   *   - "macro":     rule references a named ScriptRunner Macro (UI export)
   *   - "unknown":   none of the above — investigate manually
   */
  _classifyScriptKind(rule) {
    const cfg = rule?.configuration || {};
    if (cfg.FIELD_SCRIPT_FILE_OR_SCRIPT && /\n|;|=/.test(String(cfg.FIELD_SCRIPT_FILE_OR_SCRIPT))) {
      return "inline";
    }
    if (cfg.scriptPath || cfg.FIELD_SCRIPT_FILE) return "file-path";
    if (cfg.scriptId || cfg.macroKey || cfg.scriptRunnerScriptName) return "macro";
    return "unknown";
  }

  _extractInlineBody(rule) {
    const cfg = rule?.configuration || {};
    if (cfg.FIELD_SCRIPT_FILE_OR_SCRIPT && /\n|;/.test(String(cfg.FIELD_SCRIPT_FILE_OR_SCRIPT))) {
      return String(cfg.FIELD_SCRIPT_FILE_OR_SCRIPT);
    }
    if (cfg.script && typeof cfg.script === "string" && cfg.script.length > 0) {
      return cfg.script;
    }
    return null;
  }

  _uniqueKey(workflow, transition, phase, idx) {
    const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    let base = `${slug(workflow)}-${slug(transition)}-${phase}-${idx}`;
    if (!this._seenKeys.has(base)) {
      this._seenKeys.add(base);
      return base;
    }
    let n = 2;
    while (this._seenKeys.has(`${base}-${n}`)) n++;
    const k = `${base}-${n}`;
    this._seenKeys.add(k);
    return k;
  }

  /**
   * Write extensions.yaml + Groovy stubs to disk.
   * Returns { rules, workflows, manifest, scriptsDir }.
   */
  write() {
    if (this._rules.length === 0) {
      this.log("  No ScriptRunner rules detected — nothing to export.");
      return { rules: 0, workflows: 0, manifest: null, scriptsDir: this.scriptsDir };
    }
    fs.mkdirSync(this.scriptsDir, { recursive: true });

    // Group by workflow for the manifest readability
    const byWorkflow = new Map();
    for (const r of this._rules) {
      if (!byWorkflow.has(r.workflow)) byWorkflow.set(r.workflow, []);
      byWorkflow.get(r.workflow).push(r);
    }

    // Write Groovy stubs
    for (const r of this._rules) {
      const stubPath = path.join(this.scriptsDir, `${r.key}.groovy`);
      const header = [
        `// ScriptRunner rule: ${r.workflow} → ${r.transition || "(transition)"} → ${r.phase}`,
        `// Source rule type: ${r.ruleType}`,
        `// Script kind: ${r.scriptKind}`,
        "//",
        "// PASTE the Groovy body below. Sources by kind:",
        "//   inline:    copy from the original DC workflow XML",
        "//   file-path: scp from DC's $JIRA_HOME/scripts/",
        "//   macro:     export from DC ScriptRunner > Code Library > Scripts",
        "",
      ].join("\n");

      const body = r.inlineBody
        ? `\n// ── Original inline body from DC workflow ──\n${r.inlineBody}\n`
        : "\n// TODO: paste real Groovy body here\n";

      fs.writeFileSync(stubPath, header + body);
    }

    // Write extensions.yaml
    const manifestPath = path.join(this.outDir, "extensions.yaml");
    const lines = [
      "# ScriptRunner SMS extensions.yaml — generated scaffold",
      `# ${this._rules.length} rules across ${byWorkflow.size} workflow(s)`,
      "modules:",
      "  jiraWorkflowExtensions:",
    ];
    for (const [wf, rules] of byWorkflow.entries()) {
      lines.push(`    # workflow: ${wf}`);
      for (const r of rules) {
        lines.push(`    - key: ${r.key}`);
        lines.push(`      type: ${r.phase}`);
        lines.push(`      workflow: ${JSON.stringify(wf)}`);
        lines.push(`      transition: ${JSON.stringify(r.transition || "")}`);
        lines.push(`      scriptKind: ${r.scriptKind}`);
        lines.push(`      scriptPath: scripts/${r.key}.groovy`);
      }
    }
    fs.writeFileSync(manifestPath, lines.join("\n") + "\n");

    this.log(`  ScriptRunner export: ${this._rules.length} rule(s) across ${byWorkflow.size} workflow(s)`);
    this.log(`    Manifest:   ${manifestPath}`);
    this.log(`    Scripts:    ${this.scriptsDir}/`);
    return {
      rules: this._rules.length,
      workflows: byWorkflow.size,
      manifest: manifestPath,
      scriptsDir: this.scriptsDir,
    };
  }

  /**
   * Validate-only roundtrip helper for workflow create/update. Returns
   * { valid, issues } — `issues` is a structured list when the endpoint
   * returns a 400 with error detail. Pair with the exporter so the
   * workflow itself round-trips cleanly even when the Groovy body lives
   * in SMS rather than the workflow JSON.
   */
  static async validateWorkflowPayload(cloudClient, endpoint, payload) {
    const sep = endpoint.includes("?") ? "&" : "?";
    const url = `${endpoint}${sep}validateOnly=true`;
    try {
      const data = await cloudClient.makeRequest("POST", url, payload);
      return { valid: true, response: data, issues: [] };
    } catch (err) {
      const body = err?.body || err?.response || null;
      const issues =
        body?.errors || body?.errorMessages || body?.validationErrors ||
        (typeof body === "string" ? [body] : [String(err.message || err)]);
      return { valid: false, issues, error: err };
    }
  }
}

module.exports = ScriptRunnerExporter;
