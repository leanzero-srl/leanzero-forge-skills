# Audit & History

This module covers API endpoints for accessing system audit logs and high-level history records.

## Overview

Audit logs provide a trail of significant actions taken within a Jira instance, such as configuration changes, user management, and security setting updates. This is critical for compliance, security monitoring, and troubleshooting administrative actions.

---

## Required Forge Scopes

To use these endpoints, your Forge app must have the following scopes in `manifest.yml`:

| Scope | Purpose |
| :--- | :--- |
| `read:jira-admin` | Retrieve system audit logs and administrative history. |

---

## Audit Logging

### Retrieve Audit Records

Access the audit log to review activities performed by users or system processes.

**Endpoint:** `GET /rest/api/3/auditing/record`

**Response Example (200 OK):**

```json
{
  "records": [
    {
      "id": "1",
      "created": "2024-03-15T10:00:00.000+0000",
      "author": {
        "accountId": "5b10ac8d82e05b22cc7d4ef5",
        "displayName": "Admin User"
      },
      "category": "security",
      "summary": "User permission changed",
      "objectType": "user",
      "objectId": "user-id-abc"
    }
  ]
}
```

---

## Workflow History

While specific issue history is covered in the **Issue Changelog** module, this section can be used for broader workflow configuration history.

### Workflow Configuration History

Track changes made to workflow schemes and their associated transitions.

**Endpoint:** `GET /rest/api/3/workflow/history`

---

## Error Responses

| Status | Description |
| :--- | :--- |
| `400` | Invalid query parameters for audit logs. |
| `401` | Authentication credentials incorrect or missing. |
| `403` | Insufficient administrative permissions to view audit logs. |
| `500` | Internal server error during log retrieval. |