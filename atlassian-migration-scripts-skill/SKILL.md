---
name: atlassian-migration-scripts-skill
description: Scaffold idempotent, resumable Atlassian migration scripts in Node.js — Data Center to Cloud or Cloud to Cloud — using the Plan/Sync/Audit triad, native-https clients with 429/5xx retry, post-JCMA ID mapping, identity resolution, seeded-sample audits with CSV spot-check outputs, and Forge KVS remote app-data mending. Use when migrating Jira issues or Confluence pages in bulk, mending Forge app data after JCMA, backfilling custom fields, security levels, or content properties, rewriting macros at scale, fixing broken filter JQL after a tenant move, or building any two-phase Atlassian sync job with audit verification and human-reviewable CSVs.
---

# Atlassian Migration Scripts

Plan, sync, and audit migrations between Atlassian Data Center and Cloud (or Cloud↔Cloud) using idempotent, resumable, zero-dependency Node scripts.

## When to Use This Skill

Use this skill when:
- You're cleaning up data **after** a JCMA (Jira/Confluence Cloud Migration Assistant) run — JCMA handles the bulk move but does not migrate app data, custom field mapping, broken filter references, or any post-cutover repair.
- You're doing a **Cloud → Cloud** tenant consolidation, merging or splitting Atlassian sites.
- You need to **bulk-mutate** thousands of Jira issues or Confluence pages and a one-off curl is unsafe — you want plan-then-mutate with re-runs.
- You're **mending Forge app data** (KVS storage, content/issue properties) post-migration, where the app's stable IDs changed and the data needs to be re-stitched.
- You need a **resumable, idempotent** workflow with CSV outputs for human spot-checking and an audit script to prove the change landed.

Skip this skill for:
- One-off curl / a single REST call (just use `gh api` or curl).
- Migrations that JCMA fully supports out of the box — let JCMA run, then come back here only if it left rough edges.
- Building a Forge app — use `atlassian-jira-forge-skill` or `atlassian-confluence-forge-skill` instead.

## Pick a starting point

