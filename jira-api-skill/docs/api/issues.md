# Issue Operations

This module provides comprehensive technical documentation for managing the lifecycle and metadata of Jira issues via the Atlassian Jira Cloud REST API (v3).

## Overview

Issues are the primary work items in Jira. They can be standard issues or sub-tasks. In the context of Atlassian Forge, interacting with issues requires careful consideration of permissions and the use of Atlassian Document Format (ADF) for text-based fields.

### Required Forge Scopes

| Scope | Capability |
| :--- | :--- |
| `read:jira-work` | Read issue details, comments, attachments, and worklogs. |
| `write:jira-work` | Create, update, transition, and delete issues. |
| `manage:jira-configuration` | Required for certain administrative issue operations. |

---

## Core Operations

### Create Issue

Creates a new issue or a sub-task.

**Endpoint:** `POST /rest/api/3/issue`

**Request Body Parameters:**

| Name | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `fields` | `object` | Yes | A map of fields to set. Use this for straightforward "set" operations. |
| `update` | `object` | No | A map of field names to an array of operations (`add`, `remove`, `set`). Use this for complex updates (e.g., adding a label without overwriting existing ones). |
| `transition` | `object` | No | The transition to apply immediately after creation. |
| `properties` | `array[object]`| No | Issue properties to add or update. |

> [!IMPORTANT]
> Fields included in the `fields` object **cannot** be included in the `update` object.

**Request Body Example:**

```json
{
  "fields": {
    "project": { "key": "PROJ" },
    "summary": "System outage in production",
    "description": {
      "type": "doc",
      "version": 1,
      "content": [
        {
          "type": "paragraph",
          "content": [
            { "type": "text", "text": "Critical error detected in the payment gateway." }
          ]
        }
      ]
    },
    "issuetype": { "id": "10001" }
  },
  "update": {
    "labels": [
      { "add": "incident" }
    ]
  }
}
```

**Response Example (201 Created):**

```json
{
  "id": "10005",
  "key": "PROJ-456",
  "self": "https://your-domain.atlassian.net/rest/api/3/issue/10005",
  "transition": {
    "status": 200,
    "errorCollection": { "errorMessages": [], "errors": {} }
  }
}
```

**Error Responses:**

| Status | Description |
| :--- | :--- |
| `400` | Invalid field values, missing required fields, or invalid ADF structure. |
| `403` | User lacks *Create Issues* permission in the target project. |
| `404` | The specified project or issue type does not exist. |

---

### Get Issue

Retrieves detailed information about a specific issue.

**Endpoint:** `GET /rest/api/3/issue/{issueIdOrKey}`

**Query Parameters:**

| Name | Type | Description |
| :--- | :--- | :--- |
| `fields` | `array[string]` | A list of specific fields to return. Use `*all` for all fields. |
| `expand` | `string` | Comma-separated list of expansions (e.g., `transitions,changelog,renderedFields`). |
| `fieldsByKeys` | `boolean` | If `true`, uses field keys instead of IDs. |

**Response Example (200 OK):**

```json
{
  "id": "10005",
  "key": "PROJ-456",
  "self": "https://your-domain.atlassian.net/rest/api/3/issue/10005",
  "fields": {
    "summary": "System outage in production",
    "status": { "name": "To Do", "id": "1" },
    "priority": { "name": "High", "id": "2" }
  },
  "renderedFields": {
    "description": "<p>Critical error detected in the payment gateway.</p>"
  }
}
```

**Error Responses:**

| Status | Description |
| :--- | :--- |
| `404` | Issue not found. |

---

### Update Issue

Edits an existing issue.

**Endpoint:** `PUT /rest/api/3/issue/{issueIdOrKey}`

**Request Body Parameters:**

| Name | Type | Description |
| :--- | :--- | :--- |
| `fields` | `object` | Simple field updates. |
| `update` | `object` | Complex operations using `add`, `remove`, or `set`. |
| `properties` | `array[object]` | Issue properties to update. |

**Request Body Example (Complex Update):**

```json
{
  "fields": {
    "summary": "Updated: System outage"
  },
  "update": {
    "labels": [
      { "add": "urgent" },
      { "remove": "low-priority" }
    ],
    "components": [
      { "add": { "id": "10002" } }
    ]
  }
}
```

**Error Responses:**

| Status | Description |
| :--- | :--- |
| `400` | Invalid request body or field conflict. |
| `404` | Issue not found. |

---

### Transition Issue

Moves an issue through a workflow step.

**Endpoint:** `POST /rest/api/3/issue/{issueIdOrKey}/transitions`

