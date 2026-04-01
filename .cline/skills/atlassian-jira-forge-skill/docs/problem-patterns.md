# Common Problem Patterns for Jira Forge

This document provides copy-paste ready solutions for common development scenarios.

---

## 1. Build a Dropdown That Fetches Projects

### Manifest Configuration

```yaml
modules:
  jira:workflowValidator:
    - key: project-based-validator
      name: Project-Based Validator
      description: Validates based on project context
      function: validateByProject
      
      create:
        resource: config-ui
```

### UI Component (src/Configure.js)

```javascript
import React, { useState, useEffect } from 'react';
import { Form, Select, Loader } from '@forge/bridge';

export const Configure = () => {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState('');

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const response = await bridge.requestJira('/rest/api/3/project');
      const data = await response.json();
      
      setProjects(data.map(p => ({
        label: `${p.key} - ${p.name}`,
        value: p.id
      })));
      
      setLoading(false);
    } catch (error) {
      console.error('Error fetching projects:', error);
      setLoading(false);
    }
  };

  return (
    <Form>
      {loading && <Loader />}
      
      <Select
        label="Select Project"
        options={projects}
        value={selectedProject}
        onChange={(e) => setSelectedProject(e.target.value)}
      />
    </Form>
  );
};
```

### Validator Function (src/index.js)

```javascript
export const validateByProject = async (args) => {
  const { issue, configuration } = args;
  
  // Get selected project from configuration
  const projectId = configuration.projectId;
  
  // Only validate if issue belongs to selected project
  if (issue.fields.project.id !== projectId) {
    return { result: true }; // Skip validation for other projects
  }
  
  // Apply your validation logic here
  const description = issue.fields.description || '';
  
  if (description.length < 20) {
    return { 
      result: false, 
      errorMessage: "Description must be at least 20 characters" 
    };
  }
  
  return { result: true };
};
```

---

## 2. Validate Custom Fields Against External API

### Manifest Configuration

```yaml
modules:
  jira:workflowValidator:
    - key: external-validation-validator
      name: External Validation Validator
      description: Validates against external service
      function: validateExternal
      
      create:
        resource: config-ui

permissions:
  scopes:
    - read:jira-work
  external:
    fetch:
      backend:
        - "api.example.com"
```

### Function with External API Call

```javascript
import api, { route } from '@forge/api';

export const validateExternal = async (args) => {
  const { issue, configuration } = args;
  
  // Get field value to validate
  const fieldValue = issue.fields[configuration.fieldId];
  
  if (!fieldValue) {
    return { result: true }; // Skip empty fields
  }
  
  try {
    // Call external API for validation
    const response = await api.asApp().requestJira(
      route`https://api.example.com/validate?value=${encodeURIComponent(fieldValue)}`
    );
    
    if (!response.ok) {
      console.error('External validation failed:', await response.text());
      return { 
        result: false, 
        errorMessage: "External validation service unavailable" 
      };
    }
    
    const result = await response.json();
    
    if (result.valid) {
      return { result: true };
    } else {
      return { 
        result: false, 
        errorMessage: result.errorMessage || "Validation failed" 
      };
    }
  } catch (error) {
    console.error('Error during external validation:', error);
    return { 
      result: false, 
      errorMessage: "Error contacting validation service" 
    };
  }
};
```

### Configuration UI

```javascript
import React, { useState, useEffect } from 'react';
import { Form, Select, FieldText, ButtonGroup, Button } from '@forge/bridge';

