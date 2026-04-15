---
name: atlassian-jira-forge-skill
description: Atlassian Jira Forge app development. Use when creating workflow validators, conditions, post-functions, custom UIs for workflow rules, or integrating with Jira REST APIs from a Forge app.
---

# Atlassian Jira Forge Development

This skill provides documentation for building Forge apps that extend Jira.

## When to Use This Skill

**Use this skill when:**
- You are developing apps specifically for **Jira Cloud**.
- You need to extend Jira functionality using the Forge platform.
- You are working with Jira-specific modules (validators, conditions, post-functions).

**Do NOT use this skill when:**
- You are developing for **Confluence Cloud** (use `atlassian-confluence-forge-skill` instead).
- You are building apps for Atlassian Connect or other platforms.
- You need to perform complex Confluence content management.

It covers:
- Creating workflow validators (Preview) - validate fields before transition completes
- Creating workflow conditions (Preview) - control visibility of transitions
- Creating workflow post-functions (Preview) - execute logic after transition
- Building custom UIs for workflow rule configuration
- Making Jira REST API calls from a Forge app
- Setting up scheduled triggers and automation actions
- Configuring dashboard widgets or Bitbucket merge checks

**Note**: `jira:workflowValidator`, `jira:workflowCondition`, and `jira:workflowPostFunction` modules are in **Preview** status per Atlassian's official documentation.

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

## Available Scripts

Use these scripts to automate common Forge development workflows. They are located in the `scripts/` directory.

| Script | Description |
|--------|-------------|
| `validate-manifest.sh` | Validates `manifest.yml` for errors using `forge lint` |
| `deploy-and-install.sh` | Automates `forge deploy` followed by `forge install --upgrade` |
| `dev-setup.sh` | Starts the Forge development tunnel (supports `-e` for environment) |
| `preflight-check.sh` | Runs a comprehensive environment and manifest validation check |

### 🚀 Recommended Workflow: Plan-Validate-Execute

For high-stakes operations (like deployment or manifest changes), follow this pattern to minimize errors:

1.  **Plan**: Describe the intended changes or commands.
2.  **Validate**: Run `./scripts/preflight-check.sh` and `./scripts/validate-manifest.sh` to ensure the environment and configuration are correct.
3.  **Execute**: Perform the deployment or modification only after validation passes.

### Real-World Implementation Issues & Solutions

**New!** See [Real-World Patterns](docs/24-real-world-patterns.md) for:

- **CSP & Custom UI errors** - "Refused to load script" fixes, inline style workarounds
- **Rate limiting (429)** - Exponential backoff implementations, batching strategies  
- **Storage/KVS issues** - Orphan cleanup patterns, safe storage access with fallbacks
- **Tunnel problems** - Manifest change handling, local dev auth issues
- **Migration pitfalls** - Connect to Forge key mapping, webhook alternatives
- **Performance optimization** - Caching patterns, attachment size budgets
- **Third-party integrations** - OpenAI/Slack network restrictions, env var usage

> This document aggregates real problems from Atlassian Community, GitHub issues, and production Forge apps with verified solutions. Structured for AI models to match user symptoms → solutions quickly.

See [When to Use Which Module](docs/when-to-use-which.md) for choosing the right module type.

## Gotchas

For common pitfalls and environment-specific facts, see [Gotchas](docs/gotchas.md).

## Templates

Copy-paste templates are available in `templates/`:

### Workflow Modules
| Template | Description |
|----------|-------------|
| `validator.yml` | Workflow validator boilerplate with configuration UI example |
| `condition.yml` | Workflow condition boilerplate for visibility control |
| `post-function.yml` | Post function boilerplate for post-transition logic |
| `complex-validator.yml` | Multi-rule validator with dynamic configuration UI |

### Triggers & Events
| Template | Description |
|----------|-------------|
| `scheduled-trigger.yml` | Scheduled trigger (hourly, daily, weekly) for background tasks |
| `webhook-handler.yml` | Event-based handler for Jira events (created, updated, deleted) |
| `trigger-with-filter.yml` | Trigger with advanced event filtering |

### Automation & Actions
| Template | Description |
|----------|-------------|
| `automation-action.yml` | Custom automation action with configurable inputs |
| `bulk-operation.yml` | Bulk issue operations with rate limiting and batching |

### Storage & Configuration
| Template | Description |
|----------|-------------|
| `storage-kvs-example.yml` | Key-value storage patterns for configuration and state |

### UI Components
| Template | Description |
|----------|-------------|
| `ui-modifications.yml` | Custom UI modifications with React components |
| `dashboard-gadget.yml` | Dashboard widget template |

### Integrations
| Template | Description |
|----------|-------------|
| `bitbucket-merge-check.yml` | Bitbucket merge check for pull request validation |


---

## Failure Strategies

When an error occurs during execution, follow these patterns:

- **Manifest/Module Errors**: If a module is not recognized, verify the `manifest.yml` against the [Advanced Documentation](#advanced-documentation) and ensure you are using the correct Jira module names (e.g., `jira:workflowValidator`).
- **Permission Denied (403)**: Check if the required OAuth scopes are defined in the `permissions.scopes` section of your `manifest.yml`. Refer to [07-permissions-scopes.md](docs/07-permissions-scopes.md).
- **API Errors (4xx/5xx)**: 
  - For 404 errors, verify the issue key or project ID exists.
  - For 429 (Rate Limit), implement exponential backoff.
- **Runtime Errors**: Use `forge logs` to inspect the error stack trace and ensure all required environment variables or dependencies are present.

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

### Real-World Patterns
| Topic | File |
|-------|------|
| **Implementation Issues & Solutions** | **`24-real-world-patterns.md`** |
| **Production Patterns (PPM Pro)** | **`25-production-patterns-ppm.md`** |

### Jira Service Management (New)
| Topic | File |
|-------|------|
| JSM Extensions Guide | `22-jira-service-management.md` |

### New in This Version
- `problem-patterns.md` - Common code patterns with examples
- `when-to-use-which.md` - Decision guide for module selection
- **`24-real-world-patterns.md`** - Real-world issues & solutions from community/GitHub (CSP errors, rate limits, storage cleanup, tunnel fixes, migration pitfalls)
- **`25-production-patterns-ppm.md`** - 24 production-proven patterns extracted from PPM Pro: KVS sharding, chunked write-back, retry with jitter, issue links (with critical outward/inward gotcha), ADF comments, screen configuration chain, trigger protection, concurrency (drafts/locks/conflicts), bridge invoke, Jira bridge modal, multi-module manifest, KVS cost control, modular resolver registration, issue transformer (two-pass with plan-scoped dep filtering), full indexing pipeline (sources → transform → shard → KVS), config-driven field payload builder, dependency extraction semantics, post-write verification, and Forge memory management. Every pattern includes working code and a verified Jira REST API endpoint reference table with required scopes.
- Custom UI complete guide with working React code examples
- CSP error troubleshooting and fixes
- Rate limit handling with exponential backoff implementations
- Performance optimization patterns to reduce costs
- JSM extensions: custom request types, SLA automation, portal widgets

### Templates

All templates include:
- YAML manifest configuration with detailed comments
- JavaScript function handlers with working examples
- React UI components (where applicable)
- Required permissions/scopes section
- Testing instructions

See `templates/` directory for complete, ready-to-use code.

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