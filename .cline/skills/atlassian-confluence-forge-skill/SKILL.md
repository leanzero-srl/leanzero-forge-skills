---
name: atlassian-confluence-forge-skill
description: Provides guidance, patterns, and templates for developing Atlassian apps on the Forge platform for Confluence Cloud. Use when building custom UI extensions, handling webhooks, setting up scheduled triggers, or integrating with Confluence's REST API.
---

# Atlassian Confluence Forge Skill

---

## Trigger Description

When you need to build an app or extension for **Confluence Cloud** using **Forge**, use this skill. It covers:

## Boundaries

**Use this skill when:**
- You are developing apps specifically for **Confluence Cloud**.
- You need to extend Confluence functionality using the Forge platform.
- You are working with Confluence-specific modules (pages, spaces, blog posts).

**Do NOT use this skill when:**
- You are developing for **Jira Cloud** (use `atlassian-jira-forge-skill` instead).
- You are building apps for Atlassian Connect or other platforms.
- You need to perform complex Jira workflow automations.

It covers:

- **Custom UI**: Page extensions, blog post extensions, space settings, dashboard gadgets
- **Webhooks**: Handling Confluence events (page created/updated/deleted, blog posts, spaces)
- **Content Properties**: Storing app data tied to pages, blog posts, and other content types  
- **REST API Integration**: Using Confluence's v2 REST APIs for content management
- **Custom Content**: Creating custom content types in the content tree (new in v2)
- **Scheduled Triggers**: Running periodic background tasks

---

## Quick Start

```yaml
# manifest.yml - Basic Forge app for Confluence
modules:
  # Use confluence:pageBanner instead of pageCustomUi (which doesn't exist)
  confluence:pageBanner:
    - key: my-page-banner
      resource: main
      icon: icon.png
      title: My Page Banner
      
  webhook:
    - destination: page-webhook
      event: confluence:page:created
      
  # For blog posts, use the same modules (confluence:pageBanner or confluence:contentAction)
  confluence:contentAction:
    - key: my-blog-action
      resource: main
      title: My Blog Action
      displayConditions:
        pageTypes:
          - blogpost

  resource:
    - key: main
      path: src/main.jsx
```

**Note**: Confluence Forge does NOT have `confluence:pageCustomUi` or `confluence:blogPostCustomUi` modules. Use:
- `confluence:pageBanner` for banners on pages and blog posts
- `confluence:contentAction` for menu items in "more actions" (•••)

---

## Documentation Index

### Core Concepts & Setup
- [01-core-concepts.md](docs/01-core-concepts.md) - Forge fundamentals for Confluence
- **[08-cli-commands.md](docs/08-cli-commands.md)** - Forge CLI reference (NEW)

### Custom UI Modules
- [02-page-custom-ui.md](docs/02-page-custom-ui.md) - Page extensions (most common)
- [03-space-settings.md](docs/03-space-settings.md) - Space configuration panels
- [04-blogpost-custom-ui.md](docs/04-blogpost-custom-ui.md) - Blog post extensions

### Content & Data
- [06-content-properties.md](docs/06-content-properties.md) - Storing data with content properties
- **[21-custom-content.md](docs/21-custom-content.md)** - Custom Content module guide (NEW)
- [08-api-endpoints.md](docs/08-api-endpoints.md) - Confluence REST API v2 reference

### Automation & Events
- [07-webhooks-events.md](docs/07-webhooks-events.md) - Webhook events and payloads
- [09-scheduled-triggers.md](docs/09-scheduled-triggers.md) - Scheduled background tasks

### Dashboard & UI Components
- [05-dashboard-widgets.md](docs/05-dashboard-widgets.md) - Dashboard gadgets

### Advanced Patterns & Best Practices
- **[24-real-world-patterns.md](docs/24-real-world-patterns.md)** - Real-world code examples (NEW)
- **[20-performance-optimization.md](docs/20-performance-optimization.md)** - Performance best practices (NEW)
- **[07-permissions-scopes.md](docs/07-permissions-scopes.md)** - OAuth scopes reference (NEW)

