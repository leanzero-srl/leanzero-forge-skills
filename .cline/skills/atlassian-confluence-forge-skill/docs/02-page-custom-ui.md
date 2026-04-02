# Page Custom UI: Confluence Extensions

This guide covers building custom UI extensions for Confluence pages. Note that Confluence Forge uses **pageBanner** module type rather than a dedicated "pageCustomUi" module.

---

## Available Module Types for Pages

Confluence does not have a `confluence:pageCustomUi` module type. Instead, use these modules:

| Module | Description |
|--------|-------------|
| `confluence:pageBanner` | Adds a banner to Confluence pages |
| `confluence:contentAction` | Adds menu item to "more actions" (•••) for pages and blogs |
| `confluence:contextMenu` | Adds menu entry when text is selected on a page or blog |

---

## confluence:pageBanner Module

The `pageBanner` module adds a banner that appears at the top of Confluence pages.

```yaml
modules:
  confluence:pageBanner:
    - key: my-page-banner
      resource: main
      title: My Page Banner
```

---

## confluence:contentAction Module

The `contentAction` module adds a menu item to the "more actions" dropdown for pages and blog posts.

```yaml
modules:
  confluence:contentAction:
    - key: my-content-action
      resource: main
      title: My Action
      displayConditions:
        pageTypes:
          - page
          - blogpost
```
---

## Basic Implementation (Page Banner)

### Manifest Configuration

```yaml
app:
  id: ari:cloud:ecosystem::app/my-confluence-app
  name: My Confluence App

permissions:
  scopes:
    - read:confluence-content.summary

modules:
  confluence:pageBanner:
    - key: my-page-banner
      resource: main
      title: My Page Banner
      icon: icon.png

resources:
  - key: main
    path: src/page-banner.jsx
```

### React Component

```jsx
import React from 'react';
import { useProductContext } from '@forge/bridge';

export default function PageBanner() {
  const context = useProductContext();
  
  // Context provides page information
  console.log('Page ID:', context.content.id);
  console.log('Space ID:', context.space.id);

  return (
    <div className="page-banner">
      <h3>My Page Banner</h3>
      <p>This banner appears on all Confluence pages.</p>
    </div>
  );
}
```

---

## Getting Page Context

To work with the current page, you need to extract its context:

### Extracting Page ID from URL

```jsx
import { routeHandlers } from '@forge/bridge';

function getPageIdFromRoute() {
  const route = routeHandlers.getCurrentRoute();
  
  // Confluence pages have routes like:
  // /spaces/~username/page/123456789/Page+Title
  
  if (route.path.startsWith('/spaces')) {
    const parts = route.path.split('/');
    // Find the numeric ID segment
    for (const part of parts) {
      if (/^\d+$/.test(part)) {
        return parseInt(part, 10);
      }
    }
  }
  
  return null;
}

// Alternative: Use route parameters directly
function usePageContext() {
  const route = routeHandlers.getCurrentRoute();
  const params = new URLSearchParams(route.search);
  
  // Some routes include pageId in query params
  return {
    pageId: params.get('pageId') || getPageIdFromRoute(),
    spaceKey: params.get('spaceKey'),
    title: params.get('title')
  };
}
```

### Using Route Handlers Properly

```jsx
import { routeHandlers } from '@forge/bridge';
import { useEffect, useState } from 'react';

export default function PageExtension() {
  const [pageId, setPageId] = useState(null);

  useEffect(() => {
    // Wait for Confluence to set up the route context
    const timer = setTimeout(() => {
      const route = routeHandlers.getCurrentRoute();
      
      // Parse page ID from route
      if (route.path.includes('/page/')) {
        const match = route.path.match(/\/page\/(\d+)/);
        if (match) {
          setPageId(parseInt(match[1], 10));
        }
      }
    }, 100); // Small delay to ensure context is ready

    return () => clearTimeout(timer);
  }, []);

  return <div>Current Page ID: {pageId || 'Loading...'}</div>;
}
```

---

## Fetching Current Page Data

Once you have the page ID, fetch its content:

```jsx
import React, { useEffect, useState } from 'react';
import { api, routeHandlers } from '@forge/bridge';

async function getCurrentPageData() {
  const token = await AP.context.getToken();
  
  // Extract page ID from current route
  const route = routeHandlers.getCurrentRoute();
  const match = route.path.match(/\/page\/(\d+)/);
  
  if (!match) return null;
  
  const pageId = match[1];
  
  const response = await api.fetch({
    url: `/wiki/api/v2/pages/${pageId}`,
    headers: { Authorization: `Bearer ${token}` }
  });
  
  return response.ok ? response.json() : null;
}

export default function PageExtension() {
  const [page, setPage] = useState(null);

  useEffect(() => {
    getCurrentPageData().then(setPage);
  }, []);

  if (!page) return <div>Loading page data...</div>;

  return (
    <div className="page-extension">
      <h3>Page: {page.title}</h3>
      <p>Last modified: {new Date(page.lastModified).toLocaleDateString()}</p>
    </div>
  );
}
```

