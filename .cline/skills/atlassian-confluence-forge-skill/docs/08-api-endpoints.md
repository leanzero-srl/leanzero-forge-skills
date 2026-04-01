# Confluence REST API v2 Reference

This document provides a comprehensive reference for the most commonly used Confluence REST API v2 endpoints when building Forge apps.

**Base URL:** `https://{your-domain}.atlassian.net/wiki/api/v2`

---

## Authentication

All API calls from Forge use OAuth 2.0 (3LO) or JWT tokens obtained via the Bridge API:

```javascript
import AP from '@atlaskit/platform-api-bridge';

// Get access token for Confluence REST API
const token = await AP.context.getToken({
  scope: ['read:page:confluence', 'write:page:confluence']
});

// Make authenticated request
const response = await fetch('https://mycompany.atlassian.net/wiki/api/v2/pages/123456', {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});
```

---

## Pages API

### Get Page by ID

```http
GET /pages/{id}
```

**Parameters:**
| Name | Location | Type | Required | Description |
|------|----------|------|----------|-------------|
| id | path | integer | Yes | Page ID |
| body-format | query | string | No | Return format: `storage`, `view`, `editor` (default: `storage`) |

**Example Response:**
```json
{
  "id": 123456,
  "type": "page",
  "status": "current",
  "title": "My Page",
  "body": {
    "storage": {
      "value": "<h1>Page Content</h1>",
      "representation": "STORAGE"
    }
  },
  "version": {
    "number": 5,
    "by": { "accountId": "5b10a2844c4e47f36d8c3..." },
    "when": "2024-01-15T10:30:00.000+0000"
  },
  "space": {
    "id": 987654,
    "key": "DEV",
    "name": "Development"
  }
}
```

### Get Pages (List/Search)

```http
GET /pages
```

**Parameters:**
| Name | Location | Type | Required | Description |
|------|----------|------|----------|-------------|
| limit | query | integer | No | Max results (default: 25, max: 250) |
| cursor | query | string | No | Pagination cursor from `next` URL |
| sort | query | string | No | Sort field: `lastUpdated`, `created` |
| space-id | query | integer | No | Filter by space ID |
| parent-id | query | integer | No | Filter by parent page ID |

### Create Page

```http
POST /pages
Content-Type: application/json
```

**Request Body:**
```json
{
  "type": "page",
  "title": "New Page Title",
  "body": {
    "storage": {
      "value": "<h1>Page Content</h1><p>This is the page body.</p>",
      "representation": "STORAGE"
    }
  },
  "space": {
    "id": 987654
  },
  "parentId": 123456  // Optional: parent page ID
}
```

### Update Page

```http
PUT /pages/{id}
Content-Type: application/json
```

**Request Body:**
```json
{
  "title": "Updated Title",
  "body": {
    "storage": {
      "value": "<h1>Updated Content</h1>",
      "representation": "STORAGE"
    }
  },
  "version": {
    "message": "Updated content via Forge app"
  }
}
```

### Delete Page

```http
DELETE /pages/{id}
```

Moves the page to trash (soft delete).

---

## Blog Posts API

### Get Blog Post by ID

```http
GET /blogposts/{id}
```

Similar parameters to pages.

### Create Blog Post

```http
POST /blogposts
Content-Type: application/json
```

**Request Body:**
```json
{
  "type": "blogpost",
  "title": "Blog Post Title",
  "body": {
    "storage": {
      "value": "<h1>Post Content</h1>",
      "representation": "STORAGE"
    }
  },
  "space": {
    "id": 987654
  }
}
```

---

## Spaces API

### Get Space by Key

```http
GET /spaces/{space-key}
```

**Example Response:**
```json
{
  "id": 987654,
  "key": "DEV",
  "name": "Development",
  "type": "global"
}
```

### Get All Spaces

```http
GET /spaces
```

**Parameters:**
| Name | Location | Type | Required | Description |
|------|----------|------|----------|-------------|
| limit | query | integer | No | Max results (default: 25, max: 250) |
| cursor | query | string | No | Pagination cursor |

---

## Content Properties API

Content properties allow you to store key-value data associated with pages, blog posts, and other content types. This is the recommended way for Forge apps to persist data tied to Confluence content.

### Get Content Properties (by Key)

```http
GET /pages/{page-id}/properties?key={property-key}
```

**Example Response:**
```json
{
  "results": [
    {
      "id": 789012,
      "key": "myapp:syncStatus",
      "value": "{\"status\":\"synced\",\"lastSync\":\"2024-01-15T10:30:00Z\"}",
      "contentType": {
        "id": 123456,
        "type": "page"
      }
    }
  ]
}
```

### Create Content Property

```http
POST /pages/{page-id}/properties
Content-Type: application/json
```

**Request Body:**
```json
{
  "key": "myapp:dataKey",
  "value": "{\"custom\":\"data\",\"number\":42}"
}
```

### Update Content Property (by ID)

```http
PUT /pages/{page-id}/properties/{property-id}
Content-Type: application/json
```

**Request Body:**
```json
{
  "key": "myapp:dataKey",
  "value": "{\"custom\":\"updated data\",\"number\":100}"
}
```

