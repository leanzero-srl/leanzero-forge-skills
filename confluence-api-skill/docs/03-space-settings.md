# Space Settings: Confluence Configuration Panels

**Note:** confluence:spaceSettings provides space-level configuration panels for managing app settings per space.

---

## Available Modules for Space-Level Configuration

### Option 1: Global Settings (Site-Wide)
Use `globalSettings` for site-wide admin configuration:

## When to Use Space Settings vs Page Custom UI

| Scenario | Use Space Settings | Use Page Custom UI |
|----------|-------------------|-------------------|
| Configuration for entire space | ✅ Yes | ❌ No |
| Per-page display/interaction | ❌ No | ✅ Yes |
| Admin-only access | ✅ Yes (space admins) | ⚠️ Depends on page permissions |
| Global defaults per space | ✅ Yes | ❌ No |

---

## Basic Implementation

### Manifest Configuration

```yaml
app:
  id: ari:cloud:ecosystem::app/my-confluence-app
  name: My Confluence App

permissions:
  scopes:
    - read:confluence-content:*
    - admin:confluence-space:*
  scoped:
    - spaces:${SPACE_ID}
    - sites:${SITE_URL}

modules:
  confluence:spaceSettings:
    - key: my-app-settings
      resource: settings
      title: My App Settings
      
  resource:
    - key: main
      path: src/page-custom-ui.jsx
    - key: settings
      path: src/space-settings.jsx
```

### React Component for Space Settings

```jsx
import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Card,
  Heading,
  Text,
  TextField,
  Button,
} from '@forge/react';
import { view, router } from '@forge/bridge';

export default function SpaceSettings() {
  const [spaceId, setSpaceId] = useState(null);
  const [settings, setSettings] = useState({});
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    apiKey: '',
    syncEnabled: true,
    defaultLabel: ''
  });

  // Extract space information from context
  useEffect(() => {
    async function extractSpaceInfo() {
      try {
        // Method 1: Use view.getContext() - the recommended approach
        const context = await view.getContext();
        
        // Space information is available in extension context
        if (context.extension.space) {
          setSpaceId(context.extension.space.id);
        }
        
        // Alternative: Extract from URL path using router
        const currentUrl = window.location.pathname;
        if (currentUrl.includes('/spaces/')) {
          const parts = currentUrl.split('/');
          for (const part of parts) {
            if (/^\d+$/.test(part)) {
              setSpaceId(parseInt(part, 10));
              break;
            }
          }
        }
      } catch (error) {
        console.error('Failed to extract space info:', error);
      }
    }
    
    extractSpaceInfo();
  }, []);

  // Load existing settings when space ID is available
  useEffect(() => {
    if (spaceId) {
      loadSettings();
    }
  }, [spaceId]);

  async function loadSettings() {
    try {
      // In resolver functions or using @forge/api for backend:
      // const token = await api.asUser().getToken();
      //
      
      // Fetch space properties to find our settings
      const response = await api.fetch({
        url: `/wiki/api/v2/spaces/${spaceId}/properties/my-app-settings`,
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setSettings(data);
        setFormData(prev => ({
          ...prev,
          apiKey: data.apiKey || '',
          syncEnabled: data.syncEnabled !== false,
          defaultLabel: data.defaultLabel || ''
        }));
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }

  async function saveSettings() {
    setSaving(true);
    
    try {
      // In resolver functions or using @forge/api for backend:
      // const token = await api.asUser().getToken();
      //
      
      // Save space property
      await api.fetch({
        url: `/wiki/api/v2/spaces/${spaceId}/properties/my-app-settings`,
        method: 'PUT',
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      setSettings(formData);
    } catch (error) {
      console.error('Failed to save settings:', error);
      alert('Failed to save settings. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <Heading>My App Settings</Heading>
      <Text weight="strong">Configure app behavior for this space.</Text>
      
      <div style={{ marginTop: '20px' }}>
        <label>API Key</label>
        <TextField
          value={formData.apiKey}
          onChange={(e) => setFormData(prev => ({ ...prev, apiKey: e.target.value }))}
          placeholder="Enter API key"
          isFullWidth
        />
      </div>

      <div style={{ marginTop: '20px' }}>
        <label>Default Label</label>
        <TextField
          value={formData.defaultLabel}
          onChange={(e) => setFormData(prev => ({ ...prev, defaultLabel: e.target.value }))}
          placeholder="Default label for new pages"
          isFullWidth
        />
      </div>

      <div style={{ marginTop: '20px' }}>
        <label style={{ display: 'flex', alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={formData.syncEnabled}
            onChange={(e) => setFormData(prev => ({ ...prev, syncEnabled: e.target.checked }))}
            style={{ marginRight: '8px' }}
          />
          Enable automatic synchronization
        </label>
      </div>

      <div style={{ marginTop: '20px' }}>
        <Button
          onClick={saveSettings}
          isDisabled={saving}
          isSelected={saving}
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </Button>
      </div>
    </Card>
  );
}

ForgeReconciler.render(
  <React.StrictMode>
    <SpaceSettings />
  </React.StrictMode>
);
```

