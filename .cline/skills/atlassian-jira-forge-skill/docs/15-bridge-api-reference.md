# Forge Bridge API Reference

This document provides comprehensive reference for the Forge Bridge API, which enables Custom UI apps to communicate with backend functions and access Atlassian platform data.

## Table of Contents
1. [Bridge API Overview](#bridge-api-overview)
2. [Core Methods](#core-methods)
3. [API Access Methods](#api-access-methods)
4. [Context Management](#context-management)
5. [UI Operations](#ui-operations)
6. [Router and Navigation](#router-and-navigation)

---

## Bridge API Overview

### What is the Bridge API?

The Forge Bridge API provides a connection between:
- **Custom UI (frontend)** - Your React application running in the browser
- **Backend functions** - Your serverless JavaScript/TypeScript code

The bridge enables:
- Making authenticated API calls to Atlassian products
- Passing data between frontend and backend
- Managing user context and authentication
- Controlling the Custom UI component lifecycle

### Importing the Bridge

```javascript
// ES Module import
import { bridge } from '@forge/bridge';

// Or with destructuring for specific methods
import {
  requestJira,
  requestConfluence,
  getContext,
  configure
} from '@forge/bridge';
```

---

## Core Methods

### `requestJira` - Jira REST API Access

Make authenticated requests to the Jira REST API.

```javascript
export const fetchIssue = async (issueKey) => {
  try {
    // GET request
    const response = await bridge.requestJira(
      `/rest/api/3/issue/${issueKey}?expand=changelog`
    );
    
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

// POST request example
export const createComment = async (issueKey, commentBody) => {
  try {
    const response = await bridge.requestJira(
      `/rest/api/3/issue/${issueKey}/comment`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          body: commentBody
        })
      }
    );
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Failed to create comment:', error);
    throw error;
  }
};

// PUT request example - Update issue
export const updateIssue = async (issueKey, updates) => {
  try {
    const response = await bridge.requestJira(
      `/rest/api/3/issue/${issueKey}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fields: updates
        })
      }
    );
    
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

Make authenticated requests to the Confluence REST API.

```javascript
export const fetchPage = async (pageId) => {
  try {
    const response = await bridge.requestConfluence(
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

// Create or update a page
export const upsertPage = async (pageId, content) => {
  try {
    // Get current version first
    const pageData = await bridge.requestConfluence(
      `/wiki/rest/api/content/${pageId}?expand=version`
    );
    
    const versionNumber = (await pageData.json()).version.number + 1;
    
    // Update the page
    const response = await bridge.requestConfluence(
      `/wiki/rest/api/content/${pageId}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: pageId,
          type: 'page',
          title: 'Updated Page',
          version: { number: versionNumber },
          body: {
            storage: {
              representation: 'storage',
              value: content
            }
          }
        })
      }
    );
    
    return await response.json();
  } catch (error) {
    console.error('Failed to update page:', error);
    throw error;
  }
};
```

### `getContext` - Retrieve User Context

Get information about the current user and app context.

```javascript
export const getCurrentUser = async () => {
  try {
    const context = await bridge.getContext();
    
    return {
      accountId: context.accountId,
      accountType: context.accountType, // 'licensed', 'unlicensed', 'customer', 'anonymous'
      cloudId: context.cloudId,
      installContext: context.installContext
    };
  } catch (error) {
    console.error('Failed to get context:', error);
    throw error;
  }
};

// Use context for conditional logic
export const checkPermissions = async () => {
  const context = await bridge.getContext();
  
  // Check if user is authenticated and licensed
  const isLicensedUser = 
    context.accountType === 'licensed' || 
    context.accountType === 'customer';
  
  return {
    isAuthorized: isLicensedUser,
    accountType: context.accountType
  };
};
```

### `configure` - Open Configuration UI

Open the configuration panel for your app.

```javascript
export const openConfiguration = async () => {
  try {
    await bridge.configure({
      title: 'App Configuration',
      description: 'Configure your app settings',
      body: renderConfigForm()
    });
  } catch (error) {
    console.error('Failed to open configuration:', error);
    throw error;
  }
};

