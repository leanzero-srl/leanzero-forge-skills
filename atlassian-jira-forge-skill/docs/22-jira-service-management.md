# Jira Service Management (JSM) Extensions with Forge

This guide covers building Forge apps that extend Jira Service Management, including custom request types, SLA automation, customer portal customizations, and knowledge base integrations.

---

## What is Jira Service Management?

Jira Service Management (JSM) is Atlassian's IT service management solution that helps teams manage incidents, service requests, and changes. Forge provides several ways to extend JSM:

### Key Extension Points

| Feature | Forge Module | Use Case |
|---------|--------------|----------|
| Custom request types | `jira:adminPage` + JSM API | Add specialized service forms |
| SLA automation | `trigger` + `scheduledTrigger` | Auto-escalate, notify on breaches |
| Customer portal UI | Custom UI | Enhanced customer experience |
| Knowledge base | Confluence integration | Self-service articles |
| Notifications | `trigger` + webhooks | Custom email/SMS alerts |
| Workflows | `jira:workflowPostFunction` | Auto-assign, auto-resolve |

---

## Understanding JSM-Specific Concepts

### Service Desk vs Project

A **Service Desk** is a project with the JSM template enabled. Each service desk has:
- A portal (customer-facing interface)
- Request types (categories of requests)
- SLAs (service level agreements)
- Queue configurations
- Customer permissions settings

### Request Types

Request types define how customers interact with your service desk:
- **System request types**: Built-in (Incident, Service Request, etc.)
- **Custom request types**: Created via UI or API

### SLA Metrics

SLAs track time-based goals:
- **Time to first response**: Initial agent reply
- **Time to resolution**: Complete fix
- **Custom metrics**: Defined per service desk

---

## Creating Custom Request Types with Forge

### Overview

While request types are typically created via the UI, Forge can programmatically configure and enhance them:

### Step 1: Create the Request Type (Via API)

```javascript
import api, { route } from '@forge/api';

/**
 * Create a custom request type for the service desk
 */
async function createRequestType(projectId, name, description, icon) {
  const response = await api.asApp().requestJira(
    route`/servicedesk/api/v1/requests/type`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        description,
        icon,
        projectKey: projectId,
        requestTypeStructureId: null // Will be auto-generated
      })
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to create request type: ${await response.text()}`);
  }

  return await response.json();
}

// Usage in a scheduled trigger or admin action
resolver.define('setupServiceDesk', async (payload) => {
  const { projectKey, requestTypes } = payload;

  const createdTypes = [];
  
  for (const rt of requestTypes) {
    const newType = await createRequestType(
      projectKey,
      rt.name,
      rt.description,
      rt.icon || 'fa-solid fa-question'
    );
    
    // Configure fields for this request type
    await configureRequestTypeFields(newType.id, rt.fields);
    
    createdTypes.push(newType);
  }

  return { createdTypes };
});

async function configureRequestTypeFields(requestTypeId, fields) {
  const response = await api.asApp().requestJira(
    route`/servicedesk/api/v1/requests/type/${requestTypeId}/fields`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields })
    }
  );

  return await response.json();
}
```

### Step 2: Add Custom Fields to Request Types

```javascript
/**
 * Configure which fields appear in a request type form
 */
async function configureRequestTypeFields(requestTypeId, fieldConfig) {
  const response = await api.asApp().requestJira(
    route`/servicedesk/api/v1/requests/type/${requestTypeId}/fields`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: fieldConfig.map(field => ({
          fieldId: field.id,
          visible: field.visible ?? true,
          required: field.required ?? false,
          position: field.position || 0
        }))
      })
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to configure fields: ${await response.text()}`);
  }

  return await response.json();
}

// Example usage
resolver.define('configureIncidentType', async () => {
  const incidentTypeId = '10001'; // Get from createRequestType or list
  
  await configureRequestTypeFields(incidentTypeId, [
    { id: 'summary', required: true, position: 0 },
    { id: 'description', required: true, position: 1 },
    { id: 'priority', required: false, visible: true, position: 2 },
    { id: 'customfield_10001', required: true, visible: true, position: 3 } // Custom field
  ]);
});
```

