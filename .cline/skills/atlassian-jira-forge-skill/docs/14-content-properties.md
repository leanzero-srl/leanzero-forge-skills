# Confluence Content Properties Code Examples

This document provides code examples for working with Confluence content properties in Atlassian Forge apps. Content properties allow you to store structured data associated with pages and blog posts.

## Table of Contents
1. [What are Content Properties](#what-are-content-properties)
2. [Basic CRUD Operations](#basic-crud-operations)
3. [Storing Data](#storing-data)
4. [Retrieving Data](#retrieving-data)
5. [Updating Data](#updating-data)
6. [Deleting Data](#deleting-data)
7. [Common Use Cases](#common-use-cases)

---

## What are Content Properties?

Content properties allow you to store structured data associated with Confluence pages and blog posts. This is useful for:

- **Issue-linking systems** - Link Confluence pages to Jira issues
- **Custom metadata** - Store additional information about content
- **Form data storage** - Save form submissions on pages
- **Content state tracking** - Track review status, approval dates, etc.

### Accessing Content Properties

```javascript
import api, { route } from '@forge/api';

// GET: Retrieve a content property
const response = await api.asApp().requestConfluence(
  route`/wiki/rest/api/content/${contentId}/property/${propertyKey}`
);

// PUT: Create or update a content property
await api.asApp().requestConfluence(
  route`/wiki/rest/api/content/${contentId}/property/${propertyKey}`,
  {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: yourData })
  }
);

// DELETE: Remove a content property
await api.asApp().requestConfluence(
  route`/wiki/rest/api/content/${contentId}/property/${propertyKey}`,
  { method: 'DELETE' }
);
```

---

## Basic CRUD Operations

### Storing Content Properties

```javascript
export const createContentProperty = async (contentId, propertyKey, value) => {
  try {
    await api.asApp().requestConfluence(
      route`/wiki/rest/api/content/${contentId}/property/${propertyKey}`,
      {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          value: value
        })
      }
    );
    
    return { status: 'success', propertyKey };
  } catch (error) {
    console.error('Error creating property:', error);
    throw error;
  }
};

// Usage example
await createContentProperty(
  '123456',
  'issue-link',
  { 
    issueKey: 'PROJ-123',
    linkType: 'relates to',
    created: new Date().toISOString()
  }
);
```

### Retrieving Content Properties

```javascript
export const getContentProperty = async (contentId, propertyKey) => {
  try {
    const response = await api.asApp().requestConfluence(
      route`/wiki/rest/api/content/${contentId}/property/${propertyKey}`
    );
    
    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`HTTP ${response.status}`);
    }
    
    const property = await response.json();
    return property;
  } catch (error) {
    console.error('Error retrieving property:', error);
    throw error;
  }
};

// Usage example
const property = await getContentProperty('123456', 'issue-link');
console.log(property.value); // { issueKey: 'PROJ-123', ... }
```

### Updating Content Properties

```javascript
export const updateContentProperty = async (contentId, propertyKey, newValue) => {
  let existingProperty = await getContentProperty(contentId, propertyKey);
  
  if (!existingProperty) {
    throw new Error(`Property "${propertyKey}" doesn't exist`);
  }
  
  await api.asApp().requestConfluence(
    route`/wiki/rest/api/content/${contentId}/property/${propertyKey}`,
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
};

// Usage example
await updateContentProperty('123456', 'issue-link', {
  issueKey: 'PROJ-456',
  linkType: 'blocks',
  created: new Date().toISOString()
});
```

### Deleting Content Properties

```javascript
export const deleteContentProperty = async (contentId, propertyKey) => {
  try {
    await api.asApp().requestConfluence(
      route`/wiki/rest/api/content/${contentId}/property/${propertyKey}`,
      { method: 'DELETE' }
    );
    
    return { status: 'success', propertyKey };
  } catch (error) {
    console.error('Error deleting property:', error);
    throw error;
  }
};

// Usage example
await deleteContentProperty('123456', 'issue-link');
```

---

## Storing Data

### Simple Values

```javascript
export const storeSimpleValue = async (contentId, key, value) => {
  await api.asApp().requestConfluence(
    route`/wiki/rest/api/content/${contentId}/property/${key}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: value })
    }
  );
};

// Examples
await storeSimpleValue('123456', 'review-status', 'approved');
await storeSimpleValue('123456', 'version', '1.0.0');
```

### Complex Objects

```javascript
export const storeComplexObject = async (contentId, key, obj) => {
  await api.asApp().requestConfluence(
    route`/wiki/rest/api/content/${contentId}/property/${key}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: obj })
    }
  );
};

// Store issue linking data
await storeComplexObject('123456', 'issue-links', [
  { 
    issueKey: 'PROJ-123',
    type: 'relates to',
    timestamp: new Date().toISOString()
  },
  {
    issueKey: 'PROJ-456', 
    type: 'depends on',
    timestamp: new Date().toISOString()
  }
]);
```

### Array Data

```javascript
export const storeArrayData = async (contentId, key, array) => {
  await api.asApp().requestConfluence(
    route`/wiki/rest/api/content/${contentId}/property/${key}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: array })
    }
  );
};

// Store form submission data
const formData = [
  {
    fieldName: 'requestor-name',
    value: 'John Doe'
  },
  {
    fieldName: 'priority',
    value: 'High'
  },
  {
    fieldName: 'details',
    value: 'System maintenance request'
  }
];

await storeArrayData('123456', 'form-submissions', formData);
```

---

## Retrieving Data

### Get All Properties for Content

```javascript
export const getAllContentProperties = async (contentId) => {
  try {
    const response = await api.asApp().requestConfluence(
      route`/wiki/rest/api/content/${contentId}/property?expand=value`
    );
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    return data.results;
  } catch (error) {
    console.error('Error fetching properties:', error);
    throw error;
  }
};

// Usage example
const properties = await getAllContentProperties('123456');
properties.forEach(prop => {
  console.log(`${prop.key}:`, prop.value);
});
```

### Conditional Retrieval

```javascript
export const getOrCreateProperty = async (contentId, key, defaultValue) => {
  let property = await getContentProperty(contentId, key);
  
  if (!property) {
    await createContentProperty(contentId, key, defaultValue);
    return { value: defaultValue, created: true };
  }
  
  return { value: property.value, created: false };
};

// Usage example
const result = await getOrCreateProperty('123456', 'metadata', {});
if (result.created) {
  console.log('Created new metadata');
}
```

### Error Handling for Retrieval

```javascript
export const safeGetContentProperty = async (contentId, propertyKey) => {
  try {
    const response = await api.asApp().requestConfluence(
      route`/wiki/rest/api/content/${contentId}/property/${propertyKey}`
    );
    
    if (response.status === 404) {
      return null;
    }
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const property = await response.json();
    return property;
  } catch (error) {
    console.error('Safe retrieval error:', error);
    return { error: error.message };
  }
};
```

---

## Updating Data

### Incremental Updates

```javascript
export const incrementPropertyCounter = async (contentId, key, amount = 1) => {
  let property = await getContentProperty(contentId, key);
  
  if (!property) {
    return createContentProperty(contentId, key, { count: amount });
  }
  
  const newValue = { 
    count: (property.value.count || 0) + amount,
    lastUpdated: new Date().toISOString()
  };
  
  await updateContentProperty(contentId, key, newValue);
  return newValue;
};

// Usage example
const counter = await incrementPropertyCounter('123456', 'page-views');
console.log(`Page views: ${counter.count}`);
```

### Merge Updates

```javascript
export const mergeToProperty = async (contentId, key, updates) => {
  let property = await getContentProperty(contentId, key);
  
  const currentData = property ? property.value : {};
  const mergedData = { ...currentData, ...updates };
  
  await updateContentProperty(contentId, key, mergedData);
  return mergedData;
};

// Usage example
await mergeToProperty('123456', 'page-info', {
  lastEditor: 'user123',
  lastEditDate: new Date().toISOString()
});
```

---

## Deleting Data

### Delete with Confirmation

```javascript
export const deleteWithConfirmation = async (contentId, key) => {
  let property = await getContentProperty(contentId, key);
  
  if (!property) {
    return { deleted: false, reason: 'Property not found' };
  }
  
  await deleteContentProperty(contentId, key);
  return { 
    deleted: true, 
    key: key,
    previousValue: property.value
  };
};

// Usage example
const result = await deleteWithConfirmation('123456', 'temporary-data');
console.log(result);
```

### Bulk Deletion

```javascript
export const bulkDeleteProperties = async (contentId, keys) => {
  const results = [];
  
  for (const key of keys) {
    try {
      await deleteContentProperty(contentId, key);
      results.push({ key, status: 'success' });
    } catch (error) {
      results.push({ key, status: 'error', error: error.message });
    }
  }
  
  return results;
};

// Usage example
const keysToDelete = ['temp-data', 'draft-info', 'cache-entry'];
await bulkDeleteProperties('123456', keysToDelete);
```

---

## Common Use Cases

### 1. Issue-Page Linking System

```yaml
modules:
  confluence:fullPage:
    - key: issue-linker-page
      name: { value: 'Issue Linker' }
      function: issueLinkerFunction
      
  macro:
    - key: issue-link-macro
      name: { value: 'Issue Link' }
      description: { value: 'Links a Confluence page to a Jira issue' }
      function: issueLinkMacro
```

```javascript
export const linkIssueToPage = async (contentId, issueKey) => {
  // Store the linking information as a content property
  await createContentProperty(contentId, 'issue-link', {
    issueKey: issueKey,
    linkedAt: new Date().toISOString()
  });
  
  return { status: 'success', message: `Linked to ${issueKey}` };
};

export const getLinkedIssues = async (contentId) => {
  // Get all issue links for this page
  const property = await getContentProperty(contentId, 'issue-link');
  return property ? [property.value] : [];
};
```

### 2. Content Review Workflow

```javascript
export const startReviewProcess = async (contentId, reviewerAccountId) => {
  const reviewData = {
    status: 'pending',
    reviewer: reviewerAccountId,
    requestedAt: new Date().toISOString(),
    dueDate: calculateDueDate(7)
  };
  
  await createContentProperty(contentId, 'review-status', reviewData);
  return { status: 'started', ...reviewData };
};

export const approveReview = async (contentId) => {
  let property = await getContentProperty(contentId, 'review-status');
  
  if (!property || property.value.status !== 'pending') {
    throw new Error('No pending review found');
  }
  
  await updateContentProperty(contentId, 'review-status', {
    ...property.value,
    status: 'approved',
    approvedAt: new Date().toISOString()
  });
};

export const rejectReview = async (contentId, feedback) => {
  let property = await getContentProperty(contentId, 'review-status');
  
  if (!property || property.value.status !== 'pending') {
    throw new Error('No pending review found');
  }
  
  await updateContentProperty(contentId, 'review-status', {
    ...property.value,
    status: 'rejected',
    feedback: feedback,
    rejectedAt: new Date().toISOString()
  });
};

const calculateDueDate = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
};
```

### 3. Form Data Storage

```javascript
export const submitFormData = async (contentId, formData) => {
  // Get existing submissions or create empty array
  let property = await getContentProperty(contentId, 'form-submissions');
  const submissions = property ? property.value : [];
  
  // Add new submission with metadata
  const newSubmission = {
    id: `sub-${Date.now()}`,
    data: formData,
    submittedAt: new Date().toISOString(),
    submitterAccountId: context.accountId
  };
  
  submissions.push(newSubmission);
  
  await updateContentProperty(contentId, 'form-submissions', submissions);
  return { status: 'success', submissionId: newSubmission.id };
};

export const getFormSubmissions = async (contentId) => {
  const property = await getContentProperty(contentId, 'form-submissions');
  return property ? property.value : [];
};
```

---

## Best Practices

1. **Use descriptive keys** - Choose clear, consistent property key names
2. **Version your data** - Include version info in stored objects
3. **Handle errors gracefully** - Content properties may not exist
4. **Clean up old data** - Remove obsolete properties periodically
5. **Respect permissions** - Only store data the user can access

---

## Related Documentation

- [Forge Confluence Modules](../confluence-modules/)
- [Confluence REST API Reference](../api-endpoints/confluence-rest-api.md)