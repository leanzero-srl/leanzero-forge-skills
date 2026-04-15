# Atlassian Confluence REST API v2 Skill

This skill provides comprehensive guidance for integrating with Confluence Cloud using the REST API v2.

## What's New (March 2026)

### New Documentation Added

| Document | Description |
|----------|-------------|
| `docs/09-labels-management.md` | Complete guide for working with content labels - add, remove, toggle, bulk operations, and status tracking |
| `docs/10-user-permissions.md` | User info retrieval, permission checking (view/edit/delete/comment), group membership verification, and API examples |
| `docs/11-version-history.md` | Version history management, comparing versions, restoring previous versions, and version diff views |

## Existing Documentation

- [Core Concepts](docs/01-core-concepts.md) - API fundamentals, authentication, error handling
- [Pages API](docs/02-page-custom-ui.md) - CRUD operations for pages
- [Blog Posts API](docs/04-blogpost-custom-ui.md) - Working with blog posts
- [Dashboard Widgets API](docs/05-dashboard-widgets.md) - Dashboard gadget endpoints
- [Content Properties API](docs/06-content-properties.md) - Store data with Confluence content
- [Webhooks & Events API](docs/07-webhooks-events.md) - Handle Confluence webhooks and events

## Quick Start

1. **Get your API credentials**: Create an app at https://developer.atlassian.com/console/myapps/
2. **Obtain OAuth token**: Use 3LO flow or JWT
3. **Make your first request**:

```bash
curl -H "Authorization: Bearer <token>" \
  https://{your-domain}.atlassian.net/wiki/api/v2/pages/123456
```

## Key Concepts

### API Base URL

All endpoints are prefixed with:
```
https://{your-domain}.atlassian.net/wiki/api/v2
```

### Authentication

| Method | Use Case |
|--------|----------|
| OAuth 2.0 (3LO) | Production apps with user consent |
| JWT | Server-to-server authentication |
| Personal Access Token | Development/testing only |

### Common Endpoints

| Task | Endpoint | Method |
|------|----------|--------|
| Get page | `/wiki/api/v2/pages/{pageId}` | GET |
| Create page | `/wiki/api/v2/pages` | POST |
| Update page | `/wiki/api/v2/pages/{pageId}` | PUT |
| Delete page | `/wiki/api/v2/pages/{pageId}` | DELETE |
| Search content | `/wiki/api/v2/pages/search` | GET |

## Available Templates

| Template | Description |
|----------|-------------|
| `page-custom-ui.yml` | REST API call patterns for page operations |
| `webhook-handler.yml` | Webhook event handling configuration |
| `scheduled-trigger.yml` | Scheduled API tasks |
| `content-property-storage.yml` | Content properties API |

## Additional Resources

- [Atlassian Confluence REST API v2](https://developer.atlassian.com/cloud/confluence/rest/v2/)
- [Confluence Query Language (CQL)](https://developer.atlassian.com/cloud/confluence/advanced-searching-using-cql/)
- [Forge Documentation](https://developer.atlassian.com/cloud/forge/) - For Confluence app development

## Support

For issues with this skill, please check the existing documentation or refer to the Atlassian developer forums.
