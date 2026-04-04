# Content Properties: Storing App Data with Confluence Content

This guide covers using the Content Properties API to store and retrieve app-specific data associated with Confluence pages, blog posts, and spaces. Content properties provide a clean way to persist metadata without modifying the actual content.

---

## What are Content Properties?

Content properties are key-value pairs that can be attached to Confluence content (pages, blog posts) or spaces. They're ideal for:
- Storing sync status with external systems
- Tracking processing state
- Caching computed data
- Maintaining app-specific metadata
- Linking content to external records

```yaml
permissions:
  scopes:
    - read:confluence-content:*
    - write:confluence-content:*
```

---

## Content Properties API Overview

The Content Properties API v2 provides CRUD operations for managing properties on Confluence content.

| Operation | HTTP Method | Endpoint |
|-----------|-------------|----------|
| Get property | GET | `/wiki/api/v2/pages/{pageId}/properties/{key}` |
| Create/Update | PUT | `/wiki/api/v2/pages/{pageId}/properties/{key}` |
| Delete | DELETE | `/wiki/api/v2/pages/{pageId}/properties/{key}` |
| List all | GET | `/wiki/api/v2/pages/{pageId}/properties` |

---

## Basic Implementation

### Reading a Content Property

```jsx
// For Forge apps, use requestConfluence from @forge/bridge instead of direct API calls

async function getPageProperty(pageId, key) {
  // Token is handled automatically by requestConfluence - no need to get token manually
  
  const response = await requestConfluence({
    url: `/wiki/api/v2/pages/${pageId}/properties/${key}`,
      headers: {
        'Accept': 'application/json',
      },
  });

  if (response.status === 404) {
    return null; // Property doesn't exist
  }

  if (!response.ok) {
    throw new Error(`Failed to get property: ${response.statusText}`);
  }

  const data = await response.json();
  return data.value;
}

// Usage
const syncStatus = await getPageProperty('123456789', 'myapp:syncStatus');
```

### Creating/Updating a Content Property

```jsx
async function setPageProperty(pageId, key, value) {
  // Token is handled automatically by requestConfluence - no need to get token manually
  
  const response = await requestConfluence({
    url: `/wiki/api/v2/pages/${pageId}/properties/${key}`,
    method: 'PUT',
    headers: { 
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ value })
  });

  if (!response.ok) {
    throw new Error(`Failed to set property: ${response.statusText}`);
  }

  return response.json();
}

// Usage - can be any JSON-serializable value
await setPageProperty('123456789', 'myapp:syncStatus', {
  lastSynced: new Date().toISOString(),
  externalId: 'EXT-123',
  status: 'synced'
});
```

### Deleting a Content Property

```jsx
async function deletePageProperty(pageId, key) {
  // Token is handled automatically by requestConfluence - no need to get token manually
  
  const response = await requestConfluence({
    url: `/wiki/api/v2/pages/${pageId}/properties/${key}`,
    method: 'DELETE',
      headers: {
        'Accept': 'application/json',
      },
  });

  return response.ok || response.status === 404;
}
```

### Listing All Properties on a Page

```jsx
async function listPageProperties(pageId) {
  // Token is handled automatically by requestConfluence - no need to get token manually
  
  const response = await requestConfluence({
    url: `/wiki/api/v2/pages/${pageId}/properties`,
      headers: {
        'Accept': 'application/json',
      },
  });

  if (!response.ok) {
    throw new Error(`Failed to list properties: ${response.statusText}`);
  }

  const data = await response.json();
  return data.results || [];
}
```

---

## Helper Class for Content Properties

Create a reusable helper class for working with content properties:

