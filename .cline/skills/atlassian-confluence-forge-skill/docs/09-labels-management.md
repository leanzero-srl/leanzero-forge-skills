# Labels Management: Confluence Content Labels

This guide covers working with Confluence content labels - a key organizational feature for tagging and filtering pages, blog posts, and other content.

---

## Overview

Labels in Confluence are metadata tags that can be applied to content (pages, blog posts, spaces) for:
- Categorization and organization
- Content filtering and search
- Workflow automation
- Sync status tracking
- Approval status indicators

---

## Labels API Endpoints

| Operation | HTTP Method | Endpoint |
|-----------|-------------|----------|
| Get labels | GET | `/wiki/api/v2/pages/{pageId}/labels` |
| Add label | POST | `/wiki/api/v2/pages/{pageId}/labels` |
| Delete label | DELETE | `/wiki/api/v2/pages/{pageId}/labels` |

---

## Basic Label Operations

### Get All Labels on a Page

```javascript
// src/utils/labels.js
import { route } from '@forge/api';
import { requestConfluence } from '@forge/bridge';

export async function getLabels(pageId) {
  try {
    const response = await requestConfluence(
      route`/wiki/api/v2/pages/${pageId}/labels`
    );

    if (!response.ok) {
      throw new Error(`Failed to get labels: ${response.statusText}`);
    }

    const data = await response.json();
    return data.results || [];
  } catch (error) {
    console.error('Error getting labels:', error);
    throw error;
  }
}

// Usage
const labels = await getLabels(pageId);
console.log(labels.map(l => l.name)); // ['sync', 'approved', 'draft']
```

### Add a Label to Content

```javascript
export async function addLabel(pageId, labelName) {
  try {
    const response = await requestConfluence(
      route`/wiki/api/v2/pages/${pageId}/labels`,
      {
        method: 'POST',
        body: JSON.stringify([{ prefix: 'global', name: labelName }])
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to add label: ${response.statusText}`);
    }

    return true;
  } catch (error) {
    console.error('Error adding label:', error);
    throw error;
  }
}

// Usage
await addLabel(pageId, 'sync-required');
```

### Remove a Label from Content

```javascript
export async function removeLabel(pageId, labelName) {
  try {
    // First get the label ID
    const labelsResponse = await requestConfluence(
      route`/wiki/api/v2/pages/${pageId}/labels`
    );

    if (!labelsResponse.ok) {
      throw new Error('Failed to get labels');
    }

    const labelsData = await labelsResponse.json();
    const labelToRemove = labelsData.results?.find(l => l.name === labelName);

    if (!labelToRemove) {
      return false; // Label not found
    }

    // Delete the label
    const deleteResponse = await requestConfluence(
      route`/wiki/api/v2/pages/${pageId}/labels/${encodeURIComponent(labelToRemove.name)}?prefix=global`,
      { method: 'DELETE' }
    );

    return deleteResponse.ok;
  } catch (error) {
    console.error('Error removing label:', error);
    throw error;
  }
}

// Usage
await removeLabel(pageId, 'draft');
```

### Check if Content Has a Label

```javascript
export async function hasLabel(pageId, labelName) {
  const labels = await getLabels(pageId);
  return labels.some(l => l.name === labelName);
}

// Usage
if (await hasLabel(pageId, 'sync-required')) {
  // Do something special for synced pages
}
```

---

## Label Helper Class

Create a reusable helper class for working with labels:

```javascript
// src/utils/labelStore.js
import { route } from '@forge/api';
import { requestConfluence } from '@forge/bridge';

export class LabelStore {
  constructor() {}

  async _getLabels(pageId) {
    const response = await requestConfluence(
      route`/wiki/api/v2/pages/${pageId}/labels`
    );

    if (!response.ok) return [];
    const data = await response.json();
    return data.results || [];
  }

