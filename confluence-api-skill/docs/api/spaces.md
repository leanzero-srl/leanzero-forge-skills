# Spaces API

The Spaces API allows you to manage Confluence spaces, including retrieving space details, managing their configuration, and accessing content organized within them.

---

## Overview

Spaces are the primary containers for content in Confluence. This API provides tools to manage the lifecycle of a space, its metadata (properties), permissions, and the various types of content (pages, blog posts, etc.) that reside within it.

**API Version**: v2 (Current Standard)

**Base URL**: `https://{domain}.atlassian.net/wiki/api/v2`

---

## Endpoint Breakdown

### Space Management

Core operations for managing the existence and basic details of spaces.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/spaces` | List all spaces (supports filtering by ID, key, type, status, etc.). |
| `GET` | `/spaces/{id}` | Retrieve details of a specific space. |
| `PUT` | `/spaces/{id}` | Update a space's details. |
| `DELETE` | `/spaces/{id}` | Delete a space. |

**Response Example (Get Space):**

```json
{
  "id": "178263459270",
  "key": "ENGINEERING",
  "name": "Engineering Space",
  "type": "collaboration",
  "status": "current",
  "_links": {
    "self": "/wiki/api/v2/spaces/178263459270"
  }
}
```

### Content within Spaces

Retrieve content organized under a specific space.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/spaces/{id}/pages` | List all pages within a space. |
| `GET` | `/spaces/{id}/blogposts` | List all blog posts within a space. |
| `GET` | `/spaces/{id}/labels` | List all labels used within a space. |
| `GET` | `/spaces/{id}/content/labels` | List content labels within a space. |
| `GET` | `/spaces/{id}/custom-content` | List custom content within a space. |

### Configuration & Metadata

Manage space-level settings and properties.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/spaces/{space-id}/properties` | List all properties for a space. |
| `PUT` | `/spaces/{space-id}/properties` | Create or update a property for a space. |
| `DELETE` | `/spaces/{space-id}/properties/{property-id}` | Delete a specific property from a space. |
| `GET` | `/spaces/{id}/permissions` | Retrieve permissions for a space. |
| `GET` | `/spaces/{id}/role-assignments` | List role assignments within a space. |
| `DELETE` | `/spaces/{id}/classification-level/default` | Delete the default data classification level for a space. |

---

## Authentication

Forge apps use automatic OAuth via manifest scopes:

- **Custom UI (frontend)**: Use `requestConfluence()` from `@forge/bridge`
- **Resolver functions (backend)**: Use `api.asUser().requestConfluence()` or `api.asApp().requestConfluence()` from `@forge/api`

---

## Error Responses

Common error codes for Space operations:

| Code | Description |
|------|-------------|
| `400` | Bad Request - Invalid request parameters or body. |
| `401` | Unauthorized - Authentication is missing or invalid. |
| `403` | Forbidden - Insufficient permissions to manage the space. |
| `404` | Not Found - The specified space was not found. |

---

## Official Documentation References

- [Confluence Cloud REST API v2](https://developer.atlassian.com/cloud/confluence/rest/)
- [Spaces API Reference](https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-space/)

**Note**: The Confluence REST API v2 is the current standard. Version 1 APIs are being deprecated.