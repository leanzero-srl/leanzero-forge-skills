---
name: confluence-api-skill
description: Atlassian Confluence REST API v2. Use when integrating with Confluence Cloud via REST endpoints for content management, spaces, pages, blog posts, attachments, and labels.
---

# Atlassian Confluence REST API v2

This skill provides documentation for integrating with Confluence Cloud using the REST API v2.

## When to Use This Skill

**Use this skill when:**
- You need to integrate with **Confluence Cloud** via REST APIs
- You are building external applications that interact with Confluence content
- You need to perform CRUD operations on pages, blog posts, spaces, attachments
- You require programmatic access to Confluence data from non-Forge systems

**Do NOT use this skill when:**
- You are developing Forge apps (use `atlassian-confluence-forge-skill` instead)
- You need custom UI extensions within Confluence (Forge modules)
- You are building for Jira Cloud (use `jira-api-skill` instead)

---

## What This Skill Covers

This skill covers:

- **Content Management**: CRUD operations for pages, blog posts, and attachments
- **Space Operations**: Create, update, delete spaces and manage permissions
- **Labels & Metadata**: Add/remove labels, manage content properties
- **User & Permission Management**: Query users, check permissions, group membership
- **Version History**: Retrieve version history, compare versions, restore content
- **Search & Query**: Search content using CQL (Confluence Query Language)
- **REST API Endpoints**: Complete reference for `/wiki/api/v2` endpoints

---

## API Base URL

```
https://{your-domain}.atlassian.net/wiki/api/v2
```

Example: `https://mycompany.atlassian.net/wiki/api/v2/pages`

### Authentication Options

| Method | Use Case |
|--------|----------|
| OAuth 2.0 (3LO) | User authorization flow |
| JWT | Server-to-server authentication |
| Personal Access Token | Development/testing only |

---

## Quick Reference: Common Endpoints

| Task | Endpoint | Method |
|------|----------|--------|
| Get page by ID | `/wiki/api/v2/pages/{pageId}` | GET |
| Create page | `/wiki/api/v2/pages` | POST |
| Update page | `/wiki/api/v2/pages/{pageId}` | PUT |
| Delete page | `/wiki/api/v2/pages/{pageId}` | DELETE |
| Get space | `/wiki/api/v2/spaces/{spaceKey}` | GET |
| List pages in space | `/wiki/api/v2/spaces/{spaceKey}/pages` | GET |
| Upload attachment | `/wiki/api/v2/pages/{pageId}/attachments` | POST |
| Add label to content | `/wiki/api/v2/content/{contentId}/labels` | POST |
| Search content | `/wiki/api/v2/pages/search` | GET |

---

## Request/Response Examples

### Get a Page

```http
GET /wiki/api/v2/pages/123456 HTTP/1.1
Host: {your-domain}.atlassian.net
Authorization: Bearer <token>
Accept: application/json
```

**Response (200 OK):**
```json
{
  "id": "123456",
  "type": "page",
  "status": "current",
  "title": "My Page",
  "space": {
    "id": 987654,
    "key": "PROJ",
    "name": "Project Space"
  },
  "body": {
    "storage": {
      "value": "<p>Page content</p>",
      "representation": "storage"
    }
  },
  "_links": {
    "webui": "/spaces/PROJ/pages/123456/My+Page",
    "self": "https://my.atlassian.net/wiki/api/v2/pages/123456"
  }
}
```

### Create a Page

```http
POST /wiki/api/v2/pages HTTP/1.1
Host: {your-domain}.atlassian.net
Authorization: Bearer <token>
Content-Type: application/json
Accept: application/json

{
  "spaceId": 987654,
  "title": "New Page",
  "body": {
    "storage": {
      "value": "<p>This is the page content</p>",
      "representation": "storage"
    }
  },
  "ancestors": [
    {"id": 111111}
  ]
}
```

### Search with CQL

```http
GET /wiki/api/v2/pages/search?cql=space=PROJ+AND+type=page HTTP/1.1
Host: {your-domain}.atlassian.net
Authorization: Bearer <token>
Accept: application/json
```

