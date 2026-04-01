# Space Settings: Confluence Configuration Panels

This guide covers creating configuration panels for Confluence spaces using the `confluence:spaceSettings` module.

---

## What is Space Settings?

The `confluence:spaceSettings` module allows you to add custom configuration panels within a Confluence space's settings area. This is ideal for:
- App-wide configuration per space
- Space-level preferences and defaults
- Admin controls for space-specific features

```yaml
modules:
  confluence:spaceSettings:
    - key: my-app-settings
      resource: settings
      icon: icon.png
      title: My App Settings
      
  resource:
    - key: settings
      path: src/space-settings.jsx
```

---

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
import { api, routeHandlers } from '@forge/bridge';
import { Card, Heading, Text } from '@atlaskit/card';
import { TextField } from '@atlaskit/textfield';
import { Button } from '@atlaskit/button';

export default function SpaceSettings() {
  const [spaceId, setSpaceId] = useState(null);
  const [settings, setSettings] = useState({});
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    apiKey: '',
    syncEnabled: true,
    defaultLabel: ''
  });

  // Extract space ID from route
  useEffect(() => {
    async function extractSpaceId() {
      const route = routeHandlers.getCurrentRoute();
      
      // Space settings routes look like:
      // /spaces/~username/settings/... or contain space key
      
      if (route.path.includes('/spaces/')) {
        const parts = route.path.split('/');
        // Find the numeric space ID
        for (const part of parts) {
          if (/^\d+$/.test(part)) {
            setSpaceId(parseInt(part, 10));
            break;
          }
        }
      }
    }
    
    extractSpaceId();
  }, []);

  // Load existing settings when space ID is available
  useEffect(() => {
    if (spaceId) {
      loadSettings();
    }
  }, [spaceId]);

  async function loadSettings() {
    try {
      const token = await AP.context.getToken();
      
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
      const token = await AP.context.getToken();
      
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
import { routeHandlers } from '@forge/bridge';

function extractSpaceInfo() {
  const route = routeHandlers.getCurrentRoute();
  
  // Various space settings URL formats
  const patterns = [
    /\/spaces\/[^/]+\/settings\/(\d+)/,     // Standard space settings
    /\/spaces\/([^/]+)/,                     // Space key from path
  ];

  for (const pattern of patterns) {
    const match = route.path.match(pattern);
    if (match) {
      return {
        spaceKey: match[1],
        fullPath: route.path
      };
    }
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
  const route = routeHandlers.getCurrentRoute();
  
  // Method 1: Parse route
  const match = route.path.match(/\/spaces\/([^/]+)/);
  if (match) return { spaceKey: match[1] };
  
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
  
  return null;
}
```

---

## Next Steps

- [Blog Post Custom UI](04-blogpost-custom-ui.md) - Extend blog posts
- [Content Properties](06-content-properties.md) - Store app data with content
- [Webhooks & Events](07-webhooks-events.md) - React to Confluence events