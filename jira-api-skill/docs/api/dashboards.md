# Dashboards

This module covers API endpoints for managing and interacting with Jira dashboards and their constituent gadgets.

## Overview

Dashboards in Jira provide a visual way to present key information through gadgets. This module allows developers to programmatically create, retrieve, update, and manage dashboards, as well as the gadgets that reside on them.

---

## Required Forge Scopes

To use these endpoints, your Forge app must have the following scopes in `manifest.yml`:

| Scope | Purpose |
| :--- | :--- |
| `read:jira-work` | View dashboard and gadget data. |
| `write:jira-work` | Create, update, or delete dashboards and gadgets. |

---

## Dashboard Management

### Dashboard CRUD Operations

Create, retrieve, or delete dashboards.

**Endpoints:**
- `GET /rest/api/3/dashboard/search` - Search for dashboards.
- `GET /rest/api/3/dashboard/{id}` - Retrieve a specific dashboard.
- `POST /rest/api/3/dashboard` - Create a new dashboard.
- `PUT /rest/api/3/dashboard/{id}` - Update dashboard details.
- `DELETE /rest/api/3/dashboard/{id}` - Delete a dashboard.
- `POST /rest/api/3/dashboard/{id}/copy` - Duplicate an existing dashboard.

**Create Dashboard Example (POST):**

```json
{
  "name": "My Custom Forge Dashboard",
  "description": "A dashboard managed by my Forge App"
}
```

---

## Gadget Management

### Gadget Operations

Manage the gadgets attached to a specific dashboard.

**Endpoints:**
- `GET /rest/api/3/dashboard/{dashboardId}/gadget` - List gadgets on a dashboard.
- `POST /rest/api/3/dashboard/{dashboardId}/gadget` - Add a gadget to a dashboard.
- `DELETE /rest/api/3/dashboard/{dashboardId}/gadget/{gadgetId}` - Remove a gadget.

**Add Gadget Example (POST):**

```json
{
  "type": "filter",
  "xloc": 0,
  "yloc": 0,
  "width": 1,
  "height": 1,
  "properties": {
    "filterId": "10001"
  }
}
```

---

## Error Responses

| Status | Description |
| :--- | :--- |
| `400` | Invalid gadget configuration or dashboard ID. |
| `401` | Authentication credentials incorrect or missing. |
| `403` | Insufficient permissions to modify the dashboard. |
| `404` | Dashboard or Gadget not found. |