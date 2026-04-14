# Configuration Operations

This module covers API endpoints for managing Jira settings, including application properties, global settings, time tracking, and issue field configurations.

## Overview

Configuration endpoints allow administrators to manage the behavior and settings of a Jira instance. These settings determine whether optional features (like subtasks or voting) are enabled, how time is tracked, and how fields are configured for different issue types.

---

## Jira Settings

These endpoints manage global application properties and general Jira configuration.

### Application Properties

Retrieve or filter editable application properties.

**Endpoint:** `GET /rest/api/3/application-properties`

**Query Parameters:**

| Name | Type | Description |
| :--- | :--- | :--- |
| `key` | `string` | The specific key of the application property. If provided, the response returns a single object. |
| `permissionLevel` | `string` | The permission level of all items being returned in the list. |
| `keyFilter` | `string` | Filters the list using a regular expression (e.g., `jira.lf.*`). Only used when `key` is NOT provided. |

**Note on Response Format:**
- If a `key` is specified, the response is a **single object**.
- If no `key` is specified, the response is an **array of objects**.

**Response Example (200 OK - Array):**

```json
[
  {
    "defaultValue": "",
    "desc": "Jira home directory",
    "id": "jira.home",
    "key": "jira.home",
    "name": "jira.home",
    "type": "string",
    "value": "/var/jira/jira-home"
  },
  {
    "defaultValue": "CLONE -",
    "id": "jira.clone.prefix",
    "key": "jira.clone.prefix",
    "name": "The prefix added to the Summary field of cloned issues",
    "type": "string",
    "value": "CLONE -"
  }
]
```

**Error Responses:**

| Status | Description |
| :--- | :--- |
| `401` | Authentication credentials are incorrect or missing. |
| `404` | The application property was not found. |

---

### Global Settings

Returns the global settings in Jira which determine if optional features are enabled.

**Endpoint:** `GET /rest/api/3/configuration`

**Response Example (200 OK):**

```json
{
  "attachmentsEnabled": true,
  "issueLinkingEnabled": true,
  "subTasksEnabled": false,
  "timeTrackingConfiguration": {
    "defaultUnit": "day",
    "timeFormat": "pretty",
    "workingDaysPerWeek": 5.0,
    "workingHoursPerDay": 8.0
  },
  "timeTrackingEnabled": true,
  "unassignedIssuesAllowed": false,
  "votingEnabled": true,
  "watchingEnabled": true
}
```

**Error Responses:**

| Status | Description |
| :--- | :--- |
| `401` | Authentication credentials are incorrect or missing. |

---

## Time Tracking

Endpoints for managing how time is tracked within Jira.

### Get Selected Time Tracking Provider

Returns the time tracking provider that is currently selected.

**Endpoint:** `GET /rest/api/3/configuration/timetracking`

**Response Example (200 OK):**

```json
{
  "key": "Jira",
  "name": "JIRA provided time tracking",
  "url": "/example/config/url"
}
```

**Response Example (204 No Content):**
Returned if the request is successful but time tracking is disabled.

**Error Responses:**

| Status | Description |
| :--- | :--- |
| `401` | Authentication credentials are incorrect or missing. |
| `403` | The user does not have the necessary permission. |

---

## Issue Field Configurations

Endpoints for managing field configurations used in issue types.

### Get All Field Configurations

**[DEPRECATED]** Returns a paginanted list of field configurations. It is recommended to use Field Schemes instead.

**Endpoint:** `GET /rest/api/3/fieldconfiguration`

**Query Parameters:**

| Name | Type | Description |
| :--- | :--- | :--- |
| `startAt` | `integer` | The index of the first item to return (page offset). Default: `0`. |
| `maxResults` | `integer` | The maximum number of items to return per page. Max: `100`. Default: `50`. |
| `id` | `array[integer]` | A list of field configuration IDs to include. |
| `isDefault` | `boolean` | If `true`, returns only default field configurations. |
| `query` | `string` | A query string to match against names and descriptions. |

**Response Example (200 OK):**

```json
{
  "isLast": true,
  "maxResults": 50,
  "startAt": 0,
  "total": 2,
  "values": [
    {
      "id": 10000,
      "name": "Default Field Configuration",
      "description": "The default field configuration description",
      "isDefault": true
    }
  ]
}
```

**Error Responses:**

| Status | Description |
| :--- | :--- |
| `401` | Authentication credentials are incorrect or missing. |
| `403` | The user does not have the necessary permission. |

---

## Field Configuration Schemes

Manages the mapping between field configurations and projects.

### Get All Field Configuration Schemes

**Endpoint:** `GET /rest/api/3/fieldconfigurationscheme`

**Query Parameters:**

| Name | Type | Description |
| :--- | :--- | :--- |
| `startAt` | `integer` | The index of the first item to return (page offset). Default: `0`. |
| `maxResults` | `integer` | The maximum number of items to return per page. Max: `100`. Default: `50`. |

**Response Example (200 OK):**

```json
{
  "isLast": false,
  "maxResults": 50,
  "startAt": 0,
  "total": 10,
  "values": [
    {
      "id": "10100",
      "name": "Standard Field Configuration Scheme",
      "description": "A standard scheme for most projects"
    }
  ]
}
```

