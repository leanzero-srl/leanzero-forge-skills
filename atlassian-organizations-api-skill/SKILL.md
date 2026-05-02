---
name: atlassian-organizations-api-skill
description: Atlassian Organizations REST API. Use when managing Atlassian organizations, users, groups, directories, domains, events, policies, workspaces, and app access settings across all Atlassian Cloud products (Jira, Confluence, Bitbucket).
---

# Atlassian Organizations REST API

This skill provides documentation for the Atlassian Organizations REST API, which manages organization-level settings across all Atlassian Cloud products.

## When to Use This Skill

**Use this skill when:**
- You need to manage **Atlassian organizations** (list orgs, get org details)
- You need to manage **users** across all Atlassian products (invite, grant/revoke roles, suspend/restore, remove)
- You need to manage **groups** and group membership
- You need to manage **directories** (LDAP, Connect, etc.)
- You need to manage **domains** (verify, claim, list)
- You need to query **audit log events**
- You need to manage **security policies** (IP allowlist, SAML, MFA, etc.)
- You need to manage **workspaces**
- You need to configure **app access settings** by domain

**Do NOT use this skill when:**
- You are developing Forge apps (use `atlassian-confluence-forge-skill` or `atlassian-jira-forge-skill` instead)
- You need Confluence content management (use `confluence-api-skill` instead)
- You need Jira issue/project management (use `jira-api-skill` instead)
- You need Bitbucket repository management

---

## What This Skill Covers

This skill covers the Atlassian Organizations REST API, which is a **cross-product admin API** that manages organization-level settings affecting ALL Atlassian Cloud products.

The Atlassian Admin API is composed of 6 sub-APIs. This skill covers 4 of them:

### Organization REST API (`/admin/organization/`)
- **Organization Management**: List organizations, get organization details
- **User Management**: Invite users, grant/revoke roles, suspend/restore, remove users, role assignments, user stats, last active dates
- **Group Management**: List groups, get group details, add/remove group members
- **Directory Management**: List and manage directories (LDAP, Atlassian, etc.)
- **Domain Management**: List verified domains, get domain details
- **Audit Events**: Query audit log events, poll events, get event details
- **Organization Policies**: Create/update/delete security policies (IP allowlist, SAML, MFA, etc.)
- **Workspace Management**: Search and list workspaces
- **App Access Settings**: Configure which domains can access apps in your organization

### DLP REST API (`/admin/dlp/`) — Data Loss Prevention
- **Classification Levels**: Create, edit, publish, archive, restore, and reorder data classification levels

### API Access REST API (`/admin/api-access/`)
- **API Tokens**: View, search, and revoke user API tokens
- **Service Account Tokens**: Manage tokens for service accounts
- **API Keys**: View and revoke admin API keys

### Admin Control REST API (`/admin/control/`)
- **Control Policies**: Manage data security, data residency, and IP allowlist policies
- **Policy Resources**: Associate resources with policies
- **Authentication Policies**: Add users to authentication policies and check status

> **Auth note for the three sub-APIs above**: DLP, API Access, and Admin Control accept **Admin API key** Bearer tokens only. OAuth 2.0 (3LO) tokens are not honored on these endpoints. See `docs/gotchas.md` for details and `docs/01-core-concepts.md` for how to obtain a key.

> **Note:** User Management (`/admin/user-management/`) and User Provisioning (`/admin/user-provisioning/`) are separate SCIM-based APIs that may warrant their own skills.

---

## API Base URL

```
https://api.atlassian.com/admin/{version}
```

| Version | Base URL | Status |
|---------|----------|--------|
| v1 | `https://api.atlassian.com/admin/v1` | Legacy (many endpoints deprecated) |
| v2 | `https://api.atlassian.com/admin/v2` | Current recommended version |

**Important:** Unlike the Confluence API (`/wiki/api/v2`) and Jira API (`/rest/api/3`), the Organizations API uses a **completely different base URL** (`api.atlassian.com/admin/`).

---

## Authentication

Every endpoint takes a **Bearer token** in the `Authorization` header. Per the official intro, "Authentication is implemented via an API key. Use the API Key as a Bearer access token to authenticate." There are three practical ways to get one:

### 1. Admin API key (simplest, most common for backend automation)

Create the key in **admin.atlassian.com → Settings → API keys**. Then use it directly as a Bearer token:

```bash
curl -H "Authorization: Bearer YOUR_ADMIN_API_KEY" \
  https://api.atlassian.com/admin/v1/orgs
```

The key inherits the creator's org-admin permissions. Some sub-APIs (DLP, API Access, Admin Control) **only accept this auth mode** and won't work with OAuth — see `docs/gotchas.md`.

### 2. OAuth 2.0 (3LO) — for apps acting on behalf of an org admin

