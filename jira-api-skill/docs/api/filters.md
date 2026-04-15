# Filters

This module covers API endpoints for managing and searching for saved JQL filters.

## Overview

JQL (Jira Query Language) filters allow users to save complex queries for reuse in dashboards, boards, and other views. This module enables programmatic creation, management, and retrieval of these saved filters.

---

## Required Forge Scopes

To use these endpoints, your Forge app must have the following scopes in `manifest.yml`:

| Scope | Purpose |
| :--- | :--- |
| `read:jira-work` | Retrieve filter information and search results. |
| `write:jira-work` | Create, update, or delete filters. |

---

## Filter Management

### Filter CRUD Operations

Create, retrieve, and manage the lifecycle of saved filters.

**Endpoints:**
- `GET /rest/api/3/filter/search` - Search for filters based on JQL or name.
- `GET /rest/api/3/filter/{id}` - Retrieve a specific filter.
- `POST /rest/api/3/filter` - Create a new filter.
- `PUT /rest/api/3/filter/{id}` - Update an existing filter.
- `DELETE /rest/api/3/filter/{id}` - Delete a filter.

**Create Filter Example (POST):**

```json
{
  "name": "My Custom Forge Filter",
  "description": "A filter created via Forge API",
  "jql": "project = 'PROJ' AND status = 'In Progress'",
  "startDate": "2024-01-01",
  "sharePermissions": [
    {
      "type": "project",
      "project": {
        "id": "10001"
      }
    }
  ]
}
```

### Filter Ownership and Permissions

Manage who owns a filter and its sharing permissions.

**Endpoints:**
- `GET /rest/api/3/filter/{id}/owner` - Retrieve the owner of a filter.
- `GET /rest/api/3/filter/{id}/permission` - Retrieve sharing permissions.
- `GET /rest/api/3/filter/my` - Retrieve filters owned by the current user.
- `GET /rest/api/3/filter/favourite` - Retrieve favourite filters.

---

## Error Responses

| Status | Description |
| :--- | :--- |
| `400` | Invalid JQL syntax or malformed request body. |
| `401` | Authentication credentials incorrect or missing. |
| `403` | Insufficient permissions to access or modify the filter. |
| `404` | The specified filter could not be found. |