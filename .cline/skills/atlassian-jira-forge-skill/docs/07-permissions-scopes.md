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
| `read:project` | Read project data and metadata |
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

### Workflow Validator App

```yaml
permissions:
  scopes:
    - read:jira-work
    - read:workflow:jira
    - read:user:jira      # For user/group checks
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


## Permissions by Module Type

This section maps Forge module types to their required permission scopes.

| Module Type | Read Scopes | Write Scopes | Notes |
|-------------|-------------|--------------|-------|
| `jira:workflowValidator` | `read:jira-work`, `read:workflow:jira`, `read:user:jira` | - | Validates before transition completes |
| `jira:workflowCondition` | `read:jira-work`, `read:workflow:jira` | - | Controls transition visibility in UI |
| `jira:workflowPostFunction` | `read:jira-work` | `write:jira-work` | Executes after successful transition |
| `jira:issueTabPanel` | `read:jira-work`, `read:user:jira` | - | Custom issue tab panel |
| `jira:jiraIssueProperties` | `storage:app` | `storage:app` | Issue properties module |
| `scheduledTrigger` | `read:jira-work` | `write:jira-work` | Runs on schedule (hourly/daily/weekly) |
| `action` | `read:jira-work`, `read:user:jira` | `write:jira-work` | Automation action module |
| `jira:dashboardWidget` | `read:jira-work` | - | Dashboard widget module |
| `jira:mergeCheck` | `read:repository:bitbucket`, `read:pullrequest:bitbucket` | - | Bitbucket merge check module |
| `jira:contentProperty` | `storage:app` | `storage:app` | Confluence content properties |

### Common Scope Combinations by Use Case

**Workflow Validator App:**
```yaml
permissions:
  scopes:
    - read:jira-work       # View issues and workflows
    - read:workflow:jira   # Access workflow configurations
    - read:user:jira       # For user/group checks in validation rules
```

**Issue Tab Panel App:**
```yaml
permissions:
  scopes:
    - read:jira-work       # View issue data for tab content
    - read:user:jira       # Read user information
```

**Issue Properties (KVS) App:**
```yaml
permissions:
  scopes:
    - storage:app          # Store custom properties on issues
```

**Scheduled Trigger App:**
```yaml
permissions:
  scopes:
    - read:jira-work       # Read issue data for scheduled operations
    - write:jira-work      # Update issues based on schedule logic
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
    - read:project
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