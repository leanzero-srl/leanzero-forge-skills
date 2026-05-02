# Policy Endpoints

Manage security policies in your organization — IP allowlist, SAML, MFA, and more.

---

## Overview

The Policies endpoints allow you to create, update, delete, and manage security policies for your organization. Policies enforce security requirements across all products in your organization.

**Base URL:** `https://api.atlassian.com/admin/v1`

---

## List Policies

Returns a list of policies in an organization.

### Endpoint

```
GET /v1/orgs/{orgId}/policies
```

### Parameters

| Parameter | In | Type | Required | Description |
|-----------|-----|------|----------|-------------|
| `orgId` | path | string | Yes | Organization ID |
| `cursor` | query | string | No | Pagination cursor |
| `type` | query | string | No | Filter by policy type |

### Required Scopes

- `read:policies:admin`

### Request

```bash
curl --request GET \
  --url 'https://api.atlassian.com/admin/v1/orgs/{orgId}/policies' \
  --header 'Authorization: Bearer <access_token>' \
  --header 'Accept: application/json'
```

### Response (200 OK)

```json
{
  "data": [
    {
      "id": "policy-id-1",
      "type": "policy",
      "attributes": {
        "type": "ip-allowlist",
        "name": "Office IP Allowlist",
        "status": "enabled",
        "rule": {
          "ips": ["192.168.1.0/24", "10.0.0.0/8"]
        },
        "resources": [
          {
            "id": "resource-id-1",
            "applicationStatus": "applying",
            "meta": {},
            "links": {}
          }
        ]
      },
      "links": {
        "self": "https://api.atlassian.com/admin/v1/orgs/{orgId}/policies/policy-id-1"
      }
    }
  ],
  "meta": {
    "next": "cursor-value",
    "page_size": 25
  },
  "links": {
    "self": "...",
    "prev": null,
    "next": "cursor-value"
  }
}
```

---

## Create a Policy

Create a new security policy.

### Endpoint

```
POST /v1/orgs/{orgId}/policies
```

### Request Body

```json
{
  "data": {
    "type": "policy",
    "attributes": {
      "type": "ip-allowlist",
      "name": "Office IP Allowlist",
      "status": "enabled",
      "rule": {
        "ips": ["192.168.1.0/24", "10.0.0.0/8"]
      },
      "resources": [
        {
          "id": "resource-id",
          "meta": {},
          "links": {}
        }
      ]
    }
  }
}
```

### Required Scopes

- `write:policies:admin`

### Response (202 Accepted)

```json
{
  "data": {
    "id": "new-policy-id",
    "type": "policy",
    "attributes": {
      "type": "ip-allowlist",
      "name": "Office IP Allowlist",
      "status": "enabled",
      "rule": {
        "ips": ["192.168.1.0/24"]
      },
      "resources": [
        {
          "id": "resource-id",
          "applicationStatus": "applying",
          "meta": {},
          "links": {}
        }
      ]
    }
  }
}
```

---

## Get Policy by ID

Returns information about a specific policy.

### Endpoint

```
GET /v1/orgs/{orgId}/policies/{policyId}
```

### Parameters

| Parameter | In | Type | Required | Description |
|-----------|-----|------|----------|-------------|
| `orgId` | path | string | Yes | Organization ID |
| `policyId` | path | string | Yes | Policy ID |

### Required Scopes

- `read:policies:admin`

### Response (200 OK)

Same format as list policies response, but with a single policy in `data`.

---

## Update a Policy

Update an existing policy.

### Endpoint

```
PUT /v1/orgs/{orgId}/policies/{policyId}
```

### Request Body

```json
{
  "data": {
    "id": "policy-id",
    "type": "policy",
    "attributes": {
      "type": "ip-allowlist",
      "name": "Updated IP Allowlist",
      "status": "enabled",
      "rule": {
        "ips": ["192.168.1.0/24", "10.0.0.0/8", "172.16.0.0/12"]
      },
      "resources": [
        {
          "id": "resource-id",
          "meta": {},
          "links": {}
        }
      ]
    }
  }
}
```

### Required Scopes

