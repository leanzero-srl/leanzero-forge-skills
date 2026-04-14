# App Properties API

The App Properties API allows Forge apps to store and manage persistent, application-specific metadata. 

> [!IMPORTANT]
> This API can **only** be accessed using **[asApp()](https://developer.atlassian.com/platform/forge/apis-reference/fetch-api-product.requestconfluence/#method-signature)** requests from Forge. It is not accessible via standard user authentication.

---

## Overview

App properties are key-value pairs that belong to the Forge app itself rather than a specific piece of content (like a page or attachment). They are ideal for storing configuration settings, state, or any other data that needs to persist across different user sessions and content interactions.

---

## Endpoint Breakdown

### Managing App Properties

These endpoints allow you to manage the lifecycle of properties belonging to your Forge app.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/app/properties` | List all properties for the Forge app. |
| `GET` | `/app/properties/{propertyKey}` | Retrieve a specific property by its key. |
| `PUT` | `/app/properties/{propertyKey}` | Create or update a property. |
| `DELETE` | `/app/properties/{propertyKey}` | Delete a specific property. |

**Request Example (Create/Update Property):**

`PUT /app/properties/my-app-config`

```json
{
  "theme": "dark",
  "version": "1.2.0",
  "enabledFeatures": ["analytics", "custom-ui"]
}
```

**Response Example (Get Single Property):**

```json
{
  "key": "my-app-config",
  "value": {
    "theme": "dark",
    "version": "1.2.0",
    "enabledFeatures": ["analytics", "custom-ui"]
  }
}
```

**Response Example (List All Properties):**

```json
{
  "results": [
    {
      "key": "my-app-config",
      "value": { "theme": "dark" }
    },
    {
      "key": "last-sync",
      "value": { "timestamp": 1712345678 }
    }
  ],
  "_links": {
    "self": "/wiki/api/v2/app/properties"
  }
}
```

### Query Parameters (for GET `/app/properties`)

| Name | Location | Type | Required | Description |
|------|----------|------|----------|-------------|
| `cursor` | query | string | No | Used for pagination. Represents the last returned property key. |
| `limit` | query | integer | No | Maximum number of app properties per result to return (1-250). |

---

## Error Responses

Common error codes for App Property operations:

| Code | Description |
|------|-------------|
| `400` | Bad Request - Invalid JSON or property key longer than 127 characters. |
| `401` | Unauthorized - The request did not originate from the Forge app (missing `asApp()`). |
| `403` | Forbidden - The request attempts impersonation or the Forge app is not installed. |
| `404` | Not Found - The specified property key was not found. |