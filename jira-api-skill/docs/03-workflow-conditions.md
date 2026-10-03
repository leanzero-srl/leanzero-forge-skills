# Jira Workflow Conditions (Jira Expressions)

## Overview

A workflow condition decides whether a transition is offered to the user. Forge has a real module for it, `jira:workflowCondition`, and that module **is a Jira expression declared in the manifest**. Jira evaluates the expression itself; it never invokes a Forge function to decide a condition.

**Source:** the Forge manifest schema, `@forge/manifest` 12.9.0 `out/schema/manifest-schema.json` (`definitions.ModuleSchema.properties["jira:workflowCondition"]`): properties `name`, `description`, `expression`, `resolver`, `create`/`edit`/`view`, `projectTypes`, `key`; required `description`, `expression`, `name`, `key`; no `function`. `jira:workflowValidator` in the same schema has both `function` and `expression` (neither required). Checked 2026-10-03.

What follows from that:
- A condition **cannot** call your app, REST APIs, KVS, a model or any network. An "AI condition" or an "external API condition" cannot exist.
- A condition costs no Forge invocation and has no function timeout: Jira runs it wherever it offers the transition (issue view, REST, automation, bulk changes).
- Work that needs code or judgement belongs in a **validator** (`jira:workflowValidator` with `function`): it runs at transition time and can refuse with an error message.
- An expression that errors hides the transition (it fails closed), so guard every lookup (`config == null ? true : ...`, `issue?.[...]`).

### Which one to use

| Need | Use |
|------|-----|
| A one-off visibility rule an admin types by hand | A Jira expression condition in the workflow editor (no app needed) |
| A visibility rule your app ships, configured per transition through a UI | `jira:workflowCondition` (manifest `expression` + config UI) |
| A check that needs REST, KVS, external systems or a model | `jira:workflowValidator` with a `function` (runs on transition, can block with a message) |
| Visibility that depends on data only code can compute | Compute it elsewhere (a trigger, a post-function, a scheduled job) into an **issue property**, and have the condition's expression read the property |

### What Are Jira Expressions?

Jira expressions are a small expression language that Jira evaluates inside its own engine.

**Key Points:**
- Configured in the Jira workflow editor or via REST API, or shipped by an app as a `jira:workflowCondition` module's `expression`
- Uses simple expression syntax like: `user.inGroup('release-managers')`
- Runs within Jira's engine, never as a Forge function

## Configuration Approach

### Using the Workflow Editor (UI)

1. Open your workflow in Jira
2. Select the transition you want to add a condition to
3. Add your app's condition (for an app-provided module) or a **"Jira expression"** condition (for hand-written logic)
4. If using an app's module, select your app and the specific condition, then fill in its configuration UI
5. If using a Jira expression, enter your expression: `user.inGroup('release-managers')`

### Using the Forge Module (`jira:workflowCondition`)

```yaml
modules:
  jira:workflowCondition:
    - key: my-custom-condition
      name: Custom Visibility Rule
      description: Shows the transition only when the configured field has a value
      # The check itself. Jira evaluates it; no function is called.
      expression: >-
        config == null || config.fieldId == null ? true : issue?.[config.fieldId] != null
      # Optional: a Custom UI to configure the condition per transition.
      resolver:
        function: resolver        # backs the create/edit/view UI only, never the check
      create:
        resource: condition-config-ui
      edit:
        resource: condition-config-ui

functions:
  - key: resolver
    handler: index.handler

resources:
  - key: condition-config-ui
    path: static/condition-config/build
```

The config UI saves the rule's configuration (`workflowRules.onConfigure` from `@forge/jira-bridge` returns it as a JSON string). Jira hands that saved configuration to the expression as `config`, next to `issue`, `user` and `project`.

### Reading data your app computed

The expression cannot fetch anything, but it can read **issue properties**. Have code write the answer to a property, then read it in the expression:

```yaml
expression: >-
  issue.properties?.["myapp.checks"] == null ? true :
  issue.properties?.["myapp.checks"]?.approved == true
```

Decide on purpose what an absent property means (above: shown). A property your code has not written yet is the common case right after an issue is created.

## Comparison: Connect vs Forge Approach

