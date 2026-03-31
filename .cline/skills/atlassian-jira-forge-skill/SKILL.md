---
name: atlassian-jira-forge-skill
description: Atlassian Jira Forge app development. Use when creating workflow validators, conditions, post-functions, custom UIs for workflow rules, or integrating with Jira REST APIs from a Forge app.
---

# Atlassian Jira Forge Development

This skill provides comprehensive documentation for building Forge apps that extend Jira.

## When to Use This Skill

- Creating workflow validators (validate fields before transition completes)
- Creating workflow conditions (control transition visibility)
- Creating workflow post-functions (execute logic after transition)
- Building custom UIs for workflow rule configuration
- Making Jira REST API calls from a Forge app
- Setting up scheduled triggers and automation actions
- Configuring dashboard widgets
- Implementing merge checks for Bitbucket

## Quick Reference

| Task | Module Type | Function/Expression |
|------|-------------|---------------------|
| Validate issue fields before transition | `jira:workflowValidator` | `function` or `expression` |
| Control transition visibility | `jira:workflowCondition` | `function` or `expression` |
| Execute logic after successful transition | `jira:workflowPostFunction` | `function` |
| Build configuration UI | Custom React UI with @forge/bridge | N/A |
| Run scheduled tasks | `scheduledTrigger` | `function` |
| Create automation actions | `action` | `function` |

---

## Core Concepts

### What is Forge?

Forge is Atlassian's serverless platform for building apps that extend Jira, Confluence, Bitbucket, and Jira Service Management. Apps run in a secure environment on Atlassian infrastructure.

### Key Components

| Component | Description |
|-----------|-------------|
| **Module** | A capability (e.g., workflow validator, macro) declared in manifest.yml |
| **Function** | The code that executes when a module is triggered |
| **Resource** | Static assets for Custom UI (HTML/CSS/JS/JSX) |
| **Resolver** | Bridge between frontend UI and backend functions |

### App Manifest (`manifest.yml`)

The central configuration file defining modules, resources, permissions, and runtime settings.

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

permissions:
  scopes:
    - read:jira-work
    - storage:app

app:
  runtime:
    name: nodejs22.x
  id: ari:cloud:ecosystem::app/YOUR-APP-ID
```

### Context Object

Every function receives two arguments:

```javascript
export const handler = async (payload, context) => {
  // payload: Module-specific data
  // context: Execution environment information
  
  console.log(context.installContext);
  console.log(context.accountId);
  console.log(context.workspaceId);
  
  return { result: true };
};
```

---

## Workflow Validators

### Module Configuration

```yaml
modules:
  jira:workflowValidator:
    - key: ai-content-validator
      name: AI Content Validator
      description: Validates content using AI
      function: validateContent
      errorMessage: "Field validation failed"
      
      create:
        resource: config-ui
```

### Function Implementation

```javascript
export const validateContent = async (args) => {
  const { issue, configuration } = args;
  
  // Configuration contains user's settings
  const fieldId = configuration.fieldId || 'description';
  
  // Validate and return result
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

### Response Format

- **Allow transition**: `return { result: true };`
- **Block transition**: `return { result: false, errorMessage: "..." };`

### Permissions Required

```yaml
permissions:
  scopes:
    - read:jira-work       # View issue data
    - read:workflow:jira   # Access workflow info
```

---

## Workflow Conditions

**Key Difference from Validators**: Conditions control UI visibility (hide/show transitions), while validators block transitions after validation.

### Module Configuration

```yaml
modules:
  jira:workflowCondition:
    - key: licensing-condition
      name: Licensing Check Condition
      description: Only show if app license is active
      function: checkLicense
      
      create:
        resource: config-ui
```

### Function Implementation

```javascript
export const checkLicense = async (args) => {
  const { configuration, context } = args;
  
  // Check license status
  const isActive = context.license?.isActive === true;
  
  return { result: isActive };  // true=show, false=hide
};
```

---

## Workflow Post Functions

**Key Difference**: Post functions execute AFTER the transition completes (unlike validators/conditions).

### Module Configuration

```yaml
modules:
  jira:workflowPostFunction:
    - key: ai-summary-enhancer
      name: AI Summary Enhancer
      description: Enhances issue summary using AI
      function: enhanceSummary
      
      create:
        resource: config-ui
```

### Function Implementation

```javascript
import api, { route } from '@forge/api';

export const enhanceSummary = async (args) => {
  const { issue, configuration } = args;
  
  try {
    // Make Jira API calls with proper auth
    await api.asApp().requestJira(route`/rest/api/3/issue/${issue.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { summary: "Enhanced" } })
    });
    
    return { result: true };
  } catch (error) {
    console.error('Error:', error);
    return { result: false, errorMessage: error.message };
  }
};
```

### Response Format

- **Continue workflow**: `return { result: true };`
- **Log but don't block**: `return { result: false, warnings: [...] };`

---

## Scheduled Triggers

Scheduled triggers execute your function at regular intervals (fiveMinute, hour, day, week).

### Manifest Configuration

```yaml
modules:
  scheduledTrigger:
    - key: daily-report-trigger
      name: { value: 'Daily Report Generator' }
      description: { value: 'Generates and sends daily activity report' }
      function: dailyReportFunction
      schedule:
        period: day
        time: '09:00'