---

## SLA Automation with Forge

### Monitor and Act on SLA Breaches

```javascript
import api, { route } from '@forge/api';

/**
 * Get all SLAs for a service desk project
 */
async function getServiceDeskSLAs(projectId) {
  const response = await api.asApp().requestJira(
    route`/servicedesk/api/v1/sla/metrics?projectId=${projectId}`
  );

  if (!response.ok) {
    throw new Error(`Failed to get SLAs: ${await response.text()}`);
  }

  return await response.json();
}

/**
 * Get issues that are approaching or have breached an SLA
 */
async function getIssuesWithSLABreaches(projectId, slaMetricId, hoursUntilBreach = 2) {
  const jql = `project = ${projectId} AND status != Done 
               AND sla_${slaMetricId}_days_remaining < ${hoursUntilBreach}`;

  const response = await api.asApp().requestJira(
    route`/rest/api/3/search?jql=${encodeURIComponent(jql)}&fields=summary,status,assignee,sla_${slaMetricId}_days_remaining`
  );

  if (!response.ok) {
    throw new Error(`Failed to get SLA breach issues: ${await response.text()}`);
  }

  const data = await response.json();
  return data.issues;
}

/**
 * Scheduled trigger to check for SLA breaches and send notifications
 */
export const checkSLABreaches = async (payload) => {
  const { projectId, slaMetricId, notificationGroupId } = payload;

  // Get issues approaching breach
  const approachingBreach = await getIssuesWithSLABreaches(projectId, slaMetricId, 2);
  
  // Get already breached issues
  const alreadyBreached = await getIssuesWithSLABreaches(projectId, slaMetricId, 0);

  console.log(`Found ${approachingBreach.length} approaching breach, ${alreadyBreached.length} already breached`);

  // Send notifications for breached issues
  for (const issue of alreadyBreached) {
    await notifyAboutSLABreach(issue, notificationGroupId);
  }

  return {
    approachingBreach: approachingBreach.map(i => i.key),
    breached: alreadyBreached.map(i => i.key)
  };
};

async function notifyAboutSLABreach(issue, groupId) {
  // Get existing comments to avoid duplicates
  const commentsResponse = await api.asApp().requestJira(
    route`/rest/api/3/issue/${issue.id}/comment?maxResults=1`
  );
  
  const comments = await commentsResponse.json();
  const hasRecentNotification = comments.comments.some(c => 
    c.body.includes('SLA breach notification') &&
    Date.parse(c.created) > Date.now() - 24 * 60 * 60 * 1000 // Last 24 hours
  );

  if (!hasRecentNotification) {
    // Add comment to issue
    await api.asApp().requestJira(
      route`/rest/api/3/issue/${issue.id}/comment`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: {
            type: 'doc',
            version: 1,
            content: [
              {
                type: 'paragraph',
                content: [{
                  type: 'text',
                  text: `⚠️ **SLA Breach Notification**: This issue has breached the SLA metric. Please prioritize resolution.`
                }]
              }
            ]
          },
          visibility: {
            type: 'group',
            value: groupId
          }
        })
      }
    );

    console.log(`Notified about breach for issue ${issue.key}`);
  }
}
```

### Manifest Configuration for SLA Monitoring

```yaml
modules:
  # Scheduled trigger to check SLAs every hour
  scheduledTrigger:
    - key: sla-monitor
      function: checkSLABreaches
      schedule: "0 * * * *"  # Every hour
      
# Functions
functions:
  - key: checkSLABreaches
    handler: src/sla.checkSLABreaches

# Permissions
permissions:
  scopes:
    - read:jira-work
    - write:jira-work
```

---

## Customer Portal Customizations with Custom UI

