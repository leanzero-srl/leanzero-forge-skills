# Config-Driven Multi-Field Migration

When the migration has to map values for **more than one** option-based custom field (select lists, radio, multi-select, traffic lights) the naive approach — one script per field — is wrong. You'll end up with:

- 10× the code, 10× the maintenance.
- Field-specific bugs that don't surface until that field is touched.
- Unmapped DC values dropped silently in some scripts, errored in others.
- No single place to review the planned mapping before launch.

Pattern lifted from `sync_traffic_light_fields/`: declare every field's ID mapping AND value mapping in one JSON config; have ONE script read it and process all fields in a loop.

## The config

`config/field_mappings.json` is the operator-editable source of truth:

```json
{
  "fields": [
    {
      "name":         "Traffic Light",
      "dcFieldId":    "customfield_10042",
      "cloudFieldId": "customfield_10318",
      "options": [
        { "label": "Red",   "cloudValue": "Red Risk",   "shape": "🔴" },
        { "label": "Green", "cloudValue": "Green Go",   "shape": "🟢" },
        { "label": "Amber", "cloudValue": "Amber Hold", "shape": "🟠" }
      ]
    },
    {
      "name":         "Priority Bucket",
      "dcFieldId":    "customfield_10101",
      "cloudFieldId": "customfield_10567",
      "options": [
        { "label": "P0", "cloudValue": "Critical" },
        { "label": "P1", "cloudValue": "High" },
        { "label": "P2", "cloudValue": "Medium" },
        { "label": "P3", "cloudValue": "Low" }
      ]
    }
  ]
}
```

- `name` is human-readable; show it in logs and the unmapped CSV.
- `dcFieldId` / `cloudFieldId` carry the per-instance ID mapping (which a name lookup alone can't do reliably — see `docs/post-jcma-id-mapping.md`).
- `options[].label` is the DC display label (typically what's stored in the DC value).
- `options[].cloudValue` is what to write on Cloud. Fall back to `label` if you didn't rename the option in Cloud.
- `options[].shape` (optional) is a presentation hint for human-readable docs. The processor ignores it.

Commit this file to the migration ticket. **The mapping is the most important thing to review** — the code is generic.

## The processor — `templates/field-config-mapper.js`

```javascript
const FieldConfigMapper = require("./field-config-mapper");

const mapper = new FieldConfigMapper("config/field_mappings.json", { log });

for (const field of mapper.fields()) {
  log(`Processing field: "${field.name}" (${field.dcFieldId} → ${field.cloudFieldId})`);
  const runId = `${Date.now()}_${field.cloudFieldId}`;
  planManager.createPlan(runId);

  for await (const dcIssue of dcClient.iterateIssues(jql, [field.dcFieldId])) {
    const dcValue = dcIssue.fields[field.dcFieldId];
    if (dcValue == null) continue;

    const mapped = mapper.mapValue(field, dcValue);
    if (!mapped.ok) {
      mapper.recordUnmapped(field, dcValue, dcIssue.key);
      continue;
    }
    planManager.addEntry(dcIssue.key, {
      cloudFieldId: field.cloudFieldId,
      writeValue: mapped.cloudValue,
      mappedFrom: mapped.mappedFrom,
    });
  }

  planManager.savePlan();   // one plan per field — naturally splits sub-plans
}

mapper.reportUnmapped();
const { csvPath, distinctMissing } = mapper.writeUnmappedCsv(
  path.join(logDir, `unmapped_values_${Date.now()}.csv`),
);
log(`  Unmapped values CSV: ${csvPath} (${distinctMissing} distinct missing labels)`);
```

The mapper handles three value shapes Atlassian returns for option fields:

| DC payload | Treated as |
|---|---|
| `"Red"` | plain label |
| `{ value: "Red", id: "10042" }` | use `value` |
| `{ name: "Red" }` | use `name` |
| `[{value: "Red"}, {value: "Amber"}]` | multi-select: map each, fail on first unknown |

`mapValue()` returns `{ ok: true, cloudValue, mappedFrom }` or `{ ok: false, reason }`. Callers MUST handle `ok: false` — that's where silent value drops happen otherwise.

## Why one plan per field (not one combined plan)

Splitting by field is the natural sub-plan boundary (see `docs/02-plan-manager.md#sub-plan-splitting`):

- Each field's apply phase can be retried independently.
- One field's bug doesn't block the others — operator reviews `plan_<field>.json` separately.
- Multi-key parallelism (`docs/08-concurrency-and-pool.md`) becomes one slot per field, naturally parallel.
- The unmapped CSV is one file, but each line carries the field name → operator can filter to a single field if they want to fix labels for that one only.

In the real `sync_asset_ticket_associations` run, 44 CMDB fields were processed this way with one bash driver per token slot — see `templates/run-driver.sh.template`.

## The unmapped CSV — what to do with it

```csv
field,dc_label,count,example_issue_keys
"Traffic Light","Yellow",47,"PROJ-12 PROJ-89 PROJ-244 PROJ-678 PROJ-901"
"Traffic Light","Chartreuse",3,"PROJ-1102 PROJ-2017 PROJ-3008"
"Priority Bucket","P-1",18,"OTHER-44 ..."
```

Operator reviews and decides:

1. **Add the label to the config and re-run.** Common case — DC has a value nobody documented.
2. **Treat it as no-op.** Add a sentinel `{"label": "Yellow", "cloudValue": null}` and have the processor skip when `cloudValue === null`.
3. **Map it to an existing option.** Rename it in the config (e.g. `Yellow` → `Amber Hold`).

Don't merge into the apply run without a decision — silent value drops at this stage are exactly the failure mode this whole pattern is designed to prevent.

## Audit pairing — verifying the write

After apply, an audit script can use the same config to verify:

```javascript
for (const field of mapper.fields()) {
  for (const dcIssue of audit.sample(dcIssues, 0.05)) {
    const dcValue   = dcIssue.fields[field.dcFieldId];
    const expected  = mapper.mapValue(field, dcValue);
    const cloudVal  = await cloudClient.getFieldValue(dcIssue.key, field.cloudFieldId);
    audit.compare(dcIssue.key, expected.cloudValue, cloudVal);
  }
}
```

See `docs/07-audit-and-sampling.md` for the Mulberry32 sampling shape.

## When NOT to use this pattern

- One field only. The overhead of a config file isn't worth it for a single field — inline the map.
- Free-text fields (no enumerable label set). No `options` to declare; use a transform function instead.
- Field types whose value isn't a simple label (cascade-select, user picker, date). Handle those individually — the assumption that `(label) → (cloudValue)` is a function doesn't hold.

## See also

- [`02-plan-manager.md`](02-plan-manager.md) — sub-plan-per-field is the natural split
- [`07-audit-and-sampling.md`](07-audit-and-sampling.md) — audit phase reuses the same config
- [`08-concurrency-and-pool.md`](08-concurrency-and-pool.md) — bash driver fans out N field plans across N tokens
- [`post-jcma-id-mapping.md`](post-jcma-id-mapping.md) — why the config must carry `dcFieldId`/`cloudFieldId`, not just names
- [`templates/field-config-mapper.js`](../templates/field-config-mapper.js)
