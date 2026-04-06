# Whiteboards API

The Whiteboards API allows you to manage collaborative whiteboards within Confluence, including creating, retrieving, updating, and deleting them, as well as managing their data classification levels.

---

## Overview

Whiteboards are interactive, visual collaboration tools within Confluence. This API provides the necessary endpoints to integrate whiteboard management into Forge applications.

---

## Endpoint Breakdown

### Whiteboard Management

Core operations for managing the lifecycle of whiteboards.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/whiteboards` | Create a new whiteboard in a space. |
| `GET` | `/whiteboards/{id}` | Retrieve details of a specific whiteboard. |
| `PUT` | `/whiteboards/{id}` | Update an existing whiteboard. |
| `DELETE` | `/whiteboards/{id}` | Delete a whiteboard. |

**Request Example (Create Whiteboard):**

`POST /whiteboards?private=true`

```json
{
  "title": "Team Brainstorming Session",
  "description": "A space for our weekly sync."
}
```

**Response Example (Created Whiteboard):**

```json
{
  "id": "wb-98765",
  "title": "Team Brainstorming Session",
  "isPrivate": true,
  "_links": {
    "self": "/wiki/api/v2/whiteboards/wb-98765",
    "base": "https://your-site.atlassian.net/wiki"
  }
}
```

### Classification Level

Manage the data classification for whiteboards.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/whiteboards/{id}/classification-level/reset` | Reset the data classification level to the space default. |

---

## Error Responses

Common error codes for Whiteboard operations:

| Code | Description |
|------|-------------|
| `400` | Bad Request - Invalid request parameters or body. |
| `401` | Unauthorized - Authentication is missing or invalid. |
| `404` | Not Found - The specified whiteboard or space was not found. |
| `413` | Payload Too Large - The request body exceeds the 5 MB limit. |