---

## Using Confluence UI Kit Components

Atlassian provides React components that match Confluence's design system:

```jsx
import React from 'react';
import { Card, Heading, Text } from '@atlaskit/card';
import { InlineSpinner } from '@atlaskit/spinner';
import { Button } from '@atlaskit/button';
import { Modal, ModalBody, ModalHeader, ModalFooter } from '@atlaskit/modal-dialog';

export default function PageExtension() {
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <Card>
      <Heading>My Extension</Heading>
      <Text weight="strong">Welcome to my Confluence extension!</Text>
      
      <Button onClick={() => setIsOpen(true)}>
        Open Modal
      </Button>

      {isOpen && (
        <Modal onClose={() => setIsOpen(false)}>
          <ModalHeader>Dialog Title</ModalHeader>
          <ModalBody>Dialog content here...</ModalBody>
          <ModalFooter>
            <Button onClick={() => setIsOpen(false)}>Close</Button>
          </ModalFooter>
        </Modal>
      )}
    </Card>
  );
}
```

---

## Handling Permissions

Check if user has permission to view/modify content:

```jsx
import { api } from '@forge/bridge';

async function checkPagePermissions(pageId, token) {
  // Check if user can edit the page
  const response = await api.fetch({
    url: `/wiki/api/v2/pages/${pageId}/permissions`,
    headers: { Authorization: `Bearer ${token}` }
  });

  return response.ok ? await response.json() : null;
}

export default function PageExtension() {
  const [canEdit, setCanEdit] = useState(false);

  useEffect(() => {
    async function checkPermissions() {
      const token = await AP.context.getToken();
      // Your permission checking logic here
    }
    checkPermissions();
  }, []);

  return (
    <div>
      <p>{canEdit ? 'You can edit this page' : 'View only access'}</p>
    </div>
  );
}
```

---

## Common Patterns

### Pattern 1: Display Related Content

```jsx
async function findRelatedPages(currentPage, token) {
  // Search for pages with similar labels or content
  const response = await api.fetch({
    url: `/wiki/api/v2/search?cql=type=page%20AND%20ancestor=${currentPage.id}`,
    headers: { Authorization: `Bearer ${token}` }
  });

  return response.ok ? await response.json() : [];
}
```

### Pattern 2: Store Page-Specific Data

Use page properties to store app data:

```jsx
async function savePageProperty(pageId, key, value, token) {
  const response = await api.fetch({
    url: `/wiki/api/v2/pages/${pageId}/properties/${key}`,
    method: 'PUT',
    headers: { 
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ value })
  });

  return response.ok;
}
```

### Pattern 3: Sync with External Systems

```jsx
async function syncPageWithExternalSystem(pageId, token) {
  // Fetch page content
  const pageResponse = await api.fetch({
    url: `/wiki/api/v2/pages/${pageId}?bodyFormat=storage`,
    headers: { Authorization: `Bearer ${token}` }
  });

  const page = await pageResponse.json();

  // Sync with external system via your backend
  await fetch('https://your-api.com/sync/page', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      confluencePageId: page.id,
      title: page.title,
      content: page.body.storage.value
    })
  });
}
```

---

## Troubleshooting

### Extension Not Showing

1. **Check manifest.yml**: Ensure `confluence:pageCustomUi` module is properly configured
2. **Verify permissions**: User needs appropriate Confluence permissions
3. **Deploy latest version**: Run `forge deploy --verbose`

### Token Acquisition Fails

```jsx
// Common issue: Token not available immediately
async function getTokenWithRetry(maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await AP.context.getToken();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
}
```

### Route Parsing Issues

Different Confluence routes have different structures. Always handle edge cases:

```jsx
function safeParseRoute() {
  try {
    const route = routeHandlers.getCurrentRoute();
    
    // Handle various page URL formats
    const patterns = [
      /\/spaces\/[^/]+\/page\/(\d+)/,     // Standard page
      /\/pages\/viewpage\.action\?pageId=(\d+)/,  // Legacy URL
      /\/wiki\/pages\/(\d+)/              // Wiki path
    ];

    for (const pattern of patterns) {
      const match = route.path.match(pattern);
      if (match) return match[1];
    }
  } catch (error) {
    console.error('Route parsing failed:', error);
  }
  
  return null;
}
```

---

## Next Steps

- [Space Settings](03-space-settings.md) - Space-level configuration panels
- [Content Properties](06-content-properties.md) - Storing app data with pages
- [API Endpoints](08-api-endpoints.md) - Complete Confluence REST API reference