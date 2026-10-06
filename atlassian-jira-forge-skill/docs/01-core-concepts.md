# Core Forge Concepts

## What is Forge?

Forge is Atlassian's serverless platform for building apps that extend Jira, Confluence, Bitbucket, and Jira Service Management. Apps run in a secure, isolated environment on Atlassian infrastructure, with no servers to manage.

## App Structure

### Required Files

```
your-forge-app/
├── manifest.yml           # App configuration (required)
├── package.json           # Dependencies (required)
├── package-lock.json      # Commit it: `npm ci` fails without one
└── src/
    ├── index.js           # Backend functions (handler: index.<export>)
    └── frontend/index.jsx # UI Kit frontend
```

### App Manifest (`manifest.yml`)

A UI Kit issue panel plus a trigger on issue creation. With the id `forge register` writes in `app.id`, `forge lint` accepts it as is:

```yaml
app:
  id: ari:cloud:ecosystem::app/YOUR-APP-ID
  runtime:
    name: nodejs24.x                        # or nodejs22.x / nodejs20.x
modules:
  jira:issuePanel:
    - key: hello-issue-panel
      resource: main
      resolver:
        function: resolver
      render: native                        # UI Kit
      title: Hello panel
      icon: https://developer.atlassian.com/platform/forge/images/icons/issue-panel-icon.svg  # required
  trigger:
    - key: issue-created-trigger
      function: on-issue-created
      events:
        - avi:jira:created:issue
  function:                                 # a module too, never top level
    - key: resolver
      handler: index.handler
    - key: on-issue-created
      handler: index.onIssueCreated
resources:
  - key: main
    path: src/frontend/index.jsx            # Custom UI: its build/ folder
permissions:
  scopes:
    - read:jira-work
```

`package.json`: `@forge/react` already depends on `@forge/bridge` (12.3 needs ^7.1, Oct 2026), so declare the same `@forge/bridge` major or npm installs two; never `"latest"`. Commit `package-lock.json`, or `npm ci` fails.

## Core Components

### Module

A capability your app provides. Each module type serves a specific purpose:

| Module Type | Purpose |
|-------------|---------|
| `function` | Backend code (`key` + `handler: file.export`); other modules name it |
| `trigger` | Run a function when product events fire (`avi:jira:created:issue`, etc.) |
| `jira:workflowValidator` | Block a transition when validation fails |
| `jira:workflowCondition` | Hide/show transitions with a Jira expression (no function call) |
| `jira:workflowPostFunction` | Run logic after a transition completes |
| `scheduledTrigger` | Run a function every `fiveMinute`/`hour`/`day`/`week` (no cron) |
| `consumer` | Process events from an async queue (`@forge/events`) |
| `webtrigger` | Public HTTPS endpoint into your app |
| `jira:globalPage` / `jira:adminPage` / `jira:projectPage` | Full-page UIs |
| `jira:issuePanel` / `jira:issueAction` | Issue-context UIs |
| `jira:customField` / `jira:customFieldType` | Custom fields |
| `jira:dashboardGadget` | Dashboard widgets |

> The three workflow modules are real, supported Forge modules — see `developer.atlassian.com/platform/forge/manifest-reference/modules/jira-workflow-validator` (and the parallel `jira-workflow-condition` / `jira-workflow-post-function` pages). A validator and a post-function run your Forge function during the transition. A condition is different: it is a Jira expression in the manifest that Jira evaluates itself, so it can never call REST APIs, KVS, a model or an external system. Work like that belongs in a validator.

### Function

The code that executes when a module is triggered. A function is the `function` module in `manifest.yml` (`key`, plus `handler: <file>.<export>` relative to `src/`); other modules name it by key.

```javascript
export const myHandler = async (event, context) => {
  // Your logic here
};
```

### Resource

What a UI module displays: the UI Kit source file (`src/frontend/index.jsx`) or a Custom UI build folder. Modules name it by key.

### Resolver

A bridge between frontend UI and backend functions. Resolvers allow your React app to call server-side logic with proper authentication.

## Context Object

A trigger function receives `(event, context)`. A resolver receives ONE request object, `{ payload, context }`:

```javascript
export const onIssueCreated = async (event, context) => {
  console.log(event.issue.key);           // the event payload
  console.log(context.installContext);    // installation ARI
};
```

### Context Properties

| Property | Description |
|----------|-------------|
| `accountId` | Resolver: the user who triggered the call |
| `accountType` | Resolver: 'licensed', 'unlicensed', 'customer' or 'anonymous' |
| `cloudId` / `localId` / `extension` | Resolver: site, UI instance, module data |
| `principal` | Trigger: the interacting user (not a user on a schedule) |
| `installContext` | Both: installation ARI |
| `workspaceId` | Both: workspace identifier |
| `license` | Both: license (production only) |

## Function Types

### Trigger Functions

Executed when specific events occur:

```javascript
// Event: Issue created in Jira
export const issueCreated = async (event, context) => {
  console.log('New issue:', event.issue.key);
};
```

### Resolver Functions

Called from the frontend with `invoke('getSummary', { issueKey })` (`@forge/bridge`):

```javascript
import Resolver from '@forge/resolver';
import api, { route } from '@forge/api';

const resolver = new Resolver();
resolver.define('getSummary', async ({ payload }) => {
  const res = await api.asUser().requestJira(
    route`/rest/api/3/issue/${payload.issueKey}?fields=summary`);
  return (await res.json()).fields.summary;
});
export const handler = resolver.getDefinitions();
```

### Scheduled Triggers

Run on the manifest's `interval` (`fiveMinute`, `hour`, `day` or `week`; cron is not supported):

```javascript
export const dailyReport = async ({ context }) => {
  // No user: context.principal is not a person.
  // The return value is ignored; a throw is not retried.
};
```

## Manifest.yml Reference

### Required Sections

| Section | Purpose |
|---------|---------|
| `app.id` | The app's ARI (`ari:cloud:ecosystem::app/...`) |
| `app.runtime.name` | `nodejs24.x`, `nodejs22.x` or `nodejs20.x` |
| `modules` | Every capability, functions included |
| `permissions` | Scopes; egress goes under `permissions.external.fetch` |

### Optional Sections

- `resources` - UI Kit source files / Custom UI build folders

There is no top-level `function`, `resolver` or `external`: functions are `modules.function`, a resolver is a UI module's `resolver: { function: <key> }`.

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

- **Workflow modules**: `02-workflow-validators.md`, `03-workflow-conditions.md`, `04-workflow-post-functions.md`
- **Events & Payloads**: `05-events-payloads.md`
- **API Endpoints**: `06-api-endpoints.md`
- **Permissions**: `07-permissions-scopes.md`
- **Async events / long-running work**: `26-async-events-and-queues.md`
- **FaaS limits**: `27-faas-limits-and-cost.md`
