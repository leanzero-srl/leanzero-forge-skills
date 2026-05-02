# Group Management Endpoints

Manage groups and group membership in your organization.

---

## Overview

The Groups endpoints allow you to create, list, get details, assign roles, add/remove members, and delete groups within an organization's directories.

**Base URL:** `https://api.atlassian.com/admin/v2`

---

## List Groups in a Directory

Returns a page of groups in a directory.

### Endpoint

```
GET /v2/orgs/{orgId}/directories/{directoryId}/groups
```

### Parameters

| Parameter | In | Type | Required | Description |
|-----------|-----|------|----------|-------------|
| `orgId` | path | string | Yes | Organization ID |
| `directoryId` | path | string | Yes | Directory ID |
| `cursor` | query | string | No | Pagination cursor |
| `limit` | query | integer | No | Max results per page (default: 25) |
| `searchTerm` | query | string | No | Search groups by name |
| `groupIds` | query | array<string> | No | Filter by group IDs |
| `accountIds` | query | array<string> | No | Filter by account IDs |
| `directoryIds` | query | array<string> | No | Filter by directory IDs |
| `resourceIds` | query | array<string> | No | Filter by resource IDs |
| `roleIds` | query | array<string> | No | Filter by role IDs |
| `filterType` | query | string | No | Filter type |
| `filter` | query | object | No | Filter criteria |
| `sort` | query | array<object> | No | Sort criteria |

### Required Scopes

- `read:groups:admin`

### Request

```bash
curl --request GET \
  --url 'https://api.atlassian.com/admin/v2/orgs/{orgId}/directories/{directoryId}/groups?limit=50' \
  --header 'Authorization: Bearer <access_token>' \
  --header 'Accept: application/json'
```

### Response (200 OK)

```json
{
  "data": [
    {
      "groupId": "group-id-1",
      "name": "jira-users",
      "description": "Jira users group",
      "directoryId": "12345678-1234-1234-1234-123456789012",
      "memberCount": 25
    }
  ],
  "links": {
    "self": "...",
    "prev": null,
    "next": "cursor-value"
  }
}
```

---

## Create Group

Create a group in a directory to manage app access and permissions for multiple users together.

### Endpoint

```
POST /v2/orgs/{orgId}/directories/{directoryId}/groups
```

### Request Body

```json
{
  "name": "new-group-name",
  "description": "Group description"
}
```

### Required Scopes

- `write:groups:admin`

### Response (200 OK)

```json
{
  "data": {
    "groupId": "new-group-id",
    "name": "new-group-name",
    "description": "Group description",
    "directoryId": "12345678-1234-1234-1234-123456789012"
  }
}
```

---

## Get Group Role Assignments

Returns a page of role assignments for a group.

### Endpoint

```
GET /v2/orgs/{orgId}/directories/{directoryId}/groups/{groupId}/role-assignments
```

### Parameters

| Parameter | In | Type | Required | Description |
|-----------|-----|------|----------|-------------|
| `orgId` | path | string | Yes | Organization ID |
| `directoryId` | path | string | Yes | Directory ID |
| `groupId` | path | string | Yes | Group ID |
| `cursor` | query | string | No | Pagination cursor |
| `limit` | query | integer | No | Max results per page |
| `accountIds` | query | array<string> | No | Filter by account IDs |
| `directoryIds` | query | array<string> | No | Filter by directory IDs |
| `resourceIds` | query | array<string> | No | Filter by resource IDs |
| `roleIds` | query | array<string> | No | Filter by role IDs |

### Required Scopes

- `read:groups:admin`

---

## Grant Access to Group

Assign a role to a group to assign all members the same role.

### Endpoint

```
POST /v2/orgs/{orgId}/directories/{directoryId}/groups/{groupId}/role-assignments/assign
```

### Request Body

```json
{
  "roleId": "role-id",
  "resource": "ari:cloud:jira::cloud-id/instance-id"
}
```

### Required Scopes

- `write:groups:admin`

### Note

This operation follows eventual consistency and may take up to **30 seconds** to take effect.

---

## Remove Access from Group

Revoke a role from a group to remove access to an app from all members. A member can still access the app if they're in another group that grants access to the same app.

### Endpoint

```
POST /v2/orgs/{orgId}/directories/{directoryId}/groups/{groupId}/role-assignments/revoke
```

### Request Body

```json
{
  "roleId": "role-id",
  "resource": "ari:cloud:jira::cloud-id/instance-id"
}
```

### Required Scopes

- `write:groups:admin`

### Note

This operation follows eventual consistency and may take up to **30 seconds** to take effect.

---

## Add User to Group

Add a user to a group. This gives the user the same app access and permissions as the group. The user must be in the same directory as the group.

> **Note:** You can't add a user to a group synced from an identity provider. Manage this group in your identity provider instead.
> You can't add a user to a group if you've exceeded your user limit for an app that the group grants access to.

### Endpoint

```
POST /v2/orgs/{orgId}/directories/{directoryId}/groups/{groupId}/memberships
```

### Request Body

```json
{
  "accountId": "557056:f2b5f..."
}
```

### Required Scopes

- `write:groups:admin`

### Response (204 No Content)

---

## Remove User from Group

Remove a user from a group. This removes any app access and permissions granted by this group, but the user may still be in other groups that grant the same app access and permissions.

### Endpoint

```
DELETE /v2/orgs/{orgId}/directories/{directoryId}/groups/{groupId}/memberships/{accountId}
```

### Required Scopes