### Create a Custom Portal Widget

```yaml
modules:
  # Add custom widget to customer portal
  jira:portalCustomContent:
    - key: my-portal-widget
      title: Quick Actions
      resource: widgetResource
      
resources:
  - key: widgetResource
    path: static/portal-widget/build
    
permissions:
  scopes:
    - read:jira-user
    - read:jira-work
  content:
    styles:
      - 'unsafe-inline'
```

### Portal Widget React Component

```tsx
import React from 'react';
import { invoke } from '@forge/bridge';

function PortalWidget() {
  const [quickActions, setQuickActions] = React.useState([
    { id: 1, title: 'Password Reset', icon: 'fa-key' },
    { id: 2, title: 'Access Request', icon: 'fa-lock' },
    { id: 3, title: 'Software Installation', icon: 'fa-download' }
  ]);

  return (
    <div style={{
      padding: '16px',
      backgroundColor: '#f4f5f7',
      borderRadius: '8px',
      marginBottom: '16px'
    }}>
      <h3 style={{ margin: '0 0 12px', color: '#172B4D' }}>Quick Actions</h3>
      
      <div style={{ display: 'grid', gap: '8px' }}>
        {quickActions.map(action => (
          <button 
            key={action.id}
            onClick={() => handleActionClick(action)}
            style={{
              padding: '12px 16px',
              backgroundColor: '#0052CC',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              textAlign: 'left',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}
          >
            <i className={`fa-solid ${action.icon}`} />
            <span>{action.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

async function handleActionClick(action) {
  // Navigate to create request with pre-filled fields
  window.location.href = `/secure/CreateRequestDetails!default.jspa?pid=10000&issuetype=10001`;
}

export default PortalWidget;
```

---

## Enhanced Request Creation Flow

### Custom Form with Validation

```tsx
import React, { useState } from 'react';
import { invoke } from '@forge/bridge';

interface FormData {
  summary: string;
  description: string;
  priority: string;
  category: string;
  attachmentIds?: number[];
}

function CustomRequestForm() {
  const [formData, setFormData] = useState<FormData>({
    summary: '',
    description: '',
    priority: 'Medium',
    category: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ success?: boolean; key?: string; error?: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    
    try {
      const response = await invoke('createServiceRequest', formData);
      setResult({ success: true, key: response.key });
    } catch (error) {
      setResult({ error: error.message || 'Failed to create request' });
    } finally {
      setSubmitting(false);
    }
  };

  if (result?.success) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <h3>Request Created!</h3>
        <p>Your ticket <strong>{result.key}</strong> has been submitted.</p>
        <button onClick={() => window.location.reload()}>Create Another</button>
      </div>
    );
  }

  if (result?.error) {
    return (
      <div style={{ padding: '20px', color: '#de350b' }}>
        <h3>Error</h3>
        <p>{result.error}</p>
        <button onClick={() => setResult(null)}>Try Again</button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: '600px' }}>
      <h2>New Service Request</h2>
      
      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', marginBottom: '4px', fontWeight: 500 }}>
          Summary *
        </label>
        <input
          type="text"
          value={formData.summary}
          onChange={(e) => setFormData({ ...formData, summary: e.target.value })}
          required
          style={{
            width: '100%',
            padding: '8px',
            border: '1px solid #DFE1E6',
            borderRadius: '3px'
          }}
        />
      </div>

      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', marginBottom: '4px', fontWeight: 500 }}>
          Description *
        </label>
        <textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          required
          rows={5}
          style={{
            width: '100%',
            padding: '8px',
            border: '1px solid #DFE1E6',
            borderRadius: '3px'
          }}
        />
      </div>

      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', marginBottom: '4px', fontWeight: 500 }}>
          Priority
        </label>
        <select
          value={formData.priority}
          onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
          style={{
            width: '100%',
            padding: '8px',
            border: '1px solid #DFE1E6',
            borderRadius: '3px'
          }}
        >
          <option value="Low">Low</option>
          <option value="Medium">Medium</option>
          <option value="High">High</option>
          <option value="Highest">Highest</option>
        </select>
      </div>

      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', marginBottom: '4px', fontWeight: 500 }}>
          Category
        </label>
        <select
          value={formData.category}
          onChange={(e) => setFormData({ ...formData, category: e.target.value })}
          required
          style={{
            width: '100%',
            padding: '8px',
            border: '1px solid #DFE1E6',
            borderRadius: '3px'
          }}
        >
          <option value="">Select a category</option>
          <option value="incident">Incident</option>
          <option value="service_request">Service Request</option>
          <option value="question">Question</option>
        </select>
      </div>

      <button 
        type="submit" 
        disabled={submitting}
        style={{
          padding: '10px 20px',
          backgroundColor: submitting ? '#6B77FFC4' : '#0052CC',
          color: 'white',
          border: 'none',
          borderRadius: '3px',
          cursor: submitting ? 'not-allowed' : 'pointer'
        }}
      >
        {submitting ? 'Submitting...' : 'Submit Request'}
      </button>
    </form>
  );
}

export default CustomRequestForm;
```