```bash
# Step 1: open the authorize URL in a browser
https://auth.atlassian.com/authorize?client_id=YOUR_CLIENT_ID&scope=read:orgs:admin+read:users:admin&redirect_uri=https://YOUR_REDIRECT_URI&state=UNIQUE_STATE&response_type=code&prompt=consent

# Step 2: exchange the code for an access token
curl -X POST https://auth.atlassian.com/oauth/token \
  -H 'Content-Type: application/json' \
  -d '{
    "client_id": "YOUR_CLIENT_ID",
    "client_secret": "YOUR_CLIENT_SECRET",
    "code": "AUTHORIZATION_CODE",
    "grant_type": "authorization_code"
  }'

# Step 3: use the access_token from the response
curl -H "Authorization: Bearer <access_token>" \
  https://api.atlassian.com/admin/v1/orgs
```

### 3. From a Forge app

`api.atlassian.com/admin/...` is **not a Jira/Confluence product surface**, so `api.asApp().requestJira(...)` and `requestConfluence(...)` won't reach it. Instead, allowlist the host and use `api.fetch` (or plain `fetch`) with a Bearer token:

```yaml
# manifest.yml
permissions:
  external:
    fetch:
      backend:
        - api.atlassian.com
```

```javascript
import api from '@forge/api';
import { kvs } from '@forge/kvs';

// Store the admin API key as a secret (never hard-code).
const apiKey = await kvs.getSecret('atlassian-admin-api-key');

const r = await api.fetch('https://api.atlassian.com/admin/v1/orgs', {
  headers: {
    Authorization: `Bearer ${apiKey}`,
    Accept: 'application/json',
  },
});
const orgs = await r.json();
```

> **Don't** sign your own JWT and pass it as a Bearer token — that's a Connect-app pattern that does not apply to `api.atlassian.com/admin/`. The Admin API does not validate locally-signed JWTs.

---

## Quick Reference: Common Endpoints

| Task | Endpoint | Method | Version |
|------|----------|--------|---------|
| List organizations | `/admin/v1/orgs` | GET | v1 |
| Get organization by ID | `/admin/v1/orgs/{orgId}` | GET | v1 |
| List directories | `/admin/v2/orgs/{orgId}/directories` | GET | v2 |
| List users | `/admin/v2/orgs/{orgId}/directories/{directoryId}/users` | GET | v2 |
| Invite users | `/admin/v2/orgs/{orgId}/users/invite` | POST | v2 |
| Grant user role | `/admin/v1/orgs/{orgId}/users/{userId}/roles/assign` | POST | v1 |
| Revoke user role | `/admin/v1/orgs/{orgId}/users/{userId}/roles/revoke` | POST | v1 |
| Grant org-level role (exp) | `/admin/v1/orgs/{orgId}/users/{userId}/role-assignments/assign` | POST | v1 |
| Revoke org-level role (exp) | `/admin/v1/orgs/{orgId}/users/{userId}/role-assignments/revoke` | POST | v1 |
| Suspend user | `/admin/v2/orgs/{orgId}/directories/{directoryId}/users/{accountId}/suspend` | POST | v2 |
| Restore user | `/admin/v2/orgs/{orgId}/directories/{directoryId}/users/{accountId}/restore` | POST | v2 |
| List groups | `/admin/v2/orgs/{orgId}/directories/{directoryId}/groups` | GET | v2 |
| Create group | `/admin/v2/orgs/{orgId}/directories/{directoryId}/groups` | POST | v2 |
| Grant group role | `/admin/v2/.../groups/{groupId}/role-assignments/assign` | POST | v2 |
| List domains | `/admin/v1/orgs/{orgId}/domains` | GET | v1 |
| Query audit events | `/admin/v1/orgs/{orgId}/events` | GET | v1 |
| Poll audit events | `/admin/v1/orgs/{orgId}/events-stream` | GET | v1 |
| List policies | `/admin/v1/orgs/{orgId}/policies` | GET | v1 |
| Create policy | `/admin/v1/orgs/{orgId}/policies` | POST | v1 |
| Search workspaces | `/admin/v2/orgs/{orgId}/workspaces` | POST | v2 |
| List app access domains | `/admin/v2/orgs/{orgId}/app-access-settings/domains` | GET | v2 |

---

## Documentation Index

### Core Concepts
| Topic | File |
|-------|------|
| API Overview & Authentication | `docs/01-core-concepts.md` |
| Error Handling & Rate Limits | `docs/problem-patterns.md` |

