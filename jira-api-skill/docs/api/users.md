# User Operations

This module covers API endpoints for managing and retrieving information about Jira Users.

## Overview

User management in Jira allows for retrieving profile information, creating users, and removing them from the Jira instance. Note that deleting a user from Jira does not delete their Atlassian account.

---

## Core User Operations

### Get User Details
Returns information about a specific user. Privacy controls may be applied to the response based on the user's Atlassian Account privacy settings.

**Endpoint:** `GET /rest/api/3/user`

**Query Parameters:**

| Name | Type | Description |
| :--- | :--- | :--- |
| `accountId` | `string` | **Required.** The unique account ID of the user. |
| `expand` | `string` | Comma-separated list of expansions. Options: `groups`, `applicationRoles`, `avatarUrls`. |

**Response Example (200 OK):**

```json
{
  "accountId": "5b10ac8d82e05b22cc7d4ef5",
  "accountType": "atlassian",
  "active": true,
  "displayName": "Mia Krystof",
  "emailAddress": "mia@example.com",
  "avatarUrls": {
    "16x16": "https://avatar-management--avatars.server-location.prod.public.atl-paas.net/initials/MK-5.png?size=16&s=16"
  },
  "self": "https://your-domain.atlassian.net/rest/api/3/user?accountId=5b10ac8d82e05b22cc7d4ef5",
  "timeZone": "Europe/Bucharest"
}
```

**Error Responses:**

| Status | Description |
| :--- | :--- |
| `401` | Authentication credentials incorrect or missing. |
| `403` | Calling user lacks *Browse users and groups* permission. |
| `404` | User not found. |

---

### Search Users
Search for users using various criteria like name, email, or account ID.

**Endpoint:** `GET /rest/api/3/user/search`

**Query Parameters:**

| Name | Type | Description |
| :--- | :--- | :--- |
| `query` | `string` | The search query (e.g., name, email, or accountId). |
| `startAt` | `integer` | Page offset. Default: `0`. |
| `maxResults` | `integer` | Max items per page. Default: `50`. |

**Response Example (200 OK):**

```json
{
  "header": "Showing 1 of 1 matching users",
  "total": 1,
  "users": [
    {
      "accountId": "5b10ac8d82e05b22cc7d4ef5",
      "displayName": "Mia Krystof",
      "avatarUrls": { "16x16": "..." }
    }
  ]
}
```

**Error Responses:**

| Status | Description |
| :--- | :--- |
| `400` | Invalid search query. |
| `401` | Authentication credentials incorrect or missing. |

---

### Create User
Creates a new user. 

> [!IMPORTANT]
> **Note:** This API does not support Forge apps directly. The caller must be an **organization admin**.

**Endpoint:** `POST /rest/api/3/user`

**Request Body Parameters:**

| Name | Type | Description |
| :--- | :--- | :--- |
| `emailAddress` | `string` | The email address of the user to be created. |
| `products` | `array[string]` | List of products to associate with the user (e.g., `["jira-software"]`). |

**Request Body Example:**

```json
{
  "emailAddress": "mia@atlassian.com",
  "products": [
    "jira-software"
  ]
}
```

**Response Example (201 Created):**

```json
{
  "accountId": "5b10ac8d82e05b22cc7d4ef5",
  "accountType": "atlassian",
  "active": true,
  "displayName": "Mia Krystof",
  "emailAddress": "mia@example.com"
}
```

**Error Responses:**

| Status | Description |
| :--- | :--- |
| `400` | Request is invalid or licensed user limit exceeded. |
| `401` | Authentication credentials incorrect or missing. |
| `403` | User does not have permission to create users. |

---

### Delete User
Removes a user from the Jira user base. This does not delete their Atlassian account.

**Endpoint:** `DELETE /rest/api/3/user`

**Query Parameters:**

| Name | Type | Description |
| :--- | :--- | :--- |
| `accountId` | `string` | **Required.** The account ID of the user to remove. |

**Response Example (204 No Content):**
*(Successful deletion returns no body)*

**Error Responses:**

| Status | Description |
| :--- | :--- |
| `400` | User cannot be removed. |
| `401` | Authentication credentials incorrect or missing. |
| `403` | User does not have necessary permission (Site Admin required). |
| `404` | User not found. |

---

## Group Operations

Manage user groups in Jira.

### Get Group Details
Retrieves details about a specific group, including its members.

**Endpoint:** `GET /rest/api/3/group/{groupName}`

**Path Parameters:**

| Name | Type | Description |
| :--- | :--- | :--- |
| `groupName` | `string` | **Required.** The name of the group. |

**Query Parameters:**

| Name | Type | Description |
| :--- | :--- | :--- |
| `expand` | `string` | Include additional group details. Options: `users`. |

**Response Example (200 OK):**

```json
{
  "groupId": "952d12c3-5b5b-4d04-bb32-44d383afc4b2",
  "name": "site-admins",
  "self": "https://your-domain.atlassian.net/rest/api/3/group/site-admins",
  "users": [
    {
      "accountId": "5b10ac8d82e05b22cc7d4ef5",
      "displayName": "Mia Krystof"
    }
  ]
}
```

**Error Responses:**

| Status | Description |
| :--- | :--- |
| `404` | Group not found. |

---

### Get Group Members
Returns a paginated list of users belonging to a group.

**Endpoint:** `GET /rest/api/3/group/member?groupname={groupName}`

**Query Parameters:**

| Name | Type | Description |
| :--- | :--- | :--- |
| `groupname` | `string` | **Required.** The name of the group. |
| `startAt` | `integer` | Page offset. Default: `0`. |
| `maxResults` | `integer` | Max items per page. Default: `50`. |

**Error Responses:**

| Status | Description |
| :--- | :--- |
| `404` | Group not found. |

---

### Add User to Group
Adds a user to a specified group.

**Endpoint:** `POST /rest/api/3/group/user?groupname={groupName}&user=users`

**Query Parameters:**

| Name | Type | Description |
| :--- | :--- | :--- |
| `groupname` | `string` | **Required.** The name of the group. |
| `user` | `string` | **Required.** The account ID of the user to add. |

**Error Responses:**

| Status | Description |
| :--- | :--- |
| `403` | Insufficient permissions. |
| `404` | Group or user not found. |

---

### Remove User from Group
Removes a user from a specified group.

**Endpoint:** `DELETE /rest/api/3/group/user?groupname={groupName}&user=users`

**Query Parameters:**

| Name | Type | Description |
| :--- | :--- | :--- |
| `groupname` | `string` | **Required.** The name of the group. |
| `user` | `string` | **Required.** The account ID of the user to remove. |

**Error Responses:**

| Status | Description |
| :--- | :--- |
| `403` | Insufficient permissions. |
| `404` | Group or user not found. |

---

## User Management Best Practices

- **Use `accountId` exclusively**: Due to Atlassian's privacy initiatives, `username` and `userKey` are deprecated. Always use the unique `accountId` for all user-related operations.
- **Handle 404s Gracefully**: When performing operations like `DELETE` or `GET`, ensure your application handles cases where a user might have already been removed or does not exist.
- **Permission Scopes**: Ensure your Forge app has the appropriate scopes (e.g., `read:jira-user`, `write:user:jira`, or `manage:jira-configuration`) depending on the operation being performed.