  async add(pageId, labelName) {
    try {
      // Check if already exists
      const labels = await this._getLabels(pageId);
      if (labels.some(l => l.name === labelName)) {
        console.log(`Label "${labelName}" already exists`);
        return true;
      }

      const response = await requestConfluence(
        route`/wiki/api/v2/pages/${pageId}/labels`,
        {
          method: 'POST',
          body: JSON.stringify([{ prefix: 'global', name: labelName }])
        }
      );

      return response.ok;
    } catch (error) {
      console.error(`Error adding label ${labelName}:`, error);
      throw error;
    }
  }

  async remove(pageId, labelName) {
    try {
      const labels = await this._getLabels(pageId);
      const labelToRemove = labels.find(l => l.name === labelName);

      if (!labelToRemove) {
        return false; // Not found
      }

      const response = await requestConfluence(
        route`/wiki/api/v2/pages/${pageId}/labels/${encodeURIComponent(labelToRemove.name)}?prefix=global`,
        { method: 'DELETE' }
      );

      return response.ok;
    } catch (error) {
      console.error(`Error removing label ${labelName}:`, error);
      throw error;
    }
  }

  async toggle(pageId, labelName) {
    const exists = await this.has(pageId, labelName);
    if (exists) {
      return await this.remove(pageId, labelName);
    } else {
      return await this.add(pageId, labelName);
    }
  }

  async has(pageId, labelName) {
    const labels = await this._getLabels(pageId);
    return labels.some(l => l.name === labelName);
  }

  async getAll(pageId) {
    try {
      const response = await requestConfluence(
        route`/wiki/api/v2/pages/${pageId}/labels`
      );

      if (!response.ok) return [];
      const data = await response.json();
      return data.results || [];
    } catch (error) {
      console.error('Error getting all labels:', error);
      throw error;
    }
  }

  async addMultiple(pageId, labelNames) {
    const results = [];
    
    for (const name of labelNames) {
      try {
        await this.add(pageId, name);
        results.push({ name, success: true });
      } catch (error) {
        results.push({ name, success: false, error: error.message });
      }
    }

    return results;
  }

  async removeMultiple(pageId, labelNames) {
    const results = [];
    
    for (const name of labelNames) {
      try {
        const removed = await this.remove(pageId, name);
        results.push({ name, success: removed });
      } catch (error) {
        results.push({ name, success: false, error: error.message });
      }
    }

    return results;
  }
}

// Usage
export const labelStore = new LabelStore();
```

---

## Common Patterns

### Pattern 1: Sync Status Tracking with Labels

```javascript
// src/utils/syncLabels.js
import { labelStore } from './labelStore';

const SYNC_LABELS = {
  PENDING: 'sync-pending',
  IN_PROGRESS: 'sync-in-progress',
  SUCCESS: 'sync-success',
  FAILED: 'sync-failed'
};

export async function updateSyncStatus(pageId, status) {
  // Remove old sync labels
  await labelStore.removeMultiple(pageId, Object.values(SYNC_LABELS));
  
  // Add new status label
  if (status in SYNC_LABELS) {
    await labelStore.add(pageId, SYNC_LABELS[status]);
  }
}

// Usage in webhook handler
export default async function pageUpdatedHandler(req, res) {
  const { content } = req.body.data;
  
  try {
    await updateSyncStatus(content.id, 'IN_PROGRESS');
    
    // Perform sync...
    
    await updateSyncStatus(content.id, 'SUCCESS');
  } catch (error) {
    await updateSyncStatus(content.id, 'FAILED');
    throw error;
  }
}
```

### Pattern 2: Approval Workflow Labels

```javascript
// src/utils/approvalLabels.js
import { labelStore } from './labelStore';

const APPROVAL_LABELS = {
  DRAFT: 'draft',
  PENDING_APPROVAL: 'pending-approval',
  APPROVED: 'approved',
  REJECTED: 'rejected'
};

export async function submitForApproval(pageId) {
  // Remove draft, add pending approval
  await labelStore.remove(pageId, APPROVAL_LABELS.DRAFT);
  await labelStore.add(pageId, APPROVAL_LABELS.PENDING_APPROVAL);
}

