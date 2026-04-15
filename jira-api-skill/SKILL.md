---
name: jira-api-skill
description: Atlassian Jira REST API v3. Use when integrating with Jira Cloud via REST endpoints for issue management, projects, workflows, users, and automation.
---

# Atlassian Jira REST API v3

This skill provides documentation for integrating with Jira Cloud using the REST API v3.

## When to Use This Skill

**Use this skill when:**
- You need to integrate with **Jira Cloud** via REST APIs
- You are building external applications that interact with Jira issues, projects, or workflows
- You require programmatic access to Jira data from non-Forge systems
- You need to create, update, search, or manage issues programmatically

**Do NOT use this skill when:**
- You are developing Forge apps (use `atlassian-jira-forge-skill` instead)
- You need workflow validators/conditions/post-functions (Forge modules)
- You are building for Confluence Cloud (use `confluence-api-skill` instead)

---

## What This Skill Covers

This skill covers:

- **Issue Management**: Create, update, delete, transition issues
- **Project Operations**: Manage projects, issue types, and project settings
- **Workflow Operations**: Get workflows, transitions, status mappings
- **User & Permission Management**: Query users, check permissions, groups
- **Search & Query**: Search using JQL (Jira Query Language)
- **Attachments & Comments**: Add attachments, create comments
- **REST API Endpoints**: Complete reference for `/rest/api/3` endpoints

---

## API Base URL

```
https://{your-domain}.atlassian.net/rest/api/3
```

Example: `https://mycompany.atlassian.net/rest/api/3/issue/PROJ-123`

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
| Get issue by key | `/rest/api/3/issue/{issueKey}` | GET |
| Create issue | `/rest/api/3/issue` | POST |
| Update issue | `/rest/api/3/issue/{issueIdOrKey}` | PUT |
| Delete issue | `/rest/api/3/issue/{issueIdOrKey}` | DELETE |
| Transition issue | `/rest/api/3/issue/{issueIdOrKey}/transitions` | POST |
| Get project | `/rest/api/3/project/{projectIdOrKey}` | GET |
| Search issues (JQL) | `/rest/api/3/search` | POST |
| Get user | `/rest/api/3/user` | GET |
| Add comment | `/rest/api/3/issue/{issueIdOrKey}/comment` | POST |

---

## Request/Response Examples

### Get an Issue

```http
GET /rest/api/3/issue/PROJ-123 HTTP/1.1
Host: {your-domain}.atlassian.net
Authorization: Bearer <token>
Accept: application/json
```

**Response (200 OK):**
```json
{
  "key": "PROJ-123",
  "id": "123456",
  "fields": {
    "summary": "Issue Summary",
    "status": {
      "name": "To Do"
    },
    "issuetype": {
      "name": "Bug"
    },
    "project": {
      "key": "PROJ",
      "name": "Project Name"
    }
  }
}
```

### Create an Issue

```http
POST /rest/api/3/issue HTTP/1.1
Host: {your-domain}.atlassian.net
Authorization: Bearer <token>
Content-Type: application/json
Accept: application/json

{
  "fields": {
    "project": {"key": "PROJ"},
    "summary": "New Issue",
    "description": "Issue description",
    "issuetype": {"name": "Task"}
  }
}
```

### Search Issues with JQL

```http
POST /rest/api/3/search HTTP/1.1
Host: {your-domain}.atlassian.net
Authorization: Bearer <token>
Content-Type: application/json
Accept: application/json

{
  "jql": "project = PROJ AND status = 'In Progress'",
  "maxResults": 50,
  "fields": ["summary", "status", "assignee"]
}
```

---

## Documentation Index

### Core Concepts
| Topic | File |
|-------|------|
| API Overview & Authentication | `docs/01-core-concepts.md` |
| Error Handling & Rate Limits | `docs/problem-patterns.md` |

### Issue Management
| Topic | File |
|-------|------|
| Issues (CRUD) | `docs/02-ui-modifications.md` |
| Workflows & Transitions | `docs/02-workflow-validators.md` |
| Comments & Attachments | `docs/03-workflow-conditions.md` |

### Search & Query
| Topic | File |
|-------|------|
| JQL Search | `docs/06-api-endpoints-enhanced.md` |

### Project Management
| Topic | File |
|-------|------|
| Projects | `docs/12-dashboard-widgets.md` |
| Issue Types | `docs/14-content-properties.md` |

### User & Security
| Topic | File |
|-------|------|
| Users & Groups | `docs/07-permissions-scopes.md` |
| Permissions | `docs/07-permissions-scopes.md` |

---

## Available Templates

| Template | Description | Use Case |
|----------|-------------|----------|
| `webhook-handler.yml` | Webhook event handling | Receive Jira events |
| `scheduled-trigger.yml` | Scheduled API tasks | Periodic sync operations |
| `bulk-operation.yml` | Batch processing patterns | Handle multiple issues efficiently |

---

## Authentication

### OAuth 2.0 (3LO)

```bash
# Authorization URL
https://auth.atlassian.com/authorize?client_id=YOUR_CLIENT_ID&scope=read%3Ajira-work&redirect_uri=https://YOUR_REDIRECT_URI&state=UNIQUE_STATE&response_type=code&prompt=consent

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
# Get an issue
curl -H "Authorization: Bearer <token>" \
  https://{your-domain}.atlassian.net/rest/api/3/issue/PROJ-123

# Create an issue
curl -X POST \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"fields":{"project":{"key":"PROJ"},"summary":"New Issue","issuetype":{"name":"Task"}}}' \
  https://{your-domain}.atlassian.net/rest/api/3/issue

# Search issues
curl -X POST \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"jql":"project = PROJ","maxResults":50}' \
  https://{your-domain}.atlassian.net/rest/api/3/search
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
| `read:jira-work` | Read issues, projects, workflows |
| `write:jira-work` | Create/update issues |
| `delete:jira-work` | Delete issues |
| `read:jira-project` | Read project metadata |
| `write:jira-project` | Modify projects |

---

## Support & Resources

- [Jira REST API v3 Reference](https://developer.atlassian.com/cloud/jira/platform/rest/v3/)
- [Jira Query Language (JQL)](https://support.atlassian.com/jira-cloud-administration/docs/use-advanced-search-with-jira-query-language-jql/)
- [Atlassian Developer Documentation](https://developer.atlassian.com/)
- [Community Forum](https://community.developer.atlassian.com/)
