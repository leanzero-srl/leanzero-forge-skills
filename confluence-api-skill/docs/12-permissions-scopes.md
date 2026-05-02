# Confluence Forge Permissions & OAuth Scopes

## Overview

Forge apps use OAuth 2.0 scopes to request permissions for accessing Confluence data and services. These scopes must be declared in `manifest.yml` under the `permissions.scopes` section.

---

## Permission Structure

```yaml
permissions:
  scopes:
    - read:confluence-content.summary  # Basic content read access
    - write:confluence-space           # Space modification permissions
  external:
    fetch:
      backend:                         # External API access
        - https://api.openai.com
        - https://slack.com
```

---

## Confluence Content Permissions

### Read Content Permissions

| Scope | Access Level | Use Case |
|-------|--------------|----------|
| `read:confluence-content.summary` | View content metadata | List pages, search results |
| `read:confluence-content` | Full content access | View page content, attachments |

### Write Content Permissions

| Scope | Access Level | Use Case |
|-------|--------------|----------|
| `write:confluence-content` | Create/modify content | Add pages, blog posts, comments |

---

## Space & Navigation Permissions

| Scope | Access Level | Use Case |
|-------|--------------|----------|
| `read:confluence-space.summary` | View space metadata | List spaces, get space info |
| `write:confluence-space` | Modify space settings | Update space name, description |
| `read:space:confluence` | Full space read access | Space-level operations |
| `write:space:confluence` | Full space write access | Space configuration changes |

---

## User & Activity Permissions

| Scope | Access Level | Use Case |
|-------|--------------|----------|
| `read:confluence-user` | View user information | Get user details, avatars |
| `read:confluence-group` | View group membership | Check if user is in a group |

---

## System & Storage Permissions

| Scope | Access Level | Use Case |
|-------|--------------|----------|
| `storage:app` | App storage (KVS) | Store key-value data |
| `read:app-system-token` | System token access | Remote webhook authentication |

---

## Event Subscription Permissions

### Page Events

| Event Type | Required Scopes |
|------------|-----------------|
| `avi:confluence:created:page` | `read:confluence-content.summary` |
| `avi:confluence:updated:page` | `read:confluence-content.summary` |
| `avi:confluence:deleted:page` | `read:confluence-content.summary` |

### Blog Post Events

| Event Type | Required Scopes |
|------------|-----------------|
| `avi:confluence:created:blogpost` | `read:confluence-content.summary` |
| `avi:confluence:updated:blogpost` | `read:confluence-content.summary` |

### Space Events

| Event Type | Required Scopes |
|------------|-----------------|
| `avi:confluence:created:space:V2` | `read:confluence-space.summary` |
| `avi:confluence:updated:space:V2` | `read:confluence-space.summary` |
| `avi:confluence:permissions_updated:space:V2` | `read:confluence-space.summary`, `write:confluence-space` |

### Content Property Events

| Event Type | Required Scopes |
|------------|-----------------|
| `avi:confluence:created:contentproperty` | `read:confluence-content.summary` |
| `avi:confluence:updated:contentproperty` | `read:confluence-content.summary` |

---

## External API Permissions

### Fetch Configuration

```yaml
permissions:
  external:
    fetch:
      backend:                         # Backend to external API
        - https://api.openai.com
        - https://api.github.com
        - https://slack.com/api
      client:                          # Client-side (frontend)
        - https://cdn.jsdelivr.net
        - https://fonts.googleapis.com
```

### Image & Font Permissions

```yaml
permissions:
  external:
    images:                            # External image URLs
      - https://example.com/images
    fonts:                             # Custom font domains
      - https://fonts.googleapis.com
```

---

## Permission Best Practices

### 1. Request Minimum Required Scopes

```yaml
# Bad: Overly broad permissions
permissions:
  scopes:
    - read:confluence-content         # Full content access
    - write:confluence-space          # All space modifications

# Good: Minimal required permissions
permissions:
  scopes:
    - read:confluence-content.summary # Only metadata needed
    - storage:app                     # For app data storage
```

### 2. Use `lint --fix` to Auto-Add Missing Scopes

```bash
# Automatically adds missing scopes based on code usage
forge lint --fix
```

### 3. Check Permissions at Runtime (React UI)

```javascript
import { usePermissions } from '@forge/react';

const MyComponent = () => {
  const { hasPermission, missingPermissions, error } = usePermissions({
    scopes: ['read:confluence-content', 'write:confluence-space'],
    external: {
      fetch: {
        backend: ['https://api.example.com']
      }
    }
  });

  if (error) return <div>Error loading permissions</div>;
  if (!hasPermission) {
    return (
      <div>
        Missing permissions: {JSON.stringify(missingPermissions)}
      </div>
    );
  }

  return <div>Content goes here</div>;
};
```

### 4. Permission Check in Functions

```javascript
import { get } from '@forge/api';

export const handler = async (req) => {
  // Function runs with app's permissions
  const res = await get('/wiki/api/v2/pages', {
    headers: { 'Accept': 'application/json' }
  });
  
  return res;
};
```

---

## Common Permission Issues

### Issue: "Permission denied" when calling API

**Error:** `403 Forbidden` or `insufficient permissions`

**Solution:**
1. Check required scope in API documentation
2. Add scope to manifest.yml:
```yaml
permissions:
  scopes:
    - read:confluence-content.summary
```
3. Redeploy:
```bash
forge lint --fix && forge deploy && forge install --upgrade
```

### Issue: Missing external fetch permission

**Error:** Network request fails for external API

**Solution:**
1. Add domain to manifest.yml:
```yaml
permissions:
  external:
    fetch:
      backend:
        - https://api.openai.com
```
2. Redeploy app

---

## Permission Hierarchy

```
read:confluence-content.summary (summary only)
    └─ read:confluence-content (full access)

read:confluence-space.summary (metadata only)
    └─ write:confluence-space (modify space settings)
```

**Note:** Some operations require the higher-level scope even if you only need summary data.

---

## Testing Permissions

### 1. Check Installed Permissions

After deploying, verify permissions are granted:

```bash
forge display
# Shows configured scopes and external permissions
```

### 2. Manual Test with cURL

```bash
# Get your app token from forge tunnel or deployment
APP_TOKEN="your-app-token"

# Test content read permission
curl -H "Authorization: Bearer $APP_TOKEN" \
     https://your-domain.atlassian.net/wiki/api/v2/pages

# Test space read permission
curl -H "Authorization: Bearer $APP_TOKEN" \
     https://your-domain.atlassian.net/wiki/api/v2/spaces
```

---

## Next Steps

- **CLI Commands**: Learn how to deploy and manage permissions
- **Real-world Patterns**: See permission handling in common scenarios
- **API Endpoints**: Understand what scopes are needed for REST API calls