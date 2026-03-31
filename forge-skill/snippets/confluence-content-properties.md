# Confluence Content Properties Code Examples

This document provides code examples for working with Confluence content properties in Atlassian Forge apps. Content properties allow you to store structured data associated with pages, blog posts, and other Confluence content.

## Table of Contents
1. [Overview](#overview)
2. [Storing Content Properties](#storing-content-properties)
3. [Retrieving Content Properties](#retrieving-content-properties)
4. [Updating Content Properties](#updating-content-properties)
5. [Deleting Content Properties](#deleting-content-properties)
6. [Common Use Cases](#common-use-cases)

---

## Overview

Content properties in Confluence allow you to store key-value pairs associated with content (pages, blog posts, attachments). This data persists in Confluence and can be accessed by your Forge app.

### Content Property Structure

```javascript
{
  "id": "property-id",
  "version": {
    "number": 1,
    "minorEdit": false,
    "message": "Property created"
  },
  "content": {
    "id": "page-content-id",
    "type": "page",
    "status": "current"
  },
  "key": "my-property-key",
  "value": { /* Your data here */ },
  "scope": {
    "type": "user",
    "account_id": "user-account-id"
  },
  "createdDate": "2024-01-15T10:30:00.000+0000",
  "lastUpdatedDate": "2024-01-15T10:30:00.000+0000"
}
```

---

## Storing Content Properties

### Create or Update Property (PUT)

```javascript
import api from '@forge/api';

export const createContentProperty = async (contentId, propertyKey, value) => {
  console.log(`Setting property "${propertyKey}" on content ${contentId}`);
  
  try {
    await api.asApp().requestJira(`/wiki/rest/api/content/${contentId}/property/${propertyKey}`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        value: value
      })
    });
    
    console.log(`Property "${propertyKey}" created successfully`);
    return { status: 'success', propertyKey };
  } catch (error) {
    console.error('Error creating property:', error);
    throw error;
  }
};

// Example usage
await createContentProperty('123456', 'my-app-data', {
  lastSynced: new Date().toISOString(),
  customField: 'value'
});
```

### Create Property with Version

```javascript
export const createContentPropertyWithVersion = async (contentId, propertyKey, value) => {
  console.log(`Creating versioned property "${propertyKey}"`);
  
  try {
    await api.asApp().requestJira(`/wiki/rest/api/content/${contentId}/property/${propertyKey}`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        value: value,
        version: {
          number: 1,
          minorEdit: false,
          message: 'Initial property creation'
        }
      })
    });
    
    return { status: 'success' };
  } catch (error) {
    console.error('Error creating versioned property:', error);
    throw error;
  }
};
```

### Store JSON Objects

```javascript
export const storeIssueMapping = async (contentId, issueKey, mappedData) => {
  // Get existing mappings or create empty object
  let existingData = await getContentProperty(contentId, 'issue-mappings');
  let mappings = existingData ? existingData.value : { issues: [] };
  
  // Add/update the mapping
  mappings.issues = mappings.issues || [];
  const existingIndex = mappings.issues.findIndex(i => i.key === issueKey);
  
  if (existingIndex >= 0) {
    mappings.issues[existingIndex] = {
      ...mappings.issues[existingIndex],
      ...mappedData,
      updated: new Date().toISOString()
    };
  } else {
    mappings.issues.push({
      key: issueKey,
      ...mappedData,
      created: new Date().toISOString(),
      updated: new Date().toISOString()
    });
  }
  
  // Save the updated mapping
  await createContentProperty(contentId, 'issue-mappings', mappings);
  
  return { status: 'success', mappings };
};
```

---

## Retrieving Content Properties

### Get Single Property

```javascript
export const getContentProperty = async (contentId, propertyKey) => {
  try {
    const response = await api.asApp().requestJira(
      `/wiki/rest/api/content/${contentId}/property/${propertyKey}`
    );
    
    if (!response.ok) {
      // Property doesn't exist
      if (response.status === 404) {
        return null;
      }
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    
    const property = await response.json();
    console.log(`Retrieved property "${propertyKey}":`, property.value);
    
    return property;
  } catch (error) {
    console.error('Error retrieving property:', error);
    throw error;
  }
};

// Example usage
const mapping = await getContentProperty('123456', 'issue-mappings');
if (mapping) {
  console.log('Found mappings:', mapping.value);
}
```

### Get All Properties for Content

```javascript
export const getAllContentProperties = async (contentId) => {
  try {
    const response = await api.asApp().requestJira(
      `/wiki/rest/api/content/${contentId}/property`
    );
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const properties = await response.json();
    console.log(`Found ${properties.results.length} properties`);
    
    return properties.results;
  } catch (error) {
    console.error('Error retrieving properties:', error);
    throw error;
  }
};

// Example usage
const properties = await getAllContentProperties('123456');
properties.forEach(prop => {
  console.log(`Property "${prop.key}":`, prop.value);
});
```

---

## Updating Content Properties

### Update Property Value

```javascript
export const updateContentProperty = async (contentId, propertyKey, newValue) => {
  // First get the existing property to preserve metadata
  let existingProperty = await getContentProperty(contentId, propertyKey);
  
  if (!existingProperty) {
    throw new Error(`Property "${propertyKey}" doesn't exist`);
  }
  
  try {
    await api.asApp().requestJira(
      `/wiki/rest/api/content/${contentId}/property/${propertyKey}`,
      {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          value: newValue,
          version: {
            number: existingProperty.version.number + 1
          }
        })
      }
    );
    
    return { status: 'success', propertyKey };
  } catch (error) {
    console.error('Error updating property:', error);
    throw error;
  }
};

// Example usage
const mapping = await getContentProperty('123456', 'issue-mappings');
if (mapping && mapping.value.issues) {
  // Update a specific issue mapping
  const issueIndex = mapping.value.issues.findIndex(i => i.key === 'PROJ-123');
  if (issueIndex >= 0) {
    mapping.value.issues[issueIndex].status = 'synced';
    
    await updateContentProperty('123456', 'issue-mappings', mapping.value);
  }
}
```

### Update Specific Field in Object

```javascript
export const updatePropertyField = async (contentId, propertyKey, fieldPath, newValue) => {
  const existingData = await getContentProperty(contentId, propertyKey);
  
  if (!existingData) {
    // Create new property if it doesn't exist
    return createContentProperty(contentId, propertyKey, { [fieldPath]: newValue });
  }
  
  // Use spread operator to update deeply nested fields
  const updatedValue = updateDeep(existingData.value, fieldPath, newValue);
  
  await api.asApp().requestJira(
    `/wiki/rest/api/content/${contentId}/property/${propertyKey}`,
    {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        value: updatedValue,
        version: {
          number: existingData.version.number + 1
        }
      })
    }
  );
  
  return { status: 'success', propertyKey, newValue: updatedValue };
};

