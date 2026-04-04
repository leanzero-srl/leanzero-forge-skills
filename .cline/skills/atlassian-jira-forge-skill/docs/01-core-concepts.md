# Core Forge Concepts

## What is Forge?

Forge is Atlassian's serverless platform for building apps that extend Jira, Confluence, Bitbucket, and Jira Service Management. Apps run in a secure, isolated environment on Atlassian infrastructure.

### Key Benefits

- **Serverless**: No infrastructure management required
- **Secure**: Runs in sandboxed environment with controlled permissions
- **Portable**: Apps work across all Atlassian Cloud products
- **Scalable**: Automatically scales based on usage

## App Structure

### Required Files

```
your-forge-app/
├── manifest.yml           # App configuration (required)
├── package.json           # Dependencies (required)
└── src/                   # Source code
    └── index.js          # Function implementations
```

### App Manifest (`manifest.yml`)

The central configuration file defining your app's capabilities.

```yaml
modules:
  jira:workflowValidator:
    - key: my-validator
      name: My Validator
      description: Validates issue fields
      function: validate

function:
  - key: validate
    handler: index.validate

resources:
  - key: config-ui
    path: static/config/build

permissions:
  scopes:
    - read:jira-work
    - storage:app

app:
  id: ari:cloud:ecosystem::app/YOUR-APP-ID
  runtime:
    name: nodejs22.x
```

## Core Components

### Module

A capability your app provides. Each module type serves a specific purpose:

| Module Type | Purpose |
|-------------|---------|
| `jira:workflowValidator` | Validate data during workflow transitions |
| `jira:workflowCondition` | Control visibility of transitions |
| `jira:workflowPostFunction` | Execute logic after successful transition |
| `macro` | Insert content in Confluence pages |

### Function

The code that executes when a module is triggered. Functions are defined in `manifest.yml` and implemented in JavaScript/Node.js.

```javascript
export const myHandler = async (args, context) => {
  // Your logic here
  return { result: true };
};
```

### Resource

Static assets for Custom UI (HTML/CSS/JS/JSX). Resources are referenced by modules that need configuration UIs.

### Resolver

A bridge between frontend UI and backend functions. Resolvers allow your React app to call server-side logic with proper authentication.

## Context Object

Every function receives two arguments:

```javascript
export const handler = async (payload, context) => {
  // payload: Module-specific data
  // context: Execution environment information
  
  console.log(context.installContext);    // App installation ARI
  console.log(context.accountId);         // User's Atlassian account ID
  console.log(context.workspaceId);       // Workspace identifier
  console.log(context.license);           // License info (if applicable)
  
  return { result: true };
};
```

### Context Properties

| Property | Description |
|----------|-------------|
| `accountId` | User's Atlassian account ID |
| `accountType` | 'licensed', 'unlicensed', 'customer', or 'anonymous' |
| `cloudId` | Cloud instance identifier |
| `installContext` | App installation ARI |
| `workspaceId` | Workspace identifier (newer architecture) |
| `principal` | User identity information |
| `license` | License status for paid apps |

## Function Types

### Trigger Functions

Executed when specific events occur:

```javascript
// Event: Issue created in Jira
export const issueCreated = async (event, context) => {
  console.log('New issue:', event.issue.key);
  return { status: 'processed' };
};
```

### Resolver Functions

Called from Custom UI to backend logic:

```javascript
import Resolver from '@forge/resolver';

const resolver = new Resolver();

resolver.define('fetchData', async ({ payload }, context) => {
  // Can make Jira API calls with proper auth
  return { data: await response.json() };
});

export const handler = resolver.getDefinitions();
```

### Workflow Module Functions

| Module Type | Return Value |
|-------------|--------------|
| `jira:workflowValidator` | `{ result: true }` or `{ result: false, errorMessage: '...' }` |
| `jira:workflowCondition` | `{ result: true }` or `{ result: false }` |
| `jira:workflowPostFunction` | `{ result: true }` |

## Manifest.yml Reference

### Required Sections

| Section | Purpose |
|---------|---------|
| `modules` | Define all app capabilities |
| `app.id` | Unique app identifier (ARN format) |
| `app.runtime` | Node.js version and memory settings |

### Optional Sections

- `function` - Define executable functions
- `resolver` - Define resolver functions for UI communication
- `resources` - Declare static asset locations
- `permissions` - Request required scopes
- `external.fetch` - Allow calls to external APIs (e.g., OpenAI)

## Testing Best Practices

1. **Use Forge Tunnel** for local development:
   ```bash
   forge tunnel
   ```

2. **Deploy to staging** before production:
   ```bash
   forge deploy -e staging
   forge install --upgrade -e staging
   ```

3. **Check logs** during debugging:
   ```bash
   forge logs -n 50
   ```

4. **Lint before deploying**:
   ```bash
   forge lint
   forge lint --fix  # Auto-fix some issues
   ```

## Common Commands Reference

| Command | Purpose |
|---------|---------|
| `forge create` | Create new app |
| `forge deploy` | Deploy to development site |
| `forge install --upgrade` | Install/update on site |
| `forge tunnel` | Local testing with live environment |
| `forge logs -n 50` | View last 50 log entries |
| `forge lint` | Check manifest/code for issues |

## Next Steps

- **Jira Modules**: Learn about workflow validators, conditions, and post functions
- **Events & Payloads**: Understand what data is available when modules trigger
- **API Endpoints**: Know how to call Jira REST APIs from your app
- **Permissions**: Configure required scopes for your app's functionality