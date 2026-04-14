# Issue Comments

This module covers API endpoints for managing comments on Jira issues, including the ability to store application-specific metadata directly on individual comments.

## Overview

Comments are a vital part of issue collaboration. Beyond standard text-based comments, Jira allows for attaching properties to comments, which can be used by Forge apps to store state or metadata related to a specific comment (e.g., "this comment has been processed by my app").

---

## Required Forge Scopes

To use these endpoints, your Forge app must have the following scopes in `manifest.yml`:

| Scope | Purpose |
| :--- | :--- |
| `read:jira-work` | Retrieve comments and comment properties. |
| `write:jira-work` | Create, update, or delete comments and their properties. |

---

## Standard Issue Comments

Manage the lifecycle of comments within an issue's thread.

### Add Comment
Adds a new comment to a specific issue.

**Endpoint:** `POST /rest/api/3/issue/{issueIdOrKey}/comment`

**Request Body Example:**

```json
{
  "body": {
    "type": "doc",
    "version": 1,
    "content": [
      {
        "type": "paragraph",
        "content": [
          {
            "text": "This is a comment added via the Jira API.",
            "type": "text"
          }
        ]
      }
    ]
  }
}
```

### Get Comments
Retrieves all comments for a specific issue.

**Endpoint:** `GET /rest/api/3/issue/{issueIdOrKey}/comment`

**Response Example (200 OK):**

```json
[
  {
    "id": "10001",
    "author": {
      "accountId": "5b10ac8d82e05b22cc7d4ef5",
      "displayName": "John Doe"
    },
    "body": { ... },
    "created": "2024-01-01T12:00:00.000+0000"
  }
]
```

---

## Comment Properties

Manage application-level metadata attached to a specific comment.

### Get Comment Property
Retrieves a specific property from a comment.

**Endpoint:** `GET /rest/api/3/comment/{commentId}/properties/{propertyKey}`

### Set Comment Property
Creates or updates a property on a comment.

**Endpoint:** `PUT /rest/api/3/comment/{commentId}/properties/{propertyKey}`

**Request Body Example:**

```json
{
  "processed_by_app": true,
  "sync_id": "sync-abc-123"
}
```

### Delete Comment Property
Removes a property from a comment.

**Endpoint:** `DELETE /rest/api/3/comment/{commentId}/properties/{propertyKey}`

---

## Efficient Comment Retrieval

When you need to retrieve comments across multiple contexts or in a highly optimized manner, use the specialized list endpoint.

### Bulk Comment List
Retrieves a list of comments. This is often more efficient for large-scale data processing or synchronization.

**Endpoint:** `GET /rest/api/3/comment/list`

---

## Error Responses

| Status | Description |
| :--- | :--- |
| `400` | Invalid comment body or malformed property key. |
| `401` | Authentication credentials incorrect or missing. |
| `403` | Insufficient permissions to comment or modify properties. |
| `404` | Comment or property key not found. |