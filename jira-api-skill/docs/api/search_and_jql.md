# Search and JQL Operations

This module covers API endpoints for searching issues using Jira Query Language (JQL).

## Overview

JQL is a powerful way to search for issues in Jira. You can perform searches using both `GET` and `POST` methods. Note that the `GET` version of the search endpoint is being deprecated for large queries.

---

## Core Search Operations

### Search for Issues (JQL)
Searches for issues using a JQL query expression. This endpoint supports both `GET` and `POST` methods, though `POST` is recommended for complex queries.

**Endpoint (POST):** `POST /rest/api/3/search`

> [!WARNING]
> The `GET` version of this endpoint is being deprecated. For complex queries or large request bodies, always use the `POST` method.

**Request Body Parameters:**

| Name | Type | Description |
| :--- | :--- | :--- |
| `jql` | `string` | The JQL query expression (e.g., `project = HSP AND status = "To Do"`). |
| `startAt` | `integer` | The index of the first item to return (page offset). Default: `0`. |
| `maxResults` | `integer` | The maximum number of items to return per page. Default: `50`. |
| `fields` | `array[string]` | A list of fields to return. Use `*all` for all fields or `-field_name` to exclude. |
| `expand` | `string` | Comma-separated list of expansions (e.g., `renderedFields`, `names`, `schema`, `transitions`). |
| `validateQuery` | `string` | How to handle validation. Options: `strict` (default), `warn`, `none`. |
| `reconcileIssues` | `array[integer]` | A list of up to 50 issue IDs to be reconciled with search results to ensure strong consistency. |
| `failFast` | `boolean` | If `true`, the request fails early if any field data cannot be retrieved. Default: `false`. |
| `fieldsByKeys` | `boolean` | Whether to reference fields by their key instead of ID. Default: `false`. |

**Request Body Example:**

```json
{
  "jql": "project = HSP AND assignee = currentUser()",
  "startAt": 0,
  "maxResults": 50,
  "fields": [
    "summary",
    "status",
    "assignee"
  ],
  "expand": "names,schema"
}
```

**Response Example (200 OK):**

```json
{
  "expand": "names,schema",
  "issues": [
    {
      "id": "10002",
      "key": "ED-1",
      "self": "https://your-domain.atlassian.net/rest/api/3/issue/10002",
      "fields": {
        "summary": "Main order flow broken",
        "status": {
          "name": "In Progress",
          "statusCategory": {
            "name": "In Progress"
          }
        }
      }
    }
  ],
  "total": 1,
  "startAt": 0,
  "maxResults": 50
}
```

**Error Responses:**

| Status | Description |
| :--- | :--- |
| `400` | The JQL query is invalid or the request is malformed. |
| `401` | Authentication credentials are incorrect or missing. |

---

### Search with JQL (GET)
A `GET` version of the search endpoint. This is suitable for simple queries, but is being deprecated in favor of the `POST` method for large or complex requests.

**Endpoint:** `GET /rest/api/3/search/jql`

**Query Parameters:**

| Name | Type | Description |
| :--- | :--- | :--- |
| `jql` | `string` | A [JQL](https://confluence.atlassian.com/x/egORLQ) expression. Requires a bounded query (e.g., `assignee = currentUser()`). |
| `nextPageToken` | `string` | The token for a page to fetch that is not the first page. |
| `maxResults` | `integer` | The maximum number of items to return per page. Max: `5000`. Default: `50`. |
| `fields` | `array[string]` | A list of fields to return. Accepts comma-separated list. |
| `expand` | `string` | Comma-delimited string of expansion options (e.g., `names,changelog`). |
| `properties` | `array[string]` | A list of up to 5 issue properties to include in the results. |
| `fieldsByKeys` | `boolean` | Whether to reference fields by their key instead of ID. Default: `false`. |
| `failFast` | `boolean` | Whether to fail the request early if field data cannot be retrieved. Default: `false`. |
| `reconcileIssues` | `array[integer]` | Strong consistency issue IDs to be reconciled with search results (max 50). |

**Response Example (200 OK):**

```json
{
  "isLast": true,
  "issues": [
    {
      "id": "10002",
      "key": "ED-1",
      "self": "https://your-domain.atlassian.net/rest/api/3/issue/10002",
      "fields": {
        "summary": "Main order flow broken"
      }
    }
  ]
}
```

---

### Approximate Issue Count
Provides an estimated count of issues matching a JQL query. This is useful for UI elements that need to show total results without fetching all of them.

**Endpoint:** `POST /rest/api/3/search/approximate-count`

**Request Body Parameters:**

| Name | Type | Description |
| :--- | :--- | :--- |
| `jql` | `string` | The JQL query to count. **Note: Query must be bounded.** |

**Request Body Example:**

```json
{
  "jql": "project = HSP"
}
```

**Response Example (200 OK):**

```json
{
  "count": 153
}
```

**Error Responses:**

| Status | Description |
| :--- | :--- |
| `400` | The JQL query cannot be parsed. |
| `401` | Authentication credentials are incorrect. |

---

## JQL Best Practices

- **Use `accountId` instead of `username`**: Due to privacy changes, `username` and `userkey` are no longer supported in JQL.
- **Pagination**: Always use `startAt` and `maxResults` when dealing with large datasets to avoid timeouts and excessive memory usage.
- **Field Selection**: To improve performance, only request the fields you actually need using the `fields` parameter.
- **Validation**: When testing new JQL strings, use the `validateQuery=strict` parameter to catch syntax errors early.