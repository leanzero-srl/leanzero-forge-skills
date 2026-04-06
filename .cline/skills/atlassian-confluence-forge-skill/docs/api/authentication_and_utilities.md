# Authentication & Utilities API

This module covers authentication patterns for Forge apps and utility endpoints for user access and data conversion.

---

## Authentication Patterns

Forge apps should use the `@forge/bridge` or `@forge/api` packages to interact with Confluence. This ensures that requests are correctly proxied and authenticated.

### Using `requestConfluence` (Recommended)

The most common way to make API calls is using the `requestConfluence` method from `@forge/bridge`.

```javascript
import { route } from '@forge/api';
import { requestConfluence } from '@forge/bridge';

const response = await requestConfluence(route`/wiki/api/v2/pages/${pageId}`);
```

---

## Utility Endpoints

### Convert IDs to Types

A utility to convert various ID formats into their corresponding Confluence types.

`POST /content/convert-ids-to-types`

---

## User Access & Bulk Operations

### Check Access by Email

Check if a user has access to Confluence via their email address.

`POST /user/access/check-access-by-email`

### Invite User by Email

Invite a new user to Confluence using their email address.

`POST /user/access/invite-by-email`

### Bulk User Operations

Perform bulk operations on users.

`POST /users-bulk`

---

## Error Responses

Common error codes for Utility and Access operations:

| Code | Description |
|------|-------------|
| `400` | Bad Request - Invalid parameters or body. |
| `401` | Unauthorized - Authentication is missing or invalid. |
| `403` | Forbidden - Insufficient permissions for this operation. |
| `404` | Not Found - The specified resource or user was not found. |