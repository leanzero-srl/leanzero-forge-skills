# Real-World Patterns: Confluence Forge Apps

Practical examples of common Confluence Forge app patterns using verified APIs and correct module types.

---

## Pattern 1: Sync Pages to External System

### Use Case
Keep an external database in sync with Confluence pages via event triggers + scheduled reconciliation.

### Manifest

```yaml
modules:
  trigger:
    - key: page-created-trigger
      function: pageSyncHandler
      events:
        - avi:confluence:created:page
    - key: page-updated-trigger
      function: pageSyncHandler
      events:
        - avi:confluence:updated:page

  scheduledTrigger:
    - key: sync-reconciliation
      function: reconcileHandler
      interval: hour

  function:
    - key: pageSyncHandler
      handler: src/triggers/page-sync.handler
    - key: reconcileHandler
      handler: src/scheduled/reconciliation.handler
      timeoutSeconds: 300
```

### Trigger Handler

```typescript
// src/triggers/page-sync.ts
import api, { route } from '@forge/api';

export const handler = async (event: any, context: any) => {
  const accountId = event.context?.principal?.accountId;

  try {
    const pageId = event.content?.id;
    if (!pageId) return;

    // Fetch full page details — Forge handles auth automatically
    const response = await api.asApp().requestConfluence(
      route`/wiki/api/v2/pages/${pageId}?body-format=storage`
    );

    if (!response.ok) {
      console.error(`Failed to fetch page ${pageId}: ${response.status}`);
      return;
    }

    const page = await response.json();

    // Send to external system (domain must be in permissions.external.fetch.backend)
    const syncResponse = await api.fetch('https://your-backend.com/api/sync/page', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        confluencePageId: page.id,
        title: page.title,
        content: page.body?.storage?.value,
        authorAccountId: accountId,
        lastModified: page.version?.createdAt
      })
    });

    if (!syncResponse.ok) {
      console.error('External sync failed:', syncResponse.status);
    }

    // Mark page as synced using content properties
    await api.asApp().requestConfluence(
      route`/wiki/api/v2/pages/${pageId}/properties`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: 'sync-status',
          value: { synced: true, timestamp: new Date().toISOString() }
        })
      }
    );
  } catch (error) {
    console.error('Page sync handler error:', error);
  }
};
```

---

## Pattern 2: Auto-Label New Pages

### Use Case
Automatically add labels to pages when created, based on their space.

```typescript
// src/triggers/auto-label.ts
import api, { route } from '@forge/api';

export const handler = async (event: any, context: any) => {
  const pageId = event.content?.id;
  const spaceKey = event.space?.key;

  if (!pageId || !spaceKey) return;

  const labels = [`space:${spaceKey}`, 'auto-labeled'];

  try {
    await api.asApp().requestConfluence(
      route`/wiki/api/v2/pages/${pageId}/labels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          labels.map(name => ({ prefix: 'global', name }))
        )
      }
    );

    console.log(`Labels added to page ${pageId}: ${labels.join(', ')}`);
  } catch (error) {
    console.error(`Failed to add labels to page ${pageId}:`, error);
  }
};
```

---

## Pattern 3: Page Analytics Dashboard Gadget

### Use Case
Display page statistics as a Confluence dashboard gadget.

```yaml
modules:
  confluence:dashboardGadget:
    - key: page-analytics-gadget
      resource: analyticsUI
      title: Page Analytics
      description: Show page statistics

resources:
  - key: analyticsUI
    path: static/analytics/build
```

```tsx
// static/analytics/src/App.tsx (Custom UI — uses @forge/bridge)
import React, { useEffect, useState } from 'react';
import { requestConfluence } from '@forge/bridge';

export default function PageAnalytics() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadAnalytics() {
      try {
        // requestConfluence is correct for Custom UI (frontend)
        const response = await requestConfluence('/wiki/api/v2/spaces?limit=10');

        if (response.ok) {
          const data = await response.json();
          setStats({ spaceCount: data.results?.length || 0 });
        }
      } catch (error) {
        console.error('Failed to load analytics:', error);
      } finally {
        setLoading(false);
      }
    }

    loadAnalytics();
  }, []);

  if (loading) return <p>Loading analytics...</p>;
  if (!stats) return <p>Unable to load statistics</p>;

  return (
    <div>
      <h3>Confluence Analytics</h3>
      <p>Spaces: {stats.spaceCount}</p>
    </div>
  );
}
```

---

## Pattern 4: Activity Tracker with Forge SQL

### Use Case
Track user activity across Confluence for reporting or license management.

### Manifest

```yaml
modules:
  trigger:
    - key: track-page-activity
      function: trackActivity
      events:
        - avi:confluence:created:page
    - key: track-edit-activity
      function: trackActivity
      events:
        - avi:confluence:updated:page
    - key: track-comment-activity
      function: trackActivity
      events:
        - avi:confluence:created:comment

  scheduledTrigger:
    - key: run-migrations
      function: runMigrations
      interval: day

  function:
    - key: trackActivity
      handler: src/triggers/track-activity.handler
    - key: runMigrations
      handler: src/migrations/runner.handler
