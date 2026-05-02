# Events (Audit Log) Endpoints

Query and poll audit log events for your organization.

---

## Overview

The Events endpoints provide access to the organization's audit log. These endpoints are essential for compliance auditing, security monitoring, and activity tracking across all Atlassian Cloud products.

**Base URL:** `https://api.atlassian.com/admin/v1`

---

## Query Audit Log Events

Returns a filtered list of audit log events for granular querying.

### Endpoint

```
GET /v1/orgs/{orgId}/events
```

### Parameters

| Parameter | In | Type | Required | Description |
|-----------|-----|------|----------|-------------|
| `orgId` | path | string | Yes | Organization ID |
| `cursor` | query | string | No | Pagination cursor |
| `q` | query | string | No | Full-text search query |
| `from` | query | string | No | Start time (ISO 8601) |
| `to` | query | string | No | End time (ISO 8601) |
| `action` | query | string | No | Filter by action type |
| `actor` | query | array<string> | No | Filter by actor account IDs |
| `ip` | query | array<string> | No | Filter by IP address |
| `product` | query | array<string> | No | Filter by product (jira-software, confluence, etc.) |
| `location` | query | string | No | Filter by location |
| `limit` | query | integer | No | Max results per page |

### Required Scopes

- `read:events:admin`

### Rate Limit Notice

> **Important:** Rate limits for this endpoint are being lowered effective end of May 2025:
> - Rate limit per user: **10 requests per minute**
> - Rate limit per API path: **10 requests per minute**
>
> For high request rate use cases, migrate to the polling API (`/events-stream`) to guarantee uninterrupted service.

### Request

```bash
curl --request GET \
  --url 'https://api.atlassian.com/admin/v1/orgs/{orgId}/events?from=2025-01-01T00:00:00Z&limit=50' \
  --header 'Authorization: Bearer <access_token>' \
  --header 'Accept: application/json'
```

### Response (200 OK)

```json
{
  "data": [
    {
      "id": "event-id-1",
      "type": "events",
      "attributes": {
        "time": "2025-02-27T18:50:12.281Z",
        "action": "user.created",
        "actor": {
          "id": "557056:f2b5f...",
          "name": "Admin User",
          "email": "admin@example.com",
          "auth": {
            "authType": "container-token",
            "tokenId": "token-id",
            "tokenLabel": "My App"
          },
          "links": {
            "self": "https://api.atlassian.com/id/actors/557056:f2b5f..."
          }
        },
        "context": [
          {
            "id": "context-id",
            "type": "user",
            "attributes": {},
            "links": {
              "self": "https://api.atlassian.com/admin/v1/orgs/.../users/..."
            }
          }
        ],
        "container": [
          {
            "id": "container-id",
            "type": "org",
            "attributes": {},
            "links": {
              "self": "https://api.atlassian.com/admin/v1/orgs/..."
            }
          }
        ],
        "location": {
          "ip": "192.168.1.1",
          "geo": "US",
          "countryName": "United States",
          "regionName": "California",
          "city": "San Francisco"
        }
      },
      "links": {
        "self": "https://api.atlassian.com/admin/v1/orgs/{orgId}/events/event-id-1"
      },
      "message": {
        "content": "Admin User created user John Doe",
        "format": "plain"
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

## Poll Audit Log Events

Returns a paginated list of audit log events with time-based filtering.

### Endpoint

```
GET /v1/orgs/{orgId}/events-stream
```

### Parameters

| Parameter | In | Type | Required | Description |
|-----------|-----|------|----------|-------------|
| `orgId` | path | string | Yes | Organization ID |
| `cursor` | query | string | No | Pagination cursor |
| `from` | query | string | No | Start time (ISO 8601) |
| `to` | query | string | No | End time (ISO 8601) |
| `limit` | query | integer | No | Max results per page |
| `sortOrder` | query | string | No | Sort order (asc/desc) |

### Required Scopes

- `read:events:admin`

### Request

```bash
curl --request GET \
  --url 'https://api.atlassian.com/admin/v1/orgs/{orgId}/events-stream?from=2025-01-01T00:00:00Z&sortOrder=desc' \
  --header 'Authorization: Bearer <access_token>' \
  --header 'Accept: application/json'
