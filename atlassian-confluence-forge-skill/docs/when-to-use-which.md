# Which Module Should I Use? - Confluence Forge Decision Guide

This guide helps you choose the right Forge module for your Confluence app use case.

---

## Quick Decision Tree

```
What do you need to build?
│
├── Add UI to a page? 
│   └── → [Page Custom UI](02-page-custom-ui.md)
│
├── Configure app for an entire space?
│   └── → [Space Settings](03-space-settings.md)
│
├── React when pages are created/updated?
│   └── → [Webhook Handler](../templates/webhook-handler.yml)
│       │
│       ├── Need periodic sync as backup?
│       │   └── Add [Scheduled Trigger](09-scheduled-triggers.md)
│       │
│       └── Need to display data on dashboard?
│           └── Also add [Dashboard Gadget](05-dashboard-widgets.md)
│
├── Store data with a page?
│   └── → [Content Properties](06-content-properties.md)
│
└── Run background tasks periodically?
    └── → [Scheduled Trigger](09-scheduled-triggers.md)
```

---

## Module Comparison Matrix

| Use Case | Page Custom UI | Space Settings | Webhook | Scheduled | Dashboard Gadget |
|----------|---------------|----------------|---------|-----------|------------------|
| Display data on page | ✅ Primary | ❌ No | ❌ No | ❌ No | ⚠️ Alternative |
| Configure app settings | ⚠️ Per-page | ✅ Primary | ❌ No | ❌ No | ❌ No |
| React to page creation | ❌ No | ❌ No | ✅ Real-time | ⚠️ Polling | ❌ No |
| Periodic background sync | ❌ No | ❌ No | ⚠️ With webhook | ✅ Primary | ❌ No |
| Show data in dashboard | ❌ No | ❌ No | ❌ No | ⚠️ With data source | ✅ Primary |
| Space-wide defaults | ❌ No | ✅ Primary | ❌ No | ⚠️ Possible | ❌ No |

---

## Common Combinations

### Pattern 1: Page Sync App (Most Common)

```yaml
# When you need to sync page content to an external system:

modules:
  # Display sync status on each page
  confluence:pageBanner:
    - key: sync-status-extension
      resource: page-ui

  # React immediately when pages change
  webhook:
    - destination: page-sync-handler
      event: confluence:page:created
      filter: contains(data.content.labels, 'sync')
      
  # Reconcile missed events every 6 hours  
  function.scheduled:
    - key: reconciliation-scheduler
      resource: sync-reconciliation
      
  resources:
    - key: page-ui
      path: src/page-ui.jsx
    - key: page-sync-handler
      path: src/webhooks/sync.js
```

**Why this combination?**
- Page Custom UI shows real-time status to users
- Webhook handles immediate sync on changes
- Scheduled trigger catches any missed webhooks

---

### Pattern 2: Space Configuration App

```yaml
# When app needs space-level configuration with per-page overrides:

modules:
  # Admin configures app at space level
  confluence:spaceSettings:
    - key: my-app-settings
      resource: settings

  # Pages inherit space defaults + can override
  confluence:pageBanner:
    - key: page-extension
      resource: page-ui

  resources:
    - key: settings
      path: src/space-settings.jsx
    - key: page-ui  
      path: src/page-ui.jsx
```

**Why this combination?**
- Space Settings for admin configuration (space admins only)
- Page Custom UI shows configured behavior to all users
- Store defaults in space properties, overrides in page properties

---

### Pattern 3: Content Monitoring & Alerts

```yaml
# When you need to monitor pages and send alerts:

modules:
  # Real-time detection of changes
  webhook:
    - destination: alert-handler
      event: confluence:page:updated
      filter: contains(data.content.labels, 'alert-on-change')
      
  # Periodic check for pages needing attention  
  function.scheduled:
    - key: monitoring-scheduler
      resource: monitor-pages
      
  resources:
    - key: alert-handler
      path: src/webhooks/alerts.js
    - key: monitor-pages
      path: src/scheduled/monitoring.js
```

**Why this combination?**
- Webhook for immediate alert on relevant changes
- Scheduled trigger to check pages without labels that need monitoring

---

## Module Details

### Page Custom UI

**Choose when:**
- Need to display data within a Confluence page
- Want user interaction (buttons, forms) on a page
- Display page-specific information

**Don't use when:**
- Only need space-level configuration
- Just running background tasks (no UI needed)
- Need to react to events without user interaction

---

### Space Settings

**Choose when:**
- App needs configuration at space level
- Admin-only settings for a space
- Default values that apply to all pages in space

**Don't use when:**
- Configuration is page-specific
- Non-admin users need to configure the app
- You just need to display data (use Page Custom UI instead)

---

### Webhook

**Choose when:**
- Need real-time reaction to content changes
- Syncing data immediately after creation/update
- Triggering external processes on Confluence events

**Don't use when:**
- Polling is acceptable (webhooks may be missed)
- No event-driven action needed
- You just need scheduled periodic tasks

---

### Scheduled Trigger

**Choose when:**
- Running periodic background jobs
- Need reconciliation for missed webhook events
- Cleanup old data on schedule
- Batch processing of multiple items

**Don't use when:**
- Real-time response is required (use webhooks)
- Task should only run once (use function instead)

---

### Dashboard Gadget

**Choose when:**
- Displaying aggregated data in Confluence dashboards
- Creating widgets for space dashboards
- Showing metrics and summaries

**Don't use when:**
- Data needs to appear on regular pages (use Page Custom UI)
- Only need configuration interface (use Space Settings)

---

## Permissions Required by Module

| Module | Minimum Scopes |
|--------|----------------|
| Page Custom UI (read-only) | `read:confluence-content:*` |
| Page Custom UI (write) | `write:confluence-content:*` |
| Space Settings | `admin:confluence-space:*` |
| Webhook (page events) | `read:confluence-content:*` |
| Scheduled (search pages) | `read:confluence-content:*` |

---

## Next Steps

Once you've chosen your module combination:
1. Review the specific implementation guide for each module
2. Use the corresponding template from `/templates/`
3. Check [Problem Patterns](problem-patterns.md) for common use cases