# Performance Optimization: Confluence Forge Apps

This guide covers best practices for optimizing the performance of Confluence Forge applications.

---

## Overview

Performance optimization in Confluence Forge apps involves:

1. **API Efficiency** - Making fewer, smarter API calls
2. **Caching Strategies** - Reducing redundant data fetches
3. **UI Optimization** - Responsive custom UI components
4. **Error Handling** - Graceful degradation and retry logic

---

## API Call Optimization

### Pattern 1: Batch API Calls

Instead of fetching data sequentially, use parallel requests:

```javascript
// ❌ Sequential (slow)
const page = await requestConfluence(route`/wiki/api/v2/pages/${pageId}`);
const space = await requestConfluence(route`/wiki/api/v2/spaces/${spaceId}`);
const user = await requestConfluence(route`/wiki/api/v2/users/${userId}`);

// ✅ Parallel (fast)
const [page, space, user] = await Promise.all([
  requestConfluence(route`/wiki/api/v2/pages/${pageId}`),
  requestConfluence(route`/wiki/api/v2/spaces/${spaceId}`),
  requestConfluence(route`/wiki/api/v2/users/${userId}`)
]);
```

### Pattern 2: Use Cursor-Based Pagination

```javascript
// Efficient pagination using cursors
async function fetchAllPages() {
  let cursor = null;
  const allPages = [];

  do {
    const response = await requestConfluence(
      route`/wiki/api/v2/pages?cursor=${cursor || ''}&limit=100`
    );

    if (!response.ok) break;

    const data = await response.json();
    allPages.push(...data.results);

    // Get next cursor from _links.next
    cursor = data._links?.next 
      ? new URL(data._links.next).searchParams.get('cursor')
      : null;
  } while (cursor);

  return allPages;
}
```

### Pattern 3: Use Search API with CQL

```javascript
// ❌ Fetch all pages, then filter client-side
const pages = await requestConfluence(route`/wiki/api/v2/pages?limit=1000`);
const filtered = pages.results.filter(p => p.space.key === 'PROJ');

// ✅ Filter server-side using CQL
const response = await requestConfluence(
  route`/wiki/api/v2/search?cql=type=page%20AND%20space=PROJ&limit=100`
);
```

---

## Caching Strategies

### Pattern 1: In-Memory Cache with TTL

```javascript
// cache.js
const cache = new Map();

function getFromCache(key) {
  const entry = cache.get(key);
  
  if (!entry || Date.now() > entry.expiry) {
    return null;
  }
  
  return entry.value;
}

function setInCache(key, value, ttlMs = 60000) { // Default 1 minute
  cache.set(key, {
    value,
    expiry: Date.now() + ttlMs
  });
}

// Usage in your component
async function fetchPageWithCaching(pageId) {
  const cached = getFromCache(`page:${pageId}`);
  
  if (cached) return cached;

  const page = await requestConfluence(route`/wiki/api/v2/pages/${pageId}`);
  setInCache(`page:${pageId}`, page);
  
  return page;
}
```

### Pattern 2: Content Properties as Cache

```javascript
// Use Confluence content properties to cache data
async function getCachedPageData(pageId, cacheKey) {
  // Check if cached value exists
  const propsResponse = await requestConfluence(
    route`/wiki/api/v2/pages/${pageId}/properties/${cacheKey}`
  );

  if (propsResponse.ok) {
    const prop = await propsResponse.json();
    
    // Validate cache age (15 minutes)
    const now = new Date().getTime();
    if (now - prop.timestamp < 15 * 60000) {
      return prop.value;
    }
  }

  // Cache miss - fetch fresh data
  const page = await requestConfluence(
    route`/wiki/api/v2/pages/${pageId}?bodyFormat=storage`
  );

  if (page.ok) {
    const data = await page.json();
    
    // Store in content properties for next time
    await requestConfluence(
      route`/wiki/api/v2/pages/${pageId}/properties/${cacheKey}`,
      { 
        method: 'PUT',
        body: JSON.stringify({
          key: cacheKey,
          value: data,
          timestamp: new Date().getTime()
        })
      }
    );
  }

  return page.ok ? await page.json() : null;
}
```

---

## UI Optimization

### Pattern 1: Lazy Loading Components

```jsx
import React, { lazy, Suspense } from 'react';

// Lazy load heavy components
const AnalyticsDashboard = lazy(() => import('./AnalyticsDashboard'));
const SearchResults = lazy(() => import('./SearchResults'));

export default function PageExtension() {
  const [showAnalytics, setShowAnalytics] = useState(false);

  return (
    <div>
      <button onClick={() => setShowAnalytics(true)}>
        Show Analytics
      </button>

      {showAnalytics && (
        <Suspense fallback={<div>Loading...</div>}>
          <AnalyticsDashboard />
        </Suspense>
      )}
    </div>
  );
}
```

### Pattern 2: Virtual Scrolling for Large Lists

