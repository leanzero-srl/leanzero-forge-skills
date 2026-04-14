# Webhooks & Events: Handling Confluence Events

This guide covers triggers (webhook modules) in Forge apps for Confluence - allowing your app to react to events like page creation, updates, and deletions.

---

## Overview

Forge triggers enable your app to receive notifications when specific events occur in Confluence. Unlike polling with scheduled triggers, trigger modules provide real-time event handling.

```yaml
modules:
  trigger:
    - key: page-created-handler
      event: avi:confluence:created:page
      function: onPageCreated
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
| `avi:confluence:viewed:page` | Page viewed | Page |
| `avi:confluence:trashed:page` | Page moved to trash | Page |
| `avi:confluence:restored:page` | Page restored from trash | Page |
| `avi:confluence:deleted:page` | Page permanently deleted | Page |
| `avi:confluence:created:blogpost` | New blog post published | Blog Post |
| `avi:confluence:updated:blogpost` | Blog post updated | Blog Post |
| `avi:confluence:deleted:blogpost` | Blog post moved to trash | Blog Post |

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
| `avi:confluence:created:space:V2` | New space created | `read:space:confluence` |
| `avi:confluence:created:user` | User created | `read:confluence-user` |
| `avi:confluence:created:group` | Group created | `read:confluence-groups` |



---

## Webhook Payload Structure

### Page Created Event Payload

```json
{
  "event": "avi:confluence:page:created",
  "issueId": null,
  "data": {
    "space": {
      "id": 178263459270,
      "key": "~username",
      "name": "Personal Space"
    },
    "content": {
      "id": "123456789",
      "title": "My New Page",
      "type": "page",
      "status": "current",
      "createdDate": "2024-01-15T10:30:00.000Z",
      "lastModified": "2024-01-15T10:30:00.000Z",
      "author": {
        "accountId": "5b10a2844c20165700ede21g"
      },
      "body": {
        "storage": {
          "value": "<p>Page content here</p>",
          "representation": "storage",
          "width": 100
        }
      }
    },
    "user": {
      "accountId": "5b10a2844c20165700ede21g",
      "displayName": "John Doe"
    },
    "url": "/spaces/~username/pages/123456789/My-New-Page"
  }
}
```

### Page Updated Event Payload

```json
{
  "event": "avi:confluence:page:updated",
  "issueId": null,
  "data": {
    "space": {
      "id": 178263459270,
      "key": "~username",
      "name": "Personal Space"
    },
    "content": {
      "id": "123456789",
      "title": "My Updated Page",
      "type": "page",
      "status": "current",
      "createdDate": "2024-01-15T10:30:00.000Z",
      "lastModified": "2024-01-15T11:45:00.000Z",
      "author": {
        "accountId": "5b10a2844c20165700ede21g"
      },
      "version": {
        "number": 3,
        "message": "Updated content"
      }
    },
    "user": {
      "accountId": "5b10a2844c20165700ede21g",
      "displayName": "John Doe"
    },
    "url": "/spaces/~username/pages/123456789/My-Updated-Page"
  }
}
```

### Page Deleted Event Payload

```json
{
  "event": "avi:confluence:page:deleted",
  "issueId": null,
  "data": {
    "space": {
      "id": 178263459270,
      "key": "~username"
    },
    "content": {
      "id": "123456789",
      "title": "Deleted Page",
      "type": "page"
    }
  }
}
```

---

## Webhook Handler Implementation

### Basic Handler Structure

```javascript
// src/webhook-handlers/page-created.js

