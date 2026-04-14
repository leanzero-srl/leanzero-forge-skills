# Performance Optimization for Jira Forge Apps

This guide covers best practices for optimizing performance, reducing costs, and building scalable Forge apps.

---

## Understanding Cost Drivers

### What Costs Money (Starting January 2026)

| Capability | Free Allowance | Overage Price |
|------------|----------------|---------------|
| Functions: Duration | 100,000 GB-seconds/month | $0.000025/GB-second |
| KVS Reads | 0.1 GB/month | $0.055/GB |
| KVS Writes | Minimal | $1.09/GB |
| SQL Compute | 1 hour/month | $0.143/hour |
| SQL Requests | 100,000/month | $1.929/1M requests |
| SQL Storage | 730 GB-hours/month | $0.00076850/GB-hour |

### Free Capabilities (No Cost)
- Connect on Forge modules
- Remote capabilities  
- UI Kit and Custom UI rendering
- Triggers and conditions

---

## Function Optimization Patterns

### 1. Minimize Invocation Duration

**Bad: Sequential API calls**
```javascript
export const handler = async () => {
  const users = await api.asApp().requestJira(route`/rest/api/3/users/search?query=test`);
  const projects = await api.asApp().requestJira(route`/rest/api/3/project`);
  const issueTypes = await api.asApp().requestJira(route`/rest/api/3/issuetype`);
  
  return { users, projects, issueTypes };
};
```

**Good: Parallel API calls**
```javascript
export const handler = async () => {
  const [users, projects, issueTypes] = await Promise.all([
    api.asApp().requestJira(route`/rest/api/3/users/search?query=test`).then(r => r.json()),
    api.asApp().requestJira(route`/rest/api/3/project`).then(r => r.json()),
    api.asApp().requestJira(route`/rest/api/3/issuetype`).then(r => r.json())
  ]);
  
  return { users, projects, issueTypes };
};
```

### 2. Avoid Unnecessary Processing

**Bad: Processing all data when only summary needed**
```javascript
export const handler = async (payload) => {
  const issues = await searchIssues(payload.jql);
  
  // Process ALL issues even though we only need count
  const processed = issues.map(issue => ({
    key: issue.key,
    summary: issue.fields.summary,
    status: issue.fields.status.name,
    priority: issue.fields.priority?.name,
    labels: issue.fields.labels || [],
    // ... more processing
  }));
  
  return { total: processed.length };
};
```

**Good: Request only what you need**
```javascript
export const handler = async (payload) => {
  const response = await api.asApp().requestJira(
    route`/rest/api/3/search?jql=${encodeURIComponent(payload.jql)}&fields=summary,status&maxResults=0`
  );
  
  // maxResults=0 returns only total count, no issues
  const data = await response.json();
  
  return { total: data.total };
};
```

### 3. Use Streaming for Large Responses

**Bad: Loading entire response into memory**
```javascript
resolver.define('getLargeDataSet', async (payload) => {
  const response = await api.asApp().requestJira(
    route`/rest/api/3/search?jql=${payload.jql}&maxResults=10000`
  );
  
  const data = await response.json(); // Entire response in memory
  return data.issues;
});
```

**Good: Paginate and stream**
```javascript
async function* paginatedSearch(jql, maxResultsPerPage = 100) {
  let startAt = 0;
  let hasMore = true;
  
  while (hasMore) {
    const response = await api.asApp().requestJira(
      route`/rest/api/3/search?jql=${encodeURIComponent(jql)}&startAt=${startAt}&maxResults=${maxResultsPerPage}`
    );
    
    const data = await response.json();
    
    for (const issue of data.issues) {
      yield issue;
    }
    
    startAt += maxResultsPerPage;
    hasMore = data.isLast !== true;
  }
}

resolver.define('getLargeDataSet', async (payload) => {
  const issues = [];
  
  for await (const issue of paginatedSearch(payload.jql)) {
    // Process one at a time, don't hold all in memory
    if (shouldInclude(issue)) {
      issues.push({ key: issue.key, summary: issue.fields.summary });
      
      // Optional: limit result size to control duration
      if (issues.length >= payload.limit || issues.length > 1000) {
        break;
      }
    }
  }
  
  return issues;
});
```

---

## Storage Optimization Patterns

### Key-Value Store Best Practices

**1. Batch Operations**

```javascript
import api from '@forge/api';

// BAD: Individual reads
const config1 = await storage.get('config1');
const config2 = await storage.get('config2');
const config3 = await storage.get('config3');

// GOOD: Parallel batch read (still counts as 3 reads but faster)
const [config1, config2, config3] = await Promise.all([
  storage.get('config1'),
  storage.get('config2'),
  storage.get('config3')
]);

// BETTER: Use a single composite key if possible
const allConfig = await storage.get('all-configs');
```

**2. Minimize Write Size**

