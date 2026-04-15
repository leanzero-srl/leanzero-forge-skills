# Workflow Operations

This module provides comprehensive technical documentation for managing Jira workflows, including workflow configurations, statuses, transitions, and their associations with issue types via workflow schemes.

## Overview

Workflows define the lifecycle of issues in Jira. A workflow is a collection of **Statuses** (representing states like "To Do" or "Done") and **Transitions** (the paths that allow moving an issue from one status to another).

### Key Concepts

| Concept | Description |
| :--- | :--- |
| **Status** | A specific state in a workflow. Each status has an ID, name, and can have properties (e.g., `jira.issue.editable`). |
| **Transition** | The action that moves an issue from a source status to a target status. |
| **Workflow Scope** | Workflows can be `GLOBAL` (company-managed) or `PROJECT` (team-managed). |
| **Workflow Scheme** | A mapping that determines which workflow is used for which issue types within a project. |

### Required Forge Scopes

| Scope | Capability |
| :--- | :--- |
| `read:jira-work` | View workflows, statuses, and transitions. |
| `write:jira-work` | Create, update, or delete workflows and schemes. |
| `manage:jira-configuration` | Required for administrative changes to global workflows and schemes. |

---

## Core Workflow Operations

### Search Workflows

Returns a paginated list of workflows.

**Endpoint:** `GET /rest/api/3/workflows/search`

**Query Parameters:**

| Name | Type | Description |
| :--- | :--- | :--- |
| `startAt` | `integer` | Page offset. Default: `0`. |
| `maxResults` | `integer` | Max items per page. Default: `50`. |
| `expand` | `string` | Comma-separated list of expansions (e.g., `values.transitions`). |
| `queryString` | `string` | Partial match for workflow name. |
| `scope` | `string` | `GLOBAL` or `PROJECT`. |
| `isActive` | `boolean` | Filter by active/inactive status. |

**Response Example (200 OK):**

```json
{
  "total": 1,
  "values": [
    {
      "id": "b9ff2384-d3b6-4d4e-9509-3ee19f607168",
      "name": "Software Development Workflow",
      "description": "Standard workflow for software projects",
      "statuses": [
        { "id": "10001", "name": "To Do" },
        { "id": "10002", "name": "In Progress" }
      ],
      "transitions": [
        {
          "id": "11",
          "name": "Start Progress",
          "type": "directed",
          "from": ["10001"],
          "to": "10002"
        }
      ]
    }
  ]
}
```

---

### Get Single Workflow

Retrieves detailed configuration for a specific workflow.

**Endpoint:** `GET /rest/api/3/workflow/{workflowId}`

**Response Example (200 OK):**

```json
{
  "id": "b9ff2384-d3b6-4d4e-9509-3ee19f607168",
  "name": "Software Development Workflow",
  "statuses": [
    {
      "id": "10001",
      "name": "To Do",
      "properties": { "jira.issue.editable": true }
    }
  ],
  "transitions": [
    {
      "id": "11",
      "name": "Start Progress",
      "type": "directed",
      "from": ["10001"],
      "to": "10002"
    }
  ],
  "operations": {
    "canEdit": true,
    "canDelete": true
  }
}
```

---

### Update Workflow

Updates an existing workflow configuration.

**Endpoint:** `PUT /rest/api/3/workflows/update`

**Request Body Parameters:**

| Name | Type | Description |
| :--- | :--- | :--- |
| `workflowId` | `string` | **Required.** The ID of the workflow to update. |
| `statuses` | `array[object]`| List of statuses to modify or add. |
| `transitions` | `array[object]`| List of transitions to modify or add. |

**Error Responses:**

| Status | Description |
| :--- | :--- |
| `409` | Conflict: Another workflow update is currently in progress. |

---

### Delete Workflow

Removes a workflow.

**Endpoint:** `DELETE /rest/api/3/workflows/{workflowId}`

**Error Responses:**

| Status | Description |
| :--- | :--- |
| `403` | Insufficient permissions. |
| `409` | Workflow is currently in use by a scheme. |

---

## Workflow Schemes & Mappings

Workflow schemes act as the glue between workflows and projects.

### Get Workflow Scheme

**Endpoint:** `GET /rest/api/3/workflowscheme/{id}`

**Response Example:**

```json
{
  "id": "scheme-123",
  "name": "Standard Software Scheme",
  "issueTypeMappings": [
    {
      "issueTypeId": "10001",
      "workflowId": "b9ff2384-d3b6-4d4e-9509-3ee19f607168"
    }
  ]
}
```

### Update Scheme Mappings

Update which workflows are assigned to which issue types within a scheme.

**Endpoint:** `PUT /rest/api/3/workflowscheme/update/mappings`

**Request Body Example:**

```json
{
  "workflowSchemeId": "scheme-123",
  "mappings": [
    {
      "issueTypeId": "10001",
      "workflowId": "new-workflow-id-456"
    }
  ]
}
```

### Switch Workflow Scheme for Project

Assign a new workflow scheme to a specific project.

**Endpoint:** `POST /rest/api/3/workflowscheme/project/switch`

**Request Body Example:**

```json
{
  "projectId": "proj-789",
  "workflowSchemeId": "new-scheme-id"
}
```

---

## Technical Implementation Notes

### Transition Types

| Type | Description |
| :--- | :--- |
| `initial` | A transition that leads from no state to the first status of a workflow. |
| `directed` | A transition from a specific source status to a target status. |
| `global` | A transition that can be triggered from any status in the workflow. |

### Forge Implementation Strategy

| Scenario | Recommended Method | Reason |
| :--- | :--- | :--- |
| **Workflow Discovery** | `api.asUser().requestJira(...)` | Most users only have permission to see workflows they can actually use. |
| **Automated Setup** | `api.asApp().requestJira(...)` | Forge apps often need to configure default workflows or schemes during installation/provisioning. |