export default async function handler(req, res) {
  const { event, data } = req.body;

  console.log(`Received event: ${event}`);

  try {
    switch (event) {
      case 'avi:confluence:page:created':
        await handlePageCreated(data);
        break;
        
      case 'avi:confluence:page:updated':
        await handlePageUpdated(data);
        break;
        
      case 'avi:confluence:page:deleted':
        await handlePageDeleted(data);
        break;
        
      default:
        console.log(`Unhandled event type: ${event}`);
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Webhook handler error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
}

async function handlePageCreated(data) {
  const { content, space, user } = data;

  console.log(`New page created: ${content.title}`);
  console.log(`Space: ${space.key}`);
  console.log(`Author: ${user.displayName}`);

  // Your custom logic here
  // e.g., sync to external system, add labels, send notifications
  
  // Example: Add default label to new page
  await addDefaultLabel(content.id, 'synced', data.token);
}

async function handlePageUpdated(data) {
  const { content, space } = data;

  console.log(`Page updated: ${content.title}`);
  console.log(`Version: ${content.version?.number}`);

  // Skip if this is just a minor revision (no significant change)
  if (content.version?.message?.includes('minor edit')) {
    return;
  }

  // Your update logic here
}

async function handlePageDeleted(data) {
  const { content, space } = data;

  console.log(`Page deleted: ${content.title}`);
  
  // Clean up external data, remove sync records, etc.
}

import { route } from '@forge/api';
import { requestConfluence } from '@forge/bridge';

async function addDefaultLabel(pageId, label) {
  try {
    const response = await requestConfluence(
      route`/wiki/api/v2/pages/${pageId}/labels`,
      { 
        method: 'POST',
        body: JSON.stringify([{ prefix: 'global', name: label }])
      }
    );

    if (!response.ok) {
      console.error('Failed to add label:', response.statusText);
    }
  } catch (error) {
    console.error('Failed to add label:', error);
  }
}
```

---

## Webhook Filtering

Filter webhooks to only trigger for specific conditions:

```yaml
modules:
  trigger:
    - destination: filtered-page-handler
      event: avi:confluence:page:created
      filter: |
        # Only trigger for pages in specific space
        data.space.key == "PROJ"
        
    - destination: labeled-pages-handler
      event: avi:confluence:page:updated  
      filter: |
        # Trigger when specific label is added/removed
        contains(data.content.labels, 'sync-required')
```

### Filter Expression Syntax

| Operator | Description | Example |
|----------|-------------|---------|
| `==` | Equality | `data.space.key == "PROJ"` |
| `!=` | Not equal | `data.content.type != "blogpost"` |
| `>` `<` | Comparison | `data.content.version.number > 5` |
| `contains()` | Contains check | `contains(data.content.labels, 'sync')` |
| `&&` | AND | `a == 1 && b == 2` |
| `\|\|` | OR | `a == 1 \|\| a == 2` |

---

## Handling Page Updates (Version Detection)

Detect if an update is significant or just a minor revision:

```javascript
async function handlePageUpdated(data) {
  const { content } = data;

  // Check version number to detect updates
  const currentVersion = content.version?.number || 1;
  
  // Fetch previous version to compare changes
  const token = await AP.context.getToken();
  const prevResponse = await api.fetch({
    url: `/wiki/api/v2/pages/${content.id}?version=0`,  // Get latest
    headers: { Authorization: `Bearer ${token}` }
  });

  if (prevResponse.ok) {
    const prevData = await prevResponse.json();
    
    // Compare content hash or body
    const currentHash = hashContent(content.body.storage.value);
    const previousHash = hashContent(prevData.body?.storage?.value || '');
    
    if (currentHash === previousHash) {
      console.log('No actual content changes, skipping sync');
      return;
    }

    // Content changed - proceed with sync
    await syncPageChanges(content);
  }
}

function hashContent(content) {
  // Simple hash for change detection
  return require('crypto')
    .createHash('md5')
    .update(content)
    .digest('hex');
}
```

---

## Rate Limiting & Backoff

Handle rate limits gracefully in logs/handlers:

```javascript
async function handlePageCreated(data) {
  const maxRetries = 3;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await performSync(data);
      return; // Success, exit retry loop
    } catch (error) {
      if (isRateLimitError(error)) {
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
        console.log(`Rate limited. Retrying in ${delay}ms...`);
        
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          throw error; // Max retries exceeded
        }
      } else {
        throw error; // Non-retryable error
      }
    }
  }
}

function isRateLimitError(error) {
  return error.status === 429 || 
         (error.response?.status === 429);
}
```

---

## Webhook Testing

### Manual Testing with Forge CLI

```bash
# Deploy logs/handler
forge deploy --verbose

# Trigger webhook manually for testing
forge trigger-webhook \
  --event avi:confluence:page:created \
  --payload '{"data":{"space":{"key":"PROJ"},"content":{"id":"123","title":"Test"}}}'
```

### Testing with Webhook Tester

```yaml
# Add a test webhook to your manifest during development
modules:
  trigger:
    - destination: test-webhook
      event: avi:confluence:page:created
      
  # Point to ngrok or webhook.site for testing
  function.scheduled:
    - key: echo-test
      resource: echo-handler
```

---

## Combining Webhooks with Scheduled Triggers

Use scheduled triggers as a fallback when webhooks might miss events:

```yaml
modules:
  # Primary: Real-time event handling
  trigger:
    - destination: page-created-handler
      event: avi:confluence:page:created
      
    - destination: page-updated-handler  
      event: avi:confluence:page:updated
  
  # Fallback: Periodic sync for missed events
  function.scheduled:
    - key: reconciliation-scheduler
      resource: reconciliation-handler
      schedule: '0 */30 * * *'  # Every 30 minutes
      
  resource:
    - key: page-created-handler
      path: src/webhooks/page-created.js
    - key: reconciliation-handler
      path: src/scheduled/reconciliation.js
```

### Reconciliation Handler Example

**Note:** This example uses `requestConfluence` from `@forge/bridge` for Confluence REST API calls, which is the recommended approach in Forge apps.

```javascript
// src/scheduled/reconciliation.js