```

### Function Implementation

```javascript
export const dailyReportFunction = async (event, context) => {
  console.log('Scheduled trigger executed:', event);
  
  // Get execution metadata
  const { scheduledTrigger } = event;
  console.log(`Running at: ${scheduledTrigger.timestamp}`);
  console.log(`Schedule period: ${scheduledTrigger.period}`);
  
  try {
    // Your scheduled logic here
    await generateAndSendReport();
    
    return {
      status: 'success',
      message: 'Daily report generated successfully'
    };
  } catch (error) {
    console.error('Error in scheduled trigger:', error);
    throw error;
  }
};

const generateAndSendReport = async () => {
  // Example: Get issues created today
  const response = await api.asApp().requestJira('/rest/api/3/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jql: 'created >= startOfDay()',
      maxResults: 50
    })
  });
  
  const data = await response.json();
  // Process and send report...
};
```

### Multiple Schedule Intervals

```yaml
modules:
  scheduledTrigger:
    - key: hourly-check-trigger
      name: { value: 'Hourly Service Check' }
      function: hourlyCheckFunction
      schedule:
        period: hour
        
    - key: daily-summary-trigger  
      name: { value: 'Daily Summary Email' }
      function: dailySummaryFunction
      schedule:
        period: day
        time: '09:00'
        
    - key: weekly-report-trigger
      name: { value: 'Weekly Analytics Report' }
      function: weeklyReportFunction
      schedule:
        period: week
        dayOfWeek: MONDAY
        time: '10:00'
```

### Accessing Execution Context

```javascript
export const myScheduledFunction = async (event, context) => {
  // Scheduled trigger information
  const { timestamp, period, dayOfWeek, time } = event.scheduledTrigger;
  
  console.log(`Execution time: ${timestamp}`);
  console.log(`Schedule: Every ${period} at ${time}`);
  
  // Context contains app information
  const { cloudId, moduleKey } = context;
  return { status: 'processed' };
};
```

---

## Automation Actions

Automation actions appear in Jira's automation rule builder and can perform custom logic when triggered.

### Module Configuration

```yaml
modules:
  action:
    - key: custom-issue-update-action
      name: { value: 'Custom Issue Update' }
      description: { value: 'Performs custom issue update logic' }
      function: customIssueUpdateFunction
```

### Function Implementation

```javascript
export const customIssueUpdateFunction = async (payload, context) => {
  console.log('Automation action triggered:', JSON.stringify(payload, null, 2));
  
  // Extract information from the payload
  const { issue } = payload;
  const { id: issueId, key, fields } = issue;
  
  console.log(`Processing issue: ${key}`);
  
  try {
    await performCustomUpdate(issue);
    
    return {
      status: 'success',
      message: `Updated issue ${key} successfully`,
      data: { issueKey: key }
    };
  } catch (error) {
    console.error('Error in automation action:', error);
    throw error;
  }
};