### Resource Endpoints
| Topic | File |
|-------|------|
| Organizations | `docs/02-orgs.md` |
| Users | `docs/03-users.md` |
| Groups | `docs/04-groups.md` |
| Directories | `docs/05-directories.md` |
| Domains | `docs/06-domains.md` |
| Events (Audit Log) | `docs/07-events.md` |
| Policies (Organization) | `docs/08-policies.md` |
| Workspaces | `docs/09-workspaces.md` |
| App Access Settings | `docs/10-app-access-settings.md` |
| DLP Classification Levels | `docs/12-classification-levels.md` |
| API Access (Tokens & Keys) | `docs/13-api-access.md` |
| Admin Control (Policies & Auth) | `docs/14-admin-control.md` |

### Permissions
| Topic | File |
|-------|------|
| OAuth Scopes Reference | `docs/11-permissions-scopes.md` |

### Gotchas
| Topic | File |
|-------|------|
| Common Pitfalls & Deprecated Endpoints | `docs/gotchas.md` |

---

## Available Templates

| Template | Description | Use Case |
|----------|-------------|----------|
| `org-list.yml` | List organizations | Discover org IDs |
| `user-invite.yml` | Invite users to organization | Bulk user onboarding |
| `role-assignment.yml` | Grant/revoke user roles | Access management |
| `policy-crud.yml` | Create/update/delete policies | Security policy management |
| `audit-events.yml` | Query audit log events | Compliance auditing |

---

## Key Concepts

### Organization (Org)
An organization represents your Atlassian Cloud tenant. It contains users, directories, domains, and policies that apply across all products.

### Directory
A directory is a source of users (e.g., Atlassian-managed, LDAP, Okta, Azure AD). Users are assigned to directories.

### User Account ID
The `accountId` is a unique identifier for a user across all Atlassian products. Format: UUID string (e.g., `557056:f2b5f...`).

### Platform Roles
Organization-level roles that grant access to products:
- `atlassian/org-admin` — Organization administrator
- `atlassian/site-admin` — Site administrator
- `atlassian/billing-admin` — Billing administrator
- Product-specific roles (e.g., `atlassian:jira::role/admin`)

### Pagination
Most endpoints use cursor-based pagination:
```json
{
  "data": [...],
  "links": {
    "self": "...",
    "prev": "...",
    "next": "cursor-value-for-next-page"
  }
}
```

---

## Common cURL Examples

### List Organizations
```bash
curl -H "Authorization: Bearer <access_token>" \
  https://api.atlassian.com/admin/v1/orgs
```

### Get Organization Details
```bash
curl -H "Authorization: Bearer <access_token>" \
  https://api.atlassian.com/admin/v1/orgs/{orgId}
```

### List Users in a Directory
```bash
curl -H "Authorization: Bearer <access_token>" \
  "https://api.atlassian.com/admin/v2/orgs/{orgId}/directories/{directoryId}/users?limit=50"
```

### Invite Users
```bash
curl -X POST \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "emails": ["newuser@example.com"],
    "permissionRules": [
      {
        "permission": "atlassian:jira::role/admin",
        "condition": { "type": "ALL_USERS" }
      }
    ],
    "sendNotification": true,
    "notificationText": "Welcome to our organization!"
  }' \
  https://api.atlassian.com/admin/v2/orgs/{orgId}/users/invite
```

### Query Audit Events
```bash
curl -H "Authorization: Bearer <access_token>" \
  "https://api.atlassian.com/admin/v1/orgs/{orgId}/events?from=2025-01-01T00:00:00Z&limit=50"
```

### List Policies
```bash
curl -H "Authorization: Bearer <access_token>" \
  https://api.atlassian.com/admin/v1/orgs/{orgId}/policies
```

---

## Failure Strategies

When an error occurs during execution, follow these patterns:

- **401 Unauthorized**: Verify your Bearer token is valid and not expired. Check that the token has the required scopes for the endpoint.
- **403 Forbidden**: You lack organization admin permissions. Ensure the API key/token has `read:*:admin` or `write:*:admin` scopes.
- **404 Not Found**: Verify the `orgId` is correct. Use the `/v1/orgs` endpoint to list available organizations.
- **409 Conflict**: User already exists in the organization, or you've exceeded user limits for a product.
- **429 Rate Limited**: Implement exponential backoff. The Organizations API has strict rate limits (see [problem-patterns.md](docs/problem-patterns.md)).
- **500 Internal Error**: Retry with jitter. If persistent, contact Atlassian support.

---

## Support & Resources

- [Organizations REST API Reference](https://developer.atlassian.com/cloud/admin/organization/rest/)
- [OpenAPI Spec](https://dac-static.atlassian.com/cloud/admin/organization/swagger.v3.json)
- [Postman Collection](https://developer.atlassian.com/cloud/admin/organization/organization.postman.json)
- [Atlassian Developer Documentation](https://developer.atlassian.com/)
- [Atlassian Access Documentation](https://support.atlassian.com/atlassian-access/)
- [Community Forum](https://community.developer.atlassian.com/)