import { requestConfluence } from '@forge/bridge';

export default async function handler() {
  // Find pages that might have been missed by webhooks
  const lastSyncTime = await getLastSyncTimestamp();
  
  try {
    // Search for recently modified pages using the Confluence API v2 search endpoint
    // The search endpoint returns results in format: { results: [{ content: { id, ... } }] }
    const response = await requestConfluence(
      `/wiki/api/v2/search?cql=type=page%20AND%20lastModified>='${lastSyncTime}'&limit=100`
    );

    if (response.ok) {
      const data = await response.json();
      
      for (const result of data.results || []) {
        // Access page ID from result structure
        const pageId = result.content?.id;
        
        if (!pageId) continue;
        
        // Check if already processed
        const isSynced = await getPageProperty(pageId, 'synced');
        
        if (!isSynced) {
          console.log(`Reconciling missed page: ${result.content?.title || pageId}`);
          await syncPageData(result.content);
        }
      }
    } else {
      console.error('Search API failed:', response.statusText);
    }
  } catch (error) {
    console.error('Reconciliation error:', error);
  }
  
  // Update last sync timestamp
  await setLastSyncTimestamp();
}

async function getLastSyncTimestamp() {
  // Retrieve from storage (Forge storage or space property)
  return '2024-01-15T10:00:00.000Z';
}

async function getPageProperty(pageId, key) {
  try {
    const response = await requestConfluence(
      `/wiki/api/v2/pages/${pageId}/properties/${key}`
    );
    
    return response.ok;
  } catch (e) {
    console.error(`Error getting property for page ${pageId}:`, e);
    return false;
  }
}

// Placeholder function - replace with your implementation
async function syncPageData(page) {
  // Your synchronization logic here
  console.log('Syncing page:', page.title);
}
```

---

## Common Patterns

### Pattern 1: Sync Page to External System

```javascript
async function syncPageToExternalSystem(pageData) {
  const { content, space } = pageData;
  
  // Fetch full page details including body
  const token = await AP.context.getToken();
  const fullResponse = await api.fetch({
    url: `/wiki/api/v2/pages/${content.id}?bodyFormat=storage`,
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!fullResponse.ok) return;
  
  const page = await fullResponse.json();
  
  // Send to external system
  await fetch('https://external-api.com/sync/page', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      confluencePageId: page.id,
      title: page.title,
      content: page.body.storage.value,
      spaceKey: space.key,
      lastModified: page.lastModified
    })
  });

  // Mark as synced
  await savePageProperty(page.id, 'synced', true, token);
}
```

### Pattern 2: Add Default Content on Page Creation

```javascript
async function handlePageCreated(data) {
  const { content } = data;
  
  // Check if page has specific label
  if (content.labels?.includes('template')) {
    // Add default macro or content
    await appendMacroToPage(content.id, 'info', {
      title: 'Auto-generated Content',
      body: 'This page was created with automated content.'
    });
  }
}

async function appendMacroToPage(pageId, macroType, params) {
  // Note: This requires write permission and careful handling
  // Consider using space settings instead of auto-modifying pages
}
```

### Pattern 3: Track Page Changes Over Time

```javascript
const changeLog = [];

async function handlePageUpdated(data) {
  const { content, user } = data;
  
  const logEntry = {
    pageId: content.id,
    pageTitle: content.title,
    version: content.version?.number,
    author: user.accountId,
    timestamp: new Date().toISOString(),
    changeMessage: content.version?.message
  };

  changeLog.push(logEntry);
  
  // Persist to space property or external storage
  await saveSpaceProperty(
    data.space.id,
    'change-log',
    changeLog.slice(-100), // Keep last 100 entries
    data.token
  );
}
```

---

## Troubleshooting

### Webhook Not Triggering

1. **Check event type**: Verify the event string is correct
2. **Verify permissions**: Ensure app has appropriate scopes
3. **Review filter expressions**: Filters might be too restrictive
4. **Check deployment**: Run `forge deploy --verbose` to confirm latest version

### Handler Errors in Logs

```bash
# View logs/handler logs
forge logs --app my-app --function page-handler
```

Common errors:
- `401 Unauthorized`: Token acquisition failed
- `429 Too Many Requests`: Rate limit exceeded (implement backoff)
- `500 Internal Error`: Handler threw uncaught exception

### Testing Locally

Forge webhooks cannot be tested locally via tunnel. Use:
1. Deploy to test environment
2. Trigger actual Confluence events (create/update pages)
3. Check logs with `forge logs`

---

## Next Steps

- [Scheduled Triggers](09-scheduled-triggers.md) - Background periodic tasks
- [Content Properties](06-content-properties.md) - Store app state with content
- [API Endpoints](08-api-endpoints.md) - Complete REST API reference