# Jira Cloud REST API v2 Reference for Forge Apps

This guide provides comprehensive documentation for Jira Cloud REST API v2 endpoints. All endpoints use the `/rest/api/2` base path.

## Table of Contents
1. [Authentication](#authentication)
2. [Issue Operations](#issue-operations)
3. [Search & Query (JQL)](#search--query-jql)
4. [Workflow Operations](#workflow-operations)
5. [User & Permission Operations](#user--permission-operations)
6. [Project Operations](#project-operations)
7. [Field Operations](#field-operations)
8. [Search Results Options](#search-results-options)

---

## Authentication

All API calls require authentication using an API token or OAuth 2.0.

```javascript
import api from '@forge/api';

// Forge runtime handles authentication automatically when using api.asUser() or api.asApp()
const response = await api.asUser().requestJira('/rest/api/2/issue/PROJ-1', {
  method: 'GET'
});
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

## Issue Operations

### Get Issue

Retrieve an issue by key or ID.

```javascript
const response = await api.asUser().requestJira('/rest/api/2/issue/{issueKeyOrId}', {
  method: 'GET',
  headers: { 'Accept': 'application/json' },
  query: {
    expand: 'changelog,renderedFields,names,schema,operations,editmeta'
  }
});
```

**Query Parameters:**
- `expand` - Comma-separated list of fields to expand
- `fields` - Comma-separated list of fields to return
- `properties` - Issue properties to include
- `updateHistory` - Update issue's last view timestamp

### Create Issue

Create a new issue in Jira.

```javascript
await api.asUser().requestJira('/rest/api/2/issue', {
  method: 'POST',
  headers: { 
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    fields: {
      project: {
        key: 'PROJ'
      },
      summary: 'Issue summary text',
      description: 'Detailed issue description',
      issuetype: {
        name: 'Task'
      },
      priority: {
        id: '2'  // Priority ID
      }
    }
  })
});
```

**Required Fields:**
- `fields.project.key` - Project key or ID
- `fields.summary` - Issue summary (required)
- `fields.issuetype.name` - Issue type name

### Update Issue

Update an existing issue.

```javascript
await api.asUser().requestJira('/rest/api/2/issue/{issueKeyOrId}', {
  method: 'PUT',
  headers: { 
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    fields: {
      summary: 'Updated summary',
      description: 'Updated description'
    }
  })
});
```

**With Fields Parameter:**
```javascript
await api.asUser().requestJira('/rest/api/2/issue/{issueKeyOrId}', {
  method: 'PUT',
  body: JSON.stringify({
    fields: { summary: 'New summary' },
    update: {
      description: [{ set: 'New description' }]
    }
  })
});
```

### Delete Issue

Delete an issue from Jira.

```javascript
await api.asUser().requestJira('/rest/api/2/issue/{issueKeyOrId}', {
  method: 'DELETE'
});
```

**Query Parameters:**
- `deleteSubtasks` - Whether to delete subtasks (default: true)
- `notifyUsers` - Whether to send notifications

---

## Search & Query (JQL)

### Search Issues

Search for issues using JQL.

```javascript
await api.asUser().requestJira('/rest/api/2/search', {
  method: 'POST',
  headers: { 
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    jql: 'project = PROJ AND status != Done ORDER BY created DESC',
    start: 0,
    maxResults: 50,
    fields: ['summary', 'status', 'assignee'],
    expand: 'schema,names,renderedFields'
  })
});
```

**Request Body Fields:**
| Field | Type | Description |
|-------|------|-------------|
| `jql` | string | JQL search string (required) |
| `start` | number | Index of first issue to return (default: 0) |
| `maxResults` | number | Maximum results per page (default: 50, max: 100) |
| `fields` | array | Array of field names or IDs |
| `expand` | string | Fields to expand (schema, names, renderedFields) |

**Response Structure:**
```json
{
  "startAt": 0,
  "maxResults": 50,
  "total": 123,
  "issues": [
    {
      "id": "12345",
      "key": "PROJ-123",
      "fields": { ... }
    }
  ],
  "names": { ... },
  "schema": { ... }
}
```

**Common JQL Queries:**
```javascript
// Issues assigned to me
const jql = 'assignee = currentUser()';

// Open issues in project
const jql = 'project = PROJ AND status in (Open, "In Progress")';

// Created today
const jql = 'created >= startOfDay()';

// Updated recently
const jql = 'updated >= -7d';

// High priority bugs
const jql = 'issuetype = Bug AND priority = High';

// Due date passed
const jql = 'duedate < now()';
```

### Search Results Options

Get available fields and options for search results.

```javascript
await api.asUser().requestJira('/rest/api/2/search', {
  method: 'POST',
  body: JSON.stringify({
    jql: 'project = PROJ',
    start: 0,
    maxResults: 0,
    fields: [],
    expand: 'schema,names'
  })
});
```

---

## Workflow Operations

### Get Workflow Transitions

List available transitions for an issue.

```javascript
const response = await api.asUser().requestJira(
  '/rest/api/2/issue/{issueKeyOrId}/transitions',
  { method: 'GET' }
);

const data = await response.json();
// transitions array contains available transition IDs and names
```

### Transition Issue

Perform a workflow transition.

```javascript
await api.asUser().requestJira('/rest/api/2/issue/{issueKeyOrId}/transitions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    transition: { id: '21' }
  })
});
```

**With Additional Fields:**
```javascript
await api.asUser().requestJira('/rest/api/2/issue/{issueKeyOrId}/transitions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    transition: { id: '21' },
    fields: {
      resolution: { name: 'Done' }
    }
  })
});
```

**With Comment:**
```javascript
await api.asUser().requestJira('/rest/api/2/issue/{issueKeyOrId}/transitions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    transition: { id: '21' },
        fields: {},
    update: {
      comment: [{
        add: {
          body: 'Transitioning to Done'
        }
      }]
    }
  })
});
```

### Add Comment

Add a comment to an issue.

```javascript
await api.asUser().requestJira('/rest/api/2/issue/{issueKeyOrId}/comment', {
  method: 'POST',
  headers: { 
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    body: 'This is a comment on the issue',
    visibility: {
      type: 'group',
      name: 'jira-developers'
    }
  })
});
```

**Request Body Fields:**
| Field | Type | Description |
|-------|------|-------------|
| `body` | string | Comment text (required) |
| `visibility.type` | string | Visibility type (group, role) |
| `visibility.name` | string | Group or role name |
| `renderedBody` | string | HTML comment content |

### Update Issue with Fields

Update issue fields using the fields parameter.

```javascript
await api.asUser().requestJira('/rest/api/2/issue/{issueKeyOrId}', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    fields: {
      summary: 'Updated Summary',
      description: 'Updated Description',
      priority: { id: '3' }
    }
  })
});
```

---

## User & Permission Operations

### Get User Permissions

Check what permissions the user has.

```javascript
const response = await api.asUser().requestJira('/rest/api/2/mypermissions', {
  method: 'GET',
  query: {
    projectKey: 'PROJ',
    issueKey: 'PROJ-123'
  }
});