### Decision Guides
- [when-to-use-which.md](docs/when-to-use-which.md) - Which module type to use?
- [problem-patterns.md](docs/problem-patterns.md) - Common patterns with code examples

---

## Available Templates

| Template | Description | Use Case |
|----------|-------------|----------|
| `page-custom-ui.yml` | Page extension configuration | Add custom UI via pageBanner module |
| `space-settings.yml` | Space settings panel | Configure app for a space |
| `dashboard-gadget.yml` | Dashboard widget | Display data on dashboards |
| `webhook-handler.yml` | Webhook event handler | React to Confluence events |
| `scheduled-trigger.yml` | Scheduled background task | Periodic background processing |
| `content-property-storage.yml` | Content property patterns | Store app data with content |
| **`custom-content-module.yml`** | Custom content definition | Create custom content types (NEW) |
| **`content-byline-item.yml`** | Byline item module | Add metadata to page bylines (NEW) |
| **`remote-webhook-handler.yml`** | Remote webhook routing | Route events to external services (NEW) |

**Note**: Confluence Forge does NOT have `confluence:pageCustomUi` or `confluence:blogPostCustomUi` modules. Use:
- `confluence:pageBanner` for banners on pages and blog posts
- `confluence:contentAction` for menu items in "more actions" (•••)
- `confluence:contextMenu` for text selection context menus

---

## Key Differences from Jira Forge

| Feature | Jira Forge | Confluence Forge |
|---------|------------|------------------|
| **Workflow modules** | Validators, conditions, post-functions | No workflows |
| **Custom UI locations** | Workflow rules | Pages, Blog Posts, Space Settings |
| **Content types** | Issues, Comments | Pages, Blog Posts, Whiteboards |
| **Storage patterns** | Issue properties | Content Properties (per content type) |
| **Events** | Workflow transitions | Page/blogpost created/updated/deleted |

---

## Confluence REST API v2 Base URL

```
https://{your-domain}.atlassian.net/wiki/api/v2
```

Example: `https://mycompany.atlassian.net/wiki/api/v2/pages`

Authentication via OAuth 2.0 (3LO) or JWT from Forge.

---

## Common CLI Commands

```bash
# Initialize new app (use -t confluence flag)
forge init my-confluence-app -t confluence

# Deploy app
forge deploy

# Install on site
forge install --upgrade

# Start local tunnel for testing
forge tunnel

# View logs
forge logs -n 50

# Auto-fix manifest issues
forge lint --fix
```

**Important**: The Forge CLI auto-generates templates. Always verify the generated `manifest.yml` uses correct module types:
- Use `confluence:pageBanner` instead of non-existent `confluence:pageCustomUi`
- Use `confluence:contentAction` for menu items on pages/blogs

---

## Failure Strategies

When an error occurs during execution, follow these patterns:

- **Manifest/Module Errors**: If a module is not recognized, verify the `manifest.yml` against the [Documentation Index](#documentation-index) and ensure you are using the correct Confluence module names (e.g., `confluence:pageBanner`).
- **Permission Denied (403)**: Check if the required OAuth scopes are defined in the `permissions.scopes` section of your `manifest.yml`. Refer to [07-permissions-scopes.md](docs/07-permissions-scopes.md).
- **API Errors (4xx/5xx)**: 
  - For 404 errors, verify the resource ID (pageId, spaceId) exists.
  - For 429 (Rate Limit), implement exponential backoff.
- **Runtime Errors**: Use `forge logs` to inspect the error stack trace and ensure all required environment variables or dependencies are present.

## Gotchas

For common pitfalls and environment-specific facts, see [Gotchas](docs/gotchas.md).

## Support & Resources

- [Forge Documentation](https://developer.atlassian.com/cloud/forge/)
- [Confluence REST API v2](https://developer.atlassian.com/cloud/confluence/rest/v2/)
- [Atlassian Developer Community](https://community.developer.atlassian.com/)