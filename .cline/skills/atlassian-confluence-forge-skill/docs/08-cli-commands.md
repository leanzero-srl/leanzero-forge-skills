# Forge CLI Commands Reference

## Overview

The Forge CLI (`forge`) is used to develop, deploy, and manage Forge apps. Install it globally via `npm install -g @forge/cli@latest`. All commands must be run from your app's root directory (where `manifest.yml` lives).

---

## Authentication & Setup

| Command | Description |
|---------|-------------|
| `forge login` | Log in to Atlassian account (stores credentials in local keychain) |
| `forge logout` | Log out and remove credentials from local store |
| `forge whoami` | Show currently authenticated user |
| `forge --version` | Show CLI version |
| `forge settings set usage-analytics true` | Enable usage analytics collection |
| `forge settings list` | List current CLI settings |

### Authentication for CI/CD

When a keychain is unavailable (e.g., CI/CD pipelines), authenticate via environment variables:

```bash
export FORGE_EMAIL="your-email@example.com"
export FORGE_API_TOKEN="your-api-token"
```

---

## Creating a New App

| Command | Description |
|---------|-------------|
| `forge create` | Create a new Forge app (interactive prompts) |

### Create New App

```bash
# Start interactive setup — prompts for name, category, and template
forge create

# Example interactive flow:
# ? Enter a name for your app: my-confluence-app
# ? Select an Atlassian app or platform tool: Confluence
# ? Select a category: UI Kit
# ? Select a template: confluence-macro

cd my-confluence-app
```

> **Note:** `forge create` is always interactive. There is no `--template` flag — templates are selected via prompts during creation.

---

## Deployment & Installation

| Command | Description |
|---------|-------------|
| `forge deploy` | Deploy app to development environment |
| `forge deploy -e production` | Deploy to a specific environment |
| `forge deploy --verbose` | Deploy with verbose output |
| `forge install` | Install app on an Atlassian site (prompts for site) |
| `forge install --upgrade` | Upgrade installation (re-prompts for new permissions) |
| `forge install --upgrade code` | Code-only upgrade (no permission re-approval) |
| `forge uninstall` | Remove app from a site |
| `forge uninstall --batch` | Batch uninstall up to 10 installations at once |

### Deployment Flow

```bash
# Make code changes
vim src/index.js

# Deploy the app
forge deploy

# Upgrade the installation (new permissions may need approval)
forge install --upgrade

# Check logs for issues
forge logs
```

### Environment-Specific Deployment

```bash
# Deploy to production
forge deploy -e production

# or with the full flag name
forge deploy --environment production

# Install/upgrade on production site
forge install -e production --upgrade
```

---

## Local Development (Tunnel)

| Command | Description |
|---------|-------------|
| `forge tunnel` | Start local development tunnel (development env only) |
| `forge tunnel -e my-dev-env` | Tunnel in a specific development environment |
| `forge tunnel --debug` | Start tunnel with debug mode for IDE attachment |

### Using Forge Tunnel

```bash
# Start tunnel (keeps terminal open, enables hot-reloading)
forge tunnel

# For a specific development environment (useful for teams)
forge tunnel -e my-dev-environment

# For IntelliJ/VS Code debugging
forge tunnel --debug --debugFunctionHandlers index.handler --debugStartingPort 9229
```

> **Note:** `forge tunnel` only works in the `development` environment. For production testing, use `forge deploy -e production`.

---

## Log Monitoring

| Command | Description |
|---------|-------------|
| `forge logs` | View app logs |
| `forge logs --verbose` | Show logs with extended metadata |
| `forge logs --grouped` | Show logs grouped by invocation |
| `forge logs --verbose --grouped` | Combine verbose and grouped output |

### Example Log Output

```bash
$ forge logs
INFO    2024-04-02T10:00:00.192Z 10bc425b-adee-47ff-b9e9-ea3c38ab22e2 Function started: handlePageCreated
INFO    2024-04-02T10:00:01.589Z 10bc425b-adee-47ff-b9e9-ea3c38ab22e2 Page processed successfully
```

