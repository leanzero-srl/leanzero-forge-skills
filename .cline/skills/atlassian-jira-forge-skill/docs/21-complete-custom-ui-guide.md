# Complete Custom UI Guide for Jira Forge

This comprehensive guide walks you through building a complete Custom UI app for Jira Forge, from project setup to production deployment. Includes working code examples, common pitfalls, and best practices.

---

## What is Custom UI?

Custom UI allows you to build fully customized frontend interfaces in Forge apps using standard web technologies (HTML, CSS, JavaScript, React, Vue, Angular, etc.) instead of being limited to Atlassian's UI Kit components.

### When to Use Custom UI vs UI Kit

| Use Custom UI When | Use UI Kit When |
|-------------------|-----------------|
| You need custom layouts/styling | You want native Atlassian look |
| Using existing React/Vue/Angular code | Quick prototyping |
| Complex interactive components | Simple forms and displays |
| Third-party component libraries needed | Faster development time |

---

## Complete Project Structure

```
my-forge-app/
├── manifest.yml                 # App configuration
├── package.json                 # Root dependencies
├── src/
│   ├── index.js                # FaaS resolver (backend)
│   └── triggers.js             # Trigger handlers
├── static/
│   └── myapp/
│       ├── public/
│       │   └── index.html      # HTML entry point
│       ├── src/
│       │   ├── App.tsx         # Main React component
│       │   ├── index.tsx       # React entry point
│       │   └── components/     # Optional: sub-components
│       ├── package.json        # Frontend dependencies
│       └── build/              # Output (after npm run build)
├── package-lock.json
└── .gitignore
```

---

## Step 1: Project Setup

### Create the App Structure

```bash
# Create project directory
mkdir my-forge-app
cd my-forge-app

# Initialize root package.json
npm init -y

# Install Forge dependencies
npm install @forge/resolver @forge/api

# Create directory structure
mkdir -p src static/myapp/public static/myapp/src/components
```

### Root package.json

```json
{
  "name": "my-forge-app",
  "version": "1.0.0",
  "scripts": {
    "build:frontend": "cd static/myapp && npm run build",
    "dev:frontend": "cd static/myapp && npm start",
    "deploy": "forge deploy",
    "install": "forge install --upgrade",
    "tunnel": "forge tunnel"
  },
  "dependencies": {
    "@forge/api": "^1.0.0",
    "@forge/resolver": "^1.0.0"
  },
  "devDependencies": {}
}
```

---

## Step 2: Frontend Setup (React)

### static/myapp/package.json

```json
{
  "name": "myapp-frontend",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "start": "react-scripts start",
    "build": "react-scripts build",
    "test": "react-scripts test",
    "eject": "react-scripts eject"
  },
  "dependencies": {
    "@forge/bridge": "^3.0.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-scripts": "5.0.1"
  },
  "browserslist": {
    "production": [
      ">0.2%",
      "not dead",
      "not op_mini all"
    ],
    "development": [
      "last 1 chrome version",
      "last 1 firefox version"
    ]
  }
}
```

### static/myapp/public/index.html

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <!-- CSP meta tag for local development -->
  <meta http-equiv="Content-Security-Policy" content="style-src 'self' 'unsafe-inline'" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>My Forge App</title>
</head>
<body>
  <noscript>You need to enable JavaScript to run this app.</noscript>
  <div id="root"></div>
</body>
</html>
```

### static/myapp/src/index.tsx

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

### static/myapp/src/App.tsx

```tsx
import React, { useEffect, useState } from 'react';
import { bridge } from '@forge/bridge';

// Note: `invoke()` calls custom resolver functions defined in the backend.
// See "Resolver Patterns" document for creating backend resolvers.

interface IssueData {
  key: string;
  fields: {
    summary: string;
    status: {
      name: string;
    };
    assignee?: {
      displayName: string;
    };
  };
}

