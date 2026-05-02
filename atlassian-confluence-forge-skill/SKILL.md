---
name: atlassian-confluence-forge-skill
description: Atlassian Confluence Forge app development — page banners, content actions, macros, content properties, async events with @forge/events, KVS storage, ADF/storage-format bodies, and Confluence REST API v2 integration.
---

# Atlassian Confluence Forge Development

Build apps that extend Confluence Cloud on Atlassian's serverless Forge platform.

## When to Use This Skill

Use this skill when:
- The work targets **Confluence Cloud** specifically (not Jira — see `atlassian-jira-forge-skill` for that).
- You're declaring Confluence Forge modules in `manifest.yml` (`confluence:pageBanner`, `confluence:contentAction`, `macro`, etc.), writing resolvers, building Custom UI / UI Kit panels, or registering content/space properties.
- You're calling `/wiki/api/v2/...` (preferred) or `/wiki/rest/api/...` (legacy) from a Forge function.

Skip this skill for:
- Jira-only work (use `atlassian-jira-forge-skill`).
- Atlassian organization / cross-product admin operations (use `atlassian-organizations-api-skill`).
- Atlassian Connect or Data Center.

## Pick a starting point

- **Scaffolding a new module**: copy a template from `templates/`.
- **Production patterns** (KVS prefix indexing, ADF surgery, content-property version handling, capability-token web triggers, dual-strategy API fallback): `docs/24-production-patterns.md`.
- **Limits & quotas** (timeouts, KVS quotas, queue limits, ADF size): `docs/27-faas-limits-and-cost.md`.
- **ADF vs storage format**: `docs/28-adf-and-storage-format.md`.

## Quick Reference

| Task | Module |
|---|---|
| Banner on every page / blogpost | `confluence:pageBanner` |
| Menu item in "more actions" (•••) | `confluence:contentAction` |
| Right-click context menu on selected text | `confluence:contextMenu` |
| Content byline area widget (under page title) | `confluence:contentBylineItem` |
| Editor macro (insert dynamic content) | `macro` |
| Custom content type indexed by Confluence | `confluence:customContent` |
| Right-rail item on the home feed | `confluence:homepageFeed` |
| Top-level admin settings page | `globalSettings` |
| Page in space navigation | `spacePage` |
| Page in the global "Apps" menu | `globalPage` |
| Per-content app data (CQL-indexed) | `confluence:contentProperty` |
| Cron-style background job | `scheduledTrigger` |
| Long-running work (>25s) | `trigger` → `consumer` (`@forge/events`, `timeoutSeconds:` up to 900) |
| Public HTTPS endpoint into the app | `webtrigger` |

> There is no `confluence:pageCustomUi` or `confluence:blogPostCustomUi` module. Use `confluence:pageBanner` for "render on every page" and `confluence:contentAction` for "menu item that opens a modal."

## Core API

```javascript
// Custom UI (frontend, runs in iframe)
import { requestConfluence, view, invoke } from '@forge/bridge';

const ctx  = await view.getContext();
const r    = await requestConfluence(`/wiki/api/v2/pages/${ctx.extension.content.id}?body-format=atlas_doc_format`);
const page = await r.json();

// Resolver / trigger / scheduled function (backend)
import api, { route } from '@forge/api';
import { kvs }        from '@forge/kvs';                  // named import; legacy `storage` from '@forge/api' is no longer receiving features after 2025-03-17
import Resolver       from '@forge/resolver';
import { Queue, InvocationError, InvocationErrorCode } from '@forge/events';

const r2 = await api.asUser().requestConfluence(route`/wiki/api/v2/pages/${pageId}`);
await kvs.set('config', { theme: 'dark' });
```

## Authentication — what's correct, what's wrong