| Aspect | Connect Apps | Forge Apps |
|--------|-------------|------------|
| Module Type | `jiraWorkflowConditions` | `jira:workflowCondition` |
| Manifest Entry | Required with `enabledForTmp` property | Required for an app-shipped condition |
| The check | The module's Jira expression | The module's `expression` (a Jira expression); no function |
| Configuration | In manifest or via JS API | Workflow UI + optional Custom UI config (`create`/`edit`/`view`) |

## Jira Expression Syntax for Conditions

### Basic Checks

```javascript
// Check if user is in a group
user.inGroup('release-managers')

// Check if issue has assignee
issue.assignee != null

// Check if priority is high
issue.priority.name == "High"

// Check project key
project.key == "PROJ"
```

### Field Access

| Expression | Returns |
|-----------|---------|
| `user.accountId` | User's Atlassian account ID |
| `user.inGroup('group-name')` | Boolean - is user in group? |
| `user.inProjectRole(roleId)` | Boolean - is user in role? |
| `issue.assignee != null` | Boolean - is issue assigned? |
| `project.key == "KEY"` | Boolean - project key match |

### Operators

- **Comparison**: `==`, `!=`, `>`, `<`, `>=`, `<=`
- **Logical**: `&&`, `||`, `!`
- **Methods**: `.inGroup()`, `.inProjectRole()`

## Common Condition Examples

### 1. Release Manager Only

```javascript
user.inGroup('release-managers')
```

**Use case**: Hide transition unless user is in release manager group.

### 2. Must Be Assigned

```javascript
issue.assignee != null
```

**Use case**: Hide transition until issue is assigned to someone.

### 3. Only Reporter Can Proceed

```javascript
user.accountId == issue.reporter.accountId
```

**Use case**: Hide transition unless user created the issue.

## Response Handling

When a condition's expression evaluates to false:

1. The transition is hidden from users
2. Users cannot see or execute that transition
3. **No Forge event is fired**
4. No Forge function runs, for an app-provided condition or a hand-written one

### Important: No "Condition Failed" Event

There is **NO** special event for failed conditions. This is a common misconception.

When a condition fails:
- The transition is hidden from the UI
- **No external event is triggered**
- Your Forge app functions do NOT run

## Permissions Required

To configure conditions via REST API:

```yaml
permissions:
  scopes:
    - read:jira-work             # View issue data
    - manage:jira-configuration  # Manage workflow configuration (requires Administer Jira)
```

**Note**: Most condition configurations are done through the Jira UI, not programmatically.

## Migration from Connect Apps

If you have an existing Connect app with `jiraWorkflowConditions`:

### Before (Connect)
```json
{
  "modules": {
    "jiraWorkflowConditions": [
      {
        "key": "my-condition",
        "expression": "user.inGroup('release-managers')",
        "enabledForTmp": true,
        "name": {"value": "Release Condition"}
      }
    ]
  }
}
```

### After (Forge)
- The same expression moves into a `jira:workflowCondition` module's `expression`, with a config UI if the rule needs per-transition settings.
- Logic that needs code (REST, KVS, external systems) cannot move into a condition: make it a `jira:workflowValidator` with a `function`, or precompute it into an issue property the expression reads.

## Event Handling

Forge apps do NOT receive events when conditions are evaluated. This is a key difference from triggers.

### What happens during condition evaluation:

1. User opens an issue (or REST, automation or a bulk change asks which transitions are available)
2. Jira evaluates every condition's Jira expression itself
3. If an expression returns false, or errors, the transition is hidden
4. If it returns true, the transition is shown
5. **No event is fired** and no Forge function runs

## Common Use Cases

1. **Role-Based Visibility**: Show transitions only for specific roles/groups
2. **Business Logic**: Hide transitions until prerequisites (fields, linked data in issue properties) are met
3. **Feature Flags**: Conditionally enable based on the condition's saved configuration
4. **App-computed state**: Show a transition once your app has written an approval into an issue property

## Next Steps

- **Workflow Validators**: `02-workflow-validators.md` - a Forge function (or an expression) run when the transition is attempted; the place for checks that need code
- **Workflow Post Functions**: `04-workflow-post-functions.md` - a Forge function run after a successful transition
- **Deep dive**: `25-workflow-modules-deep-dive.md` - "Conditions are Jira expressions, never functions"

**Remember**: a Forge `jira:workflowCondition` is a manifest Jira expression. It never calls a function.
