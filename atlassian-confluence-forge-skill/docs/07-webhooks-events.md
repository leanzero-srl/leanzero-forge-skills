# Product Event Triggers: Handling Confluence Events

This guide covers trigger modules in Forge apps for Confluence — allowing your app to react to events like page creation, updates, and deletions.

---

## Overview

Forge triggers enable your app to receive notifications when specific events occur in Confluence. Unlike polling with scheduled triggers, trigger modules provide near-real-time event handling (events may be delayed up to 3 minutes).

```yaml
modules:
  trigger:
    - key: page-created-handler
      function: onPageCreated
      events:
        - avi:confluence:created:page
  function:
    - key: onPageCreated
      handler: index.onPageCreated
```

---

## Available Events

The following event patterns are verified for Confluence Forge. The general pattern is `avi:confluence:<action>:<content-type>`.

### Page & Blog Post Events (Content)

| Event | Description | Content Type |
|-------|-------------|--------------|
| `avi:confluence:created:page` | New page created | Page |
| `avi:confluence:updated:page` | Page content changed | Page |
| `avi:confluence:viewed:page` | Page viewed (limited reliability) | Page |
| `avi:confluence:trashed:page` | Page moved to trash | Page |
| `avi:confluence:restored:page` | Page restored from trash | Page |
| `avi:confluence:deleted:page` | Page permanently deleted | Page |
| `avi:confluence:archived:page` | Page archived | Page |
| `avi:confluence:unarchived:page` | Page unarchived | Page |
| `avi:confluence:moved:page` | Page moved to another location | Page |
| `avi:confluence:copied:page` | Page copied | Page |
| `avi:confluence:created:blogpost` | New blog post published | Blog Post |
| `avi:confluence:updated:blogpost` | Blog post updated | Blog Post |

### Comment Events

| Event | Description |
|-------|-------------|
| `avi:confluence:created:comment` | Comment added |
| `avi:confluence:updated:comment` | Comment edited |
| `avi:confluence:liked:comment` | Comment liked |
| `avi:confluence:deleted:comment` | Comment deleted |

### Attachment Events

| Event | Description |
|-------|-------------|
| `avi:confluence:created:attachment` | Attachment uploaded |
| `avi:confluence:updated:attachment` | Attachment updated |
| `avi:confluence:viewed:attachment` | Attachment viewed |
| `avi:confluence:deleted:attachment` | Attachment permanently deleted |

### Whiteboards, Databases & Smart Links

| Event | Description | Content Type |
|-------|-------------|--------------|
| `avi:confluence:created:whiteboard` | Whiteboard created | Whiteboard |
| `avi:confluence:created:database` | Database created | Database |
| `avi:confluence:created:embed` | Smart link created in content tree | Embed |

### Space & User Events

| Event | Description | Scope Required |
|-------|-------------|--------------|
| `avi:confluence:created:space:V2` | New space created | `read:confluence-space.summary` |
| `avi:confluence:created:user` | User created | `read:confluence-user` |
| `avi:confluence:created:group` | Group created | `read:confluence-groups` |

---

## Trigger Handler Implementation

### Handler Signature

Forge trigger handlers receive `(event, context)` — **NOT** Express-style `(req, res)`.

```typescript
// src/triggers/page-created.ts

import api, { route } from '@forge/api';

export const handler = async (event: any, context: any) => {
  // The user who triggered the event
  const accountId = event.context?.principal?.accountId;

  console.log(`Page created by user: ${accountId}`);

  // Use api.asApp() for backend API calls — Forge handles auth automatically
  const response = await api.asApp().requestConfluence(
    route`/wiki/api/v2/pages/${event.content.id}?body-format=storage`
  );

  if (response.ok) {
    const page = await response.json();
    console.log(`Page title: ${page.title}`);
    await processPage(page, accountId);
  }
};

async function processPage(page: any, accountId: string) {
  // Your custom logic here
}
```

### Handling Multiple Event Types

```typescript
// src/triggers/content-handler.ts

import api, { route } from '@forge/api';

export const handler = async (event: any, context: any) => {
  const accountId = event.context?.principal?.accountId;
  const eventType = event.event;

  console.log(`Event: ${eventType}, User: ${accountId}`);

  switch (eventType) {
    case 'avi:confluence:created:page':
      await handlePageCreated(event, accountId);
      break;
    case 'avi:confluence:updated:page':
      await handlePageUpdated(event, accountId);
      break;
    default:
      console.log(`Unhandled event type: ${eventType}`);
  }
};
```

