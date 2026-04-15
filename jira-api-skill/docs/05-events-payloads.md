# Events & Payloads Reference

## Overview

Forge apps respond to various events fired by Atlassian products. Understanding event structures is crucial for building robust applications that react correctly to user actions.

**Important**: Forge apps use **trigger modules** (not workflow validators) to respond to events. The `jira:workflow_validation_failed` event mentioned in some documentation does not exist in Forge - failed Jira expressions are handled entirely within the workflow engine without triggering external events.

## Event Categories

| Category | Product | Description |
|----------|---------|-------------|
| **Jira Events** | Jira | Issue creation, updates, workflow transitions, comments, etc. |
| **Bitbucket Events** | Bitbucket | Repository changes, PR events, merge checks |
| **Confluence Events** | Confluence | Page creation, updates, macro execution |

## Common Event Structure

All Forge events share a common structure:

```javascript
{
  // Product-specific payload data
  issue: { ... },
  repository: { ... },
  
  // Execution context
  context: {
    cloudId: "ari:cloud:identity::site/...",
    moduleKey: "my-app-module"
  },
  
  // Atlassian ID of triggering user
  atlassianId: "557058:1234-5678-abcd-efgh"
}
```

## Jira Events

### Issue Events

Forge trigger modules use the `jira:<action>:<entity>` format (e.g., `jira:issue_created`, `jira:comment_updated`):

| Event Name | Description |
|------------|-------------|
| `jira:issue_created` | When a new issue is created |
| `jira:issue_updated` | When an issue's fields are updated |
| `jira:issue_deleted` | When an issue is deleted |

### Issue Payload Structure

```javascript
{
  "eventType": "jira:issue_created",
  "atlassianId": "557058:1234-5678-abcd-efgh",
  "context": {
    "cloudId": "ari:cloud:identity::site/...",
    "moduleKey": "my-app-trigger"
  },
  "issue": {
    "id": "12345",
    "key": "PROJ-123",
    "fields": {
      "summary": "Bug in login module",
      "description": "User cannot log in with valid credentials",
      "issuetype": {
        "id": "10000",
        "name": "Bug"
      },
      "project": {
        "id": "10001",
        "key": "PROJ"
      },
      "status": {
        "id": "10000",
        "name": "To Do"
      },
      "assignee": {
        "accountId": "557058:abc123def456",
        "displayName": "John Doe"
      },
      "labels": ["critical", "ui"],
      "priority": {
        "id": "2",
        "name": "High"
      }
    },
    "changelog": [  // Only in updated events
      {
        "field": "status",
        "from": "10000",
        "to": "10001",
        "fromString": "To Do",
        "toString": "In Progress"
      }
    ]
  }
}
```

### Comment Events

| Event Name | Description |
|------------|-------------|
| `jira:comment_created` | When a comment is added to an issue |
| `jira:comment_updated` | When a comment is edited |
| `jira:comment_deleted` | When a comment is deleted |

### Comment Payload

```javascript
{
  "eventType": "jira:comment_created",
  "atlassianId": "557058:abc123",
  "issue": {
    "id": "12345",
    "key": "PROJ-123"
  },
  "comment": {
    "id": "10000",
    "body": "This bug is related to the API timeout issue.",
    "author": {
      "accountId": "557058:abc123",
      "displayName": "Jane Smith"
    }
  },
  "context": { ... }
}
```

### Workflow Events

| Event Name | Description |
|------------|-------------|
| `jira:workflow_transitioned` | When any workflow transition occurs |

## Trigger Module Configuration

To listen for events, declare them in your `manifest.yml`:

```yaml
modules:
  trigger:
    - key: issue-created-trigger
      events:
        - jira:issue_created
        - jira:issue_updated
      function: handleIssueEvents
        
    - key: pr-merge-check
      events:
        - bitbucket:pullrequest_opened
        - bitbucket:pullrequest_updated
      function: handlePREvents
```

## Function Handler Signature

```javascript
export const handleIssueEvents = async (event, context) => {
  console.log('Event type:', event.eventType);
  
  switch(event.eventType) {
    case 'jira:issue_created':
      return handleCreatedIssue(event);
    case 'jira:issue_updated':
      return handleUpdatedIssue(event);
  }
};

export const handlePREvents = async (event, context) => {
  console.log('PR trigger:', event.pullrequest.title);
  // Your PR handling logic
};
```

## Important: Failed Expression Events

**Critical**: There is **NO** `jira:workflow_validation_failed` or `jira:workflow_condition_failed` event in Forge.

When a Jira expression (used for validators/conditions) fails:

1. The workflow transition is blocked (for validators)
2. The transition is hidden from users (for conditions)
3. **NO external event is triggered**
4. Your Forge app functions do NOT run

This is a key difference between Connect and Forge:
- **Connect**: Used custom validator modules with potential callback patterns
- **Forge**: Uses Jira expressions that handle validation entirely within the workflow engine

### What Actually Happens When Validation Fails

```
User clicks transition button
    ↓
Jira evaluates condition/validator expression
    ↓
Expression returns false?
    ├─ YES → Transition blocked or hidden, NO event fired
    └─ NO  → Transition proceeds normally
```

## Accessing Event Data

```javascript
// Issue data from any Jira event
const issueKey = event.issue.key;
const issueId = event.issue.id;

// Project information
const projectKey = event.issue.fields.project.key;
const projectId = event.issue.fields.project.id;

// User who triggered the event
const triggerUserId = event.atlassianId;

// Custom field access (use field ID, not name)
const customFieldValue = event.issue.fields.customfield_10001;
```

## Best Practices

1. **Validate Event Type**: Always check `event.eventType` before processing
2. **Handle Missing Data**: Issue fields may be undefined in some events
3. **Error Recovery**: Don't let one failed event break your app
4. **Rate Limiting**: External API calls should handle rate limits gracefully

## Common Triggers Reference

| Event | Trigger Module |
|-------|----------------|
| `jira:issue_created` | Issue created |
| `jira:issue_updated` | Issue updated |
| `jira:comment_created` | Comment added |
| `jira:workflow_transitioned` | Workflow transition completed |
| `scheduledTriggers` | Time-based execution |

## Next Steps

- **Jira Modules**: Understand which modules respond to which events
- **API Endpoints**: Learn how to query additional data from Jira REST API
- **Storage**: Persist event-related data using Forge KVS

**Remember**: Failed Jira expressions do NOT trigger external events - they're handled entirely within the workflow engine.