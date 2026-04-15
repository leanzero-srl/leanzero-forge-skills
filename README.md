# LeanZero Forge Skills

A **skill** is a collection of documentation, guides, and reference materials that provide specialized knowledge to help AI assistants (and human developers) work more effectively on specific types of projects. These skills are compatible with multiple AI assistant platforms including Cline, Qwen Code, and Claude Code.

## Available Skills

This repository contains **two comprehensive skills** for building Atlassian Forge apps:

### 1. Atlassian Jira Forge Skill
A complete documentation suite for building Forge apps that extend Jira, including workflow validators, conditions, post-functions, and integrations with Jira REST APIs.

- **Cline**: `.cline/skills/atlassian-jira-forge-skill/`
- **Qwen Code**: `.qwen/skills/atlassian-jira-forge-skill/SKILL.md`
- **Claude Code**: `.claude/skills/atlassian-jira-forge-skill/SKILL.md`
- **Use when**: Creating workflow validators, conditions, post-functions, custom UIs for workflow rules, or integrating with Jira REST APIs from a Forge app

### 2. Atlassian Confluence Forge Skill
A complete documentation suite for building Forge apps that extend Confluence Cloud, including page extensions, blog post extensions, space settings panels, dashboard gadgets, and integrations with Confluence REST API v2.

- **Cline**: `.cline/skills/atlassian-confluence-forge-skill/`
- **Qwen Code**: `.qwen/skills/atlassian-confluence-forge-skill/SKILL.md`
- **Claude Code**: `.claude/skills/atlassian-confluence-forge-skill/SKILL.md`
- **Use when**: Building custom UIs for pages/blog posts, creating space configuration panels, handling Confluence webhooks, or integrating with Confluence REST API from a Forge app

---

## What is a Skill?

### Purpose

Skills provide:
- **Context-aware guidance**: When Cline, Qwen Code, or Claude Code detects Forge development work (e.g., working with `manifest.yml`), they activate the relevant skill to provide relevant documentation
- **Module-specific references**: Complete documentation for all module types
- **API endpoint documentation**: Comprehensive reference for Jira REST API (v3) and Confluence REST API (v2)
- **Best practices**: Proven patterns for Forge app development including resolver patterns, bridge API usage, and UI development

### How Skills Work in Cline, Qwen Code, and Claude Code

All three platforms use similar skill patterns:

1. **Automatic Activation**: Skills are activated based on file context (e.g., working with `manifest.yml` triggers the relevant skill)
2. **Context Integration**: The skill's documentation is integrated into the AI's knowledge base for the current session
3. **Persistent Access**: Once activated, the skill remains active for related tasks in that session
4. **Skill Definition**: Skills are defined in a `SKILL.md` file with metadata (name, description) that each platform uses to identify when to activate

### Platform-Specific Details

| Feature | Cline | Qwen Code | Claude Code |
|---------|-------|-----------|-------------|
| Skill Directory | `.cline/skills/` | `.qwen/skills/` or `~/.qwen/skills/` | `.claude/skills/` or `~/.claude/skills/` |
| Activation | File context detection | AI model automatic + `/skill-name` | AI model automatic + `/skill-name` |
| User-invocable | Manual via file context | `/skill-name` command | `/skill-name` command |
| Configuration | None required | Automatic discovery | YAML frontmatter optional |

---

## Installation

To install both skills on your system:

### For Cline

```bash
# Create the skills directory if it doesn't exist
mkdir -p ~/.cline/skills

# Copy both skills into place
cp -r atlassian-jira-forge-skill ~/.cline/skills/
cp -r atlassian-confluence-forge-skill ~/.cline/skills/

# Or copy all skills at once (from the repo root)
cp -r .cline/skills/* ~/.cline/skills/
```

Cline automatically detects skills in `~/.cline/skills/` and activates them when appropriate based on file context.

### For Qwen Code

Qwen Code supports Agent Skills that can be loaded from either user-level or project-level directories. Skills are activated automatically by the AI model when context suggests they should be used, or manually via `/skill-name` command.

### Skill Locations

