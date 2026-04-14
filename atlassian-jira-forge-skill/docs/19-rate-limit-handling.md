# Rate Limit Handling in Jira Forge

This guide covers the new points-based rate limiting model (effective March 2026) and how to handle rate limits gracefully in your Forge apps.

---

## Understanding the New Rate Limit Model

### Points-Based Quota System

Jira Cloud now uses a **points-based model** instead of simple request counting. Each API call consumes points based on:
- Base cost: 1 point per request
- Object costs: Additional points for each object returned
- Write operations: Only base cost (1 point)

### Point Costs by Operation Type

| Operation Type | Points | Example |
|----------------|--------|---------|
| Core domain objects (GET) | 1 + objects × 1 | Get single issue = 2 points |
| Identity & access (GET) | 1 + users × 2 | Get group members |
| Write/modify/delete | 1 point | Create/update issue |

### Hourly Quotas by Tier

#### Tier 1 - Global Pool (Default)
- **65,000 points/hour** shared across all tenants
- Applies to most apps automatically

#### Tier 2 - Per-Tenant Pool (After Review)

| Edition | Formula | Cap |
|---------|---------|-----|
| Free | 65,000 pts/hr | N/A |
| Standard | 100,000 + (10 × users) | 500,000 |
| Premium | 130,000 + (20 × users) | 500,000 |
| Enterprise | 150,000 + (30 × users) | 500,000 |

---

## Three Rate Limit Types to Handle

### 1. Points-Based Quota (Hourly)

**Trigger:** Total points exceed hourly allocation

**Response Headers:**
```
Beta-RateLimit-Policy: "global-app-quota";q=65000;w=3600
Beta-RateLimit: "global-app-quota";r=11000;t=600
```

**When r (remaining) is 0:** All requests denied until window resets

---

### 2. Burst Rate Limit (Per-Second)

**Default Limits by HTTP Method:**

| Method | Requests/Second |
|--------|-----------------|
| GET | 100 |
| POST | 100 |
| PUT | 50 |
| DELETE | 50 |

**Response Headers:**
```
HTTP/1.1 429 Too Many Requests
Retry-After: 1
RateLimit-Reason: jira-burst-based
X-RateLimit-Limit: 350
X-RateLimit-Remaining: 0
```

---

### 3. Per-Issue Write Limit

**Limits:**
- **Short window:** 20 writes per 2 seconds
- **Long window:** 100 writes per 30 seconds

**Response Headers:**
```
RateLimit-Reason: jira-per-issue-on-write
Retry-After: <seconds>
```

---

## Implementing Rate Limit Detection

### Detect All Three Limit Types

```javascript
import api, { route } from '@forge/api';

async function checkRateLimits(response) {
  const headers = {
    rateLimitPolicy: response.headers.get('Beta-RateLimit-Policy'),
    rateLimit: response.headers.get('Beta-RateLimit'),
    rateLimitReason: response.headers.get('RateLimit-Reason'),
    retryAfter: response.headers.get('Retry-After')
  };

  // Check if near limit (less than 20% remaining)
  const isNearLimit = response.headers.get('X-Beta-RateLimit-NearLimit') === 'true';
  
  return {
    isRateLimited: response.status === 429,
    reason: headers.rateLimitReason,
    retryAfter: parseInt(headers.retryAfter) || 0,
    isNearLimit,
    headers
  };
}

// Usage
const response = await api.asApp().requestJira(route`/rest/api/3/issue/PROJ-123`);
const limits = await checkRateLimits(response);

if (limits.isRateLimited) {
  console.log(`Rate limited: ${limits.reason}, retry after ${limits.retryAfter}s`);
}
```

---

## Exponential Backoff with Jitter Implementation

### Complete Retry Logic

```javascript
/**
 * Implements exponential backoff with jitter for rate limit handling
 */
async function fetchWithRetry(
  url, 
  options = {},
  maxRetries = 4,
  baseDelayMs = 2000,
  maxDelayMs = 30000
) {
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await api.asApp().requestJira(url, options);
      
      // Handle non-rate-limit errors
      if (!response.ok && response.status !== 429) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }
      
      // Check for rate limit
      const retryAfter = response.headers.get('Retry-After');
      const rateLimitReason = response.headers.get('RateLimit-Reason');
      
      if (response.status === 429) {
        console.log(`Attempt ${attempt + 1}/${maxRetries}: Rate limited (${rateLimitReason})`);
        
        // Use Retry-After header or calculate delay
        let delayMs;
        if (retryAfter) {
          delayMs = Math.min(parseInt(retryAfter) * 1000, maxDelayMs);
        } else {
          // Exponential backoff: base * 2^attempt
          delayMs = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
          
          // Add jitter (random factor between 0.7 and 1.3)
          const jitter = 0.7 + Math.random() * 0.6;
          delayMs *= jitter;
        }
        
        console.log(`Waiting ${delayMs}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        continue; // Retry
      }
      
      return response; // Success
      
    } catch (error) {
      lastError = error;
      console.error(`Attempt ${attempt + 1} failed:`, error.message);
    }
  }
  
  throw new Error(`Max retries exceeded. Last error: ${lastError.message}`);
}