- `write:policies:admin`

### Response (202 Accepted)

---

## Delete a Policy

Delete a policy.

### Endpoint

```
DELETE /v1/orgs/{orgId}/policies/{policyId}
```

### Required Scopes

- `write:policies:admin`

### Response (202 Accepted)

---

## Add Resource to Policy

Add a resource (product/application) to a policy.

### Endpoint

```
POST /v1/orgs/{orgId}/policies/{policyId}/resources
```

### Request Body

```json
{
  "id": "resource-id",
  "meta": {
    "scheduledDate": "2025-03-01T00:00:00Z",
    "migrationStartDateTime": "2025-03-01T00:00:00Z",
    "migrationEndDataTime": "2025-03-02T00:00:00Z",
    "atlassianAccountId": "557056:..."
  },
  "links": {
    "ticket": "https://your-ticket-system.com/ticket/123"
  }
}
```

### Required Scopes

- `write:policies:admin`

### Response (202 Accepted)

---

## Update Policy Resource

Update the metadata of a policy resource.

### Endpoint

```
PUT /v1/orgs/{orgId}/policies/{policyId}/resources/{resourceId}
```

### Request Body

```json
{
  "meta": {
    "scheduledDate": "2025-04-01T00:00:00Z"
  },
  "links": {
    "ticket": "https://your-ticket-system.com/ticket/456"
  }
}
```

### Required Scopes

- `write:policies:admin`

### Response (202 Accepted)

---

## Delete Policy Resource

Remove a resource from a policy.

### Endpoint

```
DELETE /v1/orgs/{orgId}/policies/{policyId}/resources/{resourceId}
```

### Required Scopes

- `write:policies:admin`

### Response (204 No Content)

---

## Validate Policy

Validate a policy configuration.

### Endpoint

```
GET /v1/orgs/{orgId}/policies/{policyId}/validate
```

### Required Scopes

- `read:policies:admin`

### Response (202 Accepted)

---

## Policy Types

| Type | Description |
|------|-------------|
| `ip-allowlist` | Restrict access by IP address range |
| `saml` | SAML authentication policy |
| `mfa` | Multi-factor authentication policy |
| `two-step` | Two-step verification policy |
| `custom` | Custom policy type |

---

## Policy Status

| Status | Description |
|--------|-------------|
| `enabled` | Policy is active and being enforced |
| `disabled` | Policy is inactive |
| `applying` | Policy is being applied to resources |

---

## Forge Implementation Example

```javascript
import api, { route } from '@forge/api';

// List policies
export const listPolicies = async (orgId) => {
  const response = await api.asApp().requestJira(
    route`https://api.atlassian.com/admin/v1/orgs/${orgId}/policies`,
    {
      headers: { 'Accept': 'application/json' }
    }
  );
  const data = await response.json();
  return data.data;
};

// Create IP allowlist policy
export const createIPLocklistPolicy = async (orgId, name, ips) => {
  const response = await api.asApp().requestJira(
    route`https://api.atlassian.com/admin/v1/orgs/${orgId}/policies`,
    {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        data: {
          type: 'policy',
          attributes: {
            type: 'ip-allowlist',
            name,
            status: 'enabled',
            rule: { ips }
          }
        }
      })
    }
  );
  const data = await response.json();
  return data.data;
};

// Update policy
export const updatePolicy = async (orgId, policyId, attributes) => {
  const response = await api.asApp().requestJira(
    route`https://api.atlassian.com/admin/v1/orgs/${orgId}/policies/${policyId}`,
    {
      method: 'PUT',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        data: {
          type: 'policy',
          attributes
        }
      })
    }
  );
  const data = await response.json();
  return data.data;
};

// Delete policy
export const deletePolicy = async (orgId, policyId) => {
  await api.asApp().requestJira(
    route`https://api.atlassian.com/admin/v1/orgs/${orgId}/policies/${policyId}`,
    { method: 'DELETE' }
  );
};
```

---

## Related Endpoints

- **[02-orgs.md](02-orgs.md)** — Get orgId first
- **[07-events.md](07-events.md)** — Policy change events