export async function approvePage(pageId) {
  // Remove pending, add approved
  await labelStore.remove(pageId, APPROVAL_LABELS.PENDING_APPROVAL);
  await labelStore.add(pageId, APPROVAL_LABELS.APPROVED);
}

import { route } from '@forge/api';
import { requestConfluence } from '@forge/bridge';

// Store rejection reason using content properties API v2
async function setContentProperty(pageId, key, value) {
  const response = await requestConfluence(
    route`/wiki/api/v2/pages/${pageId}/properties`,
    {
      method: 'POST',
      body: JSON.stringify({ key: `myapp:${key}`, value: JSON.stringify(value) })
    }
  );
  
  if (!response.ok) {
    throw new Error(`Failed to set content property: ${response.status}`);
  }
}

export async function rejectPage(pageId, reason) {
  // Add rejected label with reason
  await labelStore.add(pageId, APPROVAL_LABELS.REJECTED);
  
  // Store rejection reason in content properties
  await setContentProperty(pageId, 'rejectionReason', reason);
}

export async function isApprovable(pageId) {
  return await labelStore.has(pageId, APPROVAL_LABELS.PENDING_APPROVAL);
}
```

### Pattern 3: Content Aging with Labels

```javascript
// src/scheduled/labelAging.js
import { labelStore } from './labelStore';

const AGE_LABELS = [
  { name: 'old-90', thresholdDays: 90 },
  { name: 'older-180', thresholdDays: 180 },
  { name: 'oldest-365', thresholdDays: 365 }
];

export default async function handler() {
  const token = await AP.context.getToken();
  
  // Find pages older than thresholds
  for (const ageLabel of AGE_LABELS) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - ageLabel.thresholdDays);
    
    const cqlQuery = encodeURIComponent(`type=page AND lastModified<"${cutoffDate.toISOString()}"`);
      
      const response = await requestConfluence(
        route`/wiki/api/v2/search?cql=${cqlQuery}&limit=100`
      );

    if (!response.ok) continue;

    const data = await response.json();
    
    for (const page of data.results || []) {
      // Check if already has older label
      const labels = await labelStore.getAll(page.id);
      
      // Add new age label, remove old ones
      await labelStore.removeMultiple(
        page.id,
        AGE_LABELS.map(l => l.name)
      );
      await labelStore.add(page.id, ageLabel.name);
    }
  }
}
```

### Pattern 4: Label-Based Search

```javascript
// src/utils/searchByLabels.js
import { route } from '@forge/api';
import { requestConfluence } from '@forge/bridge';

export async function searchPagesWithLabel(labelName) {
  const response = await requestConfluence(
    route`/wiki/api/v2/search?cql=type=page%20AND%20label="${encodeURIComponent(labelName)}"&limit=50`
  );

  if (!response.ok) return [];

  const data = await response.json();
  return data.results || [];
}

// Usage - Find all pages needing sync
const pagesToSync = await searchPagesWithLabel('sync-required');
```

### Pattern 5: Bulk Label Operations

```javascript
// src/utils/bulkLabels.js
import { labelStore } from './labelStore';

export async function bulkAddLabel(pages, labelName) {
  const results = [];
  
  for (const pageId of pages) {
    try {
      await labelStore.add(pageId, labelName);
      results.push({ pageId, success: true });
    } catch (error) {
      results.push({ pageId, success: false, error: error.message });
    }
  }

  return results;
}

export async function bulkRemoveLabel(pages, labelName) {
  const results = [];
  
  for (const pageId of pages) {
    try {
      await labelStore.remove(pageId, labelName);
      results.push({ pageId, success: true });
    } catch (error) {
      results.push({ pageId, success: false, error: error.message });
    }
  }

  return results;
}

// Usage
const pages = ['123', '456', '789'];
await bulkAddLabel(pages, 'archived');
```

---

## UI Components for Labels

### Label Display Component

```jsx
// src/components/LabelsDisplay.jsx
import React from 'react';
import { Badge } from '@atlaskit/badge';

