# Field and Screen Management

This module covers advanced API endpoints for managing the lifecycle, context, and visual layout of fields and screens in Jira.

## Overview

For advanced Jira integrations, simple field configuration is often insufficient. Developers may need to manage field contexts (to ensure specific values appear only in certain projects), manipulate select list options, or even dynamically adjust screen layouts. This module provides the technical reference for these administrative operations.

---

## Required Forge Scopes

To use these endpoints, your Forge app must have administrative-level scopes in `manifest.yml`:

| Scope | Purpose |
| :--- | :--- |
| `manage:jira-configuration` | Manage field contexts, options, screens, and tabs. |

---

## Field Contexts & Mapping

Field contexts allow you to define different behaviors (like default values or available options) for the same field across different projects or issue types.

### Context Configuration

**Endpoints:**
- `GET /rest/api/3/field/{fieldId}/contexts` (List all contexts for a field)
- `POST /rest/api/3/field/{fieldId}/context` (Create a new context)
- `GET /rest/api/3/field/{fieldId}/context/{contextId}` (Get a specific context)
- `PUT /rest/api/3/field/{fieldId}/context/{contextId}` (Update a context)
- `DELETE /rest/api/3/field/{fieldId}/context/{contextId}` (Delete a context)

**Context Mapping Operations:**
- `POST /rest/api/3/field/{fieldId}/context/{contextId}/project` (Map a context to a project)
- `POST /rest/api/3/field/{fieldId}/context/{contextId}/issuetype` (Map a context to an issue type)

---

## Field Options Management

For fields that use select lists (dropdowns, radio buttons), you must manage the available options.

**Endpoints:**
- `GET /rest/api/3/field/{fieldKey}/option` (List all options for a field)
- `POST /rest/api/3/field/{fieldKey}/option` (Create a new option)
- `PUT /rest/api/3/field/{fieldKey}/option/{optionId}` (Update an option)
- `DELETE /rest/api/3/field/{fieldKey}/option/{optionId}` (Delete an option)
- `POST /rest/api/3/field/{fieldKey}/option/move` (Move an option between contexts)

**Response Example (200 OK) - Get Options:**

```json
[
  {
    "id": "10050",
    "value": "High Priority",
    "description": "Urgent issues requiring immediate attention"
  },
  {
    "id": "10051",
    "value": "Medium Priority",
    "description": "Standard priority issues"
  }
]
```

---

## Screen & Tab Layouts

Screens define which fields are visible during specific operations (Create, Edit, View). Tabs allow for organizing these fields into logical groups.

### Managing Screen Tabs

**Endpoints:**
- `GET /rest/api/3/screens/{screenId}/tabs` (List all tabs on a screen)
- `POST /rest/api/3/screens/{screenId}/tabs` (Create a new tab)
- `DELETE /rest/api/3/screens/{screenId}/tabs/{tabId}` (Delete a tab)

### Managing Fields on Tabs

**Endpoints:**
- `GET /rest/api/3/screens/{screenId}/tabs/{tabId}/fields` (List fields in a specific tab)
- `POST /rest/api/3/screens/{screenId}/tabs/{tabId}/fields` (Add a field to a tab)
- `PUT /rest/api/3/screens/{screenId}/tabs/{tabId}/fields/{id}/move` (Change field order within a tab)
- `DELETE /rest/api/3/screens/{screenId}/tabs/{tabId}/fields/{id}` (Remove a field from a tab)

---

## Error Responses

| Status | Description |
| :--- | :--- |
| `400` | Invalid field ID, context ID, or malformed request body. |
| `403` | Insufficient administrative permissions to modify configuration. |
| `404` | Field, screen, context, or tab not found. |