### Backend Resolver for Creating Requests

```javascript
import api, { route } from '@forge/api';

resolver.define('createServiceRequest', async (payload) => {
  const { summary, description, priority, category } = payload;

  // Map category to request type ID
  const requestTypeMap = {
    'incident': 10001,      // Replace with actual request type IDs
    'service_request': 10002,
    'question': 10003
  };

  const issueTypeId = requestTypeMap[category];
  
  if (!issueTypeId) {
    throw new Error('Invalid category selected');
  }

  // Create the issue (which becomes a service request)
  const response = await api.asApp().requestJira(
    route`/rest/api/3/issue`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          project: { key: 'SVC' }, // Replace with your service desk key
          issuetype: { id: issueTypeId.toString() },
          summary,
          description: {
            type: 'doc',
            version: 1,
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: description }]
              }
            ]
          },
          priority: { name: priority }
        }
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Error creating service request:', errorText);
    
    // Parse Jira error details if available
    try {
      const errorData = JSON.parse(errorText);
      throw new Error(errorData.errors?.summary || errorData.message || 'Failed to create request');
    } catch (parseErr) {
      throw new Error('Failed to create request: ' + errorText);
    }
  }

  return await response.json();
});
```

---

## Workflow Enhancements for JSM

### Auto-Assignment Based on Category

```javascript
import api, { route } from '@forge/api';

/**
 * Post-function: Auto-assign issue based on category and team capacity
 */
export const autoAssignIssue = async (payload) => {
  const { issueId, categoryId } = payload;

  // Get available agents for this category
  const availableAgents = await getAvailableAgents(categoryId);
  
  if (!availableAgents.length) {
    console.log('No available agents found');
    return { result: true }; // Don't block the workflow
  }

  // Simple round-robin assignment (could be enhanced with load balancing)
  const assignedAgent = selectAgentByLoad(availableAgents);

  // Update issue assignee
  await api.asApp().requestJira(
    route`/rest/api/3/issue/${issueId}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          assignee: { accountId: assignedAgent.accountId }
        }
      })
    }
  );

  console.log(`Assigned issue ${issueId} to ${assignedAgent.displayName}`);
  
  return { result: true };
};

async function getAvailableAgents(categoryId) {
  // Get all users in the service desk group
  const groupsResponse = await api.asApp().requestJira(
    route`/rest/api/3/group/bulk?groupQuery=service-desk-agents`
  );
  
  const groupsData = await groupsResponse.json();
  
  // For each group, get members (simplified - you'd need proper pagination)
  // This is a simplified example
  
  return [
    { accountId: '5b10a2849c3f7d0d562c', displayName: 'Agent One' },
    { accountId: '5b10a2849c3f7d0d563e', displayName: 'Agent Two' }
  ];
}

