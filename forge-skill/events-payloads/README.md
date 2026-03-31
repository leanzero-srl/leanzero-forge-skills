# Forge Events Payloads Documentation

## Overview

This directory contains detailed documentation for Forge event payloads across different Atlassian products. Events trigger your app functions when specific actions occur in Jira, Bitbucket, or Confluence.

## Files

| File | Description |
|------|-------------|
| [jira-events.md](./jira-events.md) | Jira event types and payload structures |
| [bitbucket-events.md](./bitbucket-events.md) | Bitbucket event types and payload structures |
| [confluence-events.md](./bitbucket-events.md) | Confluence event types and payload structures |

## Jira Event Filters

Jira events can be filtered using **Jira expressions** to trigger functions only when specific conditions are met.

| File | Description |
|------|-------------|
| [jira-event-filters.md](./jira-event-filters.md) | Filter events with Jira expressions |

### Common Filter Use Cases
- Filter by project, issue type, or status
- Filter by priority or labels
- Filter by assignee or reporter
- Time-based filtering (created/updated within specific timeframes)

## Event Types

### Jira Events
- **Issue Events**: created, updated, deleted
- **Comment Events**: created, updated, deleted  
- **Workflow Events**: transitions, status changes
- **Notification Events**: created, deleted

### Bitbucket Events
- **Pull Request Events**: opened, updated, merged, declined
- **Repository Events**: pushed, forked, deleted
- **Merge Check Events**: evaluation results

### Confluence Events
- **Content Events**: created, updated, deleted, archived
- **Space Events**: created, updated, deleted
- **Macro Events**: rendering requests

## Event Payload Structure

All events share a common structure:

```javascript
{
  "eventType": "avi:jira:created:issue",
  
  // Atlassian ID of the user who triggered the event
  "atlassianId": "557058:1234-5678-abcd-efgh",
  
  // Execution context
  "context": {
    "cloudId": "ari:cloud:identity::site/...",
    "moduleKey": "my-app-trigger"
  },
  
  // Product-specific payload data
  "issue": { ... }  // or comment, pullRequest, etc.
}
```

## Learning Path

1. Understand [Jira Events](./jira-events.md) - Most commonly used product in Forge apps
2. Review [Event Filtering](./jira-event-filters.md) - Learn to use expressions for selective triggering
3. Check Bitbucket/Confluence events as needed
4. Implement event handlers in your Forge app

## Best Practices

1. **Validate event type** - Always check `event.eventType` before processing
2. **Handle missing data** - Event payloads may have different fields depending on context
3. **Error recovery** - Don't let one failed event break your entire app
4. **Logging** - Log important information for debugging and auditing

## Related Documentation

- [Forge Events Reference](../06-events-payloads.md)
- [Jira REST API](../api-endpoints/jira-rest-api-v2.md) - Query additional data from events