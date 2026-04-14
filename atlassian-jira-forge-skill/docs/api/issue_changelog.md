# Issue Changelog

This module covers API endpoints for retrieving the history of changes made to a Jira issue.

## Overview

Every time a field on a Jira issue is updated, a "changelog" entry is created. This history is crucial for auditing, debugging workflow automation, and providing users with a clear view of how an issue has progressed.

---

## Required Forge Scopes

To use these endpoints, your Forge app must have the following scopes in `manifest.yml`:

| Scope | Purpose |
| :--- | :--- |
| `read:jira-work` | Retrieve the history of changes for an issue. |

---

## Retrieving Change History

### Get Issue Changelog

Retrieves the history of changes made to a specific issue.

**Endpoint:** `GET /rest/api/3/issue/{issueIdOrKey}/changelog`

**Response Example (200 OK):**

```json
{
  "total": 1,
  "visited": 1,
  "startAt": 0,
  "maxResults": 50,
  "values": [
    {
      "id": "10201",
      "author": {
        "accountId": "5b10ac8d82e05b22cc7d4ef5",
        "displayName": "John Doe"
      },
      "created": "2024-01-01T12:05:00.000+0000",
      "items": [
        {
          "field": "status",
          "fieldoid": "status",
          "from": "1",
          "to": "3",
          "fromString": "To Do",
          "toString": "In Progress"
        },
        {
          "field": "assignee",
          "fieldoid": "assignee",
          "from": null,
          "to": "5b10ac8d82e05b22cc7d4ef5",
          "fromString": null,
          "toString": "John Doe"
        }
      ]
    }
  ]
}
```

---

## Understanding the Changelog Schema

Each entry in the `values` array represents a single "history event" (an update performed by a user at a specific time).

### The `items` Array

The `items` array within a history event contains the specific field changes that occurred during that update.

| Property | Type | Description |
| :--- | :--- | :--- |
| `field` | `string` | The name of the field that was changed. |
| `fieldoid` | `string` | The unique identifier for the field. |
| `from` | `string/null` | The value of the field *before* the change. |
| `to` | `string/null` | The value of the field *after* the change. |
| `fromString` | `string/null` | The human-readable string representation of the *old* value. |
| `toString` | `string/null` | The human-readable string representation of the *new* value. |

---

## Error Responses

| Status | Description |
| :--- | :--- |
| `400` | Invalid issue ID or parameters. |
| `401` | Authentication credentials incorrect or missing. |
| `403` | Insufficient permissions to view history. |
| `404` | Issue not found. |