# Pages API

The Pages API provides comprehensive tools for creating, retrieving, updating, and deleting Confluence pages, as well as managing their versions, hierarchy, and associated metadata.

---

## Overview

Pages are the fundamental building blocks of Confluence. This API allows you to manage the entire lifecycle of a page, from its initial creation and title management to complex operations like version control, redaction, and hierarchical organization.

---

## Endpoint Breakdown

### Page Management

Core operations for managing the existence and basic details of pages.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/pages` | List pages (supports filtering and pagination). |
| `POST` | `/pages` | Create a new page. |
| `GET` | `/pages/{id}` | Retrieve details of a specific page. |
| `PUT` | `/pages/{id}` | Update a page's content or metadata. |
| `DELETE` | `/pages/{id}` | Delete a page. |

**Response Example (Get Page):**

```json
{
  "id": "123456789",
  "title": "My Awesome Page",
  "type": "page",
  "status": "current",
  "body": {
    "storage": {
      "value": "<p>Hello World</p>",
      "representation": "storage"
    }
  },
  "_links": {
    "self": "/wiki/api/v2/pages/123456789"
  }
}
```

### Content & Metadata Operations

Manage specific aspects of a page without updating the entire object.

| Method | Path | Description |
|--------|------|-------------|
| `PUT` | `/pages/{id}/title` | Update only the title of a page. |
| `POST` | `/pages/{id}/redact` | Redact sensitive information from a page. |
| `GET` | `/pages/{id}/versions` | List all versions of a page. |
| `POST` | `/pages/{id}/classification-level/reset` | Reset the page's data classification level. |

### Hierarchy & Relationships

Navigate and manage the structural relationship between pages.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/pages/{id}/children` | List all children of a page (paginated). |
| `GET` | `/pages/{id}/direct-children` | List only the immediate children of a page. |
| `GET` | `/pages/{id}/ancestors` | Retrieve the lineage of ancestors for a page. |
| `GET` | `/pages/{id}/descendants` | Retrieve all descendants in the hierarchy. |

### Interactions & Attachments

Manage how users interact with the page and what files are attached to it.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/pages/{id}/attachments` | List all attachments for a page. |
| `GET` | `/pages/{id}/likes/count` | Get the total number of likes for a page. |
| `GET` | `/pages/{id}/likes/users` | List the users who have liked a page. |
| `GET` | `/pages/{id}/labels` | List all labels associated with a page. |

---

## Error Responses

Common error codes for Page operations:

| Code | Description |
|------|-------------|
| `400` | Bad Request - Invalid request parameters or body. |
| `401` | Unauthorized - Authentication is missing or invalid. |
| `403` | Forbidden - Insufficient permissions to perform the action. |
| `404` | Not Found - The specified page was not found. |