function App() {
  const [issue, setIssue] = useState<IssueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<{ displayName: string } | null>(null);

  useEffect(() => {
    // Get current user info
    bridge.invoke('getCurrentUser')
      .then(setUser)
      .catch(err => console.error('Failed to get user:', err));

    // Get issue data (issue key passed as parameter from context)
    const issueKey = 'PROJ-123'; // In real app, get from getContext()
    
    bridge.invoke('getIssueData', { issueKey })
      .then(data => {
        setIssue(data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message || 'Failed to load issue data');
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div style={{ color: 'red' }}>Error: {error}</div>;
  }

  return (
    <div style={{ padding: '16px', fontFamily: '-apple-system, sans-serif' }}>
      <h2 style={{ margin: 0 0 16px }}>Issue Details</h2>
      
      <p><strong>User:</strong> {user?.displayName || 'Unknown'}</p>
      
      {issue && (
        <div style={{ border: '1px solid #ddd', padding: '12px', borderRadius: '4px' }}>
          <h3 style={{ margin: 0 0 8px }}>{issue.key}</h3>
          <p style={{ margin: 0 }}>{issue.fields.summary}</p>
          <p style={{ margin: '8px 0 0', color: '#666' }}>
            Status: {issue.fields.status.name}
          </p>
          {issue.fields.assignee && (
            <p style={{ margin: '4px 0 0' }}>
              Assignee: {issue.fields.assignee.displayName}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
```

### static/myapp/src/App.css (Optional styling)

```css
.app-container {
  padding: 16px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.issue-card {
  border: 1px solid #dfe1e6;
  border-radius: 3px;
  padding: 12px;
  margin-top: 16px;
}

.loading-spinner {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100px;
}

.error-message {
  color: #de350b;
  padding: 12px;
  background: #ffebe6;
  border-radius: 3px;
}
```

---

## Step 3: Backend Resolver

### src/index.js

```javascript
import Resolver from '@forge/resolver';
import api, { route } from '@forge/api';

const resolver = new Resolver();

/**
 * Get current user information
 */
resolver.define('getCurrentUser', async () => {
  try {
    const response = await api.asApp().requestJira(route`/rest/api/3/myself`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching current user:', error);
    throw error;
  }
});

/**
 * Get issue data by key
 */
resolver.define('getIssueData', async (payload) => {
  try {
    const { issueKey } = payload;
    
    if (!issueKey) {
      throw new Error('issueKey is required');
    }
    
    const response = await api.asApp().requestJira(
      route`/rest/api/3/issue/${issueKey}?fields=summary,status,assignee,reporter,priority`
    );
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching issue data:', error);
    throw error;
  }
});

/**
 * Search issues using JQL
 */
resolver.define('searchIssues', async (payload) => {
  try {
    const { jql, maxResults = 50, startAt = 0 } = payload;
    
    if (!jql) {
      throw new Error('JQL query is required');
    }
    
    const response = await api.asApp().requestJira(
      route`/rest/api/3/search?jql=${encodeURIComponent(jql)}&maxResults=${maxResults}&startAt=${startAt}&fields=summary,status,assignee,created,updated`
    );
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    
    const data = await response.json();
    
    return {
      total: data.total,
      issues: data.issues.map(issue => ({
        key: issue.key,
        fields: issue.fields
      }))
    };
  } catch (error) {
    console.error('Error searching issues:', error);
    throw error;
  }
});

/**
 * Create a new issue
 */
resolver.define('createIssue', async (payload) => {
  try {
    const { projectKey, issueType, summary, description } = payload;
    
    if (!projectKey || !issueType || !summary) {
      throw new Error('projectKey, issueType, and summary are required');
    }
    
    const requestBody = {
      fields: {
        project: { key: projectKey },
        issuetype: { name: issueType },
        summary
      }
    };
    
    if (description) {
      requestBody.fields.description = {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: description }]
          }
        ]
      };
    }
    
    const response = await api.asApp().requestJira(
      route`/rest/api/3/issue`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      }
    );
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error creating issue:', error);
    throw error;
  }
});

/**
 * Update an existing issue
 */
resolver.define('updateIssue', async (payload) => {
  try {
    const { issueKey, fields } = payload;
    
    if (!issueKey || !fields) {
      throw new Error('issueKey and fields are required');
    }
    
    const response = await api.asApp().requestJira(
      route`/rest/api/3/issue/${issueKey}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields })
      }
    );
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    
    return { success: true };
  } catch (error) {
    console.error('Error updating issue:', error);
    throw error;
  }
});

export const handler = resolver.getDefinitions();
```

---

## Step 4: Manifest Configuration

### manifest.yml

```yaml
app:
  id: ari:cloud:ecosystem::app/your-app-id-here

# Main modules
modules:
  # Issue Panel - displays in issue sidebar
  jira:issuePanel:
    - key: my-custom-panel
      title: My Custom App
      description: A custom panel for viewing and managing issues
      resource: main
      resolver:
        function: resolver
      
      # Optional: Control display context
      display:
        issueType:
          - standard  # Only show on standard issues (not subtasks)

  # Admin Page - configuration UI
  jira:adminPage:
    - key: my-app-admin
      title: My App Administration
      function: renderAdminPage
      
# Resources for Custom UI
resources:
  - key: main
    path: static/myapp/build
    
  # Tunnel config for local development
    tunnel:
      port: 3000

# Functions
functions:
  - key: resolver
    handler: src/index.handler
  
  - key: renderAdminPage
    handler: src/admin.render

# Permissions
permissions:
  scopes:
    - read:jira-user      # Access to current user info
    - read:jira-work      # Read issues
    - write:jira-work     # Create/update issues
    
  # Content Security Policy for inline styles (required for React dev builds)
  content:
    styles:
      - 'unsafe-inline'
    
  # External domains for API calls
  external:
    fetch:
      client:
        - '*.atlassian.net'
        - '*.atl-paas.net'
```

---

## Step 5: Administration Page (Optional)

### src/admin.tsx

```tsx
import ForgeUI, { render, AdminPage, Text, Input, Button, Stack } from '@forge/ui';

interface AdminConfig {
  projectKey: string;
  defaultAssignee: string;
}

const App = ({ config }: { config?: AdminConfig }) => {
  return (
    <AdminPage>
      <Text heading="My App Configuration" />
      
      <Stack spacing={2}>
        <Input 
          label="Default Project Key"
          value={config?.projectKey || ''}
          placeholder="PROJ"
        />
        
        <Input 
          label="Default Assignee"
          value={config?.defaultAssignee || ''}
          placeholder="username"
        />
        
        <Button variant="primary">Save Configuration</Button>
      </Stack>
    </AdminPage>
  );
};

export const renderAdminPage = render(<App />);
```

---

## Step 6: Development Workflow

### Install Dependencies

```bash
# Root dependencies
npm install

# Frontend dependencies
cd static/myapp
npm install
cd ../..
```

### Build Frontend (Required before first deploy)

```bash
cd static/myapp
npm run build
cd ../..
```

### Deploy App

```bash
# First deployment
forge deploy

# Install on your Jira instance
forge install --upgrade
```

### Local Development with Tunnel

```bash
# Start frontend dev server (in one terminal)
cd static/myapp
npm start

# Start Forge tunnel (in another terminal)
forge tunnel
```

---

## Step 7: Common Patterns & Utilities

### Error Handling Utility

```javascript
// src/utils/errorHandler.js

export class ForgeError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'ForgeError';
    this.code = code;
    this.details = details;
  }
}

export async function withErrorHandling(fn, context) {
  try {
    return await fn();
  } catch (error) {
    console.error(`[${context}] Error:`, error);
    
    if (error instanceof ForgeError) {
      throw error;
    }
    
    throw new ForgeError('INTERNAL_ERROR', 'An unexpected error occurred', {
      originalError: error.message
    });
  }
}

// Usage in resolver
resolver.define('getIssueData', async (payload) => {
  return withErrorHandling(async () => {
    // Your logic here
    const response = await api.asApp().requestJira(route`/rest/api/3/issue/${payload.issueKey}`);
    return await response.json();
  }, `getIssueData:${payload.issueKey}`);
});
```

### Logging Utility

```javascript
// src/utils/logger.js

export function createLogger(context) {
  return {
    info: (message, data) => {
      console.log(`[${context}] INFO:`, message, data || '');
    },
    error: (message, error) => {
      console.error(`[${context}] ERROR:`, message, error || '');
    },
    debug: (message, data) => {
      if (process.env.DEBUG === 'true') {
        console.log(`[${context}] DEBUG:`, message, data || '');
      }
    }
  };
}

// Usage
const logger = createLogger('getIssueData');
logger.info('Fetching issue', { key: payload.issueKey });
```

### Rate Limit Handling Wrapper

```javascript
// src/utils/rateLimiter.js

import api, { route } from '@forge/api';

export async function requestWithRetry(url, options = {}, maxRetries = 3) {
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await api.asApp().requestJira(route`${url}`, options);
      
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Retry-After')) || 
                          Math.pow(2, attempt) * 1000;
        
        console.log(`Rate limited, waiting ${retryAfter}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, retryAfter));
        continue;
      }
      
      return response;
    } catch (error) {
      lastError = error;
      
      if (attempt === maxRetries) {
        throw error;
      }
      
      const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}
```

---

## Step 8: Testing Your App

### Local Testing Checklist

- [ ] Run `npm run build` in static folder
- [ ] Deploy with `forge deploy`
- [ ] Install with `forge install --upgrade`
- [ ] Check browser console for CSP errors
- [ ] Verify issue panel appears on Jira issues
- [ ] Test all resolver functions work correctly

### Debugging Commands

```bash
# View recent logs
forge logs -n 50

# Watch logs in real-time
forge logs --follow

# Validate manifest
forge lint
```

---

## Troubleshooting Reference

| Problem | Solution |
|---------|----------|
| Panel not showing | Check `display.issueType` matches current issue type |
| "Unable to connect" error | Run `npm run build` and redeploy |
| CSP errors in console | Add `permissions.content.styles: ['unsafe-inline']` |
| API calls failing | Verify scopes in manifest.yml |
| Changes not reflecting | Hard refresh browser (Cmd+Shift+R) |

---

## Related Documentation

- [Custom UI Troubleshooting](18-custom-ui-troubleshooting.md)
- [Rate Limit Handling](19-rate-limit-handling.md)
- [Performance Optimization](20-performance-optimization.md)
- [Bridge API Reference](15-bridge-api-reference.md)
- [Resolver Patterns](16-resolver-patterns.md)