const performCustomUpdate = async (issue) => {
  await api.asApp().requestJira(`/rest/api/3/issue/${issue.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      update: {
        summary: [{ set: `Auto-updated: ${issue.fields.summary}` }]
      }
    })
  });
};
```

### Multiple Actions Configuration

```yaml
modules:
  action:
    - key: custom-status-update-action
      name: { value: 'Update Issue Status' }
      description: { value: 'Updates issue status based on conditions' }
      function: updateStatusAction
      
    - key: custom-comment-add-action
      name: { value: 'Add Comment with Template' }
      description: { value: 'Adds a templated comment to the issue' }
      function: addCommentAction
```

### Common Use Cases

1. **Sync with External System** - Send issue data to external CRM
2. **Send Email Notification** - Notify team members of important issues
3. **Update Custom Fields** - Automatically set computed field values

---

## Event Filters with Jira Expressions

Event filters enable selective event handling using Jira expressions.

### Filter by Project

```yaml
modules:
  trigger:
    - key: project-specific-trigger
      events:
        - avi:jira:created:issue
      filter: issue.fields.project.key == 'PROJ'
      function: handleProjectIssues
```

### Filter by Issue Type

```yaml
modules:
  trigger:
    - key: bug-only-trigger
      events:
        - avi:jira:created:issue
      filter: issue.fields.issuetype.name == 'Bug'
      function: handleBugs
```

### Complex Filters

```yaml
modules:
  trigger:
    - key: complex-filter-trigger
      events:
        - avi:jira:created:issue
      filter: |
        (issue.fields.project.key == 'PROJ') 
        && (issue.fields.issuetype.name in ['Bug', 'Task'])
        && (issue.fields.priority.name in ['Highest', 'High'])
      function: handleHighPriorityIssuesInProject
```

### Available Expression Functions

| Function | Description | Example |
|----------|-------------|---------|
| `contains(text, substring)` | Check if string contains substring | `contains(issue.fields.summary, 'error')` |
| `startsWith(text, prefix)` | Check if string starts with prefix | `startsWith(issue.fields.summary, '[BUG]')` |
| `greaterThan(a, b)` | Check if a > b | `greaterThan( issue.fields.comment.commentsSize, 5)` |

---

## Dashboard Widgets

Dashboard widgets display custom content on Jira dashboards.

### Manifest Configuration

```yaml
modules:
  dashboard-background-script:
    - key: custom-stats-widget
      name: { value: 'Custom Statistics' }
      description: { value: 'Displays custom statistics on the dashboard' }
      function: customStatsFunction
      requiresContext: true
```

### Function Implementation

```javascript
export const customStatsFunction = async (payload, context) => {
  try {
    // Get context data if available
    const { dashboard } = payload;
    
    // Fetch data for the widget
    const statsData = await fetchStatistics(dashboard);
    
    return {
      statusCode: 200,
      body: {
        title: 'My Statistics',
        content: renderWidgetContent(statsData),
        link: {
          url: `/browse/${statsData.projectKey}`,
          text: 'View all issues'
        }
      }
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: {
        title: 'Statistics',
        content: `<p>Error loading data: ${error.message}</p>`,
        link: null
      }
    };
  }
};
```

### Common Use Cases

1. **Project Health Dashboard** - Display project metrics and status
2. **My Tasks Widget** - Show pending tasks for the current user
3. **Team Activity Stats** - Display recent team activity

---

## Bitbucket Merge Checks

Merge checks validate pull requests before merging.

### Module Configuration

```yaml
modules:
  bitbucket:mergeCheck:
    - key: require-approvals-check
      name: { value: 'Require Review Approvals' }
      description: { value: 'Ensures pull request has required approvals' }
      function: requireApprovalsFunction
```

### Function Implementation

```javascript
export const requireApprovalsFunction = async (payload, context) => {
  // Extract information from the payload
  const { pullRequest } = payload;
  
  try {
    // Check if PR has required approvals
    const hasRequiredApprovals = await checkApprovalStatus(pullRequest);
    
    if (hasRequiredApprovals) {
      return {
        status: 'success',
        name: { value: 'Required Approvals' },
        description: { value: 'All required approvals are in place' }
      };
    }
    
    return {
      status: 'failure',
      name: { value: 'Missing Approvals' },
      description: { 
        value: 'This PR needs at least 2 reviewer approvals before merging'
      }
    };
  } catch (error) {
    console.error('Merge check error:', error);
    throw error;
  }
};
```

### Common Use Cases

1. **Test Coverage Check** - Ensure minimum test coverage
2. **Branch Naming Convention** - Enforce branch naming patterns
3. **Pull Request Size Limit** - Limit PR size for code review efficiency

---

## Confluence Content Properties

Content properties allow you to store structured data associated with pages and blog posts.

### Storing Content Properties

```javascript
export const createContentProperty = async (contentId, propertyKey, value) => {
  try {
    await api.asApp().requestJira(`/wiki/rest/api/content/${contentId}/property/${propertyKey}`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        value: value
      })
    });
    
    return { status: 'success', propertyKey };
  } catch (error) {
    console.error('Error creating property:', error);
    throw error;
  }
};
```

### Retrieving Content Properties

```javascript
export const getContentProperty = async (contentId, propertyKey) => {
  try {
    const response = await api.asApp().requestJira(
      `/wiki/rest/api/content/${contentId}/property/${propertyKey}`
    );
    
    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`HTTP ${response.status}`);
    }
    
    const property = await response.json();
    return property;
  } catch (error) {
    console.error('Error retrieving property:', error);
    throw error;
  }
};
```

### Updating Content Properties

```javascript
export const updateContentProperty = async (contentId, propertyKey, newValue) => {
  let existingProperty = await getContentProperty(contentId, propertyKey);
  
  if (!existingProperty) {
    throw new Error(`Property "${propertyKey}" doesn't exist`);
  }
  
  await api.asApp().requestJira(
    `/wiki/rest/api/content/${contentId}/property/${propertyKey}`,
    {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        value: newValue,
        version: {
          number: existingProperty.version.number + 1
        }
      })
    }
  );
  
  return { status: 'success', propertyKey };
};
```

### Common Use Cases

1. **Issue-Page Linking System** - Link Confluence pages to Jira issues
2. **Custom Metadata Storage** - Store custom metadata with pages
3. **Form Data Storage** - Collect and store form submissions on pages

---

## Events & Payloads

### Validator/Condition Trigger Payload

```json
{
  "issue": {
    "id": "12345",
    "key": "PROJ-123",
    "fields": { ... }
  },
  "transition": {
    "id": "11",
    "name": "In Progress"
  },
  "workflow": { ... },
  "configuration": { ... }
}
```

### Post Function Trigger Payload

Includes `changelog` array showing what changed:

```json
{
  "changelog": [{
    "field": "status",
    "from": "To Do (1)",
    "to": "In Progress (2)"
  }]
}
```

---

## API Endpoints Reference

### @forge/api - Making REST Calls

```javascript
import api, { route } from '@forge/api';

