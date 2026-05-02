# App Access Settings Endpoints

Configure which domains can access apps in your organization.

---

## Overview

The App Access Settings endpoints allow you to manage domain-based app access configurations. Each domain can be configured to control who can access apps in your organization.

**Base URL:** `https://api.atlassian.com/admin/v2`

> **Note:** These endpoints are marked as **experimental** (`x-experimental: true`). They may change without major version bumps.

---

## List App Access Settings Domains

Returns a paginated list of domain configurations for your organization's app access settings.

### Endpoint

```
GET /v2/orgs/{orgId}/app-access-settings/domains
```

### Parameters

| Parameter | In | Type | Required | Description |
|-----------|-----|------|----------|-------------|
| `orgId` | path | string | Yes | Organization ID |
| `cursor` | query | string | No | Pagination cursor |
| `limit` | query | integer | No | Max results per page (1-100, default: 20) |

### Required Scopes

- `read:app-access-settings:admin`

### Request

```bash
curl --request GET \
  --url 'https://api.atlassian.com/admin/v2/orgs/{orgId}/app-access-settings/domains?limit=50' \
  --header 'Authorization: Bearer <access_token>' \
  --header 'Accept: application/json'
```

### Response (200 OK)

```json
{
  "data": [
    {
      "domain": "ANYONE",
      "enabled": true,
      "numberOfProductsAppliesTo": 2
    },
    {
      "domain": "example.com",
      "enabled": true,
      "numberOfProductsAppliesTo": 1
    },
    {
      "domain": "partner.org",
      "enabled": false,
      "numberOfProductsAppliesTo": 0
    }
  ],
  "links": {
    "self": "https://api.atlassian.com/admin/v2/orgs/{orgId}/app-access-settings/domains",
    "prev": null,
    "next": "ZXhhbXBsZS5jb20&limit=20"
  }
}
```

### Special Domain: ANYONE

The `ANYONE` domain represents users with any email address (no domain restriction). It acts as a catch-all for users not matching any other configured domain.

---

## Get App Access Settings for a Domain

Returns the app access settings configuration for a specific domain.

### Endpoint

```
GET /v2/orgs/{orgId}/app-access-settings/domains/{domain}
```

### Parameters

| Parameter | In | Type | Required | Description |
|-----------|-----|------|----------|-------------|
| `orgId` | path | string | Yes | Organization ID |
| `domain` | path | string | Yes | Domain name (e.g., `example.com`) or `ANYONE` |

### Required Scopes

- `read:app-access-settings:admin`

### Request

```bash
curl --request GET \
  --url 'https://api.atlassian.com/admin/v2/orgs/{orgId}/app-access-settings/domains/example.com' \
  --header 'Authorization: Bearer <access_token>' \
  --header 'Accept: application/json'
```

### Response (200 OK) — Domain with settings

```json
{
  "domain": "example.com",
  "enabled": true,
  "adminNotifications": false,
  "products": [
    {
      "productId": "ari:cloud:jira::app/all",
      "accessMode": "DIRECT_ACCESS",
      "defaultRole": "ari:cloud:jira::role/software/member"
    },
    {
      "productId": "ari:cloud:confluence::app/all",
      "accessMode": "DIRECT_ACCESS",
      "defaultRole": "atlassian::standard/confluence-users"
    }
  ]
}
```

### Response (200 OK) — Domain with no settings

```json
{
  "domain": "unknown.com",
  "enabled": false,
  "adminNotifications": false,
  "products": []
}
```

---

## Access Modes

| Mode | Description |
|------|-------------|
| `DIRECT_ACCESS` | Users in this domain can directly access the app |
| `INVITE_ONLY` | Users need an explicit invite to access the app |
| `ADMIN_APPROVAL` | Users need admin approval to access the app |

---

## Forge Implementation Example

```javascript
import api, { route } from '@forge/api';

// List app access domains
export const listAppAccessDomains = async (orgId, limit = 20) => {
  const response = await api.asApp().requestJira(
    route`https://api.atlassian.com/admin/v2/orgs/${orgId}/app-access-settings/domains?limit=${limit}`,
    {
      headers: { 'Accept': 'application/json' }
    }
  );
  const data = await response.json();
  return data.data;
};

// Get app access settings for a domain
export const getAppAccessSettings = async (orgId, domain) => {
  const response = await api.asApp().requestJira(
    route`https://api.atlassian.com/admin/v2/orgs/${orgId}/app-access-settings/domains/${encodeURIComponent(domain)}`,
    {
      headers: { 'Accept': 'application/json' }
    }
  );
  const data = await response.json();
  return data;
};
```

---

## Related Endpoints

- **[02-orgs.md](02-orgs.md)** — Get orgId first
- **[06-domains.md](06-domains.md)** — Domain management
