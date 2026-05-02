# Organizations Endpoints

Manage organizations — list your organizations and get organization details.

---

## Overview

The Organizations endpoints allow you to list all organizations accessible to your API key and retrieve details about a specific organization.

**Base URL:** `https://api.atlassian.com/admin/v1`

---

## List Organizations

Returns a list of organizations accessible to your API key.

### Endpoint

```
GET /v1/orgs
```

### Parameters

| Parameter | In | Type | Required | Description |
|-----------|-----|------|----------|-------------|
| `cursor` | query | string | No | Sets the starting point for the page of results |

### Required Scopes

- `read:orgs:admin`

### Request

```bash
curl --request GET \
  --url 'https://api.atlassian.com/admin/v1/orgs' \
  --header 'Authorization: Bearer <access_token>' \
  --header 'Accept: application/json'
```

### Response (200 OK)

```json
{
  "data": [
    {
      "id": "12345678-1234-1234-1234-123456789012",
      "type": "orgs",
      "attributes": {
        "name": "My Organization"
      },
      "relationships": {
        "domains": {
          "links": {
            "related": "https://api.atlassian.com/admin/v1/orgs/12345678-1234-1234-1234-123456789012/domains"
          }
        },
        "users": {
          "links": {
            "related": "https://api.atlassian.com/admin/v1/orgs/12345678-1234-1234-1234-123456789012/users"
          }
        }
      },
      "links": {
        "self": "https://api.atlassian.com/admin/v1/orgs/12345678-1234-1234-1234-123456789012"
      }
    }
  ],
  "links": {
    "self": "https://api.atlassian.com/admin/v1/orgs",
    "prev": null,
    "next": "ZXhhbXBsZS1jdXJzb3I="
  }
}
```

---

## Get Organization by ID

Returns information about a single organization by ID.

### Endpoint

```
GET /v1/orgs/{orgId}
```

### Parameters

| Parameter | In | Type | Required | Description |
|-----------|-----|------|----------|-------------|
| `orgId` | path | string | Yes | The ID of the organization |

### Required Scopes

- `read:orgs:admin`

### Request

```bash
curl --request GET \
  --url 'https://api.atlassian.com/admin/v1/orgs/{orgId}' \
  --header 'Authorization: Bearer <access_token>' \
  --header 'Accept: application/json'
```

### Response (200 OK)

```json
{
  "data": {
    "id": "12345678-1234-1234-1234-123456789012",
    "type": "orgs",
    "attributes": {
      "name": "My Organization"
    },
    "relationships": {
      "domains": {
        "links": {
          "related": "https://api.atlassian.com/admin/v1/orgs/12345678-1234-1234-1234-123456789012/domains"
        }
      },
      "users": {
        "links": {
          "related": "https://api.atlassian.com/admin/v1/orgs/12345678-1234-1234-1234-123456789012/users"
        }
      }
    },
    "links": {
      "self": "https://api.atlassian.com/admin/v1/orgs/12345678-1234-1234-1234-123456789012"
    }
  }
}
```

### Error Responses

| Status | Meaning |
|--------|---------|
| 401 | Unauthorized — invalid/missing token |
| 404 | Not Found — organization ID doesn't exist |
| 429 | Rate Limited |
| 500 | Internal Server Error |

---

## Forge Implementation Example

```javascript
import api, { route } from '@forge/api';

// List all organizations
export const listOrgs = async () => {
  const response = await api.asApp().requestJira(
    route`https://api.atlassian.com/admin/v1/orgs`,
    {
      headers: { 'Accept': 'application/json' }
    }
  );
  const data = await response.json();
  return data.data;
};

// Get organization details
export const getOrg = async (orgId) => {
  const response = await api.asApp().requestJira(
    route`https://api.atlassian.com/admin/v1/orgs/${orgId}`,
    {
      headers: { 'Accept': 'application/json' }
    }
  );
  const data = await response.json();
  return data.data;
};
```

---

## Related Endpoints

- **[03-users.md](03-users.md)** — User management (requires orgId)
- **[05-directories.md](05-directories.md)** — Directory management (requires orgId)
- **[06-domains.md](06-domains.md)** — Domain management (requires orgId)
