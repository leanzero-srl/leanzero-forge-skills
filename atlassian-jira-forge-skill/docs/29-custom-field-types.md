# Custom Field Types (`jira:customField` / `jira:customFieldType`)

Forge can register a custom field type and provide its view, edit, and context-config UIs. The view UI must use UI Kit (`@forge/react`); edit may be either UI Kit or Custom UI.

## Modules

### `jira:customFieldType` — the *type* (data shape)

```yaml
modules:
  jira:customFieldType:
    - key: priority-score
      name: Priority Score
      description: Numeric priority score (0–100)
      type: number          # number | string | rich-text | user | group | option-list
      collection: list      # omit for single value
      validation:
        expression: "value >= 0 && value <= 100"
        errorMessage: "Score must be between 0 and 100"
```

`type` is fixed at creation. You can't migrate a `number` field to a `string` later — recreate.

### `jira:customField` — the *renderer* (how Jira shows it)

```yaml
modules:
  jira:customField:
    - key: priority-score-render
      type: ari:cloud:ecosystem::extension/${app-id}/${env-id}/static/customFieldType/priority-score
      view:
        resource: cf-view
        render: native       # UI Kit only
      edit:
        resource: cf-edit
        render: native       # native or custom-ui (Custom UI also OK for edit)
        isInline: true       # inline editing on the issue view
      contextConfig:
        resource: cf-context-config
```

## View UI (UI Kit)

```javascript
import React from 'react';
import ForgeReconciler, { Lozenge, Text, useProductContext } from '@forge/react';

const App = () => {
  const ctx = useProductContext();
  const value = ctx?.extension?.fieldValue;
  if (value == null) return <Text>—</Text>;
  return <Lozenge appearance={value >= 80 ? 'removed' : 'success'}>{value}</Lozenge>;
};

ForgeReconciler.render(<App />);
```

Key idea: `useProductContext().extension.fieldValue` is the canonical way to read the current value.

## Edit UI (UI Kit recommended)

```javascript
import React, { useState } from 'react';
import ForgeReconciler, { Form, Range, Button, useProductContext } from '@forge/react';
import { view } from '@forge/bridge';

const App = () => {
  const ctx = useProductContext();
  const [score, setScore] = useState(ctx?.extension?.fieldValue ?? 50);
  const submit = async () => { await view.submit(score); };
  return (
    <Form onSubmit={submit}>
      <Range min={0} max={100} value={score} onChange={setScore} />
      <Button appearance="primary" type="submit">Save</Button>
    </Form>
  );
};

ForgeReconciler.render(<App />);
```

`view.submit(value)` is what tells Jira the new value. `view.close()` dismisses the editor without saving.

## Context configuration

`contextConfig` is per-(project, issue-type) admin-facing config — useful when the same field has different defaults per project (e.g. different threshold per team).

```javascript
import React from 'react';
import ForgeReconciler, { Form, Textfield, Button } from '@forge/react';
import { view } from '@forge/bridge';

const App = () => {
  const submit = async (data) => { await view.submit({ targetTeam: data.targetTeam }); };
  return (
    <Form onSubmit={submit}>
      <Textfield name="targetTeam" placeholder="Team responsible" />
      <Button appearance="primary" type="submit">Save</Button>
    </Form>
  );
};

ForgeReconciler.render(<App />);
```

Read the saved config in your view/edit:

```javascript
const ctx = useProductContext();
const teamFromConfig = ctx?.extension?.context?.targetTeam;
```

## Default value handler (optional)

When the field is first seen on an issue, Forge can call a function for its starting value:

```yaml
modules:
  jira:customFieldType:
    - key: priority-score
      defaultValue:
        function: cf-default-value
  function:
    - key: cf-default-value
      handler: index.defaultValue
```

```javascript
export const defaultValue = async (args, context) => {
  // Read other field values, KVS config, etc.
  return 50;
};
```

## Reading the field via REST

```javascript
import api, { route } from '@forge/api';

const r = await api
  .asApp()
  .requestJira(route`/rest/api/3/issue/${key}?fields=customfield_10042`);
const issue = await r.json();
const score = issue.fields.customfield_10042;
```

The `customfield_NNNNN` id is assigned by Jira when the field is added to a screen. Look it up in **Project settings → Issues → Fields** or via `/rest/api/3/field`.

## JQL searchability

To make a field searchable in JQL, add a `searcher` that points to a UI for filter input. (See the manifest reference for `searcher` configuration; it requires its own resource.) Without a searcher, users can't write `WHERE priorityScore >= 80` in JQL.

## Gotchas

- **View must be UI Kit (`render: native`)**. Custom UI fails at deploy time for view rendering.
- **Inline edit on the issue view requires `isInline: true`**. Without it, edit opens in a modal.
- **Field `type` is permanent**. Pick the right type up front.
- **`fieldValue` is `null` until set**. Always handle the empty case in view.
- **`view.submit(value)` is the submission protocol** — don't write to the field via REST from inside the edit UI.
- **The field id (`customfield_NNNNN`)** isn't known until the field is created in a project — your app should look it up dynamically via `/rest/api/3/field` if it needs to read the value.

## See also

- `templates/custom-field-type.yml` — copy-paste skeleton
- `15-bridge-api-reference.md` — `view.submit`, `view.close`, `view.getContext`
- `17-ui-kit-components.md` — `@forge/react` components
- https://developer.atlassian.com/platform/forge/manifest-reference/modules/jira-custom-field-type
- https://developer.atlassian.com/platform/forge/manifest-reference/modules/jira-custom-field
