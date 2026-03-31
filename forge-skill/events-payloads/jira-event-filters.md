# Jira Event Filters with Jira Expressions

This guide explains how to use Jira expressions for filtering events in Forge apps, allowing you to trigger functions only when specific conditions are met.

## Overview

Event filters enable selective event handling by using Jira expressions - a powerful expression language that evaluates against the event payload. This allows fine-grained control over which events trigger your app logic.

---

## Event Filter Syntax

Jira expressions use a subset of JSONPath-like syntax to access fields in the event payload:

```javascript
// Basic field access
issue.fields.project.key

// Array access
issues[0].fields.summary

// String comparison
issue.fields.status.name == 'Open'

// Numeric comparison
issue.fields.priority.id > 1

// Boolean logic
(issue.fields.status.name == 'Open') && (issue.fields.assignee.accountId == currentUser())
```

---

## Common Filter Use Cases

### Filter by Project

Trigger only for issues in specific projects:

```yaml
modules:
  trigger:
    - key: project-specific-trigger
      events:
        - avi:jira:created:issue
        - avi:jira:updated:issue
      filter: issue.fields.project.key == 'PROJ'
      function: handleProjectIssues
```

### Filter by Issue Type

Trigger only for specific issue types:

```yaml
modules:
  trigger:
    - key: bug-only-trigger
      events:
        - avi:jira:created:issue
      filter: issue.fields.issuetype.name == 'Bug'
      function: handleBugs
```

### Filter by Status

Trigger when issues enter specific statuses:

```yaml
modules:
  trigger:
    - key: status-entered-trigger
      events:
        - avi:jira:transited:issue
      filter: issue.fields.status.name == 'In Progress'
      function: handleInProgress
```

### Filter by Assignee

Trigger only when assigned to specific users or groups:

```yaml
modules:
  trigger:
    - key: my-issues-trigger
      events:
        - avi:jira:created:issue
      filter: issue.fields.assignee.accountId == currentUser()
      function: handleMyIssues
```

### Filter by Priority

Trigger for high-priority issues only:

```yaml
modules:
  trigger:
    - key: priority-trigger
      events:
        - avi:jira:updated:issue
      filter: issue.fields.priority.name in ['Highest', 'High']
      function: handlePriorityIssues
```

### Complex Filters

Combine multiple conditions:

```yaml
modules:
  trigger:
    - key: complex-filter-trigger
      events:
        - avi:jira:created:issue
      filter: |
        (issue.fields.project.key == 'PROJ') 
        && (issue.fields.issuetype.name in ['Bug', 'Task'])
        && (issue.fields.priority.name in ['Highest', 'High'])
      function: handleHighPriorityIssuesInProject
```

---

## Available Expression Functions

### String Functions

| Function | Description | Example |
|----------|-------------|---------|
| `contains(text, substring)` | Check if string contains substring | `contains(issue.fields.summary, 'error')` |
| `startsWith(text, prefix)` | Check if string starts with prefix | `startsWith(issue.fields.summary, '[BUG]')` |
| `endsWith(text, suffix)` | Check if string ends with suffix | `endsWith(issue.fields.status.name, 'Done')` |
| `lowercase(text)` | Convert to lowercase | `lowercase(issue.fields.project.key)` |

### Numeric Functions

| Function | Description | Example |
|----------|-------------|---------|
| `greaterThan(a, b)` | Check if a > b | `greaterThan( issue.fields.comment.commentsSize, 5)` |
| `lessThan(a, b)` | Check if a < b | `lessThan(issue.fields.duedate - now(), 86400000)` |

### Collection Functions

| Function | Description | Example |
|----------|-------------|---------|
| `contains(collection, value)` | Check if collection contains value | `contains(labels, 'critical')` |
| `empty(collection)` | Check if collection is empty | `empty(issue.fields.attachments)` |

### Date/Time Functions

| Function | Description | Example |
|----------|-------------|---------|
| `now()` | Current timestamp | `now() > issue.fields.duedate` |
| `today()` | Today's date at midnight | `issue.fields.created >= today()` |