// Usage example
const response = await fetchWithRetry(
  route`/rest/api/3/search?jql=project=PROJ`,
  { method: 'GET' },
  4,           // maxRetries
  2000,        // baseDelayMs (2 seconds)
  30000        // maxDelayMs (30 seconds)
);

const data = await response.json();
```

---

## Rate Limit-Aware API Client

### Complete Implementation with Quota Tracking

```javascript
import api, { route } from '@forge/api';

class RateLimitedApiClient {
  constructor() {
    this.quotaUsed = 0;
    this.quotaLimit = 65000; // Default Global Pool
    this.windowStart = Date.now();
    this.pendingRequests = [];
  }

  /**
   * Parse rate limit headers to update quota tracking
   */
  updateQuotaFromHeaders(headers) {
    const policy = headers.get('Beta-RateLimit-Policy');
    const limit = headers.get('Beta-RateLimit');
    
    if (policy && limit) {
      // Extract remaining from Beta-RateLimit header
      const match = limit.match(/r=(\d+)/);
      if (match) {
        this.quotaUsed = this.quotaLimit - parseInt(match[1]);
      }
      
      // Update quota limit if different tier
      const policyMatch = policy.match(/q=(\d+)/);
      if (policyMatch) {
        this.quotaLimit = parseInt(policyMatch[1]);
      }
    }
  }

  /**
   * Check if we should pause requests based on quota
   */
  shouldPauseRequests() {
    // Pause if less than 5% of quota remaining
    const remainingPercent = (this.quotaLimit - this.quotaUsed) / this.quotaLimit;
    return remainingPercent < 0.05;
  }

  /**
   * Calculate points cost for a request
   */
  estimatePoints(method, objectsReturned = 1) {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      return 1; // Write operations cost base only
    }
    
    // Read operations: base + object costs
    const objectCost = 1; // Default for most objects
    return 1 + (objectsReturned * objectCost);
  }

  /**
   * Make a rate-limit aware request
   */
  async request(path, options = {}) {
    const method = options.method || 'GET';
    
    // Check if we should pause due to quota
    if (this.shouldPauseRequests()) {
      console.warn('Approaching quota limit, pausing requests');
      await this.waitUntilQuotaReset();
    }

    let response;
    try {
      response = await api.asApp().requestJira(
        route`${path}`,
        options
      );
      
      // Update quota tracking from headers
      this.updateQuotaFromHeaders(response.headers);
      
      const rateLimitReason = response.headers.get('RateLimit-Reason');
      
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Retry-After')) || 1;
        
        // Handle different rate limit types differently
        switch (rateLimitReason) {
          case 'jira-per-issue-on-write':
            console.log('Per-issue write limit hit, waiting...', retryAfter);
            await new Promise(r => setTimeout(r, retryAfter * 1000));
            return this.request(path, options); // Retry
            
          case 'jira-burst-based':
            console.log('Burst limit hit, slowing down...');
            await new Promise(r => setTimeout(r, retryAfter * 1000));
            return this.request(path, options); // Retry
            
          case 'jira-quota-global-based':
          case 'jira-quota-tenant-based':
            console.log('Hourly quota exhausted, waiting until reset...');
            await this.waitUntilQuotaReset();
            return this.request(path, options); // Retry
            
          default:
            throw new Error(`Unknown rate limit reason: ${rateLimitReason}`);
        }
      }
      
      return response;
      
    } catch (error) {
      console.error('API request failed:', error.message);
      throw error;
    }
  }

  /**
   * Wait until current quota window resets
   */
  async waitUntilQuotaReset() {
    const now = Date.now();
    const nextHour = new Date(now + (60 - new Date().getMinutes()) * 60 * 1000).getTime();
    const secondsToWait = Math.ceil((nextHour - now) / 1000);
    
    console.log(`Waiting ${secondsToWait} seconds until quota reset...`);
    await new Promise(resolve => setTimeout(resolve, secondsToWait * 1000));
    
    // Reset tracking
    this.quotaUsed = 0;
    this.windowStart = Date.now();
  }

  /**
   * Get current quota status
   */
  getQuotaStatus() {
    return {
      used: this.quotaUsed,
      limit: this.quotaLimit,
      remaining: this.quotaLimit - this.quotaUsed,
      percentUsed: (this.quotaUsed / this.quotaLimit) * 100
    };
  }
}

// Usage
const client = new RateLimitedApiClient();

// Make requests with automatic rate limit handling
const issueResponse = await client.request(
  route`/rest/api/3/issue/PROJ-123`,
  { method: 'GET' }
);

