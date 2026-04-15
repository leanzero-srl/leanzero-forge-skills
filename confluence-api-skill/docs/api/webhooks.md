# Webhooks API

The Webhooks API allows you to subscribe to real-time events within Confluence, enabling your Forge application to react instantly to changes such as content creation, updates, or deletions.

---

## Overview

Webhooks provide a mechanism for Confluence to push notifications to your application whenever a specific event occurs. This is essential for building reactive and automated workflows.

**API Version**: v2 (Current Standard)

**Base URL**: `https://{domain}.atlassian.net/wiki/api/v2`

---

## Available Events

Forge triggers enable your app to receive notifications when specific events occur in Confluence. The general pattern is `avi:confluence:<action>:<content-type>`.

### Pages, Live Docs, and Blog Posts

| Event | Description | Content Type |
|-------|-------------|--------------|
| `avi:confluence:created:page` | New page created | Page |
| `avi:confluence:updated:page` | Page content changed | Page |
| `avi:confluence:viewed:page` | Page viewed | Page |
| `avi:confluence:trashed:page` | Page moved to trash | Page |
| `avi:confluence:restored:page` | Page restored from trash | Page |
| `avi:confluence:deleted:page` | Page permanently deleted | Page |
| `avi:confluence:archived:page` | Page archived | Page |
| `avi:confluence:unarchived:page` | Page unarchived | Page |
| `avi:confluence:moved:page` | Page moved to another location | Page |
| `avi:confluence:copied:page` | Page copied | Page |
| `avi:confluence:permissions_updated:page` | Page permissions changed | Page |
| `avi:confluence:created:blogpost` | New blog post published | Blog Post |
| `avi:confluence:updated:blogpost` | Blog post updated | Blog Post |
| `avi:confluence:liked:blogpost` | Blog post liked | Blog Post |
| `avi:confluence:viewed:blogpost` | Blog post viewed | Blog Post |
| `avi:confluence:trashed:blogpost` | Blog post moved to trash | Blog Post |
| `avi:confluence:restored:blogpost` | Blog post restored from trash | Blog Post |
| `avi:confluence:deleted:blogpost` | Blog post deleted | Blog Post |

### Comments

| Event | Description |
|-------|-------------|
| `avi:confluence:created:comment` | Comment added |
| `avi:confluence:updated:comment` | Comment edited |
| `avi:confluence:liked:comment` | Comment liked |
| `avi:confluence:deleted:comment` | Comment deleted |

### Attachments

| Event | Description |
|-------|-------------|
| `avi:confluence:created:attachment` | Attachment uploaded |
| `avi:confluence:updated:attachment` | Attachment updated |
| `avi:confluence:viewed:attachment` | Attachment viewed |
| `avi:confluence:trashed:attachment` | Attachment trashed |
| `avi:confluence:restored:attachment` | Attachment restored |
| `avi:confluence:deleted:attachment` | Attachment permanently deleted |
| `avi:confluence:archived:attachment` | Attachment archived |
| `avi:confluence:unarchived:attachment` | Attachment unarchived |

### Whiteboards, Databases, Smart Links, and Folders

| Event | Description |
|-------|-------------|
| `avi:confluence:created:whiteboard` | Whiteboard created |
| `avi:confluence:moved:whiteboard` | Whiteboard moved |
| `avi:confluence:copied:whiteboard` | Whiteboard copied |
| `avi:confluence:permissions_updated:whiteboard` | Whiteboard permissions changed |
| `avi:confluence:created:database` | Database created |
| `avi:confluence:moved:database` | Database moved |
| `avi:confluence:copied:database` | Database copied |
| `avi:confluence:permissions_updated:database` | Database permissions changed |
| `avi:confluence:created:embed` | Smart link created in content tree |
| `avi:confluence:moved:embed` | Smart link moved |
| `avi:confluence:copied:embed` | Smart link copied |
| `avi:confluence:created:folder` | Folder created |
| `avi:confluence:moved:folder` | Folder moved |
| `avi:confluence:copied:folder` | Folder copied |
| `avi:confluence:permissions_updated:folder` | Folder permissions changed |

### Spaces

| Event | Description |
|-------|-------------|
| `avi:confluence:created:space:V2` | New space created |
| `avi:confluence:updated:space:V2` | Space updated |
| `avi:confluence:permissions_updated:space:V2` | Space permissions changed |

### Users and Groups

| Event | Description |
|-------|-------------|
| `avi:confluence:created:user` | User created |
| `avi:confluence:deleted:user` | User deleted |
| `avi:confluence:created:group` | Group created |

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

---

## Official Documentation References

- [Confluence Cloud REST API v2](https://developer.atlassian.com/cloud/confluence/rest/)
- [Confluence Events Reference](https://developer.atlassian.com/platform/forge/events-reference/confluence/)
- [Forge Events Overview](https://developer.atlassian.com/platform/forge/events/)

**Note**: The Confluence REST API v2 is the current standard. Version 1 APIs are being deprecated.