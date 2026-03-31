# Jira Service Management (JSM) Forge Modules

## Overview

Jira Service Management (JSM) Forge apps extend customer service workflows through portal interfaces and request management. These modules allow you to add custom functionality to:
- Customer portal requests
- Organization views
- Request type forms
- Portal headers and footers

## Available Module Types

| Module | Description |
|--------|-------------|
| `jiraServiceManagement:portalRequestDetail` | Add panels to portal request views (right sidebar) |
| `jiraServiceManagement:portalRequestDetailPanel` | Add content at bottom of request panel |
| `jiraServiceManagement:portalHeader` | Custom header in customer portal |
| `jiraServiceManagement:portalFooter` | Custom footer in customer portal |
| `jiraServiceManagement:organizationPanel` | Add panels to organization views |
| `jiraServiceManagement:requestTypeForms` | Customize request type forms |

---

## Core Concepts

### Portal Request Details

Add custom panels below the Activity section on portal requests. The panel appears in the right sidebar of the customer portal.

```yaml
modules:
  jiraServiceManagement:portalRequestDetail:
    - key: my-detail-panel
      name: { value: 'My Panel' }
      description: { value: 'Shows additional request information' }
      resource: main
      icon: {
        width: 24,
        height: 24,
        svg: "<svg viewBox='0 0 24 24'><path d='M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z'/></svg>"
      }
      
      # Where the panel appears
      location: com.atlassian.jira.issue.views:right-sidebar
      
      conditions:
        - condition: user_is_authenticated
```

### Organization Panels

Add panels to organization views in JSM.

```yaml
modules:
  jiraServiceManagement:organizationPanel:
    - key: org-info-panel
      name: { value: 'Organization Information' }
      description: { value: 'Shows custom organization data' }
      resource: main
```

### Request Type Forms

Customize request type forms with additional fields and logic.

```yaml
modules:
  jiraServiceManagement:requestTypeForms:
    - key: custom-request-forms
      name: { value: 'Custom Request Forms' }
      description: { value: 'Adds custom form fields' }
```

---

## Portal Header and Footer

### Custom Header

Add a custom header to the customer portal.

```yaml
modules:
  jiraServiceManagement:portalHeader:
    - key: my-header
      name: { value: 'My Portal Header' }
      description: { value: 'Custom header content' }
      
      # Header placement options
      location: com.atlassian.jira.portal.header
      
      conditions:
        - condition: user_is_authenticated
        
      styles: |
        .my-custom-header {
          background-color: #00657f;
          color: white;
          padding: 12px;
        }
```

### Custom Footer

Add a custom footer to the customer portal.

```yaml
modules:
  jiraServiceManagement:portalFooter:
    - key: my-footer
      name: { value: 'My Portal Footer' }
      description: { value: 'Custom footer content' }
      
      location: com.atlassian.jira.portal.footer
      
      styles: |
        .my-custom-footer {
          background-color: #f4f5f7;
          padding: 16px;
          text-align: center;
        }
```

---

## Unlicensed Access

JSM modules support unlicensed access for customer users.

```yaml
modules:
  jiraServiceManagement:portalRequestDetail:
    - key: public-info-panel
      name: { value: 'Public Information Panel' }
      description: { value: 'Visible to all portal users' }
      resource: main
      
      # Allow unlicensed access
      unlicensedAccess:
        - customer
        - unlicensed
        
      conditions:
        - condition: product_has_module
          moduleType: jiraServiceManagement:portalRequestDetail
```

---

## Context Information

Modules receive context including:

```javascript
// Portal request detail context
{
  "type": "jiraServiceManagement:portalRequestDetail",
  "portal": { 
    "id": 123,
    "key": "SVC"
  },
  "request": {
    "key": "SVC-456",
    "typeId": 789,
    "fields": {
      "summary": "Issue summary",
      "status": { "name": "In Progress" }
    }
  }
}

// Organization panel context
{
  "type": "jiraServiceManagement:organizationPanel",
  "portal": { "id": 123 },
  "organization": {
    "id": "org-789",
    "name": "Acme Corporation"
  }
}
```

---

## Complete Example

### manifest.yml

