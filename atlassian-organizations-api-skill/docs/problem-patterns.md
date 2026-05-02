# Problem Patterns: Error Handling & Common Issues

Common problems, solutions, and best practices when working with the Atlassian Organizations API.

---

## Error Handling

### Standard Error Response

```json
{
  "type": "about:blank",
  "title": "Bad Request",
  "status": 400,
  "detail": "The request body is malformed",
  "instance": "/admin/v2/orgs/abc123/directories/xyz789/users"
}
```

### Error Handling Pattern

```javascript
async function organizationsApiRequest(url, options = {}) {
  const response = await fetch(url, options);

  if (!response.ok) {
    const error = await response.json().catch(() => null);

    switch (response.status) {
      case 400:
        throw new Error(`Bad request: ${error?.detail || 'Invalid request'}`);
      case 401:
        throw new Error('Unauthorized: Token missing or expired');
      case 403:
        throw new Error(`Forbidden: ${error?.detail || 'Insufficient permissions'}`);
      case 404:
        throw new Error('Not found: Resource does not exist');
      case 409:
        throw new Error(`Conflict: ${error?.detail || 'Resource already exists'}`);
      case 429:
        const retryAfter = response.headers.get('Retry-After') || 5;
        throw new Error(`Rate limited. Retry after ${retryAfter}s`);
      default:
        throw new Error(`API error ${response.status}: ${error?.detail || 'Unknown error'}`);
    }
  }

  return response.json();
}
```

---

## Common Issues & Solutions

### Issue: "Insufficient permissions" (403)

**Problem:** The API key or token lacks the required scopes.

**Solution:**
1. Check the required scopes for the endpoint (see [11-permissions-scopes.md](11-permissions-scopes.md))
2. Re-authorize your app with the additional scopes
3. Ensure the authorizing user is an organization admin

```bash
# Re-authorize with additional scopes
https://auth.atlassian.com/authorize?
  client_id=YOUR_CLIENT_ID&
  scope=read:orgs:admin+read:users:admin+write:users:admin&
  redirect_uri=https://YOUR_REDIRECT_URI&
  prompt=consent
```

---

### Issue: "Rate limited" (429)

**Problem:** You've exceeded the rate limit for the Organizations API.

**Solution:** Implement exponential backoff with jitter.

> **Events API special notice:** The `/events` endpoint rate limits are being lowered effective end of May 2025:
> - Rate limit per user: **10 requests per minute**
> - Rate limit per API path: **10 requests per minute**
>
> For high request rate use cases, migrate to the polling API (`/events-stream`) to guarantee uninterrupted service.

```javascript
async function rateLimitedFetch(url, token, maxRetries = 5) {
  for (let i = 0; i < maxRetries; i++) {
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (response.status === 429) {
      const retryAfter = parseInt(response.headers.get('Retry-After') || '0', 10);
      const jitter = Math.random() * 1000; // Add jitter in ms
      const delay = (retryAfter > 0 ? retryAfter * 1000 : Math.pow(2, i) * 1000) + jitter;
      await new Promise(resolve => setTimeout(resolve, delay));
      continue;
    }

    return response;
  }

  throw new Error('Rate limit exceeded after max retries');
}
```

---

### Issue: "Org not found" (404)

**Problem:** The `orgId` is incorrect or the API key doesn't have access to that organization.

**Solution:**
1. List your organizations first to get the correct `orgId`
2. Verify the API key has access to the organization

```javascript
// Step 1: List organizations to find the correct orgId
const orgs = await listOrgs(token);
const org = orgs.find(o => o.attributes.name === 'My Org');
const orgId = org.id;

// Step 2: Use the orgId for subsequent calls
const users = await listUsers(orgId, directoryId, token);
```

---

### Issue: "No paid subscription" (402)

**Problem:** The organization doesn't have a paid subscription required for certain operations (e.g., inviting users).

**Solution:**
- User invitations require at least one paid subscription in the organization
- Contact your Atlassian account administrator to verify subscription status

---

### Issue: "User limit exceeded" (409)

**Problem:** You've exceeded the user limit for a product included in the invitation.

**Solution:**
- Remove inactive users before inviting new ones
- Upgrade your subscription plan
- Use the `/v2/.../users/stats` endpoint to check current user counts

---

### Issue: Deprecated endpoint usage

**Problem:** Using a deprecated v1 user endpoint that has been scheduled for removal.

**Solution:** Migrate to v2 endpoints. See [gotchas.md](gotchas.md) for the deprecation timeline.

```
# Deprecated (v1)
POST /v1/orgs/{orgId}/directory/users/{accountId}/suspend-access

# Migrate to (v2)
POST /v2/orgs/{orgId}/directories/{directoryId}/users/{accountId}/suspend
```

---

## Pagination Best Practices

### Complete Pagination Pattern

```javascript
async function paginateAll(endpoint, token, options = {}) {
  const { limit = 100, headers = {} } = options;
  let allResults = [];
  let cursor = null;
  let pageCount = 0;

  do {
    pageCount++;
    const url = cursor
      ? `${endpoint}?cursor=${encodeURIComponent(cursor)}&limit=${limit}`
      : `${endpoint}?limit=${limit}`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        ...headers
      }
    });

    if (!response.ok) {
      throw new Error(`Page ${pageCount}: HTTP ${response.status}`);
    }

    const data = await response.json();
    allResults = allResults.concat(data.data || []);
    cursor = data.links?.next || null;
  } while (cursor);

  return allResults;
}
```

---

## Batch Operations

### Bulk User Invitations

```javascript
async function bulkInviteUsers(orgId, users, token) {
  const batchSize = 10; // Atlassian recommends small batches
  const results = [];

  for (let i = 0; i < users.length; i += batchSize) {
    const batch = users.slice(i, i + batchSize);
    const emails = batch.map(u => u.email);

    const response = await fetch(
      `https://api.atlassian.com/admin/v2/orgs/${orgId}/users/invite`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          emails,
          sendNotification: true,
          notificationText: 'Welcome!'
        })
      }
    );

    const data = await response.json();
    results.push(...data.data);

    // Rate limit between batches
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  return results;
}
```

---

## Retry with Jitter

```javascript
async function retryWithJitter(fn, maxRetries = 3, baseDelay = 1000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;

      const delay = baseDelay * Math.pow(2, i) + Math.random() * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
```

---

## Related Documentation

- **[01-core-concepts.md](01-core-concepts.md)** — Rate limits overview
- **[11-permissions-scopes.md](11-permissions-scopes.md)** — Required scopes
- **[gotchas.md](gotchas.md)** — Deprecated endpoints