| Scope | Path | Purpose |
|-------|------|---------|
| **User (Global)** | `~/.qwen/skills/<skill-name>/SKILL.md` | Available across all projects for the current user |
| **Project** | `.qwen/skills/<skill-name>/SKILL.md` | Project-specific skills, shared via git |

### Installation for Qwen Code

```bash
# Option 1: User-level (all projects)
mkdir -p ~/.qwen/skills/atlassian-jira-forge-skill
cp atlassian-jira-forge-skill/SKILL.md ~/.qwen/skills/atlassian-jira-forge-skill/

mkdir -p ~/.qwen/skills/atlassian-confluence-forge-skill
cp atlassian-confluence-forge-skill/SKILL.md ~/.qwen/skills/atlassian-confluence-forge-skill/

# Option 2: Project-level (current project only)
mkdir -p .qwen/skills/atlassian-jira-forge-skill
cp atlassian-jira-forge-skill/SKILL.md .qwen/skills/atlassian-jira-forge-skill/

mkdir -p .qwen/skills/atlassian-confluence-forge-skill
cp atlassian-confluence-forge-skill/SKILL.md .qwen/skills/atlassian-confluence-forge-skill/
```

### Configuration

Qwen Code automatically discovers skills in the configured locations. No additional configuration is required beyond placing the `SKILL.md` file in the correct directory.

Skills can be shared with your team by committing the `.qwen/skills/` directory to version control - teammates who pull the changes will automatically have access to the skills.

### Using Skills

1. **Automatic Invocation**: Qwen Code will automatically use a skill when context suggests it's relevant
2. **Manual Invocation**: Use `/skill-name` in your conversation (e.g., `/atlassian-jira-forge-skill`)
3. **View Available Skills**: Use the `/skills` command to see all available skills

### Frontmatter Reference

Each `SKILL.md` file should begin with YAML frontmatter:

```markdown
---
name: atlassian-jira-forge-skill
description: Complete documentation for building Atlassian Jira Forge apps including workflow validators, conditions, post-functions, and REST API integration
---

# Your skill content here...
```

**Best Practices for Qwen Code Skills:**
- Use lowercase letters, numbers, and hyphens in the `name`
- Make `description` specific - include both what the Skill does and when to use it (key words users will naturally mention)
- Keep skills focused - "PDF form filling" is good; "Document processing" is too broad

---

## Using Skills with Claude Code

Claude Code supports Agent Skills that can be loaded from user-level, project-level, or plugin directories. Skills are automatically discovered at startup and invoked by the AI model based on context.

### Skill Locations

| Scope | Path | Purpose |
|-------|------|---------|
| **User (Global)** | `~/.claude/skills/<skill-name>/SKILL.md` | Available across all projects for the current user |
| **Project** | `.claude/skills/<skill-name>/SKILL.md` | Project-specific skills, shared via git |
| **Plugin** | Plugin's `skills/` directory | Bundled with installed Claude Code plugins |

### Installation for Claude Code

```bash
# Option 1: User-level (all projects)
mkdir -p ~/.claude/skills/atlassian-jira-forge-skill
cp atlassian-jira-forge-skill/SKILL.md ~/.claude/skills/atlassian-jira-forge-skill/

mkdir -p ~/.claude/skills/atlassian-confluence-forge-skill
cp atlassian-confluence-forge-skill/SKILL.md ~/.claude/skills/atlassian-confluence-forge-skill/

# Option 2: Project-level (current project only)
mkdir -p .claude/skills/atlassian-jira-forge-skill
cp atlassian-jira-forge-skill/SKILL.md .claude/skills/atlassian-jira-forge-skill/

mkdir -p .claude/skills/atlassian-confluence-forge-skill
cp atlassian-confluence-forge-skill/SKILL.md .claude/skills/atlassian-confluence-forge-skill/
```

### Configuration

Claude Code automatically discovers skills in configured locations. The directory is scanned when Claude starts and when settings change.

Skills can be shared with your team by committing the `.claude/skills/` directory to version control - teammates who pull the changes will automatically have access to the skills.

### Frontmatter Reference

Each `SKILL.md` file should begin with YAML frontmatter:

```markdown
---
name: atlassian-jira-forge-skill
description: Complete documentation for building Atlassian Jira Forge apps including workflow validators, conditions, post-functions, and REST API integration
---

# Your skill content here...
```

### Advanced Configuration

Claude Code supports additional skill configuration options:

| Setting | Description |
|---------|-------------|
| `disable-model-invocation: true` | Only humans can invoke the skill (useful for actions with side effects) |
| `user-invocable: false` | Only Claude can invoke the skill (useful for background knowledge) |

Example with configuration:

```markdown
---
name: atlassian-jira-forge-skill
description: Complete documentation for building Atlassian Jira Forge apps including workflow validators, conditions, post-functions, and REST API integration
disable-model-invocation: false
user-invocable: true
---

# Your skill content here...
```

### Troubleshooting

**Skill not triggering:**
- Check the description includes keywords users would naturally say
- Verify the skill appears in "What skills are available?"
- Try rephrasing your request to match the description more closely

**Skill triggers too often:**
- Make the description more specific
- Add `disable-model-invocation: true` if only manual invocation is desired

---

## Atlassian Jira Forge Skill

### Quick Start

```yaml
# manifest.yml - Basic Forge app for Jira
modules:
  jira:workflowValidator:
    - key: my-validator
      name: My Validator
      description: Validates issue fields
      function: validateFields
      
  scheduledTrigger:
    - key: daily-task
      cron: "0 0 * * *"
      function: runDailyTask
      
  resource:
    - key: config-ui
      path: src/config-ui.jsx
```

### Documentation Index

| File | Description |
|------|-------------|
| `SKILL.md` | Main entry point with trigger description for Cline, Qwen Code, and Claude Code |
| `docs/01-core-concepts.md` | Core Forge concepts, manifest structure |
| `docs/02-workflow-validators.md` | Complete validator documentation with examples |
| `docs/03-workflow-conditions.md` | Complete condition documentation |
| `docs/04-workflow-post-functions.md` | Complete post-function documentation |
| `docs/05-events-payloads.md` | Event structures and payloads reference |
| `docs/06-api-endpoints-enhanced.md` | Enhanced Jira REST API v3 reference |
| `docs/07-permissions-scopes.md` | Permissions and scopes reference |
| `docs/08-cli-commands.md` | Forge CLI commands reference |
| `docs/09-scheduled-triggers.md` | Scheduled trigger modules |
| `docs/10-automation-actions.md` | Jira automation action modules |
| `docs/11-event-filters.md` | Event filters with Jira expressions |
| `docs/12-dashboard-widgets.md` | Dashboard widget modules |
| `docs/13-merge-checks.md` | Bitbucket merge check modules |
| `docs/15-bridge-api-reference.md` | Bridge API for frontend-backend communication |
| `docs/16-resolver-patterns.md` | Resolver pattern implementation guide |
| `docs/17-ui-kit-components.md` | UI Kit components reference |
| `docs/18-custom-ui-advanced.md` | Advanced Custom UI development guide |

### Structure

