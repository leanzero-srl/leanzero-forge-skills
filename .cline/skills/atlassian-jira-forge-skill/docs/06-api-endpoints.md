# Forge & Atlassian API Endpoints Reference

## Overview

Forge apps use several APIs to interact with Atlassian products and external services. This document covers all major APIs available in the Forge platform.

**Important Update**: The `@forge/jira-bridge` package and its `workflowRules` module are **NOT part of standard Forge** - they appear to be fictional or pre-release APIs. The official `@forge/api` provides all necessary Jira REST API interaction capabilities.

## API Categories

| API | Purpose | Package |
|-----|---------|---------|
| **@forge/api** | Core Forge runtime, Jira/Confluence REST calls | `@forge/api` |
| **@forge/bridge** | Frontend-to-backend communication (Custom UI) | `@forge/bridge` |
| **@forge/kvs** | Key-value storage | `@forge/kvs` |

## @forge/api - Core Functions API

### Making REST API Calls

```javascript
import api, { route } from '@forge/api';

// GET request
const response = await api.asApp().requestJira(route`/rest/api/3/issue/${issueKey}`);
const data = await response.json();

// POST request with body
await api.asApp().requestJira(route`/rest/api/3/issue`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    fields: {
      summary: "New issue",
      issuetype: { id: "10000" }
    }
  })
});
```

### Query Parameters

```javascript
// With query parameters using URLSearchParams
const params = new URLSearchParams({
  fields: 'summary,description,status',
  expand: 'changelog'
});
await api.asApp().requestJira(route`/rest/api/3/issue/${issueKey}?${params}`);
```

## Jira REST API Endpoints

### Issue Operations

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/rest/api/3/issue/{issueIdOrKey}` | Get issue details |
| PUT | `/rest/api/3/issue/{issueIdOrKey}` | Update issue fields |
| POST | `/rest/api/3/issue` | Create new issue |
| DELETE | `/rest/api/3/issue/{issueIdOrKey}` | Delete issue |

**Get Issue Example:**
```javascript
const response = await api.asApp().requestJira(route`/rest/api/3/issue/${issueKey}`);
const issue = await response.json();
console.log(issue.fields.summary);
```

**Update Issue Fields:**
```javascript
await api.asApp().requestJira(route`/rest/api/3/issue/${issueKey}`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    fields: {
      summary: "Updated summary",
      description: "New description"
    }
  })
});
```

### Issue Comment Operations

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/rest/api/3/issue/{id}/comment` | Get comments |
| POST | `/rest/api/3/issue/{id}/comment` | Add comment |

**Add Comment:**
```javascript
await api.asApp().requestJira(route`/rest/api/3/issue/${issueKey}/comment`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    body: {
      type: "doc",
      version: 1,
      content: [{
        type: "paragraph",
        content: [{ type: "text", text: "New comment" }]
      }]
    }
  })
});
```

### Workflow Operations

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/rest/api/3/issue/${id}/transitions` | Get available transitions |
| POST | `/rest/api/3/issue/${id}/transitions` | Execute transition |

**Transition Issue:**
```javascript
await api.asApp().requestJira(route`/rest/api/3/issue/${issueKey}/transitions`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    transition: { id: "11" }  // Transition ID
  })
});
```

### Project Operations

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/rest/api/3/project/${projectIdOrKey}` | Get project details |
| GET | `/rest/api/3/project/${id}/versions` | Get project versions |

**Get Project:**
```javascript
const response = await api.asApp().requestJira(route`/rest/api/3/project/${projectKey}`);
const project = await response.json();
```

### User & Group Operations

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/rest/api/3/myself` | Get current user |
| POST | `/rest/api/3/user/bulk` | Get multiple users by accountId |

**Get Current User:**
```javascript
const response = await api.asApp().requestJira(route`/rest/api/3/myself`);
const user = await response.json();
console.log(user.accountId);
```

### Custom Field Operations

```javascript
// Get field values from issue
const customValue = issue.fields.customfield_10001;

// Update custom field
await api.asApp().requestJira(route`/rest/api/3/issue/${issueKey}`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    fields: {
      "customfield_10001": { value: "New Value" }
    }
  })
});
```

## @forge/bridge - Custom UI Communication

**Note**: `@forge/jira-bridge` is **NOT a standard Forge package**. The official package for frontend communication is `@forge/bridge`.

### Basic Pattern

```javascript
// Backend (index.js)
import Resolver from '@forge/resolver';

const resolver = new Resolver();

resolver.define('fetchData', async ({ payload }, context) => {
  // Make Jira API calls with proper auth
  return { data: await response.json() };
});

export const handler = resolver.getDefinitions();
```

```javascript
// Frontend (Custom UI)
import { invoke } from '@forge/bridge';

const result = await invoke('fetchData', {
  payload: { projectId: '10000' }
});
```

## @forge/kvs - Key-Value Storage

### Basic Operations

```javascript
import kvs from '@forge/kvs';

// Set a value (string key, any value)
await kvs.set('myKey', { data: 'value' });

// Get a value
const data = await kvs.get('myKey');

// Delete a value
await kvs.delete('myKey');
```

### Entity-Based Storage

```javascript
import kvs from '@forge/kvs';

// Store user preferences
await kvs.entity('user-preferences')
  .set(userId, { theme: 'dark', notifications: true });

// Retrieve user preferences
const prefs = await kvs.entity('user-preferences').get(userId);
```

### Query Operations

```javascript
import kvs, { WhereConditions } from '@forge/kvs';

// Get all entities in an entity type
const result = await kvs.entity('users').query().getMany();

// With conditions (beginning with)
const filtered = await kvs.entity('users')
  .entity('users')
  .query()
  .index('by-country-name', { partition: ['US'] })
  .where(WhereConditions.beginsWith('john'))
  .getMany();
```

## External API Calls (from Forge Functions)

### Configure manifest.yml

```yaml
permissions:
  external:
    fetch:
      backend:
        - "api.openai.com"
        - "your-api.example.com"
```

### Make Request from Function

```javascript
import api from '@forge/api';

// For external APIs, use standard fetch (with proper scopes configured)
const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
  method: 'POST',
  headers: { 
    'Authorization': `Bearer ${process.env.OPENAI_KEY}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ model: "gpt-3.5-turbo", messages: [...] })
});
```

## Available Scopes for API Access

| Scope | Description |
|-------|-------------|
| `read:jira-work` | View issues, projects, workflows |
| `write:jira-work` | Create/update/delete issues |
| `read:workflow:jira` | Read workflow configurations |
| `read:project:jira` | Read project data |
| `read:user:jira` | Read user information |
| `storage:app` | Access Forge KVS storage |

## Error Handling

```javascript
try {
  const response = await api.asApp().requestJira('/rest/api/3/issue/${issueKey}');
  
  if (!response.ok) {
    console.error('API error:', response.status, await response.text());
    throw new Error(`Request failed: ${response.status}`);
  }
  
  return await response.json();
} catch (error) {
  console.error('Network or JSON error:', error);
  throw error;
}
```

## Next Steps

- **Events & Payloads**: Understand what data is available in triggers
- **Permissions**: Configure required scopes for your API access needs

**Note on Non-existent APIs**: The `@forge/jira-bridge` package with `workflowRules`, `uiModificationsApi` modules mentioned in some documentation does not exist as a standard Forge package. Use `@forge/api` and `@forge/bridge` for all functionality.