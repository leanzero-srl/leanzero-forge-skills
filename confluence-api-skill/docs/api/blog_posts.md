# Blog Posts API

The Blog Posts API allows you to manage blog posts within Confluence, including listing, creating, updating, and deleting them, as well as managing their associated metadata and interactions.

---

## Overview

Blog posts are a type of content in Confluence used for announcements and updates. This API provides full lifecycle management for blog posts and their related entities like attachments, labels, and likes.

---

## Endpoint Breakdown

### Blog Post Management

Core operations for managing the existence and basic details of blog posts.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/blogposts` | List blog posts (supports filtering by space, status, title, etc.). |
| `GET` | `/blogposts/{id}` | Retrieve details of a specific blog post. |
| `PUT` | `/blogposts/{id}` | Update a blog post's content or metadata. |
| `DELETE` | `/blogposts/{id}` | Delete a blog post. |

**Response Example (Get Blog Post):**

```json
{
  "id": "123456789",
  "title": "Our Monthly Update",
  "type": "blogpost",
  "status": "current",
  "body": {
    "storage": {
      "value": "<p>Welcome to our monthly update!</p>",
      "representation": "storage"
    }
  },
  "_links": {
    "self": "/wiki/api/v2/blogposts/123456789"
  }
}
```

### Metadata & Interactions

Manage specific aspects of a blog post.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/blogposts/{id}/classification-level/reset` | Reset the data classification level for a blog post. |
| `GET` | `/blogposts/{id}/attachments` | List all attachments for a blog post. |
| `GET` | `/blogposts/{id}/labels` | List all labels associated with a blog post. |
| `GET` | `/blogposts/{id}/likes/count` | Get the total number of likes for a blog post. |
| `GET` | `/blogposts/{id}/likes/users` | List the users who have liked a blog post. |

---

## Error Responses

Common error codes for Blog Post operations:

| Code | Description |
|------|-------------|
| `400` | Bad Request - Invalid request parameters or body. |
| `401` | Unauthorized - Authentication is missing or invalid. |
| `404` | Not Found - The specified blog post was not found. |