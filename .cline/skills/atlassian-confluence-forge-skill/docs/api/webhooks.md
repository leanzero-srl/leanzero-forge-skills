# Webhooks API

The Webhooks API allows you to subscribe to real-time events within Confluence, enabling your Forge application to react instantly to changes such as content creation, updates, or deletions.

---

## Overview

Webhooks provide a mechanism for Confluence to push notifications to your application whenever a specific event occurs. This is essential for building reactive and automated workflows.

---

## Available Events

Forge triggers enable your app to receive notifications when specific events occur in Confluence. The general pattern is `avi:confluence:<action>:<content-type>`.

| Event | Description | Content Type |
|-------|-------------|--------------|
| `avi:confluence:created:page` | New page created | Page |
| `avi:confluence:updated:page` | Page content changed | Page |
| `avi:confluence:viewed:page` | Page viewed | Page |
| `avi:confluence:trashed:page` | Page moved to trash | Page |
| `avi:confluence:restored:page` | Page restored from trash | Page |
| `avi:confluence:deleted:page` | Page permanently deleted | Page |
| `avi:confluence:created:blogpost` | New blog post published | Blog Post |
| `avi:confluence:updated:blogpost` | Blog post updated | Blog Post |
| `avi:confluence:deleted:blogpost` | Blog post moved to trash | Blog Post |
| `avi:confluence:created:comment` | Comment added | Comment |
| `avi:confluence:updated:comment` | Comment edited | Comment |
| `avi:confluence:liked:comment` | Comment liked | Comment |
| `avi:confluence:deleted:comment` | Comment deleted | Comment |
| `avi:confluence:created:attachment` | Attachment uploaded | Attachment |
| `avi:confluence:updated:attachment` | Attachment updated | Attachment |
| `avi:confluence:viewed:attachment` | Attachment viewed | Attachment |
| `avi:confluence:deleted:attachment` | Attachment permanently deleted | Attachment |
| `avi:confluence:created:whiteboard` | Whiteboard created | Whiteboard |
| `avi:confluence:created:database` | Database created | Database |
| `avi:confluence:created:embed` | Smart link created in content tree | Embed |
| `avi:confluence:created:space:V2` | New space created | Space |
| `avi:confluence:created:user` | User created | User |
| `avi:confluence:created:group` | Group created | Group |

---

## Webhook Payload Examples

When a webhook is triggered, the payload contains details about the event and the affected content.

### Page Created Event Payload

```json
{
  "event": "avi:confluence:page:created",
  "issueId": null,
  "data": {
    "space": {
      "id": 178263459270,
      "key": "~username",
      "name": "Personal Space"
    },
    "content": {
      "id": "123456789",
      "title": "My New Page",
      "type": "page",
      "status": "current",
      "createdDate": "2024-01-15T10:30:00.000Z",
      "lastModified": "2024-01-15T10:30:00.000Z",
      "author": {
        "accountId": "5b10a2844c20165700ede21g"
      },
      "body": {
        "storage": {
          "value": "<p>Page content here</p>",
          "representation": "storage",
          "width": 100
        }
      }
    },
    "user": {
      "accountId": "5b10a2844c20165700ede21g",
      "displayName": "John Doe"
    },
    "url": "/spaces/~username/pages/123456789/My-New-Page"
  }
}
```

### Page Updated Event Payload

```json
{
  "event": "avi:confluence:page:updated",
  "issueId": null,
  "data": {
    "space": {
      "id": 178263459270,
      "key": "~username",
      "name": "Personal Space"
    },
    "content": {
      "id": "123456789",
      "title": "My Updated Page",
      "type": "page",
      "status": "current",
      "createdDate": "2024-01-15T10:30:00.000Z",
      "lastModified": "2024-01-15T11:45:00.000Z",
      "author": {
        "accountId": "5b10a2844c20165700ede21g"
      },
      "version": {
        "number": 3,
        "message": "Updated content"
      }
    },
    "user": {
      "accountId": "5b10a2844c20165700ede21g",
      "displayName": "John Doe"
    },
    "url": "/spaces/~username/pages/123456789/My-Updated-Page"
  }
}
```

### Page Deleted Event Payload

```json
{
  "event": "avi:confluence:page:deleted",
  "issueId": null,
  "data": {
    "space": {
      "id": 178263459270,
      "key": "~username"
    },
    "content": {
      "id": "123456789",
      "title": "Deleted Page",
      "type": "page"
    }
  }
}
```

---

## Error Responses

Common error codes for Webhook operations:

| Code | Description |
|------|-------------|
| `401` | Unauthorized - Authentication is missing or invalid. |
| `403` | Forbidden - Insufficient permissions to manage webhooks. |
| `404` | Not Found - The specified webhook was not found. |