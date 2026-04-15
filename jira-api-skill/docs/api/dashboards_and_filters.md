# Dashboards and Filters Operations

This module covers API endpoints for managing Jira Filters and Dashboards, enabling developers to automate the creation of saved searches and the organization of data through visual dashboards.

## Overview

Filters allow users to save JQL queries for easy access and sharing. Dashboards provide a way to visualize data using gadgets. Both are powerful tools for providing structured views of Jira information within Forge applications.

---

## Filter Operations

### Create a Filter

Creates a new saved filter based on a JQL query.

**Endpoint:** `POST /rest/api/3/filter`

**Query Parameters:**

| Name | Type | Description | Default |
| :--- | :--- | :--- | :--- |
| `expand` | `string` | Include additional information (e.g., `sharedUsers`, `subscriptions`). | - |
| `overrideSharePermissions` | `boolean` | (Experimental) Allows overriding share permissions. Requires *Administer Jira* permission. | `false` |

**Request Body Parameters:**

| Name | Type | Description |
| :--- | :--- | :--- |
| `name` | `string` | The name of the filter. |
| `description` | `string` | A description of what the filter does. |
| `jql` | `string` | The JQL query string. |

**Request Body Example:**

```json
{
  "name": "High Priority Bugs",
  "description": "Filters all bugs with priority High or Above",
  "jql": "issuetype = Bug AND priority IN (High, Highest)"
}
```

**Response Example (200 OK):**

```json
{
  "id": "10000",
  "name": "High Priority Bugs",
  "description": "Filters all bugs with priority High or Above",
  "jql": "issuetype = Bug AND priority IN (High, Highest)",
  "owner": {
    "accountId": "5b10a2844c20165700ede21g",
    "displayName": "Mia Krystof"
  },
  "self": "https://your-domain.atlassian.net/rest/api/3/filter/10000"
}
```

**Error Responses:**

| Status | Description |
| :--- | :--- |
| `400` | Invalid request object (e.g., non-unique name). |
| `401` | Authentication credentials are incorrect or missing. |

---

## Dashboard Operations

### Get Dashboards (Search)

Searches for dashboards based on criteria.

**Endpoint:** `GET /rest/api/3/dashboard/search`

*(Note: Detailed implementation of dashboard searching and gadget management can be expanded here.)*

### Create a Dashboard

Creates a new dashboard.

**Endpoint:** `POST /rest/api/3/dashboard`

**Request Body Example:**

```json
{
  "name": "Engineering Team Dashboard",
  "description": "Overview of current engineering sprint progress"
}
```

---

## Permissions & Scopes

### Required Permissions

* **Filters**: Permission to access Jira.
* **Dashboards**: Permission to access Jira.

### Forge Scopes

For managing filters and dashboards, ensure your `manifest.yml` includes the relevant scopes.

**Recommended Scopes:**
* `write:filter:jira`
* `read:filter:jira`
* `write:jira-work` (general permission)