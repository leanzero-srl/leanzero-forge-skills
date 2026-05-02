# Admin Control: Policies, Resources, and Authentication Policies

Manage organizational control policies, their resources, and authentication policies.

---

## Overview

The Admin Control REST API provides a comprehensive suite of tools to manage and govern your organization, including:

- **Policies** — Create data security policies, data residency policies, and IP allowlists
- **Resources** — Associate resources (products, teams) with policies
- **Authentication Policies** — Manage authentication rules for specific user groups

> **Important:** These endpoints require API key authentication with organization admin permissions. **Forge and OAuth2 apps cannot access these REST resources.**

**Base URL:** `https://api.atlassian.com/admin/control/v{version}`

---

## Policies

### List Policies (v1)

Returns comprehensive details on organizational policies, including both rules and resources.

#### Endpoint

```
GET /v1/orgs/{orgId}/policies
```

#### Required Scopes

- `read:policies:admin`

---

### Create Policy (v1)

Create a policy aligned with your organization's standards.

#### Endpoint

```
POST /v1/orgs/{orgId}/policies
```

#### Request Body

```json
{
  "name": "IP Allowlist Policy",
  "ruleName": "ip-allowlist",
  "rule": {
    "ips": ["192.168.1.0/24"]
  }
}
```

#### Required Scopes

- `write:policies:admin`

#### Response (202 Accepted)

---

### Get Policy by ID (v1)

Returns information about a policy by policyId.

#### Endpoint

```
GET /v1/orgs/{orgId}/policies/{policyId}
```

#### Required Scopes

- `read:policies:admin`

---

### Update Policy (v1)

Update a policy with a policyId.

#### Endpoint

```
PUT /v1/orgs/{orgId}/policies/{policyId}
```

#### Required Scopes

- `write:policies:admin`

#### Response (202 Accepted)

---

### Delete Policy (v1)

Delete a policy with a policyId.

#### Endpoint

```
DELETE /v1/orgs/{orgId}/policies/{policyId}
```

#### Required Scopes

- `delete:policies:admin`

---

### Validate Policy (v1)

Validate a policy to view potential issues.

#### Endpoint

```
GET /v1/orgs/{orgId}/policies/{policyId}/validate
```

#### Required Scopes

- `read:policies:admin`

#### Response (202 Accepted)

---

### List Policies (v2)

Returns comprehensive details on organizational policies, including both rules and status.

#### Endpoint

```
GET /v2/orgs/{orgId}/policies
```

#### Required Scopes

- `read:policies:admin`

---

### Create Policy (v2)

Create a policy in v2 (supports draft policies).

#### Endpoint

```
POST /v2/orgs/{orgId}/policies
```

#### Required Scopes

- `write:policies:admin`

#### Response (202 Accepted)

---

### Get Policy by ID (v2)

Returns information about a policy by policyId.

#### Endpoint

```
GET /v2/orgs/{orgId}/policies/{policyId}
```

#### Required Scopes

- `read:policies:admin`

---

### Update Policy (v2)

Update a policy in v2.

#### Endpoint

```
PUT /v2/orgs/{orgId}/policies/{policyId}
```

#### Required Scopes

- `write:policies:admin`

#### Response (202 Accepted)

---

### Publish Draft Policies

Publishes policies by a bulk request for a specific ruleName. This is the only way to create or modify published policies.

#### Endpoint

```
POST /v2/orgs/{orgId}/policies/publishDraftPolicies
```

#### Request Body

```json
{
  "ruleName": "ip-allowlist",
  "policyOperations": [
    {
      "policyId": "policy-id-1",
      "action": "PUBLISH"
    }
  ]
}
```

#### Required Scopes

- `write:policies:admin`

#### Response (202 Accepted)

---

## Resources

### List Policy Resources (v1/v2)

Returns resources associated with a policy.

#### Endpoint

```
GET /v1/orgs/{orgId}/policies/{policyId}/resources
GET /v2/orgs/{orgId}/policies/{policyId}/resources
```

#### Required Scopes

- `read:policies:admin`

---

### Add Resource to Policy (v1/v2)

Adds a new resource to a policy.

#### Endpoint

```
POST /v1/orgs/{orgId}/policies/{policyId}/resources
POST /v2/orgs/{orgId}/policies/{policyId}/resources
```

#### Required Scopes

- `write:policies:admin`

---

### Remove All Resources from Policy (v1/v2)

Removes all resources from a policy.

#### Endpoint

```
DELETE /v1/orgs/{orgId}/policies/{policyId}/resources
DELETE /v2/orgs/{orgId}/policies/{policyId}/resources
```

---

### Get Single Resource (v1/v2)

Returns a specific resource from a policy.

#### Endpoint

```
GET /v1/orgs/{orgId}/policies/{policyId}/resources/{resourceId}
GET /v2/orgs/{orgId}/policies/{policyId}/resources/{resourceId}
```

#### Required Scopes

- `read:policies:admin`

---

### Update Resource (v1/v2)

Updates a specific resource in a policy.

#### Endpoint

```
PUT /v1/orgs/{orgId}/policies/{policyId}/resources/{resourceId}
PUT /v2/orgs/{orgId}/policies/{policyId}/resources/{resourceId}
```

#### Required Scopes

- `write:policies:admin`

---

### Delete Resource (v1/v2)

Deletes a specific resource from a policy.

#### Endpoint

```
DELETE /v1/orgs/{orgId}/policies/{policyId}/resources/{resourceId}
DELETE /v2/orgs/{orgId}/policies/{policyId}/resources/{resourceId}
```

#### Required Scopes

- `write:policies:admin`

---

### Add/Remove Resources Bulk (v2)

Adds or removes resources to a policy in bulk.

#### Endpoint

```
POST /v2/orgs/{orgId}/policies/{policyId}/resources
```

#### Required Scopes

- `write:policies:admin`

---

## Authentication Policies

### Add Users to Authentication Policy

Add users to an authentication policy to address the security of different user sets.

#### Endpoint

```
POST /v1/orgs/{orgId}/auth-policy/{policyId}/add-users
```

#### Request Body

```json
{
  "userIds": ["557056:f2b5f...", "557056:abc123..."]
}
```

#### Required Scopes

- `write:policies:admin`

#### Response (202 Accepted)

---

### Get Authentication Policy Task Status

Verify that users are assigned to the intended policy and report errors.

#### Endpoint

```
GET /v1/orgs/{orgId}/auth-policy/task/{taskId}
```

#### Required Scopes

- `write:policies:admin`

---

### Bulk Fetch User Auth Policies

Get authentication policy information for a given list of managed users.

#### Endpoint

```
POST /v1/orgs/{orgId}/users/auth-policies/bulk-fetch
```

#### Request Body

```json
{
  "userIds": ["557056:f2b5f...", "557056:abc123..."]
}
```

---

## Policy Types

The Admin Control API supports different policy types including:

- **IP Allowlist** — Restrict product access by IP address
- **Data Security** — Control data sharing and export settings
- **Data Residency** — Control where data is stored geographically
- **Authentication** — Define authentication requirements for users

---

## Important Notes

- **Forge and OAuth2 apps cannot access these endpoints** — API key authentication required
- v2 API supports draft policies that must be published separately
- Policy changes follow eventual consistency (up to 30 seconds)
- Resources are products, teams, or other entities that policies apply to

---

## Related Documentation

- **[11-permissions-scopes.md](11-permissions-scopes.md)** — `read:policies:admin`, `write:policies:admin`, `delete:policies:admin`
- **[14-admin-control.md](14-admin-control.md)** — This file