export const Configure = () => {
  const [fields, setFields] = useState([]);
  const [fieldId, setFieldId] = useState('');
  const [apiKey, setApiKey] = useState('');

  useEffect(() => {
    fetchCustomFields();
  }, []);

  const fetchCustomFields = async () => {
    try {
      // Get all fields from Jira
      const response = await bridge.requestJira('/rest/api/3/field');
      const data = await response.json();
      
      setFields(data.map(f => ({
        label: f.name,
        value: f.id
      })));
    } catch (error) {
      console.error('Error fetching fields:', error);
    }
  };

  return (
    <Form>
      <Select
        label="Field to Validate"
        options={fields}
        value={fieldId}
        onChange={(e) => setFieldId(e.target.value)}
      />
      
      <FieldText
        label="API Key (optional)"
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
      />
    </Form>
  );
};
```

---

## 3. Sync Jira Issues with External System

### Scheduled Trigger for Sync

```yaml
modules:
  scheduledTrigger:
    - key: sync-external-system
      name: { value: 'Sync Issues to External System' }
      description: { value: 'Sends updated issues to external CRM' }
      function: syncToExternalSystem
      schedule:
        period: hour
```

### Sync Function with Batching

```javascript
import api, { route } from '@forge/api';

export const syncToExternalSystem = async (event, context) => {
  console.log('Starting sync to external system');
  
  try {
    // Get issues updated in last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    
    const response = await api.asApp().requestJira(route`/rest/api/3/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jql: `updated >= "${oneHourAgo}"`,
        fields: ['summary', 'description', 'status', 'assignee'],
        maxResults: 50, // Batch size
        startAt: 0
      })
    });
    
    const data = await response.json();
    const issues = data.issues;
    
    console.log(`Found ${issues.length} issues to sync`);
    
    // Process in batches
    for (const issue of issues) {
      await sendToExternalSystem(issue);
    }
    
    console.log('Sync completed successfully');
    return { status: 'success', syncedCount: issues.length };
    
  } catch (error) {
    console.error('Sync error:', error);
    throw error;
  }
};

async function sendToExternalSystem(issue) {
  const payload = {
    issueKey: issue.key,
    summary: issue.fields.summary,
    description: issue.fields.description || '',
    status: issue.fields.status.name,
    assignee: issue.fields.assignee?.displayName
  };
  
  try {
    await api.asApp().requestJira(
      route`https://api.example.com/sync/${issue.key}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }
    );
    
    console.log(`Synced issue ${issue.key}`);
  } catch (error) {
    console.error(`Failed to sync ${issue.key}:`, error);
    // Don't throw - continue with other issues
  }
}
```

---

## 4. Handle Rate Limits

### Rate Limit Helper Function

```javascript
import api, { route } from '@forge/api';

// Track requests per second
let requestTimestamps = [];
const MAX_REQUESTS_PER_SECOND = 5;

async function rateLimitedRequest(endpoint, options = {}) {
  const now = Date.now();
  
  // Remove old timestamps (older than 1 second)
  requestTimestamps = requestTimestamps.filter(
    ts => now - ts < 1000
  );
  
  // Wait if we've made too many requests in the last second
  while (requestTimestamps.length >= MAX_REQUESTS_PER_SECOND) {
    const oldestRequest = Math.min(...requestTimestamps);
    const waitTime = 1000 - (now - oldestRequest);
    
    console.log(`Rate limit approaching, waiting ${waitTime}ms`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  
  // Record this request
  requestTimestamps.push(now);
  
  return api.asApp().requestJira(route`${endpoint}`, options);
}

// Usage example
export const bulkUpdateIssues = async (issueKeys) => {
  const results = [];
  
  for (const key of issueKeys) {
    try {
      const response = await rateLimitedRequest(`/rest/api/3/issue/${key}`);
      const issue = await response.json();
      
      results.push({
        key: issue.key,
        success: true
      });
    } catch (error) {
      console.error(`Error fetching ${key}:`, error);
      
      results.push({
        key: key,
        success: false,
        error: error.message
      });
    }
  }
  
  return results;
};
```

---

## 5. Batch Operations for Performance

### Bulk Issue Creation Example

```javascript
import api, { route } from '@forge/api';

export const bulkCreateIssues = async (issuesToCreate) => {
  try {
    // Split into batches of 50 (Jira's limit)
    const batchSize = 50;
    
    for (let i = 0; i < issuesToCreate.length; i += batchSize) {
      const batch = issuesToCreate.slice(i, i + batchSize);
      
      const response = await api.asApp().requestJira(
        route`/rest/api/3/issue/bulk`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            issueUpdates: batch.map(issue => ({
              fields: {
                summary: issue.summary,
                description: issue.description || '',
                issuetype: { name: issue.issueType || 'Task' },
                project: { key: issue.projectKey }
              }
            }))
          })
        }
      );
      
      console.log(`Created ${batch.length} issues in batch`);
    }
    
    return { 
      status: 'success', 
      totalCreated: issuesToCreate.length 
    };
  } catch (error) {
    console.error('Bulk creation error:', error);
    throw error;
  }
};

