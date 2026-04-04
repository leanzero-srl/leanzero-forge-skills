# Dashboard Widgets Code Examples

This document provides code examples for implementing dashboard widgets in Atlassian Forge apps. Dashboard widgets display custom content on Jira dashboards, allowing you to show data, metrics, and interactive elements.

## Table of Contents
1. [Basic Dashboard Widget](#basic-dashboard-widget)
2. [Dashboard Configuration](#dashboard-configuration)
3. [Accessing Dashboard Context](#accessing-dashboard-context)
4. [Common Use Cases](#common-use-cases)
5. [Error Handling](#error-handling)

---

## Basic Dashboard Widget

### Manifest Configuration

```yaml
modules:
  jira:dashboardGadget:
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

const fetchStatistics = async (dashboard) => {
  // Get current user and context
  const { accountId } = dashboard.context;
  
  // Fetch data based on context
  return {
    projectKey: 'PROJ',
    totalIssues: 150,
    openIssues: 45,
    inProgress: 30,
    completedToday: 5
  };
};

const renderWidgetContent = (stats) => {
  return `
    <div style="padding: 16px;">
      <h3>Project Statistics</h3>
      <p><strong>Total Issues:</strong> ${stats.totalIssues}</p>
      <p><strong>Open Issues:</strong> ${stats.openIssues}</p>
      <p><strong>In Progress:</strong> ${stats.inProgress}</p>
      <p><strong>Completed Today:</strong> ${stats.completedToday}</p>
    </div>
  `;
};
```

---

## Dashboard Configuration

### Full Widget Manifest with Options

```yaml
modules:
  jira:dashboardGadget:
    - key: project-health-widget
      name: { value: 'Project Health Dashboard' }
      description: { value: 'Shows health metrics for selected projects' }
      function: projectHealthWidget
      
      # Optional configuration UI
      create:
        resource: config-ui
        
      # Widget properties
      width: wide
        
    - key: my-tasks-widget
      name: { value: 'My Tasks' }
      description: { value: 'Shows tasks assigned to current user' }
      function: myTasksWidget
      requiresContext: true
```

### React Configuration UI

```javascript
import { dashboard } from '@forge/bridge';

export const ConfigUI = () => {
  const [projectKey, setProjectKey] = useState('');
  const [showOpenIssues, setShowOpenIssues] = useState(true);
  
  const onSave = async () => {
    await dashboard.configure({
      projectKey,
      showOpenIssues
    });
  };
  
  return (
    <div style={{ padding: '16px' }}>
      <h2>Project Health Configuration</h2>
      
      <label htmlFor="project-key">Project Key:</label>
      <input
        id="project-key"
        type="text"
        value={projectKey}
        onChange={(e) => setProjectKey(e.target.value)}
      />
      
      <label>
        <input
          type="checkbox"
          checked={showOpenIssues}
          onChange={(e) => setShowOpenIssues(e.target.checked)}
        />
        {' '}Show Open Issues Count
      </label>
      
      <button onClick={onSave}>Save Configuration</button>
    </div>
  );
};
```

---

## Accessing Dashboard Context

### Complete Context Structure

```javascript
export const dashboardWidget = async (payload, context) => {
  console.log('Full payload:', JSON.stringify(payload, null, 2));
  
  // Dashboard information
  const { 
    dashboard,
    context: dashboardContext
  } = payload;
  
  // Context includes:
  // - accountId: User's Atlassian account ID
  // - cloudId: Atlassian Cloud ID
  // - installContext: App installation context
  console.log(`User: ${dashboardContext.accountId}`);
  console.log(`Cloud: ${dashboardContext.cloudId}`);
  
  // Dashboard metadata
  const { 
    id,           // Dashboard ID
    name,         // Dashboard name
    type          // Dashboard type (system, user, shared)
  } = dashboard;
  
  console.log(`Dashboard: ${name} (${id})`);
  
  return {
    statusCode: 200,
    body: {
      title: `Widget for ${dashboard.name}`,
      content: renderContent(dashboardContext),
      link: {
        url: `/dashboards/${dashboard.id}`,
        text: 'View Dashboard'
      }
    }
  };
};

const renderContent = (context) => {
  return `
    <div>
      <p>Welcome, ${context.accountId}</p>
      <p>You're viewing this on the ${context.dashboardType} dashboard</p>
    </div>
  `;
};
```

---

## Common Use Cases

### 1. Project Health Dashboard

```yaml
modules:
  jira:dashboardGadget:
    - key: project-health-widget
      name: { value: 'Project Health' }
      description: { value: 'Shows project health metrics' }
      function: projectHealthWidget
      requiresContext: true
```

```javascript
export const projectHealthWidget = async (payload, context) => {
  try {
    const { dashboard } = payload;
    
    // Get issues for the project
    const response = await api.asApp().requestJira('/rest/api/3/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jql: `project = ${dashboard.projectKey} ORDER BY updated DESC`,
        maxResults: 50,
        fields: ['key', 'summary', 'status', 'priority']
      })
    });
    
    const data = await response.json();
    const issues = data.issues;
    
    // Calculate health metrics
    const stats = calculateHealthStats(issues);
    
    return {
      statusCode: 200,
      body: {
        title: `Project Health - ${dashboard.projectKey}`,
        content: renderHealthWidget(stats),
        link: {
          url: `/projects/${dashboard.projectKey}/summary`,
          text: 'View Project'
        }
      }
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: {
        title: 'Project Health',
        content: `<p>Error loading data</p>`,
        link: null
      }
    };
  }
};

const calculateHealthStats = (issues) => {
  const stats = {
    total: issues.length,
    open: 0,
    inProgress: 0,
    completed: 0,
    critical: 0
  };
  
  for (const issue of issues) {
    const status = issue.fields.status.name.toLowerCase();
    if (status.includes('done') || status.includes('completed')) {
      stats.completed++;
    } else if (status.includes('in progress')) {
      stats.inProgress++;
    } else {
      stats.open++;
    }
    
    if (issue.fields.priority?.name === 'Critical' ||
        issue.fields.priority?.name === 'Highest') {
      stats.critical++;
    }
  }
  
  return stats;
};

const renderHealthWidget = (stats) => {
  const colorForCount = (count, threshold) => 
    count >= threshold ? 'red' : (count > 0 ? 'orange' : 'green');
  
  return `
    <div style="padding: 16px;">
      <h3>Project Health</h3>
      
      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;">
        <div style="background: #e0f7fa; padding: 8px; border-radius: 4px;">
          <strong>Total Issues</strong><br>
          ${stats.total}
        </div>
        
        <div style="background: ${colorForCount(stats.critical, 5) === 'red' ? '#ffebee' : '#e0f7fa'}; padding: 8px; border-radius: 4px;">
          <strong>Critical/High</strong><br>
          ${stats.critical}
        </div>
        
        <div style="background: #fff3e0; padding: 8px; border-radius: 4px;">
          <strong>Open Issues</strong><br>
          ${stats.open}
        </div>
        
        <div style="background: #c8e6c9; padding: 8px; border-radius: 4px;">
          <strong>Completed</strong><br>
          ${stats.completed}
        </div>
      </div>
    </div>
  `;
};
```

### 2. My Tasks Widget

```yaml
modules:
  jira:dashboardGadget:
    - key: my-tasks-widget
      name: { value: 'My Tasks' }
      description: { value: 'Shows tasks assigned to me' }
      function: myTasksWidget
      requiresContext: true
```

```javascript
export const myTasksWidget = async (payload, context) => {
  try {
    const { dashboard } = payload;
    
    // Get current user from context
    const currentUser = dashboard.context.accountId;
    
    // Find issues assigned to current user
    const response = await api.asApp().requestJira('/rest/api/3/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jql: `assignee = ${currentUser} ORDER BY priority DESC`,
        maxResults: 10,
        fields: ['key', 'summary', 'status', 'priority']
      })
    });
    
    const data = await response.json();
    
    return {
      statusCode: 200,
      body: {
        title: `My Tasks (${data.total})`,
        content: renderTasksWidget(data.issues),
        link: {
          url: `/secure/MyIssues.jspa?assignee=${currentUser}`,
          text: 'View All My Issues'
        }
      }
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: { title: 'My Tasks', content: '<p>Error loading tasks</p>' }
    };
  }
};

const renderTasksWidget = (issues) => {
  if (!issues || issues.length === 0) {
    return `<div style="padding: 16px; text-align: center;">No tasks found</div>`;
  }
  
  let html = '<ul style="list-style: none; padding: 0; margin: 0;">';
  for (const issue of issues) {
    const priorityColor = getPriorityColor(issue.fields.priority?.name);
    
    html += `
      <li style="padding: 8px; border-bottom: 1px solid #eee;">
        <span style="color: ${priorityColor}; font-weight: bold;">${issue.fields.priority.name}</span>
        <a href="/browse/${issue.key}" style="text-decoration: none;">
          ${issue.fields.summary}
        </a>
      </li>
    `;
  }
  html += '</ul>';
  
  return html;
};

const getPriorityColor = (priorityName) => {
  const colors = {
    'Highest': '#d32f2f',
    'High': '#f57c00',
    'Medium': '#1976d2',
    'Low': '#388e3c',
    'Lowest': '#757575'
  };
  return colors[priorityName] || '#000';
};
```

### 3. Recent Activity Widget

```yaml
modules:
  jira:dashboardGadget:
    - key: recent-activity-widget
      name: { value: 'Recent Activity' }
      description: { value: 'Shows recent activity on the project' }
      function: recentActivityWidget
```

```javascript
export const recentActivityWidget = async (payload, context) => {
  try {
    // Get recent issues updated in last 24 hours
    const response = await api.asApp().requestJira('/rest/api/3/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jql: 'updated >= startOfDay(-1)',
        maxResults: 10,
        fields: ['key', 'summary', 'status', 'assignee', 'updated']
      })
    });
    
    const data = await response.json();
    
    return {
      statusCode: 200,
      body: {
        title: 'Recent Activity',
        content: renderActivityWidget(data.issues),
        link: {
          url: `/secure/IssueNavigator.jspa?jql=updated%20%3E=%20startOfDay(-1)`,
          text: 'View All Recent'
        }
      }
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: { title: 'Activity', content: '<p>Error loading activity</p>' }
    };
  }
};

const renderActivityWidget = (issues) => {
  if (!issues || issues.length === 0) {
    return `<div style="padding: 16px; text-align: center;">No recent activity</div>`;
  }
  
  let html = '<ul style="list-style: none; padding: 0;">';
  for (const issue of issues) {
    const updatedDate = new Date(issue.fields.updated);
    
    html += `
      <li style="padding: 8px; border-bottom: 1px solid #eee;">
        <a href="/browse/${issue.key}" style="text-decoration: none;">
          ${issue.fields.summary}
        </a>
        <div style="font-size: 0.9em; color: #666;">
          Updated by ${issue.fields.assignee?.displayName || 'Unknown'} 
          on ${updatedDate.toLocaleDateString()}
        </div>
      </li>
    `;
  }
  html += '</ul>';
  
  return html;
};
```

---

## Error Handling

### Comprehensive Error Handling

```javascript
export const robustDashboardWidget = async (payload, context) => {
  try {
    // Validate payload
    if (!payload?.dashboard?.context?.accountId) {
      throw new Error('Missing dashboard context');
    }
    
    // Your widget logic
    const data = await fetchWidgetData(payload.dashboard);
    
    return {
      statusCode: 200,
      body: {
        title: 'Widget Title',
        content: renderContent(data),
        link: { url: '/link', text: 'View' }
      }
    };
  } catch (error) {
    console.error('Dashboard widget error:', {
      message: error.message,
      stack: error.stack
    });
    
    return {
      statusCode: 500,
      body: {
        title: 'Widget Title',
        content: `<p style="color: #d32f2f;">Error loading data: ${error.message}</p>`,
        link: null
      }
    };
  }
};
```

### Graceful Degradation

```javascript
export const gracefulWidget = async (payload, context) => {
  try {
    // Try primary data source
    return await fetchPrimaryData(payload);
  } catch (primaryError) {
    console.warn('Primary data source failed:', primaryError);
    
    try {
      // Fall back to cached/secondary data
      return await fetchCachedData();
    } catch (fallbackError) {
      console.error('Fallback also failed:', fallbackError);
      
      return {
        statusCode: 200,
        body: {
          title: 'Widget',
          content: '<p>Data temporarily unavailable</p>',
          link: null
        }
      };
    }
  }
};
```

---

## Best Practices

1. **Keep widgets lightweight** - Fast loading improves user experience
2. **Handle errors gracefully** - Show meaningful error messages
3. **Respect permissions** - Only show data the user can access
4. **Use proper formatting** - Consistent styling across widgets
5. **Test with different contexts** - Widgets should work for all users

---

## Related Documentation

- [Forge Dashboard Widgets](https://developer.atlassian.com/cloud/forge/application-structure/#jira:dashboardGadget)