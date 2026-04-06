# Audit Operations

This module covers API endpoints for retrieving audit records, which track activities and changes within your Jira instance.

## Overview

Auditing in Jira allows administrators to monitor user activity, system changes, and security-related events. This module provides the technical details for programmatically accessing these logs for compliance and security monitoring.

---

## Audit Records

Retrieve historical audit records from Jira.

**Endpoint:** `GET /rest/api/3/auditing/record`

**Query Parameters:**

| Name | Type | Description |
| :--- | :--- | :--- |
| `filter` | `string` | Space-separated strings to match against audit field content (e.g., `summary`, `category`, `eventSource`, `remoteAddress`). |
| `from` | `string` | The date and time on or after which returned audit records must have been created (ISO 8601). |
| `to` | `string` | The date and time on or before which returned audit results must have been created (ISO 8601). |
| `startAt` | `integer` | The index of the first item to return (page offset). Default: `0`. |
| `maxResults` | `integer` | The maximum number of audit items to return per page. Default: `50`. |

**Response Example (200 OK):**

```json
{
  "startAt": 0,
  "maxResults": 50,
  "total": 1,
  "values": [
    {
      "id": "12345",
      "created": "2024-10-03T10:15:30Z",
      "summary": "User added to group",
      "category": "group management",
      "eventSource": "jira-core",
      "authorAccountId": "5b10a2844c20165700ede21g",
      "remoteAddress": "192.168.1.1"
    }
  ]
}
```

**Error Responses:**

| Status | Description |
| :--- | :--- |
| `401` | Authentication credentials are incorrect or missing. |
| `403` | The user does not have the necessary permission to view audit logs. |
| `403` | Audit logs are only available on paid Jira plans. |

---

## Permissions

To interact with these endpoints, the following permissions/scopes are required:

* **Audit Logs:** *Administer Jira* [global permission](https://confluence.atlassian.com/x/x4dKLg).
* **Forge Scopes:** `read:audit-log:jira`, `read:user:jira`.