### Delete Content Property

```http
DELETE /pages/{page-id}/properties/{property-id}
```

---

## Labels API

### Get Page Labels

```http
GET /pages/{id}/labels
```

**Parameters:**
| Name | Location | Type | Required | Description |
|------|----------|------|----------|-------------|
| prefix | query | string | No | Filter by prefix: `my`, `team`, `global`, `system` |

### Add Label to Page

```http
POST /pages/{id}/labels
Content-Type: application/json
```

**Request Body:**
```json
{
  "prefix": "team",
  "name": "engineering"
}
```

### Delete Label from Page

```http
DELETE /pages/{id}/labels/{label-id}
```

---

## Users API

### Get Current User

```http
GET /current-user
```

**Example Response:**
```json
{
  "accountId": "5b10a2844c4e47f36d8c3...",
  "displayName": "John Doe",
  "emailAddress": "john.doe@example.com"
}
```

### Get User by Account ID

```http
GET /users/{account-id}
```

---

## Attachments API

### Get Page Attachments

```http
GET /pages/{id}/attachments
```

**Parameters:**
| Name | Location | Type | Required | Description |
|------|----------|------|----------|-------------|
| limit | query | integer | No | Max results (default: 50, max: 250) |
| filename | query | string | No | Filter by filename |

### Upload Attachment to Page

```http
POST /pages/{id}/attachments
Content-Type: multipart/form-data
```

**Form Data:**
- `file`: Binary file data
- `filename`: String (optional, defaults to original name)

---

## Comments API

### Get Page Comments

```http
GET /pages/{id}/comments
```

### Add Comment to Page

```http
POST /pages/{id}/comments
Content-Type: application/json
```

**Request Body:**
```json
{
  "body": {
    "storage": {
      "value": "<p>Comment text here</p>",
      "representation": "STORAGE"
    }
  }
}
```

---

## Common Response Codes

| Code | Description |
|------|-------------|
| `200` | Success (GET, PUT) |
| `201` | Created (POST) |
| `204` | No Content (DELETE) |
| `400` | Bad Request - Invalid parameters |
| `401` | Unauthorized - Missing/invalid auth |
| `403` | Forbidden - Insufficient permissions |
| `404` | Not Found - Resource doesn't exist |
| `429` | Too Many Requests - Rate limited |

---

## Pagination

Most list endpoints support cursor-based pagination:

```javascript
let cursor = null;
let allResults = [];

do {
  const url = cursor 
    ? `/pages?cursor=${cursor}&limit=100`
    : '/pages?limit=100';
  
  const response = await fetch(url, { headers: authHeaders });
  const data = await response.json();
  
  allResults.push(...data.results);
  cursor = data._links?.next ? new URL(data._links.next).searchParams.get('cursor') : null;
} while (cursor);
```

---

## Rate Limiting

Confluence API uses token bucket rate limiting:

- **Read operations:** ~100 requests/second per app
- **Write operations:** ~20 requests/second per app

**Headers in response:**
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1642234567
```

**Handling 429 Too Many Requests:**
```javascript
async function fetchWithRetry(url, options, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    const response = await fetch(url, options);
    
    if (response.status !== 429) {
      return response;
    }
    
    // Exponential backoff: 1s, 2s, 4s
    const delay = Math.pow(2, i) * 1000;
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  
  throw new Error('Rate limit exceeded after retries');
}
```

---

## OAuth Scopes Reference

| Scope | Description | Use Case |
|-------|-------------|----------|
| `read:page:confluence` | Read pages | View page content |
| `write:page:confluence` | Write pages | Create/update/delete pages |
| `delete:page:confluence` | Delete pages | Remove pages |
| `read:blogpost:confluence` | Read blog posts | View blog content |
| `write:blogpost:confluence` | Write blog posts | Create/update blog posts |
| `read:space:confluence` | Read spaces | List/view spaces |
| `write:space:confluence` | Write spaces | Configure spaces |
| `read:hierarchical-content:confluence` | Read content tree | Navigate page hierarchy |
| `read:content.metadata:confluence` | Read metadata only | Lightweight operations |

---

## Utility Functions for Forge Apps

```javascript
// Helper to build API URL
function confluenceApiUrl(path) {
  const domain = AP.context.getSiteBaseUrl(); // e.g., https://mycompany.atlassian.net
  return `${domain}/wiki/api/v2${path}`;
}

// Generic fetch wrapper with auth
async function apiRequest(method, path, body = null) {
  const token = await AP.context.getToken({ scope: ['read:page:confluence'] });
  
  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  };
  
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  return fetch(confluenceApiUrl(path), options).then(res => res.json());
}

// Usage examples:
const page = await apiRequest('GET', '/pages/123456');
await apiRequest('POST', '/pages', { title: 'New Page', /* ... */ });
```

---

## See Also

- [Content Properties](06-content-properties.md) - Storing app data
- [Webhooks & Events](07-webhooks-events.md) - Event-driven updates
- [Problem Patterns](problem-patterns.md) - Common implementation patterns