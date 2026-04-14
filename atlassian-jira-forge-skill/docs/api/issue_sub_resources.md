# Issue Sub-resources

This module covers API endpoints for interacting with sub-resources associated with a Jira Issue, such as comments, attachments, votes, watchers, and worklogs.

## Overview

Many Jira operations involve managing secondary data linked to a specific issue. These endpoints allow you to add, retrieve, or remove these elements, which are essential for collaboration and tracking within an issue's context.

---

## Issue Comments

Comments allow users to communicate and document discussions directly on an issue.

**Endpoint:** `POST /rest/api/3/issue/{issueIdOrKey}/comment` (Add Comment)
**Endpoint:** `GET /rest/api/3/issue/{issueIdOrKey}/comment` (Get Comments)

### Add Comment

Adds a new comment to an issue.

**Request Body Parameters:**

| Name | Type | Description |
| :--- | :--- | :--- |
| `body` | `object` | **Required.** The comment body using Atlassian Document Format (ADF). |
| `visibility` | `object` | (Optional) Visibility settings for the comment (e.g., restricted to specific roles). |

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
            "type": "text",
            "text": "This is a new comment added via the API."
          }
        ]
      }
    ]
  }
}
```

**Response Example (201 Created):**

```json
{
  "id": "10000",
  "author": {
    "accountId": "5b10a2844c20165700ede21g",
    "displayName": "Mia Krystof"
  },
  "body": {
    "type": "doc",
    "version": 1,
    "content": [...]
  },
  "created": "2021-01-17T12:34:00.000+0000"
}
```

**Error Responses:**

| Status | Description |
| :--- | :--- |
| `400` | Invalid request body or ADF structure. |
| `401` | Authentication credentials incorrect. |
| `404` | Issue not found. |
| `413` | Per-issue limit breached for comments. |

---

## Issue Attachments

Attachments allow users to upload files (images, documents, etc.) to an issue.

**Endpoint:** `GET /rest/api/3/issue/{issueIdOrKey}/attachments`

**Response Example (200 OK):**

```json
[
  {
    "id": 10000,
    "filename": "picture.jpg",
    "mimeType": "image/jpeg",
    "size": 23123,
    "self": "https://your-domain.atlassian.net/rest/api/3/attachments/10000"
  }
]
```

---

## Issue Votes & Watchers

Users can "vote" for issues to show interest or "watch" them to receive notifications about updates.

### Votes
**Endpoint:** `POST /rest/api/3/issue/{issueIdOrKey}/votes` (Vote for an issue)
**Endpoint:** `DELETE /rest/api/3/issue/{issueIdOrKey}/votes` (Remove vote)

### Watchers
**Endpoint:** `GET /rest/api/3/issue/{issueIdOrKey}/watchers` (Get watchers list)
**Endpoint:** `POST /rest/api/3/issue/{issueIdOrKey}/watchers` (Add a watcher)
**Endpoint:** `DELETE /rest/api/3/issue/{issueIdOrKey}/watchers` (Remove a watcher)

---

## Issue Worklogs

Worklogs are used to record time spent on an issue.

**Endpoint:** `GET /rest/api/3/issue/{issueIdOrKey}/worklog`
**Endpoint:** `POST /rest/api/3/issue/{issueIdOrKey}/worklog` (Add worklog)

**Request Body Example (Add Worklog):**

```json
{
  "timeSpent": "2h 30m",
  "started": "2023-10-27T10:00:00.000+0000",
  "comment": {
    "type": "doc",
    "version": 1,
    "content": [
      {
        "type": "paragraph",
        "content": [{ "type": "text", "text": "Worked on the API integration." }]
      }
    ]
  }
}
```

---

## Important Technical Notes

- **ADF Requirement**: All text-based sub-resources (Comments, Worklog comments) must use Atlassian Document Format (ADF).
- **Permissions**: Many of these operations require specific permissions like *Add comments*, *Manage attachments*, or *Work on issues*.
- **Rate Limiting**: Be mindful of per-issue limits (e.g., maximum number of comments or attachments) to avoid `413 Request Entity Too Large` errors.