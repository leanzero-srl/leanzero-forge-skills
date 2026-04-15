# Issue Properties

This module covers the specialized API endpoints for managing **Issue Properties**. Issue properties allow you to store custom, application-specific metadata directly on a Jira issue.

## Overview

Unlike custom fields, which are visible to users and part of the issue's data model, **Issue Properties** are intended for application-level storage. They are "hidden" from the standard Jira UI but can be used by your Forge app to maintain state, track progress, or store integration-specific identifiers.

---

## Required Forge Scopes

To use these endpoints, your Forge app must have the following scopes in `manifest.yml`:

| Scope | Purpose |
| :--- | :--- |
| `read:jira-work` | Retrieve issue properties. |
| `write:jira-work` | Create, update, or delete issue properties. |

---

## Single Issue Properties

Manage properties for a specific, individual issue.

**Endpoints:**
- `GET /rest/api/3/issue/{issueIdOrKey}/properties` (List all properties for an issue)
- `GET /rest/api/3/issue/{issueIdOrKey}/properties/{propertyKey}` (Get a specific property)
- `PUT /rest/api/3/issue/{issueIdOrKey}/properties/{propertyKey}` (Set/Update a property)
- `DELETE /rest/api/3/issue/{issueIdOrKey}/properties/{propertyKey}` (Remove a property)

**Response Example (200 OK) - Get Property:**

```json
{
  "my-app-sync-status": "completed",
  "last_sync_timestamp": 1712385600
}
```

---

## Bulk Issue Properties

Manage properties for multiple issues in a single request. This is highly efficient for synchronization tasks or batch processing.

**Endpoints:**
- `GET /rest/api/3/issue/properties` (List all properties for multiple issues)
- `PUT /rest/api/3/issue/properties/multi` (Set/Update properties for multiple issues)

**Bulk Update Request Example (200 OK):**

```json
{
  "properties": [
    {
      "issueIdOrKey": "PROJ-123",
      "properties": {
        "external-id": "ext-999",
        "status": "synced"
      }
    },
    {
      "issueIdOrKey": "PROJ-124",
      "properties": {
        "external-id": "ext-1000",
        "status": "pending"
      }
    }
  ]
}
```

---

## Error Responses

| Status | Description |
| :--- | :--- |
| `400` | Invalid property key or malformed request. |
| `401` | Authentication credentials incorrect or missing. |
| `403` | Insufficient permissions to modify issue properties. |
| `404` | Issue or property key not found. |