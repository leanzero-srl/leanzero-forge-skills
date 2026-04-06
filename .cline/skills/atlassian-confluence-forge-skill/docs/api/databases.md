# Databases API

The Databases API allows you to manage structured databases within Confluence, including creating, retrieving, updating, and deleting them, as well as managing their data classification levels.

---

## Overview

Databases in Confluence provide a way to store and organize structured data. This API provides the necessary endpoints to integrate database management into Forge applications.

---

## Endpoint Breakdown

### Database Management

Core operations for managing the lifecycle of databases.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/databases` | Create a new database in a space. |
| `GET` | `/databases/{id}` | Retrieve details of a specific database. |
| `PUT` | `/databases/{id}` | Update an existing database. |
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

### Classification Level

Manage the data classification for databases.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/databases/{id}/classification-level/reset` | Reset the data classification level to the space default. |

---

## Error Responses

Common error codes for Database operations:

| Code | Description |
|------|-------------|
| `400` | Bad Request - Invalid request parameters or body. |
| `401` | Unauthorized - Authentication is missing or invalid. |
| `404` | Not Found - The specified database or space was not found. |
| `413` | Payload Too Large - The request body exceeds the 5 MB limit. |