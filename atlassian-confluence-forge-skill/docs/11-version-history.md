# Version History: Confluence Page Versions

This guide covers working with page versions in Confluence - viewing, comparing, and restoring previous versions.

---

## Overview

Confluence maintains version history for all content. Key capabilities:

- View version history
- Compare two versions
- Restore a previous version
- Get version metadata (author, timestamp, comments)

---

## Version API Endpoints

| Operation | HTTP Method | Endpoint |
|-----------|-------------|----------|
| Get version history | GET | `/wiki/api/v2/pages/{pageId}/versions` |
| Get specific version | GET | `/wiki/api/v2/pages/{pageId}/versions/{versionNumber}` |
| Compare versions | GET | `/wiki/api/v2/pages/{pageId}/compare?to={versionId}&from={versionId}` |
| Restore version | POST | `/wiki/api/v2/pages/{pageId}/versions/restore` |

---

**Note on Version Operations:**

Confluence Cloud REST API v2 has different approaches for version operations:

1. **Compare Versions**: Use `/compare` endpoint with `to` and `from` query parameters containing version IDs

2. **Restore Version**: Confluence Cloud does NOT provide a direct "restore" API. To restore content to a previous version, you must:
   - Get the version's content via `/pages/{pageId}/versions/{versionNumber}`
   - Create a new page update with that content using the PUT `/pages/{pageId}` endpoint
   - Increment the version number in the request body

## Get Version History

```javascript
// src/utils/versions.js
import { route } from '@forge/api';
import { requestConfluence } from '@forge/bridge';

export async function getVersionHistory(pageId, options = {}) {
  const { start = 0, limit = 25 } = options;

  try {
    // Get version history
    const response = await requestConfluence(
      route`/wiki/api/v2/pages/${pageId}/versions?start=${start}&limit=${limit}`
    );

    if (!response.ok) throw new Error('Failed to get versions');

    const data = await response.json();
    
    return {
      versions: data.results || [],
      start: data.start,
      limit: data.limit,
      size: data.size,
      total: data.total
    };
  } catch (error) {
    console.error('Error getting version history:', error);
    throw error;
  }
}

// Usage - Get first page of versions
const result = await getVersionHistory(pageId);
console.log(`Total versions: ${result.total}`);

// Usage - Iterate through all versions
async function getAllVersions(pageId) {
  let start = 0;
  const allVersions = [];

  do {
    const result = await getVersionHistory(pageId, { start, limit: 100 });
    allVersions.push(...(result.versions || []));
    
    if (result.size < result.limit) break;
    start += result.limit;
  } while (true);

  return allVersions;
}
```

### Version Object Structure

```javascript
{
  id: "pageId",
  version: {
    number: 5,
    minorEdit: false,
    timestamp: "2024-01-15T10:30:00.000Z",
    message: "Updated documentation"
  },
  author: {
    accountId: "user-id-here",
    displayName: "John Doe",
    email: "john@example.com"
  }
}
```

---

## Compare Two Versions

```javascript
export async function compareVersions(pageId, version1, version2) {
  try {
    const response = await requestConfluence(
      route`/wiki/api/v2/pages/${pageId}/versions/diff?version1=${version1}&version2=${version2}`
    );

    if (!response.ok) throw new Error('Failed to compare versions');

    return await response.json();
  } catch (error) {
    console.error('Error comparing versions:', error);
    throw error;
  }
}

// Usage
const diff = await compareVersions(pageId, 3, 5);
console.log(diff.differences); // Array of changed elements
```

### Diff Result Structure

```javascript
{
  differences: [
    {
      type: 'content',
      oldVersion: 3,
      newVersion: 5,
      content: {
        added: ['<p>New line added</p>'],
        removed: ['<p>Old line removed</p>']
      }
    },
    // More differences...
  ]
}
```

---

## Restore Previous Version

```javascript
export async function restoreVersion(pageId, versionNumber, options = {}) {
  const { message = `Restored version ${versionNumber}` } = options;

  try {
    const response = await requestConfluence(
      route`/wiki/api/v2/pages/${pageId}?versionComment=${encodeURIComponent(message)}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          version: {
            number: versionNumber
          }
        })
      }
    );

    if (!response.ok) throw new Error('Failed to restore version');

    return await response.json();
  } catch (error) {
    console.error('Error restoring version:', error);
    throw error;
  }
}

