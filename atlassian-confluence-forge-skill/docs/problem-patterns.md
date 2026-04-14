# Problem Patterns: Common Confluence Forge Solutions

This guide provides ready-to-use code patterns for common Confluence Forge app scenarios.

---

## Pattern 1: Sync Page Content to External System

**Use case:** Automatically sync page content when created or updated.

```javascript
// src/webhooks/sync-page.js
import { api } from '@forge/bridge';

export default async function handler(req, res) {
  const { event, data } = req.body;
  
  try {
    if (event === 'confluence:page:created' || 
        event === 'confluence:page:updated') {
      
      await syncPageToExternalSystem(data);
    }
    
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Sync failed:', error);
    res.status(500).json({ error: error.message });
  }
}

async function syncPageToExternalSystem(pageData) {
  const { content, space } = pageData;
  
  // Fetch full page details with body
  const token = await AP.context.getToken();
  const response = await api.fetch({
    url: `/wiki/api/v2/pages/${content.id}?bodyFormat=storage`,
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!response.ok) throw new Error('Failed to fetch page');
  
  const page = await response.json();
  
  // Send to external API
  const syncResult = await fetch('https://external-api.com/pages/sync', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'X-Confluence-Token': token
    },
    body: JSON.stringify({
      id: page.id,
      title: page.title,
      content: page.body.storage.value,
      spaceKey: space.key,
      lastModified: page.lastModified,
      author: page.author?.accountId
    })
  });

  if (!syncResult.ok) throw new Error('External sync failed');
  
  // Mark as synced in Confluence
  await savePageProperty(
    page.id, 
    'external-sync', 
    { timestamp: new Date().toISOString(), status: 'success' },
    token
  );
}

async function savePageProperty(pageId, key, value, token) {
  return api.fetch({
    url: `/wiki/api/v2/pages/${pageId}/properties/${key}`,
    method: 'PUT',
    headers: { 
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(value)
  });
}
```

---

## Pattern 2: Display Sync Status on Page

**Use case:** Show sync status and last sync time in a page extension.

```jsx
// src/page-ui/sync-status.jsx
import React, { useEffect, useState } from 'react';
import { api, routeHandlers } from '@forge/bridge';
import { Card, Heading, Text } from '@atlaskit/card';
import { InlineSpinner } from '@atlaskit/spinner';
import { StatusBadge } from '@atlaskit/status-badge';

export default function SyncStatus() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadSyncStatus() {
      try {
        const token = await AP.context.getToken();
        
        // Get current page ID from route
        const route = routeHandlers.getCurrentRoute();
        const match = route.path.match(/\/page\/(\d+)/);
        
        if (!match) {
          setLoading(false);
          return;
        }

        const pageId = match[1];
        
        // Fetch sync status from page property
        const response = await api.fetch({
          url: `/wiki/api/v2/pages/${pageId}/properties/external-sync`,
          headers: { Authorization: `Bearer ${token}` }
        });

        if (response.ok) {
          const data = await response.json();
          setStatus(data);
        }
      } catch (error) {
        console.error('Failed to load sync status:', error);
      } finally {
        setLoading(false);
      }
    }

    // Small delay to ensure route context is ready
    const timer = setTimeout(loadSyncStatus, 200);
    return () => clearTimeout(timer);
  }, []);

  if (loading) {
    return (
      <Card>
        <InlineSpinner size="small" /> Loading sync status...
      </Card>
    );
  }

  if (!status) {
    return (
      <Card>
        <Heading>Sync Status</Heading>
        <Text>Not yet synced</Text>
      </Card>
    );
  }

  const isError = status.status === 'error';
  
  return (
    <Card>
      <Heading>External Sync Status</Heading>
      
      <div style={{ marginTop: '16px' }}>
        <StatusBadge 
          icon={isError ? 'error' : 'success'}
          text={isError ? 'Sync Failed' : 'Synced'}
          appearance={isError ? 'danger' : 'success'}
        />
      </div>

      {status.timestamp && (
        <Text style={{ marginTop: '12px' }}>
          Last synced: {new Date(status.timestamp).toLocaleString()}
        </Text>
      )}

      {isError && status.error && (
        <Text style={{ marginTop: '8px', color: '#de350b' }}>
          Error: {status.error}
        </Text>
      )}
    </Card>
  );
}
```

---

## Pattern 3: Space-Wide Configuration with Per-Page Overrides

**Use case:** Configure app at space level, but allow page-specific overrides.