// GET request
const response = await api.asApp().requestJira(route`/rest/api/3/issue/${issueKey}`);
const data = await response.json();

// POST request with body
await api.asApp().requestJira(route`/rest/api/3/issue`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ fields: { summary: "New" } })
});

// Query parameters using URLSearchParams
const params = new URLSearchParams({
  fields: 'summary,description,status',
  expand: 'changelog'
});
await api.asApp().requestJira(route`/rest/api/3/issue/${issueKey}?${params}`);
```

### Common Jira REST API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/rest/api/3/issue/{id}` | Get issue details |
| PUT | `/rest/api/3/issue/{id}` | Update issue fields |
| POST | `/rest/api/3/issue` | Create new issue |
| POST | `/rest/api/3/issue/bulk` | Bulk create issues |
| POST | `/rest/api/3/issue/{id}/transitions` | Execute transition |
| GET | `/rest/api/3/project/{key}` | Get project details |
| GET | `/rest/api/3/search` | Search issues with JQL |

### Confluence REST API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/wiki/rest/api/content/{id}` | Get page content |
| PUT | `/wiki/rest/api/content/{id}` | Update page content |
| POST | `/wiki/rest/api/content` | Create new page |
| GET | `/wiki/rest/api/space` | List spaces |
| DELETE | `/wiki/rest/api/content/{id}` | Delete page |

### Available Scopes

| Scope | Description |
|-------|-------------|
| `read:jira-work` | View issues, projects, workflows |
| `write:jira-work` | Create/update/delete issues |
| `read:workflow:jira` | Read workflow configurations |
| `storage:app` | Access Forge KVS storage |

---

## Permissions & Scopes

### Required Permission Structure

