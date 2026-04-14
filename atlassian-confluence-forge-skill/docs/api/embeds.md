# Embeds API

The Embeds API allows you to manage Smart Links within the Confluence content tree, providing a way to programmatically create and retrieve embedded content representations.

---

## Overview

Smart Links (Embeds) are interactive representations of external or internal content within the Confluence content tree. This API enables developers to manage these links and traverse their hierarchical structure.

---

## Endpoint Breakdown

### Smart Link Management

Core operations for managing individual Smart Links.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/embeds` | Create a new Smart Link in the content tree. |
| `GET` | `/embeds/{id}` | Retrieve details of a specific Smart Link. |

**Request Example (Create Smart Link):**

`POST /embeds`

```json
{
  "url": "https://example.com/resource",
  "title": "External Resource"
}
```

**Response Example (Created Smart Link):**

```json
{
  "id": "embed-98765",
  "url": "https://example.com/resource",
  "title": "External Resource",
  "_links": {
    "self": "/wiki/api/v2/embeds/embed-98765",
    "base": "https://your-site.atlassian.net/wiki"
  }
}
```

### Hierarchy Discovery

Traverse the content tree relative to a Smart Link.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/embeds/{id}/ancestors` | Retrieve all ancestors of a Smart Link in top-to-bottom order. |

**Response Example (Get Ancestors):**

```json
{
  "results": [
    {
      "id": "ancestor-1",
      "type": "page",
      "_links": {
        "self": "/wiki/api/v2/embeds/ancestor-1"
      }
    },
    {
      "id": "ancestor-2",
      "type": "space",
      "_links": {
        "self": "/wiki/api/v2/embeds/ancestor-2"
      }
    }
  ]
}
```

### Query Parameters (for `/embeds/{id}/ancestors`)

| Name | Location | Type | Required | Description |
|------|----------|------|----------|-------------|
| `limit` | query | integer | No | Maximum number of items per result to return. |

---

## Error Responses

Common error codes for Embed operations:

| Code | Description |
|------|-------------|
| `400` | Bad Request - Invalid request parameters or body. |
| `401` | Unauthorized - Authentication is missing or invalid. |
| `404` | Not Found - The specified Smart Link or ancestor was not found. |
| `413` | Payload Too Large - The request body exceeds the 5 MB limit. |