# Issue Worklogs

This module covers API endpoints for managing worklogs, which are used to track time spent on specific Jira issues.

## Overview

Worklogs allow users and applications to record time spent on tasks. In Forge apps, managing worklogs is essential for time-tracking, resource allocation, and productivity reporting. This module includes endpoints for creating, retrieving, and moving worklogs, as well as managing application-level metadata on individual worklog entries.

---

## Required Forge Scopes

To use these endpoints, your Forge app must have the following scopes in `manifest.yml`:

| Scope | Purpose |
| :--- | :--- |
| `read:jira-work` | Retrieve worklog details. |
| `write:jira-work` | Create, update, or move worklogs. |

---

## Logging Work

### Add Worklog

Adds a new worklog entry to a specific issue.

**Endpoint:** `POST /rest/api/3/issue/{issueIdOrKey}/worklog`

**Request Body Example:**

```json
{
  "timeSpentSeconds": 3600,
  "comment": "Completed the initial research for the documentation task.",
  "from": "2024-01-01T12:00:00.000+0000",
  "to": "2024-01-01T13:00:00.000+0000"
}
```

---

## Retrieving Worklogs

### Get Issue Worklogs

Retrieves a list of all worklogs associated with a specific issue.

**Endpoint:** `GET /rest/api/3/issue/{issueIdOrKey}/worklog`

**Response Example (200 OK):**

```json
[
  {
    "id": "10101",
    "author": {
      "accountId": "5b10ac8d82e05b22cc7d4ef5",
      "displayName": "John Doe"
    },
    "timeSpentSeconds": 3600,
    "started": "2024-01-01T12:00:00.000+0000",
    "comment": {
      "type": "doc",
      "version": 1,
      "content": [...]
    }
  }
]
```

---

## Managing Worklogs

### Move Worklog

Moves an existing worklog to a different issue. This is useful for correcting errors in time entry.

**Endpoint:** `POST /rest/api/3/issue/{issueIdOrKey}/worklog/move`

**Request Body Example:**

```json
{
  "worklogId": "10101",
  "destinationIssueIdOrKey": "PROJ-456"
}
```

### Worklog Properties

Similar to issues and comments, you can store application-specific metadata directly on a worklog entry.

**Endpoints:**
- `GET /rest/api/3/issue/{issueIdOrKey}/worklog/{worklogId}/properties/{propertyKey}` (Get property)
- `PUT /rest/api/3/issue/{issueIdOrKey}/worklog/{worklogId}/properties/{propertyKey}` (Set property)
- `DELETE /rest/api/3/issue/{issueIdOrKey}/worklog/{worklogId}/properties/{propertyKey}` (Delete property)

---

## Error Responses

| Status | Description |
| :--- | :--- |
| `400` | Invalid worklog data (e.g., malformed time format). |
| `401` | Authentication credentials incorrect or missing. |
| `403` | Insufficient permissions to manage worklogs. |
| `404` | Issue or worklog not found. |