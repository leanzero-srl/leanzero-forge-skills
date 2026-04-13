# Databases API

The Databases API allows you to manage structured databases within Confluence, including creating, retrieving, updating, and deleting them, as well as managing their content properties and hierarchy.

---

## Overview

Databases in Confluence provide a way to store and organize structured data. This API provides the necessary endpoints to integrate database management into Forge applications.

**API Version**: v2 (Current Standard)

**Base URL**: `https://{domain}.atlassian.net/wiki/api/v2`

---

## Endpoint Breakdown

### Database Management

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/databases` | Create a new database in a space. |
| `GET` | `/databases/{id}` | Retrieve details of a specific database. |
| `DELETE` | `/databases/{id}` | Delete a database. |

**Request Example (Create Database):**

`POST /databases?private=true`

```json
{
  "name": "Project Inventory",
  "description": "A database to track all project assets."
}
```

**Response Example (Created Database):**

```json
{
  "id": "db-12345",
  "name": "Project Inventory",
  "isPrivate": true,
  "_links": {
    "self": "/wiki/api/v2/databases/db-12345",
    "base": "https://your-site.atlassian.net/wiki"
  }
}
```

**Create Database Response Codes:**

| Code | Description |
|------|-------------|
| `200` | Returned if the database was successfully created. |
| `400` | Returned if an invalid request is provided. |
| `401` | Authentication credentials are incorrect or missing. |
| `413` | Payload Too Large - The request body exceeds 5 MB. |

**Get Database by ID:**

`GET /databases/{id}?include-collaborators=true&include-properties=true`

**Response Codes:**

| Code | Description |
|------|-------------|
| `200` | Returned if the requested database is returned. |
| `400` | Invalid request provided. |
| `401` | Authentication credentials are incorrect or missing. |
| `404` | User does not have permission to view the database or it was not found. |

**Delete Database:**

`DELETE /databases/{id}`

Deleting a database moves it to the trash where it can be restored later.

**Response Codes:**

| Code | Description |
|------|-------------|
| `204` | Returned if the database was successfully deleted. |
| `400` | Invalid request provided. |
| `401` | Authentication credentials are incorrect or missing. |

### Database Content Properties

Manage custom properties attached to databases.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/databases/{id}/properties` | List all content properties for a database. |
| `POST` | `/databases/{id}/properties` | Create a new content property for a database. |
| `GET` | `/databases/{database-id}/properties/{property-id}` | Get a specific content property by ID. |
| `PUT` | `/databases/{database-id}/properties/{property-id}` | Update a content property. |
| `DELETE` | `/databases/{database-id}/properties/{property-id}` | Delete a content property. |

**Get Content Properties:**

`GET /databases/{id}/properties?key=myKey&limit=25`

**Response Codes:**

| Code | Description |
|------|-------------|
| `200` | Returned if the requested content properties are successfully retrieved. |
| `400` | Invalid request provided. |
| `401` | Authentication credentials are incorrect or missing. |
| `404` | User does not have permission to view the database or it was not found. |

**Create Content Property Request:**

```json
{
  "key": "myPropertyKey",
  "value": {
    "foo": "bar"
  }
}
```

### Database Operations

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/databases/{id}/operations` | Get permitted operations for a database. |

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

### Database Hierarchy

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/databases/{id}/direct-children` | Get direct children (pages, databases, folders, etc.) of a database. |
| `GET` | `/databases/{id}/descendants` | Get all descendants in the content tree. |
| `GET` | `/databases/{id}/ancestors` | Get all ancestors in the content tree. |

**Response Codes for Hierarchy Endpoints:**

| Code | Description |
|------|-------------|
| `200` | Returned if the requested children are returned. |
| `400` | Invalid request provided. |
| `401` | Authentication credentials are incorrect or missing. |
| `404` | User does not have permission to view the database or it was not found. |

---

## Permissions & OAuth Scopes

### Required Permissions

- **View database**: Permission to view the database and its corresponding space
- **Create database**: Permission to view the corresponding space AND permission to create a database in the space
- **Update database**: Permission to edit the database
- **Delete database**: Permission to delete databases in the space

### OAuth Scopes (Forge Apps)

| Scope | Required For |
|-------|--------------|
| `read:database:confluence` | GET databases, GET properties |
| `write:database:confluence` | POST databases, POST/PUT/DELETE properties |
| `delete:database:confluence` | DELETE databases |

---

## Query Parameters Reference

### Common Parameters for Database Endpoints

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `include-collaborators` | boolean | No | Includes collaborators on the database. |
| `include-direct-children` | boolean | No | Includes direct children in response. |
| `include-operations` | boolean | No | Includes operations associated with the database. |
| `include-properties` | boolean | No | Includes content properties associated with the database. |
| `limit` | integer | No | Maximum number of items per result (default: 25). |

### Pagination Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `cursor` | string | No | Opaque cursor for pagination. Returned in Link header. |
| `sort` | string | No | Field to sort results by. |

---

## Error Responses

Common error codes for Database operations:

| Code | Description |
|------|-------------|
| `400` | Bad Request - Invalid request parameters or body. |
| `401` | Unauthorized - Authentication is missing or invalid. |
| `403` | Forbidden - Insufficient permissions to perform the action. |
| `404` | Not Found - The specified database or space was not found. |
| `413` | Payload Too Large - The request body exceeds 5 MB limit. |

---

## Official Documentation References

- [Confluence Cloud REST API v2](https://developer.atlassian.com/cloud/confluence/rest/)
- [Databases API Reference](https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-database/)

**Note**: The Confluence REST API v2 is the current standard. Version 1 APIs are being deprecated.