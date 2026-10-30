---
name: atlassian-jira-forge-skill
description: "Build Jira Forge apps: workflow validators/conditions/post-functions, custom UIs with @forge/react, @forge/events async events, KVS storage, Jira REST from Forge. Not external (non-Forge) integrations: use jira-api-skill."
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

- **Scaffolding a new module**: copy a template from `templates/` (validator, condition, post-function, async-queue-consumer, custom-field-type, capability-token-webtrigger, workflow-config-view, etc.).
- **Production patterns** (sharding, backoff+jitter, drafts/locks, write-verify, two-engine parity, capability tokens, async offload, fail-open validators): `docs/24-production-patterns.md`.
- **Workflow rules in depth** (create/edit/view split, conditions are expressions never functions, per-instance ids, agentic validation, semantic-PF editmeta pre-flight): `docs/25-workflow-modules-deep-dive.md`.
- **AI / LLM in a Forge app** (`@forge/llm` hosted, BYOK multi-provider, three-layer cost guard): `docs/31-forge-ai-and-llm.md`.
- **Live multi-user UI** (`@forge/realtime`): `docs/32-forge-realtime.md`.
- **Limits & quotas** (timeouts, KVS quotas, queue limits): `docs/27-faas-limits-and-cost.md`.
- **Decision: which module type?** `docs/when-to-use-which.md`.

## Definition of Done

A Jira Forge change is done when the installed app proves it on a real site:
1. `check-forge-deps.mjs` (template), `scripts/preflight-check.sh` and `scripts/validate-manifest.sh` (`forge lint`) pass, with no stubbed `@forge/*` package.
2. `scripts/deploy-and-install.sh` deployed it and ran `forge install --upgrade` on the test site, so new scopes are actually granted.
3. Each module touched was exercised for real: a validator blocks the bad transition and allows the good one, a condition hides and shows the transition, a post-function's write is visible on the issue afterwards, a UI renders with data; `forge logs` for that window shows no errors or timeouts.
4. Every Jira write was read back (bulk create: `body.errors[].failedElementNumber` checked before trusting `body.issues`), and triggers ignore the app's own writes.
5. Anything scheduled, event-driven or queue-backed was checked against "Cost and robustness" below: an idle run does one cheap read and writes nothing.

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
| Storage behaves impossibly (one function cannot read another's write; every prefix query is empty; `batchGet` missing) | **Check `node_modules/@forge/*/package.json` for `"version": "0.0.0"` BEFORE believing a platform story**, then `npm ci` | `gotchas.md` → Toolchain |
| `Cannot access 'x' before initialization` in a deployed function | A `const` read above its declaration; nothing but runtime sees it. Turn on `no-use-before-define` | `gotchas.md` → Toolchain |
| Bulk create attributes keys to the wrong issues | `body.issues` holds only the SUCCESSES; read `body.errors[].failedElementNumber` first | `gotchas.md` → Jira REST |
| A big structured model reply is cut mid-array | Output length is the ceiling, not context — one call per group, not one huge call | `31-forge-ai-and-llm.md` |

## Cost and robustness — read before designing (2026-10-20)

Forge bills the VENDOR for every invocation, SQL request, KVS op and GB-second, on every install including
idle and free-tier ones. Cost Slasher billed USD 15.92 on test installs alone from a 5-minute scheduled
trigger doing ~560 SQL statements per run. Before building a scheduled trigger, event trigger, queue
consumer or Forge SQL workflow, apply LeanZero baseline pillar 14:
`~/.claude/skills/leanzero-forge-app-baseline/references/idle-cost-and-robustness.md`. The short form:
an idle install does no SQL/provider/write work (one cheap read, then return); zero-work runs write nothing;
probe due work in one batched read; filter and coalesce events; batch telemetry; model populated cost at
100/1,000/10,000 users before launch; Forge SQL does not preserve JSON key order; every write can succeed
without an ACK (intent → effect → readback); read every page; every lock/intent has an exit; deploy doors
check that the bundle was built from the deployed commit.

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
| `24-production-patterns.md` | 20 production patterns (PPM Pro / lz-ppm / se-ppm / CogniRunner) |
| `25-workflow-modules-deep-dive.md` | Workflow rule internals: create/edit/view, instanced ids, agentic validation |

### Reference (new)
| File | Topic |
|---|---|
| `26-async-events-and-queues.md` | `@forge/events` queues, retries, idempotency, long-running work |
| `27-faas-limits-and-cost.md` | Timeouts, memory, KVS quotas, hot-key batching, queue limits |
| `28-forge-remote-and-egress.md` | `permissions.external` (HTTPS + port allowlist), `remotes:`, OAuth |
| `29-custom-field-types.md` | `jira:customField`, `jira:customFieldType` |
| `30-testing-and-tunneling.md` | `forge tunnel`, jest mocks, offline harnesses, parity testing |
| `31-forge-ai-and-llm.md` | `@forge/llm` hosted, BYOK multi-provider adapter, cost guards |
| `32-forge-realtime.md` | `@forge/realtime` live multi-user UI |

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
| `workflow-config-view.yml` | Validator/condition/post-fn create+edit+view split (the condition is a manifest `expression`, no function) |
| `byok-provider-adapter.js` | Unified BYOK AI adapter (OpenAI/Anthropic/Azure/OpenRouter/Bedrock/LM Studio/`@forge/llm`) |
| `forge-llm-cost-guard.js` | Three-layer cost guard (kill-switch + caps + cache-only-clean + metering) |
| `realtime-publisher.js` | `@forge/realtime` metadata-only, never-throw publisher |

## Scripts

CI-safe shell scripts in `scripts/`:

| Script | Purpose |
|---|---|
| `preflight-check.sh` | Verify CLI install, auth, manifest, lint |
| `check-forge-deps.mjs` (template) | **Run first in every deploy script.** Fails the deploy if an `@forge/*` package does not match the lock file or looks stubbed |
| `validate-manifest.sh` | Run `forge lint` with parsed summary |
| `deploy-and-install.sh` | `forge deploy` + `forge install --upgrade` |
| `dev-setup.sh` | Start `forge tunnel` (`-e` for environment) |

Recommended workflow: `preflight-check.sh` → make changes → `validate-manifest.sh` → `deploy-and-install.sh`.

## Changelog

Dated history: `references/CHANGELOG.md` (add new dated entries there, not here).
