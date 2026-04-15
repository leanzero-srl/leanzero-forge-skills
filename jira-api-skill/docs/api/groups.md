# Groups

This module covers API endpoints for managing Jira groups, including creating, retrieving, and managing group memberships.

## Overview

Groups are collections of users that can be used to simplify permission management. Instead of assigning permissions to individual users, you can assign them to a group.

---

## Group Management

### Create Group
Creates a new group in Jira.

**Endpoint:** `POST /rest/api/3/group`

**Request Body Parameters:**

| Name | Type | Description |
| :--- | :--- | :--- |
| `name` | `string` | **Required.** The name of the group to be created. |

**Request Body Example:**

```json
{
  "name": "forge-app-users"
}
```

**Response Example (201 Created):**

```json
{
  "name": "forge-app-users",
  "self": "https://your-domain.atlassian.net/rest/api/3/group?name=forge-app-users"
}
```

**Error Responses:**

| Status | Description |
| :--- | :--- |
| `400` | Invalid request body or group name already exists. |
| `401` | Authentication credentials incorrect or missing. |
| `403` | User lacks necessary permissions to manage groups. |

---

### Get All Groups
Retrieves a list of all groups.

**Endpoint:** `GET /rest/api/3/group`

**Query Parameters:**

| Name | Type | Description |
| :--- | :--- | :--- |
| `startAt` | `integer` | The index of the first item to return. |
| `maxResults` | `integer` | The maximum number of items to return. |

**Response Example (200 OK):**

```json
{
  "startAt": 0,
  "maxResults": 50,
  "total": 12,
  "values": [
    {
      "name": "jira-software-users",
      "self": "https://your-domain.atlassian.net/rest/api/3/group?name=jira-software-users"
    },
    {
      "name": "forge-app-users",
      "self": "https://your-domain.atlassian.net/rest/api/3/group?name=forge-app-users"
    }
  ]
}
```

---

### Get Group
Returns the details of a specific group.

**Endpoint:** `GET /rest/api/3/group/member?groupname={groupname}`

**Note:** In Jira Cloud, group management often involves checking membership. This endpoint is typically used to list members of a group.

**Response Example (200 OK):**

```json
{
  "values": [
    {
      "accountId": "5b10a2844c20165700ede21g",
      "displayName": "Mia Krystof"
    }
  ]
}
```

---

### Delete Group
Removes a group from Jira.

**Endpoint:** `DELETE /rest/api/3/group?name={groupname}`

**Error Responses:**

| Status | Description |
| :--- | :--- |
| `404` | Group not found. |
| `403` | User lacks necessary permissions to delete groups. |