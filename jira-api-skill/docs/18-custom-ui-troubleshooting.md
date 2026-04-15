# Custom UI Troubleshooting Guide

This guide covers common problems, errors, and workarounds when building Custom UI apps for Jira Forge.

---

## Content Security Policy (CSP) Errors

### Problem: Inline Styles Blocked

**Error Message:**
```
Refused to apply inline style because it violates the following Content Security Policy directive: "style-src 'self'"
```

**Cause:** Forge blocks inline styles by default for security. React development builds often inject styles dynamically.

**Solution:** Add CSP permissions in `manifest.yml`:

```yaml
permissions:
  content:
    styles:
      - 'unsafe-inline'
```

**Full Example manifest.yml:**
```yaml
modules:
  jira:issuePanel:
    - key: my-panel
      title: My Custom UI
      resource: main
      resolver:
        function: resolver

resources:
  - key: main
    path: static/myapp/build

permissions:
  scopes:
    - read:jira-user
    - read:jira-work
  content:
    styles:
      - 'unsafe-inline'
```

---

### Problem: External Stylesheets Blocked

**Error Message:**
```
Refused to load the stylesheet 'https://cdn.example.com/styles.css' because it violates CSP
```

**Solution:** Add external fetch permissions:

```yaml
permissions:
  content:
    styles:
      - 'unsafe-inline'
  external:
    fetch:
      client:
        - '*.example.com'
        - 'https://cdn.example.com'
```

---

### Problem: Atlaskit Stylesheets Not Loading in Issue Panel

**Error Message:**
```
Refused to load the stylesheet 'https://connect-cdn.atl-paas.net/surfaces.css' 
because it violates the following Content Security Policy directive: "style-src 'self' 'unsafe-inline'"
```

**Cause:** The `style-src-elem` directive is not explicitly set, and 'unsafe-inline' may not cover all external resources.

**Solution:** Add Atlaskit CDN to external fetch:

```yaml
permissions:
  external:
    fetch:
      client:
        - '*.atl-paas.net'
        - '*.atlassian.com'
```

---

### Problem: Angular Apps Won't Load Without 'unsafe-inline'

**Context:** Angular's security model requires nonces for inline scripts/styles, but Forge doesn't generate nonces.

**Solution:** You must use `'unsafe-inline'` for Angular apps:

```yaml
permissions:
  content:
    styles:
      - 'unsafe-inline'
    scripts:
      - 'unsafe-inline'
```

**Note:** This is a known limitation; Atlassian has not provided nonce generation for Custom UI.

---

## Authentication Errors

### Problem: "An unexpected error occurred when fetching an auth token"

**Context:** Other users can't use custom fields even though the developer can.

**Possible Causes:**
1. Missing or incorrect scopes in manifest
2. Token refresh issues in resolver

**Solution 1 - Verify Scopes:**
```yaml
permissions:
  scopes:
    - read:jira-user      # Required for user data
    - read:jira-work      # Required for issue access
    - manage:jira-configuration  # May be needed for custom fields
```

**Solution 2 - Proper Error Handling in Resolver:**
```javascript
import api, { route } from '@forge/api';
import Resolver from '@forge/resolver';

const resolver = new Resolver();

resolver.define('getIssueData', async (payload) => {
  try {
    const response = await api.asApp().requestJira(
      route`/rest/api/3/issue/${payload.issueKey}`
    );
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching issue:', error);
    throw error; // Re-throw to surface in Custom UI
  }
});

export const handler = resolver.getDefinitions();
```

**Solution 3 - Frontend Error Handling:**
```tsx
import React, { useEffect, useState } from 'react';
import { invoke } from '@forge/bridge';

function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    invoke('getIssueData', { issueKey: 'PROJ-123' })
      .then(setData)
      .catch(err => {
        console.error('Invocation error:', err);
        setError(err.message || 'Unknown error');
      });
  }, []);

  if (error) {
    return <div>Error: {error}</div>;
  }

  return <div>{data ? JSON.stringify(data) : 'Loading...'}</div>;
}

export default App;
```

---

## Tunnel/Local Development Issues

### Problem: "Unable to establish a connection with the Custom UI bridge"

**Context:** Running `forge tunnel` but Custom UI doesn't load.

**Solution 1 - Add Tunnel Configuration:**
```yaml
resources:
  - key: main
    path: static/myapp/build
    tunnel:
      port: 3000
```

**Solution 2 - Start Dev Server First:**
```bash
# In static/myapp directory
npm start  # Starts on port 3000

# In root directory (new terminal)
forge tunnel
```

**Solution 3 - Verify Port Match:**
Ensure the `tunnel.port` in manifest matches your dev server port:
- Create React App: default is 3000
- Vite: default is 5173
- Next.js: default is 3000

---

### Problem: CSP Violation When Using Tunnel

**Error Message:**
```
CSP violation detected for 'style-src' while serving content at http://localhost:8001/
```

**Solution:** This is expected during local development. The fix will work after `forge deploy`:

```bash
# Add to manifest.yml before deploying
permissions:
  content:
    styles:
      - 'unsafe-inline'

# Then deploy
forge deploy
```

---

### Problem: Changes Not Reflecting in Browser