```

### Migration Runner

```typescript
// src/migrations/runner.ts
import { migrationRunner } from '@forge/sql';

const CREATE_ACTIVITY_TABLE = `
  CREATE TABLE IF NOT EXISTS user_activity (
    account_id VARCHAR(128) PRIMARY KEY,
    display_name VARCHAR(255),
    last_active_at VARCHAR(30) NOT NULL,
    event_type VARCHAR(100),
    created_at VARCHAR(30) NOT NULL,
    updated_at VARCHAR(30) NOT NULL
  )
`;

export const handler = async () => {
  migrationRunner
    .enqueue('v001_create_activity_table', CREATE_ACTIVITY_TABLE);
  await migrationRunner.run();
};
```

### Activity Tracker

```typescript
// src/triggers/track-activity.ts
import { sql } from '@forge/sql';

export const handler = async (event: any, context: any) => {
  const accountId = event.context?.principal?.accountId;
  if (!accountId) return;

  const now = new Date().toISOString();
  const eventType = event.event || 'unknown';

  await sql
    .prepare(
      `INSERT INTO user_activity (account_id, last_active_at, event_type, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         last_active_at = VALUES(last_active_at),
         event_type = VALUES(event_type),
         updated_at = VALUES(updated_at)`
    )
    .bindParams(accountId, now, eventType, now, now)
    .execute();

  console.log(`Activity tracked for user ${accountId}: ${eventType}`);
};
```

---

## Pattern 5: Content Governance with Scheduled Review

### Use Case
Flag stale pages for review based on last modification date.

```typescript
// src/scheduled/content-review.ts
import api, { route } from '@forge/api';

export const handler = async (event: any, context: any) => {
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

  try {
    const response = await api.asApp().requestConfluence(
      route`/wiki/rest/api/search?cql=type=page AND lastModified<'${threeMonthsAgo.toISOString()}'&limit=50`
    );

    if (!response.ok) {
      console.error('Search failed:', response.status);
      return;
    }

    const data = await response.json();

    for (const result of data.results || []) {
      const pageId = result.content?.id;
      if (!pageId) continue;

      // Add review label
      await api.asApp().requestConfluence(
        route`/wiki/api/v2/pages/${pageId}/labels`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify([{ prefix: 'global', name: 'needs-review' }])
        }
      );

      console.log(`Flagged for review: ${result.content?.title}`);
    }
  } catch (error) {
    console.error('Content review failed:', error);
  }
};
```

---

## Pattern 6: Admin Settings Page with Configuration

### Use Case
Provide an admin settings page for app configuration using Forge Storage.

```yaml
modules:
  confluence:globalSettings:
    - key: app-settings
      resource: settingsUI
      resolver:
        function: settingsResolver
      title: My App Settings

  function:
    - key: settingsResolver
      handler: src/resolvers/settings.handler

resources:
  - key: settingsUI
    path: static/settings/build
```

### Resolver (Backend)

```typescript
// src/resolvers/settings.ts
import Resolver from '@forge/resolver';
import { storage } from '@forge/api';

const resolver = new Resolver();

resolver.define('getConfig', async () => {
  const config = await storage.get('appConfig') || {
    threshold: 60,
    enabled: true,
    excludedGroups: []
  };
  return config;
});

resolver.define('updateConfig', async ({ payload }) => {
  const { key, value } = payload;
  const config = await storage.get('appConfig') || {};
  config[key] = value;
  await storage.set('appConfig', config);
  return { success: true };
});

export const handler = resolver.getDefinitions();
```

### Settings UI (Frontend)

```tsx
// static/settings/src/App.tsx (Custom UI — uses @forge/bridge)
import React, { useEffect, useState } from 'react';
import { invoke } from '@forge/bridge';

