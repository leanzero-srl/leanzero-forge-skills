# User Management Endpoints

Manage users in your organization — list, invite, grant/revoke roles, suspend/restore, remove.

---

## Overview

The Users endpoints provide comprehensive user management for your organization. This includes listing users across directories, inviting new users, managing roles, and controlling access.

**Base URLs:**
- v2 (current): `https://api.atlassian.com/admin/v2`
- v1 (legacy): `https://api.atlassian.com/admin/v1`

> **Important:** Many v1 user endpoints are deprecated after June 30, 2026. Use v2 endpoints where available.

---

## List Users in an Organization (v2)

Returns a page of users in your organization matching supplied parameters.

### Endpoint

```
GET /v2/orgs/{orgId}/directories/{directoryId}/users
```

### Parameters

| Parameter | In | Type | Required | Description |
|-----------|-----|------|----------|-------------|
| `orgId` | path | string | Yes | Organization ID |
| `directoryId` | path | string | Yes | Directory ID |
| `cursor` | query | string | No | Pagination cursor |
| `limit` | query | integer | No | Max results per page (default: 25) |
| `accountIds` | query | array<string> | No | Filter by account IDs |
| `directoryIds` | query | array<string> | No | Filter by directory IDs |
| `resourceIds` | query | array<string> | No | Filter by resource IDs |
| `groupIds` | query | array<string> | No | Filter by group IDs |
| `mfaEnabled` | query | boolean | No | Filter by MFA status |
| `claimStatus` | query | string | No | Filter by claim status |
| `status` | query | string | No | Filter by status |
| `accountStatus` | query | string | No | Filter by account status |
| `membershipStatus` | query | string | No | Filter by membership status |
| `roleIds` | query | array<string> | No | Filter by role IDs |
| `emailDomains` | query | array<string> | No | Filter by email domains |
| `searchTerm` | query | string | No | Search by name/email |
| `sortBy` | query | string | No | Sort field |

### Required Scopes

- `read:users:admin`

### Request

```bash
curl --request GET \
  --url 'https://api.atlassian.com/admin/v2/orgs/{orgId}/directories/{directoryId}/users?limit=50' \
  --header 'Authorization: Bearer <access_token>' \
  --header 'Accept: application/json'
```

### Response (200 OK)

```json
{
  "data": [
    {
      "accountId": "557056:f2b5f...",
      "name": "John Doe",
      "email": "john@example.com",
      "accountStatus": "active",
      "mfaEnabled": true,
      "platformRoles": ["atlassian/org-admin"],
      "directoryId": "12345678-1234-1234-1234-123456789012"
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

## Get User Details (v2)

Returns detailed information about a specific user in a directory.

### Endpoint

```
GET /v2/orgs/{orgId}/directories/{directoryId}/users/{userId}
```

### Parameters

| Parameter | In | Type | Required | Description |
|-----------|-----|------|----------|-------------|
| `orgId` | path | string | Yes | Organization ID |
| `directoryId` | path | string | Yes | Directory ID |
| `userId` | path | string | Yes | User account ID |

### Required Scopes

- `read:users:admin`

### Request

```bash
curl --request GET \
  --url 'https://api.atlassian.com/admin/v2/orgs/{orgId}/directories/{directoryId}/users/{userId}' \
  --header 'Authorization: Bearer <access_token>' \
  --header 'Accept: application/json'
```

### Response (200 OK)

```json
{
  "data": {
    "accountId": "557056:f2b5f...",
    "name": "John Doe",
    "email": "john@example.com",
    "accountStatus": "active",
    "mfaEnabled": true,
    "platformRoles": ["atlassian/org-admin"],
    "directoryId": "12345678-1234-1234-1234-123456789012"
  }
}
```

---

## Get Managed Accounts (v1)

Returns a list of managed accounts in an organization (regardless of directory assignment).

### Endpoint

```
GET /v1/orgs/{orgId}/users
```

### Parameters

| Parameter | In | Type | Required | Description |
|-----------|-----|------|----------|-------------|
| `orgId` | path | string | Yes | Organization ID |
| `cursor` | query | string | No | Pagination cursor |

### Required Scopes

- `read:users:admin`

### Request

```bash
curl --request GET \
  --url 'https://api.atlassian.com/admin/v1/orgs/{orgId}/users' \
  --header 'Authorization: Bearer <access_token>' \
  --header 'Accept: application/json'
