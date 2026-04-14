# Users API

The Users API provides endpoints for managing user access and performing bulk lookups of user details within a Confluence site.

---

## Overview

This API is primarily used for administrative tasks such as checking which users have access to the site, inviting new users via email, and resolving account IDs for a list of users.

### User-Related Data via Content
Note that user information (specifically account IDs) can also be retrieved through "Like" endpoints for various content types:
- **Blog Posts**: `GET /blogposts/{id}/likes/users`
- **Pages**: `GET /pages/{id}/likes/users`
- **Footer Comments**: `GET /footer-comments/{id}/likes/users`
- **Inline Comments**: `GET /inline-comments/{id}/likes/users`

---

## Endpoint Breakdown

### Bulk User Lookup

Retrieve detailed user information for a provided list of account IDs.

`POST /users-bulk`

**Request Body:**

The request body should contain a list of account IDs to look up.

```json
{
  "ids": ["account-id-1", "account-id-2"]
}
```

**Response Example:**

```json
{
  "results": [
    {
      "accountId": "account-id-1",
      "displayName": "John Doe",
      "emailAddress": "john.doe@example.com"
    },
    {
      "accountId": "account-id-2",
      "displayName": "Jane Smith",
      "emailAddress": "jane.smith@example.com"
    }
  ],
  "_links": {
    "self": "/wiki/api/v2/users-bulk"
  }
}
```

**Error Responses:**

| Code | Description |
|------|-------------|
| `400` | Returned if an invalid request is provided. |
| `404` | Returned if the user lacks permission to view user profiles. |

---

### Access Management

#### Check Site Access

Check which emails from a provided list do not currently have access to the Confluence site.

`POST /user/access/check-access-by-email`

**Request Body:**

```json
{
  "emails": ["user1@example.com", "invalid-email"]
}
```

**Response Example:**

```json
{
  "emailsWithoutAccess": [
    "user1@example.com"
  ],
  "invalidEmails": [
    "invalid-email"
  ]
}
```

**Error Responses:**

| Code | Description |
|------|-------------|
| `400` | Returned if an invalid request is provided. |
| `401` | Returned if the authentication credentials are incorrect or missing. |
| `404` | Returned if the user lacks permission to check access. |
| `503` | Returned if the API is disabled on the site. |

---

#### Invite Users by Email

Invite a list of users to the Confluence site via email. This operation is asynchronous.

`POST /user/access/invite-by-email`

**Request Body:**

```json
{
  "emails": ["newuser@example.com", "anotheruser@example.com"]
}
```

**Response Example:**

```json
{
  "status": "success"
}
```

**Error Responses:**

| Code | Description |
|------|-------------|
| `400` | Returned if an invalid request is provided. |
| `401` | Returned if the authentication credentials are incorrect or missing. |
| `404` | Returned if the user lacks permission to invite users. |
| `503` | Returned if the API is disabled on the site. |