# Labels API

The Labels API allows you to retrieve and manage labels used to organize and categorize content within Confluence, such as pages, blog posts, and attachments.

---

## Overview

Labels are lightweight tags that can be applied to content to make it easily searchable and categorizable. This API provides endpoints to discover labels associated with specific spaces, attachments, or content within a space.

---

## Endpoint Breakdown

### Retrieving Labels

These endpoints allow you to fetch lists of labels associated with different entities.

| Method | Path Pattern | Description |
|--------|--------------|-------------|
| `GET` | `/attachments/{attachment-id}/labels` | List all labels for a specific attachment. |
| `GET` | `/spaces/{space-id}/labels` | List all labels used within a specific space. |
| `GET` | `/spaces/{space-id}/content/labels` | List content labels within a specific space. |

**Response Example (List Labels):**

```json
{
  "results": [
    {
      "id": "label-123",
      "name": "engineering",
      "_links": {
        "self": "/wiki/api/v2/labels/engineering"
      }
    },
    {
      "id": "label-456",
      "name": "roadmap",
      "_links": {
        "self": "/wiki/api/v2/labels/roadmap"
      }
    }
  ],
  "_links": {
    "self": "/wiki/api/v2/spaces/178263459270/labels",
    "next": "/wiki/api/v2/spaces/178263459270/labels?cursor=xyz"
  }
}
```

### Query Parameters (for GET requests)

| Name | Location | Type | Required | Description |
|------|----------|------|----------|-------------|
| `prefix` | query | string | No | Filter the results to labels based on their prefix (e.g., `my`, `team`, `global`, `system`). |
| `sort` | query | object | No | Used to sort the result by a particular field. |
| `cursor` | query | string | No | Used for pagination via the `Link` header. |
| `limit` | query | integer | No | Maximum number of labels per result to return. |

---

## Error Responses

Common error codes for Label operations:

| Code | Description |
|------|-------------|
| `400` | Bad Request - Invalid request parameters. |
| `401` | Unauthorized - Authentication is missing or invalid. |
| `404` | Not Found - The specified space, attachment, or label was not found. |