> **Note:** For advanced log querying (filtering by level, date range, pagination), use the [Export App Logs REST API](https://developer.atlassian.com/platform/forge/export-app-logs) (`GET /v1/app/logs/{appId}`).

---

## Manifest Validation (Lint)

| Command | Description |
|---------|-------------|
| `forge lint` | Check manifest.yml for errors and invalid configurations |

### Linting Examples

```bash
# Check for errors in manifest
forge lint

# Example error output:
# /Users/you/my-app/manifest.yml
# 38:11  error  Invalid 'external.fetch.client' permission...  valid-permissions-required

# Fix issues manually in manifest.yml, then deploy
forge deploy && forge install --upgrade
```

> **Note:** `forge lint` validates the manifest but does not auto-fix issues. You must correct any reported problems manually.

---

## Environment & Variable Management

| Command | Description |
|---------|-------------|
| `forge environments create` | Create a new development environment |
| `forge variables list` | List all configured environment variables |
| `forge variables set KEY value` | Set a plain-text environment variable |
| `forge variables set --encrypt KEY value` | Set an encrypted environment variable |
| `forge variables set --environment production --encrypt KEY value` | Set a variable for a specific environment |

### Managing Secrets and API Keys

Forge provides built-in encrypted variable storage — **do not use `process.env` or shell exports** for deployed apps:

```bash
# Set an encrypted variable (recommended for secrets)
forge variables set --encrypt API_KEY your-api-key-value

# Set for a specific environment
forge variables set --environment production --encrypt API_KEY your-prod-key

# List all variables
forge variables list
```

### Accessing Variables in Code

Variables set via `forge variables` are automatically available in the Forge runtime:

```javascript
// In your Forge function code — no import needed for variables
// Variables set via `forge variables set` are available automatically
// Access via process.env in the Forge runtime
const apiKey = process.env.API_KEY;
```

### Variables During Local Tunnel Development

When using `forge tunnel`, prefix variable names with `FORGE_USER_VAR_`:

```bash
# Set variable for tunnel usage
export FORGE_USER_VAR_API_KEY="your-local-dev-key"

# Start the tunnel — variable is accessible as API_KEY in code
forge tunnel
```

---

## Web Triggers

| Command | Description |
|---------|-------------|
| `forge webtrigger create` | Generate a unique URL for a web trigger |
| `forge webtrigger create --functionKey <key>` | Create trigger URL for a specific function |
| `forge webtrigger delete -i <id>` | Delete a web trigger URL by ID |

### Web Trigger Example

```bash
# Create a web trigger URL (interactive prompts for site/function)
forge webtrigger create

# Or specify the function key directly
forge webtrigger create --functionKey my-webtrigger-function

# Output: https://312d6628-3fb9-4fa1-a999-...hello.atlassian-dev.net/x0/...
```

---

## Version & Build Management

| Command | Description |
|---------|-------------|
| `forge version list` | List all major versions of your app |
| `forge build list` | List recent builds |
| `forge build list --limit 10` | Show the last 10 builds |
| `forge build list --json` | Output build list in JSON format |

---

## Storage & Entities

| Command | Description |
|---------|-------------|
| `forge storage entities indexes list -e <env>` | Check storage index status in an environment |

---

## Containers (Advanced)

| Command | Description |
|---------|-------------|
| `forge containers docker-login` | Log in to the Forge container registry |
| `forge containers delete --key <key>` | Delete a container definition |

---

## Custom Scopes (App REST APIs)

| Command | Description |
|---------|-------------|
| `forge custom-scopes create -e <env> -f <file>` | Register custom scopes from a YAML file |
| `forge custom-scopes list -e <env>` | List registered custom scopes |

---

## Complete CLI Reference

### Core Commands

```
forge [command] [options]

Commands:
  create                Create a new Forge app (interactive)
  deploy                Deploy app to an environment
  install               Install or upgrade app on a site
  uninstall             Remove app from a site
  tunnel                Start local development tunnel
  logs                  View app logs
  lint                  Validate manifest.yml

Account:
  login                 Authenticate with Atlassian
  logout                Remove stored credentials
  whoami                Show current user

Configuration:
  variables             Manage environment variables (list, set)
  environments          Manage development environments (create)
  settings              Manage CLI settings (list, set)

Advanced:
  webtrigger            Manage web trigger URLs (create, delete)
  version               App version management (list)
  build                 Build management (list)
  containers            Container management (docker-login, delete)
  custom-scopes         Manage developer-defined scopes (create, list)
  storage               Storage and entity management

Common Options:
  -e, --environment <name>   Target environment (default: development)
  --verbose                  Enable verbose output
  -h, --help                 Show help for any command
```

---

## Common Development Workflow

### Initial Setup

```bash
# 1. Create new app (interactive prompts for name, category, template)
forge create
cd my-confluence-app

# 2. Install dependencies
npm install

# 3. Add your custom logic
vim src/index.js

# 4. Update manifest.yml with modules and permissions
vim manifest.yml

# 5. Deploy to development
forge deploy

# 6. Install on site
forge install
```

### Ongoing Development

```bash
# 1. Start tunnel for hot-reloading during development
forge tunnel

# 2. Make code changes (reflected automatically via tunnel)

# 3. When ready, deploy the changes
forge deploy

# 4. Check logs for errors
forge logs --verbose --grouped

# 5. If permissions changed, upgrade installation
forge install --upgrade
```

### Promoting to Production

```bash
# 1. Deploy to staging (if configured)
forge deploy -e staging

# 2. Test on staging site

# 3. Deploy to production
forge deploy -e production

# 4. Set production-specific variables
forge variables set --environment production --encrypt API_KEY prod-key-value

# 5. Install/upgrade on production site
forge install -e production --upgrade
```

---

## Confluence-Specific Tips

### Custom UI Development

```bash
# Build the frontend (for Custom UI apps)
cd static/hello-world && npm run build && cd ../..

# Deploy and start tunnel for testing
forge deploy && forge tunnel
```

### Debugging Confluence Triggers

```bash
# Deploy with verbose output to catch issues
forge deploy --verbose

# Check logs grouped by invocation
forge logs --verbose --grouped
```

---

## Troubleshooting

### "Function not found" Error

**Cause:** Manifest references a function key that doesn't match your code exports.

```bash
# Check function keys in manifest match handler exports
grep "function:" manifest.yml
grep "export " src/index.js

# Redeploy after fixing
forge deploy --verbose
```

### "Permission denied" / Scope Error

**Cause:** Missing OAuth scope for the API you're calling.

```bash
# Run lint to identify missing scopes
forge lint

# Manually add required scopes to manifest.yml under permissions.scopes
# Then redeploy and upgrade
forge deploy && forge install --upgrade
```

### "Resource not found" Error

**Cause:** Custom UI build folder missing or resource path incorrect in manifest.

```bash
# Check if build folder exists (for Custom UI apps)
ls -la static/*/build/

# Rebuild frontend if needed
cd static/hello-world && npm run build && cd ../..

# Redeploy
forge deploy
```

### Tunnel Not Working

**Cause:** Tunnel only works in `development` environment.

```bash
# Ensure you're targeting development
forge tunnel

# If using a custom dev environment
forge tunnel -e my-dev-environment

# Check you're logged in
forge whoami
```

---

## Next Steps

- **[Environments & Versions](https://developer.atlassian.com/platform/forge/environments-and-versions)**: Manage environments and app versioning
- **[Debugging](https://developer.atlassian.com/platform/forge/debugging)**: Detailed debugging strategies
- **[CLI Reference](https://developer.atlassian.com/platform/forge/cli-reference/)**: Full official CLI documentation
- **[Export App Logs](https://developer.atlassian.com/platform/forge/export-app-logs)**: REST API for advanced log querying
