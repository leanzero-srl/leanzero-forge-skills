# Issue Metadata Configuration

This module covers API endpoints for managing the foundational metadata used to categorize and resolve issues in Jira, specifically **Priorities** and **Resolutions**.

## Overview

Metadata configurations like Priorities and Resolutions are key to issue lifecycle management. 
- **Priorities** define the urgency of an issue.
- **Resolutions** define the outcome of an issue (e.g., "Done", "Won't Do", "Duplicate").

Both are governed by **Schemes** that map these values to specific projects.

---

## Required Forge Scopes

To use these endpoints, your Forge app must have administrative-level scopes in `manifest.yml`:

| Scope | Purpose |
| :--- | :--- |
| `manage:jira-configuration` | Create, update, or manage priority and resolution schemes. |
| `read:jira-work` | View existing priorities and resolutions. |

---

## Priority Management

### Priority Operations

Manage the global list of priority levels available in the Jira instance.

**Endpoints:**
- `GET /rest/api/3/priority` (List all priorities)
- `GET /rest/api/3/priority/{id}` (Get specific priority details)
- `GET /rest/api/3/priority/search` (Search for priorities)
- `POST /rest/api/3/priority` (Create a new priority)
- `PUT /rest/api/3/priority/{id}` (Update a priority)
- `DELETE /rest/api/3/priority/{id}` (Delete a priority)

**Response Example (200 OK) - List Priorities:**

```json
[
  {
    "id": "1",
    "name": "Highest",
    "iconUrl": "https://your-domain.atlassian.net/images/icons/priorities/highest.png"
  },
  {
    "id": "2",
    "name": "Medium",
    "iconUrl": "https://your-domain.atlassian.net/images/icons/priorities/medium.png"
  }
]
```

### Priority Schemes

Control which priorities are available to which projects.

**Endpoints:**
- `GET /rest/api/3/priorityscheme` (List all priority schemes)
- `GET /rest/api/3/priorityscheme/{schemeId}` (Get scheme details)
- `POST /rest/api/3/priorityscheme/{schemeId}/priorities` (Add priorities to a scheme)
- `GET /rest/api/3/priorityscheme/{schemeId}/projects` (List projects using this scheme)

---

## Resolution Management

### Resolution Operations

Manage the global list of resolution statuses.

**Endpoints:**
- `GET /rest/api/3/resolution` (List all resolutions)
- `GET /rest/api/3/resolution/{id}` (Get specific resolution details)
- `POST /rest/api/3/resolution` (Create a new resolution)
- `PUT /rest/api/3/resolution/{id}` (Update a resolution)
- `DELETE /rest/api/3/resolution/{id}` (Delete a resolution)

**Response Example (200 OK) - List Resolutions:**

```json
[
  {
    "id": "10000",
    "name": "Done"
  },
  {
    "id": "10001",
    "name": "Won't Do"
  }
]
```

---

## Error Responses

| Status | Description |
| :--- | :--- |
| `400` | Invalid priority/resolution name or malformed request. |
| `403` | Insufficient administrative permissions. |
| `404` | Priority, resolution, or scheme not found. |