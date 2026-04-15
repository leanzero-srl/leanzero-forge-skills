# Real-World Patterns: Confluence Forge Apps

This document provides practical, real-world examples of how to implement common Confluence Forge app patterns using best practices.

---

## Pattern 1: Sync Pages to External System

### Use Case
Keep an external database in sync with Confluence pages. When a page is created or updated, send the content to your backend system.

### Implementation

```yaml
# manifest.yml
modules:
  webhook:
    - destination: page-sync-handler
      event: confluence:page:created
      
    - destination: page-update-handler  
      event: confluence:page:updated
      
  function.scheduled:
    - key: sync-reconciliation
      resource: reconciliation-handler
      schedule: '0 */30 * * *'  # Every 30 minutes
      
  resource:
    - key: main
      path: src/main.jsx
    - key: page-sync-handler
      path: src/webhooks/page-created.js
    - key: page-update-handler
      path: src/webhooks/page-updated.js
    - key: reconciliation-handler
      path: src/scheduled/reconciliation.js
```

```javascript
// src/webhooks/page-created.js
import { route } from '@forge/api';
import { requestConfluence } from '@forge/bridge';

export default async function handler(req, res) {
  const { event, data } = req.body;

  try {
    await syncPageToExternalSystem(data);
    
    // Mark page as synced using content properties
    await markPageSynced(data.content.id, data.token);
    
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Failed to sync page:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
}

async function syncPageToExternalSystem(pageData) {
  const { content, space } = pageData;
  
  // Fetch full page details including body in storage format
  const response = await requestConfluence(
    route`/wiki/api/v2/pages/${content.id}?bodyFormat=storage`
  );

  if (!response.ok) {
    throw new Error('Failed to fetch page content');
  }

  const page = await response.json();
  
  // Send to external system
  const syncResponse = await fetch('https://your-backend.com/api/sync/confluence-page', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.BACKEND_API_TOKEN}`
    },
    body: JSON.stringify({
      confluencePageId: page.id,
      title: page.title,
      content: page.body.storage.value,
      spaceKey: space.key,
      authorAccountId: content.author.accountId,
      lastModified: page.lastModified
    })
  });

  if (!syncResponse.ok) {
    throw new Error('Failed to sync with backend');
  }
}

async function markPageSynced(pageId, token) {
  // Use content properties to track sync status
  await requestConfluence(
    route`/wiki/api/v2/pages/${pageId}/properties/syncStatus`,
    { 
      method: 'PUT',
      body: JSON.stringify({
        key: 'syncStatus',
        value: JSON.stringify({
          synced: true,
          timestamp: new Date().toISOString()
        })
      })
    }
  );
}
```

---

## Pattern 2: Add Default Labels to New Pages

### Use Case
Automatically add labels to pages when they are created based on their space or parent page.

### Implementation

```javascript
// src/webhooks/page-labels.js
import { route } from '@forge/api';
import { requestConfluence } from '@forge/bridge';