- `write:groups:admin`

### Response (204 No Content)

---

## Get Group Details

Returns the details of a group.

### Endpoint

```
GET /v2/orgs/{orgId}/directories/{directoryId}/groups/{groupId}
```

### Parameters

| Parameter | In | Type | Required | Description |
|-----------|-----|------|----------|-------------|
| `orgId` | path | string | Yes | Organization ID |
| `directoryId` | path | string | Yes | Directory ID |
| `groupId` | path | string | Yes | Group ID |

### Required Scopes

- `read:groups:admin`

### Response (200 OK)

```json
{
  "data": {
    "groupId": "group-id-1",
    "name": "jira-users",
    "description": "Jira users group",
    "directoryId": "12345678-1234-1234-1234-123456789012",
    "memberCount": 25
  }
}
```

---

## Delete Group

Delete a group from a directory if you don't need this group anymore. This removes any app access and permissions granted by this group from all members. A member can still access an app if they're in another group that grants access to the same app.

> **Note:** This API will not delete groups that are synchronized through SCIM.

### Endpoint

```
DELETE /v2/orgs/{orgId}/directories/{directoryId}/groups/{groupId}
```

### Required Scopes

- `write:groups:admin`

### Response (204 No Content)

---

## Get Group Count

Returns the count of groups in an organization that match the supplied parameters.

### Endpoint

```
GET /v2/orgs/{orgId}/directories/{directoryId}/groups/count
```

### Required Scopes

- `read:groups:admin`

### Response (200 OK)

```json
{
  "count": 12
}
```

---

## Get Group Stats

Returns group stats for the organization.

### Endpoint

```
GET /v2/orgs/{orgId}/directories/{directoryId}/groups/stats
```

### Required Scopes

- `read:groups:admin`

### Response (200 OK)

```json
{
  "roles": [
    { "roleId": "atlassian:jira::role/admin", "count": 3 }
  ],
  "membershipCount": 25
}
```

---

## Deprecated v1 Group Endpoints

> **Warning:** These endpoints are deprecated after June 30, 2026. Migrate to v2 equivalents.

| Deprecated v1 Endpoint | v2 Equivalent |
|------------------------|---------------|
| `POST /v1/orgs/{orgId}/groups/search` | `GET /v2/.../groups` |
| `POST /v1/orgs/{orgId}/directory/groups` | `POST /v2/.../groups` |
| `DELETE /v1/orgs/{orgId}/directory/groups/{groupId}` | `DELETE /v2/.../groups/{groupId}` |
| `POST /v1/orgs/{orgId}/directory/groups/{groupId}/roles/assign` | `POST /v2/.../groups/{groupId}/role-assignments/assign` |
| `POST /v1/orgs/{orgId}/directory/groups/{groupId}/roles/revoke` | `POST /v2/.../groups/{groupId}/role-assignments/revoke` |
| `POST /v1/orgs/{orgId}/directory/groups/{groupId}/memberships` | `POST /v2/.../groups/{groupId}/memberships` |
| `DELETE /v1/orgs/{orgId}/directory/groups/{groupId}/memberships/{accountId}` | `DELETE /v2/.../groups/{groupId}/memberships/{accountId}` |

---

## Forge Implementation Example

```javascript
import api, { route } from '@forge/api';

// List groups in a directory
export const listGroups = async (orgId, directoryId, limit = 25) => {
  const response = await api.asApp().requestJira(
    route`https://api.atlassian.com/admin/v2/orgs/${orgId}/directories/${directoryId}/groups?limit=${limit}`,
    {
      headers: { 'Accept': 'application/json' }
    }
  );
  const data = await response.json();
  return data.data;
};

// Create a group
export const createGroup = async (orgId, directoryId, name, description) => {
  const response = await api.asApp().requestJira(
    route`https://api.atlassian.com/admin/v2/orgs/${orgId}/directories/${directoryId}/groups`,
    {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name, description })
    }
  );
  const data = await response.json();
  return data.data;
};

// Add user to group
export const addUserToGroup = async (orgId, directoryId, groupId, accountId) => {
  await api.asApp().requestJira(
    route`https://api.atlassian.com/admin/v2/orgs/${orgId}/directories/${directoryId}/groups/${groupId}/memberships`,
    {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ accountId })
    }
  );
};

// Remove user from group
export const removeUserFromGroup = async (orgId, directoryId, groupId, accountId) => {
  await api.asApp().requestJira(
    route`https://api.atlassian.com/admin/v2/orgs/${orgId}/directories/${directoryId}/groups/${groupId}/memberships/${accountId}`,
    { method: 'DELETE' }
  );
};

// Grant role to group
export const grantGroupRole = async (orgId, directoryId, groupId, roleId, resource) => {
  await api.asApp().requestJira(
    route`https://api.atlassian.com/admin/v2/orgs/${orgId}/directories/${directoryId}/groups/${groupId}/role-assignments/assign`,
    {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ roleId, resource })
    }
  );
};

// Delete group
export const deleteGroup = async (orgId, directoryId, groupId) => {
  await api.asApp().requestJira(
    route`https://api.atlassian.com/admin/v2/orgs/${orgId}/directories/${directoryId}/groups/${groupId}`,
    { method: 'DELETE' }
  );
};
```

---

## Related Endpoints

- **[05-directories.md](05-directories.md)** — Get directoryId first
- **[03-users.md](03-users.md)** — User management
- **[02-orgs.md](02-orgs.md)** — Get orgId first