**Cause:** Browser caching or tunnel not detecting changes.

**Solutions:**
1. Hard refresh: `Cmd+Shift+R` (Mac) or `Ctrl+Shift+F5` (Windows/Linux)
2. Restart forge tunnel: `Ctrl+C`, then run `forge tunnel` again
3. Check Docker is running (required for tunnel):
   ```bash
   docker ps  # Should show Atlassian containers
   ```

---

## Storage Limitations

### Problem: Key-Value Store Quota Exceeded

**Free Allowance:**
- Reads: 0.1 GB/month at no cost
- Writes: $1.09/GB after free tier

**Optimization Patterns:**

**Pattern 1 - Batch Operations:**
```javascript
// BAD: Multiple individual reads
const config1 = await storage.get('config1');
const config2 = await storage.get('config2');
const config3 = await storage.get('config3');

// GOOD: Single batch read (if using KVS with keys)
const [config1, config2, config3] = await Promise.all([
  storage.get('config1'),
  storage.get('config2'),
  storage.get('config3')
]);
```

**Pattern 2 - Cache Expensive Data:**
```javascript
import api from '@forge/api';

// In-memory cache (resets on function invocation)
const cache = new Map();

async function getExpensiveData(key, fetchFn) {
  if (cache.has(key)) {
    return cache.get(key);
  }
  
  const data = await fetchFn();
  cache.set(key, data);
  return data;
}

resolver.define('getData', async (payload) => {
  return getExpensiveData(payload.key, () => 
    api.asApp().requestJira(route`/rest/api/3/search?jql=${payload.jql}`)
  );
});
```

---

### Problem: SQL Storage Costs Accumulating

**Free Allowance:** 730 GB-hours/month

**Cost Calculation Example:**
- Storing 2.73 MB continuously for a month = ~694 GB-hours (within free tier)
- Formula: `data_size * hours_stored / 1024 = GB-hours`

**Solution - Implement Data Cleanup:**
```javascript
// Scheduled trigger to clean old data
export const cleanupOldData = async () => {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  
  await db.query(`
    DELETE FROM events 
    WHERE created_at < ?
  `, [thirtyDaysAgo.toISOString()]);
};
```

---

## Common UI Issues

### Problem: React Component Not Rendering

**Checklist:**
1. Verify build succeeded: `npm run build` in static folder
2. Check manifest path matches actual output directory
3. Inspect browser console for JavaScript errors

**Debug Steps:**
```bash
# Build and check for errors
cd static/myapp
npm run build

# Check build output exists
ls -la build/

# Deploy with verbose output
forge deploy --verbose
```

---

### Problem: invoke() Returns Undefined or Promise Issues

**Common Mistake:**
```javascript
// WRONG: Not awaiting the promise
const data = invoke('getData', { key });
console.log(data); // undefined!
```

**Correct Usage:**
```javascript
// CORRECT: Using async/await
async function loadData() {
  const data = await invoke('getData', { key });
  console.log(data);
}

// OR using .then()
invoke('getData', { key })
  .then(data => console.log(data))
  .catch(err => console.error(err));
```

---

## Per-Issue Write Rate Limiting

### Problem: "Too many write operations to a single issue"

**Limits:**
- 20 writes per 2 seconds (short window)
- 100 writes per 30 seconds (long window)

**Solution - Add Delays Between Updates:**
```javascript
async function updateIssueWithRateLimit(issueKey, updates) {
  for (const update of updates) {
    try {
      await api.asApp().requestJira(
        route`/rest/api/3/issue/${issueKey}`,
        {
          method: 'PUT',
          body: JSON.stringify(update)
        }
      );
      
      // Add delay between writes to same issue
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      if (error.status === 429) {
        const retryAfter = error.headers.get('Retry-After');
        console.log(`Rate limited, waiting ${retryAfter}s`);
        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
        // Retry the update
        continue;
      }
      throw error;
    }
  }
}
```

---

## Summary Table: Common CSP Fixes

| Issue | Fix Location | Configuration |
|-------|--------------|---------------|
| Inline styles blocked | `permissions.content.styles` | `- 'unsafe-inline'` |
| External CSS blocked | `permissions.external.fetch.client` | Add domain pattern |
| Fonts not loading | `permissions.external.fonts` | Add font source URL |
| Images from 3rd party | `permissions.external.images` | Add image source |
| iframe/embed blocked | `permissions.external.frames` | Add frame source |
| scripts not executing | `permissions.content.scripts` | `- 'unsafe-inline'` (use cautiously) |

---

## Quick Debug Checklist

- [ ] Run `forge lint` to catch manifest errors
- [ ] Check browser console for CSP violations
- [ ] Verify all external domains in `permissions.external.fetch`
- [ ] Ensure tunnel port matches dev server port
- [ ] Confirm scopes include required permissions
- [ ] Use `console.log()` in resolver to trace execution
- [ ] Run `forge logs -n 50` for recent invocation errors
- [ ] Hard refresh browser after deploy

---

## Related Documentation

- [Bridge API Reference](15-bridge-api-reference.md)
- [Resolver Patterns](16-resolver-patterns.md)
- [UI Kit Components](17-ui-kit-components.md)
- [Rate Limit Handling](19-rate-limit-handling.md)