export default async function handler(req, res) {
  const { event, data } = req.body;

  if (event !== 'confluence:page:created') {
    return res.status(200).json({ success: true });
  }

  try {
    const labelsToAdd = await getLabelsForPage(data);
    
    for (const label of labelsToAdd) {
      await addLabelToPage(data.content.id, label, data.token);
    }
    
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Failed to add labels:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
}

async function getLabelsForPage(pageData) {
  const { content, space } = pageData;
  
  const labels = [];
  
  // Add space-based label
  labels.push(`space:${space.key}`);
  
  // Add content type label
  labels.push(`type:${content.type}`);
  
  // Check for parent page to inherit its label (if exists)
  if (content.parentId) {
    labels.push('child-page');
  }
  
  return labels;
}

async function addLabelToPage(pageId, label, token) {
  try {
    const response = await requestConfluence(
      route`/wiki/api/v2/pages/${pageId}/labels`,
      { 
        method: 'POST',
        body: JSON.stringify([{ prefix: 'global', name: label }])
      }
    );

    if (!response.ok) {
      console.warn(`Failed to add label ${label}: ${response.statusText}`);
    }
  } catch (error) {
    console.error(`Error adding label ${label}:`, error);
  }
}
```

---

## Pattern 3: Page Analytics Dashboard Gadget

### Use Case
Display page view statistics and analytics as a dashboard gadget.

```yaml
# manifest.yml
modules:
  confluence:dashboardGadget:
    - key: page-analytics-gadget
      resource: main
      title: Page Analytics
      description: Show page view statistics
      
  resource:
    - key: main
      path: src/dashboard/analytics.jsx
```

```javascript
// src/dashboard/analytics.jsx
import React, { useEffect, useState } from 'react';
import { route } from '@forge/api';
import { requestConfluence } from '@forge/bridge';
import Card from '@atlaskit/card';

export default function PageAnalytics() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadAnalytics() {
      try {
        // Get current page context from route
        const { content } = await requestConfluence(route`/wiki/api/v2/pages/${AP.context.getPageId()}`);
        
        setStats({
          title: content.title,
          views: content.views?.count || 0,
          lastViewed: content.views?.lastDate
        });
      } catch (error) {
        console.error('Failed to load analytics:', error);
      } finally {
        setLoading(false);
      }
    }

    if (AP.context.getPageId) {
      loadAnalytics();
    }
  }, []);

  if (loading) {
    return (
      <Card>
        <p>Loading analytics...</p>
      </Card>
    );
  }

  if (!stats) {
    return (
      <Card appearance="critical">
        <p>Unable to load page statistics</p>
      </Card>
    );
  }

  return (
    <div className="analytics-widget">
      <h3>{stats.title}</h3>
      <div className="stat-grid">
        <div className="stat-item">
          <span className="stat-label">Total Views</span>
          <span className="stat-value">{stats.views}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Last Viewed</span>
          <span className="stat-value">
            {new Date(stats.lastViewed).toLocaleDateString()}
          </span>
        </div>
      </div>
    </div>
  );
}
```

---

## Pattern 4: Content Template Selector

### Use Case
Allow users to select a template when creating new pages in a specific space.

```yaml
# manifest.yml
modules:
  confluence:contentAction:
    - key: template-selector
      resource: main
      title: Apply Template
      icon: template-icon.png
      displayConditions:
        pageTypes:
          - page
```

```javascript
// src/content-action/template-selector.js
import React, { useState } from 'react';
import { route } from '@forge/api';
import { requestConfluence, AP } from '@forge/bridge';

export default function TemplateSelector() {
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadTemplates() {
      try {
        // Get templates from space settings
        const response = await requestConfluence(
          route`/wiki/api/v2/spaces/${AP.context.getSpaceKey()}/content/template`
        );

        if (response.ok) {
          const data = await response.json();
          setTemplates(data.results || []);
        }
      } catch (error) {
        console.error('Failed to load templates:', error);
      } finally {
        setLoading(false);
      }
    }

    loadTemplates();
  }, []);

  async function applyTemplate() {
    if (!selectedTemplate) return;

    try {
      await requestConfluence(
        route`/wiki/api/v2/pages/${AP.context.getPageId()}?bodyFormat=storage`,
        { 
          method: 'PUT',
          body: JSON.stringify({
            title: AP.context.getPageTitle(),
            body: {
              storage: {
                value: selectedTemplate.body,
                representation: 'storage'
              }
            }
          })
        }
      );

      // Refresh the page to show template content
      window.location.reload();
    } catch (error) {
      console.error('Failed to apply template:', error);
    }
  }

  if (loading) return <div>Loading templates...</div>;

  return (
    <div className="template-selector">
      <h4>Apply Template</h4>
      <select 
        value={selectedTemplate?.id || ''} 
        onChange={(e) => {
          const template = templates.find(t => t.id === e.target.value);
          setSelectedTemplate(template);
        }}
      >
        <option value="">Select a template...</option>
        {templates.map(template => (
          <option key={template.id} value={template.id}>
            {template.title}
          </option>
        ))}
      </select>
      
      {selectedTemplate && (
        <button onClick={applyTemplate}>
          Apply Template
        </button>
      )}
    </div>
  );
}
```

---

## Pattern 5: Page Status Monitor

### Use Case
Monitor page status changes and notify team when pages are deleted or archived.

```javascript
// src/webhooks/page-status.js
import { route } from '@forge/api';
import { requestConfluence } from '@forge/bridge';

