# User Selection & Search

This module covers API endpoints designed to facilitate user discovery and selection, which are critical for building interactive Custom UIs and automated workflows in Jira.

## Overview

When building Forge apps, you often need to allow users to select other users or groups, or find users who are eligible to be assigned to a specific issue. This module documents the specialized search and picker endpoints for those use cases.

---

## Required Forge Scopes

To use these endpoints, your Forge app must have the following scopes in `manifest.yml`:

| Scope | Purpose |
| :--- | :--- |
| `read:jira-user` | Search for users and retrieve basic profile information. |
| `read:jira-work` | Required for certain assignability and group-based searches. |

---

## User Search & Querying

These endpoints allow for broad and granular searching of the user base.

### User Search

Retrieves a list of users matching a search term.

**Endpoint:** `GET /rest/api/3/users/search`

**Parameters:**
| Name | Type | In | Description |
| :--- | :--- | :--- | :--- |
| `query` | `string` | query | **Required.** The search string to match against user details. |

**Response Example (200 OK):**

```json
[
  {
    "accountId": "5b10ac8d82e05b22cc7d4ef5",
    "displayName": "John Doe"
  }
]
```

### Query-Based User Search

A more advanced search endpoint for complex queries.

**Endpoint:** `GET /rest/api/3/user/search/query`

---

## Assignability

Finding users who are actually eligible to be assigned to a specific project or issue is vital for data integrity.

### Assignable Users Search

Finds users who are assignable to a project or across multiple projects.

**Endpoint:** `GET /rest/api/3/user/assignable/search`

**Parameters:**
| Name | Type | In | Description |
| :--- | :--- | :--- | :--- |
| `projectKey` | `string` | query | The key of the project to search within. |

**Endpoint:** `GET /rest/api/3/user/assignable/multiProjectSearch`

---

## User & Group Pickers

These endpoints are optimized for use in UI components like dropdowns or autocomplete fields.

### User Picker

Provides a streamlined way to find users via a search string.

**Endpoint:** `GET /rest/api/3/user/picker`

### Group User Picker

Finds users belonging to specific groups, often used in group-based selection UIs.

**Endpoint:** `GET /rest/api/3/groupuserpicker`

---

## Error Responses

| Status | Description |
| :--- | :--- |
| `400` | Invalid search query or malformed request. |
| `401` | Authentication credentials incorrect or missing. |
| `403` | Insufficient permissions to search users or groups. |
| `404` | No matching users or groups found. |