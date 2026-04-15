# Jira Workflow Conditions (Jira Expressions)

## Overview

Forge apps **DO have a `jira:workflowCondition` module type**. This allows you to execute custom Forge functions to control the visibility of transitions, providing much more power than simple Jira expressions.

While Jira expressions are useful for simple logic, the `jira:workflowCondition` module is the correct way to implement complex, data-driven visibility rules that require external API calls, database lookups, or advanced business logic.

### When to use `jira:workflowCondition` vs Jira Expressions

| Feature | Jira Expressions | `jira:workflowCondition` |
|---------|-----------------|---------------------------|
| **Complexity** | Simple logic (field presence, group check) | Complex logic (external API, KVS, DB) |
| **Execution** | Within Jira engine (fast) | As a Forge function (more powerful) |
| **Manifest** | No declaration needed | Requires `manifest.yml` entry |
| **Configuration** | Direct in Workflow UI | Workflow UI + Forge Function |

### What Are Jira Expressions?

Jira expressions are a simple expression language that allows you to perform basic validation/visibility checks. They run within Jira's workflow engine.

**Key Points:**
- No `manifest.yml` module declaration needed
- Configured in Jira workflow editor or via REST API
- Uses simple expression syntax like: `user.inGroup('release-managers')`
- Runs within Jira's engine, not as a separate Forge function

## Configuration Approach

### Using the Workflow Editor (UI)

1. Open your workflow in Jira
2. Select the transition you want to add a condition to
3. Add a condition of type **"Forge workflow condition"** (for custom modules) or **"Jira expression"** (for simple logic)
4. If using a Forge module, select your app and the specific condition key
5. If using a Jira expression, enter your expression: `user.inGroup('release-managers')`

### Using the Forge Module (`jira:workflowCondition`)

To implement a custom condition via Forge, you must declare it in your `manifest.yml`:

```yaml
modules:
  jira:workflowCondition:
    - key: my-custom-condition
      name: Custom Visibility Rule
      description: Hides transition based on complex external logic
      function: checkVisibility
      # Optional: UI for configuring the condition
      create:
        resource: condition-config-ui

functions:
  - key: checkVisibility
    handler: src/index.checkVisibility

resources:
  - key: condition-config-ui
    path: static/condition-config/build
```

### Function Implementation

Your Forge function must return a response indicating whether the transition should be visible.

```javascript
export const checkVisibility = async (payload) => {
  const { issue, configuration } = payload;

  try {
    // Example: Check an external system or KVS
    const isAllowed = await api.asApp().requestJira(route`/rest/api/3/issue/${issue.id}/some-custom-endpoint`);
    
    if (isAllowed.ok) {
       return { result: true };
    }

    return { result: false };

  } catch (error) {
    console.error("Condition error:", error);
    // Best practice: Fail closed (hide transition) if error occurs during critical checks
    return { result: false };
  }
};
```

## Response Formats

The function must return an object with a `result` property (boolean).

| Scenario | Return Value | Result in Jira |
|----------|--------------|----------------|
| **Visible** | `{ result: true }` | Transition is shown to users |
| **Hidden** | `{ result: false }` | Transition is hidden from users |

## Comparison: Connect vs Forge Approach

| Aspect | Connect Apps | Forge Apps |
|--------|-------------|------------|
| Module Type | `jiraWorkflowConditions` | `jira:workflowCondition` |
| Manifest Entry | Required with `enabledForTmp` property | Required for custom modules |
| Configuration | In manifest or via JS API | Workflow UI + Forge Function |


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

- **Comparison**: `=`, `!=`, `>`, `<`, `>=`, `<=`
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

When a Jira expression evaluates to false:

1. The transition is hidden from users
2. Users cannot see or execute that transition
3. **No Forge event is fired**
4. Your Forge app functions do NOT run for condition evaluation

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
    - read:jira-work       # View issue data
    - manage:jira-config   # Manage workflow configuration (requires Administer Jira)
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
- For **simple logic**: Use Jira Expressions directly in the workflow editor (no `manifest.yml` entry).
- For **complex logic**: Implement a `jira:workflowCondition` module in your `manifest.yml` and point it to a Forge function.

## Comparison: Connect vs Forge Approach

| Aspect | Connect Apps | Forge Apps |
|--------|-------------|------------|
| Module Type | `jiraWorkflowConditions` | `jira:workflowCondition` |
| Manifest Entry | Required with `enabledForTmp` property | Required for custom modules |
| Configuration | In manifest or via JS API | Workflow UI + Forge Function |

## Event Handling

Forge apps do NOT receive events when conditions are evaluated. This is a key difference from triggers.

### What happens during condition evaluation:

1. User opens issue transition screen
2. Jira evaluates all condition expressions (either via Jira Expressions or Forge functions)
3. If expression/function returns false → transition hidden
4. If expression/function returns true → transition shown
5. **No event is fired** (even if a Forge function was executed to determine visibility)

## Common Use Cases

1. **Licensing Check**: Only show transition if app license is active
2. **Role-Based Visibility**: Show transitions only for specific roles/groups
3. **Business Logic**: Hide transitions until prerequisites are met
4. **Feature Flags**: Conditionally enable based on configuration

**Note**: For complex condition logic that requires external API calls, consider using a trigger module instead.

## Next Steps

- **Workflow Validators**: Validate data when transition completes (also uses Jira expressions)
- **Workflow Post Functions**: Execute after successful transitions (uses Jira expressions)
- **Jira Expressions Guide**: Learn more about the expression syntax at Atlassian's documentation

**Remember**: Forge apps use Jira expressions for workflow conditions - not custom module types.