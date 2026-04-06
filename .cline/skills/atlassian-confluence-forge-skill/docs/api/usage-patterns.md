# Usage Patterns & Best Practices

This guide provides implementation patterns, filtering techniques, and troubleshooting tips for building robust Confluence Forge applications using webhooks, scheduled triggers, and the Confluence REST API.

---

## Webhook Handler Implementation

### Basic Handler Structure

A standard way to structure your webhook handler is to use a switch statement to route different event types to specialized functions.

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

  // Example: Add default label to new page
  await addDefaultLabel(content.id, 'synced');
}

async function handlePageUpdated(data) {
  const { content } = data;

  console.log(`Page updated: ${content.title}`);
  console.log(`Version: ${content.version?.number}`);

  // Skip if this is just a minor revision
  if (content.version?.message?.includes('minor edit')) {
    return;
  }
}

async function handlePageDeleted(data) {
  const { content } = data;
  console.log(`Page deleted: ${content.title}`);
}
```

---

## Webhook Filtering

You can optimize your app by filtering webhooks at the manifest level, ensuring your function only runs when specific conditions are met.

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
| `||` | OR | `a == 1 || a == 2` |

---

## API Implementation Patterns

### Pagination (Cursor-based)

Many Confluence API endpoints use cursor-based pagination. To retrieve all results, you must check the `Link` header for a `rel="next"` URL and follow it.

```javascript
async function fetchAllResults(initialUrl) {
  let allResults = [];
  let nextUrl = initialUrl;

  while (nextUrl) {
    const response = await api.fetch(nextUrl);
    const data = await response.json();
    
    allResults = [...allResults, ...data.results];

    // Extract the 'next' URL from the Link header
    const linkHeader = response.headers.get('Link');
    nextUrl = parseNextLink(linkHeader); 
  }

  return allResults;
}

function parseNextLink(header) {
  if (!header) return null;
  // Example format: <...>; rel="next", <...>; rel="base"
  const match = header.match(/<([^>]+)>;\s*rel="next"/);
  return match ? match[1] : null;
}
```

### Rate Limiting & Exponential Backoff

Handle `429 Too Many Requests` errors gracefully by implementing a retry mechanism with exponential backoff.

```javascript
async function performSyncWithRetry(data, attempt = 1) {
  const maxRetries = 3;
  try {
    await performSync(data);
  } catch (error) {
    if (error.status === 429 && attempt <= maxRetries) {
      const delay = Math.pow(2, attempt) * 1000;
      console.warn(`Rate limited. Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return performSyncWithRetry(data, attempt + 1);
    }
    throw error;
  }
}
```

### Handling Eventual Consistency (Reconciliation)

Webhooks are real-time but not guaranteed. Use a scheduled trigger as a fallback to ensure your app's state remains synchronized with Confluence.

```yaml
modules:
  trigger:
    - destination: page-created-handler
      event: avi:confluence:page:created
  function.scheduled:
    - key: reconciliation-scheduler
      schedule: '0 */30 * * *' # Every 30 minutes
```

---

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| **Webhook not triggering** | Verify event string, check app scopes, and review filter expressions. |
| **401 Unauthorized** | Ensure your Forge app has the correct permissions and is using `requestConfluence`. |
| **403 Forbidden** | Check if the user/app has sufficient permissions for the specific space or content. |
| **429 Rate Limited** | Implement exponential backoff in your handlers. |
| **404 Not Found** | Verify the ID is correct and that the content hasn't been deleted. |

### Testing

**Manual Trigger via Forge CLI:**
```bash
forge trigger-webhook \
  --event avi:confluence:page:created \
  --payload '{"data":{"space":{"key":"PROJ"},"content":{"id":"123","title":"Test"}}}'
```

**Viewing Logs:**
```bash
forge logs --app <app-id> --function <function-key>