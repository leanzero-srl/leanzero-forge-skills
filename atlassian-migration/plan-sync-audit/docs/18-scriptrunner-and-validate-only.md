# ScriptRunner Export & Validate-Only Roundtrip

Two related patterns for workflow / automation migrations, both lifted from `clone_workflow_rules/`:

1. **ScriptRunner Groovy export** — when a workflow rule calls a ScriptRunner script, the Groovy body is NOT in Jira's workflow API. You can't migrate it through `POST /rest/api/3/workflow`. The correct path is to emit a ScriptRunner SMS scaffold (`extensions.yaml` + Groovy stubs) so humans paste the real code.
2. **Validate-only roundtrip** — Atlassian's workflow create/update endpoints have a validation mode that returns structured errors without committing. Faster than dry-run-then-real-apply for surfacing wrong `ruleKey` values and bad parameter shapes.

## 1. ScriptRunner rules in workflow JSON

A typical post-JCMA workflow has rules like:

```json
{
  "conditions": [
    { "type": "ScriptCondition", "configuration": {
        "scriptPath": "/somewhere/check-permission.groovy",
        "scriptRunner.scriptHash": "abc123def456"
    }}
  ],
  "postFunctions": [
    { "type": "com.onresolve.jira.groovy.GroovyFunctionPlugin", "configuration": {
        "FIELD_SCRIPT_FILE_OR_SCRIPT": "issue.summary = 'NEW: ' + issue.summary"
    }}
  ]
}
```

Two problems:
- **Inline scripts (`FIELD_SCRIPT_FILE_OR_SCRIPT`) are present** but the new Cloud workflow API expects a different rule shape and won't accept them through `POST /workflow`.
- **Script files (`scriptPath`)** are server-side filesystem paths — Cloud has no such filesystem.

JCMA does not migrate either. They appear in the workflow JSON like ghosts — referenced but not functional.

## The ScriptRunner export pattern

Walk the collected workflows, detect every ScriptRunner-shaped rule, and emit a scaffold compatible with Atlassian's **ScriptRunner Migration Suite** (SMS) Dev & Deployment Tool. The output is two files per workflow:

```
out/scriptrunner-scaffold/
├── extensions.yaml          # SMS extension manifest
└── scripts/
    ├── PROJ-workflow-1-condition-0.groovy
    ├── PROJ-workflow-1-postfunction-2.groovy
    └── ...
```

`extensions.yaml` declares each rule with a unique key, a workflow reference, and a path to the Groovy file. Humans paste the real Groovy code into the stub files based on what the DC instance had.

Detection (in `templates/scriptrunner-exporter.js`):

```javascript
function detectScriptRunnerRules(workflow) {
  const out = [];
  for (const action of (workflow.transitions || [])) {
    for (const phase of ["conditions", "validators", "postFunctions"]) {
      for (const rule of action[phase] || []) {
        if (isScriptRunner(rule)) {
          out.push({
            workflowName: workflow.name,
            transitionName: action.name,
            phase, rule,
            scriptKind: classifyScript(rule),  // "file-path" | "inline" | "macro"
          });
        }
      }
    }
  }
  return out;
}

function isScriptRunner(rule) {
  const t = (rule.type || "").toLowerCase();
  return (
    t.includes("groovy") ||                                     // GroovyFunctionPlugin
    t.includes("scriptcondition") || t.includes("scriptvalidator") ||
    t.includes("scriptpostfunction") || t.includes("scriptrunner") ||
    Object.keys(rule.configuration || {}).some((k) => k.toLowerCase().includes("script"))
  );
}
```

The detection is intentionally loose — ScriptRunner has shipped rules under many type names over the years and we'd rather export false positives than silently drop a real script.

## What the human pastes

Three classes of script content, three retrieval strategies:

| Script kind | Where DC stores it | How to retrieve for paste |
|---|---|---|
| Inline (in workflow XML) | The workflow JSON itself, `configuration.FIELD_SCRIPT_FILE_OR_SCRIPT` | Already in the export — copy verbatim into the Groovy stub |
| File path (`scriptPath`) | DC server filesystem, typically `$JIRA_HOME/scripts/` | Operator must `scp` from DC; pre-Cloud cutover |
| ScriptRunner Macro | DC ScriptRunner library (named scripts UI) | UI export from DC ScriptRunner Admin → "Code Library" |

