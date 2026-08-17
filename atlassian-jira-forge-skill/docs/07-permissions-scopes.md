# Forge Permissions & Scopes Reference

## Overview

Forge apps request permissions (scopes) in `manifest.yml` to access Atlassian product APIs. Each scope grants specific read/write capabilities.

---

## Scope Categories

| Category | Description |
|----------|-------------|
| **Jira Scopes** | Access Jira issues, workflows, projects, users |
| **Bitbucket Scopes** | Access Bitbucket repositories, PRs |
| **Confluence Scopes** | Access Confluence pages, spaces |
| **Storage Scopes** | Access Forge KVS storage |
| **External Fetch** | Allow outbound HTTP requests |

---

## Jira Permissions

### Basic Read Operations

| Scope | Description |
|-------|-------------|
| `read:jira-work` | View issues, projects, workflows, statuses |
| `read:project:jira` | Read project data and metadata |
| `read:workflow:jira` | Access workflow configurations |
| `read:user:jira` | Read user information (accounts, groups) |

### Issue-Specific Operations

| Scope | Description |
|-------|-------------|
| `read:issue:jira` | View issue details and comments |
| `read:issuetype:jira` | Read issue types hierarchy |
| `read:status:jira` | Access status definitions |
| `read:priority:jira` | Read priority definitions |

### Write Operations

| Scope | Description |
|-------|-------------|
| `write:jira-work` | Create/update/delete issues |
| `write:issue:jira` | Issue field modifications |
| `write:project:jira` | Project configuration changes |

### Admin Operations

| Scope | Description |
|-------|-------------|
| `read:jira-admin` | View admin settings (enterprise) |
| `write:jira-admin` | Modify admin settings |

---

## Bitbucket Permissions

| Scope | Description |
|-------|-------------|
| `read:repository:bitbucket` | Read repository details |
| `write:repository:bitbucket` | Modify repositories |
| `read:pullrequest:bitbucket` | Access pull requests |
| `write:pullrequest:bitbucket` | Create/update PRs |

---

## Confluence Permissions

| Scope | Description |
|-------|-------------|
| `read:confluence-content` | View pages, spaces, comments |
| `write:confluence-content` | Create/update content |
| `read:confluence-configuration` | Read space settings |

---

## Storage Permissions

| Scope | Description |
|-------|-------------|
| `storage:app` | Access Forge KVS for data persistence |

---

## External Fetch Configuration

For calling external APIs from your functions:

```yaml
permissions:
  external:
    fetch:
      backend:
        - "api.openai.com"
        - "your-api.example.com"
```

### Request Body Example (from manifest)

The above configuration allows your function to make requests to these domains.

---

## Common Scope Combinations

### Basic Issue Reading App

```yaml
permissions:
  scopes:
    - read:jira-work      # View issues and projects
    - read:workflow:jira  # Access workflow info
```

### Issue Creation/Update App

```yaml
permissions:
  scopes:
    - read:jira-work      # View existing data
    - write:jira-work     # Create/update issues
    - storage:app         # Persist configuration
```

### External API Integration App

```yaml
permissions:
  scopes:
    - read:jira-work
    - write:jira-work
    
  external:
    fetch:
      backend:
        - "api.yourservice.com"
```

---

## Permissions by Module Type

This section maps Forge module types to their required permission scopes.

| Module Type | Read Scopes | Write Scopes | Notes |
|-------------|-------------|--------------|-------|
| `trigger` | Varies by event type | - | Responds to events like `issue_created` |
| `scheduledTriggers` | `read:jira-work` | `write:jira-work` | Runs on schedule (hourly/daily/weekly) |
| `jira:workflowPostFunction` | `read:jira-work` | `write:jira-work` | Executes after a successful transition |
| `jira:dashboardWidget` | `read:jira-work` | - | Dashboard widget module |

**Important Notes:**

1. **Workflow Rules**: In Forge, workflow logic is implemented via specific modules:
   - `jira:workflowValidator`: Runs before transition (uses Jira expressions).
   - `jira:workflowCondition`: Controls transition visibility (uses Jira expressions).
   - `jira:workflowPostFunction`: Runs after successful transition.

2. **Scope requirements for Workflow Modules**:
   - **Validators/Conditions**: Typically only require `read` scopes unless the expression logic itself requires advanced permissions (rare).
   - **Post Functions**: Almost always require `write:jira-work` to perform actions like updating fields or creating sub-tasks.

### Common Scope Combinations by Use Case

**Issue Trigger App:**
```yaml
permissions:
  scopes:
    - read:jira-work       # View issues and projects
    - storage:app          # Store configuration/state
```

**Workflow Post-Function App:**
```yaml
permissions:
  scopes:
    - read:jira-work       # Read issue context
    - write:jira-work      # Perform updates after transition
    - storage:app          # Persist state/logs
```

**Scheduled Trigger App:**
```yaml
permissions:
  scopes:
    - read:jira-work       # Read issue data for scheduled operations
    - write:jira-work      # Update issues based on schedule logic
    - storage:app          # Store last run timestamp/state
```