```

### Response (200 OK)

Similar to query events, but includes an additional `processedAt` timestamp in attributes.

```json
{
  "data": [
    {
      "attributes": {
        "time": "2025-02-27T18:50:12.281Z",
        "processedAt": "2025-02-27T18:50:12.281Z",
        "action": "user.created",
        ...
      }
    }
  ]
}
```

---

## Get Event by ID

Returns information about a single event by ID.

### Endpoint

```
GET /v1/orgs/{orgId}/events/{eventId}
```

### Parameters

| Parameter | In | Type | Required | Description |
|-----------|-----|------|----------|-------------|
| `orgId` | path | string | Yes | Organization ID |
| `eventId` | path | string | Yes | Event ID |

### Required Scopes

- `read:events:admin`

### Request

```bash
curl --request GET \
  --url 'https://api.atlassian.com/admin/v1/orgs/{orgId}/events/{eventId}' \
  --header 'Authorization: Bearer <access_token>' \
  --header 'Accept: application/json'
```

### Response (200 OK)

```json
{
  "data": {
    "id": "event-id-1",
    "type": "events",
    "attributes": {
      "time": "2025-02-27T18:50:12.281Z",
      "action": "user.created",
      "actor": { ... },
      "context": [ ... ],
      "container": [ ... ],
      "location": { ... }
    },
    "links": { ... },
    "message": {
      "content": "Admin User created user John Doe",
      "format": "plain"
    }
  }
}
```

---

## Get List of Event Actions

Returns localized event actions.

### Endpoint

```
GET /v1/orgs/{orgId}/event-actions
```

### Parameters

| Parameter | In | Type | Required | Description |
|-----------|-----|------|----------|-------------|
| `orgId` | path | string | Yes | Organization ID |

### Required Scopes

- `read:events:admin`

### Response (200 OK)

```json
{
  "data": [
    {
      "id": "user.created",
      "type": "event-actions",
      "attributes": {
        "displayName": "User created",
        "groupDisplayName": "User management"
      }
    },
    {
      "id": "user.suspended",
      "type": "event-actions",
      "attributes": {
        "displayName": "User suspended",
        "groupDisplayName": "User management"
      }
    }
  ]
}
```

---

## Common Event Actions

| Action | Description |
|--------|-------------|
| `user.created` | User added to organization |
| `user.suspended` | User access suspended |
| `user.restored` | User access restored |
| `user.deleted` | User removed from organization |
| `user.role.assigned` | Role granted to user |
| `user.role.revoked` | Role revoked from user |
| `policy.created` | Security policy created |
| `policy.updated` | Security policy updated |
| `policy.deleted` | Security policy deleted |
| `domain.verified` | Domain verified |
| `group.member.added` | Member added to group |
| `group.member.removed` | Member removed from group |

---

## Forge Implementation Example

```javascript
import api, { route } from '@forge/api';

// Query audit events
export const queryEvents = async (orgId, params = {}) => {
  const query = new URLSearchParams({
    from: params.from || '',
    to: params.to || '',
    action: params.action || '',
    product: (params.product || []).join(','),
    limit: params.limit || 25
  }).toString();

  const response = await api.asApp().requestJira(
    route`https://api.atlassian.com/admin/v1/orgs/${orgId}/events?${query}`,
    {
      headers: { 'Accept': 'application/json' }
    }
  );
  const data = await response.json();
  return data.data;
};

// Poll events (time-based)
export const pollEvents = async (orgId, from, to, sortOrder = 'desc') => {
  const response = await api.asApp().requestJira(
    route`https://api.atlassian.com/admin/v1/orgs/${orgId}/events-stream?from=${from}&to=${to}&sortOrder=${sortOrder}`,
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
- **[08-policies.md](08-policies.md)** — Policy events
