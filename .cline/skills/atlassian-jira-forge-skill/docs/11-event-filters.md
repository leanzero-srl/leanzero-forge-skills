# Event Filters with Jira Expressions

This document provides comprehensive examples of event filtering using Jira expressions in Atlassian Forge apps. Filter events to handle only specific issue types, priorities, projects, or any other criteria.

## Table of Contents
1. [Basic Event Filtering](#basic-event-filtering)
2. [Filter by Project](#filter-by-project)
3. [Filter by Issue Type](#filter-by-issue-type)
4. [Filter by Priority](#filter-by-priority)
5. [Filter by Status](#filter-by-status)
6. [Filter by Labels](#filter-by-labels)
7. [Filter by Assignee](#filter-by-assignee)
8. [Complex Filters](#complex-filters)
9. [Available Expression Functions](#available-expression-functions)

---

## Basic Event Filtering

### Manifest Configuration with Filter

```yaml
modules:
  trigger:
    - key: issue-created-trigger
      events:
        - avi:jira:created:issue
      filter: |
        issue.fields.project.key == 'PROJ'
      function: handleProjectIssues
      
    - key: bug-only-trigger  
      events:
        - avi:jira:created:issue
      filter: |
        issue.fields.issuetype.name == 'Bug'
      function: handleBugs
      
    - key: high-priority-trigger
      events:
        - avi:jira:created:issue
      filter: |
        issue.fields.priority.name in ['Highest', 'High']
      function: handleHighPriorityIssues
```

### Function Implementation

```javascript
export const handleProjectIssues = async (event, context) => {
  console.log('Issue created in PROJ:', event.issue.key);
  
  // Your logic for handling issues in this project
  return { status: 'processed' };
};

export const handleBugs = async (event, context) => {
  console.log('Bug created:', event.issue.key);
  
  // Your bug-handling logic
  return { status: 'bug-detected' };
};

export const handleHighPriorityIssues = async (event, context) => {
  console.log('High priority issue created:', event.issue.key);
  
  // Alert or special handling for high priority
  await notifyTeamOfHighPriority(event.issue);
  
  return { status: 'high-priority-notify' };
};
```

---

## Filter by Project

### Filter by Single Project

```yaml
trigger:
  - key: specific-project-trigger
    events:
      - avi:jira:created:issue
    filter: |
      issue.fields.project.key == 'PROJ'
    function: handleProjectIssues
    
  - key: another-project-trigger
    events:
      - avi:jira:updated:issue
    filter: |
      issue.fields.project.key == 'ANOTHER'
    function: handleAnotherProjectUpdates
```

### Filter by Multiple Projects

```yaml
trigger:
  - key: multi-project-trigger
    events:
      - avi:jira:created:issue
    filter: |
      issue.fields.project.key in ['PROJ', 'PROJB', 'PROJC']
    function: handleMultipleProjects
```

---

## Filter by Issue Type

### Filter by Single Issue Type

```yaml
trigger:
  - key: bug-trigger
    events:
      - avi:jira:created:issue
    filter: |
      issue.fields.issuetype.name == 'Bug'
    function: handleBugs
    
  - key: task-trigger
    events:
      - avi:jira:created:issue
    filter: |
      issue.fields.issuetype.name == 'Task'
    function: handleTasks
```

### Filter by Multiple Issue Types

```yaml
trigger:
  - key: work-item-trigger
    events:
      - avi:jira:updated:issue
    filter: |
      issue.fields.issuetype.name in ['Bug', 'Task', 'Story']
    function: handleWorkItems
```

---

## Filter by Priority

### Filter by High Priority

```yaml
trigger:
  - key: high-priority-trigger
    events:
      - avi:jira:created:issue
    filter: |
      issue.fields.priority.name in ['Highest', 'High']
    function: handleHighPriority
    
  - key: critical-only-trigger
    events:
      - avi:jira:created:issue
    filter: |
      issue.fields.priority.name == 'Critical'
    function: handleCriticalIssues
```

### Filter by Low Priority

```yaml
trigger:
  - key: low-priority-trigger
    events:
      - avi:jira:updated:issue
    filter: |
      issue.fields.priority.name in ['Lowest', 'Low']
    function: handleLowPriority
```

---

## Filter by Status

### Filter by Specific Statuses

```yaml
trigger:
  - key: status-created-trigger
    events:
      - avi:jira:created:issue
    filter: |
      issue.fields.status.name == 'To Do'
    function: handleTodoIssues
    
  - key: status-in-progress-trigger
    events:
      - avi:jira:updated:issue
    filter: |
      issue.fields.status.name == 'In Progress'
    function: handleInProgressIssues
```

### Filter by Status Change

```yaml
trigger:
  - key: transition-to-done-trigger
    events:
      - avi:jira:status:changed
    filter: |
      (changelog.to = 'Done' or changelog.toCategory.name == 'Done')
    function: handleCompletedTransitions
```

---

## Filter by Labels

### Filter by Specific Label

```yaml
trigger:
  - key: security-label-trigger
    events:
      - avi:jira:created:issue
    filter: |
      'security' in issue.fields.labels
    function: handleSecurityIssues
    
  - key: tech-debt-trigger
    events:
      - avi:jira:updated:issue
    filter: |
      'technical-debt' in issue.fields.labels
    function: handleTechDebtIssues
```

### Filter by Multiple Labels

```yaml
trigger:
  - key: multi-label-trigger
    events:
      - avi:jira:created:issue
    filter: |
      ('urgent' in issue.fields.labels) 
      or ('critical' in issue.fields.labels)
    function: handleUrgentIssues
```

---

## Filter by Assignee

### Filter by Specific User

```yaml
trigger:
  - key: my-issues-trigger
    events:
      - avi:jira:created:issue
    filter: |
      issue.fields.assignee.accountId == 'user:123456:abc-def-ghi'
    function: handleMyIssues
    
  - key: assigned-to-me-update
    events:
      - avi:jira:updated:issue
    filter: |
      issue.fields.assignee.accountId == context.accountId
    function: handleAssignedToMe
```

### Filter by Unassigned Issues

```yaml
trigger:
  - key: unassigned-trigger
    events:
      - avi:jira:created:issue
    filter: |
      issue.fields.assignee is null
    function: handleUnassignedIssues
```

---

## Complex Filters

### Multiple Conditions (AND)

```yaml
trigger:
  - key: complex-and-filter
    events:
      - avi:jira:created:issue
    filter: |
      (issue.fields.project.key == 'PROJ')
      and (issue.fields.issuetype.name in ['Bug', 'Task'])
      and (issue.fields.priority.name in ['Highest', 'High'])
    function: handleComplexCriteria
```

### Multiple Conditions (OR)

```yaml
trigger:
  - key: complex-or-filter
    events:
      - avi:jira:updated:issue
    filter: |
      (issue.fields.issuetype.name == 'Bug')
      or ('security' in issue.fields.labels)
    function: handleAnyMatchCriteria
```

### Complex Combined Logic

```yaml
trigger:
  - key: complex-combined-filter
    events:
      - avi:jira:created:issue
    filter: |
      (issue.fields.project.key == 'PROJ')
      and (
        issue.fields.issuetype.name in ['Bug', 'Task']
        or ('urgent' in issue.fields.labels)
      )
      and (
        issue.fields.priority.name in ['Highest', 'High']
        or issue.fields.issuetype.name == 'Bug'
      )
    function: handleComplexCombined
```

### Filter by Custom Fields

```yaml
trigger:
  - key: custom-field-filter
    events:
      - avi:jira:created:issue
    filter: |
      issue.fields.customfield_10001 is not null
      and issue.fields.customfield_10001.value == 'High'
    function: handleCustomFieldIssues
    
  - key: date-based-filter
    events:
      - avi:jira:created:issue
    filter: |
      issue.fields.duedate is not null
      and issue.fields.duedate < startOfWeek()
    function: handleOverdueIssues
```

---

## Available Expression Functions

### String Functions

| Function | Description | Example |
|----------|-------------|---------|
| `contains(text, substring)` | Check if string contains substring | `contains(issue.fields.summary, 'error')` |
| `startsWith(text, prefix)` | Check if string starts with prefix | `startsWith(issue.fields.summary, '[BUG]')` |
| `endsWith(text, suffix)` | Check if string ends with suffix | `endsWith(issue.fields.summary, 'Urgent')` |
| `equals(a, b)` or `a == b` | Check equality | `issue.fields.status.name equals 'Done'` |

### Collection Functions

| Function | Description | Example |
|----------|-------------|---------|
| `in(item, collection)` | Check if item is in collection | `'bug' in issue.fields.labels` |
| `size(collection)` | Get collection size | `size(issue.fields.labels) > 0` |
| `is not null / is null` | Check for null values | `issue.fields.assignee is not null` |

### Comparison Functions

| Function | Description | Example |
|----------|-------------|---------|
| `greaterThan(a, b)` or `a > b` | Check if a > b | `greaterThan( issue.fields.comment.commentsSize, 5)` |
| `lessThan(a, b)` or `a < b` | Check if a < b | `issue.fields.issuetype.id < '10'` |
| `greaterThanOrEqual(a, b)` or `a >= b` | Check if a >= b | N/A (use `a >= b`) |
| `lessThanOrEqual(a, b)` or `a <= b` | Check if a <= b | N/A (use `a <= b`) |

### Date Functions

| Function | Description | Example |
|----------|-------------|---------|
| `startOfDay()` | Start of current day | `created >= startOfDay()` |
| `endOfDay()` | End of current day | `created <= endOfDay()` |
| `startOfWeek()` | Start of current week | `created >= startOfWeek()` |
| `endOfWeek()` | End of current week | `created <= endOfWeek()` |
| `startOfMonth()` | Start of current month | `created >= startOfMonth()` |
| `endOfMonth()` | End of current month | `created <= endOfMonth()` |

---

## Best Practices

1. **Keep filters simple** - Complex expressions can be harder to debug
2. **Test filters thoroughly** - Test with various data combinations
3. **Use comments** - Add comments for complex multi-line filters
4. **Be aware of case sensitivity** - String comparisons are case-sensitive
5. **Handle null values** - Always check for null when accessing nested fields

---

## Related Documentation

- [Forge Triggers](https://developer.atlassian.com/cloud/forge/application-structure/#triggers)
- [Jira Expressions Reference](https://developer.atlassian.com/cloud/jira/platform/modules/issue-create-event/)