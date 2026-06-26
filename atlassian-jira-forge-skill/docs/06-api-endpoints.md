# Jira REST API Reference

## Overview

This is the canonical API reference for the skill. Endpoints use the `/rest/api/3` base path unless otherwise specified. From a Forge function, call them via `api.asApp().requestJira(route\`...\`)` or `api.asUser().requestJira(...)`.

```javascript
import api, { route } from '@forge/api';

const response = await api.asApp().requestJira(route`/rest/api/3/issue/${issueKey}`);
const issue = await response.json();
```

> Always use the `route\`...\`` tagged template — it auto-encodes interpolated values and prevents request-path injection.

## Per-Resource Deep Dives

For schemas, code samples, and request/response details by resource, see the appendix in `docs/api/`:

| Resource | File |
|---|---|
| Issues (CRUD, transitions) | [`api/issues.md`](./api/issues.md) |
| Bulk operations | [`api/issue_bulk_operations.md`](./api/issue_bulk_operations.md) |
| Comments | [`api/issue_comments.md`](./api/issue_comments.md) |
| Worklogs | [`api/issue_worklogs.md`](./api/issue_worklogs.md) |
| Attachments | [`api/issue_attachments.md`](./api/issue_attachments.md) |
| Issue links | [`api/issue_links.md`](./api/issue_links.md) |
| Issue properties | [`api/issue_properties.md`](./api/issue_properties.md) |
| Changelog | [`api/issue_changelog.md`](./api/issue_changelog.md) |
| Remote links | [`api/issue_remotelinks.md`](./api/issue_remotelinks.md) |
| Workflows | [`api/workflows.md`](./api/workflows.md) |
| Projects | [`api/projects.md`](./api/projects.md) |
| Project assets | [`api/project_assets.md`](./api/project_assets.md) |
| Search & JQL | [`api/search_and_jql.md`](./api/search_and_jql.md) |
| Filters | [`api/filters.md`](./api/filters.md) |
| Dashboards | [`api/dashboards.md`](./api/dashboards.md) |
| Users | [`api/users.md`](./api/users.md) |
| Groups | [`api/groups.md`](./api/groups.md) |
| Permissions | [`api/permissions.md`](./api/permissions.md) |
| Field/screen management | [`api/field_and_screen_management.md`](./api/field_and_screen_management.md) |
| Field configuration | [`api/field_configuration.md`](./api/field_configuration.md) |
| Issue metadata config | [`api/issue_metadata_configuration.md`](./api/issue_metadata_configuration.md) |
| Configuration (overall) | [`api/configuration.md`](./api/configuration.md) |
| Plans | [`api/plans.md`](./api/plans.md) |
| Audit log | [`api/audit.md`](./api/audit.md), [`api/audit_and_history.md`](./api/audit_and_history.md) |
| Webhooks | [`api/webhooks.md`](./api/webhooks.md) |
| System administration | [`api/system_administration.md`](./api/system_administration.md) |
| User search | [`api/user_selection_and_search.md`](./api/user_selection_and_search.md) |
| Issue engagement | [`api/issue_engagement.md`](./api/issue_engagement.md) |
| Issue sub-resources | [`api/issue_sub_resources.md`](./api/issue_sub_resources.md) |

## Common Error Codes

| Status | Meaning | Typical Fix |
|---|---|---|
| 400 | Bad Request | Malformed JQL, missing required fields, ADF schema mismatch |
| 401 | Unauthorized | Auth token invalid; check scopes and re-`forge install --upgrade` |
| 403 | Forbidden | App or user lacks the required scope/permission |
| 404 | Not Found | Issue/project/user does not exist or is invisible to the auth context |
| 410 | Gone | Endpoint removed; check for v3 → v2 deprecations |
| 429 | Too Many Requests | Honor `Retry-After`; implement exponential backoff with jitter |
| 5xx | Atlassian-side error | Retry with backoff; surface a friendly error to the user |

---

## Table of Contents