| Pattern | Use? |
|---|---|
| `await requestConfluence('/wiki/api/v2/...')` from `@forge/bridge` (Custom UI) | **Yes** — Forge proxies the request and adds OAuth automatically. |
| `await api.asUser().requestConfluence(route\`...\`)` / `api.asApp()` (resolver) | **Yes** — token exchange handled for you. |
| `invoke('myResolver', payload)` from `@forge/bridge` | **Yes** — when the UI needs backend logic before/after the REST call. |
| `const token = await AP.context.getToken();` + `Authorization: 'JWT <token>'` | **No.** This is the legacy Atlassian Connect pattern — Forge apps do not use it. |
| Local `jsonwebtoken.sign(...)` against the Connect shared secret | **No.** Connect-only. |

If older docs in this skill use `AP.context.getToken()`, treat them as legacy reference. The replacement is always one of the patterns above.

## Manifest skeleton

```yaml
modules:
  confluence:pageBanner:
    - key: my-banner
      resource: main
      title: My Banner
  function:
    - key: handler
      handler: index.handler

resources:
  - key: main
    path: static/banner/build         # Custom UI build directory

permissions:
  scopes:
    - read:confluence-content.summary
    - storage:app
  external:
    fetch:
      backend:
        - api.atlassian.com           # only if you call the Org Admin API

app:
  id: ari:cloud:ecosystem::app/YOUR-APP-ID
  runtime:
    name: nodejs22.x                  # also valid: nodejs24.x, nodejs20.x
    memoryMB: 512                     # optional; raises CPU too
```

## Key Differences from the Jira Forge Skill

| Feature | Jira | Confluence |
|---|---|---|
| Workflow modules | Validators, conditions, post-functions | n/a |
| Issue-context UIs | `jira:issuePanel`, `jira:issueAction` | `confluence:contentBylineItem`, `confluence:contentAction` |
| Per-resource storage | Issue properties | Content / space properties (CQL-indexed) |
| Page body format | n/a | ADF (`atlas_doc_format`) or storage (XHTML) — see `28-adf-and-storage-format.md` |
| Events | Workflow transitions, issue lifecycle | `avi:confluence:created/updated/...:page|blogpost|comment|attachment|...` |

## Failure strategies

| Symptom | First-pass fix | Detail |
|---|---|---|
| `403` permission denied | Add scope, run `forge install --upgrade` | `12-permissions-scopes.md` |
| `409 Conflict` on PUT page or property | You sent a stale `version.number` — GET → bump → PUT | `28-adf-and-storage-format.md` |
| `429 Too Many Requests` | Honor `Retry-After`, exponential backoff with jitter | `24-production-patterns.md` (Pattern 3) |
| Function timed out (~25s) | Push the work to an async queue | `26-async-events-and-queues.md` |
| "Refused to load script" / CSP errors | Allowlist host in `permissions.external.fetch.client` (or `.backend`); bundle scripts | `gotchas.md` |
| Tunnel doesn't apply manifest changes | Restart tunnel; `forge install --upgrade` if scopes changed | `gotchas.md` |
| Trigger fires on your own writes | Add `filter.ignoreSelf: true` and check `event.atlassianId` against your app's accountId | `24-production-patterns.md` (Pattern 5) |

## Documentation map

### Core
| File | Topic |
|---|---|
| `01-core-concepts.md` | Forge platform, modules, functions, resolvers, context — Confluence specifics |
| `06-content-properties.md` | Per-content app data with CQL search |
| `12-permissions-scopes.md` | OAuth scopes for the Confluence REST API |
| `13-cli-commands.md` | `forge` CLI reference |

### Modules & UI
| File | Topic |
|---|---|
| `02-page-custom-ui.md` | Page extensions (`confluence:pageBanner`) |
| `03-space-settings.md` | Space settings panels |
| `04-blogpost-custom-ui.md` | Blog post extensions |
| `05-dashboard-widgets.md` | Dashboard gadgets |
| `21-custom-content.md` | `confluence:customContent` |

### REST & Data
| File | Topic |
|---|---|
| `08-api-endpoints.md` | Confluence REST v2 reference |
| `09-labels-management.md` | Labels CRUD |
| `10-user-permissions.md` | Users, groups, permissions |
| `11-version-history.md` | Page versions |
| `28-adf-and-storage-format.md` | ADF vs storage format, version handling, building ADF nodes |

