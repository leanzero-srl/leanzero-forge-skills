# Permissions & Access Control

This module covers API endpoints for managing and checking permissions within Jira, including global permissions, permission schemes, and project-level access controls.

## Overview

Permissions in Jira determine what users can and cannot do (e.g., creating issues, transitioning workflows, or managing projects). Access control is managed through Permission Schemes, which can be applied at a global level or per project.

---

## Required Forge Scopes

To use these endpoints, your Forge app must have administrative-level scopes in `manifest.yml`:

| Scope | Purpose |
| :--- | :--- |
| `manage:jira-configuration` | Create, update, or delete permission schemes and assignments. |
| `read:jira-work` | View current permission settings and check permissions. |

---

## Permission Operations

### Check Permissions
Verifies if a specific user has a certain permission.

**Endpoint:** `GET /rest/api/3/permissions/check`

**Query Parameters:**

| Name | Type | Description |
| :--- | :--- | :--- |
| `permissions` | `string` | A comma-separated list of permissions to check (e.g., `BROWSE_PROJECTS,CREATE_ISSUES`). |
| `accountId` | `string` | The account ID of the user to check. |

**Response Example (200 OK):**

```json
{
  "permissions": [
    {
      "permission": "BROWSE_PROJECTS",
      "hasPermission": true
    },
    {
      "permission": "CREATE_ISSUES",
      "hasPermission": false
    }
  ]
}
```

---

### My Permissions
Retrieves the permissions for the currently authenticated user.

**Endpoint:** `GET /rest/api/3/mypermissions`

**Response Example (200 OK):**

```json
{
  "permissions": [
    {
      "permission": "BROWSE_PROJECTS",
      "hasPermission": true
    }
  ]
}
```

---

## Permission Schemes

Permission schemes define the set of permissions that are applied to a project.

### Manage Permission Schemes
Create, retrieve, and update the structure of permission schemes.

**Endpoints:**
- `GET /rest/api/3/permissionscheme` (List all schemes)
- `GET /rest/api/3/permissionscheme/{schemeId}` (Get scheme details)
- `POST /rest/api/3/permissionscheme/{schemeId}/permission` (Add a permission to a scheme)
- `DELETE /rest/api/3/permissionscheme/{schemeId}/permission/{permissionId}` (Remove a permission from a scheme)

**Response Example (200 OK) - Get Scheme Details:**

```json
{
  "id": "10100",
  "name": "Standard Software Project Scheme",
  "permissions": [
    {
      "id": "perm-1",
      "permission": "BROWSE_PROJECTS",
      "grantedTo": {
        "type": "group",
        "name": "jira-software-users"
      }
    }
  ]
}
```

### Project Permission Assignment
Assigns a specific permission scheme to a project.

**Endpoint:** `POST /rest/api/3/project/{projectKeyOrId}/permissionscheme`

**Request Body Parameters:**

| Name | Type | Description |
| :--- | :--- | :--- |
| `id` | `string` | **Required.** The ID of the permission scheme to assign. |

**Response Example (204 No Content):**
*(No response body returned on success)*

---

## Error Responses

| Status | Description |
| :--- | :--- |
| `400` | Invalid permission name or malformed request. |
| `403` | Insufficient administrative permissions to modify schemes. |
| `404` | Scheme or project not found. |