const data = await response.json();
console.log(data.permissions);
```

**Query Parameters:**
| Field | Type | Description |
|-------|------|-------------|
| `projectKey` | string | Project key to check permissions in |
| `issueKey` | string | Issue key to check permissions on |

### Get Permissions Scheme

List permission schemes.

```javascript
await api.asUser().requestJira('/rest/api/2/permissionscheme', {
  method: 'GET',
  query: { startAt: 0, maxResults: 50 }
});
```

### Get Issue Security Levels

Retrieve issue security levels for a project.

```javascript
const response = await api.asUser().requestJira(
  '/rest/api/2/project/{projectIdOrKey}/securitylevel',
  { method: 'GET' }
);
```

---

## Project Operations

### List Projects

Get all projects accessible to the user.

```javascript
await api.asUser().requestJira('/rest/api/2/project', {
  method: 'GET',
  query: {
    startAt: 0,
    maxResults: 50,
    expand: 'description,lead,assigneeType,components'
  }
});
```

### Get Project

Retrieve project details.

```javascript
await api.asUser().requestJira('/rest/api/2/project/{projectIdOrKey}', {
  method: 'GET',
  query: { expand: 'description,lead,assigneeType' }
});
```

**Query Parameters:**
| Field | Type | Description |
|-------|------|-------------|
| `expand` | string | Comma-separated list to expand |

### Get Project Components

List components for a project.

```javascript
await api.asUser().requestJira(
  '/rest/api/2/project/{projectIdOrKey}/components',
  { method: 'GET' }
);
```

---

## Field Operations

### List Fields

Get all available fields in Jira.

```javascript
const response = await api.asUser().requestJira('/rest/api/2/field', {
  method: 'GET',
  query: { startAt: 0, maxResults: 100 }
});

