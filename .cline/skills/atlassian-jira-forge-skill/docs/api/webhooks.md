# Webhooks

This module covers API endpoints for managing webhooks, which allow Jira to send real-time notifications to external URLs when specific events occur.

## Overview

Webhooks are essential for building reactive Forge apps. When an event (like an issue being created or updated) matches a JQL query defined in the webhook, Jira sends an HTTP POST request to the configured URL.

**Note:** Webhook management is primarily designed for Connect and OAuth 2.0 apps. Webhooks registered through the REST API typically expire after 30 days and must be periodically refreshed.

---

## Webhook Management

### Register Dynamic Webhooks
Registers one or more webhooks. This is the primary method for dynamic webhook management, allowing multiple webhook configurations to be sent in a single request.

**Endpoint:** `POST /rest/api/3/webhook`

**Request Body Parameters:**

| Name | Type | Description |
| :--- | :--- | :--- |
| `url` | `string` | **Required.** The destination URL where the POST request will be sent. |
| `webhooks` | `array[object]` | **Required.** An array of webhook configuration objects. |

**Webhook Object Properties:**

| Name | Type | Description |
| :--- | :--- | :--- |
| `events` | `array[string]` | A list of event types that trigger the webhook (e.g., `jira:issue_created`, `jira:issue_updated`). |
| `jqlFilter` | `string` | A JQL query to filter which issues trigger the webhook. |
| `fieldIdsFilter` | `array[string]` | A list of field IDs to filter by. |
| `issuePropertyKeysFilter` | `array[string]` | A list of issue property keys to filter by. |

**Request Body Example:**

```json
{
  "url": "https://your-app.example.com/webhook-received",
  "webhooks": [
    {
      "events": ["jira:issue_created", "jira:issue_updated"],
      "fieldIdsFilter": ["summary", "customfield_10029"],
      "jqlFilter": "project = PROJ"
    },
    {
      "events": ["jira:issue_deleted"],
      "jqlFilter": "project IN (PROJ, EXP) AND status = done"
    },
    {
      "events": ["issue_property_set"],
      "issuePropertyKeysFilter": ["my-issue-property-key"],
      "jqlFilter": "project = PROJ"
    }
  ]
}
```

**Response Example (200 OK):**

```json
{
  "webhookRegistrationResult": [
    { "createdWebhookId": 1000 },
    { "errors": ["The clause watchCount is unsupported"] },
    { "createdWebhookId": 1001 }
  ]
}
```

**Error Responses:**

| Status | Description |
| :--- | :--- |
| `400` | The request is invalid. |
| `403` | The caller is not an app or lacks permissions. |

---

### Get Webhooks
Returns a paginated list of the webhooks registered by the calling app.

**Endpoint:** `GET /rest/api/3/webhook`

**Query Parameters:**

| Name | Type | Description |
| :--- | :--- | :--- |
| `startAt` | `integer` | The index of the first item to return (page offset). Default: `0`. |
| `maxResults` | `integer` | The maximum number of items to return per page. Default: `100`. |

**Response Example (200 OK):**

```json
{
  "isLast": true,
  "maxResults": 3,
  "startAt": 0,
  "total": 3,
  "values": [
    {
      "events": ["jira:issue_updated", "jira:issue_created"],
      "expirationDate": "2019-06-01T12:42:30.000+0000",
      "fieldIdsFilter": ["summary", "customfield_10029"],
      "id": 10000,
      "jqlFilter": "project = PRJ",
      "url": "https://your-app.example.com/webhook-received"
    },
    {
      "events": ["jira:issue_created"],
      "expirationDate": "2019-06-01T12:42:30.000+0000",
      "id": 10001,
      "jqlFilter": "issuetype = Bug",
      "url": "https://your-app.example.com/webhook-received"
    }
  ]
}
```

---

### Delete Webhooks
Removes webhooks by their IDs. Only webhooks registered by the calling app can be removed.

**Endpoint:** `DELETE /rest/api/3/webhook`

**Request Body Parameters:**

| Name | Type | Description |
| :--- | :--- | :--- |
| `webhookIds` | `array[integer]` | **Required.** A list of the webhook IDs to be removed. |

**Request Body Example:**

```json
{
  "webhookIds": [10000, 10001, 10042]
}
```

**Response Example (202 Accepted):**

```json
{}
```

**Error Responses:**

| Status | Description |
| :--- | :--- |
| `400` | The list of webhook IDs is missing or invalid. |
| `403` | The caller is not an app or lacks permissions. |

---

### Refresh Webhooks
Extends the life of registered webhooks. Webhooks registered through the REST API expire after 30 days and must be refreshed to remain active.

**Endpoint:** `PUT /rest/api/3/webhook/refresh`

**Request Body Parameters:**

| Name | Type | Description |
| :--- | :--- | :--- |
| `webhookIds` | `array[integer]` | **Required.** A list of the webhook IDs to refresh. |

**Request Body Example:**

```json
{
  "webhookIds": [10000, 10001, 10042]
}
```

**Response Example (200 OK):**

```json
{
  "expirationDate": "2019-06-01T12:42:30.000+0000"
}
```

---

### Get Failed Webhooks
Returns a list of webhooks that have recently failed to be delivered to the requesting app after the maximum number of retries.

**Endpoint:** `GET /rest/api/3/webhook/failed`

**Query Parameters:**

| Name | Type | Description |
| :--- | :--- | :--- |
| `maxResults` | `integer` | The maximum number of webhooks to return per page. |
| `after` | `integer` | The time (in milliseconds since UNIX epoch) after which any webhook failure must have occurred. |

**Response Example (200 OK):**

```json
{
  "values": [
    {
      "id": "1",
      "body": "{\"data\":\"webhook data\"}",
      "url": "https://example.com",
      "failureTime": 1573118132000
    },
    {
      "id": "2",
      "url": "https://example.com",
      "failureTime": 1573540473480
    }
  ],
  "maxResults": 100,
  "next": "https://your-domain.atlassian.net/rest/api/3/webhook/failed?failedAfter=1573540473480&maxResults=100"
}
```

**Error Responses:**

| Status | Description |
| :--- | :--- |
| `400` | Invalid request parameters. |
| `403` | The caller is not a Connect app. |