```yaml
modules:
  jiraServiceManagement:portalRequestDetail:
    - key: request-info-panel
      name: { value: 'Request Information' }
      description: { value: 'Shows extended request details' }
      resource: main
      icon: {
        width: 24,
        height: 24,
        svg: "<svg viewBox='0 0 24 24'><path d='M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z'/></svg>"
      }
      
      location: com.atlassian.jira.issue.views:right-sidebar
      
      conditions:
        - condition: user_is_authenticated
        
  jiraServiceManagement:portalHeader:
    - key: custom-header
      name: { value: 'Custom Portal Header' }
      description: { value: 'My company header' }
      
      location: com.atlassian.jira.portal.header

permissions:
  scopes:
    - read:jira-work
    - read:issue:jira
    - read:user:jira
    - read:project:jira
    
resources:
  - key: main
    path: src/main.js
    type: node
```

### src/main.js

```javascript
export async function handler(payload, context) {
  console.log('Module triggered:', JSON.stringify(payload, null, 2));
  
  try {
    const { request, portal } = payload;
    
    if (!request?.key) {
      return {
        content: 'No request data available'
      };
    }
    
    // Fetch additional issue data
    const response = await api.asApp().requestJira(
      `/rest/api/3/issue/${request.key}?expand=changelog`
    );
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const issue = await response.json();
    
    return {
      content: `
        <div class="jsm-panel">
          <h3>Request Details</h3>
          
          <div class="request-info">
            <p><strong>Key:</strong> ${issue.key}</p>
            <p><strong>Title:</strong> ${issue.fields.summary}</p>
            <p><strong>Status:</strong> ${issue.fields.status.name}</p>
            <p><strong>Priority:</strong> ${issue.fields.priority?.name || 'N/A'}</p>
            <p><strong>Created:</strong> ${new Date(issue.fields.created).toLocaleDateString()}</p>
          </div>
          
          <div class="sla-info">
            <h4>SLA Information</h4>
            <!-- Add your SLA display logic here -->
          </div>
        </div>
      `,
      styles: `
        .jsm-panel {
          padding: 16px;
        }
        
        .request-info p {
          margin-bottom: 8px;
        }
        
        .sla-info {
          margin-top: 16px;
          border-top: 1px solid #e0e0e0;
          padding-top: 12px;
        }
      `
    };
  } catch (error) {
    console.error('Panel error:', error);
    
    return {
      content: `
        <div class="jsm-panel">
          <p>Error loading panel</p>
        </div>
      `,
      styles: `
        .jsm-panel {
          padding: 16px;
        }
      `
    };
  }
}
```

---

## Common Use Cases

### 1. Service Level Monitoring
Display SLA timers and breaches in request views.

```javascript
// Example: Show SLA countdown
const slaInfo = await fetchSlaData(request.key);
return {
  content: `<div class="sla-timer">${formatTimeLeft(slaInfo.timeLeft)}</div>`
};
```

### 2. Knowledge Base Integration
Display related articles in portal views.

```javascript
// Example: Show related KB articles
const articles = await searchKnowledgeBase(issue.fields.summary);
return {
  content: renderArticlesList(articles)
};
```

### 3. Custom Field Display
Show additional data not visible in default portal.

```javascript
// Example: Display custom fields
const customFields = await fetchCustomFields(request.key);
return { content: buildCustomFieldView(customFields) };
```

### 4. Action Triggers
Add buttons to trigger external actions.

```javascript
// Example: Create ticket in external system
return {
  content: `
    <button onclick="createExternalTicket('${request.key}')">
      Sync to External System
    </button>
  `,
  scripts: [
    'src/actions.js'
  ]
};
```

---

## Permissions Required

```yaml
permissions:
  scopes:
    - read:jira-work          # View issue data
    - read:issue:jira         # Issue details
    - read:user:jira          # User information
    - read:project:jira       # Project data
    - read:portal-management  # Portal management (for some modules)
```

---

## Best Practices

1. **Keep Content Lightweight** - Portal modules should be fast and responsive
2. **Handle Errors Gracefully** - Always provide fallback content for errors
3. **Respect Permissions** - Check user permissions before showing sensitive data
4. **Use Caching** - Cache expensive operations to improve performance
5. **Test with Different User Types** - Verify behavior for licensed, unlicensed, and customer users

## Related Documentation

- [Forge Getting Started](../01-getting-started.md)
- [Jira Modules Reference](../jira-modules/README.md)