# Project Assets: Components & Versions

This module covers API endpoints for managing project-level assets used for organization and release management: **Components** and **Versions**.

## Overview

Project assets help categorize work and manage delivery cycles:
- **Components**: Sub-sections of a project used to group issues (e.g., "Frontend", "Database", "API").
- **Versions (Releases)**: Used to track progress and manage releases (e.g., "v1.0", "Q3 Release").

---

## Required Forge Scopes

To use these endpoints, your Forge app must have the following scopes in `manifest.yml`:

| Scope | Purpose |
| :--- | :--- |
| `manage:jira-configuration` | Create, update, or delete components and versions. |
| `read:jira-work` | View components and version information. |

---

## Project Components

Components allow for granular categorization of issues within a project.

### Component Operations

**Endpoints:**
- `GET /rest/api/3/project/{projectIdOrKey}/components` (List all components in a project)
- `POST /rest/api/3/project/{projectIdOrKey}/component` (Create a new component)
- `GET /rest/api/3/component/{id}` (Get specific component details)
- `PUT /rest/api/3/component/{id}` (Update a component)
- `DELETE /rest/api/3/component/{id}` (Delete a component)

**Response Example (200 OK) - List Components:**

```json
[
  {
    "id": "10001",
    "name": "Frontend",
    "description": "UI and client-side logic",
    "lead": {
      "accountId": "5b10ac8d82e05b22cc7d4ef5",
      "displayName": "John Doe"
    }
  }
]
```

---

## Project Versions (Releases)

Versions are used to track software releases and manage the lifecycle of issues.

### Version Operations

**Endpoints:**
- `GET /rest/api/3/project/{projectIdOrKey}/versions` (List all versions in a project)
- `POST /rest/api/3/project/{projectIdOrKey}/version` (Create a new version)
- `GET /rest/api/3/version/{id}` (Get specific version details)
- `PUT /rest/api/3/version/{id}` (Update a version)
- `DELETE /rest/api/3/version/{id}` (Delete a version)

**Response Example (200 OK) - List Versions:**

```json
[
  {
    "id": "10002",
    "name": "v1.0",
    "description": "Initial production release",
    "released": true,
    "releaseDate": "2024-01-01"
  }
]
```

### Advanced Version Management

Manage the movement and merging of versions to maintain release integrity.

**Endpoints:**
- `POST /rest/api/3/version/{id}/move` (Move a version to a new name/release date)
- `POST /rest/api/3/version/{id}/mergeto/{moveIssuesTo}` (Merge one version into another, moving all issues)
- `POST /rest/api/3/version/{id}/removeAndSwap` (Remove a version and swap its issues to another version)

---

## Error Responses

| Status | Description |
| :--- | :--- |
| `400` | Invalid component/version data or malformed request. |
| `403` | Insufficient administrative permissions. |
| `404` | Component, version, or project not found. |