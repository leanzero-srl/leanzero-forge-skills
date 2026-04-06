# System Administration

This module covers API endpoints for managing global application settings, system information, and instance-level configurations.

## Overview

System administration endpoints allow developers to build tools that manage the environment itself, such as configuring application properties, checking license status, or managing the site-wide announcement banner. These operations typically require elevated administrative permissions.

---

## Required Forge Scopes

To use these endpoints, your Forge app must have the following scopes in `manifest.yml`:

| Scope | Purpose |
| :--- | :--- |
| `manage:jira-configuration` | Modify application properties and system settings. |
| `read:jira-admin` | Retrieve system and license information. |

---

## Application Settings

### Application Properties

Manage global properties that affect the behavior of the Jira application.

**Endpoints:**
- `GET /rest/api/3/application-properties` - List all properties.
- `POST /rest/api/3/application-properties` - Create a new property.
- `GET /rest/api/3/application-properties/{id}` - Retrieve a specific property.
- `PUT /rest/api/3/application-properties/{id}` - Update a property.
- `DELETE /rest/api/3/application-properties/{id}` - Delete a property.
- `GET /rest/api/3/application-properties/advanced-settings` - Retrieve advanced application settings.

---

## Instance & License Information

### License Details

Retrieve information about the current Jira instance license.

**Endpoint:** `GET /rest/api/3/instance/license`

**Response Example (200 OK):**

```json
{
  "type": "datacenter",
  "version": "9.4.0",
  "licenseType": "subscription",
  "users": {
    "max": 100,
    "used": 45
  }
}
```

### Server Information

Retrieve basic information about the Jira server/instance.

**Endpoint:** `GET /rest/api/3/serverInfo`

---

## Site Communication

### Announcement Banner

Manage the banner displayed to all users on the Jira site.

**Endpoints:**
- `GET /rest/api/3/announcementBanner` - Retrieve the current banner.
- `PUT /rest/api/3/announcementBanner` - Update the banner content.
- `DELETE /rest/api/3/announcementBanner` - Remove the banner.

**Request Body Example (PUT):**

```json
{
  "message": "Scheduled maintenance tonight at 10 PM UTC.",
  "active": true
}
```

---

## Error Responses

| Status | Description |
| :--- | :--- |
| `400` | Invalid property value or malformed request. |
| `401` | Authentication credentials incorrect or missing. |
| `403` | Insufficient administrative permissions. |
| `404` | Requested property, license, or banner not found. |