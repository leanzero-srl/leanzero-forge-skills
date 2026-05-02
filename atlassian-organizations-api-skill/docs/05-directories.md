# Directory Endpoints

Manage directories within an organization.

---

## Overview

Directories are user sources (Atlassian-managed, LDAP, SAML IdP, Azure AD, Okta, etc.). This endpoint lists directories within an organization.

**Base URL:** `https://api.atlassian.com/admin/v2`

---

## List Directories

Returns a page of directories in an organization matching supplied parameters.

### Endpoint

```
GET /v2/orgs/{orgId}/directories
```

### Parameters

| Parameter | In | Type | Required | Description |
|-----------|-----|------|----------|-------------|
| `orgId` | path | string | Yes | The ID of the organization |
| `accountId` | query | string | No | Filter by account ID |
| `directoryIds` | query | array<string> | No | Filter by specific directory IDs |
| `searchTerm` | query | string | No | Search directories by name |
| `cursor` | query | string | No | Pagination cursor |
| `limit` | query | integer | No | Max results per page (default: 25) |

### Required Scopes

- `read:directories:admin`

### Request

```bash
curl --request GET \
  --url 'https://api.atlassian.com/admin/v2/orgs/{orgId}/directories' \
  --header 'Authorization: Bearer <access_token>' \
  --header 'Accept: application/json'
```

### Response (200 OK)

```json
{
  "data": [
    {
      "directoryId": "12345678-1234-1234-1234-123456789012",
      "name": "Primary Directory",
      "icon": "https://icon1.example.com/icon1.png"
    },
    {
      "directoryId": "12345678-1234-1234-1234-123456789013",
      "name": "Secondary Directory",
      "icon": "https://icon2.example.com/icon2.png"
    }
  ],
  "links": {
    "self": "https://api.atlassian.com/admin/v2/orgs/{orgId}/directories",
    "prev": null,
    "next": "kloHX1ZQVasDAkx_P48NYQ"
  }
}
```

### Error Responses

| Status | Meaning |
|--------|---------|
| 400 | Bad request — invalid parameters |
| 401 | Unauthorized |
| 403 | Forbidden — insufficient permissions |
| 404 | Not Found — organization not found |
| 429 | Rate Limited |
| 500 | Internal Server Error |

---

## Forge Implementation Example

```javascript
import api, { route } from '@forge/api';

// List all directories in an organization
export const listDirectories = async (orgId) => {
  const response = await api.asApp().requestJira(
    route`https://api.atlassian.com/admin/v2/orgs/${orgId}/directories`,
    {
      headers: { 'Accept': 'application/json' }
    }
  );
  const data = await response.json();
  return data.data;
};

// Search directories
export const searchDirectories = async (orgId, searchTerm) => {
  const response = await api.asApp().requestJira(
    route`https://api.atlassian.com/admin/v2/orgs/${orgId}/directories?searchTerm=${encodeURIComponent(searchTerm)}`,
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

- **[02-orgs.md](02-orgs.md)** — Get orgId first
- **[03-users.md](03-users.md)** — List users within a directory
- **[04-groups.md](04-groups.md)** — List groups within a directory