```jsx
// src/utils/contentProperties.js
// For Forge apps, use requestConfluence from @forge/bridge instead of direct API calls

export class ContentPropertyStore {
  constructor(appPrefix) {
    this.appPrefix = appPrefix; // e.g., 'myapp:'
  }

  _getKey(key) {
    return `${this.appPrefix}${key}`;
  }

  async _getToken() {
    // Token is handled automatically by requestConfluence
  }

  async get(pageId, key) {
    try {
      const token = await this._getToken();
      const response = await requestConfluence({
        url: `/wiki/api/v2/pages/${pageId}/properties/${this._getKey(key)}`,
      headers: {
        'Accept': 'application/json',
      },
      });

      if (response.status === 404) return null;
      
      if (!response.ok) {
        throw new Error(`Failed to get property: ${response.statusText}`);
      }

      const data = await response.json();
      return data.value;
    } catch (error) {
      console.error(`Error getting property ${key}:`, error);
      throw error;
    }
  }

  async set(pageId, key, value) {
    try {
      const token = await this._getToken();
      const response = await requestConfluence({
        url: `/wiki/api/v2/pages/${pageId}/properties/${this._getKey(key)}`,
        method: 'PUT',
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ value })
      });

      if (!response.ok) {
        throw new Error(`Failed to set property: ${response.statusText}`);
      }

      return true;
    } catch (error) {
      console.error(`Error setting property ${key}:`, error);
      throw error;
    }
  }

  async delete(pageId, key) {
    try {
      const token = await this._getToken();
      const response = await requestConfluence({
        url: `/wiki/api/v2/pages/${pageId}/properties/${this._getKey(key)}`,
        method: 'DELETE',
      headers: {
        'Accept': 'application/json',
      },
      });

      return response.ok || response.status === 404;
    } catch (error) {
      console.error(`Error deleting property ${key}:`, error);
      throw error;
    }
  }

  async getAll(pageId) {
    try {
      const token = await this._getToken();
      const response = await requestConfluence({
        url: `/wiki/api/v2/pages/${pageId}/properties`,
      headers: {
        'Accept': 'application/json',
      },
      });

      if (!response.ok) {
        throw new Error(`Failed to list properties: ${response.statusText}`);
      }

      const data = await response.json();
      return (data.results || []).filter(p => p.key.startsWith(this.appPrefix));
    } catch (error) {
      console.error('Error listing properties:', error);
      throw error;
    }
  }

  // Convenience method for get-or-set pattern
  async getOrSet(pageId, key, defaultValue) {
    const value = await this.get(pageId, key);
    if (value === null) {
      await this.set(pageId, key, defaultValue);
      return defaultValue;
    }
    return value;
  }
}

// Usage
export const propertyStore = new ContentPropertyStore('myapp:');
```

---

## Common Patterns

### Pattern 1: Sync Status Tracking

Track synchronization status with external systems:

```jsx
import { propertyStore } from './utils/contentProperties';

async function syncPageWithExternalSystem(pageId) {
  // Get current sync status
  const syncStatus = await propertyStore.get(pageId, 'sync');
  
  if (syncStatus && syncStatus.status === 'synced') {
    console.log('Page already synced, skipping...');
    return;
  }

  try {
    // Mark as syncing
    await propertyStore.set(pageId, 'sync', {
      status: 'syncing',
      startedAt: new Date().toISOString()
    });

    // Perform sync operation
    const externalRecord = await performSyncOperation(pageId);

    // Mark as synced
    await propertyStore.set(pageId, 'sync', {
      status: 'synced',
      lastSynced: new Date().toISOString(),
      externalId: externalRecord.id,
      externalUrl: externalRecord.url
    });

    return externalRecord;
  } catch (error) {
    // Mark as failed
    await propertyStore.set(pageId, 'sync', {
      status: 'failed',
      lastError: error.message,
      lastErrorAt: new Date().toISOString()
    });
    
    throw error;
  }
}

async function performSyncOperation(pageId) {
  // Your sync logic here
  return { id: 'EXT-123', url: 'https://external.com/123' };
}
```

### Pattern 2: Processing State Machine

