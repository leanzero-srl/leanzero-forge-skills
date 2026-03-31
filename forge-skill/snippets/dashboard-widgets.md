# Dashboard Widgets Code Examples

This document provides code examples for implementing custom dashboard widgets in Atlassian Forge apps (via dashboard-background-script EAP). These widgets allow you to display custom content on Jira dashboards.

## Table of Contents
1. [Basic Dashboard Widget](#basic-dashboard-widget)
2. [Dashboard Configuration](#dashboard-configuration)
3. [Accessing Widget Context](#accessing-widget-context)
4. [Common Use Cases](#common-use-cases)
5. [Error Handling](#error-handling)

---

## Basic Dashboard Widget

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
  console.log('Dashboard widget requested:', JSON.stringify(payload, null, 2));
  
  try {
    // Get context data if available
    const { dashboard } = payload;
    
    // Fetch data for the widget
    const statsData = await fetchStatistics(dashboard);
    
    // Return widget configuration
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
    console.error('Dashboard widget error:', error);
    
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
  // Get user's assigned issues count
  const response = await api.asUser().requestJira('/rest/api/3/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jql: `assignee = currentUser() AND status != Done`,
      maxResults: 0
    })
  });
  
  const data = await response.json();
  
  return {
    assignedIssues: data.total,
    projectKey: 'PROJ',
    widgetId: dashboard?.id || 'default'
  };
};

const renderWidgetContent = (stats) => {
  return `
    <div style="padding: 16px;">
      <h3 style="margin: 0 0 12px 0;">My Assigned Issues</h3>
      <div style="font-size: 48px; font-weight: bold; color: #0052cc;">
        ${stats.assignedIssues}
      </div>
      <p style="margin: 8px 0 0 0; color: #6b7280;">
        Issues assigned to you
      </p>
    </div>
  `;
};
```

---

## Dashboard Configuration

### With Custom Settings

```yaml
modules:
  dashboard-background-script:
    - key: custom-widget-with-settings
      name: { value: 'Advanced Statistics' }
      description: { value: 'Displays advanced statistics with configuration' }
      function: advancedStatsFunction
      requiresContext: true
```

### Function with Configuration Handling

```javascript
export const advancedStatsFunction = async (payload, context) => {
  console.log('Widget payload:', JSON.stringify(payload, null, 2));
  
  try {
    // Extract widget settings from context
    const { dashboard, user } = payload;
    
    // Get widget configuration (stored in KVS or as part of widget config)
    const config = await getWidgetConfiguration(user.accountId);
    
    // Fetch data based on configuration
    const statsData = await fetchAdvancedStatistics(config);
    
    return {
      statusCode: 200,
      body: {
        title: config.title || 'Custom Statistics',
        content: renderAdvancedContent(statsData, config),
        link: config.linkUrl ? {
          url: config.linkUrl,
          text: config.linkLabel || 'View details'
        } : null
      }
    };
  } catch (error) {
    console.error('Widget error:', error);
    
    return {
      statusCode: 500,
      body: {
        title: 'Error',
        content: `<p>${error.message}</p>`,
        link: null
      }
    };
  }
};

const getWidgetConfiguration = async (userId) => {
  // Fetch stored configuration from KVS or external source
  return {
    title: 'My Dashboard Stats',
    linkUrl: '/dashboard',
    linkLabel: 'Full Report',
    showDetails: true
  };
};

const fetchAdvancedStatistics = async (config) => {
  // Complex data fetching logic
  const issuesResponse = await api.asUser().requestJira('/rest/api/3/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jql: 'assignee = currentUser() ORDER BY created DESC',
      maxResults: 10
    })
  });
  
  const issuesData = await issuesResponse.json();
  
  return {
    recentIssues: issuesData.issues.slice(0, 5),
    totalAssigned: issuesData.total,
    userAccountId: config.userAccountId
  };
};

