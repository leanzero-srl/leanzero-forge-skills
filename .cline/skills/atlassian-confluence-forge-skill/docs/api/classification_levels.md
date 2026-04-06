# Classification Levels API

The Classification Levels API allows you to manage and discover data classification levels used for Data Loss Prevention (DLP) within Confluence.

---

## Overview

Classification levels are used to categorize content based on its sensitivity. This helps organizations implement data security policies by identifying and protecting sensitive information. This API provides tools to list available levels, check space defaults, and reset classifications for specific content types.

---

## Endpoint Breakdown

### Discovery & Defaults

Endpoints to understand the classification landscape of your Confluence site.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/classification-levels` | List all available classification levels. |
| `GET` | `/spaces/{id}/classification-level/default` | Retrieve the default classification level for a specific space. |

**Response Example (Classification Level):**

```json
{
  "id": "level-123",
  "name": "Confidential",
  "description": "Sensitive information that requires restricted access."
}
```

### Resetting Classification

Endpoints to reset the classification level of content back to its space default.

| Method | Path Pattern | Description |
|--------|--------------|-------------|
| `POST` | `/pages/{id}/classification-level/reset` | Reset the classification level for a page. |
| `POST` | `/blogposts/{id}/classification-level/reset` | Reset the classification level for a blog post. |
| `POST` | `/whiteboards/{id}/classification-level/reset` | Reset the classification level for a whiteboard. |
| `POST` | `/databases/{id}/classification-level/reset` | Reset the classification level for a database. |

---

## Error Responses

Common error codes for Classification Level operations:

| Code | Description |
|------|-------------|
| `400` | Bad Request - Invalid request parameters. |
| `401` | Unauthorized - Authentication is missing or invalid. |
| `404` | Not Found - The specified content or classification level was not found. |