# Issue Links

This module covers API endpoints for managing relationships between Jira issues, including standard issue links and remote links (external references).

## Overview

Issue links allow users to create connections between issues (e.g., "blocks", "relates to", "is caused by"). Remote links allow issues to be connected to external content (e.s., a GitHub PR or a Confluence page) via a URL.

---

## Required Forge Scopes

To use these endpoints, your Forge app must have the following scopes in `manifest.yml`:

| Scope | Purpose |
| :--- | :--- |
| `read:jira-work` | View existing issue links and remote links. |
| `write:jira-work` | Create, update, or delete issue links and remote links. |

---

## Issue Links (Internal)

Internal links connect two Jira issues within the same instance.

### Get Issue Links
Retrieves a list of all issue links associated with a specific issue.

**Endpoint:** `GET /rest/api/3/issue/{issueIdOrKey}/connections`
*(Note: While the `issueLink` path is used for management, connections are typically retrieved via the issue resource or the connections endpoint in v3)*

**Response Example (200 OK):**

```json
{
  "issues": [
    {
      "id": "10001",
      "key": "PROJ-1",
      "type": {
        "name": "Blocks",
        "inward": "is blocked by",
        "outward": "blocks"
      }
    }
  ]
}
```

### Create Issue Link
Creates a link between two issues.

**Endpoint:** `POST /rest/api/3/issueLink`

**Request Body Parameters:**

| Name | Type | Description |
| :--- | :--- | :--- |
| `type` | `object` | **Required.** The link type (e.g., `{"name": "Blocks"}`). |
| `inwardIssue` | `object` | The issue that is the "inward" side of the link. |
| `outwardIssue` | `object` | The issue that is the "outward" side of the link. |

**Request Body Example:**

```json
{
  "type": {
    "name": "Blocks"
  },
  "outwardIssue": {
    "key": "PROJ-1"
  },
  "inwardIssue": {
    "key": "PROJ-2"
  }
}
```

**Response Example (201 Created):**

```json
{
  "id": "12345",
  "type": {
    "name": "Blocks",
    "inward": "is blocked by",
    "outward": "blocks"
  },
  "outwardIssue": { "key": "PROJ-1" },
  "inwardIssue": { "key": "PROJ-2" }
}
```

---

## Remote Links

Remote links connect a Jira issue to an external URL.

### List Remote Links
Retrieves all remote links for a specific issue.

**Endpoint:** `GET /rest/api/3/issue/{issueIdOrKey}/remotelink`

**Response Example (200 OK):**

```json
[
  {
    "id": "remote-link-1",
    "object": {
      "url": "https://github.com/repo/pull/1",
      "title": "Pull Request #1"
    },
    "url": "https://github.com/repo/pull/1"
  }
]
```

### Add Remote Link
Adds a new remote link to an issue.

**Endpoint:** `POST /rest/api/3/issue/{issueIdOrKey}/remotelink`

**Request Body Parameters:**

| Name | Type | Description |
| :--- | :--- | :--- |
| `object` | `object` | **Required.** The remote object details. |
| `object.url` | `string` | **Required.** The URL of the external resource. |
| `object.title` | `string` | The display title for the link. |

**Request Body Example:**

```json
{
  "object": {
    "url": "https://confluence.example.com/page/123",
    "title": "Project Documentation"
  }
}
```

---

## Error Responses

| Status | Description |
| :--- | :--- |
| `400` | Invalid link type or malformed request body. |
| `403` | Insufficient permissions to manage links. |
| `404` | Issue or link not found. |