```javascript
// BAD: Storing entire issue objects
resolver.define('cacheIssue', async (payload) => {
  await storage.set(`issue:${payload.key}`, payload.issueData); // Large!
});

// GOOD: Store only needed fields
resolver.define('cacheIssue', async (payload) => {
  const minimalData = {
    key: payload.issueData.key,
    summary: payload.issueData.fields.summary,
    status: payload.issueData.fields.status.name,
    updated: payload.issueData.updated
  };
  await storage.set(`issue:${payload.key}`, minimalData);
});
```

**3. Implement TTL-like Behavior**

Forge KVS doesn't support TTL natively, but you can implement it:

```javascript
async function getWithTTL(key, fetchFn, ttlSeconds = 3600) {
  const cached = await storage.get(`cache:${key}`);
  
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }
  
  // Fetch fresh data
  const data = await fetchFn();
  
  // Store with expiry
  await storage.set(`cache:${key}`, {
    data,
    expiresAt: Date.now() + (ttlSeconds * 1000)
  });
  
  return data;
}

// Usage
resolver.define('getUserProfile', async (payload) => {
  return getWithTTL(
    `user:${payload.accountId}`,
    () => fetchUserProfile(payload.accountId),
    3600 // Cache for 1 hour
  );
});
```

### SQL Storage Best Practices

**1. Clean Up Old Data Regularly**

Create a scheduled trigger to clean data:

```javascript
// In manifest.yml
modules:
  scheduledTrigger:
    - key: cleanup-old-data
      function: cleanupOldData
      schedule: "0 2 * * *" # Daily at 2 AM

// In src/index.js
export const cleanupOldData = async () => {
  // Delete data older than 90 days
  await db.query(`
    DELETE FROM audit_events 
    WHERE created_at < datetime('now', '-90 days')
  `);
  
  console.log('Cleanup completed');
};
```

**2. Use Indexes for Frequently Queried Columns**

```sql
-- Create indexes in your migration script
CREATE INDEX IF NOT EXISTS idx_issue_key ON events(issue_key);
CREATE INDEX IF NOT EXISTS idx_created_at ON events(created_at);
CREATE INDEX IF NOT EXISTS idx_project_id ON events(project_id);
```

**3. Batch Inserts for Better Performance**

```javascript
// BAD: Individual inserts
for (const event of events) {
  await db.query(
    'INSERT INTO events (issue_key, action, created_at) VALUES (?, ?, ?)',
    [event.issueKey, event.action, event.createdAt]
  );
}

// GOOD: Batch insert
const values = events.map(e => [e.issueKey, e.action, e.createdAt]);
await db.query(
  `INSERT INTO events (issue_key, action, created_at) 
   VALUES ${values.map(() => '(?, ?, ?)').join(', ')}`,
  values.flat()
);
```

---

## Caching Strategies

### Multi-Level Caching Pattern

```javascript
import api from '@forge/api';

class MultiLevelCache {
  constructor() {
    // Level 1: In-memory (per invocation)
    this.memory = new Map();
    // Level 2: KVS (shared across invocations)
    this.kvsPrefix = 'cache:';
  }

  async get(key, fetchFn, kvsTtlMs = null) {
    // Check memory cache first
    if (this.memory.has(key)) {
      return this.memory.get(key);
    }

    // Check KVS cache
    if (kvsTtlMs !== null) {
      try {
        const cached = await storage.get(`${this.kvsPrefix}${key}`);
        if (cached && cached.expiresAt > Date.now()) {
          this.memory.set(key, cached.data);
          return cached.data;
        }
      } catch (err) {
        console.log('KVS cache miss:', err.message);
      }
    }

    // Fetch fresh data
    const data = await fetchFn();
    
    // Store in memory
    this.memory.set(key, data);
    
    // Store in KVS if TTL provided
    if (kvsTtlMs !== null) {
      try {
        await storage.set(`${this.kvsPrefix}${key}`, {
          data,
          expiresAt: Date.now() + kvsTtlMs
        });
      } catch (err) {
        console.log('KVS cache set failed:', err.message);
      }
    }

    return data;
  }

  async invalidate(key) {
    this.memory.delete(key);
    try {
      await storage.remove(`${this.kvsPrefix}${key}`);
    } catch (err) {
      // Ignore KVS errors during invalidation
    }
  }
}

// Usage
const cache = new MultiLevelCache();

resolver.define('getProjectData', async (payload) => {
  return cache.get(
    `project:${payload.key}`,
    () => api.asApp().requestJira(route`/rest/api/3/project/${payload.key}`).then(r => r.json()),
    86400000 // Cache for 24 hours
  );
});
```

---

## Reducing API Points Consumption

### 1. Field Filtering

**Always specify fields parameter:**

```javascript
// Bad: Fetches all fields (costs more points)
const issue = await api.asApp().requestJira(
  route`/rest/api/3/issue/${key}`
);

// Good: Only fetch what you need
const issue = await api.asApp().requestJira(
  route`/rest/api/3/issue/${key}?fields=summary,status,assignee,reporter,priority`
);
```

