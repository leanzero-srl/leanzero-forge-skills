# Jira API Endpoints Reference

This document serves as a high-level index for all Atlassian Jira Cloud API endpoints available via Forge. For detailed technical specifications, including request/response schemas and code examples, please refer to the specific module in the [API Documentation](./api/index.md) directory.

## API Modules

### [Core Issue Operations](./api/issues.md)
Covers CRUD operations for issues, comments, attachments, transitions, worklogs, and issue properties.

### [Workflow Management](./api/workflows.md)
Covers workflow definitions, workflow schemes, and managing transitions.

### [Project Management](./api/projects.md)
Covers project lifecycle, components, versions, categorization, and project-level roles/properties.

### [Users, Groups & Permissions](./api/users.md)
Covers user management, group memberships, and permission/security schemes.

### [Configuration & Administration](./api/configuration.md)
Covers Jira configuration elements such as fields, issue types, screens, and various schemes (priority, status, resolution).

### [Search & JQL](./api/search_and_jql.md)
Covers JQL (Jira Query Language), issue searching, filters, and dashboard management.

---

## Getting Started with Forge API

When using these endpoints within a Forge app, always use the `@forge/api` package and the `api.asApp().requestJira()` method to handle authentication and routing.

```javascript
import api, { route } from '@forge/api';

// Example: Fetching an issue
const response = await api.asApp().requestJira(route`/rest/api/3/issue/${issueKey}`);
const issue = await response.json();
```

## Common Error Codes

| Status Code | Meaning | Description |
| :--- | :--- | :--- |
| `400` | Bad Request | The request was invalid (e.g., malformed JQL or missing required fields). |
| `401` | Unauthorized | Authentication failed or token is invalid. |
| `403` | Forbidden | The authenticated user/app does not have sufficient permissions. |
| `404` | Not Found | The specified resource (issue, project, user) could not be found. |
| `500` | Internal Server Error | An error occurred on the Jira server side. |