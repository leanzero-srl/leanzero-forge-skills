# Atlassian Confluence Forge Skill

A comprehensive skill for developing Atlassian apps on the Forge platform for Confluence Cloud. This skill provides guidance, patterns, templates, and best practices for building custom UI extensions, webhooks, scheduled triggers, and integrations with Confluence's REST API.

---

## Trigger Description

When you need to build an app or extension for **Confluence Cloud** using **Forge**, use this skill. It covers:

- **Custom UI**: Page extensions, blog post extensions, space settings, dashboard gadgets
- **Webhooks**: Handling Confluence events (page created/updated/deleted, blog posts, spaces)
- **Content Properties**: Storing app data tied to pages, blog posts, and other content types  
- **REST API Integration**: Using Confluence's v2 REST APIs for content management
- **Custom Content**: Creating custom content types in the content tree (new in v2)

---

## Quick Start

```yaml
# manifest.yml - Basic Forge app for Confluence
modules:
  confluence:pageCustomUi:
    - key: my-page-extension
      resource: main
      icon: icon.png
      title: My Extension Title
      
  webhook:
    - destination: page-webhook
      event: confluence:page:created
      
  resource:
    - key: main
      path: src/page-custom-ui.jsx
```

---

## Documentation Index

### Core Concepts & Setup
- [01-core-concepts.md](docs/01-core-concepts.md) - Forge fundamentals for Confluence
- [08-cli-commands.md](docs/08-cli-commands.md) - Forge CLI reference

### Custom UI Modules
- [02-page-custom-ui.md](docs/02-page-custom-ui.md) - Page extensions (most common)
- [03-space-settings.md](docs/03-space-settings.md) - Space configuration panels
- [04-blogpost-custom-ui.md](docs/04-blogpost-custom-ui.md) - Blog post extensions

### Content & Data
- [06-content-properties.md](docs/06-content-properties.md) - Storing data with content properties
- [08-api-endpoints.md](docs/08-api-endpoints.md) - Confluence REST API v2 reference
- [20-custom-content-api.md](docs/20-custom-content-api.md) - Custom Content module guide

### Automation & Events
- [07-webhooks-events.md](docs/07-webhooks-events.md) - Webhook events and payloads
- [09-scheduled-triggers.md](docs/09-scheduled-triggers.md) - Scheduled background tasks

### Dashboard & UI Components
- [05-dashboard-widgets.md](docs/05-dashboard-widgets.md) - Dashboard gadgets
- [13-ui-kit-components.md](docs/13-ui-kit-components.md) - Atlassian React components

### Advanced Patterns
- [11-resolver-patterns.md](docs/11-resolver-patterns.md) - Custom UI resolver patterns
- [12-performance-optimization.md](docs/12-performance-optimization.md) - Performance best practices
- [14-rate-limit-handling.md](docs/14-rate-limit-handling.md) - Rate limiting strategies

### Decision Guides
- [when-to-use-which.md](docs/when-to-use-which.md) - Which module type to use?
- [problem-patterns.md](docs/problem-patterns.md) - Common patterns with code examples

---

## Available Templates

| Template | Description | Use Case |
|----------|-------------|----------|
| `page-custom-ui.yml` | Page extension configuration | Add custom UI to pages |
| `space-settings.yml` | Space settings panel | Configure app for a space |
| `dashboard-gadget.yml` | Dashboard widget | Display data on dashboards |
| `webhook-handler.yml` | Webhook event handler | React to Confluence events |
| `scheduled-trigger.yml` | Scheduled background task | Periodic background processing |
| `content-property-storage.yml` | Content property patterns | Store app data with content |
| `custom-content-module.yml` | Custom content definition | Create custom content types |

---

## Key Differences from Jira Forge

| Feature | Jira Forge | Confluence Forge |
|---------|------------|------------------|
| **Workflow modules** | ✅ Validators, conditions, post-functions | ❌ No workflows |
| **Custom UI locations** | Workflow rules | Pages, Blog Posts, Space Settings |
| **Content types** | Issues, Comments | Pages, Blog Posts, Whiteboards, Databases |
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

## Support & Resources

- [Forge Documentation](https://developer.atlassian.com/cloud/forge/)
- [Confluence REST API v2](https://developer.atlassian.com/cloud/confluence/rest/v2/)
- [Atlassian Developer Community](https://community.developer.atlassian.com/)