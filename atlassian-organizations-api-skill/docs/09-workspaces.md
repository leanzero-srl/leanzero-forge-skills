# Workspace Endpoints

Search and list workspaces in your organization.

---

## Overview

The Workspaces endpoints allow you to search and list Confluence workspaces within your organization. Workspaces are collections of spaces that provide a collaborative environment.

**Base URL:** `https://api.atlassian.com/admin/v2`

---

## Search Workspaces

Returns a paginated list of workspaces in a given org, including organization product details and product URLs.

### Endpoint

```
POST /v2/orgs/{orgId}/workspaces
```

### Parameters

| Parameter | In | Type | Required | Description |
|-----------|-----|------|----------|-------------|
| `orgId` | path | string | Yes | Organization ID |

### Request Body

```json
{
  "query": {
    "field": "name",
    "operand": "my-workspace"
  },
  "limit": 25,
  "sort": [
    { "field": "name", "order": "asc" }
  ],
  "cursor": "cursor-value"
}
```

### Required Scopes

- `read:workspaces:admin`

### Request

```bash
curl -X POST \
  --url 'https://api.atlassian.com/admin/v2/orgs/{orgId}/workspaces' \
  --header 'Authorization: Bearer <access_token>' \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --data '{
    "cursor": "c29tZS1iYXNlLTY0LWVuY29kZWQtY3Vyc29y"
  }'
```

### Response (200 OK)

```json
{
  "data": [
    {
      "id": "workspace-id-1",
      "type": "workspaces",
      "attributes": {
        "name": "My Workspace",
        "typeKey": "confluence",
        "type": "workspace",
        "owner": "557056:f2b5f...",
        "status": "online",
        "statusDetails": [],
        "icons": {},
        "avatars": {},
        "labels": ["team", "project"],
        "sandbox": {
          "type": "CHILD"
        },
        "usage": 2154,
        "capacity": 2154,
        "createdAt": "2024-06-01T00:00:00Z",
        "createdBy": "557056:admin...",
        "updatedAt": "2025-01-15T10:30:00Z",
        "hostUrl": "https://myworkspace.atlassian.net",
        "realm": "realm-id",
        "regions": ["us-east-1"]
      },
      "links": {
        "self": "https://api.atlassian.com/admin/v2/orgs/{orgId}/workspaces/workspace-id-1"
      },
      "relationships": {}
    }
  ],
  "links": {
    "self": "...",
    "prev": null,
    "next": "cursor-value"
  },
  "meta": {
    "pageSize": 25,
    "startIndex": 0,
    "endIndex": 1,
    "total": 10
  }
}
```

### Error Responses

| Status | Meaning |
|--------|---------|
| 400 | Bad request — invalid query |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found — organization not found |
| 500 | Internal Server Error |

---

## Workspace Search Query Types

### Field Operand

Search by a specific field value:

```json
{
  "field": "name",
  "operand": "workspace-name"
}
```

### And Operator

Combine multiple conditions:

```json
{
  "and": [
    { "field": "typeKey", "operand": "confluence" },
    { "field": "status", "operand": "online" }
  ]
}
```

### Nor Operator

Exclude conditions:

```json
{
  "nor": [
    { "field": "status", "operand": "offline" }
  ]
}
```

---

## Forge Implementation Example

```javascript
import api, { route } from '@forge/api';

// Search workspaces
export const searchWorkspaces = async (orgId, query = {}, limit = 25) => {
  const response = await api.asApp().requestJira(
    route`https://api.atlassian.com/admin/v2/orgs/${orgId}/workspaces`,
    {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ...query,
        limit
      })
    }
  );
  const data = await response.json();
  return data.data;
};

// Search by name
export const searchWorkspacesByName = async (orgId, name) => {
  return searchWorkspaces(orgId, {
    query: { field: 'name', operand: name }
  });
};
```

---

## Related Endpoints

- **[02-orgs.md](02-orgs.md)** — Get orgId first
- **[07-events.md](07-events.md)** — Workspace events