```

### Response (200 OK)

```json
{
  "data": [
    {
      "account_id": "557056:f2b5f...",
      "account_type": "atlassian",
      "name": "John Doe",
      "email": "john@example.com",
      "product_access": ["jira-software", "confluence"]
    }
  ],
  "meta": {
    "total": 35
  },
  "links": {
    "self": "...",
    "prev": null,
    "next": "cursor"
  }
}
```

---

## Invite Users to Organization (v2)

Invite people to your organization. Requires a paid subscription.

### Endpoint

```
POST /v2/orgs/{orgId}/users/invite
```

### Parameters

| Parameter | In | Type | Required | Description |
|-----------|-----|------|----------|-------------|
| `orgId` | path | string | Yes | Organization ID |

### Request Body

```json
{
  "emails": ["newuser1@example.com", "newuser2@example.com"],
  "permissionRules": [
    {
      "permission": "atlassian:jira::role/member",
      "condition": { "type": "ALL_USERS" }
    }
  ],
  "additionalGroups": ["group-id-1", "group-id-2"],
  "sendNotification": true,
  "notificationText": "Welcome to our organization!"
}
```

### Required Scopes

- `write:users:admin`

### Request

```bash
curl -X POST \
  --url 'https://api.atlassian.com/admin/v2/orgs/{orgId}/users/invite' \
  --header 'Authorization: Bearer <access_token>' \
  --header 'Content-Type: application/json' \
  --data '{
    "emails": ["newuser@example.com"],
    "permissionRules": [
      {
        "permission": "atlassian:jira::role/member",
        "condition": { "type": "ALL_USERS" }
      }
    ],
    "sendNotification": true,
    "notificationText": "Welcome!"
  }'
```

### Response (200 OK)

```json
{
  "data": [
    {
      "id": "invitation-id",
      "email": "newuser@example.com",
      "results": {
        "roleAssignmentResult": [...],
        "groupAssignmentResult": [...]
      }
    }
  ]
}
```

### Response (206 Partial Content)

At least one invitation failed. Check `data[].results` for individual failures.

### Error Responses

| Status | Meaning |
|--------|---------|
| 402 | No paid subscription |
| 409 | Exceeded user limit for a product |
| 400 | Invalid request body |

---

## Grant User Role (v1)

Grant a platform role to a user. New user management experience only.

### Endpoint

```
POST /v1/orgs/{orgId}/users/{userId}/roles/assign
```

### Request Body

```json
{
  "role": "atlassian/org-admin",
  "resource": "ari:cloud:jira::cloud-id/instance-id"
}
```

### Required Scopes

- `write:users:admin`

---

## Revoke User Role (v1)

Revoke a platform role from a user.

### Endpoint

```
POST /v1/orgs/{orgId}/users/{userId}/roles/revoke
```

### Request Body

```json
{
  "role": "atlassian/org-admin",
  "resource": "ari:cloud:jira::cloud-id/instance-id"
}
```

### Required Scopes

- `write:users:admin`

---

## Get User Role Assignments (v2)

Returns a page of role assignments for a user.

### Endpoint

```
GET /v2/orgs/{orgId}/directories/{directoryId}/users/{accountId}/role-assignments
```

### Required Scopes

- `read:users:admin`

---

## Suspend User Access (v2)

Temporarily removes access and stops billing. Roles and groups are retained.

### Endpoint

```
POST /v2/orgs/{orgId}/directories/{directoryId}/users/{accountId}/suspend
```

### Required Scopes

- `write:users:admin`

### Response (204 No Content)

---

## Restore User Access (v2)

Restores access and billing. Reapplies previous roles and groups.

### Endpoint

```
POST /v2/orgs/{orgId}/directories/{directoryId}/users/{accountId}/restore
```

### Required Scopes

- `write:users:admin`

### Response (204 No Content)

---

## Remove User from Directory (v2)

Removes user from directory and stops billing. Requires re-invite for access.

### Endpoint

```
DELETE /v2/orgs/{orgId}/directories/{directoryId}/users/{accountId}
```

### Required Scopes

- `write:users:admin`

### Response (204 No Content)

---

## Get User Count (v2)

Returns a count of users matching filter parameters.

### Endpoint

```
GET /v2/orgs/{orgId}/directories/{directoryId}/users/count
```

### Required Scopes

- `read:users:admin`

### Response

```json
{
  "count": 48
}
```

---

## Get User Stats (v2)

Returns aggregated role and account status counts.

### Endpoint

```
GET /v2/orgs/{orgId}/directories/{directoryId}/users/stats
```

### Required Scopes

- `read:users:admin`

### Response

```json
{
  "roles": [
    { "roleId": "atlassian/org-admin", "count": 3 }
  ],
  "accountStatus": [
    { "status": "active", "count": 5 }
  ]
}
```

---

## Get User Last Active Dates (v1)

Returns last active dates for a user across products.

### Endpoint

```
GET /v1/orgs/{orgId}/directory/users/{accountId}/last-active-dates
```

### Required Scopes

- `read:users:admin`

### Response

```json
{
  "data": {
    "product_access": [
      {
        "key": "jira-software",
        "last_active": "2025-01-15T10:30:00Z",
        "last_active_timestamp": 1705312200000
      },
      {
        "key": "confluence",
        "last_active": "2025-01-14T08:00:00Z",
        "last_active_timestamp": 1705219200000
      }
    ],
    "added_to_org": "2024-06-01T00:00:00Z"
  }
}
```

---

## Assign Organization-Level Role (Experimental)

Assign an organization-level role to a user (e.g., organization admin).

> **Note:** This operation follows eventual consistency. Changes may take up to **30 seconds** to be reflected.

### Endpoint

```
POST /v1/orgs/{orgId}/users/{userId}/role-assignments/assign
```

### Request Body

```json
{
  "role": "atlassian/org-admin"
}
```

### Required Scopes

- `write:users:admin`

### Response (200 OK)

---

## Remove Organization-Level Role (Experimental)

Remove an organization-level role from a user.

> **Note:** This operation follows eventual consistency. Changes may take up to **30 seconds** to be reflected.

### Endpoint

```
POST /v1/orgs/{orgId}/users/{userId}/role-assignments/revoke
```

### Request Body

```json
{
  "role": "atlassian/org-admin"
}
```

### Required Scopes

- `write:users:admin`

### Response (200 OK)

---

## Deprecated v1 Endpoints

> **Warning:** These endpoints are deprecated after June 30, 2026. Migrate to v2 equivalents.

| Deprecated v1 Endpoint | v2 Equivalent |
|------------------------|---------------|
| `POST /v1/orgs/{orgId}/users/search` | `GET /v2/.../users?searchTerm=...` |
| `POST /v1/orgs/{orgId}/users/invite` | `POST /v2/orgs/{orgId}/users/invite` |
| `POST /v1/orgs/{orgId}/directory/users/{accountId}/suspend-access` | `POST /v2/.../users/{accountId}/suspend` |
| `POST /v1/orgs/{orgId}/directory/users/{accountId}/restore-access` | `POST /v2/.../users/{accountId}/restore` |
| `DELETE /v1/orgs/{orgId}/directory/users/{accountId}` | `DELETE /v2/.../users/{accountId}` |

---

## Forge Implementation Example

```javascript
import api, { route } from '@forge/api';

