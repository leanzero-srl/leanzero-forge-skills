---
name: atlassian-jira-forge-skill
description: Atlassian Jira Forge app development — workflow validators/conditions/post-functions, custom UIs with @forge/react, async events with @forge/events, KVS storage, and Jira REST API integration.
---

# Atlassian Jira Forge Development

Build apps that extend Jira Cloud on Atlassian's serverless Forge platform.

## When to Use This Skill

Use this skill when:
- The work targets **Jira Cloud** specifically (not Confluence Cloud — see `atlassian-confluence-forge-skill` for that).
- You're declaring Forge modules in `manifest.yml`, writing resolvers/validators/post-functions, or building Custom UI / UI Kit panels.
- You need to call the Jira REST API from a Forge function via `@forge/api`.

Skip this skill for:
- Confluence-only work, JSM-only work that doesn't touch Jira issues, or non-Forge platforms (Connect, OAuth 2.0 3LO apps, Data Center).

## Pick a starting point

- **Scaffolding a new module**: copy a template from `templates/` (validator, condition, post-function, async-queue-consumer, custom-field-type, capability-token-webtrigger, etc.).
- **Production patterns** (sharding, backoff+jitter, drafts/locks, capability tokens, async offload, fail-open validators): `docs/24-production-patterns.md`.
- **Limits & quotas** (timeouts, KVS quotas, queue limits): `docs/27-faas-limits-and-cost.md`.
- **Decision: which module type?** `docs/when-to-use-which.md`.

## Quick Reference

| Task | Module |
|---|---|
| Validate fields before transition | `jira:workflowValidator` |
| Hide/show transitions | `jira:workflowCondition` |
| Run logic after transition | `jira:workflowPostFunction` |
| Cron-style background job | `scheduledTrigger` |
| Long-running work (>25s) | `trigger` → `consumer` (async event with `timeoutSeconds:` up to 900) |
| Public HTTPS endpoint into the app | `webtrigger` |
| Custom field (view + edit) | `jira:customField` / `jira:customFieldType` |
| Issue-context UI | `jira:issuePanel` / `jira:issueAction` |
| Full-page UI | `jira:globalPage` / `jira:adminPage` / `jira:projectPage` |
| Dashboard widget | `jira:dashboardGadget` |
| Bitbucket merge gate | `bitbucket:mergeCheck` |

## Core API

```javascript
import api, { route } from '@forge/api';
import { kvs } from '@forge/kvs';
import Resolver from '@forge/resolver';
import { Queue, InvocationError, InvocationErrorCode } from '@forge/events';

// REST call (always use route`...` to auto-encode interpolations)
const r = await api.asApp().requestJira(route`/rest/api/3/issue/${key}`);

// KVS (named import — required scope: storage:app)
await kvs.set('config', { theme: 'dark' });
const config = await kvs.get('config');

// Resolver (Custom UI / UI Kit backend)
const resolver = new Resolver();
resolver.define('getText', async ({ payload, context }) => 'Hello');
export const handler = resolver.getDefinitions();

// Async queue offload (>25s work)
const queue = new Queue({ key: 'long-jobs' });
await queue.push({ body: { taskId: '...' } });
```

## Manifest skeleton

```yaml
modules:
  jira:workflowValidator:
    - key: my-validator
      name: My Validator
      description: Validates fields before transition
      function: validate
  function:
    - key: validate
      handler: index.validate

permissions:
  scopes:
    - read:jira-work
    - write:jira-work
    - storage:app
  external:
    fetch:
      backend:
        - api.openai.com

app:
  id: ari:cloud:ecosystem::app/YOUR-APP-ID
  runtime:
    name: nodejs22.x   # also valid: nodejs24.x, nodejs20.x
    memoryMB: 512      # optional; raises CPU too
```

## Failure strategies (one-liners; details in linked docs)

| Symptom | First-pass fix | Detail |
|---|---|---|
| `403` permission denied | Add scope to `permissions.scopes`, run `forge install --upgrade` | `07-permissions-scopes.md` |
| `429 Too Many Requests` | Honor `Retry-After`, add exponential backoff with jitter | `19-rate-limit-handling.md` + `24-production-patterns.md` |
| Function timed out (~25s) | Push the work to an async queue (`@forge/events`), set `timeoutSeconds: 900` | `26-async-events-and-queues.md` |
| "Refused to load script" / CSP errors | Allowlist host in `permissions.external.fetch.client` (or `.backend`); bundle scripts | `gotchas.md`, `23-custom-ui-advanced.md` |
| Tunnel doesn't apply manifest changes | Restart tunnel; `forge install --upgrade` if scopes changed | `gotchas.md` |
| KVS hot key (>1 MB/s writes) | Shard: `key:{i}` with deterministic mapping | `24-production-patterns.md` |

