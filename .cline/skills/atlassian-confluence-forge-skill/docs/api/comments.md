# Comments API

The Comments API allows you to manage two distinct types of comments in Confluence: **Footer Comments** and **Inline Comments**. Footer comments appear at the end of a page or blog post, while inline comments are attached to specific text selections.

---

## Overview

Confluence supports two commenting models:

1.  **Footer Comments**: Traditional comments located at the bottom of the content (Pages, Blog Posts, Attachments).
2.  **Inline Comments**: Contextual comments attached to specific parts of the content text.

### Common Query Parameters

Most comment-related endpoints support the following parameters:

| Name | Location | Type | Required | Description |
|------|----------|------|----------|-------------|
| `body-format` | query | string | No | The content format type to be returned in the `body` field (e.g., `storage`). |
| `cursor` | query | string | No | Used for pagination via the `Link` header. |
| `limit` | query | integer | No | Maximum number of comments per result (1-250). Default is 25. |
| `sort` | query | object | No | Used to sort the results by a particular field. |
| `version` | query | integer | No | For attachments, retrieves comments for a specific version. |

---

## Endpoint Breakdown

### Footer Comments

Manage comments located at the bottom of content.

| Method | Path Pattern | Description |
|--------|--------------|-------------|
| `GET` | `/attachments/{id}/footer-comments` | List footer comments for an attachment. |
| `GET` | `/pages/{id}/footer-comments` | List footer comments for a page. |
| `GET` | `/blogposts/{id}/footer-comments` | List footer comments for a blog post. |
| `GET` | `/footer-comments` | List all footer comments (global). |
| `GET` | `/footer-comments/{id}` | Retrieve a specific footer comment. |
| `POST` | `/footer-comments` | Create a new footer comment. |
| `DELETE` | `/footer-comments/{id}` | Delete a footer comment. |

### Inline Comments

Manage contextual comments attached to text.

| Method | Path Pattern | Description |
|--------|--------------|-------------|
| `GET` | `/pages/{id}/inline-comments` | List inline comments for a page. |
| `GET` | `/blogposts/{id}/inline-comments` | List inline comments for a blog post. |
| `GET` | `/inline-comments` | List all inline comments (global). |
| `GET` | `/inline-comments/{id}` | Retrieve a specific inline comment. |
| `POST` | `/inline-comments` | Create a new inline comment. |
| `DELETE` | `/inline-comments/{id}` | Delete an inline comment. |

### Comment Properties

Manage metadata (properties) attached to comments.

| Method | Path Pattern | Description |
|--------|--------------|-------------|
| `GET` | `/comments/{comment-id}/properties` | List all properties for a comment. |
| `POST` | `/comments/{comment-id}/properties` | Create a property for a comment. |
| `GET` | `/comments/{comment-id}/properties/{key}` | Get a specific property by key. |
| `PUT` | `/comments/{comment-id}/properties/{key}` | Update a specific property. |
| `DELETE` | `/comments/{comment-id}/properties/{key}` | Delete a specific property. |

---

## Response Example (Footer Comment)

```json
{
  "results": [
    {
      "id": "comment-123",
      "body": {
        "value": "This is a footer comment.",
        "representation": "storage"
      },
      "author": {
        "accountId": "user-456",
        "displayName": "John Doe"
      },
      "_links": {
        "self": "/wiki/api/v2/footer-comments/comment-123"
      }
    }
  ],
  "_links": {
    "self": "/wiki/api/v2/pages/789/footer-comments",
    "next": "/wiki/api/v2/pages/789/footer-comments?cursor=xyz"
  }
}
```

**Error Responses:**

| Code | Description |
|------|-------------|
| `400` | Returned if an invalid request is provided. |
| `401` | Returned if the authentication credentials are incorrect or missing. |
| `404` | Returned if the comment or its parent content was not found. |