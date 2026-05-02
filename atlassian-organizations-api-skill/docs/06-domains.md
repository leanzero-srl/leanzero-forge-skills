# Domain Endpoints

Manage verified domains in your organization.

---

## Overview

The Domains endpoints allow you to list and retrieve verified domains associated with your organization. Domains are used for user invitation rules, access policies, and app access settings.

**Base URL:** `https://api.atlassian.com/admin/v1`

---

## List Domains

Returns a page of domains in an organization.

### Endpoint

```
GET /v1/orgs/{orgId}/domains
```

### Parameters

| Parameter | In | Type | Required | Description |
|-----------|-----|------|----------|-------------|
| `orgId` | path | string | Yes | Organization ID |
| `cursor` | query | string | No | Pagination cursor |

### Required Scopes

- `read:domains:admin`

### Request

```bash
curl --request GET \
  --url 'https://api.atlassian.com/admin/v1/orgs/{orgId}/domains' \
  --header 'Authorization: Bearer <access_token>' \
  --header 'Accept: application/json'
```

### Response (200 OK)

```json
{
  "data": [
    {
      "id": "domain-id-1",
      "type": "domains",
      "attributes": {
        "name": "example.com",
        "claim": {
          "type": "http",
          "status": "verified"
        }
      },
      "links": {
        "self": "https://api.atlassian.com/admin/v1/orgs/{orgId}/domains/domain-id-1"
      }
    },
    {
      "id": "domain-id-2",
      "type": "domains",
      "attributes": {
        "name": "mycompany.org",
        "claim": {
          "type": "dns",
          "status": "verified"
        }
      },
      "links": {
        "self": "https://api.atlassian.com/admin/v1/orgs/{orgId}/domains/domain-id-2"
      }
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

## Get Domain by ID

Returns information about a specific domain.

### Endpoint

```
GET /v1/orgs/{orgId}/domains/{domainId}
```

### Parameters

| Parameter | In | Type | Required | Description |
|-----------|-----|------|----------|-------------|
| `orgId` | path | string | Yes | Organization ID |
| `domainId` | path | string | Yes | Domain ID |

### Required Scopes

- `read:domains:admin`

### Request

```bash
curl --request GET \
  --url 'https://api.atlassian.com/admin/v1/orgs/{orgId}/domains/{domainId}' \
  --header 'Authorization: Bearer <access_token>' \
  --header 'Accept: application/json'
```

### Response (200 OK)

```json
{
  "data": {
    "id": "domain-id-1",
    "type": "domains",
    "attributes": {
      "name": "example.com",
      "claim": {
        "type": "http",
        "status": "verified"
      }
    },
    "links": {
      "self": "https://api.atlassian.com/admin/v1/orgs/{orgId}/domains/domain-id-1"
    }
  }
}
```

### Error Responses

| Status | Meaning |
|--------|---------|
| 401 | Unauthorized |
| 404 | Not Found — domain not found |
| 429 | Rate Limited |
| 500 | Internal Server Error |

---

## Claim Types

| Type | Description |
|------|-------------|
| `http` | Verified via HTTP file upload |
| `dns` | Verified via DNS TXT record |

## Claim Statuses

| Status | Description |
|--------|-------------|
| `verified` | Domain is verified and active |
| `pending` | Verification is in progress |
| `failed` | Verification failed |

---

## Forge Implementation Example

```javascript
import api, { route } from '@forge/api';

// List all domains
export const listDomains = async (orgId) => {
  const response = await api.asApp().requestJira(
    route`https://api.atlassian.com/admin/v1/orgs/${orgId}/domains`,
    {
      headers: { 'Accept': 'application/json' }
    }
  );
  const data = await response.json();
  return data.data;
};

// Get domain details
export const getDomain = async (orgId, domainId) => {
  const response = await api.asApp().requestJira(
    route`https://api.atlassian.com/admin/v1/orgs/${orgId}/domains/${domainId}`,
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
- **[10-app-access-settings.md](10-app-access-settings.md)** — App access settings use domains
- **[08-policies.md](08-policies.md)** — Policies can reference domains