export default async function handler(req, res) {
  const { event, data } = req.body;

  try {
    if (event === 'confluence:page:deleted') {
      await notifyPageDeleted(data);
    } else if (event === 'confluence:page:updated') {
      // Check for status changes
      await checkStatusChange(data);
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Failed to process page event:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
}

async function notifyPageDeleted(pageData) {
  const { content, space } = pageData;

  // Send notification to Slack/Teams
  await fetch('https://hooks.slack.com/services/YOUR-WEBHOOK', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: `Page deleted: ${content.title}`,
      blocks: [
        {
          type: 'section',
          text: { 
            type: 'mrkdwn',
            text: `*Page deleted:* <https://your-domain.atlassian.net/wiki/spaces/${space.key}/pages/${content.id}|${content.title}>`
          }
        },
        {
          type: 'context',
          elements: [{ 
            type: 'mrkdwn', 
            text: `Space: ${space.name} (${space.key})` 
          }]
        }
      ]
    })
  });

  // Also store in a tracking page for audit
  await logDeletedPage(content, space);
}

async function checkStatusChange(pageData) {
  const { content } = pageData;

  // Check if page was archived (status changed to 'archived')
  if (content.status === 'archived') {
    await notifyPageArchived(content);
  }
}

async function logDeletedPage(content, space) {
  // Create a log entry in a special tracking page
  const logEntry = `
    <h3>Page Deleted</h3>
    <p><strong>Title:</strong> ${content.title}</p>
    <p><strong>ID:</strong> ${content.id}</p>
    <p><strong>Space:</strong> ${space.name} (${space.key})</p>
    <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
  `;

  // Append to log page (create or update)
  await appendToLogPage(logEntry);
}

async function appendToLogPage(content) {
  const LOG_PAGE_ID = '123456789'; // Your tracking page ID
  
  // Get current content
  const response = await requestConfluence(
    route`/wiki/api/v2/pages/${LOG_PAGE_ID}?bodyFormat=storage`
  );

  if (!response.ok) return;

  const page = await response.json();
  const currentContent = page.body.storage.value || '';

  // Append new entry
  const updatedContent = `${currentContent}${content}`;

  await requestConfluence(
    route`/wiki/api/v2/pages/${LOG_PAGE_ID}`,
    { 
      method: 'PUT',
      body: JSON.stringify({
        title: page.title,
        body: {
          storage: {
            value: updatedContent,
            representation: 'storage'
          }
        },
        version: { number: page.version.number + 1 }
      })
    }
  );
}
```

---

## Pattern 6: Bulk Page Export

### Use Case
Allow users to export multiple pages as a single PDF or HTML archive.

```javascript
// src/content-action/bulk-export.js
import React, { useState } from 'react';
import { route } from '@forge/api';
import { requestConfluence, AP } from '@forge/bridge';
import Button from '@atlaskit/button';