```jsx
import React from 'react';
import { FixedSizeList } from 'react-window';

// For very large lists (>100 items), use virtualization
function VirtualizedPageList({ pages }) {
  const Row = ({ index, style }) => (
    <div style={style}>
      <PageItem page={pages[index]} />
    </div>
  );

  return (
    <FixedSizeList
      height={600}
      itemCount={pages.length}
      itemSize={50}
      width="100%"
    >
      {Row}
    </FixedSizeList>
  );
}

// For smaller lists, use standard pagination instead
function PaginatedPageList({ pages }) {
  const [currentPage, setCurrentPage] = useState(0);
  const ITEMS_PER_PAGE = 25;

  const paginatedPages = pages.slice(
    currentPage * ITEMS_PER_PAGE,
    (currentPage + 1) * ITEMS_PER_PAGE
  );

  return (
    <div>
      {paginatedPages.map(page => (
        <PageItem key={page.id} page={page} />
      ))}

      <Pagination
        currentPage={currentPage}
        totalPages={Math.ceil(pages.length / ITEMS_PER_PAGE)}
        onPageChange={setCurrentPage}
      />
    </div>
  );
}
```

### Pattern 3: Debounce API Calls

```jsx
import React, { useState, useEffect } from 'react';
import { debounce } from 'lodash';

function SearchInput() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  // Debounce search to avoid API spam
  const debouncedSearch = debounce(async (searchTerm) => {
    if (!searchTerm || searchTerm.length < 3) {
      setResults([]);
      return;
    }

    setLoading(true);
    
    try {
      const response = await requestConfluence(
        route`/wiki/api/v2/search?cql=text~"${encodeURIComponent(searchTerm)}"&limit=10`
      );

      if (response.ok) {
        const data = await response.json();
        setResults(data.results || []);
      }
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setLoading(false);
    }
  }, 300); // Wait 300ms after typing stops

  useEffect(() => {
    debouncedSearch(query);
    
    return () => debouncedSearch.cancel();
  }, [query]);

  return (
    <div>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search pages..."
      />

      {loading && <p>Loading...</p>}

      <ul>
        {results.map(result => (
          <li key={result.id}>
            {result.title}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

---

## Network Optimization

### Pattern 1: Use Compression for Large Data

```javascript
// Compress data before sending to backend
async function compressAndSendData(data) {
  const jsonString = JSON.stringify(data);
  
  // Convert string to Uint8Array
  const encoder = new TextEncoder();
  const dataUint8Array = encoder.encode(jsonString);

  // Compress using gzip (via Web Compression API)
  const compressedStream = await new Response(dataUint8Array).arrayBuffer();
  
  // Send to backend
  return fetch('https://your-backend.com/api/data', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'gzip'
    },
    body: compressedStream
  });
}
```

### Pattern 2: Request Batching

```javascript
// Batch multiple API requests into one backend call
async function batchConfluenceRequests(requests) {
  // Create a single request that contains all sub-requests
  const response = await fetch('https://your-backend.com/api/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: requests.map(req => ({
        url: `/wiki/api/v2${req.path}`,
        method: req.method || 'GET'
      }))
    })
  });

  if (response.ok) {
    const results = await response.json();
    
    // Map results back to original requests
    return results.map((result, index) => {
      if (result.success) {
        return result.data;
      }
      throw new Error(result.error);
    });
  }

  throw new Error('Batch request failed');
}

// Usage
const [page1, page2, page3] = await batchConfluenceRequests([
  { path: '/pages/1' },
  { path: '/pages/2' },
  { path: '/pages/3' }
]);
```

---

## Scheduled Trigger Optimization

### Pattern 1: Incremental Processing

```javascript
// Process only what's changed since last run
export default async function handler() {
  const lastRunTime = await getLastSyncTimestamp();
  
  // Use lastModified filter to get only changed content
  const response = await requestConfluence(
    route`/wiki/api/v2/search?cql=type=page%20AND%20lastModified>${lastRunTime}&limit=100`
  );

  if (!response.ok) {
    console.error('Search failed:', response.statusText);
    return;
  }

  const data = await response.json();
  
  // Process each page
  for (const page of data.results || []) {
    await processPage(page);
    
    // Update progress timestamp after each successful operation
    await setLastSyncTimestamp(new Date().toISOString());
  }
}

async function getLastSyncTimestamp() {
  // Retrieve from Forge Storage or content property
  return '2024-01-01T00:00:00.000Z';
}

async function setLastSyncTimestamp(timestamp) {
  // Store timestamp for next run
}
```

### Pattern 2: Parallel Processing with Throttling

```javascript
// Process items in parallel but limit concurrent requests
async function processWithThrottling(items, maxConcurrent = 5) {
  const results = [];
  
  for (let i = 0; i < items.length; i += maxConcurrent) {
    const batch = items.slice(i, i + maxConcurrent);
    
    // Process batch in parallel
    const batchResults = await Promise.allSettled(
      batch.map(item => processItem(item))
    );
    
    results.push(...batchResults);
  }
  
  return results;
}