// Example usage
const newIssues = [
  { summary: "Issue 1", projectKey: "PROJ" },
  { summary: "Issue 2", projectKey: "PROJ" },
  // ... more issues
];

await bulkCreateIssues(newIssues);
```

---

## 6. Complex Validation with Multiple Rules

### Validator with Multiple Validation Rules

```javascript
export const complexValidator = async (args) => {
  const { issue, configuration } = args;
  const rules = configuration.rules || [];
  
  // Track all validation failures
  const failures = [];
  
  for (const rule of rules) {
    const failure = await applyRule(rule, issue);
    
    if (failure) {
      failures.push(failure);
    }
  }
  
  if (failures.length > 0) {
    return { 
      result: false,
      errorMessage: `Validation failed: ${failures.join('; ')}`
    };
  }
  
  return { result: true };
};

async function applyRule(rule, issue) {
  switch (rule.type) {
    case 'requiredField':
      const value = issue.fields[rule.fieldId];
      if (!value || value === '') {
        return `${rule.label} is required`;
      }
      break;
      
    case 'minLength':
      const textValue = String(issue.fields[rule.fieldId] || '');
      if (textValue.length < rule.minLength) {
        return `${rule.label} must be at least ${rule.minLength} characters`;
      }
      break;
      
    case 'regex':
      const regexValue = issue.fields[rule.fieldId];
      if (regexValue && !new RegExp(rule.pattern).test(regexValue)) {
        return `${rule.label} doesn't match pattern: ${rule.pattern}`;
      }
      break;
  }
  
  return null; // No failure
}
```

---

## 7. Access User Context for Personalized Logic

### Get Current User Information

```javascript
import { bridge } from '@forge/bridge';

export const getUserInfo = async () => {
  try {
    const context = await bridge.getContext();
    
    console.log('User Info:', {
      accountId: context.accountId,
      accountType: context.accountType,
      displayName: context.displayName,
      email: context.email
    });
    
    return {
      accountId: context.accountId,
      accountType: context.accountType
    };
  } catch (error) {
    console.error('Error getting user context:', error);
    throw error;
  }
};

// Use in a validator to apply user-specific rules
export const userAwareValidator = async (args) => {
  const { issue, configuration } = args;
  
  // Get current user
  const userInfo = await getUserInfo();
  
  // Apply different validation based on user type
  if (userInfo.accountType === 'atlassian') {
    // Stricter validation for internal users
    return applyInternalRules(issue);
  } else {
    // Lighter validation for external users
    return applyExternalRules(issue);
  }
};
```

---

## 8. Handle Configuration Changes

### Detect and Respond to Configuration Updates

```javascript
import api, { route } from '@forge/api';

export const handleConfigUpdate = async (args) => {
  const { issue, configuration, context } = args;
  
  // Check if this is a re-validation after config change
  if (configuration.version !== '2') {
    console.log('Configuration version changed, applying new rules');
    
    // Update configuration if needed
    return { 
      result: true,
      configurationUpdate: { version: '2' }
    };
  }
  
  // Apply current validation logic
  return applyValidation(issue);
};

