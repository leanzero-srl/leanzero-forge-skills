# OAuth Scopes Reference

Complete reference for all OAuth 2.0 scopes required by the Atlassian Organizations API.

---

## Overview

All Organizations API endpoints require specific OAuth 2.0 scopes. These scopes must be requested during the authorization flow and granted by an organization admin.

> **Note:** The Atlassian OAuth scopes page may not list all scopes for every endpoint. The scopes below are based on the official scopes documentation at https://developer.atlassian.com/cloud/admin/scopes/. User management scopes may require additional investigation.

---

## Officially Documented Scopes

### Domain Scopes

| Scope | Description | Endpoints |
|-------|-------------|-----------|
| `read:domains:admin` | Read domains | List domains, Get domain by ID |

### Policy Scopes

| Scope | Description | Endpoints |
|-------|-------------|-----------|
| `read:policies:admin` | Read policies | Get list of policies, Get single policy, Validate a policy |
| `write:policies:admin` | Write policies | Create a new policy, Update single policy |
| `delete:policies:admin` | Delete policies | Delete single policy |

### Directory Scopes

| Scope | Description | Endpoints |
|-------|-------------|-----------|
| `read:directories:admin` | Read directories | Get directories in an org |

### Group Scopes

| Scope | Description | Endpoints |
|-------|-------------|-----------|
| `read:groups:admin` | Read groups | Get group count in a directory, Get groups in a directory, Get group stats in a directory, Get a group in a directory, Get role assignments for a group |

### Event Scopes

| Scope | Description | Endpoints |
|-------|-------------|-----------|
| `read:events:admin` | Read events | Query audit log events, Poll audit log events, Get an event by ID, Get list of event actions |

### Workspace Scopes

| Scope | Description | Endpoints |
|-------|-------------|-----------|
| `read:workspaces:admin` | Read workspaces | Get list of workspaces |

### App Access Settings Scopes (experimental)

| Scope | Description | Endpoints |
|-------|-------------|-----------|
| `read:app-access-settings:admin` | Read app access settings | List app access settings domains, get a domain (`/v2/orgs/{orgId}/app-access-settings/domains`) |
| `write:app-access-settings:admin` | Write app access settings | Create/update/delete domain entries (verify endpoint set against the experimental spec) |

### Classification Level Scopes

| Scope | Description | Endpoints |
|-------|-------------|-----------|
| `read:classification-levels:admin` | Read classification levels | Get all classification levels by orgId, Get a classification level |
| `write:classification-levels:admin` | Write classification levels | Create, edit, publish, archive, restore, reorder classification levels |

### Product Scopes

| Scope | Description | Endpoints |
|-------|-------------|-----------|
| `write:products:admin` | Activate products | Activate products |

### Token Scopes

| Scope | Description | Endpoints |
|-------|-------------|-----------|
| `read:tokens:admin` | Read API keys and tokens | Get all API tokens in an org, Get API token count |
| `delete:tokens:admin` | Revoke API keys and tokens | Bulk revoke all API tokens in an org |

### Service Account Token Scopes

| Scope | Description | Endpoints |
|-------|-------------|-----------|
| `read:service-accounts-tokens:admin` | Read service account tokens | Get service account API token count, Get all service account API tokens |
| `delete:service-accounts-tokens:admin` | Delete service account tokens | Revoke all API tokens for a service account |

### API Key Scopes

| Scope | Description | Endpoints |
|-------|-------------|-----------|
| `read:keys:admin` | Read API keys | Get API key count in an org, Get all API keys in an org |
| `delete:keys:admin` | Revoke API keys | Revoke an API key for an org |

### Classification Level Scopes (DLP)

| Scope | Description | Endpoints |
|-------|-------------|-----------|
| `read:classification-levels:admin` | Read classification levels | Get all classification levels by orgId, Get a classification level |
| `write:classification-levels:admin` | Write classification levels | Create, edit, publish, archive, restore, reorder classification levels |

### Control Policy Scopes

| Scope | Description | Endpoints |
|-------|-------------|-----------|
| `read:policies:admin` | Read control policies | List policies (v1/v2), Get policy by ID, Validate policy, List resources |
| `write:policies:admin` | Write control policies | Create/update policies, add/remove resources, publish drafts, auth policies |
| `delete:policies:admin` | Delete control policies | Delete policy |

---

## User Management Scopes (Not Listed on Official Scopes Page)

The following user management endpoints exist but their exact OAuth scopes are **not listed** on the official Atlassian scopes page. Based on the naming convention of other scopes, the likely scope names are:

| Likely Scope | Endpoints | Status |
|-------------|-----------|--------|
| `read:users:admin` (likely) | List users, Get user details, Get managed accounts, Get user role assignments, Get user count, Get user stats, Get last active dates | Not officially documented |
| `write:users:admin` (likely) | Invite users, Grant/revoke roles, Suspend/restore, Remove users, Assign org-level role | Not officially documented |

> **Important:** These scope names are inferred from the existing scope naming pattern. You may need to test with your organization to confirm the exact scope names required for user management endpoints.

---

## Authorization Flow Example

### Requesting Scopes

```
https://auth.atlassian.com/authorize?
  client_id=YOUR_CLIENT_ID&
  scope=read:domains:admin+read:events:admin+read:groups:admin+read:policies:admin+read:workspaces:admin&
  redirect_uri=https://YOUR_REDIRECT_URI&
  state=UNIQUE_STATE&
  response_type=code&
  prompt=consent
```

### Scopes as Space-Separated (OAuth 2.0 standard)

```
scope=read:domains:admin read:events:admin read:groups:admin read:policies:admin read:workspaces:admin
```

---

## Forge Manifest Configuration

When using the Organizations API from a Forge app, declare the required scopes in `manifest.yml`:

```yaml
permissions:
  scopes:
    - read:domains:admin
    - read:events:admin
    - read:groups:admin
    - read:policies:admin
    - write:policies:admin
    - delete:policies:admin
    - read:workspaces:admin
    - read:directories:admin
    - read:classification-levels:admin
    - write:classification-levels:admin
    - read:tokens:admin
    - delete:tokens:admin
    - read:service-accounts-tokens:admin
    - delete:service-accounts-tokens:admin
    - read:app-access-settings:admin
    # User management scopes (not officially documented — may need testing)
    - read:users:admin
    - write:users:admin
  external:
    fetch:
      backend:
        - api.atlassian.com
```

> Reminder: in a Forge app, `api.asApp().requestJira(...)` does **not** reach `api.atlassian.com/admin/...` — that surface is not the Jira product. Use `api.fetch(...)` with a Bearer token (Admin API key from KVS, or an OAuth access token). See `01-core-concepts.md`.

---

## Related Documentation

- **[01-core-concepts.md](01-core-concepts.md)** — Authentication overview
- **[problem-patterns.md](problem-patterns.md)** — Error handling for permission issues