---

## Space Properties vs Content Properties

### Space Properties (for space settings)

```javascript
// Store at space level - accessible from any page in the space
async function saveSpaceProperty(spaceId, key, value, token) {
  return api.fetch({
    url: `/wiki/api/v2/spaces/${spaceId}/properties/${key}`,
    method: 'PUT',
    headers: { 
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(value)
  });
}

// Read space property
async function getSpaceProperty(spaceId, key, token) {
  const response = await api.fetch({
    url: `/wiki/api/v2/spaces/${spaceId}/properties/${key}`,
    headers: { Authorization: `Bearer ${token}` }
  });
  
  return response.ok ? response.json() : null;
}
```

### Content Properties (for individual pages)

```javascript
// Store at page level - specific to a single page
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

// Read page property
async function getPageProperty(pageId, key, token) {
  const response = await api.fetch({
    url: `/wiki/api/v2/pages/${pageId}/properties/${key}`,
    headers: { Authorization: `Bearer ${token}` }
  });
  
  return response.ok ? response.json() : null;
}
```

---

## Space Settings with Webhooks

Configure space settings and react to page events within that space:

```yaml
modules:
  confluence:spaceSettings:
    - key: my-app-settings
      resource: settings
      title: My App Settings
      
  webhook:
    - destination: page-created-handler
      event: confluence:page:created
      filter: |
        space.id == {{app.configuration.spaceId}}
        
  function.scheduled:
    - key: sync-scheduler
      resource: scheduler
      schedule: '0 */6 * * *'  # Every 6 hours
      
  resource:
    - key: settings
      path: src/space-settings.jsx
    - key: scheduler
      path: src/scheduled-task.js
```

---

## Getting Space Information

### Extract Space ID from Route

```jsx
import { view, router } from '@forge/bridge';

function extractSpaceInfo() {
  // Method 1: Use view.getContext() - the recommended approach
  const context = await view.getContext();
  
  if (context.extension.space) {
    return {
      spaceKey: context.extension.space.key,
      spaceId: context.extension.space.id,
      fullPath: context.location
    };
  }
  
  // Method 2: Extract from URL path using router (fallback)
  try {
    const currentUrl = window.location.pathname;
    
    // Various space settings URL formats
    const patterns = [
      /\/spaces\/[^/]+\/settings\/(\d+)/,     // Standard space settings with numeric ID
      /\/spaces\/([^/]+)/,                     // Space key from path
    ];

    for (const pattern of patterns) {
      const match = currentUrl.match(pattern);
      if (match) {
        return {
          spaceKey: match[1],
          fullPath: currentUrl
        };
      }
    }
  } catch (error) {
    console.error('URL extraction failed:', error);
  }
  
  return null;
}
```

### Fetch Space Details via API

```jsx
async function getSpaceDetails(spaceId, token) {
  const response = await api.fetch({
    url: `/wiki/api/v2/spaces/${spaceId}`,
    headers: { Authorization: `Bearer ${token}` }
  });
  
  return response.ok ? response.json() : null;
}

async function getSpaceByKey(spaceKey, token) {
  const response = await api.fetch({
    url: `/wiki/api/v2/spaces?keys=${spaceKey}`,
    headers: { Authorization: `Bearer ${token}` }
  });
  
  if (response.ok) {
    const data = await response.json();
    return data.results?.[0] || null;
  }
  
  return null;
}

// Alternative: Use requestConfluence from @forge/bridge
async function getSpaceWithBridge(spaceKey) {
  const response = await requestConfluence(`/wiki/api/v2/spaces?keys=${spaceKey}`);
  const data = await response.json();
  return data.results?.[0] || null;
}
```

---

## Migration from Space Settings to Page Custom UI

If you need to migrate settings when a user navigates away from space settings:

