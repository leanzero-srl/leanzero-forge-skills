# Bulk Issue Operations

This module covers API endpoints for performing operations on multiple Jira issues simultaneously.

## Overview

Bulk operations are essential for administrative tasks, large-scale data migrations, and mass updates to issue states, properties, or watchers. Due to the potentially heavy load these operations place on the system, Jira often processes them asynchronously.

---

## Required Forge Scopes

To use these endpoints, your Forge app must have the following scopes in `manifest.yml`:

| Scope | Purpose |
| :--- | :--- |
| `write:jira-work` | Perform bulk updates, moves, and deletions. |

---

## Managing Bulk Operations

### Bulk Issue Transitions

Transitions multiple issues to a new status in a single request.

**Endpoint:** `POST /rest/api/3/bulk/issues/transition`

**Request Body Example:**

```json
{
  "issueIdsOrKeys": ["PROJ-1", "PROJ-2"],
  "transition": {
    "id": "31"
  }
}
```

### Bulk Issue Moves

Moves multiple issues to a different project or changes their issue type.

**Endpoint:** `POST /rest/api/3/bulk/issues/move`

**Request Body Example:**

```json
{
  "issueIdsOrKeys": ["PROJ-1", "PROJ-2"],
  "destination": {
    "project": {
      "id": "10001"
    },
    "issueType": {
      "id": "10005"
    }
  }
}
```

### Bulk Watch/Unwatch

Adds or removes watchers from multiple issues at once.

**Endpoints:**
- **Watch**: `POST /rest/api/3/bulk/issues/watch`
- **Unwatch**: `POST /rest/api/3/bulk/issues/unwatch`

**Request Body Example (Watch):**

```json
{
  "issueIdsOrKeys": ["PROJ-1", "PROJ-2"],
  "accountId": "5b10ac8d82e05b22cc7d4ef5"
}
```

### Bulk Issue Deletions

Removes multiple issues from the system. **Warning: This action is irreversible.**

**Endpoint:** `DELETE /rest/api/3/bulk/issues/delete`

**Request Body Example:**

```json
{
  "issueIdsOrKeys": ["PROJ-1", "PROJ-2"]
}
```

---

## Monitoring Bulk Tasks

For long-running bulk operations, Jira provides a queue mechanism to monitor progress.

### Check Bulk Queue Status

Retrieves the status of a specific bulk task.

**Endpoint:** `GET /rest/api/3/bulk/queue/{taskId}`

**Response Example (200 OK):**

```json
{
  "taskId": "bulk-task-id-123",
  "status": "running",
  "progress": {
    "total": 100,
    "completed": 45,
    "failed": 2
  }
}
```

---

## Error Responses

| Status | Description |
| :--- | :--- |
| `400` | Invalid request body or malformed issue keys. |
| `401` | Authentication credentials incorrect or missing. |
| `403` | Insufficient permissions to perform bulk operations. |
| `404` | One or more issues in the request could not be found. |