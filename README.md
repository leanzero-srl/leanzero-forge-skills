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
| `docs/01-core-concepts.md` | Core Forge concepts and manifest structure |
| `docs/02-workflow-validators.md` | Workflow validator documentation |
| `docs/03-workflow-conditions.md` | Workflow condition documentation |
| `docs/04-workflow-post-functions.md` | Workflow post function documentation |
| `docs/05-events-payloads.md` | Event structures and payloads |
| `docs/06-api-endpoints.md` | API endpoint reference |
| `docs/06-api-endpoints-enhanced.md` | **Enhanced** Jira REST API reference with comprehensive endpoints |
| `docs/07-permissions-scopes.md` | Permissions and scopes reference |
| `docs/08-cli-commands.md` | CLI commands reference |

### Jira Modules Documentation
| File | Description |
|------|-------------|
| `jira-modules/README.md` | Overview of all Jira module types |
| `jira-modules/workflow-validators.md` | Workflow validator detailed docs |
| `jira-modules/workflow-conditions.md` | Workflow condition detailed docs |
| `jira-modules/workflow-post-functions.md` | Workflow post-function detailed docs |

### Events & Payloads
| File | Description |
|------|-------------|
| `events-payloads/jira-events.md` | Jira issue, comment, workflow events |
| `events-payloads/bitbucket-events.md` | Bitbucket repository, PR events |
| `events-payloads/confluence-events.md` | Confluence page, space events |

### API Endpoints
| File | Description |
|------|-------------|
| `api-endpoints/jira-rest-api.md` | Comprehensive Jira Cloud REST API reference |
| `api-endpoints/bitbucket-rest-api.md` | Bitbucket Cloud REST API v2.0 reference |
| `api-endpoints/confluence-rest-api.md` | Confluence Cloud REST API v2 reference |
| `api-endpoints/forge-runtime-apis.md` | Forge platform APIs (@forge/api, resolver, kvs) |

### Add-on Product Modules
| File | Description |
|------|-------------|
| `jsm-modules/README.md` | Jira Service Management module types |

## When to Use This Skill

Use this skill when working on:
- Creating **workflow validators** - validate issue fields before transition completes
- Creating **workflow conditions** - control visibility of transitions
- Creating **workflow post-functions** - execute logic after transition
- Building custom UIs for workflow rule configuration
- Making Jira REST API calls from a Forge app

## Complete Module Types Reference

### Jira Modules
| Module Type | Documentation |
|-------------|---------------|
| `jira:workflowValidator` | [Workflow Validators](./forge-skill/jira-modules/workflow-validators.md) |
| `jira:workflowCondition` | [Workflow Conditions](./forge-skill/jira-modules/workflow-conditions.md) |
| `jira:workflowPostFunction` | [Workflow Post Functions](./forge-skill/jira-modules/workflow-post-functions.md) |

### Confluence Modules
| Module Type | Documentation |
|-------------|---------------|
| `confluence:macro` | [Macro Module](./forge-skill/confluence-modules/macro.md) |
| `confluence:fullPage` | [Full Page Module](./forge-skill/confluence-modules/full-page.md) |

### Bitbucket Modules
| Module Type | Documentation |
|-------------|---------------|
| `bitbucket:mergeCheck` | [Merge Check Module](./forge-skill/bitbucket-modules/merge-checks.md) |

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
| Create Jira issues | Jira REST API `/rest/api/3/issue` |
| Search issues with JQL | Jira REST API `/rest/api/3/search` |
| Bulk update issues | Jira REST API `/rest/api/3/bulk/issues/fields` |

## Skill Configuration

The skill is defined in `SKILL.md` with:
- **name**: `atlassian-jira-forge-skill`
- **description**: Atlassian Jira Forge app development
