# Confluence Custom Content Module

## Overview

The `confluence:customContent` module allows you to define a new content type in Confluence that behaves like built-in pages and blog posts. Users can create, list, view, edit, and delete your custom content from within Confluence.

---

## Basic Structure

```yaml
# manifest.yml
modules:
  confluence:customContent:
    - key: my-custom-content
      resource: main
      title: "Project Documentation"
      description: "Custom project documentation template"
```

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `key` | string | Unique identifier for the module |
| `resource` | string | Reference to your frontend resource |

---

## Complete Example

```yaml
# manifest.yml
modules:
  confluence:customContent:
    - key: project-documentation
      resource: main
      title: "Project Documentation"
      description: "Create and manage project documentation"
      icon: https://example.com/icon.svg
      createButtonTitle: "New Project Doc"

resources:
  - key: main
    path: static/custom-content/build

permissions:
  scopes:
    - read:confluence-content.summary
    - write:confluence-content

app:
  id: "<your-app-id>"
```

---

## Custom Content Properties

### Title and Description

```yaml
modules:
  confluence:customContent:
    - key: my-custom-content
      resource: main
      title: "Project Documentation"
      description: "Custom documentation for projects"
      icon: https://cdn-icons-png.flaticon.com/512/1234/123456.png
```

### Create Button Title

```yaml
modules:
  confluence:customContent:
    - key: my-custom-content
      resource: main
      title: "Project Documentation"
      createButtonTitle: "+ New Project Doc"  # Text on the create button
```

---

## API Endpoints

### Create Custom Content

```http
POST /wiki/api/v2/customcontent
Content-Type: application/json
Authorization: Bearer <app-token>

{
  "contentType": {
    "moduleKey": "my-custom-content",
    "spaceId": "123456"
  },
  "title": "My Project Doc",
  "body": {
    "representation": "storage",
    "value": "<p>Content here</p>"
  }
}
```

### Get Custom Content

```http
GET /wiki/api/v2/customcontent/{customContentId}
Accept: application/json
Authorization: Bearer <app-token>
```

### Update Custom Content

```http
PUT /wiki/api/v2/customcontent/{customContentId}
Content-Type: application/json
Authorization: Bearer <app-token>

{
  "title": "Updated Title",
  "body": {
    "representation": "storage",
    "value": "<p>New content</p>"
  },
  "version": {
    "number": 2,
    "minorEdit": false
  }
}
```

### Delete Custom Content

```http
DELETE /wiki/api/v2/customcontent/{customContentId}
Authorization: Bearer <app-token>
```

### List Custom Content

```http
GET /wiki/api/v2/spaces/{spaceId}/customcontent?start=0&limit=25
Accept: application/json
Authorization: Bearer <app-token>
```

---

## Resolver Pattern

For interactive custom content, use the resolver pattern:

```yaml
# manifest.yml
modules:
  confluence:customContent:
    - key: my-custom-content
      resource: main
      title: "Project Documentation"
      render: native
      resolver:
        function: contentResolver

functions:
  - key: contentResolver
    handler: index.handler
```

```javascript
// src/index.js
export const handler = async (req) => {
  if (req.trigger.key === 'contentResolver') {
    return await resolveContent(req.params);
  }
  
  // Render function for create/edit forms
  return new Response(
    `<div id="root"></div>
     <script type="module" src="./index.js"></script>`,
    { headers: { 'Content-Type': 'text/html' } }
  );
};

async function resolveContent(params) {
  const storage = getStorage();
  const data = await storage.get(`content-${params.customContentId}`);
  
  if (!data) return null;
  
  return JSON.parse(data);
}
```

---

## Navigation to Custom Content

### Navigate to Create Form

```javascript
import { router } from '@forge/bridge';

// From a page extension or other UI
router.navigate({
  target: 'contentCreate',
  contentType: 'customContent',
  moduleKey: 'my-custom-content'
});
```

### Navigate to List View

```javascript
// Navigate to list of all custom content in space
router.navigate({
  target: 'contentList',
  contentType: 'customContent',
  moduleKey: 'my-custom-content'
});
```

### Navigate to Specific Content

```javascript
router.navigate({
  target: 'contentView',
  contentType: 'customContent',
  moduleKey: 'my-custom-content',
  contentId: '123456'  // customContentId
});
```

---

## Frontend Component

```jsx
// src/frontend/CustomContent.jsx
import React, { useState, useEffect } from 'react';
import { useParams, router } from '@forge/bridge';

export const CustomContent = () => {
  const [content, setContent] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  
  // Check if we're in create mode
  const params = useParams();
  const customContentId = params.customContentId;

  useEffect(() => {
    if (customContentId) {
      fetchContent(customContentId);
    }
  }, [customContentId]);

  const fetchContent = async (id) => {
    // Fetch from your storage or API
    const storage = getStorage();
    const data = await storage.get(`content-${id}`);
    
    if (data) {
      setContent(JSON.parse(data));
    }
  };

  const handleSave = async () => {
    // Save content to storage
    const storage = getStorage();
    await storage.set(`content-${customContentId}`, JSON.stringify(content));
    
    setIsEditing(false);
    
    // Navigate back to view mode
    router.navigate({
      target: 'contentView',
      contentType: 'customContent',
      moduleKey: 'my-custom-content',
      contentId: customContentId
    });
  };

  if (!content && !isEditing) {
    return <div>Loading...</div>;
  }

  return (
    <div className="custom-content">
      {isEditing ? (
        <div>
          <input
            value={content.title}
            onChange={(e) => setContent({ ...content, title: e.target.value })}
            placeholder="Title"
          />
          <textarea
            value={content.body}
            onChange={(e) => setContent({ ...content, body: e.target.value })}
            placeholder="Content"
          />
          <button onClick={handleSave}>Save</button>
        </div>
      ) : (
        <div>
          <h1>{content.title}</h1>
          <p>{content.body}</p>
          <button onClick={() => setIsEditing(true)}>Edit</button>
        </div>
      )}
    </div>
  );
};
```

