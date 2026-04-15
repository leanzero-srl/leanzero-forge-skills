# Issue Engagement

This module covers API endpoints for managing user engagement with Jira issues, specifically through **voting** and **watching**.

## Overview

Engagement features allow users to express interest in issues. 
- **Votes** allow users to signal that an issue is important.
- **Watchers** allow users to receive notifications about changes to an issue.

---

## Required Forge Scopes

To use these endpoints, your Forge app must have the following scopes in `manifest.yml`:

| Scope | Purpose |
| :--- | :--- |
| `read:jira-work` | View votes and watchers. |
| `write:jira-work` | Add or remove votes and watchers. |

---

## Votes

### Get Votes
Retrieves a list of users who have voted on a specific issue.

**Endpoint:** `GET /rest/api/3/issue/{issueIdOrKey}/votes`

**Response Example (200 OK):**

```json
[
  {
    "accountId": "5b10ac8d82e05b22cc7d4ef5",
    "displayName": "John Doe"
  }
]
```

### Add Vote
Adds a vote to an issue.

**Endpoint:** `POST /rest/api/3/issue/{issueIdOrKey}/votes`

**Response Example (204 No Content):**
*(No response body returned on success)*

### Remove Vote
Removes a vote from an issue.

**Endpoint:** `DELETE /rest/api/3/issue/{issueIdOrKey}/votes`

---

## Watchers

### Get Watchers
Retrieves a list of users watching a specific issue.

**Endpoint:** `GET /rest/api/3/issue/{issueIdOrKey}/watchers`

**Response Example (200 OK):**

```json
{
  "total": 2,
  "startAt": 0,
  "maxResults": 50,
  "isLast": false,
  "values": [
    {
      "accountId": "5b10ac8d82e05b22cc7d4ef5",
      "displayName": "John Doe"
    }
  ]
}
```

### Add Watcher
Adds a user as a watcher to an issue.

**Endpoint:** `POST /rest/api/3/issue/{issueIdOrKey}/watchers`

**Request Body Example:**

```json
{
  "accountId": "5b10ac8d82e05b22cc7d4ef5"
}
```

### Remove Watcher
Removes a user as a watcher from an issue.

**Endpoint:** `DELETE /rest/api/3/issue/{issueIdOrKey}/watchers/{accountId}`

---

## Error Responses

| Status | Description |
| :--- | :--- |
| `400` | Invalid request or account ID. |
| `401` | Authentication credentials incorrect or missing. |
| `403` | User lacks permission to vote or watch. |
| `404` | Issue or user not found. |