# Field Configuration & Management

This module covers API endpoints for managing Jira fields, field configurations, schemes, and screen associations. This is critical for apps that automate Jira administration or customize the user interface based on field properties.

## Overview

Jira's field management is hierarchical:
- **Fields**: The basic unit of data.
- **Field Contexts**: Define how a field behaves for specific projects or issue types (e.g., providing different options for a dropdown).
- **Field Configuration Schemes**: Control which fields are required, hidden, or present in a project.
- **Screens**: Define which fields are visible in specific issue views (Create, Edit, View).

---

## Required Forge Scopes

To use these endpoints, your Forge app must have administrative-level scopes in `manifest.yml`:

| Scope | Purpose |
| :--- | :--- |
| `manage:jira-configuration` | Create, update, or delete field configurations, schemes, and screens. |
| `read:jira-work` | View field metadata and existing configurations. |

---

## Field Operations

### Search Fields
Retrieves a list of available fields in the Jira instance.

**Endpoint:** `GET /rest/api/3/field/search`

**Response Example (200 OK):**

```json
[
  {
    "id": "customfield_10001",
    "name": "My Custom Field",
    "custom": true,
    "orderable": true,
    "searchable": true
  }
]
```

### Get Field Details
Retrieves detailed information about a specific field, including its type and current contexts.

**Endpoint:** `GET /rest/api/3/field/{fieldId}`

**Response Example (200 OK):**

```json
{
  "id": "customfield_10001",
  "name": "My Custom Field",
  "custom": true,
  "schema": {
    "type": "string",
    "custom": false
  },
  "contexts": [
    {
      "id": "context-123",
      "name": "Default Context"
    }
  ]
}
```

---

## Field Context Management

Contexts allow a single field to have different configurations (like dropdown options) depending on the project or issue type.

### Get Field Contexts
Lists all contexts associated with a specific field.

**Endpoint:** `GET /rest/api/3/field/{fieldId}/contexts`

### Manage Field Mappings
Endpoints for mapping fields to specific projects or issue types within a context.

**Endpoints:**
- `POST /rest/api/3/field/{fieldId}/context/{contextId}/project` (Map to Project)
- `POST /rest/api/3/field/{fieldId}/context/{contextId}/issuetype` (Map to Issue Type)
- `DELETE /rest/api/3/field/{fieldId}/context/{contextId}/project` (Remove Project Mapping)

---

## Configuration Schemes

### Field Configuration Schemes
Schemes determine which fields are required or present for an issue type.

**Endpoints:**
- `GET /rest/api/3/config/fieldschemes` (List all schemes)
- `GET /rest/api/3/config/fieldschemes/{id}` (Get scheme details)
- `POST /rest/api/3/config/fieldschemes/{id}/clone` (Clone a scheme)

### Field Configuration
The actual settings for a field (e.g., whether it is required).

**Endpoints:**
- `GET /rest/api/3/fieldconfiguration/{id}`
- `GET /rest/api/3/fieldconfiguration/{id}/fields` (List fields in a configuration)

---

## Screen & Tab Management

Screens define the layout of fields during issue interactions.

### Manage Screen Fields
Control which fields appear on specific screens and within specific tabs.

**Endpoints:**
- `GET /rest/api/3/screens/{screenId}/tabs/{tabId}/fields` (List fields on a tab)
- `POST /rest/api/3/screens/{screenId}/tabs/{tabId}/fields` (Add field to tab)
- `PUT /rest/api/3/screens/{screenId}/tabs/{tabId}/fields/{id}/move` (Reorder fields)

---

## Error Responses

| Status | Description |
| :--- | :--- |
| `400` | Invalid field ID, context, or mapping parameters. |
| `403` | Insufficient administrative permissions. |
| `404` | Field, context, scheme, or screen not found. |