---

## Manifest Examples

### Single Event Trigger

```yaml
modules:
  trigger:
    - key: page-created-trigger
      function: onPageCreated
      events:
        - avi:confluence:created:page
  function:
    - key: onPageCreated
      handler: src/triggers/page-created.handler
```

### Multiple Triggers Sharing a Handler

```yaml
modules:
  trigger:
    - key: on-page-created
      function: contentHandler
      events:
        - avi:confluence:created:page
    - key: on-page-updated
      function: contentHandler
      events:
        - avi:confluence:updated:page
    - key: on-comment-created
      function: contentHandler
      events:
        - avi:confluence:created:comment
  function:
    - key: contentHandler
      handler: src/triggers/content-handler.handler
```

### Required Scope

```yaml
permissions:
  scopes:
    - read:confluence-content.summary
```

---

## Rate Limiting & Backoff

Handle rate limits gracefully in trigger handlers:

```typescript
async function fetchWithRetry(url: string, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const response = await api.asApp().requestConfluence(route`${url}`);

    if (response.status !== 429) return response;

    const delay = Math.pow(2, attempt) * 1000;
    console.log(`Rate limited. Retrying in ${delay}ms...`);
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  throw new Error('Rate limit exceeded after retries');
}
```

---

## Combining Triggers with Scheduled Triggers

Use scheduled triggers as a fallback for missed events:

```yaml
modules:
  trigger:
    - key: page-created-trigger
      function: onPageCreated
      events:
        - avi:confluence:created:page
    - key: page-updated-trigger
      function: onPageUpdated
      events:
        - avi:confluence:updated:page

  scheduledTrigger:
    - key: reconciliation
      function: reconcileHandler
      interval: hour

  function:
    - key: onPageCreated
      handler: src/triggers/page-created.handler
    - key: onPageUpdated
      handler: src/triggers/page-updated.handler
    - key: reconcileHandler
      handler: src/scheduled/reconciliation.handler
      timeoutSeconds: 300
```

### Reconciliation Handler

```typescript
// src/scheduled/reconciliation.ts

import api, { route } from '@forge/api';
import { storage } from '@forge/api';

export const handler = async (event: any, context: any) => {
  const lastSyncTime = await storage.get('lastReconciliation')
    || '2024-01-01T00:00:00.000Z';

  const response = await api.asApp().requestConfluence(
    route`/wiki/rest/api/search?cql=type=page AND lastModified>='${lastSyncTime}'&limit=100`
  );

  if (response.ok) {
    const data = await response.json();

    for (const result of data.results || []) {
      const pageId = result.content?.id;
      if (!pageId) continue;

      console.log(`Reconciling: ${result.content?.title || pageId}`);
      await syncPageData(result.content);
    }
  }

  await storage.set('lastReconciliation', new Date().toISOString());
};
```

---

## Troubleshooting

### Trigger Not Firing

1. **Check event name**: Must follow `avi:confluence:<action>:<content-type>` pattern
2. **Verify scopes**: Ensure `read:confluence-content.summary` is in manifest
3. **Check deployment**: Run `forge deploy` then `forge install --upgrade`
4. **View logs**: `forge logs -n 50`

### Common Errors

- `403 Forbidden`: Missing scope — add required scope and run `forge lint --fix`
- `429 Too Many Requests`: Implement exponential backoff
- Handler errors: Check `forge logs` for stack traces

### Testing

Forge triggers cannot be tested locally via tunnel for all event types. Recommended approach:
1. Deploy to development environment
2. Trigger actual Confluence events (create/edit pages)
3. Check logs with `forge logs -n 50`

---

## Key Rules

- **Handler signature**: `(event, context)` — NOT Express `(req, res)`
- **Backend API calls**: Use `api.asApp()` or `api.asUser()` from `@forge/api`
- **DO NOT** use `@forge/bridge` in trigger handlers (it's frontend-only)
- **DO NOT** use `AP.context.getToken()` (that's Atlassian Connect, not Forge)
- **DO NOT** manually set Authorization headers (Forge handles auth)
- **User ID**: Access via `event.context.principal.accountId`
- **Event delivery**: May be delayed up to 3 minutes

---

## Next Steps

- [Content Properties](06-content-properties.md) - Store app state with content
- [API Endpoints](08-api-endpoints.md) - Complete REST API reference