Whichever path, the human-in-the-loop step is unavoidable. The exporter just makes sure nothing is silently dropped.

## 2. Validate-only roundtrip

The Atlassian workflow endpoints support a "validate" mode that runs schema and rule-key checks against your payload without committing. Spec the request the way you would for the real call, plus `validateOnly=true`:

```javascript
async function validateWorkflowUpdate(cloudClient, payload) {
  const params = new URLSearchParams({ validateOnly: "true" });
  const url = `/rest/api/3/workflows/update?${params}`;
  try {
    const data = await cloudClient.makeRequest("POST", url, payload);
    return { valid: true, response: data };
  } catch (err) {
    // Validation errors come back as 400 with a structured body
    return {
      valid: false,
      issues: err.body?.errors || err.body?.errorMessages || [String(err.message)],
    };
  }
}
```

The errors are structured: each one names the rule (`ruleKey`), the parameter, and the kind of problem ("unknown rule key", "missing required field X", "value Y not allowed for type Z"). For workflow migrations between instances this is the single fastest way to surface:

- Wrong `ruleKey` values (the migrator's `system:` prefix didn't match what Cloud has).
- Bad parameter shapes (legacy DC config keys that Cloud's flatter schema rejects).
- Reference IDs that didn't get remapped (a status/screen/field ID the migrator forgot to translate).

### Validate-only ≠ dry-run

| | Validate-only | Dry-run |
|---|---|---|
| Where | Server-side, the endpoint itself | Client-side, your code skips the write |
| What's checked | Schema, allowed values, ref integrity | Whatever your code chose to check |
| Cost | 1 point per call | 0 (no API call) |
| Cuts | Bad payloads before they corrupt | Logical bugs in your sync code |
| Use both? | Yes — together they catch ~99% of bugs |

Pattern: `--dry-run` first (catches client-side bugs), then `--validate-only` (catches schema/ref bugs), then real apply. Three gates beat one.

### Other endpoints that support validate-only or equivalent

| Endpoint | Mode | How |
|---|---|---|
| `POST /rest/api/3/workflows` | `validateOnly=true` query param | This doc |
| `POST /rest/api/3/workflows/update` | `validateOnly=true` query param | This doc |
| `POST /rest/api/3/jql/parse` | Always — pure parse, never executes | `docs/10-jql-and-aql-rewriting.md` |
| `POST /rest/api/3/jql/sanitize` | Always — returns sanitized JQL | `docs/10-jql-and-aql-rewriting.md` |
| `POST /rest/api/3/field/customfield` | `validateOnly=true` query param | Useful for custom-field create-from-config flows |

If an endpoint you care about doesn't have a validate-only mode, you can sometimes approximate one with a **transactional write that you immediately undo**: create, capture the response, delete. Only safe when the resource has no side effects.

## Combining the two patterns

For a workflow migration that touches ScriptRunner:

```
collect:    GET DC workflows + detect ScriptRunner rules
            ↓
transform:  Build Cloud workflow payload (drop or stub-replace ScriptRunner rules)
            ↓
export:     Emit ScriptRunner SMS scaffold for human paste
            ↓
validate:   POST validateOnly=true on each Cloud workflow payload
            ↓ (errors: fix migrator config, loop)
            ↓ (clean: proceed)
apply:      POST real payload — no surprises
```

The pre-apply validation cycle is where the migrator gets tuned. Expect to loop 3–5 times before the first clean validate; that's normal because Atlassian publishes no exhaustive `system:*` rule-key list.

## See also

- [`24-production-patterns.md`](24-production-patterns.md) — pattern 16 (workflow JSON transform)
- [`templates/workflow-transformer.js`](../templates/workflow-transformer.js) — the upstream transform
- [`templates/scriptrunner-exporter.js`](../templates/scriptrunner-exporter.js) — the export pattern from this doc
- [`10-jql-and-aql-rewriting.md`](10-jql-and-aql-rewriting.md) — the parse/sanitize-as-validate pattern for JQL
- [`gotchas.md`](gotchas.md) — the JMWE Connect-prefix corruption is a related cleanup task