function selectAgentByLoad(agents) {
  // Simplified selection - in production, check actual workload
  return agents[Math.floor(Math.random() * agents.length)];
}
```

### Auto-Resolve Based on Customer Inactivity

```javascript
import api, { route } from '@forge/api';

/**
 * Scheduled trigger: Auto-resolve issues with no customer response for X days
 */
export const autoResolveStaleIssues = async () => {
  const staleThresholdDays = 7;
  const cutoffDate = new Date(Date.now() - staleThresholdDays * 24 * 60 * 60 * 1000);

  // Find issues waiting for customer that haven't been updated since cutoff
  const jql = `project = SVC AND status IN ("Waiting for Customer", "Pending") 
               AND updated < "${cutoffDate.toISOString()}"`;

  const response = await api.asApp().requestJira(
    route`/rest/api/3/search?jql=${encodeURIComponent(jql)}&fields=summary,assignee,status`
  );

  if (!response.ok) {
    throw new Error(`Search failed: ${await response.text()}`);
  }

  const data = await response.json();
  
  console.log(`Found ${data.total} stale issues to auto-resolve`);

  for (const issue of data.issues) {
    await resolveStaleIssue(issue);
  }

  return { resolved: data.issues.map(i => i.key) };
};

async function resolveStaleIssue(issue) {
  try {
    // Add comment explaining auto-resolution
    await api.asApp().requestJira(
      route`/rest/api/3/issue/${issue.id}/comment`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: {
            type: 'doc',
            version: 1,
            content: [
              {
                type: 'paragraph',
                content: [{
                  type: 'text',
                  text: `🤖 **Auto-Resolution Notice**: This ticket has been automatically resolved due to no customer response for 7 days. If you need further assistance, please create a new request.`
                }]
              }
            ]
          },
          visibility: {
            type: 'group',
            value: 'service-desk-customers'
          }
        })
      }
    );

    // Transition to resolved/closed
    await api.asApp().requestJira(
      route`/rest/api/3/issue/${issue.id}/transitions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transition: { id: '5' } // Replace with actual "Done" transition ID
        })
      }
    );

    console.log(`Auto-resolved issue ${issue.key}`);
  } catch (error) {
    console.error(`Failed to auto-resolve ${issue.key}:`, error.message);
  }
}
```

---

## Knowledge Base Integration with Confluence

### Link Service Requests to KB Articles

```javascript
import api, { route } from '@forge/api';

/**
 * Suggest relevant knowledge base articles when creating a request
 */
resolver.define('suggestKBArticles', async (payload) => {
  const { summary, description } = payload;

  // Search Confluence for matching articles
  const searchQuery = `title~"${summary}" OR body~"${description.substring(0, 50)}"`;
  
  const response = await api.asApp().requestJira(
    route`/wiki/rest/api/content/search?cql=${encodeURIComponent(searchQuery)}&limit=3&expand=space,version`
  );

  if (!response.ok) {
    console.warn('Confluence search failed:', await response.text());
    return []; // Return empty array on error
  }

  const data = await response.json();
  
  return data.results.map(article => ({
    id: article.id,
    title: article.title,
    link: `${article._links.base}${article._links.webui}`,
    space: article.space?.key,
    excerpt: extractExcerpt(summary, description)
  }));
});

function extractExcerpt(summary, description) {
  // Simple excerpt extraction - in production, use AI/matching algorithms
  const maxLength = 150;
  const text = `${summary}\n\n${description}`.replace(/[#*\[\]]/g, '');
  
  return text.length > maxLength 
    ? text.substring(0, maxLength) + '...' 
    : text;
}

/**
 * Record that an article was viewed from a service request
 */
resolver.define('recordArticleView', async (payload) => {
  const { issueId, articleId } = payload;

  // Store the view in KVS for analytics
  await storage.set(`view:${articleId}:${issueId}`, {
    timestamp: Date.now()
  });

  return { success: true };
});
```

### Manifest with Confluence Permissions

```yaml
permissions:
  scopes:
    - read:jira-work
    - write:jira-work
    - read:confluence-content      # Search KB articles
    - read:confluence-space        # Read space info
    
  external:
    fetch:
      backend:
        - "*.atlassian.net"
```

---

## Customer Notification Automation

### Custom Email Notifications via Webhooks

```javascript
import api, { route } from '@forge/api';

/**
 * Trigger: Send custom notifications when issue is updated
 */
export const handleIssueUpdate = async (payload) => {
  const { issueId, fieldChanged, newValue } = payload;
  
  // Get issue details
  const issueResponse = await api.asApp().requestJira(
    route`/rest/api/3/issue/${issueId}?fields=summary,assignee,status,reporter`
  );
  
  if (!issueResponse.ok) {
    throw new Error('Failed to fetch issue');
  }
  
  const issue = await issueResponse.json();
  const fields = issue.fields;

  // Determine notification type based on change
  let notificationTemplate;
  
  switch (fieldChanged) {
    case 'status':
      if (newValue === 'Resolved' || newValue === 'Done') {
        notificationTemplate = 'issue_resolved';
      } else if (newValue === 'Waiting for Customer') {
        notificationTemplate = 'waiting_for_customer';
      }
      break;
      
    case 'assignee':
      notificationTemplate = 'assigned';
      break;
      
    default:
      return; // No custom notification needed
  }

  if (notificationTemplate) {
    await sendCustomerNotification(
      fields.reporter?.accountId,
      issue.key,
      fields.summary,
      notificationTemplate,
      newValue
    );
  }
};

async function sendCustomerNotification(customerAccountId, issueKey, summary, template, value) {
  // Get customer's email
  const userResponse = await api.asApp().requestJira(
    route`/rest/api/3/user?accountId=${customerAccountId}`
  );
  
  if (!userResponse.ok) {
    console.warn('Could not fetch user info');
    return;
  }
  
  const user = await userResponse.json();
  
  // Send via external email service (example with SendGrid)
  try {
    await sendEmail({
      to: user.emailAddress,
      subject: `[${issueKey}] ${summary} - Status Update`,
      templateId: template,
      dynamicTemplateData: {
        issueKey,
        summary,
        newValue: value,
        link: `https://your-domain.atlassian.net/servicedesk/customer/portal/1/${issueKey}`
      }
    });
    
    console.log(`Sent ${template} notification to ${user.emailAddress}`);
  } catch (error) {
    console.error('Failed to send email:', error.message);
  }
}

