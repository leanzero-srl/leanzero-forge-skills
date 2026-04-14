# Atlassian Confluence Forge Skill

This skill provides comprehensive guidance for developing Confluence apps using the Atlassian Forge platform.

## What's New (March 2026)

### New Templates Added

| Template | Description |
|----------|-------------|
| `blogpost-custom-ui.yml` | Custom UI modules for blog posts (banners and menu items) |
| `space-properties.yml` | Store app configuration at space level using Confluence Space Properties API |
| `content-macro.yml` | Create custom macros that can be inserted into page content |
| `page-hierarchy.yml` | Navigate parent-child relationships between pages with breadcrumbs, children list, and expandable trees |
| `attachment-management.yml` | Upload, download, list, and delete attachments on Confluence pages |

### New Documentation Added

| Document | Description |
|----------|-------------|
| `docs/09-labels-management.md` | Complete guide for working with content labels - add, remove, toggle, bulk operations, and status tracking |
| `docs/10-user-permissions.md` | User info retrieval, permission checking (view/edit/delete/comment), group membership verification, and UI components |
| `docs/11-version-history.md` | Version history management, comparing versions, restoring previous versions, and version diff views |

## Existing Documentation

- [Core Concepts](docs/01-core-concepts.md) - Forge architecture, development workflow, app structure
- [Page Custom UI](docs/02-page-custom-ui.md) - Building custom UI modules for pages
- [Space Settings](docs/03-space-settings.md) - Creating space settings configuration UIs
- [Blog Post Custom UI](docs/04-blogpost-custom-ui.md) - Custom UI for blog posts
- [Dashboard Widgets](docs/05-dashboard-widgets.md) - Building dashboard gadgets/widgets
- [Content Properties](docs/06-content-properties.md) - Store data with Confluence content
- [Webhooks & Events](docs/07-webhooks-events.md) - Handle Confluence webhooks and events
- [Problem Patterns](docs/problem-patterns.md) - Common issues and solutions

## Existing Templates

| Template | Description |
|----------|-------------|
| `content-property-storage.yml` | Store data with content using properties API |
| `page-custom-ui.yml` | Basic page custom UI module template |
| `scheduled-trigger.yml` | Run code on a schedule (cron jobs) |
| `webhook-handler.yml` | Handle Confluence webhooks |

## Skill Structure

```
.cline/skills/atlassian-confluence-forge-skill/
├── docs/                           # Documentation files
│   ├── 01-core-concepts.md        # Forge fundamentals
│   ├── 02-page-custom-ui.md       # Page UI modules
│   ├── 03-space-settings.md       # Space settings UI
│   ├── 04-blogpost-custom-ui.md   # Blog post UI
│   ├── 05-dashboard-widgets.md    # Dashboard widgets
│   ├── 06-content-properties.md   # Content properties API
│   ├── 07-webhooks-events.md      # Webhook handling
│   ├── 08-cli-commands.md         # Forge CLI reference
│   ├── 09-labels-management.md    # NEW: Labels API guide
│   ├── 10-user-permissions.md     # NEW: User & permission API guide
│   ├── 11-version-history.md      # NEW: Version history API guide
│   └── problem-patterns.md        # Common issues & solutions
├── templates/                      # Template files for common patterns
│   ├── content-property-storage.yml
│   ├── page-custom-ui.yml
│   ├── scheduled-trigger.yml
│   ├── webhook-handler.yml
│   ├── blogpost-custom-ui.yml     # NEW: Blog post UI template
│   ├── space-properties.yml       # NEW: Space properties API template
│   ├── content-macro.yml          # NEW: Content macro template
│   ├── page-hierarchy.yml         # NEW: Page hierarchy navigation template
│   └── attachment-management.yml  # NEW: Attachment management template
└── SKILL.md                        # Skill definition for Cline
```

## Quick Start

1. **Create a new Forge app**: `forge create -t hello-world confluence`
2. **Deploy your app**: `forge deploy`
3. **Install to site**: `forge install --force`

## Key Concepts

### Forge Modules

Forge uses modules to extend Confluence:

- `confluence:pageBanner` - Add UI to pages
- `confluence:contentAction` - Add menu items to content actions
- `confluence:spaceSettingsPage` - Add settings page for spaces
- `confluence:dashboardWidget` - Add dashboard gadgets
- `confluence:contentMacro` - Create custom macros

### API Access

Forge apps access Confluence APIs through the Bridge API:

```javascript
import { route, api } from '@forge/bridge';

const response = await api.requestConfluence(
  route`/wiki/api/v2/pages/${pageId}`
);
```

## Additional Resources

- [Atlassian Forge Documentation](https://developer.atlassian.com/cloud/forge/)
- [Confluence REST API Reference](https://developer.atlassian.com/cloud/confluence/rest/)
- [Forge CLI Reference](https://developer.atlassian.com/cloud/forge/cli/)

## Support

For issues with this skill, please check the existing documentation or refer to the Atlassian developer forums.