// Helper function for deep updates
const updateDeep = (obj, path, newValue) => {
  const keys = path.split('.');
  const result = { ...obj };
  let current = result;
  
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!current[key] || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current[key] = { ...current[key] };
    current = current[key];
  }
  
  current[keys[keys.length - 1]] = newValue;
  return result;
};

// Example usage
await updatePropertyField('123456', 'issue-mappings', 'issues.0.status', 'synced');
```

---

## Deleting Content Properties

### Delete Single Property

```javascript
export const deleteContentProperty = async (contentId, propertyKey) => {
  try {
    await api.asApp().requestJira(
      `/wiki/rest/api/content/${contentId}/property/${propertyKey}`,
      { method: 'DELETE' }
    );
    
    console.log(`Deleted property "${propertyKey}"`);
    return { status: 'success', propertyKey };
  } catch (error) {
    console.error('Error deleting property:', error);
    throw error;
  }
};

// Example usage
await deleteContentProperty('123456', 'issue-mappings');
```

### Delete All Properties for Content

```javascript
export const deleteAllContentProperties = async (contentId) => {
  try {
    // Get all properties first
    const properties = await getAllContentProperties(contentId);
    
    // Delete each property
    for (const prop of properties) {
      await api.asApp().requestJira(
        `/wiki/rest/api/content/${contentId}/property/${prop.key}`,
        { method: 'DELETE' }
      );
      console.log(`Deleted property "${prop.key}"`);
    }
    
    return { status: 'success', deletedCount: properties.length };
  } catch (error) {
    console.error('Error deleting properties:', error);
    throw error;
  }
};

// Example usage
await deleteAllContentProperties('123456');
```

---

## Common Use Cases

### 1. Issue-Page Linking System

```javascript
export const linkIssueToPage = async (contentId, issueKey, linkData) => {
  // Get existing mappings
  let mappings = await getContentProperty(contentId, 'issue-links');
  mappings = mappings ? mappings.value : { links: [], version: 1 };
  
  // Add or update the link
  mappings.links = mappings.links || [];
  
  const existingIndex = mappings.links.findIndex(l => l.issueKey === issueKey);
  
  if (existingIndex >= 0) {
    mappings.links[existingIndex] = {
      ...mappings.links[existingIndex],
      ...linkData,
      lastUpdated: new Date().toISOString()
    };
  } else {
    mappings.links.push({
      issueKey,
      linkedAt: new Date().toISOString(),
      ...linkData
    });
  }
  
  mappings.version = (mappings.version || 0) + 1;
  
  await createContentProperty(contentId, 'issue-links', mappings);
  
  return { 
    status: 'success',
    issueKey,
    linksCount: mappings.links.length
  };
};

// Example usage
await linkIssueToPage('123456', 'PROJ-123', {
  direction: 'forward',
  notes: 'Related to this documentation'
});

