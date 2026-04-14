# Issue Remote Links

This module covers API endpoints for managing remote links (web links) associated with Jira issues.

## Overview

Remote links allow you to connect a Jira issue to external resources, such as a GitHub pull request, a Confluence page, or any other URL. These links appear in the "Web links" section of an issue, providing context and traceability across different platforms.

---

## Required Forge Scopes

To use these endpoints, your Forge app must have the following scopes in `manifest.yml`:

| Scope | Purpose |
| :--- | :--- |
| `read:jira-work` | Retrieve remote links from an issue. |
| `write:jira-work` | Add or remove remote links from an issue. |

---

## Managing Remote Links

### List Remote Links
Retrieves all remote links associated with a specific issue.

**Endpoint:** `GET /rest/api/3/issue/{issueIdOrKey}/remotelink`

**Response Example (200 OK):**

```json
[
  {
    "id": "12345",
    "title": "GitHub Pull Request #42",
    "url": "https://github.com/org/repo/pull/42",
    "object": {
      "url": "https://github.com/org/repo/pull/42",
      "icon": {
        "url": "https://github.com/images/favicon.ico"
      }
    }
  }
]
```

### Add Remote Link
Adds a new remote link to a specific issue.

**Endpoint:** `POST /rest/api/3/issue/{issueIdOrKey}/remotelink`

**Request Body Example:**

```json
{
  "object": {
    "url": "https://github.com/org/repo/pull/42",
    "title": "GitHub Pull Request #42"
  },
  "url": "https://github.com/org/repo/pull/42"
}
```

### Delete Remote Link
Removes a specific remote link from an issue.

**Endpoint:** `DELETE /rest/api/3/issue/{issueIdOrKey}/remotelink/{linkId}`

---

## Link Object Structure

A remote link consists of a `url` (the destination) and an `object` (the representation of the external resource).

| Property | Type | Description |
| :--- | :--- | :--- |
| `url` | `string` | The actual URL the link points to. |
| `object.url` | `string` | The URL of the object being linked. |
| `object.title` | `string` | The display title for the link. |
| `object.icon.url` | `string` | (Optional) The URL of the icon representing the external service. |

---

## Error Responses

| Status | Description |
| :--- | :--- |
| `400` | Invalid link data or malformed request body. |
| `401` | Authentication credentials incorrect or missing. |
| `403` | Insufficient permissions to manage remote links. |
| `404` | Issue or remote link not found. |