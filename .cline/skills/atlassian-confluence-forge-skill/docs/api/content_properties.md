# Content Properties API

The Content Properties API allows you to attach and manage custom metadata (properties) to various Confluence content types, such as pages, blog posts, and attachments.

---

## Overview

Content Properties are key-value pairs that can be associated with a specific piece of content. They are ideal for storing application-specific metadata that doesn't belong in the main content body but needs to be persisted alongside it.

---

## Endpoint Breakdown

### Managing Content Properties

These endpoints allow you to interact with properties attached to content. The path structure varies depending on the content type (e.g., `/pages/{id}/properties`, `/attachments/{id}/properties`).

| Method | Path Pattern | Description |
|--------|--------------|-------------|
| `GET` | `/{content-type}/{id}/properties` | List all properties for a specific piece of content. |
| `GET` | `/{content-type}/{id}/properties/{key}` | Retrieve a specific property by its key. |
| `PUT` | `/{content-type}/{id}/properties/{key}` | Create or update a property. |
| `DELETE` | `/{content-type}/{id}/properties/{key}` | Delete a specific property. |

**Common Content Types:**
- `pages`
- `blogposts`
- `attachments`
- `custom-content`

**Request Example (Create/Update Property):**

`PUT /pages/123456789/properties/my-app-metadata`

```json
{
  "value": {
    "processed": true,
    "lastSync": "2024-01-15T12:00:00Z",
    "status": "active"
  }
}
```

**Response Example (Get Property):**

```json
{
  "key": "my-app-metadata",
  "value": {
    "processed": true,
    "lastSync": "2024-01-15T12:00:00Z",
    "status": "active"
  },
  "_links": {
    "self": "/wiki/api/v2/pages/123456789/properties/my-app-metadata"
  }
}
```

### Query Parameters (for GET requests)

| Name | Location | Type | Required | Description |
|------|----------|------|----------|-------------|
| `key` | query | string | No | Filters the response to return a specific property with a matching key (case sensitive). |
| `sort` | query | object | No | Used to sort the results by a particular field. |
| `cursor` | query | string | No | Used for pagination via the `Link` header. |
| `limit` | query | integer | No | Maximum number of properties per result to return. |

---

## Error Responses

Common error codes for Content Property operations:

| Code | Description |
|------|-------------|
| `400` | Bad Request - Invalid request body or property key (e.g., key too long). |
| `401` | Unauthorized - Authentication is missing or invalid. |
| `404` | Not Found - The content or the specific property was not found. |