async function processItem(item) {
  try {
    // Your processing logic here
    await requestConfluence(route`/wiki/api/v2/pages/${item.id}`);
    return { status: 'fulfilled', item };
  } catch (error) {
    return { status: 'rejected', reason: error, item };
  }
}
```

---

## Error Handling & Retry Logic

### Pattern 1: Exponential Backoff

```javascript
async function fetchWithRetry(url, options = {}, maxRetries = 3) {
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await requestConfluence(route`${url}`, options);
      
      // Success - return immediately
      if (response.status !== 429 && response.status < 500) {
        return response;
      }
      
      throw new Error(`HTTP ${response.status}`);
      
    } catch (error) {
      lastError = error;
      
      // Don't retry non-retryable errors
      if (error.status === 401 || error.status === 403) {
        throw error;
      }
      
      // Calculate backoff delay (1s, 2s, 4s)
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw new Error(`Failed after ${maxRetries + 1} attempts: ${lastError.message}`);
}
```

### Pattern 2: Circuit Breaker

```javascript
class CircuitBreaker {
  constructor(failureThreshold = 5, resetTimeout = 30000) {
    this.failureThreshold = failureThreshold;
    this.resetTimeout = resetTimeout;
    this.failures = 0;
    this.lastFailureTime = null;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
  }

  async execute(asyncFn) {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.resetTimeout) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await asyncFn();
      
      if (this.state === 'HALF_OPEN') {
        this.state = 'CLOSED';
        this.failures = 0;
      }
      
      return result;
      
    } catch (error) {
      this.failures++;
      this.lastFailureTime = Date.now();
      
      if (this.failures >= this.failureThreshold) {
        this.state = 'OPEN';
      }
      
      throw error;
    }
  }
}

// Usage
const circuitBreaker = new CircuitBreaker();

await circuitBreaker.execute(() => 
  requestConfluence(route`/wiki/api/v2/pages/${pageId}`)
);
```

---

## Memory Optimization

### Pattern 1: Stream Large Results

```javascript
// Process large result sets without loading everything into memory
async function* streamPages() {
  let cursor = null;

  do {
    const response = await requestConfluence(
      route`/wiki/api/v2/pages?cursor=${cursor || ''}&limit=50`
    );

    if (!response.ok) break;

    const data = await response.json();
    
    for (const page of data.results || []) {
      yield page;
    }

    cursor = data._links?.next 
      ? new URL(data._links.next).searchParams.get('cursor')
      : null;
  } while (cursor);
}

// Usage
for await (const page of streamPages()) {
  // Process each page without loading all into memory
  console.log(page.title);
}
```

### Pattern 2: Use Web Workers for Heavy Processing

```javascript
// worker.js (separate file)
self.onmessage = function(e) {
  const { data } = e.data;
  
  // Heavy processing here
  const results = data.pages.map(processPage).filter(filterResults);
  
  self.postMessage(results);
};

function processPage(page) {
  // CPU-intensive processing
}

// Main thread
const worker = new Worker('./worker.js');

worker.onmessage = function(e) {
  console.log('Processing complete:', e.data);
};

worker.postMessage({ pages: largePageArray });
```

---

## Best Practices Summary

### API Calls
- ✅ Use `Promise.all()` for parallel requests
- ✅ Use CQL search instead of client-side filtering
- ✅ Implement cursor-based pagination
- ❌ Avoid fetching all data and filtering client-side

### Caching
- ✅ Cache in memory with TTL for short-term needs
- ✅ Use content properties for long-term caching
- ✅ Validate cache age before using cached data

### UI
- ✅ Lazy load heavy components
- ✅ Use virtual scrolling for large lists
- ✅ Debounce user input before API calls
- ❌ Don't render thousands of DOM elements at once

### Network
- ✅ Batch multiple requests into one backend call
- ✅ Implement exponential backoff for retries
- ✅ Use compression for large payloads

### Scheduled Tasks
- ✅ Process incrementally using timestamps
- ✅ Throttle concurrent API calls
- ✅ Store progress for recovery

### Error Handling
- ✅ Implement circuit breaker pattern
- ✅ Use exponential backoff with jitter
- ✅ Gracefully handle rate limits (429)

---

## Monitoring Performance

```javascript
// Add performance tracking to your app
function measurePerformance(label, fn) {
  const start = performance.now();
  
  return async (...args) => {
    try {
      const result = await fn(...args);
      
      const end = performance.now();
      console.log(`${label} took ${end - start}ms`);
      
      // Send metrics to your monitoring service
      if (process.env.MONITORING_ENABLED) {
        trackMetric(label, end - start);
      }
      
      return result;
    } catch (error) {
      console.error(`${label} failed:`, error);
      throw error;
    }
  };
}

// Usage
const fetchPage = measurePerformance('fetchPage', async (id) => {
  const response = await requestConfluence(route`/wiki/api/v2/pages/${id}`);
  return response.ok ? await response.json() : null;
});