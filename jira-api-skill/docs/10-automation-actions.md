# Automation Actions Code Examples

This document provides code examples for implementing custom automation actions in Atlassian Forge apps. These actions appear in Jira's automation rule builder and can perform custom logic when triggered by automation rules.

## Table of Contents
1. [Basic Automation Action](#basic-automation-action)
2. [Multiple Actions Configuration](#multiple-actions-configuration)
3. [Accessing Rule Context](#accessing-rule-context)
4. [Common Use Cases](#common-use-cases)
5. [Error Handling](#error-handling)

---

## Basic Automation Action

### Manifest Configuration

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
    // Perform custom logic
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
  // Example: Update issue fields
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

---

## Multiple Actions Configuration

Configure multiple automation actions in the same app:

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
      
    - key: custom-notification-action
      name: { value: 'Send Custom Notification' }
      description: { value: 'Sends notifications via custom channels' }
      function: sendNotificationAction
```

### Corresponding Functions

```javascript
// Action 1: Update Issue Status
export const updateStatusAction = async (payload, context) => {
  console.log('Update status action triggered');
  
  const { issue } = payload;
  
  // Find the transition ID for the target status
  const transitions = await getAvailableTransitions(issue.id);
  const targetTransition = transitions.find(t => t.name === 'In Progress');
  
  if (targetTransition) {
    await performTransition(issue.id, targetTransition.id);
    
    return {
      status: 'success',
      message: `Issue ${issue.key} transitioned to In Progress`
    };
  }
  
  throw new Error('No valid transition found');
};

// Action 2: Add Comment with Template
export const addCommentAction = async (payload, context) => {
  console.log('Add comment action triggered');
  
  const { issue } = payload;
  
  // Get template content (could be stored in KVS)
  const template = await getCommentTemplate();
  
  // Add comment to issue
  await api.asApp().requestJira(`/rest/api/3/issue/${issue.id}/comment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      body: template,
      visibility: {
        type: 'role',
        name: 'Developers'
      }
    })
  });
  
  return {
    status: 'success',
    message: `Comment added to ${issue.key}`
  };
};

// Action 3: Send Custom Notification
export const sendNotificationAction = async (payload, context) => {
  console.log('Send notification action triggered');
  
  const { issue } = payload;
  
  // Build notification content
  const notification = buildNotification(issue);
  
  // Send to custom endpoint (Slack, email, etc.)
  await sendToCustomChannel(notification);
  
  return {
    status: 'success',
    message: `Notification sent for ${issue.key}`
  };
};

const getAvailableTransitions = async (issueId) => {
  const response = await api.asApp().requestJira(
    `/rest/api/3/issue/${issueId}/transitions`,
    { method: 'GET' }
  );
  
  const data = await response.json();
  return data.transitions || [];
};

const performTransition = async (issueId, transitionId) => {
  await api.asApp().requestJira(
    `/rest/api/3/issue/${issueId}/transitions`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transition: { id: transitionId } })
    }
  );
};

const getCommentTemplate = async () => {
  // Could fetch from KVS or hardcoded template
  return `Issue processed by automation rule.\n\nAction performed at ${new Date().toISOString()}`;
};
```

---

## Accessing Rule Context

The automation action payload contains rich context:

```javascript
export const detailedContextFunction = async (payload, context) => {
  console.log('Full payload:', JSON.stringify(payload, null, 2));
  
  // Issue information
  const { issue } = payload;
  const { id, key, fields, priority, status } = issue;
  
  // User information
  const { actor } = payload;
  const { accountId, displayName } = actor;
  
  console.log(`Issue: ${key} (${id})`);
  console.log(`Summary: ${fields.summary}`);
  console.log(`Reporter: ${fields.reporter.displayName}`);
  console.log(`Actor (triggered by): ${displayName} (${accountId})`);
  
  // Rule information (if available)
  const { rule } = payload;
  if (rule) {
    console.log(`Rule ID: ${rule.id}`);
    console.log(`Rule name: ${rule.name}`);
  }
  
  return {
    status: 'success',
    processedIssueKey: key,
    triggeredBy: accountId
  };
};
```

---

## Common Use Cases

### 1. Sync with External System

```yaml
modules:
  action:
    - key: sync-to-crm-action
      name: { value: 'Sync Issue to CRM' }
      description: { value: 'Sends issue data to external CRM system' }
      function: syncToCrmAction
```

```javascript
export const syncToCrmAction = async (payload, context) => {
  console.log('Starting CRM synchronization...');
  
  const { issue } = payload;
  
  // Build CRM record
  const crmRecord = {
    externalId: `jira-${issue.key}`,
    title: issue.fields.summary,
    description: issue.fields.description || '',
    status: issue.fields.status.name,
    priority: issue.fields.priority.name,
    reporter: issue.fields.reporter.accountId,
    url: `https://your-domain.atlassian.net/browse/${issue.key}`
  };
  
  // Sync to external CRM
  try {
    const response = await api.asApp().requestJira(
      route`/proxy/external-crm/api/issues`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(crmRecord)
      }
    );
    
    if (!response.ok) {
      throw new Error('CRM sync failed');
    }
    
    return {
      status: 'success',
      message: `Synced ${issue.key} to CRM`
    };
  } catch (error) {
    console.error('CRM sync error:', error);
    throw error;
  }
};
```

### 2. Send Email Notification

```yaml
modules:
  action:
    - key: send-email-action
      name: { value: 'Send Email Notification' }
      description: { value: 'Sends email notification for important issues' }
      function: sendEmailAction
```

```javascript
export const sendEmailAction = async (payload, context) => {
  console.log('Sending email notification...');
  
  const { issue } = payload;
  
  // Check if issue is high priority
  const isHighPriority = ['Highest', 'High'].includes(issue.fields.priority?.name);
  
  if (!isHighPriority) {
    console.log('Skipping - Issue is not high priority');
    return { status: 'skipped' };
  }
  
  // Build email content
  const subject = `[${issue.fields.priority.name}] ${issue.fields.summary} (${issue.key})`;
  const body = buildEmailBody(issue);
  
  try {
    // Send email (example - would use actual email API)
    await sendEmail({
      to: 'team@example.com',
      subject,
      body
    });
    
    return {
      status: 'success',
      message: `Email sent for ${issue.key}`
    };
  } catch (error) {
    console.error('Email sending failed:', error);
    throw error;
  }
};

const buildEmailBody = (issue) => {
  return `
Issue Notification
==================

Key: ${issue.key}
Summary: ${issue.fields.summary}
Description: ${issue.fields.description || 'No description'}
Priority: ${issue.fields.priority.name}
Status: ${issue.fields.status.name}

View issue: https://your-domain.atlassian.net/browse/${issue.key}
`;
};
```

### 3. Update Custom Fields

```yaml
modules:
  action:
    - key: update-custom-field-action
      name: { value: 'Update Custom Field' }
      description: { value: 'Updates a custom field with computed value' }
      function: updateCustomFieldAction
```

```javascript
export const updateCustomFieldAction = async (payload, context) => {
  console.log('Updating custom field...');
  
  const { issue } = payload;
  const { id: issueId } = issue;
  
  // Calculate custom field value
  const computedValue = calculateFieldValue(issue);
  
  try {
    // Update the custom field
    await api.asApp().requestJira(`/rest/api/3/issue/${issueId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        update: {
          customfield_10001: [{ set: computedValue }]
        }
      })
    });
    
    return {
      status: 'success',
      message: `Updated custom field for ${issue.key}`,
      newValue: computedValue
    };
  } catch (error) {
    console.error('Custom field update failed:', error);
    throw error;
  }
};

const calculateFieldValue = (issue) => {
  // Example calculation based on issue fields
  const priorityScore = getPriorityScore(issue.fields.priority?.name);
  const age = calculateIssueAge(issue.fields.created);
  
  return Math.round((priorityScore * 10) + (age / 86400000));
};

const getPriorityScore = (priorityName) => {
  switch (priorityName) {
    case 'Highest': return 10;
    case 'High': return 7;
    case 'Medium': return 5;
    case 'Low': return 2;
    default: return 1;
  }
};

const calculateIssueAge = (createdDate) => {
  const created = new Date(createdDate).getTime();
  const now = new Date().getTime();
  return now - created;
};
```

---

## Error Handling

### Comprehensive Error Handling

```javascript
export const robustActionFunction = async (payload, context) => {
  console.log('Starting automation action...');
  
  try {
    // Validate input
    if (!payload?.issue?.id) {
      throw new Error('Invalid payload: Missing issue ID');
    }
    
    // Your main logic
    await processIssue(payload.issue);
    
    return {
      status: 'success',
      processedAt: new Date().toISOString()
    };
  } catch (error) {
    console.error('Automation action error:', {
      message: error.message,
      stack: error.stack,
      payload: payload
    });
    
    // Log to a custom logger if needed
    await logError(error, payload);
    
    throw error; // Re-throw to indicate failure
  }
};

const logError = async (error, payload) => {
  try {
    // Log error details (could store in KVS or send to logging service)
    const errorRecord = {
      timestamp: new Date().toISOString(),
      message: error.message,
      issueKey: payload?.issue?.key,
      functionName: 'customAction'
    };
    
    console.error('Error logged:', JSON.stringify(errorRecord));
  } catch (loggingError) {
    // Log logging errors to avoid infinite loops
    console.error('Logging failed:', loggingError);
  }
};
```

### Handling Rate Limits

```javascript
export const rateLimitedAction = async (payload, context) => {
  const BATCH_SIZE = 20;
  
  try {
    for (let i = 0; i < issuesToProcess.length; i += BATCH_SIZE) {
      const batch = issuesToProcess.slice(i, i + BATCH_SIZE);
      
      await processBatch(batch);
      
      // Small delay between batches
      if (i + BATCH_SIZE < issuesToProcess.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    return { status: 'completed' };
  } catch (error) {
    console.error('Rate limited action error:', error);
    throw error;
  }
};
```

---

## Best Practices

1. **Keep actions simple** - Automation actions should complete quickly
2. **Handle errors gracefully** - Never let automation fail silently
3. **Validate inputs** - Check all required fields before processing
4. **Use context properly** - Leverage the actor information when needed
5. **Test thoroughly** - Test with various issue types and scenarios

---

## Related Documentation

- [Forge Actions](https://developer.atlassian.com/cloud/forge/application-structure/#actions)
- [Jira Automation](https://support.atlassian.com/jira-cloud-nextgen/docs/what-is-jira-automation/)