**Error Responses:**

| Status | Description |
| :--- | :--- |
| `401` | Authentication credentials are incorrect or missing. |
| `403` | The user does not have the necessary permission. |

---

## Issue Type Schemes

Manages which issue types are available in a project.

### Get All Issue Type Schemes

**Endpoint:** `GET /rest/api/3/issuetypescheme`

**Query Parameters:**

| Name | Type | Description |
| :--- | :--- | :--- |
| `startAt` | `integer` | The index of the first item to return (page offset). Default: `0`. |
| `maxResults` | `integer` | The maximum number of items to return per page. Max: `100`. Default: `50`. |

**Response Example (200 OK):**

```json
{
  "isLast": true,
  "maxResults": 50,
  "startAt": 0,
  "total": 5,
  "values": [
    {
      "id": "10200",
      "name": "Default Issue Type Scheme",
      "description": "The default scheme for the instance",
      "isDefault": true,
      "defaultIssueTypeId": "10001"
    }
  ]
}
```

**Error Responses:**

| Status | Description |
| :--- | :--- |
| `401` | Authentication credentials are incorrect or missing. |

---

## Permission Schemes

Manages the permissions assigned to different user groups and roles within Jira.

### Get All Permission Schemes

**Endpoint:** `GET /rest/api/3/permissionscheme`

**Query Parameters:**

| Name | Type | Description |
| :--- | :--- | :--- |
| `startAt` | `integer` | The index of the first item to return (page offset). Default: `0`. |
| `maxResults` | `integer` | The maximum number of items to return per page. Max: `100`. Default: `50`. |

**Response Example (200 OK):**

```json
{
  "isLast": true,
  "maxResults": 50,
  "startAt": 0,
  "total": 3,
  "values": [
    {
      "id": 10300,
      "name": "Default Permission Scheme",
      "description": "Standard permissions for all projects"
    }
  ]
}
```

**Error Responses:**

| Status | Description |
| :--- | :--- |
| `401` | Authentication credentials are incorrect or missing. |
| `403` | The user does not have the necessary permission. |

---

## Notification Schemes

Manages how users are notified about events (e.g., issue creation, comments).

### Get All Notification Schemes

**Endpoint:** `GET /rest/api/3/notificationscheme`

**Query Parameters:**

| Name | Type | Description |
| :--- | :--- | :--- |
| `startAt` | `integer` | The index of the first item to return (page offset). Default: `0`. |
| `maxResults` | `integer` | The maximum number of items to return per page. Max: `100`. Default: `50`. |

**Response Example (200 OK):**

```json
{
  "isLast": true,
  "maxResults": 50,
  "startAt": 0,
  "total": 2,
  "values": [
    {
      "id": 10400,
      "name": "Default Notification Scheme",
      "description": "Standard notifications for the instance"
    }
  ]
}
```

**Error Responses:**

| Status | Description |
| :--- | :--- |
| `401` | Authentication credentials are incorrect or missing. |

---

## Priority Schemes

Manages the priorities available for issues.

### Get All Priority Schemes

**Endpoint:** `GET /rest/api/3/priorityscheme`

**Query Parameters:**

| Name | Type | Description |
| :--- | :--- | :--- |
| `startAt` | `integer` | The index of the first item to return (page offset). Default: `0`. |
| `maxResults` | `integer` | The maximum number of items to return per page. Max: `100`. Default: `50`. |

**Response Example (200 OK):**

```json
{
  "isLast": true,
  "maxResults": 50,
  "startAt": 0,
  "total": 1,
  "values": [
    {
      "id": "10500",
      "name": "Default Priority Scheme",
      "description": "Standard priorities"
    }
  ]
}
```

**Error Responses:**

| Status | Description |
| :--- | :--- |
| `401` | Authentication credentials are incorrect or missing. |

---

## Issue Security Schemes

Manages security levels that restrict access to specific issues.

### Get All Issue Security Schemes

**Endpoint:** `GET /rest/api/3/issuesecurityschemes`

**Query Parameters:**

| Name | Type | Description |
| :--- | :--- | :--- |
| `startAt` | `integer` | The index of the first item to return (page offset). Default: `0`. |
| `maxResults` | `integer` | The maximum number of items to return per page. Max: `100`. Default: `50`. |

**Response Example (200 OK):**

```json
{
  "isLast": true,
  "maxResults": 50,
  "startAt": 0,
  "total": 2,
  "values": [
    {
      "id": "10600",
      "name": "Default Security Scheme",
      "description": "Standard security levels"
    }
  ]
}
```

**Error Responses:**

| Status | Description |
| :--- | :--- |
| `401` | Authentication credentials are incorrect or missing. |

---

## Permissions

To interact with these endpoints, the following permissions/scopes are required:

* **Jira Settings & Time Tracking:** *Administer Jira* [global permission](https://confluence.atlassian.com/x/x4dKLg).
* **Field Configurations:** *Administer Jira* [global permission](https://confluence.atlassian.com/x/x4dKLg).