---

## Documentation Index

### Core Concepts
| Topic | File |
|-------|------|
| API Overview & Authentication | `docs/01-core-concepts.md` |
| Error Handling & Rate Limits | `docs/problem-patterns.md` |

### Content Management
| Topic | File |
|-------|------|
| Pages (CRUD) | `docs/02-page-custom-ui.md` |
| Blog Posts | `docs/04-blogpost-custom-ui.md` |
| Attachments | `docs/attachment-management.md` |
| Labels | `docs/09-labels-management.md` |

### Space Management
| Topic | File |
|-------|------|
| Spaces & Permissions | `docs/10-user-permissions.md` |

### User & Security
| Topic | File |
|-------|------|
| Users & Groups | `docs/10-user-permissions.md` |
| Permissions | `docs/07-permissions-scopes.md` |

### Advanced Topics
| Topic | File |
|-------|------|
| Version History | `docs/11-version-history.md` |
| Content Properties | `docs/06-content-properties.md` |
| Webhooks & Events | `docs/07-webhooks-events.md` |

---

## Available Templates

| Template | Description | Use Case |
|----------|-------------|----------|
| `page-custom-ui.yml` | REST API call patterns for page operations | Create/update pages via API |
| `webhook-handler.yml` | Webhook event handling | Receive Confluence events |
| `scheduled-trigger.yml` | Scheduled API tasks | Periodic content sync |
| `content-property-storage.yml` | Content properties API | Store app data with content |

---

## Authentication

### OAuth 2.0 (3LO)

```bash
# Authorization URL
https://auth.atlassian.com/authorize?client_id=YOUR_CLIENT_ID&scope=read%3Aconfluence-content.summary&redirect_uri=https://YOUR_REDIRECT_URI&state=UNIQUE_STATE&response_type=code&prompt=consent

# Exchange code for token
curl -X POST https://auth.atlassian.com/oauth/token \
  -H 'Content-Type: application/json' \
  -d '{
    "client_id": "YOUR_CLIENT_ID",
    "client_secret": "YOUR_CLIENT_SECRET",
    "code": "AUTHORIZATION_CODE",
    "grant_type": "authorization_code"
  }'
```

### JWT Authentication

```javascript
import jwt from 'jsonwebtoken';

const token = jwt.sign(
  {
    iss: 'YOUR_CLIENT_ID',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 60,
    qsh: 'QUERY_STRING_HASH'
  },
  'YOUR_CLIENT_SECRET'
);
```

---

## Common CLI Commands

### cURL Examples

```bash
# Get a page
curl -H "Authorization: Bearer <token>" \
  https://{your-domain}.atlassian.net/wiki/api/v2/pages/123456

# Create a page
curl -X POST \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"spaceId":987654,"title":"New Page","body":{"storage":{"value":"<p>Content</p>","representation":"storage"}}}' \
  https://{your-domain}.atlassian.net/wiki/api/v2/pages

# Search content
curl -H "Authorization: Bearer <token>" \
  "https://{your-domain}.atlassian.net/wiki/api/v2/pages/search?cql=space=PROJ"
```

---

## Error Handling

| Status Code | Meaning |
|-------------|---------|
| 401 | Unauthorized - invalid/missing token |
| 403 | Forbidden - insufficient permissions |
| 404 | Not Found - resource doesn't exist |
| 429 | Rate Limited - too many requests |
| 5xx | Server error |

See `docs/problem-patterns.md` for detailed error handling patterns.

---

## Permissions & Scopes

| Scope | Description |
|-------|-------------|
| `read:confluence-content.summary` | Read content metadata |
| `read:confluence-content` | Read full content |
| `write:confluence-content` | Create/update content |
| `delete:confluence-content` | Delete content |
| `read:space:confluence` | Read spaces |
| `write:space:confluence` | Modify spaces |

---

## Support & Resources

- [Confluence REST API v2 Reference](https://developer.atlassian.com/cloud/confluence/rest/v2/)
- [Atlassian Developer Documentation](https://developer.atlassian.com/)
- [Community Forum](https://community.developer.atlassian.com/)