- **Scaffolding a new migration sub-project**: `templates/sub-project-skeleton.md` — copy the folder tree, drop in the clients you need, fill the TODOs in the three script templates.
- **The mental model** (Plan→Sync→Audit, two-phase, two-gate): `docs/01-core-concepts.md`.
- **40 production patterns** lifted from real shipped scripts: `docs/24-production-patterns.md`.
- **JSM migration** (the `Service Desk Team` role trap, app-actor permission schemes, Assets remap): `docs/19-jsm-migration-patterns.md` + `templates/jsm-role-preflight.js`.
- **Automation rule migration** (DC has no rule REST; modes: import-clean / reconcile-target / fix-refs; actor model; dedup-by-name): `docs/20-automation-rule-migration.md`.
- **Recovering issues JCMA dropped** (the 14-step find-missing pipeline): `docs/21-post-jcma-issue-recovery.md` + `templates/find-missing-issues.skeleton.md`.
- **Mis-migrated Confluence app macros** (Appfire Composition deck/card → tab-group/tab, default-deny splice rewrite): `docs/22-confluence-app-macro-migration.md` + `templates/composition-macro-rewriter.js`.
- **Rate limits in March 2026** (you almost certainly need to read this): `docs/27-rate-limits-and-quotas.md`.
- **Post-JCMA filter / JQL cleanup**: `docs/10-jql-and-aql-rewriting.md` + `templates/jql-rewriter.js` + `templates/jql-sanitizer.js` + `templates/asset-field-rewriter.js`.
- **Backup & rollback** (Confluence version history, per-entity Jira backups, semantic-hash no-op detection): `docs/09-backup-and-rollback.md`.
- **ADF construction & storage-format surgery**: `docs/11-storage-format-and-adf.md` + `templates/adf-builders.js`.
- **Preflight & drift detection** (don't apply a stale plan): `docs/12-preflight-and-staleness.md` + `templates/preflight.js`.
- **Running & monitoring** (how an AI agent should launch & observe long-running scripts, including the unattended-start contract): `docs/13-running-and-monitoring.md`.
- **Heap & memory** (self-bumping `--max-old-space-size`, JSONL hit streams, ref-release patterns for instance-wide scans): `docs/14-heap-and-memory.md`.
- **Multi-key parallelism** (use N tokens to multiply throughput by N; in-process pool vs. out-of-process dispatcher): `docs/08-concurrency-and-pool.md` (sections at the end).
- **Transitive discovery** (Phase 1b: walk the inverse graph to find orphaned subtask trees, epic children, broken parent links): `docs/15-transitive-discovery.md`.
- **Config-driven multi-field migration** (one script for N option fields via a JSON mapping config): `docs/16-config-driven-multi-field.md` + `templates/field-config-mapper.js`.
- **Post-JCMA audit endpoints** (`approximate-count` for free population checks; the `(migrated)` name-collision cleanup): `docs/17-post-jcma-audit-endpoints.md`.
- **ScriptRunner export & validate-only roundtrip** (Groovy bodies aren't in the workflow API; validate workflow payloads server-side before apply): `docs/18-scriptrunner-and-validate-only.md` + `templates/scriptrunner-exporter.js`.
- **Attachment migration** (streaming download/upload, filename+size fingerprint, retry-safe multipart): `docs/28-adf-and-attachments.md` + `templates/multipart-builder.js` + patterns 31–35 in `docs/24-production-patterns.md`.
- **Forge app-data mending** from outside the app: `docs/29-forge-kvs-remote-mending.md`.

## Quick Reference

| I need to… | Template | Doc |
|---|---|---|
| Scaffold a new migration job | `templates/sub-project-skeleton.md` | `docs/01-core-concepts.md` |
| Discover entities and write a plan | `templates/plan-script.template.js` | `docs/02-plan-manager.md` |
| Apply changes from a saved plan | `templates/sync-script.template.js` | `docs/24-production-patterns.md` |
| Verify the source hasn't drifted since planning | `templates/preflight.js` | `docs/12-preflight-and-staleness.md` |
| Verify changes via sampling | `templates/audit-script.template.js` | `docs/07-audit-and-sampling.md` |
| Make rate-limit-aware API calls | `templates/cloud-jira-client.js` / `templates/cloud-confluence-client.js` | `docs/03-http-client-pattern.md` |
| Upload attachments with retry-safe streaming multipart | `templates/multipart-builder.js` | `docs/28-adf-and-attachments.md` |
| Launch a long-running script and report progress back to the user | (no template — convention) | `docs/13-running-and-monitoring.md` |
| Paginate Jira (post-Aug 2025) | (use `cloud-jira-client.js#searchJql`) | `docs/04-pagination.md` |
| Map DC users/groups → Cloud `accountId`/`groupId` | `templates/identity-resolver.js` | `docs/05-identity-resolution.md` |
| Map source custom field IDs → destination | `templates/cloud-catalog.js#buildFieldMapFrom` | `docs/post-jcma-id-mapping.md` |
| Rewrite JQL post-JCMA (filter IDs, custom field IDs, sanitization) | `templates/jql-rewriter.js` + `templates/jql-sanitizer.js` | `docs/10-jql-and-aql-rewriting.md` |
| Rewrite Assets/CMDB field refs (DC keys/IDs/ARI → Cloud names) | `templates/asset-field-rewriter.js` | `docs/10-jql-and-aql-rewriting.md` |
| Build / mutate / hash ADF documents | `templates/adf-builders.js` | `docs/11-storage-format-and-adf.md` |
| Transform a Jira workflow JSON between tenants | `templates/workflow-transformer.js` | `docs/24-production-patterns.md` (pattern 16) |
| Diff config of two Cloud tenants | `templates/cloud-config-comparator.js` | `docs/24-production-patterns.md` (pattern 26) |
| Emit multi-sheet Excel audit reports | `templates/excel-report-writer.js` (requires `exceljs`) | `docs/24-production-patterns.md` |
| Backup before mutation; rollback later | `templates/backup-manager.js` | `docs/09-backup-and-rollback.md` |
| Snapshot Cloud destination's "shape" once | `templates/cloud-catalog.js` | `docs/24-production-patterns.md` (pattern 20) |
| Refuse to apply a plan to the wrong tenant | `templates/instance-fingerprint.js` | `docs/24-production-patterns.md` (pattern 21) |
| Owner-swap with try/finally + orphan CSV | `templates/owner-swap.js` | `docs/24-production-patterns.md` (pattern 23) |
| Read CSV scope filters or identity overrides | `templates/csv-reader.js` | `docs/06-csv-and-cli-conventions.md` |
| Dual-sink (console + file) logging | `templates/logger.js` | `docs/06-csv-and-cli-conventions.md` |
| Read/write Forge KVS from a remote script | (use Forge `appSystemToken` + REST) | `docs/29-forge-kvs-remote-mending.md` |
| Cap concurrent requests | `templates/worker-pool.js` | `docs/08-concurrency-and-pool.md` |
| Run N parallel workers per API token (in-process multi-key) | `templates/multi-key-pool.js` | `docs/08-concurrency-and-pool.md` (Multi-key) |
| Run N child processes pinned to N tokens (out-of-process) | `templates/dispatcher.js` + `templates/run-driver.sh.template` | `docs/08-concurrency-and-pool.md` (Multi-key) |
| Self-bump Node's heap so instance-wide scans don't OOM | `templates/heap-bumper.js` | `docs/14-heap-and-memory.md` |
| Build a memory-bounded plan from a 100k+ scan (JSONL stream) | (pattern in `docs/14-heap-and-memory.md`) | `docs/14-heap-and-memory.md` |
| Launch a long-running script and have an agent monitor it | (use Bash with `run_in_background: true` + `ScheduleWakeup`) | `docs/13-running-and-monitoring.md` (Unattended start) |
| Find orphaned subtask trees / broken epic-child links by walking the inverse graph | (pattern in `docs/15-transitive-discovery.md`) | `docs/15-transitive-discovery.md` |
| Migrate N option-based fields with one script via a JSON config | `templates/field-config-mapper.js` | `docs/16-config-driven-multi-field.md` |
| Count issues for a JQL without paginating (~1 point) | `templates/cloud-jira-client.js#approximateCount` | `docs/17-post-jcma-audit-endpoints.md` |
| Pair `Field (migrated)` ↔ `Field` duplicates and recommend which to keep | (pattern in `docs/17-post-jcma-audit-endpoints.md`) | `docs/17-post-jcma-audit-endpoints.md` |
| Decide overwrite vs. skip when destination field already has a value | `templates/overwrite-policy.js` | `docs/24-production-patterns.md#36` |
| Flush identity / field / perms caches on Ctrl-C so resume doesn't re-query | `templates/identity-resolver.js#flushCache` | `docs/24-production-patterns.md#37` |
| Export ScriptRunner Groovy workflow rules to an SMS scaffold | `templates/scriptrunner-exporter.js` | `docs/18-scriptrunner-and-validate-only.md` |
| Grant a JSM actor the `Service Desk Team` (or app) role before mutating | `templates/jsm-role-preflight.js` | `docs/19-jsm-migration-patterns.md` |
| Migrate Automation for Jira rules (DC→Cloud / C2C; actor + ID remap) | (scripts in `docs/20-...`) | `docs/20-automation-rule-migration.md` |
| Recover issues JCMA dropped (diff DC vs Cloud, key-preserving re-import) | `templates/find-missing-issues.skeleton.md` | `docs/21-post-jcma-issue-recovery.md` |
| Fix mis-migrated Confluence app macros (deck/card → tab-group/tab) | `templates/composition-macro-rewriter.js` | `docs/22-confluence-app-macro-migration.md` |
| Load an operator-editable XLSX mapping workbook (sheets per category) | `templates/xlsx-mapping-reader.js` | `docs/16-config-driven-multi-field.md` |
| Parse a JCMA "Requires Attention" CSV and verify links/changelogs | (scripts in `docs/17-...`) | `docs/17-post-jcma-audit-endpoints.md` |
| Validate a workflow payload server-side before apply (catches `ruleKey`/ID-remap bugs) | `templates/scriptrunner-exporter.js#validateWorkflowPayload` | `docs/18-scriptrunner-and-validate-only.md` |

## The Plan→Sync→Audit triad

```
SOURCE (DC or Cloud)        DEST (Cloud)
       │                        │
       │  plan-script           │
       │ ─ scan entities ──→ logs/plan_<runId>.json   ┐
       │                                              │  (human spot-check
       │                                              │   via CSV preview)
       │                        │                     ▼
       │  sync-script (--execute-only --plan-file …)
       │ ─ load plan ─ apply ──→ DEST  status→ completed|failed|skipped
       │                        │
       │  audit-script (--seed N)
       │ ─ sample completed ── re-fetch ── compare ──→ logs/audit_<runId>.csv
```

**Two-gate safety on every mutating run:**

| Flag combination | Effect |
|---|---|
| (nothing) | Read-only. Plans, dry-runs, audits all refuse to mutate without `--confirm`. |
| `--dry-run` | Walk the full plan, log every intended change, **never** call PUT/POST/DELETE. Writes backups. |
| `--confirm` | Operator confirms the run is intentional. Required before any mutation. |
| `--dry-run --confirm` | Same as `--dry-run`. Dry-run wins. |

**Two-phase workflow:**

| Flag | Effect |
|---|---|
| `--plan-only` | Build `logs/plan_<runId>.json`, then exit. |
| `--execute-only --plan-file <path>` | Skip discovery; load existing plan; process only `pending` (or `pending` + `failed` with `--retry-failed`). |
| (neither) | Plan then execute in one run. Useful for small jobs. |

## Core skeleton (a complete sync entry point)

```javascript
#!/usr/bin/env node
"use strict";
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const CloudJiraClient = require("../src/cloudJiraClient");
const PlanManager     = require("../src/planManager");
const { parseArgs }   = require("../src/cliFlags");
const { runPool }     = require("../src/workerPool");

(async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.dryRun && !opts.confirm) {
    console.error("Refusing to mutate without --confirm. Use --dry-run for preview.");
    process.exit(2);
  }

  const jira = new CloudJiraClient(
    process.env.CLOUD_BASE_URL, process.env.CLOUD_EMAIL, process.env.CLOUD_API_TOKEN,
  );
  const planManager = new PlanManager(path.resolve(__dirname, "../logs"));
  if (opts.executeOnly) planManager.loadPlan(opts.planFile);
  else                  planManager.createPlan(String(Date.now()));

  if (!opts.executeOnly) {
    // ── discover & populate the plan ──
    // await planManager.addEntry(id, { ... });
  }

  const pending = planManager.getEntriesToProcess(opts.retryFailed);
  await runPool(pending, async ([id, entry]) => {
    if (opts.dryRun) return planManager.updateEntryStatus(id, "skipped", "dry-run");
    try {
      // await jira.updateIssue(entry.issueKey, entry.payload);
      planManager.updateEntryStatus(id, "completed");
    } catch (err) {
      planManager.updateEntryStatus(id, "failed", err.message);
    }
  }, opts.concurrency);

  planManager.savePlan();
  console.log(planManager.formatStats());
})().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
```

## Authentication — what's correct, what's wrong

| Pattern | Use? |
|---|---|
| Cloud: `Authorization: Basic <base64(email:api_token)>` | **Yes** — the canonical way for external Node scripts. Create an API token at id.atlassian.com/manage-profile/security/api-tokens. |
| DC: `Authorization: Basic <base64(username:password)>` | **Yes** — for older Server/DC instances. |
| DC: `Authorization: Bearer <PAT>` | **Yes** — Personal Access Token, preferred on DC 8.14+. |
| Forge KVS remote: forward `x-forge-oauth-system` header from Atlassian → `Authorization: Bearer <token>` on `api.atlassian.com/forge/storage/kvs/v1/...` | **Yes** — see `docs/29-forge-kvs-remote-mending.md`. |
| `Authorization: JWT <token>` from a locally-signed `jsonwebtoken.sign(...)` against a shared secret | **No** — that's Atlassian Connect, not Cloud REST. Connect is end-of-life. |
| `AP.context.getToken()` from `@atlassian/connect-express` | **No** — Connect-only. Not for migration scripts. |
| Putting `client_secret` directly in a URL query string | **No** — OAuth 2.0 (3LO) is for user-consent apps, not unattended migrations. |
| Reusing the same `https.Agent` across DC and Cloud clients | **No** — keep one client instance per host; cookies/session do not cross. |

## The five rules of post-JCMA work

1. **Every numeric ID changes.** `issueId`, `projectId`, `commentId`, `fieldId`, attachment `id` — all freshly minted in Cloud. Only `issueKey` (when project keys don't collide) and `spaceKey` mostly survive. Always build and persist a mapping table at plan time.
2. **`accountId` is the only stable user identifier.** Email may be `null` for privacy-restricted users. Resolve email→`accountId` once at plan time, cache to disk, never compare emails in production code.
3. **Custom field IDs are never portable.** A source `customfield_10042` becomes a destination `customfield_10318` (or anything). Match by display-name + type at planning; persist `{sourceFieldId: destFieldId}` map.
4. **ADF: `set` the whole document, never `add`.** Jira v3 returns/accepts descriptions and comment bodies as ADF JSON. There is no public ADF↔text converter. Build the full ADF tree and PUT/POST it whole.
5. **Attachments need `X-Atlassian-Token: no-check`.** Multipart upload to `POST /rest/api/3/issue/{issueIdOrKey}/attachments` is rejected by CSRF without this header. JCMA can pre-stage attachments via "Migrate attachments in advance" to shrink the cutover window.

## Failure strategies

| Symptom | First-pass fix | Detail |
|---|---|---|
| `429 Too Many Requests` | Honor `Retry-After`, exp-backoff with full jitter, cap 4 retries | `docs/27-rate-limits-and-quotas.md` |
| `409 Conflict` on PUT page or property | Stale `version.number` — GET → bump → PUT | `docs/03-http-client-pattern.md`, Pattern 3 in `docs/24-production-patterns.md` |
| `404` on a custom field by ID | The ID changed post-migration — look up by name + type | `docs/post-jcma-id-mapping.md` |
| Jira `/rest/api/3/search?startAt=…` returns 410 / no `total` | `startAt` was removed Aug 1, 2025 — use `POST /rest/api/3/search/jql` + `nextPageToken` | `docs/04-pagination.md` |
| Confluence v2 pagination loops forever | You're parsing `_links.next` like v1 — v2 uses `Link` header `rel="next"` with opaque cursor | `docs/04-pagination.md` |
| Identity resolver returns `null` for a real user | Email is `null` in privacy mode — fall back to display-name search | `docs/05-identity-resolution.md` |
| Run ate ~80% of the hourly point pool | You're paginating one issue at a time — switch to `POST /issue/bulkfetch` | `docs/27-rate-limits-and-quotas.md` |
| Attachment upload returns 403 (CSRF) | Add header `X-Atlassian-Token: no-check` | `docs/28-adf-and-attachments.md` |
| Plan file ballooning past 100 MB | Switch from in-memory plan to JSONL per-entry + `streamWritePlan` | `docs/02-plan-manager.md` |
| `JavaScript heap out of memory` mid-scan | Self-bump `--max-old-space-size`, stream hits to JSONL, null per-hit refs | `docs/14-heap-and-memory.md` |
| One token's bucket exhausts but tenant pool is fine | Add a second service account's `CLOUD_API_TOKEN_2`, switch to `templates/multi-key-pool.js` | `docs/08-concurrency-and-pool.md` (Multi-key) |
| Multi-hour run; user wants periodic progress without holding the CLI | Launch in background, poll via `ScheduleWakeup` + log-tail snapshots | `docs/13-running-and-monitoring.md` (Unattended start) |
| Forge KVS remote returns 401 | Verify `appSystemToken: true` in manifest **and** scopes `storage:app` + `read:app-system-token` | `docs/29-forge-kvs-remote-mending.md` |
| `400 component.missing.permissions.actor` on a JSM mutation/rule import | Actor isn't in `Service Desk Team` role (site-admin & `/mypermissions` don't count) — run the role pre-flight | `docs/19-jsm-migration-patterns.md` |
| Automation rule create returns `{}` from DC, or rule body empty | DC has no Automation REST API — export from the DC UI, transform, import to Cloud | `docs/20-automation-rule-migration.md` |
| Recovered issue imported under a new key instead of its original | Target key was already taken — importer EDITs instead of creating; re-check keys-free right before import | `docs/21-post-jcma-issue-recovery.md` |

## Rate-limit math (March 2026 enforcement)

Atlassian's points-based model enforces on **March 2, 2026**. Three independent caps run in parallel:

| Cap | Default | Header reason |
|---|---|---|
| Tenant hourly point pool | 65,000 pts (Tier 1) / up to 500,000 pts (Enterprise) | `jira-quota-tenant-based` |
| Burst per second | GET/POST 100/s, PUT/DELETE 50/s | `jira-burst-based` |
| Per-issue writes | 20 writes / 2s, 100 writes / 30s | `jira-per-issue-on-write` |

Pace at ~60 % of burst and ~40 % of hourly to absorb retries without ever surfacing 429. Bulk endpoints (`POST /issue/bulkfetch`, `POST /issue/bulk`, `POST /changelog/bulkfetch`) cost the same as one call — use them. See `docs/27-rate-limits-and-quotas.md` for the full table and a tier calculator.

## Documentation map

### Core mental model
| File | Topic |
|---|---|
| [`01-core-concepts.md`](docs/01-core-concepts.md) | Plan→Sync→Audit triad, two-phase + two-gate, runId, resumability |
| [`02-plan-manager.md`](docs/02-plan-manager.md) | PlanManager class API, JSON shape, autosave, sub-plan splitting, instance signature |
| [`03-http-client-pattern.md`](docs/03-http-client-pattern.md) | Native `https`, retry state machine for 429/5xx/network |
| [`04-pagination.md`](docs/04-pagination.md) | Jira `POST /search/jql` + `nextPageToken`; Confluence v1 cursor; v2 cursor |
| [`05-identity-resolution.md`](docs/05-identity-resolution.md) | DC→Cloud user/group, `accountId` discipline, caches, overrides |
| [`06-csv-and-cli-conventions.md`](docs/06-csv-and-cli-conventions.md) | Standard flags, `logs/` layout, plan/audit CSV columns |
| [`07-audit-and-sampling.md`](docs/07-audit-and-sampling.md) | Mulberry32 seeded RNG, pool selection, expected-vs-actual |
| [`08-concurrency-and-pool.md`](docs/08-concurrency-and-pool.md) | Bounded worker pool, tuning, 429-driven shrinking |

### Format & transform
| File | Topic |
|---|---|
| [`09-backup-and-rollback.md`](docs/09-backup-and-rollback.md) | Confluence version-history restore, per-entity Jira backups, semantic-hash no-op detection, intervention detection |
| [`10-jql-and-aql-rewriting.md`](docs/10-jql-and-aql-rewriting.md) | Filter ID rewriting, custom-field ID rewriting, JQL sanitization, AQL bodies inside JQL, Assets-field rewriting (ARI / key / objectId resolution) |
| [`11-storage-format-and-adf.md`](docs/11-storage-format-and-adf.md) | Storage XHTML surgery (regex vs tree), ADF builders, walker, semantic hash |
| [`12-preflight-and-staleness.md`](docs/12-preflight-and-staleness.md) | Drift detection between plan and apply time, abort thresholds, forward-roll vs backward-roll |
| [`13-running-and-monitoring.md`](docs/13-running-and-monitoring.md) | Progress-line contract, background launch, completion + stall detection, **the AI-agent unattended-start contract** (poll every X seconds, distill log into one-line state), how an AI agent should report status to the user |
| [`14-heap-and-memory.md`](docs/14-heap-and-memory.md) | Self-bumping `--max-old-space-size`, JSONL hit streams, snapshot-then-null per-hit refs, streaming CSV/binary, when `global.gc()` is justified, OOM postmortem |
| [`15-transitive-discovery.md`](docs/15-transitive-discovery.md) | Phase-1b reverse graph walk: inverse JQL by parent/Epic-Link/Parent-Link to find orphaned children; first-writer-wins dedup; bulk Cloud-state check before re-queue |
| [`16-config-driven-multi-field.md`](docs/16-config-driven-multi-field.md) | One JSON config (`config/field_mappings.json`) drives N field migrations; per-field plans; unmapped-values CSV; reuse same config for audit |
| [`17-post-jcma-audit-endpoints.md`](docs/17-post-jcma-audit-endpoints.md) | `POST /search/approximate-count` for free population checks; `(migrated)` suffix detection + pairing + recommendation flow; the audit-endpoint table |
| [`18-scriptrunner-and-validate-only.md`](docs/18-scriptrunner-and-validate-only.md) | ScriptRunner detection in workflows, SMS scaffold export (`extensions.yaml` + Groovy stubs); `validateOnly=true` workflow roundtrip; three-gate apply path |
| [`19-jsm-migration-patterns.md`](docs/19-jsm-migration-patterns.md) | JSM `Service Desk Team` role trap (`component.missing.permissions.actor`), app-actor permission schemes, Assets workspace/object-type remap, customer account types, Request Type rename, SLAs not migrated |
| [`20-automation-rule-migration.md`](docs/20-automation-rule-migration.md) | Automation for Jira migration: gateway REST surface, actor strategies, modes (import-clean / reconcile-target / fix-refs / repoint-actor), dedup-by-name, DC-has-no-rule-REST hybrid flow, ID/ARI remap |
| [`21-post-jcma-issue-recovery.md`](docs/21-post-jcma-issue-recovery.md) | The 14-step find-missing pipeline: DC vs Cloud search key diff, key preservation on re-import, transitive parent recovery, CSV-import + REST fallback, false-positive guards |
| [`22-confluence-app-macro-migration.md`](docs/22-confluence-app-macro-migration.md) | Appfire Composition deck/card → tab-group/tab: CQL discovery, default-deny verification, ancestor stack, back-to-front splice rewrite, 409 + version-truth, rollback; the macro-fix family |

### Patterns, limits, references
| File | Topic |
|---|---|
| [`24-production-patterns.md`](docs/24-production-patterns.md) | 40 patterns extracted from real shipping migration scripts |
| [`27-rate-limits-and-quotas.md`](docs/27-rate-limits-and-quotas.md) | March 2026 points model, headers, backoff math, bulk endpoints |
| [`28-adf-and-attachments.md`](docs/28-adf-and-attachments.md) | ADF set-only, attachment CSRF header, ADF node builders |
| [`29-forge-kvs-remote-mending.md`](docs/29-forge-kvs-remote-mending.md) | `appSystemToken`, `x-forge-oauth-system`, KVS REST surface |
| [`30-testing-migration-scripts.md`](docs/30-testing-migration-scripts.md) | nock fixtures, plan replay, dry-run CI harness |
| [`post-jcma-id-mapping.md`](docs/post-jcma-id-mapping.md) | Which IDs change vs persist; mapping table layout |
| [`gotchas.md`](docs/gotchas.md) | Common pitfalls, environment-specific quirks (now with JQL/AQL/storage/ADF/backup sections) |
| [`when-to-use-which.md`](docs/when-to-use-which.md) | Decision tree: plan vs sync vs audit vs one-shot |

## Templates

Copy-paste-ready files in `templates/`:

### Core scaffolding
| Template | Purpose |
|---|---|
| [`sub-project-skeleton.md`](templates/sub-project-skeleton.md) | Folder tree, zero-dep `package.json`, `.env.example`, file glossary |
| [`plan-manager.js`](templates/plan-manager.js) | Generic resumable PlanManager class (entity-agnostic) |
| [`plan-script.template.js`](templates/plan-script.template.js) | Plan entry-point template with TODO markers |
| [`sync-script.template.js`](templates/sync-script.template.js) | Sync entry-point template with TODO markers |
| [`audit-script.template.js`](templates/audit-script.template.js) | Audit entry-point template (seeded sampling) |
| [`cli-flags.md`](templates/cli-flags.md) | Standard flag table + zero-dep `parseArgs` helper |
| [`env-example.txt`](templates/env-example.txt) | Canonical `.env.example` |

### HTTP clients & infrastructure
| Template | Purpose |
|---|---|
| [`cloud-jira-client.js`](templates/cloud-jira-client.js) | Native-https client with `POST /search/jql`, bulk helpers, retry state machine |
| [`cloud-confluence-client.js`](templates/cloud-confluence-client.js) | Native-https client, v1 CQL + v2 cursor, 409 retry, `restoreVersion` |
| [`datacenter-jira-client.js`](templates/datacenter-jira-client.js) | DC variant: basic + PAT auth, `startAt` pagination |
| [`datacenter-confluence-client.js`](templates/datacenter-confluence-client.js) | DC variant: basic + PAT auth, CQL, http/https selection |
| [`identity-resolver.js`](templates/identity-resolver.js) | Email-first + displayName fallback, on-disk cache, CSV override |
| [`worker-pool.js`](templates/worker-pool.js) | Zero-dep bounded concurrency (~30 lines) |
| [`multi-key-pool.js`](templates/multi-key-pool.js) | K-client × W-worker pool — one client per API token, fixed worker→client binding for cache locality |
| [`dispatcher.js`](templates/dispatcher.js) | Out-of-process dispatcher: one child per slot/token, persistent state JSON, slot-to-job assignment survives Ctrl-C |
| [`run-driver.sh.template`](templates/run-driver.sh.template) | Bash equivalent: `xargs -P N` driver pinned to one `CLOUD_API_TOKEN_X`, runs M sub-plans concurrently |
| [`heap-bumper.js`](templates/heap-bumper.js) | Self-bump `--max-old-space-size` + `--expose-gc` via single re-exec at script start — paste in first line of `main/*.js` |
| [`field-config-mapper.js`](templates/field-config-mapper.js) | Config-driven multi-field mapper — loads `field_mappings.json`, handles string/option/multi-select shapes, aggregates unmapped values |
| [`overwrite-policy.js`](templates/overwrite-policy.js) | Three-way decision matrix (skip-empty / write / overwrite / skip-noop / skip-target-not-empty) with type-aware equality for option fields and multi-selects |
| [`scriptrunner-exporter.js`](templates/scriptrunner-exporter.js) | Detect ScriptRunner-shaped workflow rules across collected workflows; emit `extensions.yaml` + Groovy stubs; static helper for `validateOnly=true` workflow roundtrip |
| [`csv-writer.js`](templates/csv-writer.js) | Streaming RFC-4180 CSV writer, zero-dep |
| [`multipart-builder.js`](templates/multipart-builder.js) | RFC-7578 multipart/form-data envelope with a retry-safe body factory — use for any binary upload that must survive 429/5xx |

### Transform helpers
| Template | Purpose |
|---|---|
| [`adf-builders.js`](templates/adf-builders.js) | ADF node builders, walker, mutator, prune, semantic hash |
| [`jql-rewriter.js`](templates/jql-rewriter.js) | Filter ID + custom-field ID rewriters, AQL function-body wrapper |
| [`jql-sanitizer.js`](templates/jql-sanitizer.js) | Quoted-string-aware sanitizer: field renames, operator uppercasing, IN-list quoting, paren-less function fix |
| [`asset-field-rewriter.js`](templates/asset-field-rewriter.js) | Rewrite direct Assets/CMDB field refs (ARI / key / DC objectId → Cloud name), masks aqlFunction blocks |
| [`workflow-transformer.js`](templates/workflow-transformer.js) | Walk a workflow JSON, remap status/customField/screen/group/role IDs, drop dropped-statuses' transitions and globbed rule keys, clean JMWE prefix corruption |
| [`cloud-config-comparator.js`](templates/cloud-config-comparator.js) | Diff fields / statuses / issueTypes / linkTypes / priorities / resolutions between two Cloud tenants — `{missingInDest, extraInDest, changed}` per resource |
| [`excel-report-writer.js`](templates/excel-report-writer.js) | Multi-sheet workbook with status-color fills, frozen headers, auto-filter (requires `exceljs`) |
| [`backup-manager.js`](templates/backup-manager.js) | Per-entity snapshots, semantic hashing helpers, Confluence version-history rollback |
| [`cloud-catalog.js`](templates/cloud-catalog.js) | Snapshot fields/statuses/roles/groups/projects once; build source→dest field map |
| [`instance-fingerprint.js`](templates/instance-fingerprint.js) | Stamp + verify (source, destination) baseUrl pair on each plan |
| [`owner-swap.js`](templates/owner-swap.js) | Filter/dashboard owner-swap with try/finally + orphan-CSV on restore failure |
| [`preflight.js`](templates/preflight.js) | Pre-sync drift detection: compare planned source state vs live source, bucket results, abort threshold |
| [`logger.js`](templates/logger.js) | Dual-sink (console + file) logger with ISO timestamps and level filtering |
| [`csv-reader.js`](templates/csv-reader.js) | RFC-4180 CSV reader for scope filtering and identity overrides |
| [`jsm-role-preflight.js`](templates/jsm-role-preflight.js) | Grant a JSM actor the `Service Desk Team` role (or the app-actor permission-scheme grant) before mutating; discover Assets workspaceId |
| [`composition-macro-rewriter.js`](templates/composition-macro-rewriter.js) | Storage-XHTML app-macro rewriter: ancestor-stack walk, default-deny verification, back-to-front splice, param rename-with-conflict-delete, semantic-hash idempotency |
| [`xlsx-mapping-reader.js`](templates/xlsx-mapping-reader.js) | Read an operator-editable XLSX mapping workbook (sheets per category) into the apply scripts' mappings object (requires `exceljs`) |
| [`find-missing-issues.skeleton.md`](templates/find-missing-issues.skeleton.md) | The 14-step post-JCMA issue-recovery pipeline as a runnable skeleton (DC vs Cloud search, key preservation, false-positive guards) |

## Scripts

CI-safe bash helpers in `scripts/`:

| Script | Purpose |
|---|---|
| [`preflight-check.sh`](scripts/preflight-check.sh) | Verify Node ≥20, `.env` present, base URLs reachable |
| [`test-auth.sh`](scripts/test-auth.sh) | Hit `/myself` on Cloud and DC, report OK/FAIL per host |
| [`new-script.sh`](scripts/new-script.sh) | Scaffold a new sub-project from the skeleton template |
| [`lint-plan-file.sh`](scripts/lint-plan-file.sh) | `jq`-validate plan JSON shape and per-entry status enum |
| [`audit-summary.sh`](scripts/audit-summary.sh) | Aggregate pass/fail counts across `logs/audit_*.csv` |

Recommended workflow: `preflight-check.sh` → `test-auth.sh` → `new-script.sh my-job` → fill TODOs → run `--plan-only` → `lint-plan-file.sh logs/plan_*.json` → run `--execute-only --dry-run` → run with `--confirm` → run audit script → `audit-summary.sh`.

## Changelog

- **2026-06-26 (JSM + automation + recovery + macro pass)** Distilled four new sub-disciplines from VAL-migration-scripts (OpenBet C2C, McLaren DC→Cloud). New docs: `19-jsm-migration-patterns.md` (the **`Service Desk Team` role trap** — JSM actor mutations 400 with `component.missing.permissions.actor` unless the actor is in the agent role; site-admin and `/mypermissions` don't count; plus app-actor `atlassian-addons-project-access`, Assets object-type-by-label remap, customer account types), `20-automation-rule-migration.md` (gateway REST surface, actor strategies, modes import-clean/reconcile-target/fix-refs/repoint-actor, **dedup-by-NAME silent skip**, **DC has no Automation REST API** → hybrid UI-export flow), `21-post-jcma-issue-recovery.md` (the 14-step find-missing pipeline: DC vs Cloud search key diff, conditional key preservation on re-import, transitive parent recovery, re-keyed-as-label false-positive guards), `22-confluence-app-macro-migration.md` (Composition deck/card → tab-group/tab; default-deny verification, ancestor stack, back-to-front splice, server-truth post-409 version). Enhanced `16` (XLSX-workbook mapping, pre-run field analysis, `multi_field_copy` one-to-many) and `17` (c2c-postmigration suite: JCMA "Requires Attention" CSV, verify-issue-links, compare-changelogs). Patterns 38–40 in `24`. New gotchas sections incl. org-level account ops (suspension is **org-admin** — see `atlassian-organizations-api-skill`). New templates: `jsm-role-preflight.js`, `composition-macro-rewriter.js`, `xlsx-mapping-reader.js`, `find-missing-issues.skeleton.md`. Noted Bitbucket (BBMA) out of scope.
- **2026-05-26 (second survey pass — 7 new patterns)** Continued the survey across `sync_issue_parents`, `sync_traffic_light_fields`, `c2c-postmigration`, `field-merge-script`, `clone_workflow_rules`. Seven new patterns added: (1) **Phase-1b transitive discovery** — walk inverse JQL by parent / Epic Link / Parent Link to find orphaned children the operator's JQL didn't cover, with first-writer-wins dedup and bulk Cloud-state filtering. `docs/15-transitive-discovery.md`. (2) **Config-driven multi-field migration** — one JSON config (`field_mappings.json`) drives N option-field migrations; per-field plans naturally enable multi-key parallelism; unmapped-value CSV stops silent value drops. `docs/16-config-driven-multi-field.md` + `templates/field-config-mapper.js`. (3) **`approximate-count` endpoint** — `POST /rest/api/3/search/approximate-count` returns issue counts without pagination at ~1 point, 1000× more efficient than full pagination for "is there work to do?" questions. Now in `templates/cloud-jira-client.js`. (4) **`(migrated)` field pairing** — JCMA's name-collision strategy renames colliding destination fields with a `(migrated)` suffix; the discover-quantify-recommend audit triad cleans these up. Both in `docs/17-post-jcma-audit-endpoints.md`. (5) **Three-way overwrite policy** — `--skip-empty` / `--overwrite-existing` / `--treat-equal-as-noop` decision matrix; default skip-target-not-empty prevents silent user-edit overwrites in long-running plans. `templates/overwrite-policy.js`, pattern 36. (6) **Auxiliary cache flush on shutdown** — pattern 35 (plan + master) refined: identity/field/perms caches also need flush on SIGINT, otherwise resume re-queries thousands of paid lookups. `flushCache()` added to `templates/identity-resolver.js`; pattern 37. (7) **ScriptRunner export + validate-only roundtrip** — ScriptRunner Groovy bodies aren't in the workflow API, so emit an SMS scaffold (`extensions.yaml` + Groovy stubs) for human paste; `validateOnly=true` on workflow create/update surfaces ruleKey and ID-remap bugs at validation cost (1 pt) rather than apply cost. `docs/18-scriptrunner-and-validate-only.md` + `templates/scriptrunner-exporter.js`.
- **2026-05-26 (mega-scale resilience pass)** Distilled the heap, multi-key, and unattended-agent patterns from `recover_truncated_content` and `sync_asset_ticket_associations`. New `docs/14-heap-and-memory.md` covering the canonical OOM defenses: self-bumping `--max-old-space-size` via single re-exec at startup, append-only JSONL hit stream during plan-build, snapshot-then-null per-hit refs, streamed CSV writers, streaming binary I/O, when `global.gc()` is actually justified, and an OOM postmortem playbook. Expanded `docs/08-concurrency-and-pool.md` with two new sections on multi-key parallelism: an in-process K-clients × W-workers pool (one client per `CLOUD_API_TOKEN_X`) and an out-of-process dispatcher (one Node child per token-slot with persistent state JSON). Added decision matrix for picking between them, token hygiene rules, and rate-limit math explaining when extra tokens stop helping (tenant pool exhausted). Expanded `docs/13-running-and-monitoring.md` with the AI-agent unattended-start contract: refuse-without-confirm, smoke-test-then-background-launch, capture log path once, poll on a cadence aligned to prompt-cache TTL (60–270s or 1200–1800s — avoid the 300s worst-case), per-tick snapshot commands (5 parallel greps), stall detection via two-of-three signals, an end-loudly final message format. New templates: `heap-bumper.js`, `multi-key-pool.js`, `dispatcher.js`, `run-driver.sh.template`. Updated `env-example.txt` to document `CLOUD_API_TOKEN_2..N` slots.
- **2026-05-19 (attachment sync + agent-observation pass)** Distilled the new `sync_issue_attachments` sub-project (jira-data) into the skill. Added `docs/13-running-and-monitoring.md` — the first doc explicitly aimed at an *AI agent observer* of a long-running script (progress-line contract, background launch, FINAL REPORT marker, stall detection, how to report status back to the user without echoing the log). Added `templates/multipart-builder.js` — retry-safe streaming multipart with a body-factory pattern, the upload primitive missing from `cloud-jira-client.js#uploadAttachment` (which buffers the whole file in memory and cannot be retried after a 429). Added patterns 31–35 to `24-production-patterns.md`: streaming multipart with body factory, streaming binary download with redirect-following, filename+size fingerprint as idempotency key, destination-policy preflight (Cloud `/configuration` + `--max-bytes` override + 413 reclassification), graceful shutdown that flushes both plan and master index. Expanded `28-adf-and-attachments.md` with the canonical attachment re-upload pattern (plan→download→upload with disk staging). Expanded `gotchas.md` with seven attachment-specific footguns (retry-safety of multipart, 413 mid-upload, redirect handling, filename sanitization for disk, fingerprint re-check at execute, single-element response array) and a new "Running and monitoring (agent observation)" section.
- **2026-05-18 (initial release + three enrichment passes)** Distilled ~25 production migration sub-projects into the core skill: PlanManager, native-`https` clients with separate 429/5xx/network retry counters, two-phase + two-gate execution, Mulberry32 sampling audits, identity resolution (email→accountId), Forge KVS remote mending via `appSystemToken`, post-Aug-2025 pagination (`POST /search/jql` + `nextPageToken`, no `total`), and March-2026 rate-limit guidance. Successive passes added docs 02/04/09–12 and templates for JQL rewrite/sanitize, ADF builders, backup-manager (version-history rollback + intervention detection), instance fingerprinting, asset/CMDB field rewriting, owner-swap, preflight/staleness, logger, CSV reader, workflow-transformer, cloud-config-comparator, and excel-report-writer; production patterns grew from 12 to 30 (semantic-hash no-op, multi-pass pipeline, state machine, sub-plan splitting, stratified sampling, discovery-dump, lossy-parameter audit, two-sided backup-restore).

## Support & Resources

- [Jira Cloud REST API v3](https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/)
- [Confluence Cloud REST API v2](https://developer.atlassian.com/cloud/confluence/rest/v2/intro/)
- [Jira rate limiting (Mar 2026)](https://developer.atlassian.com/cloud/jira/platform/rate-limiting/)
- [Atlassian migration best practices](https://support.atlassian.com/migration/docs/migration-best-practices/)
- [Forge remote storage access](https://developer.atlassian.com/platform/forge/remote/accessing-storage/)
- [JCMA user-API migration guide](https://developer.atlassian.com/cloud/jira/platform/deprecation-notice-user-privacy-api-migration-guide/)