```jsx
async function getSettingsFromSpaceOrPages(spaceId, token) {
  // First try space properties (most common for new installations)
  const spaceProps = await getSpaceProperty(spaceId, 'my-app-settings', token);
  
  if (spaceProps && Object.keys(spaceProps).length > 0) {
    return spaceProps;
  }

  // Fallback: Check first page with app data
  const searchResponse = await api.fetch({
    url: `/wiki/api/v2/search?cql=type=page%20AND%20property(my-app-settings)%20AND%20space.id=${spaceId}`,
    headers: { Authorization: `Bearer ${token}` }
  });

  if (searchResponse.ok) {
    const searchData = await searchResponse.json();
    if (searchData.results?.length > 0) {
      // Return settings from first matching page
      return getPageProperty(searchData.results[0].id, 'my-app-settings', token);
    }
  }

  return null;
}
```

---

## Common Patterns

### Pattern 1: Space-Level Defaults for Pages

```jsx
// In space settings, define defaults that pages inherit
async function setSpaceDefaults(spaceId, defaults, token) {
  await saveSpaceProperty(spaceId, 'my-app-defaults', {
    syncEnabled: true,
    autoTagging: true,
    defaultLabels: ['app-data'],
    externalApiUrl: ''
  }, token);
}

// In page custom UI, check for space defaults first
async function getEffectiveSettings(pageId, spaceId, token) {
  // Get page-specific settings (overrides)
  const pageSettings = await getPageProperty(pageId, 'my-app-settings', token);
  
  // Get space-level defaults
  const spaceDefaults = await getSpaceProperty(spaceId, 'my-app-defaults', token);
  
  // Merge: page settings override space defaults
  return { ...spaceDefaults, ...pageSettings };
}
```

### Pattern 2: Space-Wide Feature Toggles

```jsx
// Enable/disable features for entire space
async function toggleSpaceFeature(spaceId, featureName, enabled, token) {
  const current = await getSpaceProperty(spaceId, 'my-app-features', token) || {};
  
  return saveSpaceProperty(spaceId, 'my-app-features', {
    ...current,
    [featureName]: enabled
  }, token);
}

// Check feature flag from any page extension
async function isFeatureEnabled(spaceId, featureName, token) {
  const features = await getSpaceProperty(spaceId, 'my-app-features', token);
  return features?.[featureName] ?? false;
}
```

---

## Troubleshooting

### Space Settings Not Appearing

1. **Verify space admin permissions**: Only space admins can see settings panels
2. **Check manifest scope**: Ensure `admin:confluence-space:*` scope is declared
3. **Confirm app installation**: App must be installed in the specific space

### Can't Extract Space ID from Route

```jsx
// Fallback: Use API to get current context
async function getCurrentContext(token) {
  // Try multiple methods
  
  // Method 1: Parse route using view.getContext()
  const context = await view.getContext();
  
  if (context.extension.space) {
    return { spaceKey: context.extension.space.key };
  }
  
  // Method 2: Use Confluence context from token
  try {
    const response = await api.fetch({
      url: '/wiki/api/v2/content/my',
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (response.ok) {
      return response.json();
    }
  } catch (e) {
    console.error('Context extraction failed:', e);
  }
  
  // Method 3: Fallback to URL parsing
  const currentUrl = window.location.pathname;
  const match = currentUrl.match(/\/spaces\/([^/]+)/);
  if (match) return { spaceKey: match[1] };
  
  return null;
}
```

### Using routeHandlers (Custom Wrapper)

The `routeHandlers` object referenced in this document is a **custom wrapper** around the standard Forge bridge APIs. It's not part of the core `@forge/bridge` package but can be implemented as a utility:

```jsx
// Custom routeHandlers utility (optional)
import { router, view } from '@forge/bridge';

export const routeHandlers = {
  getCurrentRoute: async () => {
    const context = await view.getContext();
    
    return {
      path: window.location.pathname,
      query: new URLSearchParams(window.location.search),
      spaceId: context.extension.space?.id,
      spaceKey: context.extension.space?.key,
      ...context
    };
  },
  
  navigateToSpaceSettings: async (spaceKey) => {
    await router.navigate({
      target: 'module',
      moduleKey: 'my-app-settings',
      spaceKey: spaceKey
    });
  }
};
```

---

## Next Steps

- [Blog Post Custom UI](04-blogpost-custom-ui.md) - Extend blog posts
- [Content Properties](06-content-properties.md) - Store app data with content
- [Webhooks & Events](07-webhooks-events.md) - React to Confluence events