const fields = await response.json();
// Each field contains id, name, schema information
```

### Get Field

Retrieve details about a specific field.

```javascript
await api.asUser().requestJira('/rest/api/2/field/{fieldId}', {
  method: 'GET'
});
```

**Common Field IDs:**
| ID | Description |
|----|-------------|
| `summary` | Issue summary |
| `description` | Issue description |
| `project` | Project field |
| `issuetype` | Issue type |
| `priority` | Priority |
| `assignee` | Assignee user |
| `reporter` | Reporter user |
| `labels` | Issue labels |
| `components` | Issue components |

### Get Field Options

Get available options for select fields (dropdowns, checkboxes).

```javascript
await api.asUser().requestJira(
  '/rest/api/2/field/{fieldId}/option',
  { method: 'GET' }
);
```

---

## Error Handling

### Common HTTP Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request - Invalid parameters |
| 401 | Unauthorized - Invalid or missing API token |
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found - Resource doesn't exist |

### Error Response Format

```json
{
  "errorMessages": ["Issue with key PROJ-123 does not exist"],
  "errors": {
    "summary": "Summary is required",
    "assignee": "Assignee must be a valid user"
  }
}
```

### Example Error Handling in Forge

```javascript
try {
  const response = await api.asUser().requestJira('/rest/api/2/issue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { summary: 'Test', issuetype: { name: 'Task' } } })
  });

  if (!response.ok) {
    const error = await response.json();
    console.error('API Error:', error);
    
    if (response.status === 401) {
      // Token expired or invalid
    } else if (response.status === 403) {
      // Insufficient permissions
    }
    return;
  }

  const issue = await response.json();
} catch (error) {
  console.error('Network Error:', error);
}
```

---

## API v2 vs v3 Comparison

### Key Differences

| Feature | REST API v2 | REST API v3 |
|---------|-------------|-------------|
| Base Path | `/rest/api/2` | `/rest/api/3` |
| Issue ID Type | Numeric IDs only | Uses `key` format (PROJ-123) |
| Field References | By name or numeric ID | By field key or schema type |
| Permissions | Based on user roles | More granular permission checks |

### When to Use Each

| Scenario | Recommended API |
|----------|-----------------|
| New Forge apps | REST API v3 (recommended) |
| Legacy integrations | REST API v2 |
| Bulk operations | Both supported |
| Workflow transitions | Both supported |

---

## Best Practices

1. **Use v3 when possible** - REST API v3 is the current standard
2. **Handle rate limits** - Jira Cloud has rate limiting (typically 5 req/sec)
3. **Batch operations** - Use bulk endpoints when available
4. **Cache results** - Reduce API calls by caching data
5. **Error handling** - Always handle potential errors gracefully

---

## Forge Module Integration

For workflow validators, conditions, and post-functions, prefer using Forge workflow modules over REST API calls for better performance and reduced latency.