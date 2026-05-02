# Gotchas: Common Pitfalls & Deprecated Endpoints

Common pitfalls, gotchas, and important notes when working with the Atlassian Organizations API.

---

## Deprecated v1 User Endpoints

> **Warning:** The following v1 user endpoints are **deprecated after June 30, 2026**. Migrate to v2 equivalents immediately.

| Deprecated v1 Endpoint | v2 Equivalent |
|------------------------|---------------|
| `POST /v1/orgs/{orgId}/users/search` | `GET /v2/orgs/{orgId}/directories/{directoryId}/users?searchTerm=...` |
| `POST /v1/orgs/{orgId}/users/invite` | `POST /v2/orgs/{orgId}/users/invite` |
| `POST /v1/orgs/{orgId}/directory/users/{accountId}/suspend-access` | `POST /v2/orgs/{orgId}/directories/{directoryId}/users/{accountId}/suspend` |
| `POST /v1/orgs/{orgId}/directory/users/{accountId}/restore-access` | `POST /v2/orgs/{orgId}/directories/{directoryId}/users/{accountId}/restore` |
| `DELETE /v1/orgs/{orgId}/directory/users/{accountId}` | `DELETE /v2/orgs/{orgId}/directories/{directoryId}/users/{accountId}` |

## Deprecated v1 Group Endpoints

> **Warning:** The following v1 group endpoints are **deprecated after June 30, 2026**. Migrate to v2 equivalents immediately.

| Deprecated v1 Endpoint | v2 Equivalent |
|------------------------|---------------|
| `POST /v1/orgs/{orgId}/groups/search` | `GET /v2/orgs/{orgId}/directories/{directoryId}/groups` |
| `POST /v1/orgs/{orgId}/directory/groups` | `POST /v2/orgs/{orgId}/directories/{directoryId}/groups` |
| `DELETE /v1/orgs/{orgId}/directory/groups/{groupId}` | `DELETE /v2/orgs/{orgId}/directories/{directoryId}/groups/{groupId}` |
| `POST /v1/orgs/{orgId}/directory/groups/{groupId}/roles/assign` | `POST /v2/.../groups/{groupId}/role-assignments/assign` |
| `POST /v1/orgs/{orgId}/directory/groups/{groupId}/roles/revoke` | `POST /v2/.../groups/{groupId}/role-assignments/revoke` |
| `POST /v1/orgs/{orgId}/directory/groups/{groupId}/memberships` | `POST /v2/.../groups/{groupId}/memberships` |
| `DELETE /v1/orgs/{orgId}/directory/groups/{groupId}/memberships/{accountId}` | `DELETE /v2/.../groups/{groupId}/memberships/{accountId}` |
| `POST /v1/orgs/{orgId}/users/{userId}/roles/assign` | `POST /v2/orgs/{orgId}/directories/{directoryId}/users/{accountId}/role-assignments` |
| `POST /v1/orgs/{orgId}/users/{userId}/roles/revoke` | `POST /v2/orgs/{orgId}/directories/{directoryId}/users/{accountId}/role-assignments` |

---

## Key Differences: v1 vs v2 User Endpoints

### User Identification

| Version | Identifier | Format |
|---------|-----------|--------|
| v1 | `userId` | Legacy user ID |
| v2 | `accountId` | UUID format (`557056:f2b5f...`) |

### Directory Requirement

- **v1**: Directory ID is optional in many endpoints
- **v2**: Directory ID is **required** in most user endpoints

### Response Format

- **v1**: Flat response with `data`, `meta`, `links`
- **v2**: Consistent format with `data` array and `links` pagination

---

## New User Management Experience

Some v1 endpoints are only available to customers using the **new user management experience**:

- Role assignment endpoints (`/roles/assign`, `/roles/revoke`)
- User search endpoint (`/users/search`)
- Suspend/restore endpoints

> **Note:** Check if your organization has the new user management experience enabled. If not, these endpoints will return 403 Forbidden.

---

## Paid Subscription Requirement

User invitations (`POST /v2/orgs/{orgId}/users/invite`) require:

