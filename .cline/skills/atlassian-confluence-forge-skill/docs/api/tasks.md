# Tasks API

The Tasks API allows you to manage tasks created within Confluence content, such as pages and blog posts. You can list, retrieve, and update the status of these tasks.

---

## Overview

Tasks in Confluence are actionable items embedded within the content of a page or blog post. This API provides powerful filtering capabilities to help you track task progress across your entire site or within specific contexts.

**API Version**: v2 (Current Standard)

**Base URL**: `https://{domain}.atlassian.net/wiki/api/v2`

---

## Endpoint Breakdown

### Task Management

Core operations for interacting with tasks.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/tasks` | List all tasks (supports extensive filtering). |
| `GET` | `/tasks/{id}` | Retrieve details of a specific task. |
| `PUT` | `/tasks/{id}` | Update a task (currently supports updating status). |

**Response Example (Get Task):**

```json
{
  "id": "5566778899",
  "status": "incomplete",
  "title": "Review the project proposal",
  "page": {
    "id": "123456789",
    "_links": {
      "self": "/wiki/api/v2/pages/123456789"
    }
  },
  "assignee": {
    "accountId": "user-abc-123",
    "displayName": "Jane Smith"
  },
  "createdDate": "2024-01-15T09:00:00.000Z",
  "_links": {
    "self": "/wiki/api/v2/tasks/5566778899"
  }
}
```

### Filtering Options (for `GET /tasks`)

The list endpoint is highly flexible, allowing you to filter tasks by various criteria:

| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | string | Filter by `complete` or `incomplete`. |
| `space-id` | array (int64) | Filter by one or more space IDs. |
| `page-id` | array (int64) | Filter by one or more page IDs. |
| `blogpost-id` | array (int64) | Filter by one or more blog post IDs. |
| `assigned-to` | array (string) | Filter by Account ID of the assignee. |
| `created-by` | array (string) | Filter by Account ID of the creator. |
| `completed-by` | array (string) | Filter by Account ID of the person who completed it. |
| `due-at-from` | integer (int64) | Filter tasks due after this epoch timestamp. |
| `due-at-to` | integer (int64) | Filter tasks due before this epoch timestamp. |
| `cursor` | string | Used for pagination. |
| `limit` | integer | Maximum number of tasks per result (1-250). |

---

## Authentication

Forge apps use automatic OAuth via manifest scopes:

- **Custom UI (frontend)**: Use `requestConfluence()` from `@forge/bridge`
- **Resolver functions (backend)**: Use `api.asUser().requestConfluence()` or `api.asApp().requestConfluence()` from `@forge/api`

---

## Error Responses

Common error codes for Task operations:

| Code | Description |
|------|-------------|
| `400` | Bad Request - Invalid request parameters or body. |
| `401` | Unauthorized - Authentication is missing or invalid. |
| `404` | Not Found - The specified task or its parent content was not found. |

---

## Official Documentation References

- [Confluence Cloud REST API v2](https://developer.atlassian.com/cloud/confluence/rest/)
- [Tasks API Reference](https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-task/)

**Note**: The Confluence REST API v2 is the current standard. Version 1 APIs are being deprecated.