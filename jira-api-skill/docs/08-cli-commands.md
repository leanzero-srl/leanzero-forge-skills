# Forge CLI Commands Reference

## Overview

The Forge CLI (`forge`) is used to develop, deploy, and manage Forge apps. All commands must be run from your app's root directory.

---

## Setup & Initialization

| Command | Description |
|---------|-------------|
| `forge create` | Create a new Forge app (interactive prompts) |
| `forge deploy` | Deploy app to development environment |
| `forge login` | Log in to Atlassian account |
| `forge logout` | Log out of current session |

### Initialize New App

```bash
# Start interactive setup (prompts for name, category, template)
forge create

# Example flow:
# ? Enter a name for your app: my-app
# ? Select an Atlassian app or platform tool: Jira
# ? Select a category: UI Kit
# ? Select a template: jira-admin-page
```

---

## Development Commands

| Command | Description |
|---------|-------------|
| `forge deploy` | Deploy app to development environment |
| `forge install` | Install app on current site |
| `forge install --upgrade` | Update installation with new version |
# App removal is done via Atlassian Admin Console (Settings > Apps)

### Deployment Flow

```bash
# Make code changes
vim src/index.js

# Deploy the app
forge deploy

# Upgrade the installation (new permissions may need approval)
forge install --upgrade

# Monitor logs
forge logs -n 50
```

---

## Local Testing

| Command | Description |
|---------|-------------|
| `forge tunnel` | Create local tunnel for testing (development env) |

### Using Forge Tunnel

```bash
# Start tunnel (keeps terminal open)
forge tunnel

# In another terminal, run other commands
# App is accessible via tunnel URL
```

---

## Log Monitoring

| Command | Description |
|---------|-------------|
| `forge logs` | View app logs |
| `forge logs -n 50` | Show last 50 log entries |
| `forge logs --follow` | Stream logs in real-time |

### Example Log Output

```bash
$ forge logs -n 10
2023-10-01T10:00:00Z [INFO] Function started: validateContent
2023-10-01T10:00:01Z [INFO] Issue key: PROJ-123
2023-10-01T10:00:02Z [DEBUG] External API call made
2023-10-01T10:00:03Z [INFO] Validation completed successfully
```

---

## Manifest & Code Quality

| Command | Description |
|---------|-------------|
| `forge lint` | Check manifest for issues |
| `forge lint --fix` | Auto-fixable issues |

### Linting Examples

```bash
# Check for errors
forge lint

# Fix auto-fixable issues
forge lint --fix
```

---

## Environment Management

| Command | Description |
|---------|-------------|
| `forge env list` | List available environments |
| `forge deploy -e production` | Deploy to specific environment |

---

## Resource & Module Inspection

| Command | Description |
|---------|-------------|
| `forge display` | Show app configuration summary |
| `forge module list` | List configured modules |

---

## Complete CLI Reference

### All Available Commands

```
forge [command] [options]

Commands:
  create                Create a new Forge app
  deploy                Deploy app to environment
  install               Install app on site
  uninstall             Remove app from site
  tunnel                Start local development server
  logs                  Show app logs
  lint                  Check manifest for issues
  status                Show deployment status
  env                   Environment management
  display               Show app configuration
  module                Module inspection
  help                  Show help

Options:
  -e, --env <name>      Target environment (default: development)
  -n, --number <count>  Number of log entries to show
  --follow              Stream logs in real-time
```

---

## Common Development Workflow

### Initial Setup

```bash
# 1. Create new app
forge create my-forge-app
cd my-forge-app

# 2. Add your custom logic
vim src/index.js

# 3. Update manifest.yml with modules
vim manifest.yml

# 4. Deploy to development
forge deploy

# 5. Install on site
forge install --upgrade
```

### Ongoing Development

```bash
# 1. Make code changes
# 2. Redeploy
forge deploy

# 3. Test in browser (with tunnel running)
# 4. Check logs for errors
forge logs -n 50

# 5. Fix any issues and repeat
```

---

## Environment Variables & Secret Storage

### Using Forge's KVS API (Recommended)

For sensitive data like API keys, use Forge's Key-Value Storage:

```javascript
// Store a secret (in your resolver function)
import kvs from '@forge/kvs';
await kvs.set('MY_API_KEY', 'secret-value');

// Retrieve in your function:
const apiKey = await kvs.get('MY_API_KEY');
```

### Available KVS API Functions

Use the `@forge/kvs` module in your JavaScript code:

```javascript
import kvs from '@forge/kvs';

// Get a value
const value = await kvs.get('MY_KEY');

// Set a value
await kvs.set('MY_KEY', 'value');

// Delete a value
await kvs.delete('MY_KEY');
```

### Permissions Required

Your manifest.yml needs the appropriate permission scope:

```yaml
permissions:
  scopes:
    - read:jira-work
    - write:jira-work
```

For app-level storage in Jira, use:

```yaml
resources:
  - key: my-app-resources
    path: src/frontend/index.jsx

app:
  id: <your-app-id>
```

```yaml
permissions:
  scopes:
    - storage:app
```

---

## Next Steps

- **Permissions**: Understand what scopes are needed for your modules
- **API Endpoints**: Learn how to make REST API calls