## Documentation map

### Core
| File | Topic |
|---|---|
| `01-core-concepts.md` | Forge platform, modules, functions, resolvers, context |
| `02-workflow-validators.md` | `jira:workflowValidator` |
| `03-workflow-conditions.md` | `jira:workflowCondition` |
| `04-workflow-post-functions.md` | `jira:workflowPostFunction` |
| `05-events-payloads.md` | Event types and payload schemas |
| `06-api-endpoints.md` | Jira REST reference (with per-resource appendix in `api/`) |
| `07-permissions-scopes.md` | OAuth scopes, storage scopes |
| `08-cli-commands.md` | `forge` CLI reference |

### Modules & UI
| File | Topic |
|---|---|
| `09-scheduled-triggers.md` | Cron-style scheduled functions |
| `10-automation-actions.md` | Custom automation actions |
| `11-event-filters.md` | Event filter expressions |
| `12-dashboard-widgets.md` | `jira:dashboardGadget` |
| `13-merge-checks.md` | `bitbucket:mergeCheck` |
| `14-ui-modifications.md` | UI Modifications API |
| `15-bridge-api-reference.md` | `@forge/bridge` reference |
| `16-resolver-patterns.md` | Resolver structuring patterns |
| `17-ui-kit-components.md` | `@forge/react` component reference |

### Custom UI
| File | Topic |
|---|---|
| `18-custom-ui-troubleshooting.md` | Custom UI troubleshooting |
| `21-complete-custom-ui-guide.md` | End-to-end Custom UI guide |
| `22-jira-service-management.md` | JSM extensions |
| `23-custom-ui-advanced.md` | Advanced Custom UI patterns |

### Performance & Production
| File | Topic |
|---|---|
| `19-rate-limit-handling.md` | Rate-limit / backoff |
| `20-performance-optimization.md` | Caching, attachment budgets |
| `24-production-patterns.md` | Production patterns from PPM Pro & CogniRunner |

### Reference (new)
| File | Topic |
|---|---|
| `26-async-events-and-queues.md` | `@forge/events` queues, retries, long-running work |
| `27-faas-limits-and-cost.md` | Timeouts, memory, KVS quotas, queue limits |
| `28-forge-remote-and-egress.md` | `permissions.external`, `remotes:`, OAuth providers |
| `29-custom-field-types.md` | `jira:customField`, `jira:customFieldType` |
| `30-testing-and-tunneling.md` | `forge tunnel`, mocking, jest |

### Decision aids
| File | Topic |
|---|---|
| `when-to-use-which.md` | Module selection guide |
| `gotchas.md` | Pitfalls and environment-specific quirks |

## Templates

Copy-paste-ready manifests in `templates/`:

| Template | Module |
|---|---|
| `validator.yml` | `jira:workflowValidator` |
| `complex-validator.yml` | Multi-rule validator with config UI |
| `condition.yml` | `jira:workflowCondition` |
| `post-function.yml` | `jira:workflowPostFunction` |
| `scheduled-trigger.yml` | `scheduledTrigger` |
| `webhook-handler.yml` | `trigger` (event-based) |
| `trigger-with-filter.yml` | `trigger` with event filter |
| `async-queue-consumer.yml` | `trigger` → `consumer` (long-running) |
| `automation-action.yml` | Custom automation action |
| `bulk-operation.yml` | Bulk issue ops with rate limiting |
| `storage-kvs-example.yml` | KVS patterns |
| `ui-modifications.yml` | UI Modifications |
| `dashboard-gadget.yml` | `jira:dashboardGadget` |
| `bitbucket-merge-check.yml` | `bitbucket:mergeCheck` |
| `custom-field-type.yml` | `jira:customFieldType` (view + edit + contextConfig) |
| `capability-token-webtrigger.yml` | Webtrigger with token + bearer auth |

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

- Merged `06-api-endpoints.md` and the prior `-enhanced.md` variant into one canonical reference, with the per-resource `docs/api/` folder linked as an appendix.
- Renumbered duplicate prefixes: `02-ui-modifications.md` → `14-`, `18-custom-ui-advanced.md` → `23-`.
- Removed the long-stale claim that workflow validators/conditions/post-functions are Connect-only — they are real, supported Forge modules.
- Standardized on the named KVS import: `import { kvs } from '@forge/kvs'`.
- Added five new docs: `26-async-events-and-queues.md`, `27-faas-limits-and-cost.md`, `28-forge-remote-and-egress.md`, `29-custom-field-types.md`, `30-testing-and-tunneling.md`.
- Added three new templates: `async-queue-consumer.yml`, `custom-field-type.yml`, `capability-token-webtrigger.yml`.
- Stripped emoji from shell scripts; added `set -euo pipefail` headers.