const renderAdvancedContent = (data, config) => {
  let html = `
    <div style="padding: 16px;">
      <h3 style="margin: 0 0 12px 0;">${config.title}</h3>
      <ul style="list-style: none; padding: 0; margin: 0;">
  `;
  
  data.recentIssues.forEach(issue => {
    html += `
      <li style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;">
        <strong><a href="/browse/${issue.key}">${issue.key}</a></strong>
        <p style="margin: 4px 0 0 0; color: #6b7280;">${issue.fields.summary}</p>
      </li>
    `;
  });
  
  html += `
      </ul>
      <p style="margin-top: 12px; font-size: 12px; color: #9ca3af;">
        Showing ${data.recentIssues.length} of ${data.totalAssigned} issues
      </p>
    </div>
  `;
  
  return html;
};
```

---

## Accessing Widget Context

The dashboard widget payload includes context about the user and dashboard:

```javascript
export const contextualWidgetFunction = async (payload, context) => {
  console.log('Full widget context:', JSON.stringify(payload, null, 2));
  
  // User information
  const { user } = payload;
  const { 
    accountId,
    displayName,
    emailAddress,
    active,
    timeZone
  } = user;
  
  // Dashboard information (if available)
  const { dashboard, page } = payload;
  
  console.log(`User: ${displayName} (${accountId})`);
  console.log(`Dashboard: ${dashboard?.id || 'unknown'}`);
  console.log(`Page: ${page?.id || 'unknown'}`);
  
  // Timezone-aware content
  const localTime = new Date().toLocaleString(timeZone || 'UTC');
  
  return {
    statusCode: 200,
    body: {
      title: `Hi, ${displayName.split(' ')[0]}!`,
      content: `
        <div style="padding: 16px;">
          <p>Local time: ${localTime}</p>
          <p>Your timezone: ${timeZone || 'Unknown'}</p>
        </div>
      `,
      link: null
    }
  };
};
```

---

## Common Use Cases

### 1. Project Health Dashboard Widget

```yaml
modules:
  dashboard-background-script:
    - key: project-health-widget
      name: { value: 'Project Health' }
      description: { value: 'Displays overall project health metrics' }
      function: projectHealthWidgetFunction
```

```javascript
export const projectHealthWidgetFunction = async (payload, context) => {
  console.log('Generating project health widget...');
  
  try {
    const { user } = payload;
    
    // Get projects the user has access to
    const projectsResponse = await api.asUser().requestJira('/rest/api/3/project', {
      method: 'GET',
      query: { startAt: 0, maxResults: 10 }
    });
    
    const projectsData = await projectsResponse.json();
    
    // Calculate health metrics for each project
    const metrics = await calculateHealthMetrics(projectsData.values);
    
    return {
      statusCode: 200,
      body: {
        title: 'My Projects',
        content: renderProjectHealth(metrics),
        link: {
          url: '/projects',
          text: 'View all projects'
        }
      }
    };
  } catch (error) {
    console.error('Health widget error:', error);
    
    return {
      statusCode: 500,
      body: {
        title: 'Project Health',
        content: '<p>Could not load project health</p>',
        link: null
      }
    };
  }
};

const calculateHealthMetrics = async (projects) => {
  // For each project, get some metrics
  const metrics = [];
  
  for (const project of projects.slice(0, 3)) { // Limit to 3 projects
    try {
      // Get open issues count
      const searchResponse = await api.asUser().requestJira('/rest/api/3/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jql: `project = ${project.key} AND status != Done`,
          maxResults: 0
        })
      });
      
      const searchData = await searchResponse.json();
      
      metrics.push({
        projectKey: project.key,
        projectName: project.name,
        openIssues: searchData.total
      });
    } catch (error) {
      console.error(`Error fetching metrics for ${project.key}:`, error);
    }
  }
  
  return metrics;
};

const renderProjectHealth = (metrics) => {
  let html = '<div style="padding: 16px;">';
  
  if (metrics.length === 0) {
    html += '<p>No projects found.</p>';
  } else {
    html += '<ul style="list-style: none; padding: 0; margin: 0;">';
    
    metrics.forEach(metric => {
      const statusColor = metric.openIssues > 50 ? '#dc2626' : 
                         metric.openIssues > 10 ? '#f59e0b' : '#10b981';
      
      html += `
        <li style="padding: 12px 0; border-bottom: 1px solid #e5e7eb;">
          <strong>${metric.projectName}</strong>
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="color: ${statusColor}; font-weight: bold;">
              ${metric.openIssues} open issues
            </span>
            <a href="/projects/${metric.projectKey}" 
               style="color: #2563eb; text-decoration: none;">View</a>
          </div>
        </li>
      `;
    });
    
    html += '</ul>';
  }
  
  html += '</div>';
  return html;
};
```

### 2. My Tasks Widget

```yaml
modules:
  dashboard-background-script:
    - key: my-tasks-widget
      name: { value: 'My Tasks' }
      description: { value: 'Displays pending tasks for the user' }
      function: myTasksWidgetFunction