**Important:** You must first query `GET /rest/api/3/issue/{issueIdOrKey}/transitions` to find the valid `id` for the desired transition.

**Request Body Parameters:**

| Name | Type | Description |
| :--- | :--- | :--- |
| `transition` | `object` | The transition object. |
| `transition.id` | `string` | **Required.** The ID of the target transition. |
| `fields` | `object` | (Optional) Field values required by the transition screen. |

**Request Body Example:**

```json
{
  "transition": {
    "id": "31"
  },
  "fields": {
    "comment": {
      "type": "doc",
      "version": 1,
      "content": [
        {
          "type": "paragraph",
          "content": [{ "type": "text", "text": "Moving to In Progress." }]
        }
      ]
    }
  }
}
```

---

### Delete Issue

Removes an issue.

**Endpoint:** `DELETE /rest/api/3/issue/{issueIdOrKey}`

**Query Parameters:**

| Name | Type | Description | Default |
| :--- | :--- | :--- | :--- |
| `deleteSubtasks` | `boolean` | If `true`, deletes all sub-tasks associated with this issue. | `false` |

**Error Responses:**

| Status | Description |
| :--- | :--- |
| `400` | Issue has sub-tasks and `deleteSubtasks` is not set to `true`. |
| `403` | Insufficient permissions. |

---

## Sub-resources

### Comments

Manage discussions on an issue.

**Endpoint:** `POST /rest/api/3/issue/{issueIdOrKey}/comment`

**Request Body Example:**

```json
{
  "body": {
    "type": "doc",
    "version": 1,
    "content": [
      {
        "type": "paragraph",
        "content": [{ "type": "text", "text": "Investigating now." }]
      }
    ]
  }
}
```

**Endpoints:**
- `GET /rest/api/3/issue/{issueIdOrKey}/comment` (List comments)
- `DELETE /rest/api/3/issue/{issueIdOrKey}/comment/{id}` (Delete a specific comment)

### Attachments

Manage files attached to an issue.

**Endpoint:** `POST /rest/api/3/issue/{issueIdOrKey}/attachments`

> [!IMPORTANT]
> You **must** include the header `X-Atlassian-Token: no-check` to prevent CSRF protection from blocking the multipart request.

**Request Format:** `multipart/form-data`

**Endpoints:**
- `GET /rest/api/3/issue/{issueIdOrKey}/attachment` (List attachments)

### Worklogs

Track time spent on an issue.

**Endpoint:** `POST /rest/api/3/issue/{issueIdOrKey}/worklog`

**Request Body Example:**

```json
{
  "timeSpentSeconds": 3600,
  "comment": {
    "type": "doc",
    "version": 1,
    "content": [
      {
        "type": "paragraph",
        "content": [{ "type": "text", "text": "Spent one hour on research." }]
      }
    ]
  }
}
```

### Watchers & Votes

- **Watchers**: `GET`, `POST`, and `DELETE /rest/api/3/issue/{issueIdOrKey}/watchers`
- **Votes**: `POST` and `DELETE /rest/api/3/issue/{issueIdOrKey}/votes`

### Issue Properties

Store app-specific metadata directly on the issue. This is highly recommended for Forge apps to persist state without creating extra Jira entities.

**Endpoints:**
- `GET /rest/api/3/issue/{issueIdOrKey}/properties` (List all)
- `PUT /rest/api/3/issue/{issueIdOrKey}/properties/{propertyKey}` (Create/Update)
- `DELETE /rest/api/3/issue/{issueIdOrKey}/properties/{propertyKey}` (Delete)

---

## Technical Implementation Notes

### Atlassian Document Format (ADF)

Fields such as `description`, `comment`, and `environment` do not accept plain strings. They require an ADF object.

**Basic Paragraph Structure:**
```json
{
  "type": "doc",
  "version": 1,
  "content": [
    {
      "type": "paragraph",
      "content": [
        { "type": "text", "text": "Your text here" }
      ]
    }
  ]
}
```

### Forge Implementation Strategies

| Scenario | Recommended Method | Reason |
| :--- | :--- | :--- |
| **UI-driven action** (e.g. clicking a button) | `api.asUser().requestJira(...)` | Respects the user's current permissions and visibility. |
| **Background Task** (e.g. Triggered by Webhook) | `api.asApp().requestJira(...)` | Ensures the operation succeeds even if the triggering user has limited permissions. |
| **Large Data Updates** | Use `update` instead of `fields` | `update` allows granular changes (e `add` a label) without needing to fetch the current state first. |