```
.cline/skills/atlassian-jira-forge-skill/
├── SKILL.md                           # Skill metadata and main documentation
├── docs/                              # Documentation files (01-24)
│   ├── 01-core-concepts.md           # Core Forge concepts, manifest structure
│   ├── 02-workflow-validators.md     # Workflow validator documentation
│   ├── 03-workflow-conditions.md     # Workflow condition documentation
│   ├── 04-workflow-post-functions.md # Workflow post function documentation
│   ├── 05-events-payloads.md         # Event structures and payloads reference
│   ├── 06-api-endpoints-enhanced.md  # Enhanced Jira REST API reference
│   ├── 07-permissions-scopes.md      # Permissions and scopes reference
│   ├── 08-cli-commands.md            # CLI commands reference
│   ├── 09-scheduled-triggers.md      # Scheduled trigger modules
│   ├── 10-automation-actions.md      # Jira automation action modules
│   ├── 11-event-filters.md           # Event filters with Jira expressions
│   ├── 12-dashboard-widgets.md       # Dashboard widget modules
│   ├── 13-merge-checks.md            # Bitbucket merge check modules
│   ├── 14-content-properties.md      # Confluence content property modules
│   ├── 15-bridge-api-reference.md    # Bridge API for frontend-backend communication
│   ├── 16-resolver-patterns.md       # Resolver pattern implementation guide
│   ├── 17-ui-kit-components.md       # UI Kit components reference
│   ├── 18-custom-ui-advanced.md      # Advanced Custom UI development guide
│   ├── 20-performance-optimization.md
│   ├── 21-complete-custom-ui-guide.md
│   ├── 22-jira-service-management.md
│   ├── 23-real-world-patterns.md     # Real-world patterns with code examples
│   └── 24-advanced-topics.md         # Advanced topics and best practices
├── api-endpoints/                     # External API reference files (not included)
├── events-payloads/                   # External event payload files (not included)
└── templates/                         # YAML manifest templates
    ├── condition.yml                  # Workflow condition template
    ├── post-function.yml              # Workflow post function template
    ├── trigger-with-filter.yml        # Trigger with filter template
    ├── ui-modifications.yml           # UI modifications template
    ├── scheduled-trigger.yml          # Scheduled trigger template
    ├── dashboard-gadget.yml           # Dashboard gadget template
    ├── validator.yml                  # Validator template
    └── bitbucket-merge-check.yml      # Bitbucket merge check template
```

### Module Types

| Module Type | Documentation |
|-------------|---------------|
| `jira:workflowValidator` | [Workflow Validators](./docs/02-workflow-validators.md) |
| `jira:workflowCondition` | [Workflow Conditions](./docs/03-workflow-conditions.md) |
| `jira:workflowPostFunction` | [Workflow Post Functions](./docs/04-workflow-post-functions.md) |
| `scheduledTrigger` | [Scheduled Triggers](./docs/09-scheduled-triggers.md) |
| `action` | [Automation Actions](./docs/10-automation-actions.md) |

### Jira REST API (Comprehensive)

The skill includes extensive documentation for Jira Cloud REST API v3 endpoints:

#### Issue Operations
- Create, read, update, delete issues
- Bulk operations (create, update, delete, move, transition multiple issues)
- Search with JQL, autocomplete, parsing
- Get issue metadata and schema information

#### Worklog Operations
- Record time tracking data
- Update and delete worklogs
- Query worklogs for issues

#### Project Operations
- List, create, update, delete projects
- Access project templates and configurations
- Manage project permissions

#### Workflow Operations
- Get transitions available for issues
- Execute workflow transitions
- Search and manage workflows

#### Field Operations
- List all fields in Jira
- Get field options for select fields
- Understand field schemas and validation rules

#### User & Group Operations
- Get current authenticated user
- Search users and retrieve multiple users
- Access group information for users

#### Dashboard & Filter Operations
- Search dashboards and filters
- Create and manage custom filters
- Retrieve dashboard configurations

#### Attachment & Audit Operations
- Upload attachments to issues
- Manage audit logs for system activity

---

## Atlassian Confluence Forge Skill

### Quick Start

```yaml
# manifest.yml - Basic Forge app for Confluence
modules:
  confluence:pageBanner:
    - key: my-page-extension
      resource: main
      icon: icon.png
      title: My Extension Title
      location: confluence-page-custom-ui-top

  webhook:
    - destination: page-webhook
      event: confluence:page:created

  scheduledTrigger:
    - key: daily-sync
      cron: "0 2 * * *"
      function: runDailySync

  resource:
    - key: main
      path: src/page-banner.jsx
```

### Documentation Index

| File | Description |
|------|-------------|
| `SKILL.md` | Main entry point with trigger description for Cline, Qwen Code, and Claude Code |
| `docs/01-core-concepts.md` | Core Forge concepts, manifest structure |
| `docs/02-page-custom-ui.md` | Page extensions implementation guide |
| `docs/03-space-settings.md` | Space configuration panels |
| `docs/04-blogpost-custom-ui.md` | Blog post extensions guide |
| `docs/05-dashboard-widgets.md` | Dashboard gadgets/widgets implementation |
| `docs/06-content-properties.md` | Content properties storage patterns |
| `docs/07-webhooks-events.md` | Webhook events (page created/updated/deleted) |
| `docs/08-api-endpoints.md` | Confluence REST API v2 reference |
| `docs/problem-patterns.md` | Common implementation patterns with code examples |
| `docs/when-to-use-which.md` | Decision tree for module selection |