```

```javascript
export const myTasksWidgetFunction = async (payload, context) => {
  console.log('Generating my tasks widget...');
  
  try {
    const { user } = payload;
    
    // Get issues assigned to user that are not done
    const searchResponse = await api.asUser().requestJira('/rest/api/3/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jql: `assignee = currentUser() AND status != Done ORDER BY priority DESC, created ASC`,
        maxResults: 10
      })
    });
    
    const searchData = await searchResponse.json();
    
    return {
      statusCode: 200,
      body: {
        title: 'My Pending Tasks',
        content: renderTasksWidget(searchData.issues),
        link: {
          url: '/issues/?jql=assignee=currentUser()%20AND%20status%21%3DDone',
          text: 'View all tasks'
        }
      }
    };
  } catch (error) {
    console.error('Tasks widget error:', error);
    
    return {
      statusCode: 500,
      body: {
        title: 'My Tasks',
        content: '<p>Could not load your tasks</p>',
        link: null
      }
    };
  }
};

const renderTasksWidget = (issues) => {
  if (!issues || issues.length === 0) {
    return `
      <div style="padding: 16px;">
        <p>No pending tasks! Great job!</p>
      </div>
    `;
  }
  
  let html = '<div style="padding: 16px;">';
  html += '<ul style="list-style: none; padding: 0; margin: 0;">';
  
  issues.forEach(issue => {
    const priorityColors = {
      'Highest': '#dc2626',
      'High': '#f59e0b',
      'Medium': '#3b82f6',
      'Low': '#10b981'
    };
    
    const priorityColor = priorityColors[issue.fields.priority?.name] || '#6b7280';
    
    html += `
      <li style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span>
            <strong><a href="/browse/${issue.key}">${issue.key}</a></strong>
            <p style="margin: 4px 0 0 0; color: #6b7280;">${issue.fields.summary}</p>
          </span>
          <span style="background-color: ${priorityColor}; 
                       color: white; padding: 2px 8px; border-radius: 3px; font-size: 11px;">
            ${issue.fields.priority?.name || 'N/A'}
          </span>
        </div>
      </li>
    `;
  });
  
  html += '</ul></div>';
  return html;
};
```

---

## Error Handling

### Comprehensive Error Handling

```javascript
export const robustWidgetFunction = async (payload, context) => {
  console.log('Starting widget generation...');
  
  try {
    // Validate payload
    if (!payload?.user?.accountId) {
      throw new Error('Invalid user context');
    }
    
    // Fetch data with timeout protection
    const statsData = await fetchWithTimeout(async () => {
      return await fetchStatistics();
    }, 8000); // 8 second timeout
    
    return {
      statusCode: 200,
      body: {
        title: 'Dashboard Widget',
        content: renderContent(statsData),
        link: { url: '/link', text: 'View' }
      }
    };
  } catch (error) {
    console.error('Widget error:', {
      message: error.message,
      stack: error.stack
    });
    
    return {
      statusCode: 500,
      body: {
        title: 'Error',
        content: `<p>Error loading widget: ${error.message}</p>`,
        link: null
      }
    };
  }
};

const fetchWithTimeout = async (fetchFn, timeoutMs) => {
  return Promise.race([
    fetchFn(),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Request timed out')), timeoutMs)
    )
  ]);
};
```

---

## Best Practices

1. **Keep it fast** - Widgets should load quickly
2. **Handle errors gracefully** - Show user-friendly error messages
3. **Use appropriate caching** - Cache data when possible
4. **Respect user permissions** - Only show accessible data
5. **Optimize for dashboards** - Keep content concise and scannable

---

## Related Documentation

- [Forge Dashboard Widgets](https://developer.atlassian.com/cloud/forge/application-structure/#dashboard-background-script)
- [Jira REST API Reference](../api-endpoints/jira-rest-api-v2.md)