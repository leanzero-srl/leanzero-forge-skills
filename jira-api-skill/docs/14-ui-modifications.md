# Forge UI Modifications Code Examples

This document provides comprehensive code examples for extending Atlassian product UIs using Forge UI modifications. These allow you to customize and extend existing user interfaces in Jira, Confluence, and Bitbucket.

## Table of Contents
1. [Jira UI Modifications](#jira-ui-modifications)
2. [Confluence Macros with Custom UI](#confluence-macros-with-custom-ui)
3. [Bitbucket UI Extensions](#bitbucket-ui-extensions)
4. [Advanced Patterns](#advanced-patterns)

---

## Jira UI Modifications

### Overview

Jira UI modifications allow you to:
- Add content to issue views
- Modify the layout of existing pages
- Insert custom elements into standard Atlassian interfaces
- Extend the context menu and actions toolbar

### Module Configuration

```yaml
modules:
  jira:uiModification:
    - key: issue-view-sidebar
      name: { value: 'Issue Sidebar Content' }
      description: { value: 'Adds custom information to issue sidebar' }
      function: sidebarContentFunction
      icon: {
        width: 24,
        height: 24,
        svg: "<svg viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'><path d='M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z'/></svg>"
      }
      
      # Where the modification appears
      location: com.atlassian.jira.issue.views:right-sidebar
      
      # Conditions for visibility
      conditions:
        - condition: user_is_authenticated
        - condition: product_has_module
          moduleType: jira:issue-view
      
      # Configuration UI (optional)
      configurationUI:
        fields:
          - key: displayField
            type: text
            label: Custom Field to Display
            defaultValue: 'customfield_10000'
```

### Function Implementation

```javascript
export const sidebarContentFunction = async (payload, context) => {
  console.log('UI modification triggered:', JSON.stringify(payload, null, 2));
  
  // Extract issue information from payload
  const { issue, viewState } = payload;
  
  try {
    // Your logic to generate content
    return {
      content: {
        type: 'panel',
        children: [
          {
            type: 'textBlock',
            text: 'Custom Issue Information'
          },
          {
            type: 'divider'
          },
          {
            type: 'textBlock',
            text: `Issue Key: ${issue.key}`,
            isSubtle: true
          },
          {
            type: 'textBlock',
            text: `Status: ${issue.fields.status.name}`
          }
        ]
      },
      style: {
        marginTop: '16px'
      }
    };
  } catch (error) {
    console.error('UI modification error:', error);
    
    return {
      content: {
        type: 'panel',
        children: [
          {
            type: 'textBlock',
            text: 'Error loading custom content',
            isError: true
          }
        ]
      }
    };
  }
};
```

### Available Locations

| Location | Description |
|----------|-------------|
| `com.atlassian.jira.issue.views:right-sidebar` | Right sidebar of issue view |
| `com.atlassian.jira.issue.views:left-sidebar` | Left sidebar of issue view |
| `com.atlassian.jira.issue.views:content-top` | Top of issue content area |
| `com.atlassian.jira.issue.views:content-bottom` | Bottom of issue content area |
| `com.atlassian.jira.issue.views:actions` | Actions toolbar |
| `com.atlassian.jira.issue.views:description` | Issue description section |

---

## Confluence Macros with Custom UI

### Overview

Confluence macros embed dynamic content into pages and blog posts. Forge allows you to create custom macros with:
- Dynamic content generation
- User interaction through configuration panels
- Real-time data fetching from Jira or other sources
- Custom styling and formatting

### Basic Macro Configuration

```yaml
modules:
  macro:
    - key: jira-issue-macro
      name: { value: 'Jira Issue Viewer' }
      description: { value: 'Embeds a Jira issue with custom formatting' }
      function: issueViewerFunction
      icon: {
        width: 24,
        height: 24,
        svg: "<svg viewBox='0 0 24 24'><path d='M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z'/></svg>"
      }
      
      # Where the macro can be used
      locations:
        - confluence-content
        
      # Whether it appears in the macro browser
      inline: false
      
      # Accept parameters from user
      acceptsparameters: true
```

### Function with Parameters

```javascript
export const issueViewerFunction = async (payload, context) => {
  console.log('Macro execution payload:', JSON.stringify(payload, null, 2));
  
  // Extract macro parameters
  const { params, contentId } = payload;
  
  // Get the issue key from parameters or default to something
  const issueKey = params.issueKey || 'DEFAULT-1';
  
  try {
    // Fetch issue data from Jira
    const response = await api.asApp().requestJira(
      `/rest/api/3/issue/${issueKey}?expand=changelog`
    );
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const issue = await response.json();
    
    return {
      content: `
        <div class="jira-issue-macro" data-issue-key="${issueKey}">
          <div class="issue-header">
            <h3 class="issue-key">${issue.key}</h3>
            <span class="issue-type ${issue.fields.issuetype.name.toLowerCase()}">
              ${issue.fields.issuetype.name}
            </span>
          </div>
          
          <div class="issue-body">
            <h4>${issue.fields.summary}</h4>
            
            <div class="issue-details">
              <div class="detail-item">
                <strong>Assignee:</strong> 
                ${issue.fields.assignee?.displayName || 'Unassigned'}
              </div>
              <div class="detail-item">
                <strong>Status:</strong> 
                ${issue.fields.status.name}
              </div>
              <div class="detail-item">
                <strong>Priority:</strong> 
                ${issue.fields.priority?.name || 'No priority'}
              </div>
            </div>
            
            ${issue.fields.description ? `
              <div class="issue-description">
                <h5>Description</h5>
                <div>${issue.fields.description}</div>
              </div>
            ` : ''}
          </div>
        </div>
      `,
      styles: `
        .jira-issue-macro {
          border: 1px solid #e0e0e0;
          border-radius: 4px;
          padding: 16px;
          background-color: #f8f9fa;
        }
        
        .issue-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
          border-bottom: 1px solid #e0e0e0;
          padding-bottom: 8px;
        }
        
        .issue-key {
          font-size: 14px;
          font-weight: bold;
          color: #172b4d;
        }
        
        .issue-type {
          padding: 2px 8px;
          border-radius: 3px;
          font-size: 11px;
          text-transform: uppercase;
        }
        
        .issue-type bug {
          background-color: #ffebe6;
          color: #c4372b;
        }
        
        .issue-type story, .issue-type task {
          background-color: #dbeafe;
          color: #1e6bb8;
        }
        
        .detail-item {
          margin-bottom: 4px;
          font-size: 13px;
        }
      `
    };
  } catch (error) {
    console.error('Macro execution error:', error);
    
    return {
      content: `
        <div class="jira-issue-macro">
          <p class="error-message">Error loading issue: ${error.message}</p>
        </div>
      `,
      styles: `
        .jira-issue-macro {
          border: 1px solid #e0e0e0;
          border-radius: 4px;
          padding: 16px;
          background-color: #f8f9fa;
        }
        
        .error-message {
          color: #c4372b;
        }
      `
    };
  }
};
```

### Configuration UI for Macros

```yaml
modules:
  macro:
    - key: report-macro
      name: { value: 'Custom Report Generator' }
      description: { value: 'Generates custom project reports' }
      function: reportGeneratorFunction
      
      configurationUI:
        formFields:
          - fieldId: projectId
            label: { value: 'Project' }
            type: select
            options:
              apiOptions: projects
            required: true
            
          - fieldId: reportType
            label: { value: 'Report Type' }
            type: select
            options:
              - label: { value: 'Summary' }
                value: summary
              - label: { value: 'Detailed' }
                value: detailed
              - label: { value: 'Timeline' }
                value: timeline
            required: true
            
          - fieldId: includeAttachments
            label: { value: 'Include Attachments' }
            type: checkbox
```

---

## Bitbucket UI Extensions

### Overview

Bitbucket UI modifications allow you to:
- Add content to pull request views
- Extend the branch management interface
- Customize repository settings
- Add custom actions and buttons

### PR Page Extension

```yaml
modules:
  bitbucket:uiModification:
    - key: pr-detail-panel
      name: { value: 'PR Review Information' }
      description: { value: 'Shows additional review information on pull requests' }
      function: prDetailPanelFunction
      
      # Where the modification appears
      location: com.atlassian.bitbucket.pull-request:right-sidebar
      
      # Conditions for visibility
      conditions:
        - condition: user_is_authenticated
```

### Function Implementation

```javascript
export const prDetailPanelFunction = async (payload, context) => {
  console.log('PR UI modification:', JSON.stringify(payload, null, 2));
  
  const { pullRequest, repository } = payload;
  
  try {
    // Analyze the PR
    const analysis = await analyzePullRequest(pullRequest);
    
    return {
      content: {
        type: 'panel',
        title: 'PR Analysis',
        children: [
          {
            type: 'section',
            items: [
              { type: 'textBlock', text: `Lines Added: ${analysis.linesAdded}` },
              { type: 'textBlock', text: `Files Changed: ${analysis.filesChanged}` }
            ]
          },
          {
            type: 'divider'
          },
          {
            type: 'section',
            items: [
              { 
                type: 'textBlock', 
                text: `Complexity: ${analysis.complexity}`,
                isEmphasized: analysis.complexity === 'High' 
              }
            ]
          }
        ]
      },
      actions: [
        {
          label: { value: 'View Details' },
          primary: true,
          onClick: async () => {
            await openDetailsModal(pullRequest);
          }
        }
      ]
    };
  } catch (error) {
    console.error('PR analysis error:', error);
    
    return {
      content: {
        type: 'panel',
        title: 'Analysis Error',
        children: [
          { type: 'textBlock', text: 'Could not analyze PR' }
        ]
      }
    };
  }
};

const analyzePullRequest = async (pullRequest) => {
  // Simple analysis logic
  const filesChanged = pullRequest.fromRef.diffStat?.files || [];
  
  return {
    linesAdded: pullRequest.fromRef.diffStat?.added || 0,
    linesDeleted: pullRequest.fromRef.diffStat?.deleted || 0,
    filesChanged: filesChanged.length,
    complexity: 'Medium'
  };
};
```

### Available Bitbucket Locations

| Location | Description |
|----------|-------------|
| `com.atlassian.bitbucket.pull-request:right-sidebar` | Right sidebar of PR view |
| `com.atlassian.bitbucket.pull-request:left-sidebar` | Left sidebar of PR view |
| `com.atlassian.bitbucket.pull-request:content` | Pull request content area |
| `com.atlassian.bitbucket.repository:settings` | Repository settings page |

---

## Advanced Patterns

### Dynamic Content Based on Context

```javascript
export const dynamicContentFunction = async (payload, context) => {
  // Determine context and adjust content accordingly
  
  if (payload.issue) {
    // Issue view context
    return buildIssuePanel(payload.issue);
  } else if (payload.pullRequest) {
    // PR context
    return buildPRPanel(payload.pullRequest);
  } else if (payload.page) {
    // Confluence page context
    return buildPageWidget(payload.page);
  }
  
  // Default content
  return { content: 'No supported context found' };
};
```

### State Management

```javascript
let cachedData = null;
let cacheTime = null;

const CACHE_TTL = 60000; // 1 minute

export const cachedContentFunction = async (payload, context) => {
  const now = Date.now();
  
  if (!cachedData || !cacheTime || (now - cacheTime > CACHE_TTL)) {
    console.log('Fetching fresh data...');
    cachedData = await fetchDataFromSource();
    cacheTime = now;
  } else {
    console.log('Using cached data');
  }
  
  return { content: renderContent(cachedData) };
};
```

### Error Boundary Pattern

```javascript
export const robustContentFunction = async (payload, context) => {
  try {
    // Main execution logic
    return await executeMainLogic(payload, context);
  } catch (error) {
    console.error('Error in content generation:', error);
    
    // Return user-friendly error message
    return {
      content: {
        type: 'panel',
        children: [
          {
            type: 'icon',
            svg: '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>',
            width: '24px'
          },
          {
            type: 'textBlock',
            text: 'Something went wrong',
            isEmphasized: true
          },
          {
            type: 'textBlock',
            text: error.message || 'An unexpected error occurred',
            size: 'small'
          }
        ]
      }
    };
  }
};
```

### Performance Optimization

```javascript
export const optimizedContentFunction = async (payload, context) => {
  // Only fetch data if we have a valid payload
  if (!payload?.issue?.key) {
    return { content: 'No issue data available' };
  }
  
  // Check for required permissions before making API calls
  const hasPermission = await checkPermissions(context);
  if (!hasPermission) {
    return { content: 'Permission denied' };
  }
  
  // Fetch data with timeout protection
  const fetchWithTimeout = (url, options = {}, ms = 5000) => {
    return Promise.race([
      api.asApp().requestJira(url, options),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Request timeout')), ms)
      )
    ]);
  };
  
  try {
    const response = await fetchWithTimeout(`/rest/api/3/issue/${payload.issue.key}`);
    return { content: renderContent(await response.json()) };
  } catch (error) {
    if (error.message === 'Request timeout') {
      return { content: 'Loading data...' }; // Could show loading state
    }
    throw error;
  }
};
```

---

## Best Practices

1. **Keep Content Lightweight** - UI modifications should be fast and responsive
2. **Handle Errors Gracefully** - Always provide fallback content for errors
3. **Respect Permissions** - Check user permissions before showing sensitive data
4. **Use Caching** - Cache expensive operations to improve performance
5. **Optimize Images** - Use SVG icons instead of raster images when possible

## Related Documentation

- [Forge UI Kit Components](./17-ui-kit-components.md)
- [Bridge API Reference](./15-bridge-api-reference.md)
- [Resolver Patterns](./16-resolver-patterns.md)