Track complex processing workflows:

```jsx
const PROCESSING_STATES = {
  PENDING: 'pending',
  QUEUED: 'queued',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed'
};

async function processPage(pageId) {
  const stateMachine = await propertyStore.get(pageId, 'processing');
  
  switch (stateMachine?.state) {
    case PROCESSING_STATES.PENDING:
      return queueForProcessing(pageId);
      
    case PROCESSING_STATES.QUEUED:
      return processFromQueue(pageId);
      
    case PROCESSING_STATES.PROCESSING:
      console.log('Already processing, skipping...');
      return;
      
    case PROCESSING_STATES.COMPLETED:
      console.log('Already completed, skipping...');
      return;
      
    default:
      // Start new processing
      await propertyStore.set(pageId, 'processing', {
        state: PROCESSING_STATES.PENDING,
        createdAt: new Date().toISOString()
      });
      return queueForProcessing(pageId);
  }
}

async function queueForProcessing(pageId) {
  await propertyStore.set(pageId, 'processing', {
    state: PROCESSING_STATES.QUEUED,
    queuedAt: new Date().toISOString()
  });
  
  // Add to your processing queue
  await addToQueue(pageId);
}

async function processFromQueue(pageId) {
  await propertyStore.set(pageId, 'processing', {
    state: PROCESSING_STATES.PROCESSING,
    processingStartedAt: new Date().toISOString()
  });
  
  try {
    // Do the actual work
    await doProcessingWork(pageId);
    
    await propertyStore.set(pageId, 'processing', {
      state: PROCESSING_STATES.COMPLETED,
      completedAt: new Date().toISOString()
    });
  } catch (error) {
    await propertyStore.set(pageId, 'processing', {
      state: PROCESSING_STATES.FAILED,
      error: error.message,
      failedAt: new Date().toISOString()
    });
    
    throw error;
  }
}
```

### Pattern 3: Caching Computed Data

Cache expensive computations:

```jsx
const CACHE_TTL = 3600000; // 1 hour in milliseconds

async function getCachedData(pageId, cacheKey, computeFunction) {
  const cached = await propertyStore.get(pageId, `cache:${cacheKey}`);
  
  if (cached && cached.data && !this._isExpired(cached)) {
    return cached.data;
  }

  // Compute and cache
  const data = await computeFunction();
  
  await propertyStore.set(pageId, `cache:${cacheKey}`, {
    data,
    cachedAt: Date.now()
  });

  return data;
}

_isExpired(cached) {
  return Date.now() - cached.cachedAt > CACHE_TTL;
}

// Usage
const relatedPages = await getCachedData(
  pageId,
  'related',
  async () => computeRelatedPages(pageId)
);
```

### Pattern 4: Space-Level Properties

Store properties at the space level for configuration.

**Note:** In Confluence Cloud, space-level properties are stored as content properties on a designated "config" page within each space. To access them, you need to first find or create this config page.

```jsx
import { requestConfluence } from '@forge/bridge';

async function getSpaceProperty(spaceKey, key) {
  // First, search for the config page in the specified space
  // Token is handled automatically by requestConfluence - no need to get token manually
  
  try {
    // Use requestConfluence for Confluence REST API calls
    const response = await requestConfluence(
      `/wiki/api/v2/search?cql=space="${spaceKey}"%20AND%20title="App Configuration"&limit=1`
    );

    if (!response.ok) return null;
    
    const data = await response.json();
    if (!data.results || data.results.length === 0) return null;
    
    // Search results have structure: [{ content: { id, ... } }]
    const configPageId = data.results[0].content.id;
    
    // Now get the property from the config page
    const propResponse = await requestConfluence(
      `/wiki/api/v2/pages/${configPageId}/properties/${key}`
    );

    if (propResponse.status === 404) return null;
    
    const propData = await propResponse.json();
    return propData.value;
  } catch (error) {
    console.error('Error getting space property:', error);
    return null;
  }
}

async function setSpaceProperty(spaceKey, key, value) {
  // Find or create config page
  let configPageId = await _getOrCreateConfigPage(spaceKey);
  
  // Token is handled automatically by requestConfluence - no need to get token manually
  
  try {
    const response = await requestConfluence(
      `/wiki/api/v2/pages/${configPageId}/properties/${key}`,
      {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ value })
      }
    );

    return response.ok;
  } catch (error) {
    console.error('Error setting space property:', error);
    return false;
  }
}

// Helper function to get or create config page
async function _getOrCreateConfigPage(spaceKey) {
  // Implementation depends on your app's specific requirements
  // Typically involves creating a dedicated "App Configuration" page in the space
  return null; // Replace with actual implementation
}
```

