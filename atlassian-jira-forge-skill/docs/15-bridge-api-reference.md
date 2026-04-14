# Forge Bridge API Reference

This document provides comprehensive reference for the Forge Bridge API, which enables Custom UI apps to communicate with backend functions and access Atlassian platform data.

## Table of Contents
1. [Bridge API Overview](#bridge-api-overview)
2. [Core Methods](#core-methods)
3. [API Access Methods](#api-access-methods)
4. [Context Management](#context-management)
5. [UI Operations](#ui-operations)
6. [Best Practices](#best-practices)

---

## Bridge API Overview

### What is the Bridge API?

The Forge Bridge API provides a connection between:
- **Custom UI (frontend)** - Your React application running in the browser
- **Backend functions** - Your serverless JavaScript/TypeScript code

The bridge enables:
- Making authenticated API calls to Atlassian products as the current user (`asUser`)
- Passing data between frontend and backend
- Managing module-specific context and configuration
- Controlling UI component lifecycle

### Key Difference from @forge/api

| Feature | `@forge/api` | `@forge/bridge` |
|---------|-------------|-----------------|
| Authentication | `asApp()` or `asUser()` | Only `asUser()` (current user) |
| Location | Backend functions | Frontend Custom UI |
| Use Case | Server-side logic with app credentials | Client-side API calls as current user |

### Importing the Bridge

```javascript
// ES Module import - direct destructuring preferred
import { 
  requestJira,
  requestConfluence,
  view,
  dashboard
} from '@forge/bridge';
```

---

## Core Methods

### `requestJira` - Jira REST API Access (asUser only)

**Important**: Bridge API requests are always made as the current user (`asUser`). For `asApp` functionality, you must use backend functions with `@forge/api`.

```javascript
import { requestJira } from '@forge/bridge';

// GET request example
export const fetchIssue = async (issueKey) => {
  try {
    const response = await requestJira(`/rest/api/3/issue/${issueKey}?expand=changelog`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const issue = await response.json();
    return issue;
  } catch (error) {
    console.error('Failed to fetch issue:', error);
    throw error;
  }
};

// POST request example - Add watcher
export const addWatcher = async (issueKey, accountId) => {
  try {
    const response = await requestJira(`/rest/api/3/issue/${issueKey}/watchers`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify(accountId)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Failed to add watcher:', error);
    throw error;
  }
};

// PUT request example - Update issue
export const updateIssue = async (issueKey, updates) => {
  try {
    const response = await requestJira(`/rest/api/3/issue/${issueKey}`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({ fields: updates })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Failed to update issue:', error);
    throw error;
  }
};
```

### `requestConfluence` - Confluence REST API Access

```javascript
import { requestConfluence } from '@forge/bridge';

// GET page example
export const fetchPage = async (pageId) => {
  try {
    const response = await requestConfluence(
      `/wiki/rest/api/content/${pageId}?expand=body.storage,version`
    );
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Failed to fetch page:', error);
    throw error;
  }
};

// PUT page example - Update content
export const updatePage = async (pageId, title, content) => {
  try {
    // First get current version
    const pageInfo = await requestConfluence(
      `/wiki/rest/api/content/${pageId}?expand=version`
    ).then(r => r.json());
    
    const versionNumber = pageInfo.version.number + 1;
    
    // Update the page
    const response = await requestConfluence(`/wiki/rest/api/content/${pageId}`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({
        id: pageId,
        type: 'page',
        title: title,
        version: { number: versionNumber },
        body: {
          storage: {
            representation: 'storage',
            value: content
          }
        }
      })
    });
    
    return await response.json();
  } catch (error) {
    console.error('Failed to update page:', error);
    throw error;
  }
};
```

---

## Context Management

### Getting Context - Module-Specific APIs

The bridge API doesn't have a generic `bridge.getContext()`. Instead, each module provides its own context access:

- **UI Modifications**: Use `view.getContext()` 
- **Dashboard Widgets**: Use `dashboard.getContext()`

#### UI Modification Context (`view.getContext`)

```javascript
import { view } from '@forge/bridge';

export const getModuleContext = async () => {
  try {
    // For UI Modification modules, use view.getContext()
    const context = await view.getContext();
    
    console.log('Full context:', context);
    
    // Access extension-specific configuration
    if (context.extension?.validatorConfig) {
      console.log('Saved validator config:', context.extension.validatorConfig);
    }
    
    if (context.extension?.conditionConfig) {
      console.log('Saved condition config:', context.extension.conditionConfig);
    }
    
    if (context.extension?.postFunctionConfig) {
      console.log('Saved post function config:', context.extension.postFunctionConfig);
    }
    
    // Access module metadata
    const { 
      extension,  // Extension metadata
      project,    // Current project info
      issueType   // Current issue type info
    } = context;
    
    return {
      projectId: project?.id,
      projectKey: project?.key,
      issueTypeId: issueType?.id,
      extensionConfig: context.extension
    };
  } catch (error) {
    console.error('Failed to get context:', error);
    throw error;
  }
};

// Example: Check if current view is Issue Transition
export const isTransitionView = async () => {
  const context = await view.getContext();
  return context.viewType === 'IssueTransition';
};
```

#### Dashboard Widget Context (`dashboard.getContext`)

```javascript
import { dashboard, requestJira } from '@forge/bridge';

export const getDashboardContext = async () => {
  try {
    const context = await dashboard.getContext();
    
    // Dashboard and user information
    console.log('Dashboard:', context.dashboard);
    console.log('User:', context.user);
    
    return context;
  } catch (error) {
    console.error('Failed to get dashboard context:', error);
    throw error;
  }
};

// Example: Fetch issues based on dashboard project context
export const fetchProjectIssues = async () => {
  try {
    const { dashboard } = await dashboard.getContext();
    
    if (!dashboard?.project?.key) {
      throw new Error('No project in dashboard context');
    }
    
    // Make API call with proper auth
    const response = await requestJira(
      `/rest/api/3/search?jql=project=${dashboard.project.key}`
    );
    
    return await response.json();
  } catch (error) {
    console.error('Failed to fetch project issues:', error);
    throw error;
  }
};
```

---

## UI Operations

### `view.configure` / `dashboard.configure` - Configure Module UI

```javascript
import { view, Modal, Button, Form, TextField } from '@forge/bridge';

// For UI Modification modules
export const openConfiguration = async () => {
  try {
    await view.configure({
      title: 'App Configuration',
      description: 'Configure your app settings',
      body: renderConfigForm()
    });
  } catch (error) {
    console.error('Failed to open configuration:', error);
    throw error;
  }
};

// For Dashboard widgets
export const openDashboardConfig = async () => {
  try {
    await dashboard.configure({
      title: 'Widget Settings',
      description: 'Configure widget display options',
      body: renderDashboardSettings()
    });
  } catch (error) {
    console.error('Failed to open dashboard config:', error);
    throw error;
  }
};

// Example configuration form component
const renderConfigForm = () => (
  <Modal>
    <Form onSubmit={handleSubmit}>
      <TextField
        name="setting1"
        label="Setting 1"
        isRequired={true}
      />
      <TextField
        name="setting2"
        label="Setting 2"
      />
      <Button type="submit" appearance="primary">
        Save
      </Button>
    </Form>
  </Modal>
);
```

### `view.close` / `dashboard.close` - Close Module UI

```javascript
import { view } from '@forge/bridge';

export const closeComponent = async () => {
  try {
    // For UI Modification modules
    await view.close();
    console.log('Component closed successfully');
  } catch (error) {
    console.error('Failed to close:', error);
    throw error;
  }
};
```

### `dashboard.refresh` - Refresh Dashboard Widget Content

```javascript
import { dashboard, requestJira } from '@forge/bridge';

export const refreshWidgetData = async () => {
  try {
    // Fetch fresh data
    const newData = await fetchDataFromSource();
    
    // Update UI with new data
    updateUI(newData);
    
    // Refresh dashboard widget content
    await dashboard.refresh();
  } catch (error) {
    console.error('Failed to refresh:', error);
    throw error;
  }
};

const fetchDataFromSource = async () => {
  const { dashboard } = await dashboard.getContext();
  
  const response = await requestJira(
    `/rest/api/3/search?jql=project=${dashboard.project.key}&maxResults=10`
  );
  
  return await response.json();
};
```

---

## API Access Methods

### Making Complex Requests with Query Parameters

```javascript
import { requestJira } from '@forge/bridge';

export const searchIssues = async (jql, options = {}) => {
  try {
    const queryParams = new URLSearchParams({
      jql,
      start: options.start || 0,
      maxResults: options.maxResults || 50,
      expand: options.expand || '',
      fields: Array.isArray(options.fields) 
        ? options.fields.join(',') 
        : options.fields || '*all'
    });
    
    const response = await requestJira(
      `/rest/api/3/search?${queryParams.toString()}`,
      {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      }
    );
    
    if (!response.ok) {
      throw new Error(`Search failed: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Failed to search issues:', error);
    throw error;
  }
};

// Usage
const issues = await searchIssues('project = PROJ', {
  maxResults: 25,
  fields: ['summary', 'status', 'priority']
});
```

### Handling API Errors

```javascript
import { requestJira } from '@forge/bridge';

// Centralized error handling
const handleApiResponse = async (response, errorMessage) => {
  if (!response.ok) {
    let errorData;
    try {
      errorData = await response.json();
    } catch {
      errorData = { message: `HTTP ${response.status}` };
    }
    
    throw new Error(errorData.message || errorMessage);
  }
  
  return response;
};

// Example usage
export const fetchProjectDetails = async (projectKey) => {
  try {
    const response = await requestJira(`/rest/api/3/project/${projectKey}`);
    
    await handleApiResponse(response, 'Failed to fetch project details');
    return await response.json();
  } catch (error) {
    console.error('Project fetch error:', error);
    
    // Return default value or rethrow
    if (error.message.includes('not found')) {
      return null; // Project doesn't exist
    }
    
    throw error;
  }
};
```

### Batch Requests

```javascript
import { requestJira } from '@forge/bridge';

// Execute multiple requests in parallel
export const fetchMultipleIssues = async (issueKeys) => {
  try {
    const requests = issueKeys.map(key =>
      requestJira(`/rest/api/3/issue/${key}?expand=changelog`)
        .then(r => handleApiResponse(r, `Failed to fetch ${key}`))
        .then(r => r.json())
        .catch(e => ({ key, error: e.message }))
    );
    
    const results = await Promise.all(requests);
    
    return {
      success: results.filter(r => !r.error),
      failed: results.filter(r => r.error)
    };
  } catch (error) {
    console.error('Batch request failed:', error);
    throw error;
  }
};
```

---

## Best Practices

1. **Use Bridge for User Context**: When you need to make API calls as the current user from Custom UI, use `@forge/bridge`.

2. **Backend Functions for App Identity**: For server-side operations that need app-level permissions, use backend functions with `@forge/api.asApp()`.

3. **Module-Specific Context**: Always use the correct context method:
   - `view.getContext()` for UI Modifications
   - `dashboard.getContext()` for Dashboard Widgets

4. **Error Handling**: Always handle API errors gracefully with user-friendly messages in Custom UI.

5. **Caching**: Cache frequently accessed data to reduce API calls and improve performance.

6. **Pagination**: Handle paginated results properly for large datasets using `start` and `maxResults`.

7. **Loading States**: Show loading indicators during async operations in the UI.

---

## Related Documentation

- [Forge Bridge API Docs](https://developer.atlassian.com/platform/forge/apis-reference/ui-api-bridge/)
- [UI Kit Components](./17-ui-kit-components.md)
- [Resolver Patterns](./16-resolver-patterns.md)