### Automation & Events
| File | Topic |
|---|---|
| `07-webhooks-events.md` | Trigger events and payloads |
| `26-async-events-and-queues.md` | `@forge/events` queues, retries, long-running consumers |

### Performance, Limits, Patterns
| File | Topic |
|---|---|
| `20-performance-optimization.md` | Caching, batching, pagination |
| `27-faas-limits-and-cost.md` | Timeouts, KVS quotas, queue limits |
| `24-production-patterns.md` | 15 production patterns from Sentinel Vault and License Leash |

### Testing
| File | Topic |
|---|---|
| `30-testing-and-tunneling.md` | `forge tunnel`, jest mocks for `@forge/*` |

### Decision aids
| File | Topic |
|---|---|
| `when-to-use-which.md` | Module selection guide |
| `gotchas.md` | Pitfalls and environment-specific quirks |
| `problem-patterns.md` | Common problems with code snippets |

## Templates

Copy-paste-ready manifests in `templates/`:

| Template | Module / Use case |
|---|---|
| `page-custom-ui.yml` | `confluence:pageBanner` (most-used Custom UI surface) |
| `blogpost-custom-ui.yml` | Custom UI on blogposts (via `displayConditions.pageTypes: [blogpost]`) |
| `content-byline-item.yml` | `confluence:contentBylineItem` |
| `content-macro.yml` | Editor `macro` |
| `space-settings.yml` | Space-scoped settings panel |
| `space-properties.yml` | Space property storage |
| `content-property-storage.yml` | Per-content app data with CQL |
| `dashboard-gadget.yml` | Dashboard widget |
| `attachment-management.yml` | Page attachments CRUD |
| `page-hierarchy.yml` | Page tree navigation |
| `webhook-handler.yml` | `trigger` (event-based) |
| `scheduled-trigger.yml` | `scheduledTrigger` |
| `remote-webhook-handler.yml` | Routing events to an external service |
| `custom-content-module.yml` | `confluence:customContent` |

## Scripts

CI-safe shell scripts in `scripts/`:

| Script | Purpose |
|---|---|
| `preflight-check.sh` | Verify CLI install, auth, manifest, lint |
| `validate-manifest.sh` | Run `forge lint` with parsed summary |
| `deploy-and-install.sh` | `forge deploy` + `forge install --upgrade` |
| `dev-setup.sh` | Start `forge tunnel` (`-e` for environment) |

Recommended workflow: `preflight-check.sh` → make changes → `validate-manifest.sh` → `deploy-and-install.sh`.

## Changelog

- Replaced the legacy "Authentication via OAuth 2.0 (3LO) or JWT from Forge" claim with the three actually-valid patterns; added an explicit "Auth note" preamble to every doc/template that still contained `AP.context.getToken()` (Atlassian Connect, not Forge).
- Standardized on the named KVS import: `import { kvs } from '@forge/kvs'`. Legacy `storage` from `@forge/api` flagged with the 2025-03-17 deprecation date.
- Removed the spurious `forge register` step from `templates/page-custom-ui.yml` (no such command — use `forge install --upgrade`).
- Renumbered duplicate prefixes: `07-permissions-scopes.md` → `12-`, `08-cli-commands.md` → `13-`.
- Added five new docs: `24-production-patterns.md` (15 patterns from Sentinel Vault and License Leash), `26-async-events-and-queues.md`, `27-faas-limits-and-cost.md`, `28-adf-and-storage-format.md`, `30-testing-and-tunneling.md`. Removed `24-real-world-patterns.md` (folded in).
- Stripped emoji from shell scripts; added `set -euo pipefail` headers.

## Support & Resources

- [Forge Documentation](https://developer.atlassian.com/cloud/forge/)
- [Confluence REST API v2](https://developer.atlassian.com/cloud/confluence/rest/v2/)
- [Atlassian Developer Community](https://community.developer.atlassian.com/)