### Scope Prefix Reference

| Prefix | Purpose |
|--------|---------|
| `read:jira-work` | View issues, projects, workflows |
| `write:jira-work` | Create/update/delete issues |
| `storage:app` | Forge Key-Value Storage (KVS) |

## Granting Permissions During Development

When you first deploy or update permissions:

1. **Deploy the app:**
   ```bash
   forge deploy
   ```

2. **Upgrade the installation:**
   ```bash
   forge install --upgrade
   ```

3. **Accept new permissions** in the Atlassian admin console (if prompted)

---

## Debugging Permission Errors

### Common Error Messages

| Error | Cause | Solution |
|-------|-------|----------|
| `403 Forbidden` | Missing required scope | Add scope to manifest.yml |
| `401 Unauthorized` | Invalid authentication | Check app installation |
| `Scope missing: storage:app` | KVS access without permission | Add `storage:app` scope |

### Checking Current Permissions

```bash
forge list
# Shows installed apps and their permissions
```

---

## Permission Best Practices

1. **Request Minimum Scopes**: Only ask for what you need
2. **Document Scope Usage**: Comment in manifest why each scope is needed
3. **Test Thoroughly**: Verify all API calls work with granted scopes
4. **Handle Scope Changes**: Update documentation when adding/removing scopes

---

## Manifest Example

```yaml
# Full permissions example
permissions:
  scopes:
    # Read operations
    - read:jira-work
    - read:project:jira
    - read:workflow:jira
    - read:user:jira
    
    # Write operations
    - write:jira-work
    
    # Storage
    - storage:app
  
  external:
    fetch:
      backend:
        - "api.openai.com"
        - "your-webhook.example.com"
```

---

## Related Documentation

- **Permissions by Module Type**: See individual module docs for scope requirements
- **API Endpoints**: Each API requires specific scopes to function

**Note on Forge Module Types**: Forge apps use trigger modules (`scheduledTriggers`, `trigger`) rather than workflow-specific module types. Workflow validation, conditions, and post functions are handled via Jira expressions configured in the Jira UI or Management API.

## Classic and granular scopes DO coexist in one manifest

The internet says otherwise and it is wrong. Verified two ways: against three
shipped apps in one account (`lz-ppm-forge`, `se-ppm-forge`, `CogniRunner`, all
declaring `read:jira-work` alongside `read:project:jira` and
`write:sprint:jira-software`), and by linting a fourth that mixes them. Scopes
are **additive**: there is no migration, no rewrite, and no 403 sweep.

This matters because **Jira Software exposes only granular scopes** — there is
no classic equivalent for boards and sprints — so any app that wants agile
features and already uses classic scopes has to mix them.

```yaml
permissions:
  scopes:
    read:jira-work:                  # classic
      allowImpersonation: true
    read:board-scope:jira-software:  # granular, alongside it
      allowImpersonation: true
    write:sprint:jira-software:
      allowImpersonation: true
```

### `allowImpersonation` is required for anything an ASYNC CONSUMER calls
Not just scheduled triggers. A consumer running `api.asUser(accountId)` **is**
offline impersonation, and without the flag the call fails at runtime with an
authorization error that looks like a user-permission problem.

It is accepted on `*:jira-software` scopes in the **map** form —
`forge lint` passes — which had no public precedent I could find.

### Agile scope pairs

| Operation | Scopes |
| --- | --- |
| List boards, read a board's backlog | `read:board-scope:jira-software` |
| List / create / update sprints | `read:sprint:jira-software`, `write:sprint:jira-software` |
| Move issues into a sprint or backlog | `write:issue:jira-software` |
| Rank issues | `write:board-scope:jira-software` |
| Co-requisites the agile endpoints list | `read:project:jira`, `read:issue-details:jira`, `read:jql:jira` |

`read:epic:jira-software` is **not** needed — an epic's children come from JQL
`parent = KEY` at zero scope cost.

### Adding ANY scope is a major version, and Rolling Releases ships the code first
`forge deploy` refuses until you pass `--approve MAJOR_VERSION_RULE`, and every
install then shows **"Outdated app"** until an admin approves it in
*Apps → Manage apps*. `forge install --upgrade` from the CLI fails with
*"Principal has insufficient permissions"* unless your account can approve on
that site.

So between deploy and approval there is a window — days, on a real customer —
where the new code runs with the OLD scopes. Anything using a new scope must
degrade into a sentence a user can act on. A 403 there means *"the app's update
is unapproved"*, not *"you lack permission"*: completely different problems,
completely different fixes, and the status code cannot tell them apart.

The pattern that works: probe once, cache the answer, and **omit the affected
tools entirely** rather than offering ones that can only fail.

```js
// Cache success for a day; cache FAILURE for ten minutes — a "no" becomes a
// "yes" the moment an admin approves, and nobody should wait a day to notice.
const OK_TTL_MS = 24 * 60 * 60 * 1000;
const FAIL_TTL_MS = 10 * 60 * 1000;
```