---

## Blog Post Properties

The same API works for blog posts:

```jsx
async function getBlogPostProperty(blogPostId, key) {
  // Token is handled automatically by requestConfluence - no need to get token manually
  
  const response = await requestConfluence({
    url: `/wiki/api/v2/blogposts/${blogPostId}/properties/${key}`,
      headers: {
        'Accept': 'application/json',
      },
  });

  if (response.status === 404) return null;
  
  if (!response.ok) {
    throw new Error(`Failed to get property: ${response.statusText}`);
  }

  const data = await response.json();
  return data.value;
}

async function setBlogPostProperty(blogPostId, key, value) {
  // Token is handled automatically by requestConfluence - no need to get token manually
  
  const response = await requestConfluence({
    url: `/wiki/api/v2/blogposts/${blogPostId}/properties/${key}`,
    method: 'PUT',
    headers: { 
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ value })
  });

  return response.ok;
}
```

---

## Best Practices

### 1. Use Namespaced Keys

Always prefix property keys with your app name to avoid collisions:

```jsx
// Good
await setPageProperty(pageId, 'myapp:syncStatus', value);
await setPageProperty(pageId, 'myapp:userPreferences', value);

// Bad - could collide with other apps
await setPageProperty(pageId, 'syncStatus', value);
```

### 2. Handle Missing Properties Gracefully

```jsx
const syncStatus = await getPageProperty(pageId, 'myapp:sync') || {
  status: 'pending',
  lastSynced: null
};
```

### 3. Use Atomic Updates for State Machines

When updating state, read the current value first to ensure consistency:

```jsx
async function incrementCounter(pageId) {
  const currentValue = await propertyStore.get(pageId, 'counter') || 0;
  await propertyStore.set(pageId, 'counter', currentValue + 1);
}
```

### 4. Clean Up Old Properties

When uninstalling your app or migrating data:

```jsx
async function cleanupAppProperties(pageId) {
  const properties = await listPageProperties(pageId);
  
  for (const prop of properties) {
    if (prop.key.startsWith('myapp:')) {
      await deletePageProperty(pageId, prop.key);
    }
  }
}
```

---

## Error Handling

Content Properties API can fail for various reasons. Always handle errors appropriately:

```jsx
async function safeSetProperty(pageId, key, value) {
  try {
    await setPageProperty(pageId, key, value);
    return { success: true };
  } catch (error) {
    console.error(`Failed to set property ${key}:`, error);
    
    // Check for specific error conditions
    if (error.message.includes('403')) {
      return { 
        success: false, 
        error: 'Permission denied',
        retryable: false 
      };
    }
    
    if (error.message.includes('429')) {
      return { 
        success: false, 
        error: 'Rate limited',
        retryable: true 
      };
    }
    
    return { 
      success: false, 
      error: error.message,
      retryable: true 
    };
  }
}
```

---

## Next Steps

- [Webhooks & Events](07-webhooks-events.md) - Reacting to content changes
- [API Endpoints](08-api-endpoints.md) - Complete REST API reference
- [Problem Patterns](problem-patterns.md) - Common implementation patterns
