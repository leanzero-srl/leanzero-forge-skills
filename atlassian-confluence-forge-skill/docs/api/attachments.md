# Attachments API

The Attachments API allows you to manage files attached to Confluence content, including listing attachments, retrieving file details, managing versions, and handling associated metadata.

---

## Overview

Attachments are files (images, documents, etc.) that can be uploaded and associated with pages, blog posts, or other content. This API provides full control over the attachment lifecycle and their related properties.

---

## Endpoint Breakdown

### Attachment Management

Core operations for managing the existence and retrieval of attachments.

| Method | Path Pattern | Description |
|--------|--------------|-------------|
| `GET` | `/attachments` | List all attachments (supports filtering by filename, media type, etc.). |
| `GET` | `/attachments/{id}` | Retrieve details of a specific attachment. |
| `DELETE` | `/attachments/{id}` | Delete an attachment. |

**Response Example (Get Attachment):**

```json
{
  "id": "att-12345",
  "title": "Project_Plan.pdf",
  "mimeType": "application/pdf",
  "size": 1048576,
  "createdDate": "2024-01-15T10:30:00.000Z",
  "_links": {
    "self": "/wiki/api/v2/attachments/att-12345"
  }
}
```

### Versions & Operations

Manage the history and operational state of an attachment.

| Method | Path Pattern | Description |
|--------|--------------|-------------|
| `GET` | `/attachments/{id}/versions` | List all versions of an attachment. |
| `GET` | `/attachments/{id}/versions/{version-number}` | Retrieve a specific version of an attachment. |
| `GET` | `/attachments/{id}/operations` | Retrieve available operations for an attachment. |

### Metadata & Interactions

Manage labels, properties, and comments associated with an attachment.

| Method | Path Pattern | Description |
|--------|--------------|-------------|
| `GET` | `/attachments/{id}/labels` | List all labels for an attachment. |
| `GET` | `/attachments/{id}/footer-comments` | List footer comments for an attachment. |
| `GET` | `/attachments/{attachment-id}/properties` | List all content properties for an attachment. |

---

## Error Responses

Common error codes for Attachment operations:

| Code | Description |
|------|-------------|
| `400` | Bad Request - Invalid request parameters or body. |
| `401` | Unauthorized - Authentication is missing or invalid. |
| `404` | Not Found - The specified attachment was not found. |