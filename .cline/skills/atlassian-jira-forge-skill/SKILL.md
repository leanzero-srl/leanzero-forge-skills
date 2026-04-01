---
name: atlassian-jira-forge-skill
description: Atlassian Jira Forge app development. Use when creating workflow validators, conditions, post-functions, custom UIs for workflow rules, or integrating with Jira REST APIs from a Forge app.
---

# Atlassian Jira Forge Development

This skill provides documentation for building Forge apps that extend Jira.

## When to Use This Skill

- Creating workflow validators (validate fields before transition completes)
- Creating workflow conditions (control transition visibility)
- Creating workflow post-functions (execute logic after transition)
- Building custom UIs for workflow rule configuration
- Making Jira REST API calls from a Forge app
- Setting up scheduled triggers and automation actions
- Configuring dashboard widgets or Bitbucket merge checks

## Quick Reference

| Task | Module Type |
|------|-------------|
| Validate fields before transition | `jira:workflowValidator` |
| Control transition visibility | `jira:workflowCondition` |
| Execute logic after transition | `jira:workflowPostFunction` |
| Custom configuration UI | Custom React UI with @forge/bridge |
| Run scheduled tasks | `scheduledTrigger` |
| Create automation actions | `action` |

---

## Core Concepts

Forge is Atlassian's serverless platform for building apps that extend Jira, Confluence, Bitbucket, and Jira Service Management.

### Key Components

- **Module**: A capability declared in manifest.yml
- **Function**: Code executed when a module triggers
- **Resource**: Static assets for Custom UI
- **Resolver**: Bridge between frontend UI and backend functions

### Context Object

Every function receives payload and context:

```javascript
export const handler = async (payload, context) => {
  console.log(context.installContext);
  console.log(context.accountId);
  return { result: true };
};
```

---

## Quick Comparison: Validators vs Conditions vs Post Functions

| Aspect | Validator | Condition | Post Function |
|--------|-----------|-----------|---------------|
| When runs | Before transition completes | Before UI renders | After transition completes |
| Purpose | Validate data before completion | Hide/show transitions in UI | Execute logic after success |
| Failure behavior | Transition blocked, error shown | Transition hidden from user | Error logged, workflow continues |

---

## Module Configuration Examples

### Workflow Validator (Function-based)

```yaml
modules:
  jira:workflowValidator:
    - key: my-validator
      name: My Validator
      description: Validates issue fields
      function: validateContent
      
      create:
        resource: config-ui
```

```javascript
export const validateContent = async (args) => {
  const { issue, configuration } = args;
  
  if (isValid) {
    return { result: true };
  } else {
    return { 
      result: false, 
      errorMessage: "Validation failed" 
    };
  }
};
```

### Workflow Condition

```yaml
modules:
  jira:workflowCondition:
    - key: my-condition
      name: My Condition
      description: Controls visibility
      function: checkLicense
      
      create:
        resource: config-ui
```

```javascript
export const checkLicense = async (args) => {
  return { result: context.license?.isActive };
};
```

### Post Function

```yaml
modules:
  jira:workflowPostFunction:
    - key: my-post-function
      name: My Post Function
      description: Executes after transition
      function: enhanceSummary
      
      create:
        resource: config-ui
```

---

## Common Patterns

See [Problem Patterns](docs/problem-patterns.md) for:

- How to build dropdowns that fetch projects
- How to validate custom fields against external APIs
- How to sync Jira issues with external systems
- Handling rate limits and batching operations

See [When to Use Which Module](docs/when-to-use-which.md) for choosing the right module type.

## Templates

Copy-paste templates are available in `templates/`:

| Template | Description |
|----------|-------------|
| `validator.yml` | Workflow validator boilerplate with configuration UI example |
| `condition.yml` | Workflow condition boilerplate for visibility control |
| `post-function.yml` | Post function boilerplate for post-transition logic |

See templates directory for complete, ready-to-use code examples.

---

## API Integration

Use `@forge/api` for REST calls:

```javascript
import api, { route } from '@forge/api';

// GET request
const response = await api.asApp().requestJira(route`/rest/api/3/issue/${key}`);
const data = await response.json();

// POST with body
await api.asApp().requestJira(route`/rest/api/3/issue`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ fields: { summary: "New" } })
});
```

See `docs/06-api-endpoints-enhanced.md` for all endpoints.

---

## Permissions & Scopes

```yaml
permissions:
  scopes:
    - read:jira-work      # View issues
    - write:jira-work     # Create/update issues
    - read:workflow:jira  # Read workflows
    
  external:
    fetch:
      backend:
        - "api.openai.com"
```

See `docs/07-permissions-scopes.md` for complete scope list.

---

## CLI Commands

| Command | Purpose |
|---------|---------|
| `forge init` | Create new app |
| `forge deploy` | Deploy to development |
| `forge install --upgrade` | Install on site |
| `forge tunnel` | Local testing |
| `forge logs -n 50` | View logs |

See `docs/08-cli-commands.md` for full reference.

---

## Advanced Documentation

The `docs/` directory contains detailed documentation:

### Core Topics
| Topic | File |
|-------|------|
| Core Concepts | `01-core-concepts.md` |
| UI Modifications | `02-ui-modifications.md` |
| Workflow Validators | `02-workflow-validators.md` |
| Workflow Conditions | `03-workflow-conditions.md` |
| Workflow Post Functions | `04-workflow-post-functions.md` |

### Advanced Topics
| Topic | File |
|-------|------|
| Events & Payloads | `05-events-payloads.md` |
| API Endpoints | `06-api-endpoints-enhanced.md` |
| Permissions & Scopes | `07-permissions-scopes.md` |
| CLI Commands | `08-cli-commands.md` |
| Scheduled Triggers | `09-scheduled-triggers.md` |
| Automation Actions | `10-automation-actions.md` |
| Event Filters | `11-event-filters.md` |
| Dashboard Widgets | `12-dashboard-widgets.md` |
| Bitbucket Merge Checks | `13-merge-checks.md` |
| Confluence Content Properties | `14-content-properties.md` |
| Bridge API Reference | `15-bridge-api-reference.md` |
| Resolver Patterns | `16-resolver-patterns.md` |
| UI Kit Components | `17-ui-kit-components.md` |

### Custom UI Documentation (New)
| Topic | File |
|-------|------|
| Complete Custom UI Guide | `21-complete-custom-ui-guide.md` |
| Custom UI Troubleshooting | `18-custom-ui-troubleshooting.md` |
| Rate Limit Handling | `19-rate-limit-handling.md` |
| Performance Optimization | `20-performance-optimization.md` |

### New in This Version
- `problem-patterns.md` - Common code patterns with examples
- `when-to-use-which.md` - Decision guide for module selection
- Custom UI complete guide with working React code examples
- CSP error troubleshooting and fixes
- Rate limit handling with exponential backoff implementations
- Performance optimization patterns to reduce costs

### Templates

Copy-paste templates available in `templates/`:
- `validator.yml` - Workflow validator boilerplate
- `condition.yml` - Workflow condition boilerplate
- `post-function.yml` - Post function boilerplate

---

## Debugging & Troubleshooting

| Error | Solution |
|-------|----------|
| "Function not found" | Check function keys match manifest |
| "Permission denied" | Add required scope to permissions.scopes |

1. Use `console.log()` for debugging
2. View logs with `forge logs -n 50`
3. Test locally with `forge tunnel`

See `docs/advanced-troubleshooting.md` for detailed troubleshooting guide.