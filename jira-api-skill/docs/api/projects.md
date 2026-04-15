# Project Management

This module covers API endpoints for managing and retrieving information about Jira Projects, including searching, retrieving details, updating, and deleting projects.

## Overview

Projects are the fundamental containers in Jira that group related issues. Managing projects typically requires high-level administrative permissions and the `manage:jira-configuration` or `manage:jira-project` Forge scopes.

### Key Concepts

| Concept | Description |
| :--- | :--- |
| **Project** | The primary container for issues, workflows, and configurations. |
| **Component** | A way to subdivide a project into logical groups (e.g., "Database", "UI"). Can have an assignee. |
| **Project Role** | A group of users (individuals, groups, or roles) that have specific permissions within a project. |
| **Project Scheme** | The mapping layer that connects a project to specific workflows, permission schemes, and notification schemes. |

### Required Forge Scopes

| Scope | Capability |
| :--- | :--- |
| `read:project:jira` | View projects, components, and roles. |
| `write:project:jira` | Create, update, or delete projects and components. |
| `manage:jira-project` | Manage project roles and assignments. |
| `manage:jira-configuration` | Required for administrative changes to global schemes and project configurations. |

---

## Core Project Operations

### Search Projects (Recommended)

Returns a paginated list of projects visible to the user. This is the recommended method for retrieving projects.

**Endpoint:** `GET /rest/api/3/project/search`

**Query Parameters:**

| Name | Type | Description |
| :--- | :--- | :--- |
| `startAt` | `integer` | Page offset. Default: `0`. |
| `maxResults` | `integer` | Max items per page. Default: `50`. |
| `orderBy` | `string` | Sorts results by a field (e.g., `key`, `name`, `issueCount`, `category`). Use `-` prefix for descending (e.g., `-name`). |
| `id` | `array[integer]` | Filter results by a list of project IDs. |
| `keys` | `array[string]` | Filter results by a list of project keys. |
| `query` | `string` | Filter results using a literal string (matches `key` or `name` case-insensitively). |
| `typeKey` | `string` | Filter by project type (`business`, `service_desk`, or `software`). |
| `categoryId` | `integer` | Filter by the ID of the project's category. |
| `action` | `string` | Filter by user access level (`view`, `browse`, `edit`, `create`). |
| `expand` | `string` | Include additional info: `description`, `projectKeys`, `lead`, `issueTypes`, `url`, `insight`. |
| `status` | `array[string]` | (EXPERIMENTAL) Filter by status: `live`, `archived`, `deleted`. |
| `properties` | `array[string]` | (EXPERIMENTAL) A list of project properties to return. |
| `propertyQuery`| `string` | (EXPERIMENTAL) Search properties using a query string. |

**Response Example (200 OK):**

```json
{
  "total": 7,
  "values": [
    {
      "id": "10000",
      "key": "EX",
      "name": "Example",
      "projectCategory": {
        "id": "10000",
        "name": "FIRST"
      },
      "self": "https://your-domain.atlassian.net/rest/api/3/project/EX",
      "style": "classic"
    }
  ]
}
```

**Error Responses:**

| Status | Description |
| :--- | :--- |
| `400` | Request is invalid. |
| `404` | No projects matching the search criteria were found. |

---

### Get Project Details

Returns the detailed information for a specific project.

**Endpoint:** `GET /rest/api/3/project/{projectIdOrKey}`

**Path Parameters:**

| Name | Type | Description |
| :--- | :--- | :--- |
| `projectIdOrKey` | `string` | **Required.** The project ID or project key (case sensitive). |

**Query Parameters:**

| Name | Type | Description |
| :--- | :--- | :--- |
| `expand` | `string` | Include additional info: `description`, `issueTypes`, `lead`, `projectKeys`, `issueTypeHierarchy`. |
| `properties` | `array[string]` | A list of project properties to return. |

**Response Example (200 OK):**

```json
{
  "id": "10000",
  "key": "EX",
  "name": "Example",
  "description": "This project was created as an example for REST.",
  "lead": {
    "accountId": "5b10a2844c20165700ede21g",
    "displayName": "Mia Krystof"
  },
  "issueTypes": [
    { "id": "1", "name": "Bug" }
  ]
}
```

---

### Update Project

Updates the details of an existing project.

**Endpoint:** `PUT /rest/api/3/project/{projectIdOrKey}`

**Request Body Parameters:**

| Name | Type | Description |
| :--- | :--- | :--- |
| `name` | `string` | New name for the project. |
| `description` | `string` | New description for the project. |
| `leadAccountId` | `string` | New project lead's Account ID. |

**Error Responses:**

| Status | Description |
| :--- | :--- |
| `403` | User lacks permission to update project details. |
| `404` | Project not found. |

---

### Delete Project

Deletes a project.

**Endpoint:** `DELETE /rest/api/3/project/{projectIdOrKey}`

**Query Parameters:**

| Name | Type | Description |
| :--- | :--- | :--- |
| `enableUndo` | `boolean` | Whether to place the project in the Jira recycle bin. Default: `true`. |

**Error Responses:**

| Status | Description |
| :--- | :--- |
| `404` | Project not found or insufficient permissions. |

---

## Project Components

Manage logical subdivisions of a project.

### Get All Components

**Endpoint:** `GET /rest/api/3/project/{projectIdOrKey}/components`

**Response Example (200 OK):**

```json
[
  {
    "id": "comp-1",
    "name": "Database",
    "description": "Backend storage components",
    "assigneeType": "COMPONENT_LEAD",
    "lead": { "accountId": "user-id-123" }
  }
]
```

### Create Component

**Endpoint:** `POST /rest/api/3/project/{projectIdOrKey}/component`

**Request Body Example:**

```json
{
  "name": "Frontend",
  "description": "User interface components",
  "assigneeType": "PROJECT_DEFAULT"
}
```

---

## Project Roles

Manage access levels within a project.

### Get Project Roles

**Endpoint:** `GET /rest/api/3/project/{projectIdOrKey}/role`

**Response Example (200 OK):**

```json
[
  {
    "id": 10001,
    "name": "Developers",
    "actors": [
      { "accountId": "user-123", "displayName": "John Doe" }
    ],
    "currentUserRole": true
  }
]
```

### Assign User to Role

**Endpoint:** `POST /rest/api/3/project/{projectIdOrKey}/role/{roleId}/assign`

**Request Body Example:**

```json
{
  "accountId": "user-456"
}
```

---

## Project Properties

Store custom metadata for a project.

**Endpoint:** `GET /rest/api/3/project/{projectIdOrKey}/properties`

**Endpoint:** `POST /rest/api/3/project/{projectIdOrKey}/properties/{propertyKey}`

**Request Body Example:**

```json
{
  "myCustomData": "some-value"
}
```

---

## Project Configuration Schemes

Access the underlying configuration that governs project behavior.

### Permission Scheme

**Endpoint:** `GET /rest/api/3/project/{projectIdOrKey}/permissionscheme`

### Notification Scheme

**Endpoint:** `GET /rest/api/3/project/{projectIdOrKey}/notificationscheme`

### Security Level Scheme

**Endpoint:** `GET /rest/api/3/project/{projectIdOrKey}/securitylevelscheme`