```javascript
// src/utils/config.js
import { api } from '@forge/bridge';

const SPACE_DEFAULTS_KEY = 'my-app-defaults';
const PAGE_OVERRIDES_KEY = 'my-app-overrides';

export async function getAppConfig(pageId, spaceId, token) {
  // Load space defaults first
  const spaceDefaults = await getSpaceProperty(spaceId, SPACE_DEFAULTS_KEY, token);
  
  // Then check for page overrides
  let pageOverrides;
  if (pageId) {
    pageOverrides = await getPageProperty(pageId, PAGE_OVERRIDES_KEY, token);
  }

  // Merge: page overrides take precedence
  return { ...spaceDefaults, ...pageOverrides };
}

export async function getSpaceDefaults(spaceId, token) {
  return getSpaceProperty(spaceId, SPACE_DEFAULTS_KEY, token);
}

export async function setSpaceDefaults(spaceId, defaults, token) {
  return saveSpaceProperty(spaceId, SPACE_DEFAULTS_KEY, defaults, token);
}

export async function getPageOverride(pageId, token) {
  return getPageProperty(pageId, PAGE_OVERRIDES_KEY, token);
}

export async function setPageOverride(pageId, overrides, token) {
  return savePageProperty(pageId, PAGE_OVERRIDES_KEY, overrides, token);
}

// --- Helper functions ---

async function getSpaceProperty(spaceId, key, token) {
  try {
    const response = await api.fetch({
      url: `/wiki/api/v2/spaces/${spaceId}/properties/${key}`,
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (response.ok) return await response.json();
  } catch (e) {
    // Property doesn't exist - return defaults
    return getDefaultSpaceConfig();
  }
  
  return null;
}

async function saveSpaceProperty(spaceId, key, value, token) {
  const response = await api.fetch({
    url: `/wiki/api/v2/spaces/${spaceId}/properties/${key}`,
    method: 'PUT',
    headers: { 
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(value)
  });
  
  return response.ok;
}

async function getPageProperty(pageId, key, token) {
  try {
    const response = await api.fetch({
      url: `/wiki/api/v2/pages/${pageId}/properties/${key}`,
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (response.ok) return await response.json();
  } catch (e) {
    return null;
  }
  
  return null;
}

async function savePageProperty(pageId, key, value, token) {
  const response = await api.fetch({
    url: `/wiki/api/v2/pages/${pageId}/properties/${key}`,
    method: 'PUT',
    headers: { 
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(value)
  });
  
  return response.ok;
}

function getDefaultSpaceConfig() {
  return {
    enabled: true,
    syncOnCreate: true,
    syncLabels: ['sync'],
    externalApiUrl: ''
  };
}
```

---

## Pattern 4: Reconciliation Scheduler for Missed Webhooks

**Use case:** Catch pages that webhooks missed.

```javascript
// src/scheduled/reconcile.js
import { api } from '@forge/bridge';

export default async function handler() {
  console.log('Starting reconciliation check...');
  
  const token = await AP.context.getToken();
  const lastCheckTime = await getLastReconciliationTimestamp(token);
  
  // Find pages modified since last reconciliation
  const response = await api.fetch({
    url: `/wiki/api/v2/search?cql=type=page%20AND%20lastModified>${lastCheckTime}`,
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!response.ok) {
    console.error('Search failed:', await response.text());
    return;
  }

  const data = await response.json();
  
  let processedCount = 0;
  
  for (const page of data.results) {
    // Check if already synced recently
    const syncStatus = await getPageProperty(page.id, 'external-sync', token);
    
    if (!syncStatus || isNewerThan(page.lastModified, syncStatus.timestamp)) {
      console.log(`Reconciling: ${page.title}`);
      
      try {
        await syncPageToExternalSystem({ page });
        processedCount++;
      } catch (error) {
        console.error(`Failed to reconcile ${page.id}:`, error);
      }
    }
  }

  // Update last check timestamp
  await setLastReconciliationTimestamp(token);
  
  console.log(`Reconciliation complete. Processed ${processedCount} pages.`);
}

async function getLastReconciliationTimestamp(token) {
  try {
    const response = await api.fetch({
      url: '/wiki/api/v2/app-data/reconciliation-last-check',
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (response.ok) {
      const data = await response.json();
      return data.timestamp;
    }
  } catch (e) {}
  
  // Default to 7 days ago
  const date = new Date();
  date.setDate(date.getDate() - 7);
  return date.toISOString();
}

async function setLastReconciliationTimestamp(token) {
  await api.fetch({
    url: '/wiki/api/v2/app-data/reconciliation-last-check',
    method: 'PUT',
    headers: { 
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ timestamp: new Date().toISOString() })
  });
}

function isNewerThan(pageModified, syncTimestamp) {
  return new Date(pageModified) > new Date(syncTimestamp);
}

async function getPageProperty(pageId, key, token) {
  try {
    const response = await api.fetch({
      url: `/wiki/api/v2/pages/${pageId}/properties/${key}`,
      headers: { Authorization: `Bearer ${token}` }
    });
    
    return response.ok ? await response.json() : null;
  } catch (e) {
    return null;
  }
}

async function syncPageToExternalSystem({ page }) {
  // Implement your sync logic here
  // This is called during reconciliation
}
```