// Check quota status
console.log('Quota status:', client.getQuotaStatus());
```

---

## Optimizing API Usage to Reduce Points

### 1. Field Filtering

**Bad:** Fetching all fields
```javascript
const response = await api.asApp().requestJira(route`/rest/api/3/issue/PROJ-123`);
```

**Good:** Request only needed fields
```javascript
const response = await api.asApp().requestJira(
  route`/rest/api/3/issue/PROJ-123?fields=summary,status,assignee,reporter`
);
```

### 2. Use Expand Wisely

**Bad:** Expanding everything
```javascript
const response = await api.asApp().requestJira(
  route`/rest/api/3/issue/PROJ-123?expand=renderedFields,names,schema,operations,editmeta,changelog,versionedRepresentations`
);
```

**Good:** Expand only what you need
```javascript
const response = await api.asApp().requestJira(
  route`/rest/api/3/issue/PROJ-123?expand=changelog` // Only if you need history
);
```

### 3. Batch Operations

**Bad:** Multiple individual updates
```javascript
for (const issueKey of issueKeys) {
  await api.asApp().requestJira(
    route`/rest/api/3/issue/${issueKey}`,
    { method: 'PUT', body: JSON.stringify({ fields }) }
  );
}
```

**Good:** Use bulk endpoints where available
```javascript
// Jira doesn't have a true bulk update endpoint, but you can:
// 1. Parallelize with Promise.all (faster but same points)
const updates = issueKeys.map(key => 
  api.asApp().requestJira(
    route`/rest/api/3/issue/${key}`,
    { method: 'PUT', body: JSON.stringify({ fields }) }
  )
);
await Promise.all(updates);

// 2. Or use search + bulk update pattern if modifying many issues
```

### 4. Cache Stable Responses

```javascript
import api, { route } from '@forge/api';

const cache = new Map();

async function getCachedIssue(issueKey) {
  const cacheKey = `issue:${issueKey}`;
  
  // Check in-memory cache first (lasts one invocation)
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }
  
  // Fetch from API
  const response = await api.asApp().requestJira(
    route`/rest/api/3/issue/${issueKey}`
  );
  const data = await response.json();
  
  // Store in cache
  cache.set(cacheKey, data);
  
  return data;
}

// Use throughout your resolver
resolver.define('getIssueData', async (payload) => {
  const issue = await getCachedIssue(payload.issueKey);
  return {
    summary: issue.fields.summary,
    // Reuse cached issue for other operations in same invocation
    status: issue.fields.status.name
  };
});
```

### 5. Use ETags for Conditional Requests

```javascript
async function getIssueIfChanged(issueKey, previousEtag) {
  const response = await api.asApp().requestJira(
    route`/rest/api/3/issue/${issueKey}`,
    {
      headers: {
        'If-None-Match': previousEtag
      }
    }
  );
  
  if (response.status === 304) {
    return null; // Not modified, use cached data
  }
  
  return await response.json();
}
```

---

## Per-Issue Write Rate Limit Handling

### Pattern: Distributed Updates with Delays

```javascript
async function batchUpdateIssue(issueKey, updates) {
  const BATCH_SIZE = 10; // Max writes per ~2 seconds
  
  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = updates.slice(i, i + BATCH_SIZE);
    
    await Promise.all(
      batch.map(update => 
        api.asApp().requestJira(
          route`/rest/api/3/issue/${issueKey}`,
          {
            method: 'PUT',
            body: JSON.stringify(update)
          }
        )
      )
    );
    
    // Add delay between batches
    if (i + BATCH_SIZE < updates.length) {
      console.log(`Pausing before next batch...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}
```

---

## Monitoring Rate Limits in Production

### Log Quota Usage Periodically

```javascript
// Add to your scheduled trigger for monitoring
export const checkRateLimits = async () => {
  // This won't directly give quota, but you can track from headers
  console.log('Checking rate limit status...');
  
  try {
    // Make a lightweight request to get current limits
    const response = await api.asApp().requestJira(
      route`/rest/api/3/myself`
    );
    
    const policy = response.headers.get('Beta-RateLimit-Policy');
    const limit = response.headers.get('Beta-RateLimit');
    
    console.log('Rate Limit Policy:', policy);
    console.log('Rate Limit Status:', limit);
    
  } catch (error) {
    console.error('Error checking rate limits:', error.message);
  }
};
```

---

## Summary: Rate Limit Response Handling

| Header | Purpose | Action |
|--------|---------|--------|
| `Beta-RateLimit-Policy` | Shows current quota policy | Track limit type (global vs tenant) |
| `Beta-RateLimit` with r=0 | Quota exhausted | Stop all requests until reset |
| `RateLimit-Reason: jira-quota-*` | Hourly quota exceeded | Wait for hour reset |
| `RateLimit-Reason: jira-burst-based` | Per-second limit hit | Slow down, retry after delay |
| `RateLimit-Reason: jira-per-issue-on-write` | Too many writes to one issue | Add delays between updates |
| `Retry-After` | Seconds until safe retry | Wait this duration before retrying |

---

## Related Documentation

- [Custom UI Troubleshooting](18-custom-ui-troubleshooting.md)
- [Performance Optimization](20-performance-optimization.md)
- [API Endpoints Enhanced](06-api-endpoints-enhanced.md)