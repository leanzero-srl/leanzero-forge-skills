# Confluence Cloud REST API v2 - Comprehensive Endpoints

This document contains detailed documentation for all Confluence Cloud REST API v2 endpoints, including path parameters, query parameters, request bodies, response codes, required OAuth scopes for Forge apps, and permission requirements.

---

## Base URL

```
https://{domain}.atlassian.net/wiki/api/v2
```

**API Version**: v2 (Current Standard)

All endpoints use OAuth 2.0 authentication via Forge's `@forge/bridge` or `@forge/api` packages.

---

## Table of Contents

1. [Attachments API](#attachments-api)
2. [Blog Posts API](#blog-posts-api)
3. [Classification Levels API](#classification-levels-api)
4. [Comments API](#comments-api)
5. [Content Properties API](#content-properties-api)
6. [Custom Content API](#custom-content-api)
7. [Data Policies API](#data-policies-api)
8. [Databases API](#databases-api)
9. [Embeds/Smart Links API](#embedssmart-links-api)
10. [Folders API](#folders-api)
11. [Labels API](#labels-api)
12. [Pages API](#pages-api)
13. [Spaces API](#spaces-api)
14. [Tasks API](#tasks-api)
15. [Users API](#users-api)
16. [Whiteboards API](#whiteboards-api)

---

## Attachments API

### Overview
Manage files attached to Confluence content (pages, blog posts, whiteboards, etc.).

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/attachments` | List all attachments with filtering. |
| `GET` | `/attachments/{id}` | Get a specific attachment by ID. |
| `DELETE` | `/attachments/{id}` | Delete an attachment. |

### Query Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `filename` | string | No | Filter by filename. |
| `media-type` | string | No | Filter by media type (MIME type). |
| `expand` | array<string> | No | Expand related content (e.g., versions, properties). |
| `limit` | integer | No | Maximum number of results per page. |

### Response Codes

| Code | Description |
|------|-------------|
| `200` | Attachments successfully retrieved. |
| `401` | Authentication credentials are incorrect or missing. |
| `404` | Attachment not found. |

### OAuth Scopes (Forge)

- `read:confluence-content.summary` - List and view attachments

---

## Blog Posts API

### Overview
Create, retrieve, update, and delete blog posts in Confluence spaces.

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/blogposts` | List all blog posts with filtering. |
| `POST` | `/blogposts` | Create a new blog post. |
| `GET` | `/blogposts/{id}` | Get a specific blog post by ID. |
| `PUT` | `/blogposts/{id}` | Update an existing blog post. |
| `DELETE` | `/blogposts/{id}` | Delete a blog post. |

### Query Parameters (List Blog Posts)

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `space-id` | integer | No | Filter by space ID. |
| `title` | string | No | Filter by title. |
| `status` | string | No | Filter by status (current, draft). |
| `expand` | array<string> | No | Expand related content. |
| `limit` | integer | No | Maximum number of results per page. |

### Request Body (Create Blog Post)

```json
{
  "title": "My Blog Post",
  "spaceId": 178263459270,
  "body": {
    "storage": {
      "value": "<p>Blog post content</p>",
      "representation": "storage"
    }
  },
  "status": "current"
}
```

### Response Codes

| Code | Description |
|------|-------------|
| `201` | Blog post created successfully. |
| `400` | Invalid request body or missing required fields. |
| `401` | Authentication credentials are incorrect or missing. |

### OAuth Scopes (Forge)

- `read:blogpost:confluence` - View blog posts
- `write:blogpost:confluence` - Create/update blog posts

---

## Classification Levels API

### Overview
Manage data classification levels for Confluence content.

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/classification-levels` | List all available classification levels. |

### Query Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `limit` | integer | No | Maximum number of results per page. |

### Response Example

```json
{
  "results": [
    {
      "id": "classification-level-1",
      "name": "Internal",
      "description": "Content for internal use only"
    }
  ]
}
```

---

## Comments API

### Overview
Manage footer comments and inline comments on content.

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/comments` | List all comments with filtering. |
| `POST` | `/comments` | Create a new comment. |
| `GET` | `/comments/{id}` | Get a specific comment by ID. |
| `PUT` | `/comments/{id}` | Update an existing comment. |
| `DELETE` | `/comments/{id}` | Delete a comment. |

### Query Parameters (List Comments)

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `container-id` | string | No | Filter by content container ID. |
| `container-type` | string | No | Filter by container type (page, blogpost). |
| `expand` | array<string> | No | Expand user information. |
| `limit` | integer | No | Maximum number of results per page. |

### Request Body (Create Comment)

```json
{
  "container": {
    "id": "123456789",
    "type": "page"
  },
  "body": {
    "storage": {
      "value": "<p>This is a comment</p>",
      "representation": "storage"
    }
  }
}
```

### Response Codes

| Code | Description |
|------|-------------|
| `201` | Comment created successfully. |
| `400` | Invalid request body or missing required fields. |
| `401` | Authentication credentials are incorrect or missing. |

### OAuth Scopes (Forge)

- `read:confluence-content.summary` - View comments
- `write:confluence-content` - Create/update comments

---

## Content Properties API

### Overview
Store and retrieve custom metadata on Confluence content.

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/pages/{id}/properties` | List properties for a page. |
| `POST` | `/pages/{id}/properties` | Create a property for a page. |
| `GET` | `/pages/{id}/properties/{property-id}` | Get a specific property by ID. |
| `PUT` | `/pages/{id}/properties/{property-id}` | Update a property. |
| `DELETE` | `/pages/{id}/properties/{property-id}` | Delete a property. |

### Request Body (Create Property)

```json
{
  "key": "myPropertyKey",
  "value": {
    "foo": "bar"
  }
}
```

### Response Codes

| Code | Description |
|------|-------------|
| `200` | Properties successfully retrieved or created. |
| `401` | Authentication credentials are incorrect or missing. |

### OAuth Scopes (Forge)

- `read:confluence-content.summary` - Read properties
- `write:confluence-content.properties` - Write properties

---

## Custom Content API

### Overview
Manage custom content types defined by apps.

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/custom-content` | List all custom content. |
| `POST` | `/custom-content` | Create a new custom content item. |
| `GET` | `/custom-content/{id}` | Get a specific custom content by ID. |

---

## Data Policies API

### Overview
Manage data policies that apply to Confluence content.

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/data-policies/metadata` | Get data policy metadata. |
| `GET` | `/data-policies/spaces` | List spaces with data policies applied. |

---

## Databases API

### Overview
Create, retrieve, update, and delete Confluence databases.

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/databases` | Create a new database. |
| `GET` | `/databases/{id}` | Get a specific database by ID. |
| `DELETE` | `/databases/{id}` | Delete a database. |

### Query Parameters (Create Database)

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `private` | boolean | No | Create as private database. |

### Request Body (Create Database)

```json
{
  "name": "Project Inventory",
  "description": "Track project assets"
}
```

### Content Properties Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/databases/{id}/properties` | List database properties. |
| `POST` | `/databases/{id}/properties` | Create a property. |
| `GET` | `/databases/{database-id}/properties/{property-id}` | Get property by ID. |
| `PUT` | `/databases/{database-id}/properties/{property-id}` | Update property. |
| `DELETE` | `/databases/{database-id}/properties/{property-id}` | Delete property. |

### Response Codes

| Code | Description |
|------|-------------|
| `200` | Database successfully retrieved or created. |
| `204` | Database successfully deleted. |
| `401` | Authentication credentials are incorrect or missing. |
| `404` | Database not found. |

### OAuth Scopes (Forge)

- `read:database:confluence` - View databases
- `write:database:confluence` - Create/update databases
- `delete:database:confluence` - Delete databases

---

## Embeds/Smart Links API

### Overview
Manage smart links embedded in Confluence content.

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/embeds` | List all smart links. |
| `GET` | `/embeds/{id}` | Get a specific smart link by ID. |

---

## Folders API

### Overview
Create, retrieve, update, and delete folders in the content tree.

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/folders` | Create a new folder. |
| `GET` | `/folders/{id}` | Get a specific folder by ID. |
| `PUT` | `/folders/{id}` | Update an existing folder. |
| `DELETE` | `/folders/{id}` | Delete a folder. |

### Request Body (Create Folder)

```json
{
  "name": "Marketing Assets",
  "description": "Folder containing marketing content"
}
```

### Response Codes

| Code | Description |
|------|-------------|
| `201` | Folder created successfully. |
| `401` | Authentication credentials are incorrect or missing. |

---

## Labels API

### Overview
Manage labels applied to Confluence content.

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/labels` | List all labels. |
| `GET` | `/spaces/{space-id}/labels` | List labels in a space. |

### Query Parameters (List Labels)

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `prefix` | string | No | Filter by label prefix (my, team, global, system). |
| `limit` | integer | No | Maximum number of results per page. |

---

## Pages API

### Overview
Create, retrieve, update, and delete Confluence pages.

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/pages` | List all pages with filtering. |
| `POST` | `/pages` | Create a new page. |
| `GET` | `/pages/{id}` | Get a specific page by ID. |
| `PUT` | `/pages/{id}` | Update an existing page. |
| `DELETE` | `/pages/{id}` | Delete a page. |

### Query Parameters (List Pages)

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `space-id` | integer | No | Filter by space ID. |
| `title` | string | No | Filter by page title. |
| `status` | string | No | Filter by status (current, draft). |
| `expand` | array<string> | No | Expand content body and metadata. |
| `limit` | integer | No | Maximum number of results per page. |

### Request Body (Create Page)

```json
{
  "title": "My Page",
  "spaceId": 178263459270,
  "body": {
    "storage": {
      "value": "<p>Page content</p>",
      "representation": "storage"
    }
  },
  "status": "current"
}
```

### Response Codes

| Code | Description |
|------|-------------|
| `201` | Page created successfully. |
| `400` | Invalid request body or missing required fields. |
| `401` | Authentication credentials are incorrect or missing. |

### OAuth Scopes (Forge)

- `read:page:confluence` - View pages
- `write:page:confluence` - Create/update pages

---

## Spaces API

### Overview
Manage Confluence spaces and their metadata.

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/spaces` | List all spaces. |
| `POST` | `/spaces` | Create a new space. |
| `GET` | `/spaces/{id}` | Get a specific space by ID. |
| `PUT` | `/spaces/{id}` | Update an existing space. |
| `DELETE` | `/spaces/{id}` | Delete a space. |

### Query Parameters (List Spaces)

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `expand` | array<string> | No | Expand space properties and metadata. |
| `limit` | integer | No | Maximum number of results per page. |

### Response Codes

| Code | Description |
|------|-------------|
| `200` | Spaces successfully retrieved. |
| `401` | Authentication credentials are incorrect or missing. |

### OAuth Scopes (Forge)

- `read:space:confluence` - View spaces
- `write:space:confluence` - Create/update spaces

---

## Tasks API

### Overview
Manage tasks embedded in Confluence content.

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/tasks` | List all tasks with filtering. |
| `GET` | `/tasks/{id}` | Get a specific task by ID. |
| `PUT` | `/tasks/{id}` | Update a task status. |

### Query Parameters (List Tasks)

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `status` | string | No | Filter by status (complete, incomplete). |
| `space-id` | array<integer> | No | Filter by space IDs. |
| `page-id` | array<integer> | No | Filter by page IDs. |
| `assigned-to` | array<string> | No | Filter by assignee Account ID. |
| `limit` | integer | No | Maximum number of results per page (1-250). |

### Response Example

```json
{
  "results": [
    {
      "id": "5566778899",
      "status": "incomplete",
      "title": "Review the project proposal",
      "page": {
        "id": "123456789"
      },
      "assignee": {
        "accountId": "user-abc-123",
        "displayName": "Jane Smith"
      }
    }
  ]
}
```

---

## Users API

### Overview
Manage user access to Confluence content.

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/users` | List all users. |
| `GET` | `/users/permission-check` | Check user permissions. |

---

## Whiteboards API

### Overview
Create, retrieve, update, and delete Confluence whiteboards.

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/whiteboards` | Create a new whiteboard. |
| `GET` | `/whiteboards/{id}` | Get a specific whiteboard by ID. |
| `DELETE` | `/whiteboards/{id}` | Delete a whiteboard. |

### Query Parameters (Create Whiteboard)

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `private` | boolean | No | Create as private whiteboard. |

### Content Properties Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/whiteboards/{id}/properties` | List whiteboard properties. |
| `POST` | `/whiteboards/{id}/properties` | Create a property. |
| `GET` | `/whiteboards/{whiteboard-id}/properties/{property-id}` | Get property by ID. |
| `PUT` | `/whiteboards/{whiteboard-id}/properties/{property-id}` | Update property. |
| `DELETE` | `/whiteboards/{whiteboard-id}/properties/{property-id}` | Delete property. |

### Hierarchy Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/whiteboards/{id}/direct-children` | Get direct children of a whiteboard. |
| `GET` | `/whiteboards/{id}/descendants` | Get all descendants in the content tree. |
| `GET` | `/whiteboards/{id}/ancestors` | Get all ancestors in the content tree. |

### Response Codes

| Code | Description |
|------|-------------|
| `200` | Whiteboard successfully retrieved or created. |
| `204` | Whiteboard successfully deleted. |
| `401` | Authentication credentials are incorrect or missing. |
| `404` | Whiteboard not found. |

### OAuth Scopes (Forge)

- `read:whiteboard:confluence` - View whiteboards
- `write:whiteboard:confluence` - Create/update whiteboards
- `delete:whiteboard:confluence` - Delete whiteboards

---

## Authentication & Forge Integration

### Using @forge/bridge (Custom UI)

```javascript
import { requestConfluence } from '@forge/bridge';

// GET request
const response = await requestConfluence('/wiki/api/v2/pages');

// POST request
const response = await requestConfluence('/wiki/api/v2/pages', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ title: 'My Page' })
});
```

### Using @forge/api (Resolver Functions)

```javascript
import api, { route } from '@forge/api';

// GET request as user
const response = await api.asUser().requestConfluence(
  route`/wiki/api/v2/pages/${pageId}`
);

// POST request as app
const response = await api.asApp().requestConfluence(
  route`/wiki/api/v2/spaces`,
  { method: 'POST', body: JSON.stringify({ name: 'New Space' }) }
);
```

---

## Error Responses

Common error codes across all endpoints:

| Code | Description |
|------|-------------|
| `400` | Bad Request - Invalid request parameters or body. |
| `401` | Unauthorized - Authentication is missing or invalid. |
| `403` | Forbidden - Insufficient permissions to perform the action. |
| `404` | Not Found - The requested resource was not found. |
| `413` | Payload Too Large - Request body exceeds 5 MB limit. |
| `429` | Too Many Requests - Rate limit exceeded. |

---

## Official Documentation References

- [Confluence Cloud REST API v2](https://developer.atlassian.com/cloud/confluence/rest/)
- [Forge Events Reference](https://developer.atlassian.com/platform/forge/events-reference/confluence/)