### Structure

```
.cline/skills/atlassian-confluence-forge-skill/
├── SKILL.md                           # Skill metadata and main documentation
├── docs/                              # Documentation files
│   ├── 01-core-concepts.md           # Core Forge concepts, manifest structure
│   ├── 02-page-custom-ui.md          # Page extensions implementation guide
│   ├── 03-space-settings.md          # Space configuration panels
│   ├── 04-blogpost-custom-ui.md      # Blog post extensions guide
│   ├── 05-dashboard-widgets.md       # Dashboard gadgets/widgets implementation
│   ├── 06-content-properties.md      # Content properties storage patterns
│   ├── 07-webhooks-events.md         # Webhook events and payloads
│   └── 08-api-endpoints.md           # Confluence REST API v2 reference
├── templates/                         # YAML manifest templates
│   ├── content-property-storage.yml  # Content property CRUD operations
│   ├── dashboard-gadget.yml          # Dashboard widget template
│   ├── page-custom-ui.yml            # Page extension configuration
│   ├── scheduled-trigger.yml         # Scheduled background tasks
│   ├── space-settings.yml            # Space settings panel configuration
│   └── webhook-handler.yml           # Webhook event handler template
└── when-to-use-which.md              # Decision tree for module selection
```

### Module Types

| Module Type | Documentation |
|-------------|---------------|
| `confluence:pageBanner` | [Page Extensions](./docs/02-page-custom-ui.md) |
| `confluence:spaceSettings` | [Space Settings Panels](./docs/03-space-settings.md) |
| `confluence:contentAction` | [Content Menu Actions](./docs/04-blogpost-custom-ui.md) |
| `dashboardGadget` | [Dashboard Gadgets](./docs/05-dashboard-widgets.md) |

### Confluence REST API v2

The skill includes comprehensive documentation for Confluence Cloud REST API v2:

#### Page Operations
- Get, create, update, delete pages
- Content properties storage
- Attachments management
- Comments handling

#### Blog Post Operations
- Get, create, update blog posts
- Content properties for blog posts

#### Space Operations
- List and get spaces
- Space properties management

#### Webhook Events
- `confluence:page:created` - Page creation events
- `confluence:page:updated` - Page update events
- `confluence:page:deleted` - Page deletion events

---

## Comparison: Jira vs Confluence Forge

| Feature | Jira Forge | Confluence Forge |
|---------|------------|------------------|
| **Primary Use Case** | Workflow automation, issue management | Content extensions, knowledge base apps |
| **Custom UI Locations** | Workflow rules (validators, conditions) | Pages, Blog Posts, Space Settings |
| **Storage Pattern** | Issue properties | Content Properties (per content type) |
| **Event System** | Workflow transitions | Page/blogpost created/updated/deleted |
| **API Version** | REST API v3 | REST API v2 |
| **Common Patterns** | Validators, conditions, post-functions | Page extensions, space settings panels |

---

## When to Use Which Skill

### Jira Forge Skill
Use this skill when:
- Creating **workflow validators** - validate issue fields before transition completes
- Creating **workflow conditions** - control visibility of transitions
- Creating **workflow post-functions** - execute logic after transition
- Building custom UIs for workflow rule configuration
- Making Jira REST API calls from a Forge app
- Setting up scheduled triggers for recurring tasks
- Creating automation actions in Jira rules
- Developing dashboard widgets

### Confluence Forge Skill
Use this skill when:
- Adding custom UI to **Confluence pages** (page extensions)
- Building **space configuration panels** (admin-level settings)
- Creating **blog post extensions**
- Developing **dashboard gadgets**
- Handling Confluence **webhooks** (page created/updated/deleted)
- Using Confluence REST API v2 from a Forge app
- Storing app data with content using Content Properties

---

## Quick Reference

### Cross-Platform Skill Locations