export default function SettingsPage() {
  const [config, setConfig] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    invoke('getConfig').then(setConfig);
  }, []);

  const updateSetting = async (key: string, value: any) => {
    setSaving(true);
    await invoke('updateConfig', { key, value });
    setConfig((prev: any) => ({ ...prev, [key]: value }));
    setSaving(false);
  };

  if (!config) return <p>Loading settings...</p>;

  return (
    <div>
      <h2>App Configuration</h2>
      <label>
        Inactivity Threshold (days):
        <input
          type="number"
          value={config.threshold}
          onChange={(e) => updateSetting('threshold', parseInt(e.target.value))}
        />
      </label>
      <label>
        <input
          type="checkbox"
          checked={config.enabled}
          onChange={(e) => updateSetting('enabled', e.target.checked)}
        />
        Enable automatic processing
      </label>
      {saving && <p>Saving...</p>}
    </div>
  );
}
```

---

## Testing Patterns

### Unit Test for Trigger Handler

```typescript
// src/__tests__/track-activity.test.ts
import { handler } from '../triggers/track-activity';

// Mock @forge/sql
jest.mock('@forge/sql', () => ({
  sql: {
    prepare: jest.fn().mockReturnValue({
      bindParams: jest.fn().mockReturnValue({
        execute: jest.fn().mockResolvedValue({ rows: [] })
      })
    })
  }
}));

describe('trackActivity handler', () => {
  it('should upsert activity for valid event', async () => {
    const { sql } = require('@forge/sql');

    const event = {
      context: { principal: { accountId: 'user-123' } },
      event: 'avi:confluence:created:page'
    };

    await handler(event, {});

    expect(sql.prepare).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO user_activity')
    );
  });

  it('should skip events without accountId', async () => {
    const { sql } = require('@forge/sql');
    sql.prepare.mockClear();

    const event = { context: {}, event: 'avi:confluence:created:page' };

    await handler(event, {});

    expect(sql.prepare).not.toHaveBeenCalled();
  });
});
```

### Unit Test for Resolver

```typescript
// src/__tests__/settings-resolver.test.ts
jest.mock('@forge/api', () => ({
  storage: {
    get: jest.fn(),
    set: jest.fn()
  }
}));

import { storage } from '@forge/api';

describe('Settings Resolver', () => {
  it('should return default config when none exists', async () => {
    (storage.get as jest.Mock).mockResolvedValue(null);

    // Test your resolver logic here
  });
});
```

---

## Best Practices

### 1. Use Correct API for Backend vs Frontend

```typescript
// BACKEND (triggers, resolvers, scheduled triggers)
import api, { route } from '@forge/api';
const response = await api.asApp().requestConfluence(route`/wiki/api/v2/pages`);

// FRONTEND (Custom UI React components)
import { requestConfluence, invoke } from '@forge/bridge';
const response = await requestConfluence('/wiki/api/v2/pages');
const data = await invoke('resolverAction', { payload });
```

### 2. Exponential Backoff for Rate Limits

```typescript
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      if (error.status === 429 && i < maxRetries - 1) {
        await new Promise(r => setTimeout(r, Math.pow(2, i) * 1000));
        continue;
      }
      throw error;
    }
  }
  throw new Error('Max retries exceeded');
}
```

### 3. Forge SQL with Prepared Statements

```typescript
import { sql } from '@forge/sql';

// Always use prepared statements with bindParams
const result = await sql
  .prepare('SELECT * FROM user_activity WHERE account_id = ?')
  .bindParams(accountId)
  .execute();
```

### 4. Scheduled Triggers as Reconciliation

Event triggers can miss events. Always pair with a scheduled reconciliation job to catch gaps.

---

## Key Rules

- **Backend handlers** use `@forge/api` — NEVER `@forge/bridge`
- **Frontend Custom UI** uses `@forge/bridge` — NEVER `@forge/api`
- **Handler signature**: `(event, context)` — NOT Express `(req, res)`
- **Forge handles auth** — no manual Bearer tokens needed
- **Forge SQL**: use `sql.prepare().bindParams().execute()` — NOT `sql.execute()`
- **DDL migrations**: use `migrationRunner.enqueue()` + scheduled trigger
- **Scheduled triggers**: use `scheduledTrigger` with `interval` — NOT cron syntax
- **Event triggers**: use `trigger` with `function` + `events` — NOT `webhook` with `destination`
