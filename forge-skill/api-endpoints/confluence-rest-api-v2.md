# Confluence Cloud REST API v2 Reference for Forge Apps

This guide provides comprehensive documentation for Confluence Cloud REST API v2 endpoints. All API calls use the `/wiki/rest/api` base path.

## Table of Contents
1. [Authentication](#authentication)
2. [Content Operations](#content-operations)
3. [Space Operations](#space-operations)
4. [Comment Operations](#comment-operations)
5. [Attachment Operations](#attachment-operations)
6. [User & Permission Operations](#user--permission-operations)
7. [Search Operations](#search-operations)

---

## Authentication

Confluence API requires authentication using an API token or OAuth 2.0.

```javascript
import api from '@forge/api';

// Forge runtime handles authentication automatically when using api.asApp() or api.asUser()
const response = await api.asApp().requestJira(
  '/wiki/rest/api/content/123456'
);
```

**Authentication Headers:**
```javascript
{
  "Authorization": "Bearer <access_token>",
  "Accept": "application/json",
  "Content-Type": "application/json"
}
```

---

## Content Operations

### Get Page/Content Details

Retrieve a page or content item by ID.

```javascript
const response = await api.asApp().requestJira(
  '/wiki/rest/api/content/${contentId}',
  {
    method: 'GET',
    query: {
      expand: 'body.storage,version,ancestors,children.page'
    }
  }
);

const data = await response.json();
console.log(`Page: ${data.title}`);
```

**Query Parameters:**
| Field | Type | Description |
|-------|------|-------------|
| `expand` | string | Comma-separated list to expand |
| `status` | string | Filter by status (current, archived, trashed) |
| `version` | number | Specific version number |

**Expand Options:**
- `body.storage` - Content in storage format (HTML)
- `body.view` - Content in view format
- `version` - Version information
- `ancestors` - Parent page information
- `children.page` - Child pages

### List Pages/Content

```javascript
const response = await api.asApp().requestJira(
  '/wiki/rest/api/content',
  {
    method: 'GET',
    query: {
      spaceKey: 'DOCS',
      start: 0,
      limit: 25,
      expand: 'body.storage'
    }
  }
);

const data = await response.json();
data.results.forEach(page => {
  console.log(`${page.title} (${page.id})`);
});
```

**Query Parameters:**
| Field | Type | Description |
|-------|------|-------------|
| `spaceKey` | string | Filter by space key (required) |
| `start` | number | Pagination start index (default: 0) |
| `limit` | number | Results per page (default: 25, max: 100) |
| `expand` | string | Fields to expand |
| `status` | string | Filter by status |
| `type` | string | Filter by content type |

### Create Page/Content

```javascript
await api.asApp().requestJira('/wiki/rest/api/content', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    type: 'page',
    title: 'New Page Title',
    space: { key: 'DOCS' },
    ancestors: [{ id: '123456789' }],
    status: 'current',
    body: {
      storage: {
        value: '<p>This is the page content.</p>',
        representation: 'storage'
      }
    }
  })
});
```

**Request Body Fields:**
| Field | Type | Description |
|-------|------|-------------|
| `type` | string | Content type ('page', 'blogpost', 'comment') |
| `title` | string | Page title (required) |
| `space.key` | string | Space key (required) |
| `ancestors.id` | string | Parent page ID for hierarchy |
| `body.storage.value` | string | HTML content in storage format |
| `status` | string | Content status ('current', 'draft') |

### Update Page/Content

```javascript
// First, get the current version
const existing = await api.asApp().requestJira(
  `/wiki/rest/api/content/${contentId}`,
  { query: { expand: 'version' } }
);

const data = await existing.json();

await api.asApp().requestJira(`/wiki/rest/api/content/${contentId}`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    id: contentId,
    type: 'page',
    title: 'Updated Title',
    space: { key: 'DOCS' },
    version: { number: data.version.number + 1, message: 'Update description' },
    status: 'current',
    body: {
      storage: {
        value: '<p>Updated content</p>',
        representation: 'storage'
      }
    }
  })
});
```

**Important:** Include the current version number in your update.

### Delete Page/Content

```javascript
await api.asApp().requestJira(
  `/wiki/rest/api/content/${contentId}?status=current`,
  { method: 'DELETE' }
);
```

### Archive Page

```javascript
await api.asApp().requestJira(`/wiki/rest/api/content/${contentId}`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    status: 'archived'
  })
});
```

---

## Space Operations

### Get Space Details

```javascript
await api.asApp().requestJira(
  `/wiki/rest/api/space/${spaceKey}`,
  {
    query: {
      expand: 'description.plain,homepage,permissions'
    }
  }
);
```

### List Spaces

```javascript
const response = await api.asApp().requestJira(
  '/wiki/rest/api/space',
  {
    method: 'GET',
    query: {
      start: 0,
      limit: 25,
      expand: 'description.plain'
    }
  }
);

const data = await response.json();
data.results.forEach(space => {
  console.log(`${space.name} (${space.key})`);
});
```

**Query Parameters:**
| Field | Type | Description |
|-------|------|-------------|
| `start` | number | Pagination start index |
| `limit` | number | Results per page (default: 25) |
| `expand` | string | Fields to expand |
| `type` | string | Filter by space type ('global', 'personal') |

### Create Space

```javascript
await api.asApp().requestJira('/wiki/rest/api/space', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    key: 'NEWSPACE',
    name: 'New Space Name',
    description: { plain: { value: 'Space description' } },
    type: 'global'
  })
});
```

**Request Body Fields:**
| Field | Type | Description |
|-------|------|-------------|
| `key` | string | Space key (required, uppercase) |
| `name` | string | Space name (required) |
| `description.plain.value` | string | Space description |
| `type` | string | Space type ('global' or 'personal') |

### Update Space

```javascript
await api.asApp().requestJira(`/wiki/rest/api/space/${spaceKey}`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'Updated Space Name',
    description: { plain: { value: 'Updated description' } }
  })
});
```

---

## Comment Operations

### Get Comments

```javascript
await api.asApp().requestJira(
  `/wiki/rest/api/content/${contentId}/child/comment`,
  {
    method: 'GET',
    query: {
      expand: 'body.storage,version'
    }
  }
);
```

### Add Comment

```javascript
await api.asApp().requestJira(
  `/wiki/rest/api/content/${parentId}/child/comment`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'comment',
      body: {
        storage: {
          value: '<p>This is a comment.</p>',
          representation: 'storage'
        }
      },
      container: { id: parentId, type: 'page', status: 'current' }
    })
  }
);
```

### Update Comment

```javascript
await api.asApp().requestJira(`/wiki/rest/api/content/${commentId}`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    id: commentId,
    type: 'comment',
    version: { number: 2, message: 'Update description' },
    body: {
      storage: {
        value: '<p>Updated comment.</p>',
        representation: 'storage'
      }
    }
  })
});
```

### Delete Comment

```javascript
await api.asApp().requestJira(
  `/wiki/rest/api/content/${commentId}`,
  { method: 'DELETE' }
);
```

---

## Attachment Operations

### Get Attachments

```javascript
const response = await api.asApp().requestJira(
  `/wiki/rest/api/content/${contentId}/child/attachment`,
  {
    query: {
      expand: 'body.storage'
    }
  }
);

const data = await response.json();
data.results.forEach(attachment => {
  console.log(`${attachment.title} (${attachment.id})`);
});
```

### Upload Attachment

```javascript
const formData = new FormData();
formData.append('file', fileBlob);
formData.append('comment', 'File comment');
formData.append('minorEdit', 'true');

await api.asApp().requestJira(
  `/wiki/rest/api/content/${contentId}/child/attachment`,
  {
    method: 'POST',
    headers: { 
      'X-Atlassian-Token': 'no-check'
    },
    body: formData
  }
);
```

### Download Attachment

```javascript
const response = await api.asApp().requestJira(
  `/wiki/rest/api/content/${contentId}/child/attachment/${attachmentId}/body`
);

const content = await response.text();
```

---

## User & Permission Operations

### Get Authenticated User

```javascript
await api.asApp().requestJira('/wiki/rest/api/user', {
  method: 'GET'
});
```

**Response includes:**
- `accountId` - User's account ID
- `displayName` - Display name
- `emailAddress` - Email address
- `active` - Whether user is active

### Get Space Permissions

```javascript
await api.asApp().requestJira(
  `/wiki/rest/api/space/${spaceKey}/permission`
);
```

### Add User to Space

```javascript
await api.asApp().requestJira(
  `/wiki/rest/api/space/${spaceKey}/permission`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      permissions: [
        {
          operation: 'VIEW',
          subject: {
            type: 'User',
            identifier: 'user-account-id'
          }
        }
      ]
    })
  }
);
```

---

## Search Operations

### Search Content

```javascript
const response = await api.asApp().requestJira(
  '/wiki/rest/api/search',
  {
    method: 'GET',
    query: {
      cql: 'type = page AND space = DOCS',
      start: 0,
      limit: 25,
      expand: 'content.body.storage'
    }
  }
);

const data = await response.json();
data.results.forEach(result => {
  console.log(`${result.content.title} (${result.content.id})`);
});
```

**CQL Examples:**
```javascript
// Pages in a space
'.type = page AND space = DOCS'

// Pages created today
'.created >= startOfDay()'

// Pages updated by me
'.lastModifiedBy = currentUser()'

// Pages with specific label
'label = priority-high'
```

---

## Error Handling

### Common HTTP Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request - Invalid parameters |
| 401 | Unauthorized |
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found |

### Error Response Format

```json
{
  "status": 400,
  "statusCode": 400,
  "message": "Content with id '123' does not exist"
}
```

### Example Error Handling

```javascript
try {
  const response = await api.asApp().requestJira(
    `/wiki/rest/api/content/${pageId}`
  );

  if (!response.ok) {
    const error = await response.json();
    console.error('Confluence API Error:', error);
    
    if (error.status === 403) {
      // Insufficient permissions
    }
    return;
  }

  const data = await response.json();
} catch (error) {
  console.error('Network Error:', error);
}
```

---

## Best Practices

1. **Use REST API v2** - This is the stable, current version
2. **Handle rate limits** - Confluence has rate limiting
3. **Batch operations** - Use bulk endpoints when available
4. **Cache results** - Reduce API calls for performance
5. **Error handling** - Always handle potential errors gracefully

---

## Forge Module Integration

For macros and page actions, prefer using Forge modules over direct REST API calls.