// Usage - Restore version 3
await restoreVersion(pageId, 3);
```

---

## Version History UI Components

### Simple Version List

```jsx
// src/components/VersionList.jsx
import React, { useState, useEffect } from 'react';
import { getVersionHistory } from '../utils/versions';

export default function VersionList({ pageId }) {
  const [versionData, setVersionData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadVersions() {
      try {
        const data = await getVersionHistory(pageId);
        setVersionData(data);
      } catch (error) {
        console.error('Failed to load versions:', error);
      } finally {
        setLoading(false);
      }
    }

    if (pageId) {
      loadVersions();
    }
  }, [pageId]);

  if (loading) return <div>Loading versions...</div>;

  return (
    <div className="version-list">
      <h4>Version History ({versionData.total})</h4>
      
      {versionData.versions.length === 0 && (
        <p>No version history available.</p>
      )}

      <ul style={{ listStyle: 'none', padding: 0 }}>
        {versionData.versions.map(version => {
          const v = version.version;
          const author = version.author;

          return (
            <li 
              key={v.number} 
              style={{
                padding: '12px',
                marginBottom: '8px',
                backgroundColor: '#f3f2f1',
                borderRadius: '4px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong>Version {v.number}</strong>
                <span>{new Date(v.timestamp).toLocaleString()}</span>
              </div>
              
              {author && (
                <p style={{ margin: '4px 0', fontSize: '14px' }}>
                  by {author.displayName}
                </p>
              )}
              
              {v.message && (
                <p style={{ margin: '4px 0', fontSize: '12px', color: '#6b7280' }}>
                  {v.message}
                </p>
              )}

              {/* Restore button */}
              <button
                onClick={() => restoreVersion(pageId, v.number)}
                style={{
                  marginTop: '8px',
                  padding: '4px 8px',
                  fontSize: '12px'
                }}
              >
                Restore this version
              </button>
            </li>
          );
        })}
      </ul>

      {/* Pagination */}
      {versionData.total > versionData.size && (
        <div style={{ marginTop: '16px' }}>
          Showing {versionData.versions.length} of {versionData.total} versions
        </div>
      )}
    </div>
  );
}

async function restoreVersion(pageId, versionNumber) {
  if (!window.confirm(`Restore version ${versionNumber}?`)) return;
  
  try {
    await import('../utils/versions').then(m => m.restoreVersion(pageId, versionNumber));
    alert('Version restored successfully!');
    // Refresh the page or update state
  } catch (error) {
    alert('Failed to restore version');
  }
}
```

### Version Comparison View

```jsx
// src/components/VersionCompare.jsx
import React, { useState, useEffect } from 'react';
import { compareVersions } from '../utils/versions';

export default function VersionCompare({ pageId }) {
  const [version1, setVersion1] = useState(null);
  const [version2, setVersion2] = useState(null);
  const [diff, setDiff] = useState(null);

  useEffect(() => {
    if (version1 && version2) {
      compareVersions(pageId, version1, version2).then(setDiff);
    }
  }, [pageId, version1, version2]);

  return (
    <div className="version-compare">
      <h4>Compare Versions</h4>
      
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <select
          value={version1 || ''}
          onChange={(e) => setVersion1(e.target.value)}
        >
          <option value="">Select version 1</option>
          {generateVersionOptions(1, 20)} {/* Adjust range as needed */}
        </select>

        <select
          value={version2 || ''}
          onChange={(e) => setVersion2(e.target.value)}
        >
          <option value="">Select version 2</option>
          {generateVersionOptions(1, 20)}
        </select>
      </div>

      {diff && (
        <div className="diff-view">
          <h5>Differences:</h5>
          
          {diff.differences.map((d, index) => (
            <div key={index} style={{ marginBottom: '16px' }}>
              <strong>{d.type}</strong>
              
              {d.content?.added && d.content.added.length > 0 && (
                <div style={{ color: '#54A276', backgroundColor: '#eaf5ea', padding: '8px' }}>
                  <strong>Added:</strong>
                  {d.content.added.map((line, i) => (
                    <div key={i}>{line}</div>
                  ))}
                </div>
              )}

              {d.content?.removed && d.content.removed.length > 0 && (
                <div style={{ color: '#de350b', backgroundColor: '#ffecec', padding: '8px' }}>
                  <strong>Removed:</strong>
                  {d.content.removed.map((line, i) => (
                    <div key={i} style={{ textDecoration: 'line-through' }}>{line}</div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function generateVersionOptions(start, end) {
  const options = [];
  for (let i = start; i <= end; i++) {
    options.push(<option key={i} value={i}>Version {i}</option>);
  }
  return options;
}
```

### Version Timeline

```jsx
// src/components/VersionTimeline.jsx
import React, { useState, useEffect } from 'react';
import { getVersionHistory } from '../utils/versions';

export default function VersionTimeline({ pageId }) {
  const [timeline, setTimeline] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadTimeline() {
      try {
        // Get first 10 versions
        const data = await getVersionHistory(pageId, { limit: 10 });
        setTimeline(data.versions || []);
      } catch (error) {
        console.error('Failed to load timeline:', error);
      } finally {
        setLoading(false);
      }
    }

    if (pageId) {
      loadTimeline();
    }
  }, [pageId]);

  if (loading) return <div>Loading...</div>;

  return (
    <div className="version-timeline">
      {timeline.length === 0 && <p>No history yet</p>}

      <ol style={{
        position: 'relative',
        borderLeft: '2px solid #dee3e8',
        paddingLeft: '16px'
      }}>
        {timeline.map((v, index) => {
          const version = v.version;
          const author = v.author;

          return (
            <li key={index} style={{ position: 'relative', marginBottom: '24px' }}>
              {/* Timeline dot */}
              <div style={{
                position: 'absolute',
                left: '-26px',
                top: '4px',
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                backgroundColor: '#172b4d'
              }} />

              <strong>Version {version.number}</strong>
              
              <p style={{ fontSize: '14px', color: '#6b7280' }}>
                {new Date(version.timestamp).toLocaleDateString()} by{' '}
                {author?.displayName || 'Unknown'}
              </p>

              {version.message && (
                <p style={{ fontSize: '13px', fontStyle: 'italic' }}>
                  "{version.message}"
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
```

---

## Real-World Use Cases

### 1. Version Notifications

```javascript
// src/scheduled/version-check.js
import { getVersionHistory } from './utils/versions';

const LAST_CHECK_KEY = 'version-check-last-time';
const VERSION_CACHE_KEY = 'version-check-cache';

export default async function handler() {
  const token = await AP.context.getToken();
  
  // Get last check time
  let lastCheckTime = await getStoredTimestamp(token);
  
  if (!lastCheckTime) {
    // First run - set timestamp and exit
    await storeTimestamp(token, new Date().toISOString());
    return;
  }

  // Find pages modified since last check
  const response = await api.fetch({
    url: `/wiki/api/v2/search?cql=type=page%20AND%20lastModified>${lastCheckTime}&limit=100`,
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!response.ok) return;

  const data = await response.json();
  
  // Check each page for version changes
  for (const page of data.results || []) {
    const history = await getVersionHistory(page.id);
    
    // Compare with cached versions
    const cachedVersions = await getCachedVersions(page.id, token);
    
    if (!cachedVersions) {
      await cacheVersions(page.id, history.versions.map(v => v.version.number), token);
    } else {
      // Check for new versions
      const newVersions = history.versions.filter(
        v => !cachedVersions.includes(v.version.number)
      );
      
      if (newVersions.length > 0) {
        // Send notification about new version(s)
        await notifyVersionChange(page, newVersions);
        
        // Update cache
        await cacheVersions(page.id, history.versions.map(v => v.version.number), token);
      }
    }
  }

  // Update last check time
  await storeTimestamp(token, new Date().toISOString());
}

async function getCachedVersions(pageId, token) {
  try {
    const response = await api.fetch({
      url: `/wiki/api/v2/pages/${pageId}/properties/${VERSION_CACHE_KEY}`,
      headers: { Authorization: `Bearer ${token}` }
    });

    if (response.ok) {
      return (await response.json()).value;
    }
  } catch (e) {}

  return null;
}

async function cacheVersions(pageId, versions, token) {
  await api.fetch({
    url: `/wiki/api/v2/pages/${pageId}/properties/${VERSION_CACHE_KEY}`,
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: versions })
  });
}

async function notifyVersionChange(page, newVersions) {
  // Send to Slack/Teams/email
  const message = `New version(s) of "${page.title}": ${newVersions.map(v => v.version.number).join(', ')}`;
  
  await fetch('https://hooks.slack.com/services/YOUR-WEBHOOK', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: message })
  });
}
```

### 2. Version Diff Display in Custom UI

```javascript
// src/components/VersionDiffViewer.jsx
import React, { useState } from 'react';
import { compareVersions } from '../utils/versions';

export default function VersionDiffViewer({ pageId }) {
  const [version1, setVersion1] = useState(1);
  const [version2, setVersion2] = useState(2);
  const [diff, setDiff] = useState(null);

  useEffect(() => {
    if (pageId && version1 && version2) {
      compareVersions(pageId, version1, version2).then(setDiff);
    }
  }, [pageId, version1, version2]);

  return (
    <div className="diff-viewer">
      <h4>Version Diff</h4>
      
      <div style={{ display: 'flex', gap: '8px' }}>
        <select value={version1} onChange={(e) => setVersion1(e.target.value)}>
          {generateOptions(1, version2 - 1)}
        </select>

        <span>vs</span>

        <select value={version2} onChange={(e) => setVersion2(e.target.value)}>
          {generateOptions(version1 + 1, 100)}
        </select>
      </div>

      {diff && (
        <div className="diff-output">
          {diff.differences.map((d, i) => (
            <DiffBlock key={i} difference={d} />
          ))}
        </div>
      )}
    </div>
  );
}

function DiffBlock({ difference }) {
  return (
    <div style={{ border: '1px solid #dee3e8', borderRadius: '4px' }}>
      {difference.content?.added && (
        <pre style={{
          backgroundColor: '#eaf5ea',
          padding: '8px',
          margin: 0,
          overflowX: 'auto'
        }}>
          {difference.content.added.join('\n')}
        </pre>
      )}

      {difference.content?.removed && (
        <pre style={{
          backgroundColor: '#ffecec',
          padding: '8px',
          margin: 0,
          textDecoration: 'line-through',
          overflowX: 'auto'
        }}>
          {difference.content.removed.join('\n')}
        </pre>
      )}
    </div>
  );
}

function generateOptions(start, end) {
  const options = [];
  for (let i = start; i <= end; i++) {
    options.push(<option key={i} value={i}>v{i}</option>);
  }
  return options;
}
```

---

## Best Practices

### 1. Handle Large Version Lists

```javascript
export async function getVersionHistoryPaginated(pageId, limit = 25) {
  let start = 0;
  const allVersions = [];

  do {
    const result = await getVersionHistory(pageId, { start, limit });
    allVersions.push(...(result.versions || []));

    if (result.size < limit) break;
    start += result.limit;
  } while (true);

  return allVersions;
}
```

### 2. Cache Version Info

```javascript
const versionCache = new Map();

export async function getCachedVersionHistory(pageId, ttlMs = 300000) {
  const cacheKey = `versions:${pageId}`;
  
  if (versionCache.has(cacheKey)) {
    const entry = versionCache.get(cacheKey);
    if (Date.now() - entry.timestamp < ttlMs) {
      return entry.data;
    }
  }

  const data = await getVersionHistory(pageId);
  versionCache.set(cacheKey, { timestamp: Date.now(), data });
  
  return data;
}
```

### 3. Handle Deleted Versions

```javascript
export async function getActiveVersionNumber(pageId) {
  try {
    const response = await requestConfluence(
      route`/wiki/api/v2/pages/${pageId}?expand=version`
    );

    if (!response.ok) return null;

    const data = await response.json();
    return data.version?.number || null;
  } catch (error) {
    console.error('Error getting current version:', error);
    return null;
  }
}
```

---

## Next Steps

- [Labels Management](09-labels-management.md) - Tag content with metadata
- [User Permissions](10-user-permissions.md) - Check user access levels