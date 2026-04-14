# Confluence REST API v2 Reference

This documentation provides a comprehensive technical reference for the Confluence Cloud REST API v2, specifically tailored for developers building Atlassian Forge applications.

## API Modules

Explore the following modules to find detailed specifications for different functional areas of Confluence.

### Core Content
- [Pages](./pages.md): Manage pages and their lifecycle.
- [Blog Posts](./blog_posts.md): Create and manage blog posts.
- [Spaces](./spaces.md): Organize content into spaces.
- [Labels](./labels.md): Manage content labels for categorization.
- [Attachments](./attachments.md): Handle file attachments to content.
- [Comments](./comments.md): Manage comments on pages and blog posts.

### Organization & Metadata
- [App Properties](./app_properties.md): Store application-specific metadata.
- [Content Properties](./content_properties.md): Manage properties attached to specific content items.
- [Folders](./folders.md): Organize content using a hierarchical folder structure.
- [Whiteboards](./whiteboards.md): Manage collaborative whiteboards.
- [Databases](./databases.md): Interact with structured databases within Confluence.

### Users & Security
- [Users](./users.md): Retrieve and manage user information.
- [Webhooks](./webhooks.md): Configure and handle real-time event notifications.
- [Classification Levels](./classification_levels.md): Manage data classification for DLP.
- [Data Policies](./data_policies.md): Discover and interact with workspace data policies.

### Advanced Features
- [Embeds](./embeds.md): Manage Smart Links and content tree hierarchy.
- [Tasks](./tasks.md): Manage actionable tasks within content.

---

## Best Practices & Patterns

For guidance on implementing robust Forge applications, including webhook handling, pagination, and rate limiting, please refer to the [Usage Patterns & Best Practices](./usage-patterns.md) guide.

> [!TIP]
> Always ensure your Forge app has the necessary OAuth scopes defined in your `manifest.yml` to access these endpoints.