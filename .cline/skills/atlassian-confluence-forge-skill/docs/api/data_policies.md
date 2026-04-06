# Data Policies API

The Data Policies API provides access to metadata and space-level information regarding Confluence's Data Loss Prevention (DLP) policies.

---

## Overview

Data policies are used to enforce security and compliance by categorizing content based on sensitivity. This API is primarily intended for use by Forge apps to understand the data policy landscape within a workspace and identify which spaces are subject to specific policies.

> [!IMPORTANT]
> Most endpoints in this API require the request to be made by an app (using `asApp()`) and require appropriate administrative permissions.

---

## Endpoint Breakdown

### Policy Discovery

Endpoints to retrieve information about the data policy configuration.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/data-policies/metadata` | Returns data policy metadata for the workspace. |
| `GET` | `/data-policies/spaces` | Returns all spaces that have data policies applied. |

**Response Example (Get Data Policy Metadata):**

```json
{
  "version": "1.0",
  "supportedFeatures": ["classification-levels", "automated-tagging"],
  "lastUpdated": "2024-01-15T12:00:00Z"
}
```

**Response Example (Get Spaces with Data Policies):**

```json
{
  "results": [
    {
      "id": "178263459270",
      "key": "ENGINEERING",
      "name": "Engineering Space",
      "_links": {
        "self": "/wiki/api/v2/spaces/178263459270"
      }
    }
  ],
  "_links": {
    "self": "/wiki/api/v2/data-policies/spaces",
    "next": "/wiki/api/v2/data-policies/spaces?cursor=xyz"
  }
}
```

### Query Parameters (for `GET /data-policies/spaces`)

| Name | Location | Type | Required | Description |
|------|----------|------|----------|-------------|
| `ids` | query | array (int64) | No | Filter the results to spaces based on their IDs. |
| `keys` | query | array (string) | No | Filter the results to spaces based on their keys. |
| `sort` | query | object | No | Used to sort the result by a particular field. |
| `cursor` | query | string | No | Used for pagination via the `Link` header. |
| `limit` | query | integer | No | Maximum number of spaces per result to return. |

---

## Error Responses

Common error codes for Data Policy operations:

| Code | Description |
|------|-------------|
| `400` | Bad Request - Invalid request parameters. |
| `401` | Unauthorized - Authentication is missing or invalid. |
| `404` | Not Found - The specified resource was not found. |