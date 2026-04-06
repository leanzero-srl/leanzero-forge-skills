# Plans (Advanced Roadmaps)

This module covers API endpoints for managing Jira Plans, which are part of Advanced Roadmaps for planning, capacity management, and cross-project visibility.

## Overview

Plans allow teams to plan work across multiple projects, manage capacity, and visualize dependencies. Using the API, Forge apps can automate plan creation, duplication, and administrative lifecycle management.

---

## Required Forge Scopes

To use these endpoints, your Forge app must have the following scopes in `manifest.yml`:

| Scope | Purpose |
| :--- | :--- |
| `read:jira-work` | View plan and team details. |
| `write:jira-work` | Create, duplicate, or archive plans. |

---

## Plan Operations

### Create Plan
Creates a new plan.

**Endpoint:** `POST /rest/api/3/plans/plan`

**Request Body Parameters:**

| Name | Type | Description |
| :--- | :--- | :--- |
| `name` | `string` | **Required.** The name of the new plan. |
| `description` | `string` | An optional description for the plan. |

**Request Body Example:**

```json
{
  "name": "Q3 Product Roadmap",
  "description": "Strategic roadmap for upcoming product features"
}
```

**Response Example (201 Created):**

```json
{
  "id": "plan-999",
  "name": "Q3 Product Roadmap",
  "self": "https://your-domain.atlassian.net/rest/api/3/plans/plan/plan-999"
}
```

---

### Get Plan Details
Retrieves the configuration and metadata of a specific plan.

**Endpoint:** `GET /rest/api/3/plans/plan/{planId}`

**Response Example (200 OK):**

```json
{
  "id": "plan-999",
  "name": "Q3 Product Roadmap",
  "description": "Strategic roadmap for upcoming product features",
  "teams": [
    {
      "id": "team-1",
      "name": "Engineering Team A"
    }
  ],
  "self": "https://your-domain.atlassian.net/rest/api/3/plans/plan/plan-999"
}
```

---

### Duplicate Plan
Creates a copy of an existing plan, preserving its structure and settings.

**Endpoint:** `POST /rest/api/3/plans/plan/{planId}/duplicate`

**Response Example (201 Created):**

```json
{
  "id": "plan-1000",
  "name": "Copy of Q3 Product Roadmap",
  "self": "https://your-domain.atlassian.net/rest/api/3/plans/plan/plan-1000"
}
```

---

### Archive Plan
Moves a plan to the archive.

**Endpoint:** `POST /rest/api/3/plans/plan/{planId}/archive`

**Response Example (204 No Content):**

*(No response body returned on success)*

---

## Team Management

Plans allow for complex team structures, including Atlassian-managed teams and plan-only teams.

### Plan Teams
Manage teams associated specifically with a plan.

**Endpoint:** `GET /rest/api/3/plans/plan/{planId}/team`
**Endpoint:** `POST /rest/api/3/plans/plan/{planId}/team`

These endpoints are used to assign members or define team boundaries within the context of a specific roadmap.