const mappings = await getContentProperty('123456', 'issue-links');
console.log(`Linked issues: ${mappings.value.links.length}`);
```

### 2. Custom Metadata Storage

```javascript
export const storePageMetadata = async (contentId, metadata) => {
  // Get existing metadata or create new object
  let existingData = await getContentProperty(contentId, 'page-metadata');
  let data = existingData ? existingData.value : {};
  
  // Merge in new metadata
  data = { ...data, ...metadata };
  
  await createContentProperty(contentId, 'page-metadata', data);
  
  return { status: 'success' };
};

export const getPagesWithMetadata = async (spaceKey, filter) => {
  // Use Confluence REST API to search for pages in space
  const response = await api.asApp().requestJira(
    `/wiki/rest/api/content?spaceKey=${spaceKey}&limit=100&expand=properties`
  );
  
  if (!response.ok) {
    throw new Error('Failed to fetch pages');
  }
  
  const data = await response.json();
  
  // Filter pages based on metadata
  return data.results.filter(page => {
    const properties = page.extensions?.properties || {};
    
    if (filter.metadataKey && filter.metadataValue) {
      return properties[filter.metadataKey]?.value === filter.metadataValue;
    }
    
    return true;
  });
};

// Example usage
await storePageMetadata('123456', {
  contentType: 'tutorial',
  level: 'beginner',
  lastUpdated: new Date().toISOString()
});

const pages = await getPagesWithMetadata('DOCS', { 
  metadataKey: 'contentType', 
  metadataValue: 'tutorial' 
});
```

### 3. Form Data Storage

```javascript
export const saveFormData = async (contentId, formName, formData) => {
  // Get existing form data or create new object
  let formDataObj = await getContentProperty(contentId, `form-data-${formName}`);
  let data = formDataObj ? formDataObj.value : { submissions: [] };
  
  data.submissions = data.submissions || [];
  
  // Add new submission
  const submission = {
    id: crypto.randomUUID(),
    submittedAt: new Date().toISOString(),
    ...formData
  };
  
  data.submissions.push(submission);
  
  await createContentProperty(contentId, `form-data-${formName}`, data);
  
  return { status: 'success', submissionId: submission.id };
};

export const getFormSubmissions = async (contentId, formName) => {
  const formData = await getContentProperty(contentId, `form-data-${formName}`);
  return formData ? formData.value.submissions : [];
};

// Example usage
await saveFormData('123456', 'feedback-form', {
  rating: 5,
  comments: 'Great documentation!',
  submittedBy: 'currentUser'
});

const submissions = await getFormSubmissions('123456', 'feedback-form');
console.log(`Received ${submissions.length} feedback submissions`);
```

---

## Error Handling

### Comprehensive Error Handling

```javascript
export const robustContentPropertyOperation = async (contentId, propertyKey, operation) => {
  console.log(`Starting ${operation} for content ${contentId}, property "${propertyKey}"`);
  
  try {
    // Validate inputs
    if (!contentId || !propertyKey) {
      throw new Error('Missing required parameters');
    }
    
    // Perform the requested operation
    let result;
    switch (operation) {
      case 'create':
        result = await createContentProperty(contentId, propertyKey, { value: 'default' });
        break;
      case 'read':
        result = await getContentProperty(contentId, propertyKey);
        break;
      case 'update':
        // Get existing data first
        const existing = await getContentProperty(contentId, propertyKey);
        if (!existing) {
          throw new Error('Property does not exist');
        }
        result = await updateContentProperty(
          contentId, 
          propertyKey, 
          { ...existing.value, updated: true }
        );
        break;
      case 'delete':
        result = await deleteContentProperty(contentId, propertyKey);
        break;
      default:
        throw new Error(`Unknown operation: ${operation}`);
    }
    
    return result;
  } catch (error) {
    console.error('Content property error:', {
      message: error.message,
      stack: error.stack,
      contentId,
      propertyKey,
      operation
    });
    
    // Handle specific errors
    if (error.status === 404) {
      throw new Error('Content or property not found');
    }
    
    throw error;
  }
};
```

### Rate Limiting

```javascript
export const throttledPropertyOperation = async (operations) => {
  const results = [];
  const BATCH_SIZE = 10;
  
  for (let i = 0; i < operations.length; i += BATCH_SIZE) {
    const batch = operations.slice(i, i + BATCH_SIZE);
    
    // Execute batch with delays
    for (const op of batch) {
      try {
        results.push(await op());
      } catch (error) {
        results.push({ error: error.message });
      }
      
      // Small delay between operations
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  return results;
};
```

---

## Best Practices

1. **Use descriptive keys** - Choose meaningful property key names
2. **Version your data** - Include version information in your stored objects
3. **Handle missing properties** - Check if properties exist before accessing them
4. **Keep data size reasonable** - Avoid storing very large objects
5. **Validate on save** - Validate data structure when creating/updating

---

## Related Documentation

- [Confluence REST API](../api-endpoints/confluence-rest-api-v2.md)
- [Content Properties API](https://developer.atlassian.com/cloud/confluence/rest/api-group-content/#api-wiki-rest-api-content-contentid-property-propertykey-put)