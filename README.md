# LeanZero Forge Skills

A **skill** for [Cline](https://github.com/cline) is a collection of documentation, guides, and reference materials that provide specialized knowledge to help Cline (and human developers) work more effectively on specific types of projects. Skills are activated automatically when working in relevant directories or when the context suggests they should be used.

## Available Skills

This repository contains **two comprehensive skills** for building Atlassian Forge apps:

### 1. Atlassian Jira Forge Skill
A complete documentation suite for building Forge apps that extend Jira, including workflow validators, conditions, post-functions, and integrations with Jira REST APIs.

- **Location**: `.cline/skills/atlassian-jira-forge-skill/`
- **Use when**: Creating workflow validators, conditions, post-functions, custom UIs for workflow rules, or integrating with Jira REST APIs from a Forge app

### 2. Atlassian Confluence Forge Skill
A complete documentation suite for building Forge apps that extend Confluence Cloud, including page extensions, blog post extensions, space settings panels, dashboard gadgets, and integrations with Confluence REST API v2.

- **Location**: `.cline/skills/atlassian-confluence-forge-skill/`
- **Use when**: Building custom UIs for pages/blog posts, creating space configuration panels, handling Confluence webhooks, or integrating with Confluence REST API from a Forge app

---

## What is a Skill?

### Purpose

Skills provide:
- **Context-aware guidance**: When Cline detects Forge development work (e.g., working with `manifest.yml`), it activates the relevant skill to provide relevant documentation
- **Module-specific references**: Complete documentation for all module types
- **API endpoint documentation**: Comprehensive reference for Jira REST API (v3) and Confluence REST API (v2)
- **Best practices**: Proven patterns for Forge app development including resolver patterns, bridge API usage, and UI development

### How Skills Work in Cline

1. **Automatic Activation**: Skills are activated based on file context (e.g., working with `manifest.yml` triggers the relevant skill)
2. **Context Integration**: The skill's documentation is integrated into the AI's knowledge base for the current session
3. **Persistent Access**: Once activated, the skill remains active for related tasks in that session
4. **Skill Definition**: Skills are defined in a `SKILL.md` file with metadata (name, description) that Cline uses to identify when to activate

---

## Installation

To install both skills on your system:

```bash
# Create the skills directory if it doesn't exist
mkdir -p ~/.cline/skills

# Copy both skills into place
cp -r atlassian-jira-forge-skill ~/.cline/skills/
cp -r atlassian-confluence-forge-skill ~/.cline/skills/

# Or copy all skills at once (from the repo root)
cp -r .cline/skills/* ~/.cline/skills/
```

Cline automatically detects skills in `~/.cline/skills/` and activates them when appropriate based on file context.

---

## Atlassian Jira Forge Skill

### Quick Start

```yaml
# manifest.yml - Basic Forge app for Jira
modules:
  jira:workflowValidator:
    - key: my-validator
      name: My Validator
      description: Validates issue fields
      function: validateFields
      
  scheduledTrigger:
    - key: daily-task
      cron: "0 0 * * *"
      function: runDailyTask
      
  resource:
    - key: config-ui
      path: src/config-ui.jsx
```

### Documentation Index

| File | Description |
|------|-------------|
| `SKILL.md` | Main entry point with trigger description for Cline |
| `docs/01-core-concepts.md` | Core Forge concepts, manifest structure |
| `docs/02-workflow-validators.md` | Complete validator documentation with examples |
| `docs/03-workflow-conditions.md` | Complete condition documentation |
| `docs/04-workflow-post-functions.md` | Complete post-function documentation |
| `docs/05-events-payloads.md` | Event structures and payloads reference |
| `docs/06-api-endpoints-enhanced.md` | Enhanced Jira REST API v3 reference |
| `docs/07-permissions-scopes.md` | Permissions and scopes reference |
| `docs/08-cli-commands.md` | Forge CLI commands reference |
| `docs/09-scheduled-triggers.md` | Scheduled trigger modules |
| `docs/10-automation-actions.md` | Jira automation action modules |
| `docs/11-event-filters.md` | Event filters with Jira expressions |
| `docs/12-dashboard-widgets.md` | Dashboard widget modules |
| `docs/13-merge-checks.md` | Bitbucket merge check modules |
| `docs/15-bridge-api-reference.md` | Bridge API for frontend-backend communication |
| `docs/16-resolver-patterns.md` | Resolver pattern implementation guide |
| `docs/17-ui-kit-components.md` | UI Kit components reference |
| `docs/18-custom-ui-advanced.md` | Advanced Custom UI development guide |

### Structure

```
.cline/skills/atlassian-jira-forge-skill/
├── SKILL.md                           # Skill metadata and main documentation
├── docs/                              # Documentation files (01-24)
│   ├── 01-core-concepts.md           # Core Forge concepts, manifest structure
│   ├── 02-workflow-validators.md     # Workflow validator documentation
│   ├── 03-workflow-conditions.md     # Workflow condition documentation
│   ├── 04-workflow-post-functions.md # Workflow post function documentation
│   ├── 05-events-payloads.md         # Event structures and payloads reference
│   ├── 06-api-endpoints-enhanced.md  # Enhanced Jira REST API reference
│   ├── 07-permissions-scopes.md      # Permissions and scopes reference
│   ├── 08-cli-commands.md            # CLI commands reference
│   ├── 09-scheduled-triggers.md      # Scheduled trigger modules
│   ├── 10-automation-actions.md      # Jira automation action modules
│   ├── 11-event-filters.md           # Event filters with Jira expressions
│   ├── 12-dashboard-widgets.md       # Dashboard widget modules
│   ├── 13-merge-checks.md            # Bitbucket merge check modules
│   ├── 14-content-properties.md      # Confluence content property modules
│   ├── 15-bridge-api-reference.md    # Bridge API for frontend-backend communication
│   ├── 16-resolver-patterns.md       # Resolver pattern implementation guide
│   ├── 17-ui-kit-components.md       # UI Kit components reference
│   ├── 18-custom-ui-advanced.md      # Advanced Custom UI development guide
│   ├── 20-performance-optimization.md
│   ├── 21-complete-custom-ui-guide.md
│   ├── 22-jira-service-management.md
│   ├── 23-real-world-patterns.md     # Real-world patterns with code examples
│   └── 24-advanced-topics.md         # Advanced topics and best practices
├── api-endpoints/                     # External API reference files (not included)
├── events-payloads/                   # External event payload files (not included)
└── templates/                         # YAML manifest templates
    ├── condition.yml                  # Workflow condition template
    ├── post-function.yml              # Workflow post function template
    ├── trigger-with-filter.yml        # Trigger with filter template
    ├── ui-modifications.yml           # UI modifications template
    ├── scheduled-trigger.yml          # Scheduled trigger template
    ├── dashboard-gadget.yml           # Dashboard gadget template
    ├── validator.yml                  # Validator template
    └── bitbucket-merge-check.yml      # Bitbucket merge check template
```

### Module Types

| Module Type | Documentation |
|-------------|---------------|
| `jira:workflowValidator` | [Workflow Validators](./docs/02-workflow-validators.md) |
| `jira:workflowCondition` | [Workflow Conditions](./docs/03-workflow-conditions.md) |
| `jira:workflowPostFunction` | [Workflow Post Functions](./docs/04-workflow-post-functions.md) |
| `scheduledTrigger` | [Scheduled Triggers](./docs/09-scheduled-triggers.md) |
| `action` | [Automation Actions](./docs/10-automation-actions.md) |

### Jira REST API (Comprehensive)

The skill includes extensive documentation for Jira Cloud REST API v3 endpoints:

#### Issue Operations
- Create, read, update, delete issues
- Bulk operations (create, update, delete, move, transition multiple issues)
- Search with JQL, autocomplete, parsing
- Get issue metadata and schema information

#### Worklog Operations
- Record time tracking data
- Update and delete worklogs
- Query worklogs for issues

#### Project Operations
- List, create, update, delete projects
- Access project templates and configurations
- Manage project permissions

#### Workflow Operations
- Get transitions available for issues
- Execute workflow transitions
- Search and manage workflows

#### Field Operations
- List all fields in Jira
- Get field options for select fields
- Understand field schemas and validation rules

#### User & Group Operations
- Get current authenticated user
- Search users and retrieve multiple users
- Access group information for users

#### Dashboard & Filter Operations
- Search dashboards and filters
- Create and manage custom filters
- Retrieve dashboard configurations

#### Attachment & Audit Operations
- Upload attachments to issues
- Manage audit logs for system activity

---

## Atlassian Confluence Forge Skill

### Quick Start

```yaml
# manifest.yml - Basic Forge app for Confluence
modules:
  confluence:pageCustomUi:
    - key: my-page-extension
      resource: main
      icon: icon.png
      title: My Extension Title
      
  webhook:
    - destination: page-webhook
      event: confluence:page:created
      
  scheduledTrigger:
    - key: daily-sync
      cron: "0 2 * * *"
      function: runDailySync
      
  resource:
    - key: main
      path: src/page-custom-ui.jsx
```

### Documentation Index

| File | Description |
|------|-------------|
| `SKILL.md` | Main entry point with trigger description for Cline |
| `docs/01-core-concepts.md` | Core Forge concepts, manifest structure |
| `docs/02-page-custom-ui.md` | Page extensions implementation guide |
| `docs/03-space-settings.md` | Space configuration panels |
| `docs/04-blogpost-custom-ui.md` | Blog post extensions guide |
| `docs/05-dashboard-widgets.md` | Dashboard gadgets/widgets implementation |
| `docs/06-content-properties.md` | Content properties storage patterns |
| `docs/07-webhooks-events.md` | Webhook events (page created/updated/deleted) |
| `docs/08-api-endpoints.md` | Confluence REST API v2 reference |
| `docs/problem-patterns.md` | Common implementation patterns with code examples |
| `docs/when-to-use-which.md` | Decision tree for module selection |

### Structure

```
.cline/skills/atlassian-confluence-forge-skill/
├── SKILL.md                           # Skill metadata and main documentation
├── docs/                              # Documentation files
│   ├── 01-core-concepts.md           # Core Forge concepts, manifest structure
│   ├── 02-page-custom-ui.md          # Page extensions implementation guide
│   ├── 03-space-settings.md          # Space configuration panels
│   ├── 04-blogpost-custom-ui.md      # Blog post extensions guide
│   ├── 05-dashboard-widgets.md       # Dashboard gadgets/widgets implementation
│   ├── 06-content-properties.md      # Content properties storage patterns
│   ├── 07-webhooks-events.md         # Webhook events and payloads
│   └── 08-api-endpoints.md           # Confluence REST API v2 reference
├── templates/                         # YAML manifest templates
│   ├── content-property-storage.yml  # Content property CRUD operations
│   ├── dashboard-gadget.yml          # Dashboard widget template
│   ├── page-custom-ui.yml            # Page extension configuration
│   ├── scheduled-trigger.yml         # Scheduled background tasks
│   ├── space-settings.yml            # Space settings panel configuration
│   └── webhook-handler.yml           # Webhook event handler template
└── when-to-use-which.md              # Decision tree for module selection
```

### Module Types

| Module Type | Documentation |
|-------------|---------------|
| `confluence:pageCustomUi` | [Page Extensions](./docs/02-page-custom-ui.md) |
| `confluence:spaceSettings` | [Space Settings Panels](./docs/03-space-settings.md) |
| `confluence:blogPostCustomUi` | [Blog Post Extensions](./docs/04-blogpost-custom-ui.md) |
| `dashboardGadget` | [Dashboard Gadgets](./docs/05-dashboard-widgets.md) |

### Confluence REST API v2

The skill includes comprehensive documentation for Confluence Cloud REST API v2:

#### Page Operations
- Get, create, update, delete pages
- Content properties storage
- Attachments management
- Comments handling

#### Blog Post Operations
- Get, create, update blog posts
- Content properties for blog posts

#### Space Operations
- List and get spaces
- Space properties management

#### Webhook Events
- `confluence:page:created` - Page creation events
- `confluence:page:updated` - Page update events
- `confluence:page:deleted` - Page deletion events

---

## Comparison: Jira vs Confluence Forge

| Feature | Jira Forge | Confluence Forge |
|---------|------------|------------------|
| **Primary Use Case** | Workflow automation, issue management | Content extensions, knowledge base apps |
| **Custom UI Locations** | Workflow rules (validators, conditions) | Pages, Blog Posts, Space Settings |
| **Storage Pattern** | Issue properties | Content Properties (per content type) |
| **Event System** | Workflow transitions | Page/blogpost created/updated/deleted |
| **API Version** | REST API v3 | REST API v2 |
| **Common Patterns** | Validators, conditions, post-functions | Page extensions, space settings panels |

---

## When to Use Which Skill

### Jira Forge Skill
Use this skill when:
- Creating **workflow validators** - validate issue fields before transition completes
- Creating **workflow conditions** - control visibility of transitions
- Creating **workflow post-functions** - execute logic after transition
- Building custom UIs for workflow rule configuration
- Making Jira REST API calls from a Forge app
- Setting up scheduled triggers for recurring tasks
- Creating automation actions in Jira rules
- Developing dashboard widgets

### Confluence Forge Skill
Use this skill when:
- Adding custom UI to **Confluence pages** (page extensions)
- Building **space configuration panels** (admin-level settings)
- Creating **blog post extensions**
- Developing **dashboard gadgets**
- Handling Confluence **webhooks** (page created/updated/deleted)
- Using Confluence REST API v2 from a Forge app
- Storing app data with content using Content Properties

---

## Quick Reference

### Jira Tasks
| Task | Module Type / API |
|------|-------------------|
| Validate fields before transition | `jira:workflowValidator` |
| Control transition visibility | `jira:workflowCondition` |
| Execute logic after transition | `jira:workflowPostFunction` |
| Schedule recurring tasks | `scheduledTrigger` |
| Create automation actions | `action` |
| Jira REST API calls | `/rest/api/3/*` |

### Confluence Tasks
| Task | Module Type / API |
|------|-------------------|
| Add UI to pages | `confluence:pageCustomUi` |
| Space configuration | `confluence:spaceSettings` |
| Blog post extensions | `confluence:blogPostCustomUi` |
| Dashboard gadgets | `dashboardGadget` |
| Webhook handlers | `webhook` |
| Confluence REST API | `/wiki/api/v2/*` |

---

## Forge Runtime APIs

The skills document these critical Forge runtime libraries:

| Library | Purpose |
|---------|---------|
| `@forge/api` | Jira/Confluence REST access, context management |
| `@forge/resolver` | Frontend-to-backend communication (Resolver pattern) |
| `@forge/jira-bridge` | UI modifications and workflow configuration |
| `@forge/kvs` | Key-value storage for persistence |
| `@forge/bridge` | Frontend navigation and context access |

---

## Best Practices

### Forge App Development
1. Use `api.asApp()` for workflow context calls (no user session)
2. Use `api.asUser()` to preserve current user permissions
3. Batch operations whenever possible
4. Handle rate limits (typically 5 requests/second)
5. Paginate results using `startAt` and `maxResults`

### Custom UI Development
1. Keep UI lightweight and responsive
2. Use the Bridge API for secure backend communication
3. Handle errors gracefully in components
4. Test across different screen sizes

---

## Troubleshooting

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| "Function not found" | Function key mismatch in manifest.yml | Check function references match |
| "Permission denied" | Missing scopes in manifest.yml | Add required scope to permissions.scopes |
| "Expression evaluation failed" | Invalid Jira expression syntax | Test expressions in workflow editor |

### Debugging Commands

```bash
forge logs -n 50    # View last 50 log entries
forge tunnel        # Local testing with live environment
forge lint          # Check manifest/code for issues
```

---

## Additional Resources

The skill references external documentation in the following directories (not included):

- `api-endpoints/` - Comprehensive API reference files (Jira, Confluence, Bitbucket)
- `events-payloads/` - Detailed event payload structures

## Related Documentation

For more information about Cline skills:
- [Cline GitHub Repository](https://github.com/cline)
- [Cline Skills Documentation](https://github.com/cline/tree/main/skills)

---

## License

Copyright © 2026 LeanZero SRL. All rights reserved.