// Save updated configuration in UI
export const onSaveConfiguration = async () => {
  const config = {
    fieldId: document.getElementById('field-select').value,
    ruleType: document.getElementById('rule-select').value,
    version: '2', // Increment when rules change
    enabled: true
  };
  
  return JSON.stringify(config);
};
```

---

## 9. Validate Multiple Project Types Differently

### Multi-Project Type Validator

```yaml
modules:
  jira:workflowValidator:
    - key: multi-project-validator
      name: Project-Aware Validator
      description: Different rules for different project types
      function: validateByProjectType
      
      projectTypes:
        - company-managed
        - team-managed
        
      create:
        resource: config-ui
```

```javascript
export const validateByProjectType = async (args) => {
  const { issue, configuration } = args;
  
  // Determine project type
  const isCompanyManaged = issue.fields.project.scheme?.type === 'company';
  
  if (isCompanyManaged) {
    return applyCompanyRules(issue);
  } else {
    return applyTeamRules(issue);
  }
};

function applyCompanyRules(issue) {
  // Stricter rules for company-managed projects
  const rules = [
    { field: 'summary', minLength: 10 },
    { field: 'description', required: true }
  ];
  
  return validateAgainstRules(rules, issue);
}

function applyTeamRules(issue) {
  // Lighter rules for team-managed projects
  const rules = [
    { field: 'summary', minLength: 5 }
  ];
  
  return validateAgainstRules(rules, issue);
}

function validateAgainstRules(rules, issue) {
  const failures = [];
  
  for (const rule of rules) {
    const value = issue.fields[rule.field];
    
    if (rule.required && (!value || value === '')) {
      failures.push(`${rule.field} is required`);
    }
    
    if (rule.minLength && String(value).length < rule.minLength) {
      failures.push(`${rule.field} must be at least ${rule.minLength} characters`);
    }
  }
  
  return failures.length > 0
    ? { result: false, errorMessage: failures.join('; ') }
    : { result: true };
}
```

---

## 10. Integration with External Ticketing System

### Webhook-style Sync to External System

```javascript
import api, { route } from '@forge/api';

// Store last sync timestamp in KVS
const LAST_SYNC_KEY = 'last-sync-timestamp';

async function getLastSyncTime() {
  try {
    const storage = api.asApp().storage.get(LAST_SYNC_KEY);
    return JSON.parse(await storage) || Date.now();
  } catch {
    return Date.now() - (24 * 60 * 60 * 1000); // Default to 24 hours ago
  }
}

async function setLastSyncTime(timestamp) {
  const storage = api.asApp().storage.get(LAST_SYNC_KEY);
  await storage.set(JSON.stringify(timestamp));
}

export const syncToExternalTicketing = async (event, context) => {
  const lastSync = await getLastSyncTime();
  
  try {
    // Find issues updated since last sync
    const response = await api.asApp().requestJira(
      route`/rest/api/3/search`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jql: `updated >= "${new Date(lastSync).toISOString()}"`,
          fields: ['summary', 'description', 'status', 'customfield_10001']
        })
      }
    );
    
    const data = await response.json();
    
    for (const issue of data.issues) {
      // Send to external system
      const payload = {
        jiraKey: issue.key,
        summary: issue.fields.summary,
        status: issue.fields.status.name,
        customValue: issue.fields.customfield_10001
      };
      
      await api.asApp().requestJira(
        route`https://api.external-system.com/sync/${issue.key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }
      );
    }
    
    // Update last sync time
    await setLastSyncTime(Date.now());
    
    return { 
      status: 'success', 
      syncedIssues: data.issues.length,
      timestamp: Date.now()
    };
    
  } catch (error) {
    console.error('Sync error:', error);
    throw error;
  }
};
```

---

## Tips for Problem Patterns

1. **Always handle errors gracefully** - Return failure results instead of throwing
2. **Rate limit external calls** - Use the rate limiting helper from pattern #4
3. **Batch operations** - Process in chunks to avoid timeouts
4. **Log extensively** - Use `console.log()` for debugging, view with `forge logs`
5. **Test locally first** - Use `forge tunnel` to test with your live instance

---

## Next Steps

- Review `docs/when-to-use-which.md` to choose the right module type
- See `templates/` directory for boilerplate configurations
- Check existing docs for more detailed API reference