async function sendEmail(config) {
  // Example: SendGrid integration
  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: config.to }] }],
      from: { email: 'support@your-company.com' },
      subject: config.subject,
      template_id: config.templateId,
      dynamic_template_data: config.dynamicTemplateData
    })
  });

  if (!response.ok) {
    throw new Error(`SendGrid API error: ${await response.text()}`);
  }
}
```

---

## Summary of JSM Forge Capabilities

| Capability | Module(s) Used | Key APIs |
|------------|----------------|----------|
| Custom request types | `scheduledTrigger` + REST API | `/servicedesk/api/v1/requests/type` |
| SLA monitoring | `trigger`, `scheduledTrigger` | `/servicedesk/api/v1/sla/metrics` |
| Portal widgets | `jira:portalCustomContent` | Custom UI |
| Auto-assignment | `jira:workflowPostFunction` | REST API + team logic |
| KB integration | Trigger functions | Confluence CQL API |
| Customer notifications | `trigger` + webhooks | External email/SMS services |

---

## Related Documentation

- [Custom UI Troubleshooting](18-custom-ui-troubleshooting.md)
- [Rate Limit Handling](19-rate-limit-handling.md)
- [Performance Optimization](20-performance-optimization.md)
- [Complete Custom UI Guide](21-complete-custom-ui-guide.md)