---

## Manifest for Create/Edit Form

```yaml
modules:
  confluence:customContent:
    - key: my-custom-content
      resource: main
      title: "Project Documentation"
      description: "Custom project documentation"

resources:
  - key: main
    path: static/custom-content/build
```

The build folder should contain an `index.html` file:

```html
<!-- static/custom-content/build/index.html -->
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Project Documentation</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./index.jsx"></script>
  </body>
</html>
```

---

## Storage Integration

```javascript
// utils/customContentStorage.js
export async function saveCustomContent(id, data) {
  const storage = getStorage();
  
  // Store the full content object
  await storage.set(`custom-content-${id}`, JSON.stringify(data));
}

export async function loadCustomContent(id) {
  const storage = getStorage();
  const data = await storage.get(`custom-content-${id}`);
  
  return data ? JSON.parse(data) : null;
}

export async function deleteCustomContent(id) {
  const storage = getStorage();
  await storage.delete(`custom-content-${id}`);
}
```

---

## Permissions Required

```yaml
permissions:
  scopes:
    - read:confluence-content.summary  # View custom content
    - write:confluence-content         # Create/edit custom content
    - storage:app                      # Store additional data
```

---

## Complete Workflow Example

### 1. Define Module (manifest.yml)

```yaml
modules:
  confluence:customContent:
    - key: project-doc
      resource: main
      title: "Project Doc"
      description: "Create project documentation"

resources:
  - key: main
    path: static/project-doc/build
```

### 2. Create Frontend (src/frontend/index.jsx)

```jsx
import React from 'react';
import ReactDOM from 'react-dom';
import { CustomContentEditor } from './CustomContentEditor';

const root = document.getElementById('root');
ReactDOM.render(<CustomContentEditor />, root);
```

### 3. Implement Editor Component

```jsx
// src/frontend/CustomContentEditor.jsx
import React, { useState, useEffect } from 'react';
import { useContent, router, getStorage } from '@forge/bridge';

export const CustomContentEditor = () => {
  const content = useContent();
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    body: ''
  });

  // Pre-fill if editing existing
  useEffect(() => {
    if (content && content.id) {
      // Load existing data from storage
      getStorage().then(storage => {
        storage.get(`project-doc-${content.id}`).then(data => {
          if (data) setFormData(JSON.parse(data));
        });
      });
    }
  }, [content]);

  const handleSubmit = async () => {
    const storage = await getStorage();
    
    if (content && content.id) {
      // Update existing
      await storage.set(`project-doc-${content.id}`, JSON.stringify(formData));
    } else {
      // Create new - store temporarily until content is created
      await storage.set('pending-project-doc', JSON.stringify(formData));
      
      // Redirect to create flow
      router.navigate({
        target: 'contentCreate',
        contentType: 'customContent',
        moduleKey: 'project-doc'
      });
    }
  };

  return (
    <div>
      <h1>{content ? 'Edit Project Doc' : 'New Project Doc'}</h1>
      
      <input
        value={formData.title}
        onChange={(e) => setFormData({...formData, title: e.target.value})}
        placeholder="Title"
      />
      
      <textarea
        value={formData.body}
        onChange={(e) => setFormData({...formData, body: e.target.value})}
        placeholder="Content"
      />
      
      <button onClick={handleSubmit}>Save</button>
    </div>
  );
};
```

---

## Common Patterns

### Pattern 1: Form with Validation

```jsx
const handleSubmit = async () => {
  if (!formData.title.trim()) {
    alert('Title is required');
    return;
  }
  
  // Save and navigate back to list
  await storage.set(`project-doc-${content.id}`, JSON.stringify(formData));
  
  router.navigate({
    target: 'contentList',
    contentType: 'customContent',
    moduleKey: 'project-doc'
  });
};
```

### Pattern 2: Auto-Save Draft

```javascript
let saveTimeout;

const handleChange = (field, value) => {
  setFormData(prev => ({ ...prev, [field]: value }));
  
  // Debounced auto-save
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    if (content?.id) {
      await storage.set(`project-doc-${content.id}-draft`, JSON.stringify(formData));
    }
  }, 1000);
};
```

### Pattern 3: Version History

```jsx
const loadVersionHistory = async () => {
  const storage = await getStorage();
  const keys = await storage.keys();
  
  // Find all versions of this content
  const versionKeys = keys.filter(k => k.startsWith(`project-doc-${content.id}`));
  
  const versions = [];
  for (const key of versionKeys) {
    const data = await storage.get(key);
    if (data) {
      versions.push({ key, ...JSON.parse(data) });
    }
  }
};
```

---

## Next Steps

- **Real-world Patterns**: See custom content in action
- **CLI Commands**: Learn to test custom content modules