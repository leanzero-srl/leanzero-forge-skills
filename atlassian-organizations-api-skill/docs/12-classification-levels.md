# DLP Classification Level Endpoints

Manage data classification levels for your organization (DLP — Data Loss Prevention).

---

## Overview

The DLP Classification Level endpoints allow you to create, edit, publish, archive, restore, and reorder data classification levels. These levels are used by users to classify Confluence pages and Jira issues by sensitivity.

> **Important:** These endpoints are marked as **experimental** and **Forge and OAuth2 apps cannot access these REST resources**. They require API key authentication with organization admin permissions.

**Base URL:** `https://api.atlassian.com/admin/v1`

---

## Get All Classification Levels

Gets all classification levels in an organization.

### Endpoint

```
GET /v1/orgs/{orgId}/classification-levels
```

### Parameters

| Parameter | In | Type | Required | Description |
|-----------|-----|------|----------|-------------|
| `orgId` | path | string | Yes | Organization ID |

### Required Scopes

- `read:classification-levels:admin`

### Request

```bash
curl --request GET \
  --url 'https://api.atlassian.com/admin/v1/orgs/{orgId}/classification-levels' \
  --header 'Authorization: Bearer <api_key>' \
  --header 'Accept: application/json'
```

### Response (200 OK)

```json
{
  "data": [
    {
      "id": "level-id-1",
      "name": "Confidential",
      "color": "#FF0000",
      "sensitivity": 1,
      "status": "published"
    },
    {
      "id": "level-id-2",
      "name": "Internal",
      "color": "#FFA500",
      "sensitivity": 2,
      "status": "published"
    }
  ]
}
```

---

## Create a New Classification Level

Creates a draft classification level for an organization.

### Endpoint

```
POST /v1/orgs/{orgId}/classification-levels
```

### Request Body

```json
{
  "name": "Secret",
  "description": "Highly sensitive information",
  "color": "#800000"
}
```

### Required Scopes

- `write:classification-levels:admin`

### Response (200 OK)

```json
{
  "data": {
    "id": "new-level-id",
    "name": "Secret",
    "description": "Highly sensitive information",
    "color": "#800000",
    "status": "draft"
  }
}
```

---

## Get a Classification Level

Gets a classification level with the supplied levelId.

### Endpoint

```
GET /v1/orgs/{orgId}/classification-levels/{levelId}
```

### Parameters

| Parameter | In | Type | Required | Description |
|-----------|-----|------|----------|-------------|
| `orgId` | path | string | Yes | Organization ID |
| `levelId` | path | string | Yes | Classification level ID |

### Required Scopes

- `read:classification-levels:admin`

---

## Edit a Classification Level

Edits a classification level with the supplied levelId.

### Endpoint

```
PUT /v1/orgs/{orgId}/classification-levels/{levelId}
```

### Request Body

```json
{
  "name": "Updated Name",
  "description": "Updated description",
  "color": "#000080"
}
```

### Required Scopes

- `write:classification-levels:admin`

### Response (202 Accepted)

---

## Publish Classification Level(s)

Publishes one or more classification levels. Users will be able to classify pages at this level.

### Endpoint

```
POST /v1/orgs/{orgId}/classification-levels/publish
```

### Request Body

```json
{
  "levelIds": ["level-id-1", "level-id-2"]
}
```

### Required Scopes

- `write:classification-levels:admin`

### Response (202 Accepted)

---

## Archive a Classification Level

Archives a classification level. When archived:
- Users won't be able to classify pages at this level
- Any pages or issues classified at this level become unclassified
- Pages and issues retain history
- If restored and republished, pages/issues regain their classification

### Endpoint

```
POST /v1/orgs/{orgId}/classification-levels/archive
```

### Request Body

```json
{
  "levelIds": ["level-id-1"]
}
```

### Required Scopes

- `write:classification-levels:admin`

### Response (202 Accepted)

---

## Restore a Classification Level

Restores a classification level. Restored levels are in draft status and need to be published.

### Endpoint

```
POST /v1/orgs/{orgId}/classification-levels/restore
```

### Request Body

```json
{
  "levelIds": ["level-id-1"]
}
```

### Required Scopes

- `write:classification-levels:admin`

### Response (202 Accepted)

---

## Reorder Classification Levels

Changes the order of classification levels. The most sensitive should be ranked 1.

### Endpoint

```
POST /v1/orgs/{orgId}/classification-levels/reorder
```

### Request Body

```json
{
  "levelOrder": {
    "level-id-1": 1,
    "level-id-2": 2,
    "level-id-3": 3
  }
}
```

### Required Scopes

- `write:classification-levels:admin`

### Response (202 Accepted)

---

## Classification Level Statuses

| Status | Description |
|--------|-------------|
| `draft` | Level exists but is not visible to users |
| `published` | Level is active and users can classify content |
| `archived` | Level is inactive; classified content becomes unclassified |

---

## Classification Level Colors

Colors are specified as hex strings:

```json
{
  "color": "#FF0000"  // Red
}
```

---

## Important Notes

- **Forge and OAuth2 apps cannot access these endpoints** — API key authentication required
- Classification levels apply to both **Confluence pages** and **Jira issues**
- Archived levels retain classification history; restored levels regain their classifications
- The most sensitive level should have `sensitivity: 1` (lowest number = highest sensitivity)

---

## Related Documentation

- **[11-permissions-scopes.md](11-permissions-scopes.md)** — `read:classification-levels:admin`, `write:classification-levels:admin`
- **[12-classification-levels.md](12-classification-levels.md)** — This file