---

## Common Filter Patterns

### Filter by Labels

```yaml
filter: 'critical' in labels
```

### Filter by Components

```yaml
filter: 'frontend' in components
```

### Filter by Custom Fields

```yaml
filter: issue.fields.customfield_10001 == 'value'
```

### Filter by Multiple Projects

```yaml
filter: issue.fields.project.key in ['PROJ1', 'PROJ2', 'PROJ3']
```

### Filter by Time-based Conditions

```yaml
# Issues created today
filter: issue.fields.created >= today()

# Issues due within 7 days
filter: (issue.fields.duedate - now()) < 604800000

# Unresolved issues older than 30 days
filter: (now() - issue.fields.created) > 2592000000 && issue.fields.status.name != 'Done'
```

### Filter by Comment Content

```yaml
# Trigger on comments containing specific text
filter: contains(comment.body, 'urgent')

# Trigger only if comment has visibility restrictions
filter: !empty(comment.visibility)
```

---

## Workflow Expression Filters

Workflow validators and conditions also support expression filtering:

### Validator Example (Block workflow transition)

```yaml
modules:
  jiraWorkflowValidator:
    - key: assignee-must-be-set
      name: { value: 'Assignee Required' }
      description: { value: 'Issue must have an assignee before transitioning' }
      validationExpression: !empty issue.fields.assignee
```

### Condition Example (Show transition if condition met)

```yaml
modules:
  jiraWorkflowCondition:
    - key: only-admins-can-resolve
      name: { value: 'Admin Only Resolution' }
      description: { value: 'Only administrators can resolve issues' }
      conditionExpression: currentUser().groups contains 'jira-administrators'
```

---

## Expression Examples

### Block Issue Creation for Specific Types

```yaml
modules:
  jiraWorkflowValidator:
    - key: prevent-bug-creation-in-dev-project
      name: { value: 'Block Bug Creation in Dev' }
      validationExpression: issue.fields.issuetype.name != 'Bug'
```

### Conditional Workflow Transition

```yaml
modules:
  jiraWorkflowCondition:
    - key: require-testing-complete
      name: { value: 'Testing Complete Required' }
      conditionExpression: |
        !empty(issue.fields.customfield_10100) 
        && issue.fields.customfield_10100.name == 'Passed'
```

### Post-Function Execution

```yaml
modules:
  jiraWorkflowPostFunction:
    - key: notify-stakeholders
      name: { value: 'Notify Stakeholders' }
      description: { value: 'Send notification for high-priority issues' }
      expression: |
        issue.fields.priority.name in ['Highest', 'High']
        && !empty(issue.fields.labels)
```

---

## Testing Expressions

Use the Forge `evaluateExpression` function to test expressions:

```javascript
import { evaluateExpression } from '@forge/bridge';

// Test an expression against a payload
const result = await evaluateExpression(
  'issue.fields.priority.name == "High"',
  { issue: { fields: { priority: { name: 'High' } } } }
);

console.log('Result:', result); // true or false
```

---

## Best Practices

1. **Keep expressions simple** - Complex expressions can be hard to debug
2. **Test in development first** - Use Forge's test environment
3. **Use meaningful names** - Name your triggers based on their filter purpose
4. **Handle missing fields** - Check for null before accessing nested properties
5. **Monitor performance** - Complex filters may impact event processing time

---

## Error Handling

### Common Expression Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `Unrecognized property` | Field doesn't exist in payload | Verify field name in actual event |
| `Type mismatch` | Comparing incompatible types | Ensure type compatibility |
| `Invalid syntax` | Expression has errors | Check for missing operators/parentheses |

### Example Safe Filter

```yaml
filter: |
  !empty(issue.fields) 
  && !empty(issue.fields.project)
  && !empty(issue.fields.project.key)
  && issue.fields.project.key == 'PROJ'
```

---

## Related Documentation

- [Forge Events Reference](./jira-events.md) - Event payload structures
- [Forge Modules](../02-jira-modules.md) - Module type definitions