// List users in a directory
export const listUsers = async (orgId, directoryId, limit = 25) => {
  const response = await api.asApp().requestJira(
    route`https://api.atlassian.com/admin/v2/orgs/${orgId}/directories/${directoryId}/users?limit=${limit}`,
    {
      headers: { 'Accept': 'application/json' }
    }
  );
  const data = await response.json();
  return data.data;
};

// Invite a user
export const inviteUser = async (orgId, email, role) => {
  const response = await api.asApp().requestJira(
    route`https://api.atlassian.com/admin/v2/orgs/${orgId}/users/invite`,
    {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        emails: [email],
        permissionRules: [{
          permission: role || 'atlassian:jira::role/member',
          condition: { type: 'ALL_USERS' }
        }],
        sendNotification: true,
        notificationText: 'Welcome to our organization!'
      })
    }
  );
  const data = await response.json();
  return data.data;
};

// Suspend a user
export const suspendUser = async (orgId, directoryId, accountId) => {
  await api.asApp().requestJira(
    route`https://api.atlassian.com/admin/v2/orgs/${orgId}/directories/${directoryId}/users/${accountId}/suspend`,
    { method: 'POST' }
  );
};

// Restore a user
export const restoreUser = async (orgId, directoryId, accountId) => {
  await api.asApp().requestJira(
    route`https://api.atlassian.com/admin/v2/orgs/${orgId}/directories/${directoryId}/users/${accountId}/restore`,
    { method: 'POST' }
  );
};
```

---

## Related Endpoints

- **[02-orgs.md](02-orgs.md)** — Get orgId first
- **[05-directories.md](05-directories.md)** — Get directoryId first
- **[04-groups.md](04-groups.md)** — Group management
- **[08-policies.md](08-policies.md)** — MFA policy affects users
