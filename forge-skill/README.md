# Atlassian Forge Skill Documentation

A comprehensive reference guide for working with Atlassian Forge applications.

## Overview

This documentation collection serves as a skill base for AI models (and developers) to understand and work with Atlassian Forge apps. Each document covers a specific aspect of the Forge platform.

## Quick Reference: Forge Module Types by Product

### Jira Modules
| Module Type | File |
|-------------|------|
| `jira:workflowValidator` | `forge-skill/jira-modules/workflow-validators.md` |
| `jira:workflowCondition` | `forge-skill/jira-modules/workflow-conditions.md` |
| `jira:workflowPostFunction` | `forge-skill/jira-modules/workflow-post-functions.md` |
| `jira:adminPage` | `forge-skill/jira-modules/admin-pages.md` |
| `jira:issueTrackerIssueCreated` | `forge-skill/jira-modules/triggers.md` |
| `jira:statusChanged` | `forge-skill/jira-modules/status-change.md` |

### Confluence Modules
| Module Type | File |
|-------------|------|
| `macro` | `forge-skill/confluence-modules/macro.md` |
| `confluence:fullPage` | `forge-skill/confluence-modules/full-page.md` |

### Bitbucket Modules
| Module Type | File |
|-------------|------|
| `bitbucket:mergeCheck` | `forge-skill/bitbucket-modules/merge-checks.md` |

### Jira Service Management
| Module Type | File |
|-------------|------|
| `jiraServiceManagement:*` | `forge-skill/jsm-modules/` |

## Documentation Structure

```
forge-skill/
├── README.md                      (this file - overview)
├── 01-getting-started.md          # Core concepts, manifest structure
├── 02-jira-modules.md             # Overview of all Jira module types
│   └── jira-modules/              # Detailed module documentation
│       ├── README.md
│       ├── workflow-validators.md
│       ├── workflow-conditions.md
│       └── workflow-post-functions.md
├── 06-events-payloads.md          # Event types and payload structures
│   └── events-payloads/           # Per-product event docs
│       ├── jira-events.md
│       ├── bitbucket-events.md
│       └── confluence-events.md
├── 07-api-endpoints.md            # API endpoint reference
├── 08-storage-kvs.md              # Storage and KVS usage
├── 09-resolver-context.md         # Resolver functions and context
├── 10-cli-commands.md             # Forge CLI commands
└── 11-permissions-scopes.md       # All scopes and permissions
```

## Quick Reference

### Module Types by Product

| Product | Module Type | Documentation |
|---------|-------------|---------------|
| Jira | workflow-validator | [jira-modules/workflow-validators.md](./jira-modules/workflow-validators.md) |
| Jira | workflow-condition | [jira-modules/workflow-conditions.md](./jira-modules/workflow-conditions.md) |
| Jira | workflow-post-function | [jira-modules/workflow-post-functions.md](./jira-modules/workflow-post-functions.md) |
| Jira | trigger events | [events-payloads/jira-events.md](./events-payloads/jira-events.md) |

### Events by Product

| Product | Event Type | Documentation |
|---------|------------|---------------|
| Jira | Issue, comment, workflow events | [events-payloads/jira-events.md](./events-payloads/jira-events.md) |
| Bitbucket | PR, repository, merge check events | [events-payloads/bitbucket-events.md](./events-payloads/bitbucket-events.md) |
| Confluence | Page, space, macro events | [events-payloads/confluence-events.md](./events-payloads/confluence-events.md) |

### Key Concepts

| Concept | Documentation |
|---------|---------------|
| Getting Started | [01-getting-started.md](./01-getting-started.md) |
| Permissions & Scopes | [11-permissions-scopes.md](./11-permissions-scopes.md) |
| API Endpoints (Overview) | [07-api-endpoints.md](./07-api-endpoints.md) |
| Storage (KVS) | [08-storage-kvs.md](./08-storage-kvs.md) |
| CLI Commands | [10-cli-commands.md](./10-cli-commands.md) |

#### API Endpoints by Product

| Product | Documentation |
|---------|---------------|
| Forge Runtime APIs | [api-endpoints/forge-runtime-apis.md](./api-endpoints/forge-runtime-apis.md) |
| Jira REST API v3 (recommended) | [api-endpoints/jira-rest-api.md](./api-endpoints/jira-rest-api.md) |
| Jira REST API v2 (legacy) | [api-endpoints/jira-rest-api-v2.md](./api-endpoints/jira-rest-api-v2.md) |
| Bitbucket REST API | [api-endpoints/bitbucket-rest-api.md](./api/endpoints/bitbucket-rest-api.md) |
| Confluence REST API v3 (recommended) | [api-endpoints/confluence-rest-api.md](./api-endpoints/confluence-rest-api.md) |
| Confluence REST API v2 (legacy) | [api-endpoints/confluence-rest-api-v2.md](./api/endpoints/confluence-rest-api-v2.md) |

## Snippets & Code Examples

This documentation includes code snippets for common patterns:

| Category | File |
|----------|------|
| Scheduled Triggers | `snippets/scheduled-triggers.md` |
| Automation Actions | `snippets/automation-actions.md` |
| Dashboard Widgets | `snippets/dashboard-widgets.md` |
| Bitbucket Merge Checks | `snippets/bitbucket-merge-checks.md` |
| Jira Event Filters | `events-payloads/jira-event-filters.md` |
| Confluence Content Properties | `snippets/confluence-content-properties.md` |

## Complete File Structure

```
forge-skill/
├── README.md                      (this file - overview)
├── 01-getting-started.md          # Core concepts, manifest structure
├── 02-jira-modules.md             # Overview of all Jira module types
├── 06-events-payloads.md          # Event types and payload structures
├── 07-api-endpoints.md            # API endpoint reference
├── 08-storage-kvs.md              # Storage and KVS usage
├── 09-resolver-context.md         # Resolver functions and context
├── 10-cli-commands.md             # Forge CLI commands
├── 11-permissions-scopes.md       # All scopes and permissions
├── jira-rest-api.md               # Jira REST API reference
│
├── jira-modules/
│   ├── README.md
│   ├── workflow-validators.md
│   ├── workflow-conditions.md
│   └── workflow-post-functions.md
│
├── events-payloads/
│   ├── jira-events.md
│   ├── bitbucket-events.md
│   └── confluence-events.md
│
├── confluence-modules/
│   ├── README.md
│   ├── macro.md
│   └── full-page.md
│
├── bitbucket-modules/
│   ├── README.md
│   └── merge-checks.md
│
└── jsm-modules/
    └── README.md
│
├── snippets/                      # Code examples and patterns
│   ├── README.md                  # Overview of all snippets
│   ├── scheduled-triggers.md      # Scheduled trigger examples
│   ├── automation-actions.md      # Automation action examples
│   ├── dashboard-widgets.md       # Dashboard widget examples
│   ├── bitbucket-merge-checks.md  # Merge check configuration
│   └── confluence-content-properties.md  # Content property handling
│
├── api-endpoints/                 # API endpoint documentation
│   ├── README.md                  # Overview of all endpoints
│   ├── forge-runtime-apis.md      # Forge platform APIs
│   ├── bitbucket-rest-api.md      # Bitbucket REST API reference
│   ├── confluence-rest-api.md     # Confluence REST API reference
│   ├── jira-rest-api-v2.md        # Jira REST API v2 endpoints (legacy)
│   └── confluence-rest-api-v2.md  # Confluence REST API v2 endpoints (legacy)

## Core Concepts

### Modules
Modules are the building blocks of Forge apps, declared in `manifest.yml`. Each module type corresponds to a specific functionality:
- **Workflow validators/conditions**: Jira workflow integration
- **Macros**: Confluence content insertion
- **Merge checks**: Bitbucket PR validation
- **Admin pages**: App configuration UIs

### Functions
Functions contain the business logic executed when modules are triggered. They're defined in `manifest.yml` and implemented in JavaScript/Node.js.

### Resources
Static assets (HTML, CSS, JS, JSX) that provide Custom UI for module configuration and display.

### Context
Every function receives a `context` object with:
- User information (`accountId`, `principal`)
- Workspace information (`workspaceId`, `cloudId`)
- App installation details
- Module-specific context (e.g., issue data)

## Getting Started

1. Read `01-getting-started.md` for core concepts
2. Check the module type you need in the appropriate section
3. Review API endpoints and patterns
4. Understand permissions/scopes requirements

## Searching Documentation

Use git grep or search across files:
```bash
grep -r "workflowValidator" forge-skill/
```

## New in This Update

This update includes comprehensive documentation additions:

### API Endpoints Documentation
- **Jira REST API v2** - Comprehensive reference for legacy v2 endpoints with authentication, issue operations, workflow transitions, search/JQL examples, and error handling
- **Confluence REST API v2** - Reference for Confluence content, space, comment, attachment operations

### Code Snippets Collection
- **Scheduled Triggers** - Full implementation patterns for `fiveMinute`, `hour`, `day`, and `week` intervals with common use cases (syncing, cleanup, reporting)
- **Automation Actions** - Custom actions for Jira automation rules including CRM sync, email notifications, custom field updates
- **Dashboard Widgets** - Custom widget examples using EAP dashboard-background-script module
- **Bitbucket Merge Checks** - Validate pull requests with test coverage, branch naming, size limit checks

### Event Filtering Documentation
- **Jira Event Filters** - Complete guide to Jira expressions for filtering events by project, status, priority, labels, assignee, and custom fields

### Confluence Content Properties
- Full CRUD operations for content properties including JSON storage, issue-page linking, metadata management, form data handling

---

*Last updated: March 2026*

## Related Resources
- [Forge Developer Docs](https://developer.atlassian.com/cloud/forge/)
- [Forge Examples Repository](https://github.com/atlassian-labs/forge-examples)