```yaml
permissions:
  scopes:
    - read:jira-work
    - write:jira-work      # For post functions that modify issues
    - read:workflow:jira
    - read:user:jira       # For user/group checks
    
  external:
    fetch:
      backend:
        - "api.openai.com"   # External API domains
```

---

## CLI Commands Reference

| Command | Purpose |
|---------|---------|
| `forge init` | Create new app |
| `forge deploy` | Deploy to development site |
| `forge install --upgrade` | Install/update on site |
| `forge tunnel` | Local testing with live environment |
| `forge logs -n 50` | View last 50 log entries |
| `forge lint` | Check manifest/code for issues |

### Development Workflow

```bash
# Initialize new app
forge init my-app
cd my-app

# Deploy to development
forge deploy

# Install on site
forge install --upgrade -e development

# Test locally with tunnel
forge tunnel
```

---

## UI Configuration Bridge

For workflow rules, use the Jira bridge for custom configuration:

```javascript
import { workflowRules } from '@forge/jira-bridge';

const onConfigureFn = async () => {
  const fieldId = document.getElementById('field-select').value;
  const prompt = document.getElementById('prompt-input').value;
  
  return JSON.stringify({
    fieldId,
    prompt,
    enabled: true
  });
};

await workflowRules.onConfigure(onConfigureFn);
```

---

## Best Practices for API Calls

1. **Use `api.asApp()`** when making calls from within a workflow context (no user session)
2. **Use `api.asUser()`** when you need to preserve the current user's permissions
3. **Batch operations** whenever possible - bulk endpoints reduce API call count
4. **Handle rate limits** - Jira Cloud typically allows 5 requests per second
5. **Paginate results** using `startAt` and `maxResults` parameters for large datasets

---

## Advanced Documentation

The `.cline/skills/atlassian-jira-forge-skill/docs/` directory contains detailed documentation on each topic:

| Topic | File |
|-------|------|
| Core Concepts | `docs/01-core-concepts.md` |
| Workflow Validators | `docs/02-workflow-validators.md` |
| Workflow Conditions | `docs/03-workflow-conditions.md` |
| Workflow Post Functions | `docs/04-workflow-post-functions.md` |
| Events & Payloads | `docs/05-events-payloads.md` |
| API Endpoints (Enhanced) | `docs/06-api-endpoints-enhanced.md` |
| Permissions & Scopes | `docs/07-permissions-scopes.md` |
| CLI Commands | `docs/08-cli-commands.md` |
| Scheduled Triggers | `docs/09-scheduled-triggers.md` |
| Automation Actions | `docs/10-automation-actions.md` |
| Event Filters | `docs/11-event-filters.md` |
| Dashboard Widgets | `docs/12-dashboard-widgets.md` |
| Bitbucket Merge Checks | `docs/13-merge-checks.md` |
| Confluence Content Properties | `docs/14-content-properties.md` |

---

## Troubleshooting

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| "Function not found" | Function key mismatch in manifest.yml | Check function references match |
| "Permission denied" | Missing scopes in manifest.yml | Add required scope to permissions.scopes |
| "Expression evaluation failed" | Invalid Jira expression syntax | Test expressions in workflow editor |

### Debugging

1. Use `console.log()` for debugging
2. View logs with `forge logs -n 50`
3. Test locally with `forge tunnel`

---

## Quick Comparison: Validators vs Conditions vs Post Functions

| Aspect | Validator | Condition | Post Function |
|--------|-----------|-----------|---------------|
| **When it runs** | Before transition completes | Before UI renders | After transition completes |
| **Purpose** | Validate data before completion | Hide/show transitions in UI | Execute logic after success |
| **Failure behavior** | Transition blocked, error shown | Transition hidden from user | Error logged, workflow continues |

---

## Additional API Resources

The `forge-skill/` directory contains additional detailed documentation:

- **api-endpoints/jira-rest-api.md** - Comprehensive Jira REST API v3 reference
- **api-endpoints/jira-rest-api-v2.md** - Jira REST API v2 endpoints (legacy)
- **api-endpoints/confluence-rest-api.md** - Confluence REST API v3 reference
- **api-endpoints/confluence-rest-api-v2.md** - Confluence REST API v2 endpoints (legacy)
- **api-endpoints/bitbucket-rest-api.md** - Bitbucket Cloud REST API