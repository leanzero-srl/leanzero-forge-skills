# Confluence REST API v2 Reference

This document provides a comprehensive reference for the most commonly used Confluence REST API v2 endpoints when building Forge apps.

**Base URL:** `https://{your-domain}.atlassian.net/wiki/api/v2`

**Important**: All API calls should use Forge's proxy mechanism via `@forge/bridge` to avoid CORS issues and ensure proper authentication.

---

## Authentication

Forge apps use the `requestConfluence` method from `@forge/bridge` for all Confluence REST API calls. This handles authentication automatically and avoids CORS issues.

### Using requestConfluence (Recommended)

```javascript
import { route } from '@forge/api';
import { requestConfluence } from '@forge/bridge';

// Get page by ID
const response = await requestConfluence(route`/wiki/api/v2/pages/${pageId}`);

if (response.ok) {
  const data = await response.json();
  console.log(data);
}

// POST with body
const response = await requestConfluence(
  route`/wiki/api/v2/pages`,
  { method: 'POST', body: JSON.stringify({ title: 'New Page' }) }
);
```

### Using asUser() Context (for user-level permissions)

```javascript
import api, { route } from '@forge/api';

const response = await api.asUser().requestConfluence(
  route`/wiki/api/v2/pages/${pageId}?body-format=storage`
);

if (response.ok) {
  const page = await response.json();
}
```

### Traditional Token Method (Legacy)

If you need to use traditional token-based authentication:

```javascript
import { useEffect, useState } from 'react';
import { AP } from '@atlaskit/platform-api-bridge';

export default function MyComponent() {
  const [token, setToken] = useState(null);

  useEffect(() => {
    AP.context.getToken({ scope: ['read:page:confluence'] })
      .then(setToken)
      .catch(console.error);
  }, []);

  async function fetchPage(pageId) {
    if (!token) return null;
    
    // Remove trailing slashes from base URL to avoid duplicate slashes
    const baseUrl = AP.context.getSiteBaseUrl().replace(/\/+$/, '');
    
    try {
      const response = await fetch(
        `${baseUrl}/api/v2/pages/${pageId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      if (!response.ok) {
        console.error(`API Error ${response.status}:`, await response.text());
        return null;
      }
      
      return await response.json();
    } catch (error) {
      console.error('Fetch error:', error);
      return null;
    }
  }

  // ...
}
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

**Request Body Schema:**
```json
{
  "type": "page",
  "title": "New Page Title",
  "space": {
    "id": "987654"
  },
  "parentId": "123456", // Optional
  "body": {
    "representation": "storage",
    "value": "<h1>Page Content</h1><p>This is the page body.</p>"
  }
}
```

**Successful Response (201 Created):**
```json
{
  "id": "123456",
  "status": "current",
  "title": "New Page Title",
  "spaceId": "987654",
  "version": {
    "number": 1,
    "by": { "accountId": "..." },
    "when": "2024-01-15T10:30:00.000Z"
  },
  "body": {
    "storage": {
      "value": "<h1>Page Content</h1>...",
      "representation": "STORAGE"
    }
  }
}
```

### Update Page

```http
PUT /pages/{id}
Content-Type: application/json
```

**Request Body Schema:**
```json
{
  "title": "Updated Title",
  "body": {
    "representation": "storage",
    "value": "<h1>Updated Content</h1>"
  },
  "version": {
    "message": "Updated content via Forge app"
  }
}
```

**Successful Response (200 OK):**
Returns the updated `PageSingle` object.

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

**Request Body Schema:**
```json
{
  "type": "blogpost",
  "title": "Blog Post Title",
  "space": {
    "id": "987654"
  },
  "body": {
    "representation": "storage",
    "value": "<h1>Post Content</h1>"
  }
}
```

**Successful Response (201 Created):**
Returns the created blog post object.

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
import { route } from '@forge/api';
import { requestConfluence } from '@forge/bridge';

// Generic Confluence API wrapper (recommended)
async function confluenceRequest(path, options = {}) {
  const response = await requestConfluence(route`${path}`, options);
  
  if (!response.ok) {
    throw new Error(`Confluence API error: ${response.status} ${response.statusText}`);
  }
  
  return response.json();
}

// Usage examples:
const page = await confluenceRequest(`/wiki/api/v2/pages/${pageId}`);

// POST with body
await confluenceRequest(
  '/wiki/api/v2/pages',
  { method: 'POST', body: JSON.stringify({ title: 'New Page' }) }
);

// Using asUser context (for user-level permissions)
import api, { route } from '@forge/api';

async function confluenceAsUser(path, options = {}) {
  const response = await api.asUser().requestConfluence(route`${path}`, options);
  
  if (!response.ok) {
    throw new Error(`Confluence API error: ${response.status}`);
  }
  
  return response.json();
}
```

---

## See Also

- [Content Properties](06-content-properties.md) - Storing app data
- [Webhooks & Events](07-webhooks-events.md) - Event-driven updates
- [Problem Patterns](problem-patterns.md) - Common implementation patterns