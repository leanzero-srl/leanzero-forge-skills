# Issue Attachments

This module covers API endpoints for managing file attachments associated with Jira issues.

## Overview

Attachments allow users and applications to add files (images, documents, logs, etc.) directly to an issue. Managing attachments programmatically is essential for automation, data ingestion, and building custom file-handling interfaces in Forge apps.

---

## Required Forge Scopes

To use these endpoints, your Forge app must have the following scopes in `manifest.yml`:

| Scope | Purpose |
| :--- | :--- |
| `read:jira-work` | Retrieve attachment metadata and download files. |
| `write:jira-work` | Upload new attachments or delete existing ones. |

---

## Managing Attachments

### List Attachments
Retrieves a list of all attachments associated with a specific issue.

**Endpoint:** `GET /rest/api/3/issue/{issueIdOrKey}/attachments`

**Response Example (200 OK):**

```json
[
  {
    "id": "10002",
    "filename": "error_log.txt",
    "mimeType": "text/plain",
    "size": 15420,
    "content": "https://your-domain.atlassian.net/rest/api/3/attachment/content/10002",
    "self": "https://your-domain.atlassian.net/rest/api/3/attachment/content/10002"
  }
]
```

### Add Attachment
Uploads a file to a specific issue. Note that this is typically a `multipart/form-data` request.

**Endpoint:** `POST /rest/api/3/issue/{issueIdOrKey}/attachments`

**Implementation Note (Forge):** 
When using `@forge/api`, you must ensure the request is correctly formatted as `multipart/form-data`.

---

### Delete Attachment
Removes an attachment from an issue.

**Endpoint:** `DELETE /rest/api/3/issue/{issueIdOrKey}/attachments/{attachmentId}`

---

## Attachment Metadata

When retrieving attachments, the following key properties are provided:

| Property | Type | Description |
| :--- | :--- | :--- |
| `id` | `string` | The unique identifier for the attachment. |
| `filename` | `string` | The name of the file, including extension. |
| `mimeType` | `string` | The MIME type of the file (e.g., `image/png`). |
| `size` | `integer` | The size of the file in bytes. |
| `content` | `string` | The URL used to download the actual file content. |

---

## Error Responses

| Status | Description |
| :--- | :--- |
| `400` | Invalid request (e.g., unsupported file type or size). |
| `401` | Authentication credentials incorrect or missing. |
| `403` | Insufficient permissions to manage attachments. |
| `404` | Issue or attachment not found. |