export function LabelsDisplay({ labels }) {
  if (!labels || labels.length === 0) {
    return <span>No labels</span>;
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
      {labels.map((label, index) => (
        <Badge key={index} appearance="success">
          {label.name}
        </Badge>
      ))}
    </div>
  );
}

// Usage
<LabelsDisplay labels={page.labels || []} />
```

### Label Selector Component

```jsx
// src/components/LabelSelector.jsx
import React, { useState } from 'react';
import Select from '@atlaskit/select';
import { labelStore } from './labelStore';

export function LabelSelector({ pageId }) {
  const [selectedLabels, setSelectedLabels] = useState([]);
  const [availableLabels, setAvailableLabels] = useState([]);

  useEffect(() => {
    async function loadLabels() {
      const currentLabels = await labelStore.getAll(pageId);
      setSelectedLabels(
        currentLabels.map(l => ({ value: l.name, label: l.name }))
      );
      
      // Get suggestions (common labels from space)
      setAvailableLabels([
        { value: 'sync', label: 'Sync Required' },
        { value: 'approved', label: 'Approved' },
        { value: 'draft', label: 'Draft' },
        { value: 'review', label: 'Needs Review' }
      ]);
    }

    loadLabels();
  }, [pageId]);

  const handleChange = async (selected) => {
    setSelectedLabels(selected);

    // Calculate labels to add/remove
    const currentNames = selected.map(l => l.value);
    const prevNames = await labelStore.getAll(pageId).then(l => l.map(l2 => l2.name));
    
    // Remove old labels not in new selection
    for (const name of prevNames) {
      if (!currentNames.includes(name)) {
        await labelStore.remove(pageId, name);
      }
    }

    // Add new labels
    for (const name of currentNames) {
      if (!prevNames.includes(name)) {
        await labelStore.add(pageId, name);
      }
    }
  };

  return (
    <Select
      isMulti
      options={availableLabels}
      value={selectedLabels}
      onChange={handleChange}
      placeholder="Select labels..."
      isClearable
    />
  );
}

// Usage
<LabelSelector pageId={pageId} />
```

---

## Best Practices

### 1. Use Consistent Label Naming

```javascript
// Define constants for all labels
export const LABELS = {
  SYNC: 'sync',
  APPROVED: 'approved',
  PENDING: 'pending-approval',
  REVIEW: 'needs-review'
};
```

### 2. Handle Label Limitations

Confluence has limits on label operations:
- Max ~100 labels per page (practical limit)
- Labels must be unique within a prefix

```javascript
export async function safeAddLabel(pageId, labelName) {
  const labels = await getLabels(pageId);
  
  if (labels.length >= 50) {
    console.warn('Page has many labels, consider cleanup');
  }
  
  return await addLabel(pageId, labelName);
}
```

### 3. Batch Operations

When working with many pages, batch operations:

```javascript
export async function processPagesInBatches(pages, batchSize = 10) {
  for (let i = 0; i < pages.length; i += batchSize) {
    const batch = pages.slice(i, i + batchSize);
    
    // Process batch in parallel
    await Promise.all(batch.map(p => processPage(p)));
  }
}
```

### 4. Error Handling

```javascript
export async function addLabelWithErrorHandling(pageId, labelName) {
  try {
    return await addLabel(pageId, labelName);
  } catch (error) {
    if (error.message.includes('403')) {
      console.error(`Permission denied for ${pageId}`);
    } else if (error.message.includes('429')) {
      console.error('Rate limited, waiting...');
      await sleep(1000);
      return await addLabel(pageId, labelName); // Retry
    }
    
    throw error;
  }
}
```

---

## Next Steps

- [Content Properties](06-content-properties.md) - Store structured data with content
- [Webhooks & Events](07-webhooks-events.md) - React to content changes
- [API Endpoints](08-api-endpoints.md) - Complete REST API reference