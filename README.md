# Atlassian Jira Forge Skill

A comprehensive documentation skill for building Atlassian Forge apps that extend Jira, Confluence, Bitbucket, and Jira Service Management.

## Quick Start

### Installation

1. **Copy the skill to your project:**
   ```bash
   # Copy from this project to your other project
   mkdir -p ~/.cline/skills
   cp -r atlassian-jira-forge-skill ~/.cline/skills/
   ```

2. **Start using it:** The skill will activate automatically when working on Forge app development.

## What's Included

### Core Documentation
| File | Description |
|------|-------------|
| `SKILL.md` | Main instructions and quick reference guide |
| `docs/01-core-concepts.md` | Core Forge concepts, manifest structure, context object |

### Jira Workflow Modules
| File | Description |
|------|-------------|
| `docs/02-workflow-validators.md` | Complete workflow validator documentation with examples |
| `docs/03-workflow-conditions.md` | Complete workflow condition documentation |
| `docs/04-workflow-post-functions.md` | Complete workflow post function documentation |

### Events & Payloads
| File | Description |
|------|-------------|
| `docs/05-events-payloads.md` | Event structures and payloads reference |
| `events-payloads/jira-events.md` | Jira issue, comment, workflow events (external) |
| `events-payloads/bitbucket-events.md` | Bitbucket repository, PR events (external) |
| `events-payloads/confluence-events.md` | Confluence page, space events (external) |

### API Endpoints
| File | Description |
|------|-------------|
| `docs/06-api-endpoints-enhanced.md` | **Enhanced** Jira REST API reference with comprehensive endpoints |
| `api-endpoints/jira-rest-api.md` | Comprehensive Jira Cloud REST API v3 reference (external) |
| `api-endpoints/bitbucket-rest-api.md` | Bitbucket Cloud REST API v2.0 reference (external) |
| `api-endpoints/confluence-rest-api.md` | Confluence Cloud REST API v2 reference (external) |

### Permissions & CLI
| File | Description |
|------|-------------|
| `docs/07-permissions-scopes.md` | Permissions and scopes reference |
| `docs/08-cli-commands.md` | CLI commands reference |

### Advanced Features
| File | Description |
|------|-------------|
| `docs/09-scheduled-triggers.md` | Scheduled trigger modules for recurring tasks |
| `docs/10-automation-actions.md` | Jira automation action modules |
| `docs/11-event-filters.md` | Event filters with Jira expressions |
| `docs/12-dashboard-widgets.md` | Dashboard widget modules |
| `docs/13-merge-checks.md` | Bitbucket merge check modules |
| `docs/14-content-properties.md` | Confluence content property modules |

### Custom UI Development
| File | Description |
|------|-------------|
| `docs/15-bridge-api-reference.md` | Bridge API for frontend-backend communication |
| `docs/16-resolver-patterns.md` | Resolver pattern implementation guide |
| `docs/17-ui-kit-components.md` | UI Kit components reference |
| `docs/18-custom-ui-advanced.md` | Advanced Custom UI development guide |

### Module-Specific Documentation
| File | Description |
|------|-------------|
| `docs/02-ui-modifications.md` | UI modification modules and patterns |

## When to Use This Skill

Use this skill when working on:
- Creating **workflow validators** - validate issue fields before transition completes
- Creating **workflow conditions** - control visibility of transitions
- Creating **workflow post-functions** - execute logic after transition
- Building custom UIs for workflow rule configuration
- Making Jira REST API calls from a Forge app
- Setting up scheduled triggers for recurring tasks
- Creating automation actions in Jira rules
- Developing dashboard widgets
- Implementing Bitbucket merge checks

## Complete Module Types Reference

### Jira Modules
| Module Type | Documentation |
|-------------|---------------|
| `jira:workflowValidator` | [Workflow Validators](./docs/02-workflow-validators.md) |
| `jira:workflowCondition` | [Workflow Conditions](./docs/03-workflow-conditions.md) |
| `jira:workflowPostFunction` | [Workflow Post Functions](./docs/04-workflow-post-functions.md) |
| `scheduledTrigger` | [Scheduled Triggers](./docs/09-scheduled-triggers.md) |
| `action` | [Automation Actions](./docs/10-automation-actions.md) |

### Confluence Modules
| Module Type | Documentation |
|-------------|---------------|
| `confluence:macro` | Macro Module (external) |
| `confluence:fullPage` | Full Page Module (external) |

### Bitbucket Modules
| Module Type | Documentation |
|-------------|---------------|
| `bitbucket:mergeCheck` | [Merge Check Module](./docs/13-merge-checks.md) |

## API Reference Summary

### Jira REST API (Comprehensive)
The skill includes extensive documentation for Jira Cloud REST API v3 endpoints:
- **Issue Operations**: Create, read, update, delete, search with JQL
- **Bulk Operations**: Bulk create, update, delete, move, transition issues
- **Worklog Operations**: Record and manage time tracking data
- **Project Operations**: Manage projects, templates, configurations
- **Workflow Operations**: Get transitions, execute workflows
- **Field Operations**: Manage fields, options, schemas
- **User & Group Operations**: Manage users, groups, permissions
- **Search & Filter Operations**: JQL parsing, autocomplete, filters
- **Dashboard Operations**: Dashboard management
- **Attachment Operations**: File uploads and management
- **Audit Log Operations**: System activity tracking

### Bitbucket REST API (v2.0)
- Repository operations (CRUD, branch protection)
- Pull request management (create, review, merge, comments)
- Commit history and diff operations
- Pipeline execution and management
- Webhook configuration

### Confluence REST API (v2)
- Content operations (pages, blogs, comments)
- Space management
- Attachment handling
- Label management
- Permission controls

### Forge Runtime APIs
- `@forge/api`: Jira/Confluence REST access, context management
- `@forge/resolver`: Frontend-to-backend communication
- `@forge/jira-bridge`: UI modifications and workflow configuration
- `@forge/kvs`: Key-value storage for persistence
- `@forge/bridge`: Frontend navigation and context

## Quick Reference

| Task | Module Type / API |
|------|-------------------|
| Validate fields before transition | `jira:workflowValidator` |
| Control transition visibility | `jira:workflowCondition` |
| Execute logic after transition | `jira:workflowPostFunction` |
| Schedule recurring tasks | `scheduledTrigger` |
| Create automation actions | `action` |
| Custom UI development | @forge/bridge, @forge/resolver |
| Create Jira issues | Jira REST API `/rest/api/3/issue` |
| Search issues with JQL | Jira REST API `/rest/api/3/search` |

## Skill Configuration

The skill is defined in `SKILL.md` with:
- **name**: `atlassian-jira-forge-skill`
- **description**: Atlassian Jira Forge app development