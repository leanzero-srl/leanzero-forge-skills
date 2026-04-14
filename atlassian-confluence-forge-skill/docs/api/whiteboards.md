# Whiteboards API

The Whiteboards API allows you to manage collaborative whiteboards within Confluence, including creating, retrieving, updating, and deleting them, as well as managing their content properties and operations.

---

## Overview

Whiteboards are interactive, visual collaboration tools within Confluence. This API provides the necessary endpoints to integrate whiteboard management into Forge applications.

**API Version**: v2 (Current Standard)

**Base URL**: `https://{domain}.atlassian.net/wiki/api/v2`

---

## Endpoint Breakdown

### Whiteboard Management

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/whiteboards` | Create a new whiteboard in a space. |
| `GET` | `/whiteboards/{id}` | Retrieve details of a specific whiteboard. |
| `DELETE` | `/whiteboards/{id}` | Delete a whiteboard. |

**Request Example (Create Whiteboard):**

`POST /whiteboards?private=true`

```json
{
  "title": "Team Brainstorming Session",
  "description": "A space for our weekly sync."
}
```

**Response Example (Created Whiteboard):**

```json
{
  "id": "wb-98765",
  "title": "Team Brainstorming Session",
  "isPrivate": true,
  "_links": {
    "self": "/wiki/api/v2/whiteboards/wb-98765",
    "base": "https://your-site.atlassian.net/wiki"
  }
}
```

**Create Whiteboard Response Codes:**

| Code | Description |
|------|-------------|
| `200` | Returned if the whiteboard was successfully created. |
| `400` | Returned if an invalid request is provided. |
| `401` | Authentication credentials are incorrect or missing. |
| `413` | Payload Too Large - The request body exceeds 5 MB. |

**Get Whiteboard by ID:**

`GET /whiteboards/{id}?include-collaborators=true&include-properties=true`

**Response Codes:**

| Code | Description |
|------|-------------|
| `200` | Returned if the requested whiteboard is returned. |
| `400` | Invalid request provided. |
| `401` | Authentication credentials are incorrect or missing. |
| `404` | User does not have permission to view the whiteboard or it was not found. |

**Delete Whiteboard:**

`DELETE /whiteboards/{id}`

Deleting a whiteboard moves it to the trash where it can be restored later.

**Response Codes:**

| Code | Description |
|------|-------------|
| `204` | Returned if the whiteboard was successfully deleted. |
| `400` | Invalid request provided. |
| `401` | Authentication credentials are incorrect or missing. |

### Whiteboard Content Properties

Manage custom properties attached to whiteboards.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/whiteboards/{id}/properties` | List all content properties for a whiteboard. |
| `POST` | `/whiteboards/{id}/properties` | Create a new content property for a whiteboard. |
| `GET` | `/whiteboards/{whiteboard-id}/properties/{property-id}` | Get a specific content property by ID. |
| `PUT` | `/whiteboards/{whiteboard-id}/properties/{property-id}` | Update a content property. |
| `DELETE` | `/whiteboards/{whiteboard-id}/properties/{property-id}` | Delete a content property. |

**Get Content Properties:**

`GET /whiteboards/{id}/properties?key=myKey&limit=25`

**Response Codes:**

| Code | Description |
|------|-------------|
| `200` | Returned if the requested content properties are successfully retrieved. |
| `400` | Invalid request provided. |
| `401` | Authentication credentials are incorrect or missing. |
| `404` | User does not have permission to view the whiteboard or it was not found. |

**Create Content Property Request:**

```json
{
  "key": "myPropertyKey",
  "value": {
    "foo": "bar"
  }
}
```

### Whiteboard Operations

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/whiteboards/{id}/operations` | Get permitted operations for a whiteboard. |

**Response Example:**

```json
{
  "results": [
    {
      "operation": "update",
      "allowed": true
    },
    {
      "operation": "delete",
      "allowed": false
    }
  ]
}
```

### Whiteboard Hierarchy

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/whiteboards/{id}/direct-children` | Get direct children (pages, databases, folders, etc.) of a whiteboard. |
| `GET` | `/whiteboards/{id}/descendants` | Get all descendants in the content tree. |
| `GET` | `/whiteboards/{id}/ancestors` | Get all ancestors in the content tree. |

---

## Permissions & OAuth Scopes

### Required Permissions

- **View whiteboard**: Permission to view the whiteboard and its corresponding space
- **Create whiteboard**: Permission to view the corresponding space AND permission to create a whiteboard in the space
- **Update whiteboard**: Permission to edit the whiteboard
- **Delete whiteboard**: Permission to delete whiteboards in the space

### OAuth Scopes (Forge Apps)

| Scope | Required For |
|-------|--------------|
| `read:whiteboard:confluence` | GET whiteboards, GET properties |
| `write:whiteboard:confluence` | POST whiteboards, POST/PUT/DELETE properties |
| `delete:whiteboard:confluence` | DELETE whiteboards |

---

## Query Parameters Reference

### Common Parameters for Whiteboard Endpoints

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `include-collaborators` | boolean | No | Includes collaborators on the whiteboard. |
| `include-direct-children` | boolean | No | Includes direct children in response. |
| `include-operations` | boolean | No | Includes operations associated with the whiteboard. |
| `include-properties` | boolean | No | Includes content properties associated with the whiteboard. |
| `limit` | integer | No | Maximum number of items per result (default: 25). |

### Pagination Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `cursor` | string | No | Opaque cursor for pagination. Returned in Link header. |
| `sort` | string | No | Field to sort results by. |

---

## Error Responses

Common error codes for Whiteboard operations:

| Code | Description |
|------|-------------|
| `400` | Bad Request - Invalid request parameters or body. |
| `401` | Unauthorized - Authentication is missing or invalid. |
| `403` | Forbidden - Insufficient permissions to perform the action. |
| `404` | Not Found - The specified whiteboard or space was not found. |
| `413` | Payload Too Large - The request body exceeds 5 MB limit. |

---

## Official Documentation References

- [Confluence Cloud REST API v2](https://developer.atlassian.com/cloud/confluence/rest/)
- [Whiteboards API Reference](https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-whiteboard/)

**Note**: The Confluence REST API v2 is the current standard. Version 1 APIs are being deprecated.