1. At least one **paid subscription** in the organization
2. Available licenses for the products being assigned

If you don't have a paid subscription, you'll receive a `402 Payment Required` error.

---

## Role Assignment Consistency

Role assignments have **eventual consistency** with up to **30 seconds propagation delay**:

```javascript
// After assigning a role, wait before checking
await assignRole(orgId, userId, role);
await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30s
const assignments = await getUserRoleAssignments(orgId, userId);
```

---

## User Removal is Asynchronous

When you remove a user (`DELETE /v2/.../users/{accountId}`), the deletion is **queued** and not immediate:

```javascript
// This doesn't immediately delete the user
await removeUser(orgId, directoryId, accountId);

// The user may still appear in listings for a short time
```

---

## Suspend vs Remove

| Action | Effect on User | Effect on Billing | Effect on Data |
|--------|---------------|-------------------|----------------|
| **Suspend** | Temporarily loses access | License freed | All data retained |
| **Remove** | Permanently removed from directory | License freed | Data may be preserved depending on org settings |

To re-access after removal, the user must be **re-invited** and **re-assigned** roles.

---

## Domain: ANYONE Special Value

The `ANYONE` domain in App Access Settings is a **special reserved value**:

- It represents users with any email address (no domain restriction)
- It cannot be deleted
- It always appears first in alphabetical listing

---

## Policy Application Delay

After creating or updating a policy, there is a delay before it takes effect:

1. Policy is created/updated → `202 Accepted`
2. Policy status changes to `applying`
3. Policy applies to each resource asynchronously
4. Policy status becomes `enabled`

Check `resources[].applicationStatus` to track progress.

---

## Rate Limits

> **Note:** Exact rate limits are not publicly documented. Always check rate limit headers.

The Events API (`/events`) has known limits:
- **10 requests per minute** per user
- **10 requests per minute** per API path
- Effective end of May 2025

For high request rate use cases, migrate to the polling API (`/events-stream`).

---

## Base URL Gotcha

The Organizations API uses a **completely different base URL** than Confluence and Jira APIs:

| API | Base URL |
|-----|----------|
| Organizations | `https://api.atlassian.com/admin/v{version}` |
| Confluence | `https://{domain}.atlassian.net/wiki/api/v2` |
| Jira | `https://{domain}.atlassian.net/rest/api/3` |

**Common mistake:** Using the Confluence or Jira base URL with Organizations endpoints.

---

## Forge App External Fetch

When calling the Organizations API from a Forge app, you **must** declare the external fetch domain:

```yaml
permissions:
  external:
    fetch:
      backend:
        - "api.atlassian.com"
```

Without this, Forge will block the request.

---

## Forge/OAuth2 App Restrictions

Several admin API sub-APIs **cannot be accessed by Forge or OAuth2 apps** — they require API key authentication only:

| API | Affected Docs |
|-----|---------------|
| DLP Classification Levels | `docs/12-classification-levels.md` |
| API Access (Tokens & Keys) | `docs/13-api-access.md` |
| Admin Control Policies | `docs/14-admin-control.md` |

These APIs are designed for organization administrators using API keys directly from Atlassian Administration, not for third-party apps.

---

## Cursor Pagination Edge Cases

- Empty result sets return `data: []` with `links.next: null`
- The `cursor` parameter must be URL-encoded when passed in query strings
- Cursors are opaque — never parse or modify them

---

## Event Data Delay

Audit event data may be delayed by up to **24 hours** in some cases:

```javascript
// Don't rely on real-time event data
// Events may be delayed by up to 24 hours
const events = await queryEvents(orgId, {
  from: '2025-01-01T00:00:00Z',
  to: '2025-01-02T00:00:00Z'
});
```

---

## Last Active Dates Delay

User last active dates may be delayed by up to **24 hours**:

```javascript
// Last active dates may not reflect current activity
const lastActive = await getLastActiveDates(orgId, accountId);
// Data may be up to 24 hours old
```

---

## Related Documentation

- **[01-core-concepts.md](01-core-concepts.md)** — API overview
- **[problem-patterns.md](problem-patterns.md)** — Error handling and solutions