| Platform | Jira Skill Path | Confluence Skill Path |
|----------|-----------------|----------------------|
| **Cline** | `.cline/skills/atlassian-jira-forge-skill/` | `.cline/skills/atlassian-confluence-forge-skill/` |
| **Qwen Code** | `.qwen/skills/atlassian-jira-forge-skill/SKILL.md` | `.qwen/skills/atlassian-confluence-forge-skill/SKILL.md` |
| **Claude Code** | `.claude/skills/atlassian-jira-forge-skill/SKILL.md` | `.claude/skills/atlassian-confluence-forge-skill/SKILL.md` |

### Jira Tasks
| Task | Module Type / API |
|------|-------------------|
| Validate fields before transition | `jira:workflowValidator` |
| Control transition visibility | `jira:workflowCondition` |
| Execute logic after transition | `jira:workflowPostFunction` |
| Schedule recurring tasks | `scheduledTrigger` |
| Create automation actions | `action` |
| Jira REST API calls | `/rest/api/3/*` |

### Confluence Tasks
| Task | Module Type / API |
|------|-------------------|
| Add UI to pages (banner) | `confluence:pageBanner` |
| Space configuration | `confluence:spaceSettings` |
| Menu items in "more actions" | `confluence:contentAction` |
| Dashboard gadgets | `dashboardGadget` |
| Webhook handlers | `webhook` |
| Confluence REST API | `/wiki/api/v2/*` |

---

## Forge Runtime APIs

The skills document these critical Forge runtime libraries:

| Library | Purpose |
|---------|---------|
| `@forge/api` | Jira/Confluence REST access, context management |
| `@forge/resolver` | Frontend-to-backend communication (Resolver pattern) |
| `@forge/jira-bridge` | UI modifications and workflow configuration |
| `@forge/kvs` | Key-value storage for persistence |
| `@forge/bridge` | Frontend navigation and context access |

---

## Best Practices

### Forge App Development
1. Use `api.asApp()` for workflow context calls (no user session)
2. Use `api.asUser()` to preserve current user permissions
3. Batch operations whenever possible
4. Handle rate limits (typically 5 requests/second)
5. Paginate results using `startAt` and `maxResults`

### Custom UI Development
1. Keep UI lightweight and responsive
2. Use the Bridge API for secure backend communication
3. Handle errors gracefully in components
4. Test across different screen sizes

## Troubleshooting

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| "Function not found" | Function key mismatch in manifest.yml | Check function references match |
| "Permission denied" | Missing scopes in manifest.yml | Add required scope to permissions.scopes |
| "Expression evaluation failed" | Invalid Jira expression syntax | Test expressions in workflow editor |

#### Platform-Specific Issues

| Issue | Cline | Qwen Code | Claude Code |
|-------|-------|-----------|-------------|
| Skill not triggering | Check file context matches skill triggers | Verify SKILL.md is in correct location and has valid frontmatter | Verify SKILL.md is in correct location and has valid frontmatter |
| Skill not found | Ensure directory structure matches `.cline/skills/<skill-name>/` | Check `~/.qwen/skills/` or project's `.qwen/skills/` | Check `~/.claude/skills/` or project's `.claude/skills/` |
| Manual invocation | N/A (auto-activated) | Use `/skill-name` command | Use `/skill-name` command |

### Debugging Commands

```bash
forge logs -n 50    # View last 50 log entries
forge tunnel        # Local testing with live environment
forge lint          # Check manifest/code for issues
```

---

## Additional Resources

The skill references external documentation in the following directories (not included):

- `api-endpoints/` - Comprehensive API reference files (Jira, Confluence, Bitbucket)
- `events-payloads/` - Detailed event payload structures

## Related Documentation

For more information about skills across platforms:
- [Cline GitHub Repository](https://github.com/cline)
- [Cline Skills Documentation](https://github.com/cline/tree/main/skills)
- [Qwen Code Agent Skills](https://qwenlm.github.io/qwen-code-docs/en/users/features/skills/)
- [Claude Code Skills Guide](https://code.claude.com/docs/en/skills)

---

## License

Copyright © 2026 LeanZero SRL. All rights reserved.