export default function BulkExport() {
  const [isExporting, setIsExporting] = useState(false);

  async function exportSelectedPages() {
    setIsExporting(true);

    try {
      // Get selected pages (from custom UI state or context)
      const pageIds = getSelectedPageIds(); // Your implementation
      
      const pages = [];
      
      // Fetch all pages
      for (const id of pageIds) {
        const response = await requestConfluence(
          route`/wiki/api/v2/pages/${id}?bodyFormat=storage`
        );

        if (response.ok) {
          pages.push(await response.json());
        }
      }

      // Export as HTML archive
      await exportToHTML(pages);
      
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsExporting(false);
    }
  }

  async function exportToHTML(pages) {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Confluence Export - ${pages.length} Pages</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            .page { page-break-inside: avoid; margin-bottom: 40px; }
            h1 { color: #172B4D; border-bottom: 2px solid #172B4D; padding-bottom: 10px; }
          </style>
        </head>
        <body>
          ${pages.map(page => `
            <div class="page">
              <h1>${escapeHtml(page.title)}</h1>
              <p><em>Page ID: ${page.id} | Last modified: ${new Date(page.lastModified).toLocaleDateString()}</em></p>
              ${page.body.storage.value}
            </div>
          `).join('')}
        </body>
      </html>
    `;

    // Send to backend for PDF generation or direct download
    const response = await fetch('https://your-backend.com/api/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pages: pages.map(p => ({
          id: p.id,
          title: p.title,
          content: p.body.storage.value
        }))
      })
    });

    if (response.ok) {
      // Download the generated file
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `confluence-export-${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  }

  function escapeHtml(text) {
    const map = { '&': '&', '<': '<', '>': '>', '"': '"' };
    return text.replace(/[&<>"']/g, char => map[char]);
  }

  return (
    <Button 
      onClick={exportSelectedPages}
      isLoading={isExporting}
      disabled={isExporting || !hasSelection()}
    >
      Export Selected Pages
    </Button>
  );
}

function getSelectedPageIds() {
  // Your implementation to get selected pages from UI state
  return [];
}

function hasSelection() {
  // Check if any pages are selected
  return false; // Your implementation
}
```

---

## Pattern 7: Content Governance Workflow

### Use Case
Implement a content governance workflow where pages require approval before being published.

```yaml
# manifest.yml
modules:
  webhook:
    - destination: page-approval-handler
      event: confluence:page:updated
      
  function.scheduled:
    - key: approval-reminder
      resource: approval-reminder
      schedule: '0 9 * * MON-FRI'  # Every weekday at 9 AM
      
  resource:
    - key: main
      path: src/main.jsx
```

```javascript
// src/webhooks/page-approval.js
import { route } from '@forge/api';
import { requestConfluence } from '@forge/bridge';

export default async function handler(req, res) {
  const { event, data } = req.body;

  try {
    if (event === 'confluence:page:updated') {
      await checkApprovalStatus(data);
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Failed to process page update:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
}

async function checkApprovalStatus(pageData) {
  const { content, space } = pageData;

  // Only check pages in specific spaces
  if (!['DOCS', 'TECH'].includes(space.key)) return;

  // Check if page has approval label
  if (!content.labels?.some(l => l.name === 'pending-approval')) return;

  const { content: currentPage } = await requestConfluence(
    route`/wiki/api/v2/pages/${content.id}`
  );

  // If status is 'current', mark as approved
  if (currentPage.status === 'current') {
    await markAsApproved(content.id, pageData.token);
  }
}

async function markAsApproved(pageId, token) {
  // Remove pending approval label and add approved label
  await requestConfluence(
    route`/wiki/api/v2/pages/${pageId}/labels`,
    { 
      method: 'POST',
      body: JSON.stringify([
        { prefix: 'global', name: 'approved' }
      ])
    }
  );
}
```

---

## Pattern 8: Page Health Check

### Use Case
Monitor page health metrics like age, size, and activity.

```javascript
// src/content-action/page-health.js
import React, { useState, useEffect } from 'react';
import { route } from '@forge/api';
import { requestConfluence, AP } from '@forge/bridge';
import Card from '@atlaskit/card';

export default function PageHealth() {
  const [health, setHealth] = useState(null);

  useEffect(() => {
    async function checkHealth() {
      try {
        const pageId = AP.context.getPageId();
        
        // Get page details
        const response = await requestConfluence(
          route`/wiki/api/v2/pages/${pageId}`
        );

        if (response.ok) {
          const page = await response.json();
          setHealth(calculateHealth(page));
        }
      } catch (error) {
        console.error('Failed to check page health:', error);
      }
    }

    checkHealth();
  }, []);

  return (
    <Card>
      <h4>Page Health</h4>
      
      {health && (
        <div className="health-indicators">
          <Indicator 
            label="Age" 
            value={health.age} 
            status={health.ageStatus}
          />
          <Indicator 
            label="Size" 
            value={`${health.wordCount} words`} 
            status={health.sizeStatus}
          />
          <Indicator 
            label="Activity" 
            value={health.lastActivity} 
            status={health.activityStatus}
          />
        </div>
      )}
    </Card>
  );
}

function calculateHealth(page) {
  const now = new Date();
  const created = new Date(page.created);
  const lastModified = new Date(page.lastModified);
  
  // Calculate age in days
  const ageInDays = Math.floor((now - created) / (1000 * 60 * 60 * 24));
  
  // Word count estimate (simplified)
  const wordCount = (page.body?.storage?.value.match(/\b\w+\b/g) || []).length;
  
  // Last activity
  const daysSinceActivity = Math.floor((now - lastModified) / (1000 * 60 * 60 * 24));

  return {
    age: `${ageInDays} days`,
    ageStatus: ageInDays < 30 ? 'good' : ageInDays < 90 ? 'warning' : 'critical',
    wordCount,
    sizeStatus: wordCount > 1000 ? 'good' : wordCount > 500 ? 'warning' : 'critical',
    lastActivity: `${daysSinceActivity} days ago`,
    activityStatus: daysSinceActivity < 30 ? 'good' : daysSinceActivity < 90 ? 'warning' : 'critical'
  };
}

function Indicator({ label, value, status }) {
  const colors = { good: '#54A276', warning: '#FEC10E', critical: '#C23B28' };

  return (
    <div className="health-indicator">
      <span className="label">{label}</span>
      <span 
        className="value" 
        style={{ color: colors[status], fontWeight: 'bold' }}
      >
        {value}
      </span>
    </div>
  );
}
```

---

## Pattern 9: Page Migration Assistant

### Use Case
Help users migrate pages between spaces.

```javascript
// src/content-action/migrate-page.js
import React, { useState } from 'react';
import { route } from '@forge/api';
import { requestConfluence, AP } from '@forge/bridge';
import Card from '@atlaskit/card';

export default function MigratePage() {
  const [targetSpace, setTargetSpace] = useState('');
  const [spaces, setSpaces] = useState([]);
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationComplete, setMigrationComplete] = useState(false);

  useEffect(() => {
    async function loadSpaces() {
      try {
        const response = await requestConfluence(route`/wiki/api/v2/spaces`);
        
        if (response.ok) {
          const data = await response.json();
          setSpaces(data.results || []);
        }
      } catch (error) {
        console.error('Failed to load spaces:', error);
      }
    }

    loadSpaces();
  }, []);

  async function migratePage() {
    setIsMigrating(true);

    try {
      const pageId = AP.context.getPageId();
      
      // Get current page content
      const response = await requestConfluence(
        route`/wiki/api/v2/pages/${pageId}?bodyFormat=storage`
      );

      if (!response.ok) throw new Error('Failed to fetch page');

      const page = await response.json();

      // Create new page in target space
      const createResponse = await requestConfluence(
        route`/wiki/api/v2/pages`,
        {
          method: 'POST',
          body: JSON.stringify({
            type: 'page',
            title: `${page.title} (Migrated)`,
            space: { key: targetSpace },
            body: page.body
          })
        }
      );

      if (!createResponse.ok) throw new Error('Failed to create page in target space');

      const newPage = await createResponse.json();

      // Mark original as migrated
      await requestConfluence(
        route`/wiki/api/v2/pages/${pageId}/properties/migrationStatus`,
        {
          method: 'PUT',
          body: JSON.stringify({
            key: 'migrationStatus',
            value: JSON.stringify({
              migratedTo: targetSpace,
              newPageId: newPage.id,
              timestamp: new Date().toISOString()
            })
          })
        }
      );

      setMigrationComplete(true);

    } catch (error) {
      console.error('Migration failed:', error);
      alert(`Migration failed: ${error.message}`);
    } finally {
      setIsMigrating(false);
    }
  }

  if (migrationComplete) {
    return (
      <Card appearance="success">
        <h4>Page Migrated!</h4>
        <p>The page has been successfully migrated to the target space.</p>
      </Card>
    );
  }

  return (
    <Card>
      <h4>Migrate Page</h4>
      <select 
        value={targetSpace}
        onChange={(e) => setTargetSpace(e.target.value)}
      >
        <option value="">Select target space...</option>
        {spaces.map(space => (
          <option key={space.id} value={space.key}>
            {space.name} ({space.key})
          </option>
        ))}
      </select>

      <button 
        onClick={migratePage}
        disabled={!targetSpace || isMigrating}
      >
        {isMigrating ? 'Migrating...' : 'Migrate to Space'}
      </button>
    </Card>
  );
}
```

---

## Pattern 10: Automated Content Review

### Use Case
Automatically flag pages that need review based on age or content patterns.

```javascript
// src/scheduled/content-review.js
import { route } from '@forge/api';
import { requestConfluence } from '@forge/bridge';

export default async function handler() {
  try {
    // Find pages older than 90 days in specific spaces
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    
    const response = await requestConfluence(
      route`/wiki/api/v2/search?cql=type=page%20AND%20lastModified<${threeMonthsAgo.toISOString()}%20AND%20space in (DOCS,TECH)`
    );

    if (!response.ok) {
      throw new Error('Failed to search for pages');
    }

    const data = await response.json();
    
    // Flag pages for review
    for (const page of data.results || []) {
      await flagForReview(page.id);
    }

  } catch (error) {
    console.error('Content review failed:', error);
  }
}

async function flagForReview(pageId) {
  const now = new Date().toISOString();
  
  // Add review label and update properties
  await requestConfluence(
    route`/wiki/api/v2/pages/${pageId}/labels`,
    { 
      method: 'POST',
      body: JSON.stringify([
        { prefix: 'global', name: 'needs-review' },
        { prefix: 'global', name: `review-${new Date().getFullYear()}` }
      ])
    }
  );

  // Update content properties with review timestamp
  await requestConfluence(
    route`/wiki/api/v2/pages/${pageId}/properties/reviewStatus`,
    {
      method: 'PUT',
      body: JSON.stringify({
        key: 'reviewStatus',
        value: JSON.stringify({
          flaggedDate: now,
          status: 'pending'
        })
      })
    }
  );
}
```

---

## Testing Patterns

### Test Webhook Handlers

```javascript
// jest.config.js
module.exports = {
  testEnvironment: 'node',
  transform: { '^.+\\.jsx?$': 'babel-jest' },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js']
};

// src/__tests__/page-created.test.js
import handler from '../webhooks/page-created';

describe('Page Created Webhook', () => {
  it('should sync page to external system', async () => {
    const mockData = {
      event: 'confluence:page:created',
      data: {
        content: { id: '123', title: 'Test Page' },
        space: { key: 'TEST' }
      }
    };

    // Mock the requestConfluence function
    jest.mock('@forge/bridge', () => ({
      requestConfluence: jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: '123', title: 'Test Page' })
      })
    }));

    const req = { body: mockData };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });
});
```

### Test Custom UI Components

```javascript
// src/__tests__/PageAnalytics.test.jsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import PageAnalytics from '../dashboard/analytics';

describe('Page Analytics', () => {
  it('should display loading state initially', () => {
    // Mock the AP context and requestConfluence
    jest.spyOn(AP.context, 'getPageId').mockReturnValue('123');
    
    render(<PageAnalytics />);
    
    expect(screen.getByText(/Loading analytics/i)).toBeInTheDocument();
  });
});
```

---

## Best Practices

### 1. Use Content Properties for State Tracking

```javascript
// Store sync status with content
await requestConfluence(
  route`/wiki/api/v2/pages/${pageId}/properties/syncStatus`,
  { method: 'PUT', body: JSON.stringify({ key: 'syncStatus', value: ... }) }
);
```

### 2. Implement Exponential Backoff for Rate Limits

```javascript
async function fetchWithRetry(url, options = {}, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    const response = await requestConfluence(route`${url}`, options);
    
    if (response.status !== 429) return response;
    
    const delay = Math.pow(2, i) * 1000;
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  
  throw new Error('Rate limit exceeded');
}
```

### 3. Handle Errors Gracefully

```javascript
async function safeApiCall(apiFn, fallbackValue = null) {
  try {
    return await apiFn();
  } catch (error) {
    console.error('API call failed:', error);
    return fallbackValue;
  }
}

// Usage
const pageData = await safeApiCall(() => requestConfluence(route`/wiki/api/v2/pages/${id}`));
```

### 4. Use Scheduled Triggers as Fallback

Webhooks can miss events. Always have a scheduled reconciliation job:

```javascript
export default async function handler() {
  const lastSyncTime = await getLastSyncTimestamp();
  
  // Find pages that might have been missed
  const response = await requestConfluence(
    route`/wiki/api/v2/search?cql=type=page%20AND%20lastModified>${lastSyncTime}`
  );

  if (response.ok) {
    for (const page of response.results || []) {
      // Check sync status and process if needed
    }
  }
}
```

---

## Summary

This document provides practical patterns for common Confluence Forge app use cases:

1. **Sync Pages** - Keep external systems in sync
2. **Auto-labeling** - Add metadata automatically
3. **Analytics Dashboard** - Display page statistics
4. **Templates** - Apply content templates
5. **Status Monitoring** - Track page lifecycle events
6. **Bulk Export** - Export multiple pages at once
7. **Governance** - Implement approval workflows
8. **Health Checks** - Monitor page quality metrics
9. **Migration** - Move pages between spaces
10. **Review Automation** - Flag content for review

Each pattern follows best practices for error handling, rate limiting, and data storage using Confluence's REST API v2.