# Jira API Documentation

Welcome to the detailed technical documentation for the Atlassian Jira Cloud API, specifically tailored for development with Atlassian Forge.

This documentation provides schema-backed endpoint references, request/response examples, and implementation guidance for building powerful Jira integrations.

## Navigation

Explore the API by functional module:

- [**Core Issue Operations**](./issues.md): CRUD, transitions, bulk operations, worklogs, attachments, and links.
- [**Workflow Management**](./workflows.md): Workflows, schemes, and lifecycle management.
- [**Project Management**](./projects.md): Projects, components, versions, and project configuration.
- [**Users & Groups**](./users.md): User management.
- [**User Selection & Search**](./user_selection_and_search.md): User discovery and pickers.
- [**Groups**](./groups.md): Group management and membership.
- [**Configuration & Administration**](./configuration.md): Fields, issue types, screens, and administrative settings.
- [**Field Configuration**](./field_configuration.md): Advanced field and screen management.
- [**Field and Screen Management**](./field_and_screen_management.md): Advanced context, options, and layout control.
- [**Permissions & Access Control**](./permissions.md): Permission schemes and access management.
- [**Plans (Advanced Roadmaps)**](./plans.md): Roadmap and plan management.
- [**Project Assets**](./project_assets.md): Components and versions.
- [**Issue Metadata Configuration**](./issue_metadata_configuration.md): Priorities and resolutions.
- [**Issue Properties**](./issue_properties.md): Application-level metadata.
- [**Issue Engagement**](./issue_engagement.md): Votes and watchers.
- [**Issue Comments**](./issue_comments.md): Managing issue comments and comment metadata.
- [**Issue Attachments**](./issue_attachments.md): Managing file attachments.
- [**Issue Remote Links**](./issue_remotelinks.md): Managing external web links.
- [**Issue Worklogs**](./issue_worklogs.md): Time tracking and worklog management.
- [**Issue Changelog**](./issue_changelog.md): Tracking issue history and field changes.
- [**Bulk Issue Operations**](./issue_bulk_operations.md): Managing multiple issues simultaneously.
- [**System Administration**](./system_administration.md): Global settings, license, and instance info.
- [**Audit & History**](./audit_and_history.md): Audit logs and workflow history.
- [**Search & JQL**](./search_and_jql.md): JQL and issue searching.
- [**Filters**](./filters.md): Managing saved JQL searches.
- [**Dashboards**](./dashboards.md): Visual dashboards and gadgets.
- [**Webhooks**](./webhooks.md): Event-driven notifications and real-time updates.

---

## Quick Reference: Forge API Usage

When interacting with these endpoints from a Forge app, always use the `@forge/api` package.

### Using `api.asApp()`
Recommended for background tasks or when the app needs to perform actions regardless of the user's specific permissions (requires `manage:jira-configuration` or similar admin scopes).

```javascript
import api, { route } from '@forge/api';

const response = await api.asApp().requestJira(route`/rest/api/3/issue/${issueKey}`);
const issue = await response.json();
```

### Using `api.asUser()`
Recommended for UI-driven actions where the operation should be constrained by the currently logged-in user's permissions.

```javascript
import api, { route } from '@forge/api';

const response = await api.asUser().requestJira(route`/rest/api/3/issue/${issueKey}`);
const issue = await response.json();
```

## Troubleshooting

If you encounter issues:
1. **Check Scopes**: Ensure your `manifest.yml` includes the necessary permissions (e.g., `read:jira-work`, `write:jira-work`).
2. **Verify Authentication**: Ensure you are using the correct `api` method (`asApp` vs `asUser`).
3. **Check API Version**: These docs refer to the `/rest/api/3/` version of the Jira API.