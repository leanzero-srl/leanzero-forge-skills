# API Access: API Tokens and API Keys

Manage API tokens and API keys for your organization.

---

## Overview

The API Access endpoints allow you to view, search, and revoke API tokens and API keys in your organization. These endpoints are used for security auditing and token management.

> **Important:** These endpoints require API key authentication with organization admin permissions. **Forge and OAuth2 apps cannot access these REST resources.**

**Base URL:** `https://api.atlassian.com/admin/v1`

---

## API Tokens

### Get All API Tokens in an Org

Gets all user API tokens in an organization.

#### Endpoint

```
GET /v1/orgs/{orgId}/api-tokens
```

#### Parameters

| Parameter | In | Type | Required | Description |
|-----------|-----|------|----------|-------------|
| `orgId` | path | string | Yes | Organization ID |
| `cursor` | query | string | No | Pagination cursor |
| `limit` | query | integer | No | Max results per page |
| `accountId` | query | string | No | Filter by account ID |
| `search` | query | string | No | Search tokens |

#### Required Scopes

- `read:tokens:admin`

#### Request

```bash
curl --request GET \
  --url 'https://api.atlassian.com/admin/v1/orgs/{orgId}/api-tokens' \
  --header 'Authorization: Bearer <api_key>' \
  --header 'Accept: application/json'
```

#### Response (200 OK)

```json
{
  "data": [
    {
      "id": "token-id",
      "type": "api-token",
      "attributes": {
        "label": "My API Token",
        "createdDate": "2025-01-15T10:30:00Z",
        "lastUsedDate": "2025-02-20T08:00:00Z",
        "account": {
          "accountId": "557056:f2b5f..."
        }
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

### Bulk Revoke API Tokens

Revokes all managed user API tokens in an organization by orgID.

#### Endpoint

```
DELETE /v1/orgs/{orgId}/api-tokens
```

#### Required Scopes

- `delete:tokens:admin`

#### Response (200 OK)

---

### Get API Token Count

Gets count of user API tokens in an organization.

#### Endpoint

```
GET /v1/orgs/{orgId}/api-tokens/count
```

#### Required Scopes

- `read:tokens:admin`

#### Response (200 OK)

```json
{
  "count": 42
}
```

---

## Service Account API Tokens

### Get Service Account API Token Count

Gets count of API tokens for specified service accounts.

#### Endpoint

```
POST /v1/orgs/{orgId}/service-accounts/count
```

#### Request Body

```json
{
  "serviceAccountIds": ["service-account-id-1", "service-account-id-2"]
}
```

#### Required Scopes

- `read:service-accounts-tokens:admin`

---

### Get All Service Account API Tokens

Retrieves API tokens for a specific service account.

#### Endpoint

```
GET /v1/orgs/{orgId}/service-accounts/{accountId}/api-tokens
```

#### Required Scopes

- `read:service-accounts-tokens:admin`

---

### Revoke All API Tokens for a Service Account

Revokes all API tokens for a specific service account.

#### Endpoint

```
DELETE /v1/orgs/{orgId}/service-accounts/{accountId}/api-tokens
```

#### Required Scopes

- `delete:service-accounts-tokens:admin`

---

## API Keys

### Get API Key Count

Gets count of user API keys in an organization.

#### Endpoint

```
GET /v1/orgs/{orgId}/api-keys/count
```

#### Required Scopes

- `read:keys:admin`

---

### Get All API Keys

Gets all user API keys in an organization.

#### Endpoint

```
GET /v1/orgs/{orgId}/api-keys
```

#### Required Scopes

- `read:keys:admin`

---

### Revoke an API Key

Revokes an existing API key.

#### Endpoint

```
PATCH /v1/orgs/{orgId}/api-keys/revoke/{apiKeyId}
```

#### Required Scopes

- `delete:keys:admin`

---

## Scopes Summary

| Scope | Operations |
|-------|-----------|
| `read:tokens:admin` | List API tokens, get token count |
| `delete:tokens:admin` | Bulk revoke all API tokens |
| `read:service-accounts-tokens:admin` | List/count service account tokens |
| `delete:service-accounts-tokens:admin` | Revoke all tokens for a service account |
| `read:keys:admin` | List API keys, get key count |
| `delete:keys:admin` | Revoke an API key |

---

## Important Notes

- **Forge and OAuth2 apps cannot access these endpoints** — API key authentication required
- Bulk revoking API tokens affects **all managed user tokens** in the organization
- Service account tokens are separate from user tokens
- API keys are created in Atlassian Administration (not via API)

---

## Related Documentation

- **[11-permissions-scopes.md](11-permissions-scopes.md)** — Token and key scopes
- **[13-api-access.md](13-api-access.md)** — This file
