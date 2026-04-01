# Cline Skills

A **skill** for [Cline](https://github.com/cline) is a collection of documentation, guides, and reference materials that provide specialized knowledge to help Cline (and human developers) work more effectively on specific types of projects. Skills are activated automatically when working in relevant directories or when the context suggests they should be used.

## What is This Skill?

This repository contains the **Atlassian Jira Forge Skill** - a comprehensive documentation suite for building Atlassian Forge apps that extend Jira, Confluence, Bitbucket, and Jira Service Management.

### Purpose

The skill provides:
- **Context-aware guidance**: When Cline detects Forge development work (e.g., working with `manifest.yml`), it activates this skill to provide relevant documentation
- **Module-specific references**: Complete documentation for workflow validators, conditions, post-functions, and other module types
- **API endpoint documentation**: Comprehensive reference for Jira REST API (v3), Confluence REST API, and Bitbucket REST API
- **Best practices**: Proven patterns for Forge app development including resolver patterns, bridge API usage, and UI development

### How Skills Work in Cline

1. **Automatic Activation**: Skills are activated based on file context (e.g., working with `manifest.yml` triggers this skill)
2. **Context Integration**: The skill's documentation is integrated into the AI's knowledge base for the current session
3. **Persistent Access**: Once activated, the skill remains active for related tasks in that session
4. **Skill Definition**: Skills are defined in a `SKILL.md` file with metadata (name, description) that Cline uses to identify when to activate

## Installation

To install this skill (or any other) on your system:

```bash
# Create the skills directory if it doesn't exist
mkdir -p ~/.cline/skills

# Copy the skill into place
cp -r atlassian-jira-forge-skill ~/.cline/skills/
```

Cline automatically detects skills in `~/.cline/skills/` and activates them when appropriate.

## Structure of This Skill

This skill is organized by functionality for Jira Forge development:

```
.cline/skills/atlassian-jira-forge-skill/
├── SKILL.md                           # Skill metadata and main documentation
├── docs/                              # Documentation files (01-18)
│   ├── 01-core-concepts.md           # Core Forge concepts, manifest structure
│   ├── 02-ui-modifications.md        # UI modification modules
│   ├── 02-workflow-validators.md     # Workflow validator documentation
│   ├── 03-workflow-conditions.md     # Workflow condition documentation
│   ├── 04-workflow-post-functions.md # Workflow post function documentation
│   ├── 05-events-payloads.md         # Event structures and payloads reference
│   ├── 06-api-endpoints-enhanced.md  # Enhanced Jira REST API reference
│   ├── 06-api-endpoints.md           # API endpoints (original)
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
│   └── 18-custom-ui-advanced.md      # Advanced Custom UI development guide
├── api-endpoints/                     # External API reference files (not included)
└── events-payloads/                   # External event payload files (not included)
```

## What's Included

### Core Documentation
| File | Description |
|------|-------------|
| `SKILL.md` | Main instructions and quick reference guide for Cline |
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
| `docs/17-ui-kit-components.md` | UI Kit components reference ( Buttons, Forms, Layout, etc.) |
| `docs/18-custom-ui-advanced.md` | Advanced Custom UI development guide |

## When to Use This Skill

This skill activates automatically when working on:
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
| `contentProperty` | Content Property Module (external) |

### Bitbucket Modules
| Module Type | Documentation |
|-------------|---------------|
| `bitbucket:mergeCheck` | [Merge Check Module](./docs/13-merge-checks.md) |

## API Reference Summary

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

The skill documents these critical Forge runtime libraries:

| Library | Purpose |
|---------|---------|
| `@forge/api` | Jira/Confluence REST access, context management |
| `@forge/resolver` | Frontend-to-backend communication (Resolver pattern) |
| `@forge/jira-bridge` | UI modifications and workflow configuration |
| `@forge/kvs` | Key-value storage for persistence |
| `@forge/bridge` | Frontend navigation and context access |

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

## Cline Skill Architecture

### Skill Activation Process

1. **File Detection**: When Cline detects files like `manifest.yml`, it identifies Forge-related work
2. **Skill Matching**: Cline checks for skills that match the project context
3. **Documentation Loading**: The skill's documentation from `SKILL.md` and related files is loaded
4. **Context Integration**: Cline uses this documentation to guide responses and suggestions

### Skill Files Explained

| File | Purpose |
|------|---------|
| `SKILL.md` | Contains skill metadata (name, description) and core documentation that defines when/why the skill should be used |
| `docs/*.md` | Detailed technical documentation for each module type |
| `api-endpoints/*.md` | Comprehensive API endpoint references (optional, can reference external sources) |

### Best Practices for Cline Skills

1. **Clear Activation Triggers**: Document what file patterns or project types activate the skill
2. **Module-Specific Documentation**: Provide detailed documentation for each module type
3. **Code Examples**: Include working code examples for common use cases
4. **Error Handling**: Document common errors and their solutions
5. **Quick Reference Tables**: Use tables for quick lookup of options and configurations

## Skill Configuration

The skill is defined in `SKILL.md` with:

```yaml
---
name: atlassian-jira-forge-skill
description: Atlassian Jira Forge app development. Use when creating workflow validators, conditions, post-functions, custom UIs for workflow rules, or integrating with Jira REST APIs from a Forge app.
---
```

### Metadata Fields

| Field | Description |
|-------|-------------|
| `name` | Unique identifier for the skill (used internally by Cline) |
| `description` | Human-readable description that explains when this skill should be activated |

## Example: Workflow Validator Implementation

A complete example from the documentation:

```yaml
# manifest.yml
modules:
  jira:workflowValidator:
    - key: ai-content-validator
      name: AI Content Validator
      description: Validates issue content using AI
      function: validateContent
      
      create:
        resource: config-ui
```

```javascript
// src/index.js
export const validateContent = async (args) => {
  const { issue, configuration } = args;
  
  // Configuration contains user's settings
  const fieldId = configuration.fieldId || 'description';
  
  // Validate and return result
  if (isValid) {
    return { result: true };  // Allow transition
  } else {
    return { 
      result: false, 
      errorMessage: "Validation failed" 
    };
  }
};
```

## Event Filters with Jira Expressions

Event filters enable selective event handling using Jira expressions:

```yaml
modules:
  trigger:
    - key: project-specific-trigger
      events:
        - avi:jira:created:issue
      filter: issue.fields.project.key == 'PROJ'
      function: handleProjectIssues
```

Available expression functions include `contains()`, `startsWith()`, `greaterThan()`, and more.

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

## Additional Resources

The skill references external documentation in the following directories (not included):

- `api-endpoints/` - Comprehensive API reference files (Jira, Confluence, Bitbucket)
- `events-payloads/` - Detailed event payload structures

## Related Documentation

For more information about Cline skills:
- [Cline GitHub Repository](https://github.com/cline)
- [Cline Skills Documentation](https://github.com/cline/tree/main/skills)