### 2. Avoid Unnecessary Expands

```javascript
// Bad: Expanding everything by default
const issue = await api.asApp().requestJira(
  route`/rest/api/3/issue/${key}?expand=changelog,names,schema,operations,editmeta`
);

// Good: Only expand when actually needed
const issue = await api.asApp().requestJira(route`/rest/api/3/issue/${key}`);
```

### 3. Use Search Instead of Multiple Get Calls

**Bad:**
```javascript
const issues = [];
for (const key of issueKeys) {
  const response = await api.asApp().requestJira(
    route`/rest/api/3/issue/${key}`
  );
  issues.push(await response.json());
}
```

**Good:**
```javascript
const jql = `key IN (${issueKeys.map(k => `"${k}"`).join(',')})`;
const response = await api.asApp().requestJira(
  route`/rest/api/3/search?jql=${encodeURIComponent(jql)}&fields=summary,status`
);
const issues = (await response.json()).issues;
```

### 4. Leverage Webhooks Instead of Polling

Instead of scheduled triggers polling for changes:

**Bad (Polling):**
```javascript
// Runs every minute, checking for changes
export const checkForChanges = async () => {
  const lastCheck = await storage.get('last-check');
  
  const response = await api.asApp().requestJira(
    route`/rest/api/3/search?jql=updated >= "${lastCheck}"&maxResults=100`
  );
  
  // Process changes...
};
```

**Good (Event-driven with triggers):**
```yaml
# In manifest.yml - use issue events instead
modules:
  trigger:
    - key: issue-updated
      function: handleIssueUpdate
      events:
        - jira:issue_updated
```

---

## Memory Management

### Avoid Memory Leaks in Long-Running Functions

**Bad:**
```javascript
const globalCache = []; // Grows indefinitely!

export const handler = async (payload) => {
  globalCache.push({ data: payload, timestamp: Date.now() });
  
  if (globalCache.length > 10000) {
    // Never cleaned up properly
  }
  
  return process(payload);
};
```

**Good:**
```javascript
// Use bounded cache with cleanup
const MAX_CACHE_SIZE = 100;
const cache = new Map();

export const handler = async (payload) => {
  if (cache.size >= MAX_CACHE_SIZE) {
    // Remove oldest entries
    const keys = Array.from(cache.keys());
    for (let i = 0; i < keys.length / 2; i++) {
      cache.delete(keys[i]);
    }
  }
  
  cache.set(payload.id, { data: payload, timestamp: Date.now() });
  
  return process(payload);
};
```

---

## Timeout Handling

### Set Appropriate Timeouts

Forge functions have a maximum execution time. Handle long operations gracefully:

```javascript
async function withTimeout(promise, timeoutMs, fallback) {
  const timeout = new Promise((_, reject) => 
    setTimeout(() => reject(new Error('Timeout')), timeoutMs)
  );
  
  try {
    return await Promise.race([promise, timeout]);
  } catch (error) {
    console.log('Operation timed out, using fallback');
    return fallback;
  }
}

// Usage
resolver.define('getComplexData', async (payload) => {
  const result = await withTimeout(
    fetchComplexData(payload),
    5000, // 5 second timeout
    getSimpleFallback()  // Return simple data if timeout
  );
  
  return result;
});
```

---

## Cost Estimation Examples

### Example: Issue Sync App

**Scenario:** Sync 100 issues per hour, each sync involves:
- 1 GET /issue call (2 points)
- 1 KVS read (avg 5KB = ~0.005 GB)
- 1 KVS write if changed (avg 2KB = ~0.002 GB)

**Monthly Calculation:**
- API calls: 100 × 24 × 30 = 72,000 calls × 2 points = **144,000 points/hour well within free tier**
- KVS reads: 72,000 × 0.005 GB = 360 GB → **$19.80/month overage** (after 0.1GB free)
- KVS writes: Assume 10% changed = 7,200 × 0.002 GB = 14.4 GB → **$15.70/month overage**

**Optimization:** Add caching to reduce reads by 80%
- New KVS reads: 360 × 0.2 = 72 GB → **Free (within 0.1GB tier)**
- Savings: ~$19.80/month

---

## Performance Checklist

Before deploying to production:

- [ ] Use field filtering on all search/issue calls
- [ ] Parallelize independent API calls with Promise.all()
- [ ] Implement pagination for large result sets
- [ ] Add caching layer (memory + KVS)
- [ ] Set timeouts on long-running operations
- [ ] Clean up old data regularly
- [ ] Use webhooks/triggers instead of polling where possible
- [ ] Batch database inserts/updates
- [ ] Monitor function duration in logs
- [ ] Estimate monthly costs based on expected usage

---

## Related Documentation

- [Rate Limit Handling](19-rate-limit-handling.md)
- [Custom UI Troubleshooting](18-custom-ui-troubleshooting.md)
- [Bridge API Reference](15-bridge-api-reference.md)