1. [Issue Operations](#issue-operations)
2. [Bulk Issue Operations](#bulk-issue-operations)
3. [Issue Search (JQL)](#issue-search-jql)
4. [Worklog Operations](#worklog-operations)
5. [Issue Linking](#issue-linking)
6. [Comment Operations](#comment-operations)
7. [Project Operations](#project-operations)
8. [Workflow Operations](#workflow-operations)
9. [Field Operations](#field-operations)
10. [Permission & Security Operations](#permission--security-operations)
11. [User & Group Operations](#user--group-operations)
12. [Dashboard Operations](#dashboard-operations)
13. [Search & Filter Operations](#search--filter-operations)
14. [Attachment Operations](#attachment-operations)
15. [Audit Log Operations](#audit-log-operations)

---

## Issue Operations

### Create Issue

Create a new issue in Jira.

```javascript
import api from '@forge/api';

const response = await api.asApp().requestJira('/rest/api/3/issue', {
  method: 'POST',
  headers: {
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    fields: {
      project: { key: 'PROJ' },
      summary: 'Issue summary',
      description: 'Issue description text',
      issuetype: { name: 'Task' }
    }
  })
});

const issue = await response.json();
console.log(`Created issue ${issue.key}`);
```

**Required Fields:**
- `fields.project` - Project key or ID object
- `fields.summary` - Issue summary (required)
- `fields.issuetype.name` or `fields.issuetype.id` - Issue type

### Get Issue

Retrieve issue details by key or ID.

```javascript
const response = await api.asApp().requestJira(
  `/rest/api/3/issue/${issueKeyOrId}`,
  {
    method: 'GET',
    query: {
      expand: 'changelog,renderedFields,names,schema,operations,editmeta',
      fields: 'summary,description,status,assignee,created,updated'
    }
  }
);

const issue = await response.json();
```

**Query Parameters for Expand:**
- `changelog` - Include change history
- `renderedFields` - Include rendered field values
- `names` - Include field names
- `schema` - Include field schema
- `operations` - Include available operations
- `editmeta` - Include edit metadata

### Update Issue

Update an existing issue.

```javascript
await api.asApp().requestJira(`/rest/api/3/issue/${issueKeyOrId}`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    fields: {
      summary: 'Updated summary',
      description: 'Updated description'
    }
  })
});
```

### Delete Issue

Delete an issue.

```javascript
await api.asApp().requestJira(`/rest/api/3/issue/${issueKeyOrId}`, {
  method: 'DELETE',
  query: { deleteSubtasks: true, notifyUsers: true }
});
```

---

## Bulk Issue Operations

### Create Multiple Issues (Bulk)

Create multiple issues in a single request.

```javascript
await api.asApp().requestJira('/rest/api/3/issue/bulk', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    update: {},
    issues: [
      {
        fields: {
          project: { key: 'PROJ' },
          summary: 'First issue',
          issuetype: { name: 'Task' }
        }
      },
      {
        fields: {
          project: { key: 'PROJ' },
          summary: 'Second issue',
          issuetype: { name: 'Task' }
        }
      }
    ]
  })
});
```

### Get Multiple Issues

**Important:** The `/rest/api/3/issue/bulk` endpoint only supports the POST method according to Atlassian's OpenAPI specification.

**Recommended Approach: Use Search API**

```javascript
// Use JQL search with multiple issue IDs - this is the preferred method
const response = await api.asApp().requestJira(
  '/rest/api/3/search',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jql: 'id IN (12345, 67890, 11111)',
      startAt: 0,
      maxResults: 50,
      fields: ['summary', 'status', 'assignee']
    })
  }
);

const issues = await response.json();
console.log(`Found ${issues.issues.length} issues`);
```

**Alternative: Use POST /rest/api/3/issue/bulkfetch**

```javascript
// The bulkfetch endpoint accepts POST with issue IDs in body
const response = await api.asApp().requestJira(
  '/rest/api/3/issue/bulkfetch',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      issueIds: ['12345', '67890', '11111'],
      fields: ['summary', 'status', 'assignee']
    })
  }
);

const issues = await response.json();
```

### Bulk Update Issues

Update multiple issues using bulk operation.

```javascript
await api.asApp().requestJira('/rest/api/3/bulk/issues/fields', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    update: {
      fields: {
        summary: 'Updated via bulk',
        description: 'Bulk updated issue'
      }
    },
    issues: ['PROJ-1', 'PROJ-2', 'PROJ-3']
  })
});
```

### Bulk Delete Issues

Delete multiple issues.

```javascript
await api.asApp().requestJira('/rest/api/3/bulk/issues/delete', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    issueIds: ['12345', '67890', '11111']
  })
});
```

### Bulk Transition Issues

Transition multiple issues to the same state.

```javascript
await api.asApp().requestJira('/rest/api/3/bulk/issues/transition', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    transition: { id: '21' },
    issues: ['PROJ-1', 'PROJ-2'],
    fields: { resolution: { name: 'Done' } }
  })
});
```

### Bulk Move Issues

Move multiple issues to a different project.

```javascript
await api.asApp().requestJira('/rest/api/3/bulk/issues/move', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    update: {},
    issues: ['PROJ-1', 'PROJ-2'],
    fields: {
      project: { key: 'NEWPROJ' }
    }
  })
});
```

---

## Issue Search (JQL)

> **CORRECTION (2026):** the old `GET`/`POST /rest/api/3/search` (offset-paged with `startAt`/`total`) has been **removed**. Use **`POST /rest/api/3/search/jql`** with **`nextPageToken` cursor** pagination — there is no `total`. The example just below shows the legacy shape for historical context; the production shape is in [Production endpoint patterns](#production-endpoint-patterns).

### Search Issues

Search for issues using JQL.

```javascript
const response = await api.asApp().requestJira('/rest/api/3/search', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    jql: 'project = PROJ AND status != Done ORDER BY created DESC',
    start: 0,
    maxResults: 50,
    fields: ['summary', 'status', 'assignee', 'created'],
    expand: 'schema,names'
  })
});

const result = await response.json();
console.log(`Found ${result.total} issues`);
```

**Request Body Fields:**
- `jql` - JQL search string (required)
- `start` - Index of first issue to return (default: 0)
- `maxResults` - Maximum number of issues (default: 50, max: 100)
- `fields` - Array of field keys to include
- `expand` - Fields to expand (schema, names, renderings, operations, changelog)

### Get Issue Search Metadata

Retrieve metadata for the search API.

```javascript
const response = await api.asApp().requestJira(
  '/rest/api/3/search/jql',
  { method: 'GET' }
);
```

### Approximate Count Search

Get an approximate count without fetching issues.

```javascript
const response = await api.asApp().requestJira(
  '/rest/api/3/search/approximate-count',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jql: 'project = PROJ' })
  }
);

const result = await response.json();
console.log(`Approximate count: ${result.estimateCount}`);
```

### JQL Autocomplete Data

Get autocomplete suggestions for JQL queries.

```javascript
const response = await api.asApp().requestJira(
  '/rest/api/3/jql/autocompletedata',
  { method: 'GET' }
);
```

### JQL Parsing

Parse and validate JQL expressions.

```javascript
await api.asApp().requestJira('/rest/api/3/jql/parse', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ jqlStr: 'project = PROJ AND status = Done' })
});
```

---

## Worklog Operations

### Create Worklog

Record work on an issue.

```javascript
await api.asApp().requestJira(
  `/rest/api/3/issue/${issueKeyOrId}/worklog`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      comment: 'Completed implementation work',
      timeSpent: '2h',
      startDate: '2024-01-15T09:00:00.000+0000'
    })
  }
);
```

### Get Worklogs

Retrieve worklogs for an issue.

```javascript
const response = await api.asApp().requestJira(
  `/rest/api/3/issue/${issueKeyOrId}/worklog`,
  { method: 'GET' }
);

const worklogs = await response.json();
```

### Update Worklog

Modify an existing worklog.

```javascript
await api.asApp().requestJira(
  `/rest/api/3/issue/${issueKeyOrId}/worklog/${worklogId}`,
  {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      comment: 'Updated worklog description',
      timeSpent: '3h'
    })
  }
);
```

### Delete Worklog

Remove a worklog entry.

```javascript
await api.asApp().requestJira(
  `/rest/api/3/issue/${issueKeyOrId}/worklog/${worklogId}`,
  { method: 'DELETE' }
);
```

---

## Issue Linking

### Create Issue Link

Create a link between two issues.

```javascript
await api.asApp().requestJira('/rest/api/3/issueLink', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    type: { name: 'Blocks' },
    inwardIssue: { key: 'PROJ-100' },
    outwardIssue: { key: 'PROJ-200' }
  })
});
```

**Available Link Types:**
| Type | Inward | Outward |
|------|--------|---------|
| Blocks | Blocked by | Blocks |
| Cloners | Is cloned by | Clones |
| Copied to | Is copied to | Copies |
| Dependencies | Is blocked by | Blocks |
| Duplicate | Is duplicated by | Duplicates |
| Relates | Related to | Related to |

### Get Issue Links

Retrieve all links for an issue.

```javascript
const response = await api.asApp().requestJira(
  `/rest/api/3/issue/${issueKeyOrId}/remotelink`,
  { method: 'GET' }
);
```

### Delete Issue Link

Remove a link between issues.

```javascript
await api.asApp().requestJira('/rest/api/3/issueLink/{issueLinkId}', {
  method: 'DELETE'
});
```

---

## Comment Operations

### Add Comment

Add a comment to an issue.

```javascript
await api.asApp().requestJira(
  `/rest/api/3/issue/${issueKeyOrId}/comment`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      body: 'This is a comment on the issue'
    })
  }
);
```

### Get Comments

Comments are retrieved when fetching an issue with `expand=changelog,renderedFields,names,schema,operations,editmeta`.

**Option 1: Fetch comments via Issue with Expand**

```javascript
const response = await api.asApp().requestJira(
  `/rest/api/3/issue/${issueKeyOrId}?expand=changelog`,
  { method: 'GET' }
);

// Comments are in the changelog.history array
const data = await response.json();
const comments = data.changelog?.history || [];
```

**Option 2: Use Search API (JQL) for Comment Search**

```javascript
const jql = `issue = ${issueKeyOrId} ORDER BY created DESC`;
const response = await api.asApp().requestJira(
  `/rest/api/3/search?jql=${encodeURIComponent(jql)}&expand=changelog`,
  { method: 'GET' }
);
```

**Option 3: Fetch Comments via REST API v2**

```javascript
// Use the /comment endpoint for a specific issue
const response = await api.asApp().requestJira(
  `/rest/api/3/issue/${issueKeyOrId}/comments`,
  { method: 'GET' }
);
```

### Update Comment

Modify a comment.

```javascript
await api.asApp().requestJira(
  `/rest/api/3/issue/${issueKeyOrId}/comment/${commentId}`,
  {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      body: 'Updated comment text'
    })
  }
);
```

### Delete Comment

Remove a comment.

```javascript
await api.asApp().requestJira(
  `/rest/api/3/issue/${issueKeyOrId}/comment/${commentId}`,
  { method: 'DELETE' }
);
```

---

## Project Operations

### List Projects

List all projects accessible to the user.

```javascript
const response = await api.asApp().requestJira('/rest/api/3/project', {
  method: 'GET',
  query: {
    startAt: 0,
    maxResults: 50,
    expand: 'description,lead,assigneeType,components'
  }
});

const projects = await response.json();
```

### Get Project

Retrieve project details.

```javascript
await api.asApp().requestJira(`/rest/api/3/project/${projectIdOrKey}`, {
  method: 'GET',
  query: { expand: 'description,lead,assigneeType,components' }
});
```

### Create Project

Create a new project.

```javascript
await api.asApp().requestJira('/rest/api/3/project', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    key: 'NEWPROJ',
    name: 'New Project Name',
    projectTypeKey: 'software',
    projectTemplateKey:
      'com.pyxis.greenhopper.jira:gh-simplified-agile-classic',
    description: 'Project description',
    leadAccountId: 'user-account-id',
    assigneeType: 'PROJECT_LEAD'
  })
});
```

**Project Template Keys (Common):**
- `com.pyxis.greenhopper.jira:gh-simplified-agile-classic` - Simplified Scrum
- `com.pyxis.greenhopper.jira:gh-simplified-agile-basic` - Simplified Kanban
- `com.atlassian.jira-core-project-templates:jira-core-generic-template` - Jira Core

### Update Project

Modify project settings.

```javascript
await api.asApp().requestJira(
  `/rest/api/3/project/${projectIdOrKey}`,
  {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Updated Project Name'
    })
  }
);
```

### Delete Project

Delete a project.

```javascript
await api.asApp().requestJira(
  `/rest/api/3/project/${projectIdOrKey}`,
  {
    method: 'DELETE',
    query: { deleteSubTasks: true }
  }
);
```

---

## Workflow Operations

### Get Available Transitions

List available transitions for an issue.

```javascript
const response = await api.asApp().requestJira(
  `/rest/api/3/issue/${issueKeyOrId}/transitions`,
  { method: 'GET' }
);

const transitions = await response.json();
console.log(transitions.transitions);
```

### Execute Transition

Perform a workflow transition on an issue.

```javascript
await api.asApp().requestJira(
  `/rest/api/3/issue/${issueKeyOrId}/transitions`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      transition: { id: '21' }
    })
  }
);
```

**With Additional Fields:**
```javascript
await api.asApp().requestJira(
  `/rest/api/3/issue/${issueKeyOrId}/transitions`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      transition: { id: '21' },
      fields: {
        resolution: { name: 'Done' },
        fixVersions: [{ id: '12345' }]
      }
    })
  }
);
```

### Get Workflow Search

Search for workflows.

```javascript
const response = await api.asApp().requestJira('/rest/api/3/workflow/search', {
  method: 'GET',
  query: { startAt: 0, maxResults: 50 }
});
```

---

## Field Operations

### List All Fields

List all available fields in Jira.

```javascript
const response = await api.asApp().requestJira('/rest/api/3/field', {
  method: 'GET',
  query: { startAt: 0, maxResults: 100 }
});

const fields = await response.json();
```

### Get Field Details

Retrieve details about a specific field.

```javascript
await api.asApp().requestJira(`/rest/api/3/field/${fieldId}`, {
  method: 'GET'
});
```

**Common Field IDs:**
- `summary`, `description`, `project`, `issuetype`
- `priority`, `assignee`, `reporter`, `labels`
- `components`, `fixVersions`, `versions`

### Get Field Options

Retrieve available options for select fields.

```javascript
const response = await api.asApp().requestJira(
  `/rest/api/3/field/${fieldId}/option`,
  { method: 'GET' }
);

const options = await response.json();
```

---

## User & Group Operations

### Get Current User

Retrieve the current authenticated user.

```javascript
const response = await api.asApp().requestJira('/rest/api/3/myself', {
  method: 'GET'
});

const user = await response.json();
console.log(user.accountId);
```

### Get Multiple Users

Retrieve multiple users by accountId.

```javascript
await api.asApp().requestJira('/rest/api/3/user/bulk', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    accountIds: ['user-1-id', 'user-2-id']
  })
});
```

### Search Users

Search for users.

```javascript
const response = await api.asApp().requestJira('/rest/api/3/user/search', {
  method: 'GET',
  query: {
    startAt: 0,
    maxResults: 50,
    accountType: 'atlassian',
    query: 'john'
  }
});

const users = await response.json();
```

### Get User Groups

Retrieve groups for a user.

```javascript
await api.asApp().requestJira(
  `/rest/api/3/user/groups?accountId=${accountId}`,
  { method: 'GET' }
);
```

---

## Dashboard Operations

### Search Dashboards

Search for dashboards accessible to the user.

```javascript
const response = await api.asApp().requestJira('/rest/api/3/dashboard/search', {
  method: 'GET',
  query: {
    startAt: 0,
    maxResults: 50,
    expand: 'owner'
  }
});

const dashboards = await response.json();
```

### Get Dashboard

Retrieve dashboard details.

```javascript
await api.asApp().requestJira(`/rest/api/3/dashboard/${dashboardId}`, {
  method: 'GET',
  query: { expand: 'owner,description' }
});
```

---

## Search & Filter Operations

### Create Filter

Create a new filter.

```javascript
await api.asApp().requestJira('/rest/api/3/filter', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'My Filter',
    description: 'Filter for important issues',
    jql: 'assignee = currentUser() AND priority = High'
  })
});
```

### Search Filters

Search for filters.

```javascript
const response = await api.asApp().requestJira('/rest/api/3/filter/search', {
  method: 'GET',
  query: {
    startAt: 0,
    maxResults: 50,
    sort: '-created'
  }
});
```

### Get Filter

Retrieve filter details.

```javascript
await api.asApp().requestJira(`/rest/api/3/filter/${filterId}`, {
  method: 'GET',
  query: { expand: 'description,owner' }
});
```

---

## Attachment Operations

### Upload Attachment

Attach a file to an issue.

```javascript
const formData = new FormData();
formData.append('file', fileBlob, fileName);

await api.asApp().requestJira(
  `/rest/api/3/issue/${issueKeyOrId}/attachments`,
  {
    method: 'POST',
    headers: { 'X-Atlassian-Token': 'no-check' },
    body: formData
  }
);
```

### Get Attachments

Retrieve attachments for an issue.

```javascript
const response = await api.asApp().requestJira(
  `/rest/api/3/issue/${issueKeyOrId}/attachments`,
  { method: 'GET' }
);

const attachments = await response.json();
```

### Delete Attachment

Remove an attachment.

```javascript
await api.asApp().requestJira(`/rest/api/3/attachment/${attachmentId}`, {
  method: 'DELETE'
});
```

---

## Audit Log Operations

### Get Audit Logs

Retrieve audit records.

```javascript
const response = await api.asApp().requestJira('/rest/api/3/auditing/record', {
  method: 'GET',
  query: {
    offset: 0,
    limit: 50,
    since: '2024-01-01T00:00:00.000+0000'
  }
});

const records = await response.json();
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
| 409 | Conflict - Issue in expected state |

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

### Example Error Handling

```javascript
try {
  const response = await api.asApp().requestJira('/rest/api/3/issue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { summary: 'Test' } })
  });

  if (!response.ok) {
    const error = await response.json();
    console.error('API Error:', error);

    if (response.status === 401) {
      // Token expired or invalid
    } else if (response.status === 403) {
      // Insufficient permissions
    }
  }

  const issue = await response.json();
} catch (error) {
  console.error('Network Error:', error);
}
```

---

## Best Practices

1. **Use Forge Modules** for workflow rules, conditions, and post-functions
2. **Use REST API** for bulk operations and external system integration
3. **Batch Requests** when possible to reduce API calls
4. **Handle Rate Limits** - Jira Cloud has rate limiting (typically 5 req/sec)
5. **Cache Results** when appropriate to reduce API usage
6. **Paginate** through large result sets using `startAt` and `maxResults`
7. **Use Expand Parameters** to minimize number of requests

---

## Forge vs REST API

| Scenario | Recommended Approach |
|----------|---------------------|
| Basic CRUD operations | Jira REST API |
| Workflow validators/post-functions | Forge workflow modules |
| Frontend UI rendering | Forge UI modules |
| Complex business logic | Combine both approaches |

---

## Production endpoint patterns

Battle-tested shapes from PPM (`src/services/jira-client.js`) and CogniRunner — these correct or extend the examples above.

### Cursor-paged JQL search (the current API)

```javascript
// POST /rest/api/3/search/jql — nextPageToken cursor, NO startAt / total
let nextPageToken = null;
const issues = [];
do {
  const body = { jql, maxResults: 100, fields: ['summary', 'status', 'duedate'] };
  if (nextPageToken) body.nextPageToken = nextPageToken;
  const res = await api.asApp().requestJira(route`/rest/api/3/search/jql`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await res.json();
  issues.push(...(data.issues || []));
  nextPageToken = data.nextPageToken || null;       // absent on the last page
} while (nextPageToken && issues.length);
```

### Bulk fetch by key — chunk at 100

```javascript
// POST /rest/api/3/issue/bulkfetch — far cheaper than N GETs; chunk the key list at 100.
for (let i = 0; i < keys.length; i += 100) {
  const res = await api.asApp().requestJira(route`/rest/api/3/issue/bulkfetch`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ issueIdsOrKeys: keys.slice(i, i + 100), fields: ['summary', 'duedate'] }),
  });
  // ... merge (res.json()).issues
}
```

### Update issue — suppress noise, override screen security

```javascript
// PUT /rest/api/3/issue/{key}?notifyUsers=false&overrideScreenSecurity=true
// notifyUsers=false: no email storm on a bulk write.
// overrideScreenSecurity=true: write fields not on the edit screen (app context; needs the scope).
await api.asApp().requestJira(
  route`/rest/api/3/issue/${key}?notifyUsers=false&overrideScreenSecurity=true`,
  { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) }
);
```

### editmeta pre-flight (before you write)

```javascript
// GET /rest/api/3/issue/{key}/editmeta → editMeta.fields[fieldId] tells you:
//   - whether the field is editable on THIS issue (missing key = not on the edit screen)
//   - field.operations (must include "set") and field.schema (type/items/allowedValues)
// Sample one issue per project to warn that Apply would silently no-op. See docs/24 pattern 20.
```

### Agile board + ranking

```javascript
// GET /rest/agile/1.0/board/{boardId}/issue?startAt=&maxResults=&fields=  (board contents, paged)
// PUT /rest/agile/1.0/issue/rank  — reorder up to 50 keys at once
await api.asApp().requestJira(route`/rest/agile/1.0/issue/rank`, {
  method: 'PUT', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ issues: keys, rankBeforeIssue: 'PROJ-10' }),  // or rankAfterIssue
});
```

### Concrete rate limits (design targets)

| Operation | Approx ceiling |
|---|---|
| GET / POST | ~100 / s |
| PUT / DELETE | ~50 / s |
| Per-issue writes | ~20 / 2 s and ~100 / 30 s |

Honor `Retry-After`, back off with jitter (`19-rate-limit-handling.md`). Chunked write-back at ~10–13 issues/s (`24-production-patterns.md` pattern 14) stays comfortably under these.

---

*This documentation is based on the Atlassian Jira Cloud REST API specification.*