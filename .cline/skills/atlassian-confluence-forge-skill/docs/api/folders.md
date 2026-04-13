# Folders API

The Folders API allows you to manage folders within the Confluence content tree, enabling hierarchical organization of content.

---

## Overview

Folders provide a way to group and organize content (like pages or smart links) into a structured hierarchy. This API enables programmatic creation, retrieval, and management of these organizational units.

**API Version**: v2 (Current Standard)

**Base URL**: `https://{domain}.atlassian.net/wiki/api/v2`

---

## Endpoint Breakdown

### Folder Management

Core operations for managing the lifecycle of folders.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/folders` | Create a new folder in a space. |
| `GET` | `/folders/{id}` | Retrieve details of a specific folder. |
| `PUT` | `/folders/{id}` | Update an existing folder. |
| `DELETE` | `/folders/{id}` | Delete a folder. |

**Request Example (Create Folder):**

`POST /folders`

```json
{
  "name": "Marketing Assets",
  "description": "Folder containing all marketing related content."
}
```

**Response Example (Created Folder):**

```json
{
  "id": "folder-54321",
  "name": "Marketing Assets",
  "_links": {
    "self": "/wiki/api/v2/folders/folder-54321",
    "base": "https://your-site.atlassian.net/wiki"
  }
}
```

### Hierarchy Discovery

Traverse the content tree relative to a folder.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/folders/{id}/ancestors` | Retrieve all ancestors of a folder in top-to-bottom order. |

**Response Example (Get Ancestors):**

```json
{
  "results": [
    {
      "id": "parent-folder-1",
      "type": "folder",
      "_links": {
        "self": "/wiki/api/v2/folders/parent-folder-1"
      }
    },
    {
      "id": "root-space",
      "type": "space",
      "_links": {
        "self": "/wiki/api/v2/spaces/root-space"
      }
    }
  ]
}
```

### Query Parameters (for `/folders/{id}/ancestors`)

| Name | Location | Type | Required | Description |
|------|----------|------|----------|-------------|
| `limit` | query | integer | No | Maximum number of items per result to return. |

---

## Authentication

Forge apps use automatic OAuth via manifest scopes:

- **Custom UI (frontend)**: Use `requestConfluence()` from `@forge/bridge`
- **Resolver functions (backend)**: Use `api.asUser().requestConfluence()` or `api.asApp().requestConfluence()` from `@forge/api`

---

## Error Responses

Common error codes for Folder operations:

| Code | Description |
|------|-------------|
| `400` | Bad Request - Invalid request parameters or body. |
| `401` | Unauthorized - Authentication is missing or invalid. |
| `404` | Not Found - The specified folder or space was not found. |
| `413` | Payload Too Large - The request body exceeds the 5 MB limit. |

---

## Official Documentation References

- [Confluence Cloud REST API v2](https://developer.atlassian.com/cloud/confluence/rest/)
- [Folders API Reference](https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-folder/)

**Note**: The Confluence REST API v2 is the current standard. Version 1 APIs are being deprecated.