---

## Pattern 5: Handle Rate Limits with Exponential Backoff

**Use case:** Gracefully handle API rate limits.

```javascript
// src/utils/rate-limit.js

const MAX_RETRIES = 3;
const BASE_DELAY = 1000; // 1 second

export async function fetchWithRetry(fetchFn, maxRetries = MAX_RETRIES) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetchFn();
      
      if (response.status === 429) {
        throw new RateLimitError('Rate limit exceeded');
      }
      
      return response;
    } catch (error) {
      lastError = error;
      
      if (isRetryable(error)) {
        const delay = calculateBackoff(attempt);
        console.log(`Retry ${attempt}/${maxRetries} in ${delay}ms...`);
        
        await sleep(delay);
      } else {
        // Non-retryable error, fail fast
        throw error;
      }
    }
  }
  
  throw lastError;
}

function isRetryable(error) {
  return (
    error instanceof RateLimitError ||
    error.status === 429 ||
    (error.response?.status === 429)
  );
}

function calculateBackoff(attempt) {
  // Exponential backoff with jitter
  const exponentialDelay = Math.pow(2, attempt - 1) * BASE_DELAY;
  const jitter = Math.random() * 0.3 * exponentialDelay;
  return exponentialDelay + jitter;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class RateLimitError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RateLimitError';
  }
}

// Usage example:
async function makeApiCall(pageId, token) {
  const response = await fetchWithRetry(() => 
    api.fetch({
      url: `/wiki/api/v2/pages/${pageId}`,
      headers: { Authorization: `Bearer ${token}` }
    })
  );
  
  return response.json();
}
```

---

## Pattern 6: Extract Page ID from Various URL Formats

**Use case:** Handle different Confluence page URL formats.

```javascript
// src/utils/page-context.js
import { routeHandlers } from '@forge/bridge';

export function extractPageIdFromRoute() {
  const route = routeHandlers.getCurrentRoute();
  
  // Try various patterns
  const patterns = [
    // Standard: /spaces/~username/page/123456789/Page+Title
    /\/page\/(\d+)/,
    
    // Legacy: /pages/viewpage.action?pageId=123456789
    /pageId=(\d+)/,
    
    // Modern viewer: /wiki/spaces/~username/pages/123456789
    /\/pages\/(\d+)/,
    
    // Space home page (no numeric ID in path)
    /^\/spaces\/[^/]+(\/home)?$/
  ];

  for (const pattern of patterns) {
    const match = route.path.match(pattern);
    
    if (match && match[1]) {
      return parseInt(match[1], 10);
    }
  }
  
  // Check query parameters as fallback
  const params = new URLSearchParams(route.search);
  const pageIdParam = params.get('pageId');
  
  if (pageIdParam) {
    return parseInt(pageIdParam, 10);
  }
  
  return null;
}

export function extractSpaceKeyFromRoute() {
  const route = routeHandlers.getCurrentRoute();
  
  // Pattern: /spaces/KEY/page/... or /spaces/~username/...
  const match = route.path.match(/^\/spaces\/([^/]+)/);
  
  if (match) {
    return match[1];
  }
  
  // Check query parameters
  const params = new URLSearchParams(route.search);
  return params.get('spaceKey');
}

// Usage in a component:
export function usePageContext() {
  const [pageId, setPageId] = useState(null);
  const [spaceKey, setSpaceKey] = useState(null);

  useEffect(() => {
    // Small delay to ensure route context is populated
    const timer = setTimeout(() => {
      setPageId(extractPageIdFromRoute());
      setSpaceKey(extractSpaceKeyFromRoute());
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  return { pageId, spaceKey };
}
```

---

## Next Steps

- [Core Concepts](01-core-concepts.md) - Forge fundamentals
- [Page Custom UI](02-page-custom-ui.md) - Building page extensions
- [Webhooks & Events](07-webhooks-events.md) - Handling events