// With initial values
export const editConfiguration = async (currentConfig) => {
  try {
    await bridge.configure({
      title: 'Edit Settings',
      body: renderEditableForm(currentConfig)
    });
    
    // After user saves, you can reload data
    await fetchData();
  } catch (error) {
    console.error('Failed to edit configuration:', error);
    throw error;
  }
};
```

### `close` - Close Custom UI

Close the current Custom UI component.

```javascript
export const closeComponent = async () => {
  try {
    await bridge.close();
    console.log('Component closed successfully');
  } catch (error) {
    console.error('Failed to close:', error);
    throw error;
  }
};

// With callback after close
export const saveAndClose = async (dataToSave) => {
  try {
    // Save data first
    await saveData(dataToSave);
    
    // Then close
    await bridge.close();
  } catch (error) {
    console.error('Failed to save and close:', error);
    throw error;
  }
};
```

### `refresh` - Refresh Content

Trigger a refresh of the component content.

```javascript
export const refreshData = async () => {
  try {
    // Show loading state
    setIsLoading(true);
    
    // Fetch fresh data
    const newData = await fetchDataFromSource();
    
    // Update UI with new data
    updateUI(newData);
    
    // Refresh the component to reflect changes
    await bridge.refresh();
    
    setIsLoading(false);
  } catch (error) {
    console.error('Failed to refresh:', error);
    setIsLoading(false);
    throw error;
  }
};
```

---

## API Access Methods

### Making Complex Requests

```javascript
// Request with custom headers and query parameters
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
    
    const response = await bridge.requestJira(
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

// POST with file upload
export const uploadAttachment = async (issueKey, file) => {
  try {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await bridge.requestJira(
      `/rest/api/3/issue/${issueKey}/attachments`,
      {
        method: 'POST',
        body: formData
      }
    );
    
    if (!response.ok) {
      throw new Error(`Upload failed: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Failed to upload attachment:', error);
    throw error;
  }
};
```

### Handling API Errors

```javascript
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
    const response = await bridge.requestJira(
      `/rest/api/3/project/${projectKey}`
    );
    
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
// Execute multiple requests in parallel
export const fetchMultipleIssues = async (issueKeys) => {
  try {
    const requests = issueKeys.map(key =>
      bridge.requestJira(`/rest/api/3/issue/${key}?expand=changelog`)
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

// Execute requests sequentially with delay
export const fetchSequentialWithDelay = async (urls, delayMs = 100) => {
  try {
    const results = [];
    
    for (let i = 0; i < urls.length; i++) {
      // Wait between requests to avoid rate limiting
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
      
      const response = await bridge.requestJira(urls[i]);
      results.push(await handleApiResponse(response, `Request ${i} failed`));
    }
    
    return results;
  } catch (error) {
    console.error('Sequential request failed:', error);
    throw error;
  }
};
```

---

## Context Management

### Install Context vs User Context

```javascript
export const getContextDetails = async () => {
  try {
    // Get user context (who is currently using the app)
    const userContext = await bridge.getContext();
    
    // Get install context (app installation information)
    const installContext = JSON.parse(userContext.installContext);
    
    return {
      user: {
        accountId: userContext.accountId,
        accountType: userContext.accountType
      },
      installation: {
        cloudId: installContext.cloudId,
        product: installContext.product,
        hostUrl: installContext.hostUrl
      }
    };
  } catch (error) {
    console.error('Failed to get context details:', error);
    throw error;
  }
};

// Check if user is an admin
export const isAdmin = async () => {
  try {
    const context = await bridge.getContext();
    
    // Admins typically have specific permission scopes
    return context.accountType === 'licensed';
  } catch (error) {
    console.error('Admin check failed:', error);
    return false;
  }
};
```

### Context Events

```javascript
// Listen for context changes (if supported by your app type)
export const setupContextListener = (onContextChange) => {
  // Note: Context listeners depend on your specific use case
  // This is a pattern example
  
  let lastContext = null;
  
  const checkForChanges = async () => {
    try {
      const currentContext = await bridge.getContext();
      
      if (JSON.stringify(currentContext) !== JSON.stringify(lastContext)) {
        lastContext = currentContext;
        onContextChange(currentContext);
      }
      
      // Check again after delay
      setTimeout(checkForChanges, 5000);
    } catch (error) {
      console.error('Context check error:', error);
      setTimeout(checkForChanges, 5000);
    }
  };
  
  checkForChanges();
};
```

---

## UI Operations

### Modal Dialogs

```javascript
import { Modal, Button, Form, TextField } from '@forge/ui';

// Open modal with form
export const openCreateModal = async () => {
  try {
    await bridge.configure({
      title: 'Create New Item',
      body: (
        <Modal>
          <Form onSubmit={handleSubmit}>
            <TextField
              name="title"
              label="Title"
              isRequired={true}
            />
            <TextField
              name="description"
              label="Description"
            />
            <Button type="submit" appearance="primary">
              Create
            </Button>
          </Form>
        </Modal>
      )
    });
  } catch (error) {
    console.error('Failed to open modal:', error);
    throw error;
  }
};

// Submit handler
const handleSubmit = async (formData) => {
  try {
    // Process form data
    await createItem(formData);
    
    // Close the modal
    await bridge.close();
  } catch (error) {
    console.error('Form submission error:', error);
    throw error;
  }
};
```

### Toast Notifications

```javascript
// Custom toast notification using bridge
export const showToast = async (message, type = 'info') => {
  try {
    await bridge.configure({
      title: '',
      body: (
        <div className={`toast toast-${type}`}>
          <span>{message}</span>
        </div>
      ),
      width: '300px'
    });
    
    // Auto-close after delay
    setTimeout(async () => {
      try {
        await bridge.close();
      } catch (error) {
        console.error('Failed to close toast:', error);
      }
    }, 3000);
  } catch (error) {
    console.error('Failed to show toast:', error);
    throw error;
  }
};

// Usage
showToast('Operation completed successfully', 'success');
```

---

## Router and Navigation

### Basic Routing Setup

```javascript
import { router } from '@forge/bridge';

// Define routes
const routes = {
  '/': {
    component: HomeView,
    title: 'Home'
  },
  '/settings': {
    component: SettingsView,
    title: 'Settings'
  },
  '/issues/:key': {
    component: IssueView,
    title: 'Issue Details'
  }
};

// Handle navigation
export const navigateTo = async (path, params = {}) => {
  try {
    // Update the URL in the browser
    window.history.pushState({}, '', path);
    
    // Render appropriate component
    await renderRoute(path, params);
    
    // Refresh to reflect changes
    await bridge.refresh();
  } catch (error) {
    console.error('Navigation error:', error);
    throw error;
  }
};

// Route handler
const renderRoute = async (path, params) => {
  const route = Object.entries(routes).find(([pattern]) => {
    const regex = new RegExp(pattern.replace(':key', '(.+)'));
    return regex.test(path);
  });
  
  if (!route) {
    throw new Error('Route not found');
  }
  
  const [pattern, config] = route;
  const match = path.match(new RegExp(pattern.replace(':key', '(.+)')));
  
  // Render the component
  render(config.component, params, match ? match[1] : undefined);
};
```

### Query Parameter Handling

```javascript
// Get query parameters from URL
export const getQueryParams = () => {
  const searchParams = new URLSearchParams(window.location.search);
  return Object.fromEntries(searchParams.entries());
};

// Navigate with query parameters
export const navigateWithQuery = async (path, params) => {
  try {
    const queryString = new URLSearchParams(params).toString();
    const url = `${path}?${queryString}`;
    
    window.history.pushState({}, '', url);
    await bridge.refresh();
  } catch (error) {
    console.error('Navigation with query error:', error);
    throw error;
  }
};

// Usage example
const params = getQueryParams();
if (params.view === 'settings') {
  renderSettingsView();
}
```

### Route Guards

```javascript
// Protect routes that require authentication
export const navigateWithAuthCheck = async (path) => {
  try {
    const context = await bridge.getContext();
    
    // Check if user is authenticated
    if (!['licensed', 'customer'].includes(context.accountType)) {
      await showToast('Please log in to access this page');
      
      // Redirect to login or home
      window.history.pushState({}, '', '/');
      return;
    }
    
    // User is authenticated, navigate normally
    await navigateTo(path);
  } catch (error) {
    console.error('Auth check navigation error:', error);
    throw error;
  }
};
```

---

## Best Practices

1. **Error Handling** - Always handle API errors gracefully with user-friendly messages
2. **Caching** - Cache frequently accessed data to reduce API calls
3. **Pagination** - Handle paginated results properly for large datasets
4. **Loading States** - Show loading indicators during async operations
5. **Timeouts** - Implement timeouts for long-running requests

## Related Documentation

- [UI Kit Components](./17-ui-kit-components.md)
- [Resolver Patterns](./16-resolver-patterns.md)