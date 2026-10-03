---
name: atlassian-migration
description: >-
  Atlassian migrations, both kinds, in one skill. (1) PLAN/SYNC/AUDIT migration scripts in Node.js —
  Data Center to Cloud or Cloud to Cloud: idempotent, resumable jobs with native-https clients and
  429/5xx retry, post-JCMA ID mapping and repair, identity resolution, seeded-sample audits with CSV
  spot-check outputs, Forge KVS remote app-data mending, bulk custom-field/security-level/content-property
  backfills, macro rewriting at scale, broken filter JQL after a tenant move. (2) CLOUD-TO-CLOUD copy over
  REST when the native transfer cannot be used: busy production target, issue keys AND numbers preserved,
  only a subset moves, KEEP-list anonymisation and attachment privacy scanning, silent loading (no
  notification spam), JSM desks on own config, sprints/links/boards, users and seats, test-management
  data, guard dog, verification, source snapshot and a decision log with reverts. Use for "migrate
  projects/spaces to another Atlassian cloud site", "copy Jira between cloud instances keeping keys",
  "cloud to cloud without the migration tool", "anonymise users during migration", "load without
  spamming users", cleaning up after JCMA, mending Forge app data after a migration, or any two-phase
  Atlassian sync job with audit verification. Formerly two skills: atlassian-migration-scripts-skill
  and atlassian-cloud-to-cloud-migration-skill.
---

# Atlassian Migration

One skill, two tracks. They share the same discipline (plan before you write, never blind-retry a write,
prove every negative, audit with an independent method) and link to each other instead of repeating.

| Your job | Track | Start at |
|---|---|---|
| Writing migration / bulk data-fix scripts (DC→Cloud or Cloud↔Cloud), post-JCMA repair, Forge KVS mending, filter JQL rewrites, macro rewrites | **Plan/Sync/Audit** — `plan-sync-audit/` | the "Plan→Sync→Audit triad" below, then `plan-sync-audit/docs/` |
| Copying whole Jira projects (incl. JSM desks) and Confluence spaces between two CLOUD sites over REST, keeping keys, under a privacy/KEEP list, without e-mailing anyone | **Cloud-to-Cloud copy** — `cloud-to-cloud/` | "The run, on one screen" below, then `cloud-to-cloud/docs/01-core-concepts.md` |

Neighbours: org-level user/group/policy work → `atlassian-organizations-api-skill`; Automation rules →
`automation-engineer`; plain Jira/Confluence REST from an external app → `jira-api-skill` / `confluence-api-skill`.

## Track 1 — Plan/Sync/Audit migration scripts (`plan-sync-audit/`)

Plan, sync, and audit migrations between Atlassian Data Center and Cloud (or Cloud↔Cloud) using idempotent, resumable, zero-dependency Node scripts.

### When to Use This Skill

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

### Pick a starting point

- **Scaffolding a new migration sub-project**: `plan-sync-audit/templates/sub-project-skeleton.md` — copy the folder tree, drop in the clients you need, fill the TODOs in the three script templates.
- **The mental model** (Plan→Sync→Audit, two-phase, two-gate): `plan-sync-audit/docs/01-core-concepts.md`.
- **40 production patterns** lifted from real shipped scripts: `plan-sync-audit/docs/24-production-patterns.md`.
- **JSM migration** (the `Service Desk Team` role trap, app-actor permission schemes, Assets remap): `plan-sync-audit/docs/19-jsm-migration-patterns.md` + `plan-sync-audit/templates/jsm-role-preflight.js`.
- **Automation rule migration** (DC has no rule REST; modes: import-clean / reconcile-target / fix-refs; actor model; dedup-by-name): `plan-sync-audit/docs/20-automation-rule-migration.md`.
- **Recovering issues JCMA dropped** (the 14-step find-missing pipeline): `plan-sync-audit/docs/21-post-jcma-issue-recovery.md` + `plan-sync-audit/templates/find-missing-issues.skeleton.md`.
- **Mis-migrated Confluence app macros** (Appfire Composition deck/card → tab-group/tab, default-deny splice rewrite): `plan-sync-audit/docs/22-confluence-app-macro-migration.md` + `plan-sync-audit/templates/composition-macro-rewriter.js`.
- **Rate limits in March 2026** (you almost certainly need to read this): `plan-sync-audit/docs/27-rate-limits-and-quotas.md`.
- **Post-JCMA filter / JQL cleanup**: `plan-sync-audit/docs/10-jql-and-aql-rewriting.md` + `plan-sync-audit/templates/jql-rewriter.js` + `plan-sync-audit/templates/jql-sanitizer.js` + `plan-sync-audit/templates/asset-field-rewriter.js`.
- **Backup & rollback** (Confluence version history, per-entity Jira backups, semantic-hash no-op detection): `plan-sync-audit/docs/09-backup-and-rollback.md`.
- **ADF construction & storage-format surgery**: `plan-sync-audit/docs/11-storage-format-and-adf.md` + `plan-sync-audit/templates/adf-builders.js`.
- **Preflight & drift detection** (don't apply a stale plan): `plan-sync-audit/docs/12-preflight-and-staleness.md` + `plan-sync-audit/templates/preflight.js`.
- **Running & monitoring** (how an AI agent should launch & observe long-running scripts, including the unattended-start contract): `plan-sync-audit/docs/13-running-and-monitoring.md`.
- **Heap & memory** (self-bumping `--max-old-space-size`, JSONL hit streams, ref-release patterns for instance-wide scans): `plan-sync-audit/docs/14-heap-and-memory.md`.
- **Multi-key parallelism** (use N tokens to multiply throughput by N; in-process pool vs. out-of-process dispatcher): `plan-sync-audit/docs/08-concurrency-and-pool.md` (sections at the end).
- **Transitive discovery** (Phase 1b: walk the inverse graph to find orphaned subtask trees, epic children, broken parent links): `plan-sync-audit/docs/15-transitive-discovery.md`.
- **Config-driven multi-field migration** (one script for N option fields via a JSON mapping config): `plan-sync-audit/docs/16-config-driven-multi-field.md` + `plan-sync-audit/templates/field-config-mapper.js`.
- **Post-JCMA audit endpoints** (`approximate-count` for free population checks; the `(migrated)` name-collision cleanup): `plan-sync-audit/docs/17-post-jcma-audit-endpoints.md`.
- **ScriptRunner export & validate-only roundtrip** (Groovy bodies aren't in the workflow API; validate workflow payloads server-side before apply): `plan-sync-audit/docs/18-scriptrunner-and-validate-only.md` + `plan-sync-audit/templates/scriptrunner-exporter.js`.
- **Attachment migration** (streaming download/upload, filename+size fingerprint, retry-safe multipart): `plan-sync-audit/docs/28-adf-and-attachments.md` + `plan-sync-audit/templates/multipart-builder.js` + patterns 31–35 in `plan-sync-audit/docs/24-production-patterns.md`.
- **Forge app-data mending** from outside the app: `plan-sync-audit/docs/29-forge-kvs-remote-mending.md`.

### Quick Reference

| I need to… | Template | Doc |
|---|---|---|
| Scaffold a new migration job | `plan-sync-audit/templates/sub-project-skeleton.md` | `plan-sync-audit/docs/01-core-concepts.md` |
| Discover entities and write a plan | `plan-sync-audit/templates/plan-script.template.js` | `plan-sync-audit/docs/02-plan-manager.md` |
| Apply changes from a saved plan | `plan-sync-audit/templates/sync-script.template.js` | `plan-sync-audit/docs/24-production-patterns.md` |
| Verify the source hasn't drifted since planning | `plan-sync-audit/templates/preflight.js` | `plan-sync-audit/docs/12-preflight-and-staleness.md` |
| Verify changes via sampling | `plan-sync-audit/templates/audit-script.template.js` | `plan-sync-audit/docs/07-audit-and-sampling.md` |
| Make rate-limit-aware API calls | `plan-sync-audit/templates/cloud-jira-client.js` / `plan-sync-audit/templates/cloud-confluence-client.js` | `plan-sync-audit/docs/03-http-client-pattern.md` |
| Upload attachments with retry-safe streaming multipart | `plan-sync-audit/templates/multipart-builder.js` | `plan-sync-audit/docs/28-adf-and-attachments.md` |
| Launch a long-running script and report progress back to the user | (no template — convention) | `plan-sync-audit/docs/13-running-and-monitoring.md` |
| Paginate Jira (post-Aug 2025) | (use `cloud-jira-client.js#searchJql`) | `plan-sync-audit/docs/04-pagination.md` |
| Map DC users/groups → Cloud `accountId`/`groupId` | `plan-sync-audit/templates/identity-resolver.js` | `plan-sync-audit/docs/05-identity-resolution.md` |
| Map source custom field IDs → destination | `plan-sync-audit/templates/cloud-catalog.js#buildFieldMapFrom` | `plan-sync-audit/docs/post-jcma-id-mapping.md` |
| Rewrite JQL post-JCMA (filter IDs, custom field IDs, sanitization) | `plan-sync-audit/templates/jql-rewriter.js` + `plan-sync-audit/templates/jql-sanitizer.js` | `plan-sync-audit/docs/10-jql-and-aql-rewriting.md` |
| Rewrite Assets/CMDB field refs (DC keys/IDs/ARI → Cloud names) | `plan-sync-audit/templates/asset-field-rewriter.js` | `plan-sync-audit/docs/10-jql-and-aql-rewriting.md` |
| Build / mutate / hash ADF documents | `plan-sync-audit/templates/adf-builders.js` | `plan-sync-audit/docs/11-storage-format-and-adf.md` |
| Transform a Jira workflow JSON between tenants | `plan-sync-audit/templates/workflow-transformer.js` | `plan-sync-audit/docs/24-production-patterns.md` (pattern 16) |
| Diff config of two Cloud tenants | `plan-sync-audit/templates/cloud-config-comparator.js` | `plan-sync-audit/docs/24-production-patterns.md` (pattern 26) |
| Emit multi-sheet Excel audit reports | `plan-sync-audit/templates/excel-report-writer.js` (requires `exceljs`) | `plan-sync-audit/docs/24-production-patterns.md` |
| Backup before mutation; rollback later | `plan-sync-audit/templates/backup-manager.js` | `plan-sync-audit/docs/09-backup-and-rollback.md` |
| Snapshot Cloud destination's "shape" once | `plan-sync-audit/templates/cloud-catalog.js` | `plan-sync-audit/docs/24-production-patterns.md` (pattern 20) |
| Refuse to apply a plan to the wrong tenant | `plan-sync-audit/templates/instance-fingerprint.js` | `plan-sync-audit/docs/24-production-patterns.md` (pattern 21) |
| Owner-swap with try/finally + orphan CSV | `plan-sync-audit/templates/owner-swap.js` | `plan-sync-audit/docs/24-production-patterns.md` (pattern 23) |
| Read CSV scope filters or identity overrides | `plan-sync-audit/templates/csv-reader.js` | `plan-sync-audit/docs/06-csv-and-cli-conventions.md` |
| Dual-sink (console + file) logging | `plan-sync-audit/templates/logger.js` | `plan-sync-audit/docs/06-csv-and-cli-conventions.md` |
| Read/write Forge KVS from a remote script | (use Forge `appSystemToken` + REST) | `plan-sync-audit/docs/29-forge-kvs-remote-mending.md` |
| Cap concurrent requests | `plan-sync-audit/templates/worker-pool.js` | `plan-sync-audit/docs/08-concurrency-and-pool.md` |
| Run N parallel workers per API token (in-process multi-key) | `plan-sync-audit/templates/multi-key-pool.js` | `plan-sync-audit/docs/08-concurrency-and-pool.md` (Multi-key) |
| Run N child processes pinned to N tokens (out-of-process) | `plan-sync-audit/templates/dispatcher.js` + `plan-sync-audit/templates/run-driver.sh.template` | `plan-sync-audit/docs/08-concurrency-and-pool.md` (Multi-key) |
| Self-bump Node's heap so instance-wide scans don't OOM | `plan-sync-audit/templates/heap-bumper.js` | `plan-sync-audit/docs/14-heap-and-memory.md` |
| Build a memory-bounded plan from a 100k+ scan (JSONL stream) | (pattern in `plan-sync-audit/docs/14-heap-and-memory.md`) | `plan-sync-audit/docs/14-heap-and-memory.md` |
| Launch a long-running script and have an agent monitor it | (use Bash with `run_in_background: true` + `ScheduleWakeup`) | `plan-sync-audit/docs/13-running-and-monitoring.md` (Unattended start) |
| Find orphaned subtask trees / broken epic-child links by walking the inverse graph | (pattern in `plan-sync-audit/docs/15-transitive-discovery.md`) | `plan-sync-audit/docs/15-transitive-discovery.md` |
| Migrate N option-based fields with one script via a JSON config | `plan-sync-audit/templates/field-config-mapper.js` | `plan-sync-audit/docs/16-config-driven-multi-field.md` |
| Count issues for a JQL without paginating (~1 point) | `plan-sync-audit/templates/cloud-jira-client.js#approximateCount` | `plan-sync-audit/docs/17-post-jcma-audit-endpoints.md` |
| Pair `Field (migrated)` ↔ `Field` duplicates and recommend which to keep | (pattern in `plan-sync-audit/docs/17-post-jcma-audit-endpoints.md`) | `plan-sync-audit/docs/17-post-jcma-audit-endpoints.md` |
| Decide overwrite vs. skip when destination field already has a value | `plan-sync-audit/templates/overwrite-policy.js` | `plan-sync-audit/docs/24-production-patterns.md#36` |
| Flush identity / field / perms caches on Ctrl-C so resume doesn't re-query | `plan-sync-audit/templates/identity-resolver.js#flushCache` | `plan-sync-audit/docs/24-production-patterns.md#37` |
| Export ScriptRunner Groovy workflow rules to an SMS scaffold | `plan-sync-audit/templates/scriptrunner-exporter.js` | `plan-sync-audit/docs/18-scriptrunner-and-validate-only.md` |
| Grant a JSM actor the `Service Desk Team` (or app) role before mutating | `plan-sync-audit/templates/jsm-role-preflight.js` | `plan-sync-audit/docs/19-jsm-migration-patterns.md` |
| Migrate Automation for Jira rules (DC→Cloud / C2C; actor + ID remap) | (scripts in `plan-sync-audit/docs/20-...`) | `plan-sync-audit/docs/20-automation-rule-migration.md` |
| Recover issues JCMA dropped (diff DC vs Cloud, key-preserving re-import) | `plan-sync-audit/templates/find-missing-issues.skeleton.md` | `plan-sync-audit/docs/21-post-jcma-issue-recovery.md` |
| Fix mis-migrated Confluence app macros (deck/card → tab-group/tab) | `plan-sync-audit/templates/composition-macro-rewriter.js` | `plan-sync-audit/docs/22-confluence-app-macro-migration.md` |
| Load an operator-editable XLSX mapping workbook (sheets per category) | `plan-sync-audit/templates/xlsx-mapping-reader.js` | `plan-sync-audit/docs/16-config-driven-multi-field.md` |
| Parse a JCMA "Requires Attention" CSV and verify links/changelogs | (scripts in `plan-sync-audit/docs/17-...`) | `plan-sync-audit/docs/17-post-jcma-audit-endpoints.md` |
| Validate a workflow payload server-side before apply (catches `ruleKey`/ID-remap bugs) | `plan-sync-audit/templates/scriptrunner-exporter.js#validateWorkflowPayload` | `plan-sync-audit/docs/18-scriptrunner-and-validate-only.md` |

### The Plan→Sync→Audit triad

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

### Core skeleton (a complete sync entry point)

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

### Authentication — what's correct, what's wrong

| Pattern | Use? |
|---|---|
| Cloud: `Authorization: Basic <base64(email:api_token)>` | **Yes** — the canonical way for external Node scripts. Create an API token at id.atlassian.com/manage-profile/security/api-tokens. |
| DC: `Authorization: Basic <base64(username:password)>` | **Yes** — for older Server/DC instances. |
| DC: `Authorization: Bearer <PAT>` | **Yes** — Personal Access Token, preferred on DC 8.14+. |
| Forge KVS remote: forward `x-forge-oauth-system` header from Atlassian → `Authorization: Bearer <token>` on `api.atlassian.com/forge/storage/kvs/v1/...` | **Yes** — see `plan-sync-audit/docs/29-forge-kvs-remote-mending.md`. |
| `Authorization: JWT <token>` from a locally-signed `jsonwebtoken.sign(...)` against a shared secret | **No** — that's Atlassian Connect, not Cloud REST. Connect is end-of-life. |
| `AP.context.getToken()` from `@atlassian/connect-express` | **No** — Connect-only. Not for migration scripts. |
| Putting `client_secret` directly in a URL query string | **No** — OAuth 2.0 (3LO) is for user-consent apps, not unattended migrations. |
| Reusing the same `https.Agent` across DC and Cloud clients | **No** — keep one client instance per host; cookies/session do not cross. |

### The five rules of post-JCMA work

1. **Every numeric ID changes.** `issueId`, `projectId`, `commentId`, `fieldId`, attachment `id` — all freshly minted in Cloud. Only `issueKey` (when project keys don't collide) and `spaceKey` mostly survive. Always build and persist a mapping table at plan time.
2. **`accountId` is the only stable user identifier.** Email may be `null` for privacy-restricted users. Resolve email→`accountId` once at plan time, cache to disk, never compare emails in production code.
3. **Custom field IDs are never portable.** A source `customfield_10042` becomes a destination `customfield_10318` (or anything). Match by display-name + type at planning; persist `{sourceFieldId: destFieldId}` map.
4. **ADF: `set` the whole document, never `add`.** Jira v3 returns/accepts descriptions and comment bodies as ADF JSON. There is no public ADF↔text converter. Build the full ADF tree and PUT/POST it whole.
5. **Attachments need `X-Atlassian-Token: no-check`.** Multipart upload to `POST /rest/api/3/issue/{issueIdOrKey}/attachments` is rejected by CSRF without this header. JCMA can pre-stage attachments via "Migrate attachments in advance" to shrink the cutover window.

### Failure strategies

| Symptom | First-pass fix | Detail |
|---|---|---|
| `429 Too Many Requests` | Honor `Retry-After`, exp-backoff with full jitter, cap 4 retries | `plan-sync-audit/docs/27-rate-limits-and-quotas.md` |
| `409 Conflict` on PUT page or property | Stale `version.number` — GET → bump → PUT | `plan-sync-audit/docs/03-http-client-pattern.md`, Pattern 3 in `plan-sync-audit/docs/24-production-patterns.md` |
| `404` on a custom field by ID | The ID changed post-migration — look up by name + type | `plan-sync-audit/docs/post-jcma-id-mapping.md` |
| Jira `/rest/api/3/search?startAt=…` returns 410 / no `total` | `startAt` was removed Aug 1, 2025 — use `POST /rest/api/3/search/jql` + `nextPageToken` | `plan-sync-audit/docs/04-pagination.md` |
| Confluence v2 pagination loops forever | You're parsing `_links.next` like v1 — v2 uses `Link` header `rel="next"` with opaque cursor | `plan-sync-audit/docs/04-pagination.md` |
| Identity resolver returns `null` for a real user | Email is `null` in privacy mode — fall back to display-name search | `plan-sync-audit/docs/05-identity-resolution.md` |
| Run ate ~80% of the hourly point pool | You're paginating one issue at a time — switch to `POST /issue/bulkfetch` | `plan-sync-audit/docs/27-rate-limits-and-quotas.md` |
| Attachment upload returns 403 (CSRF) | Add header `X-Atlassian-Token: no-check` | `plan-sync-audit/docs/28-adf-and-attachments.md` |
| Plan file ballooning past 100 MB | Switch from in-memory plan to JSONL per-entry + `streamWritePlan` | `plan-sync-audit/docs/02-plan-manager.md` |
| `JavaScript heap out of memory` mid-scan | Self-bump `--max-old-space-size`, stream hits to JSONL, null per-hit refs | `plan-sync-audit/docs/14-heap-and-memory.md` |
| One token's bucket exhausts but tenant pool is fine | Add a second service account's `CLOUD_API_TOKEN_2`, switch to `plan-sync-audit/templates/multi-key-pool.js` | `plan-sync-audit/docs/08-concurrency-and-pool.md` (Multi-key) |
| Multi-hour run; user wants periodic progress without holding the CLI | Launch in background, poll via `ScheduleWakeup` + log-tail snapshots | `plan-sync-audit/docs/13-running-and-monitoring.md` (Unattended start) |
| Forge KVS remote returns 401 | Verify `appSystemToken: true` in manifest **and** scopes `storage:app` + `read:app-system-token` | `plan-sync-audit/docs/29-forge-kvs-remote-mending.md` |
| `400 component.missing.permissions.actor` on a JSM mutation/rule import | Actor isn't in `Service Desk Team` role (site-admin & `/mypermissions` don't count) — run the role pre-flight | `plan-sync-audit/docs/19-jsm-migration-patterns.md` |
| Automation rule create returns `{}` from DC, or rule body empty | DC has no Automation REST API — export from the DC UI, transform, import to Cloud | `plan-sync-audit/docs/20-automation-rule-migration.md` |
| Recovered issue imported under a new key instead of its original | Target key was already taken — importer EDITs instead of creating; re-check keys-free right before import | `plan-sync-audit/docs/21-post-jcma-issue-recovery.md` |

### Rate-limit math (March 2026 enforcement)

Atlassian's points-based model enforces on **March 2, 2026**. Three independent caps run in parallel:

| Cap | Default | Header reason |
|---|---|---|
| Tenant hourly point pool | 65,000 pts (Tier 1) / up to 500,000 pts (Enterprise) | `jira-quota-tenant-based` |
| Burst per second | GET/POST 100/s, PUT/DELETE 50/s | `jira-burst-based` |
| Per-issue writes | 20 writes / 2s, 100 writes / 30s | `jira-per-issue-on-write` |

Pace at ~60 % of burst and ~40 % of hourly to absorb retries without ever surfacing 429. Bulk endpoints (`POST /issue/bulkfetch`, `POST /issue/bulk`, `POST /changelog/bulkfetch`) cost the same as one call — use them. See `plan-sync-audit/docs/27-rate-limits-and-quotas.md` for the full table and a tier calculator.

### Documentation map

#### Core mental model
| File | Topic |
|---|---|
| [`01-core-concepts.md`](plan-sync-audit/docs/01-core-concepts.md) | Plan→Sync→Audit triad, two-phase + two-gate, runId, resumability |
| [`02-plan-manager.md`](plan-sync-audit/docs/02-plan-manager.md) | PlanManager class API, JSON shape, autosave, sub-plan splitting, instance signature |
| [`03-http-client-pattern.md`](plan-sync-audit/docs/03-http-client-pattern.md) | Native `https`, retry state machine for 429/5xx/network |
| [`04-pagination.md`](plan-sync-audit/docs/04-pagination.md) | Jira `POST /search/jql` + `nextPageToken`; Confluence v1 cursor; v2 cursor |
| [`05-identity-resolution.md`](plan-sync-audit/docs/05-identity-resolution.md) | DC→Cloud user/group, `accountId` discipline, caches, overrides |
| [`06-csv-and-cli-conventions.md`](plan-sync-audit/docs/06-csv-and-cli-conventions.md) | Standard flags, `logs/` layout, plan/audit CSV columns |
| [`07-audit-and-sampling.md`](plan-sync-audit/docs/07-audit-and-sampling.md) | Mulberry32 seeded RNG, pool selection, expected-vs-actual |
| [`08-concurrency-and-pool.md`](plan-sync-audit/docs/08-concurrency-and-pool.md) | Bounded worker pool, tuning, 429-driven shrinking |

#### Format & transform
| File | Topic |
|---|---|
| [`09-backup-and-rollback.md`](plan-sync-audit/docs/09-backup-and-rollback.md) | Confluence version-history restore, per-entity Jira backups, semantic-hash no-op detection, intervention detection |
| [`10-jql-and-aql-rewriting.md`](plan-sync-audit/docs/10-jql-and-aql-rewriting.md) | Filter ID rewriting, custom-field ID rewriting, JQL sanitization, AQL bodies inside JQL, Assets-field rewriting (ARI / key / objectId resolution) |
| [`11-storage-format-and-adf.md`](plan-sync-audit/docs/11-storage-format-and-adf.md) | Storage XHTML surgery (regex vs tree), ADF builders, walker, semantic hash |
| [`12-preflight-and-staleness.md`](plan-sync-audit/docs/12-preflight-and-staleness.md) | Drift detection between plan and apply time, abort thresholds, forward-roll vs backward-roll |
| [`13-running-and-monitoring.md`](plan-sync-audit/docs/13-running-and-monitoring.md) | Progress-line contract, background launch, completion + stall detection, **the AI-agent unattended-start contract** (poll every X seconds, distill log into one-line state), how an AI agent should report status to the user |
| [`14-heap-and-memory.md`](plan-sync-audit/docs/14-heap-and-memory.md) | Self-bumping `--max-old-space-size`, JSONL hit streams, snapshot-then-null per-hit refs, streaming CSV/binary, when `global.gc()` is justified, OOM postmortem |
| [`15-transitive-discovery.md`](plan-sync-audit/docs/15-transitive-discovery.md) | Phase-1b reverse graph walk: inverse JQL by parent/Epic-Link/Parent-Link to find orphaned children; first-writer-wins dedup; bulk Cloud-state check before re-queue |
| [`16-config-driven-multi-field.md`](plan-sync-audit/docs/16-config-driven-multi-field.md) | One JSON config (`config/field_mappings.json`) drives N field migrations; per-field plans; unmapped-values CSV; reuse same config for audit |
| [`17-post-jcma-audit-endpoints.md`](plan-sync-audit/docs/17-post-jcma-audit-endpoints.md) | `POST /search/approximate-count` for free population checks; `(migrated)` suffix detection + pairing + recommendation flow; the audit-endpoint table |
| [`18-scriptrunner-and-validate-only.md`](plan-sync-audit/docs/18-scriptrunner-and-validate-only.md) | ScriptRunner detection in workflows, SMS scaffold export (`extensions.yaml` + Groovy stubs); `validateOnly=true` workflow roundtrip; three-gate apply path |
| [`19-jsm-migration-patterns.md`](plan-sync-audit/docs/19-jsm-migration-patterns.md) | JSM `Service Desk Team` role trap (`component.missing.permissions.actor`), app-actor permission schemes, Assets workspace/object-type remap, customer account types, Request Type rename, SLAs not migrated |
| [`20-automation-rule-migration.md`](plan-sync-audit/docs/20-automation-rule-migration.md) | Automation for Jira migration: gateway REST surface, actor strategies, modes (import-clean / reconcile-target / fix-refs / repoint-actor), dedup-by-name, DC-has-no-rule-REST hybrid flow, ID/ARI remap |
| [`21-post-jcma-issue-recovery.md`](plan-sync-audit/docs/21-post-jcma-issue-recovery.md) | The 14-step find-missing pipeline: DC vs Cloud search key diff, key preservation on re-import, transitive parent recovery, CSV-import + REST fallback, false-positive guards |
| [`22-confluence-app-macro-migration.md`](plan-sync-audit/docs/22-confluence-app-macro-migration.md) | Appfire Composition deck/card → tab-group/tab: CQL discovery, default-deny verification, ancestor stack, back-to-front splice rewrite, 409 + version-truth, rollback; the macro-fix family |

#### Patterns, limits, references
| File | Topic |
|---|---|
| [`24-production-patterns.md`](plan-sync-audit/docs/24-production-patterns.md) | 40 patterns extracted from real shipping migration scripts |
| [`27-rate-limits-and-quotas.md`](plan-sync-audit/docs/27-rate-limits-and-quotas.md) | March 2026 points model, headers, backoff math, bulk endpoints |
| [`28-adf-and-attachments.md`](plan-sync-audit/docs/28-adf-and-attachments.md) | ADF set-only, attachment CSRF header, ADF node builders |
| [`29-forge-kvs-remote-mending.md`](plan-sync-audit/docs/29-forge-kvs-remote-mending.md) | `appSystemToken`, `x-forge-oauth-system`, KVS REST surface |
| [`30-testing-migration-scripts.md`](plan-sync-audit/docs/30-testing-migration-scripts.md) | nock fixtures, plan replay, dry-run CI harness |
| [`post-jcma-id-mapping.md`](plan-sync-audit/docs/post-jcma-id-mapping.md) | Which IDs change vs persist; mapping table layout |
| [`gotchas.md`](plan-sync-audit/docs/gotchas.md) | Common pitfalls, environment-specific quirks (now with JQL/AQL/storage/ADF/backup sections) |
| [`when-to-use-which.md`](plan-sync-audit/docs/when-to-use-which.md) | Decision tree: plan vs sync vs audit vs one-shot |

### Templates

Copy-paste-ready files in `plan-sync-audit/templates/`:

#### Core scaffolding
| Template | Purpose |
|---|---|
| [`sub-project-skeleton.md`](plan-sync-audit/templates/sub-project-skeleton.md) | Folder tree, zero-dep `package.json`, `.env.example`, file glossary |
| [`plan-manager.js`](plan-sync-audit/templates/plan-manager.js) | Generic resumable PlanManager class (entity-agnostic) |
| [`plan-script.template.js`](plan-sync-audit/templates/plan-script.template.js) | Plan entry-point template with TODO markers |
| [`sync-script.template.js`](plan-sync-audit/templates/sync-script.template.js) | Sync entry-point template with TODO markers |
| [`audit-script.template.js`](plan-sync-audit/templates/audit-script.template.js) | Audit entry-point template (seeded sampling) |
| [`cli-flags.md`](plan-sync-audit/templates/cli-flags.md) | Standard flag table + zero-dep `parseArgs` helper |
| [`env-example.txt`](plan-sync-audit/templates/env-example.txt) | Canonical `.env.example` |

#### HTTP clients & infrastructure
| Template | Purpose |
|---|---|
| [`cloud-jira-client.js`](plan-sync-audit/templates/cloud-jira-client.js) | Native-https client with `POST /search/jql`, bulk helpers, retry state machine |
| [`cloud-confluence-client.js`](plan-sync-audit/templates/cloud-confluence-client.js) | Native-https client, v1 CQL + v2 cursor, 409 retry, `restoreVersion` |
| [`datacenter-jira-client.js`](plan-sync-audit/templates/datacenter-jira-client.js) | DC variant: basic + PAT auth, `startAt` pagination |
| [`datacenter-confluence-client.js`](plan-sync-audit/templates/datacenter-confluence-client.js) | DC variant: basic + PAT auth, CQL, http/https selection |
| [`identity-resolver.js`](plan-sync-audit/templates/identity-resolver.js) | Email-first + displayName fallback, on-disk cache, CSV override |
| [`worker-pool.js`](plan-sync-audit/templates/worker-pool.js) | Zero-dep bounded concurrency (~30 lines) |
| [`multi-key-pool.js`](plan-sync-audit/templates/multi-key-pool.js) | K-client × W-worker pool — one client per API token, fixed worker→client binding for cache locality |
| [`dispatcher.js`](plan-sync-audit/templates/dispatcher.js) | Out-of-process dispatcher: one child per slot/token, persistent state JSON, slot-to-job assignment survives Ctrl-C |
| [`run-driver.sh.template`](plan-sync-audit/templates/run-driver.sh.template) | Bash equivalent: `xargs -P N` driver pinned to one `CLOUD_API_TOKEN_X`, runs M sub-plans concurrently |
| [`heap-bumper.js`](plan-sync-audit/templates/heap-bumper.js) | Self-bump `--max-old-space-size` + `--expose-gc` via single re-exec at script start — paste in first line of `main/*.js` |
| [`field-config-mapper.js`](plan-sync-audit/templates/field-config-mapper.js) | Config-driven multi-field mapper — loads `field_mappings.json`, handles string/option/multi-select shapes, aggregates unmapped values |
| [`overwrite-policy.js`](plan-sync-audit/templates/overwrite-policy.js) | Three-way decision matrix (skip-empty / write / overwrite / skip-noop / skip-target-not-empty) with type-aware equality for option fields and multi-selects |
| [`scriptrunner-exporter.js`](plan-sync-audit/templates/scriptrunner-exporter.js) | Detect ScriptRunner-shaped workflow rules across collected workflows; emit `extensions.yaml` + Groovy stubs; static helper for `validateOnly=true` workflow roundtrip |
| [`csv-writer.js`](plan-sync-audit/templates/csv-writer.js) | Streaming RFC-4180 CSV writer, zero-dep |
| [`multipart-builder.js`](plan-sync-audit/templates/multipart-builder.js) | RFC-7578 multipart/form-data envelope with a retry-safe body factory — use for any binary upload that must survive 429/5xx |

#### Transform helpers
| Template | Purpose |
|---|---|
| [`adf-builders.js`](plan-sync-audit/templates/adf-builders.js) | ADF node builders, walker, mutator, prune, semantic hash |
| [`jql-rewriter.js`](plan-sync-audit/templates/jql-rewriter.js) | Filter ID + custom-field ID rewriters, AQL function-body wrapper |
| [`jql-sanitizer.js`](plan-sync-audit/templates/jql-sanitizer.js) | Quoted-string-aware sanitizer: field renames, operator uppercasing, IN-list quoting, paren-less function fix |
| [`asset-field-rewriter.js`](plan-sync-audit/templates/asset-field-rewriter.js) | Rewrite direct Assets/CMDB field refs (ARI / key / DC objectId → Cloud name), masks aqlFunction blocks |
| [`workflow-transformer.js`](plan-sync-audit/templates/workflow-transformer.js) | Walk a workflow JSON, remap status/customField/screen/group/role IDs, drop dropped-statuses' transitions and globbed rule keys, clean JMWE prefix corruption |
| [`cloud-config-comparator.js`](plan-sync-audit/templates/cloud-config-comparator.js) | Diff fields / statuses / issueTypes / linkTypes / priorities / resolutions between two Cloud tenants — `{missingInDest, extraInDest, changed}` per resource |
| [`excel-report-writer.js`](plan-sync-audit/templates/excel-report-writer.js) | Multi-sheet workbook with status-color fills, frozen headers, auto-filter (requires `exceljs`) |
| [`backup-manager.js`](plan-sync-audit/templates/backup-manager.js) | Per-entity snapshots, semantic hashing helpers, Confluence version-history rollback |
| [`cloud-catalog.js`](plan-sync-audit/templates/cloud-catalog.js) | Snapshot fields/statuses/roles/groups/projects once; build source→dest field map |
| [`instance-fingerprint.js`](plan-sync-audit/templates/instance-fingerprint.js) | Stamp + verify (source, destination) baseUrl pair on each plan |
| [`owner-swap.js`](plan-sync-audit/templates/owner-swap.js) | Filter/dashboard owner-swap with try/finally + orphan-CSV on restore failure |
| [`preflight.js`](plan-sync-audit/templates/preflight.js) | Pre-sync drift detection: compare planned source state vs live source, bucket results, abort threshold |
| [`logger.js`](plan-sync-audit/templates/logger.js) | Dual-sink (console + file) logger with ISO timestamps and level filtering |
| [`csv-reader.js`](plan-sync-audit/templates/csv-reader.js) | RFC-4180 CSV reader for scope filtering and identity overrides |
| [`jsm-role-preflight.js`](plan-sync-audit/templates/jsm-role-preflight.js) | Grant a JSM actor the `Service Desk Team` role (or the app-actor permission-scheme grant) before mutating; discover Assets workspaceId |
| [`composition-macro-rewriter.js`](plan-sync-audit/templates/composition-macro-rewriter.js) | Storage-XHTML app-macro rewriter: ancestor-stack walk, default-deny verification, back-to-front splice, param rename-with-conflict-delete, semantic-hash idempotency |
| [`xlsx-mapping-reader.js`](plan-sync-audit/templates/xlsx-mapping-reader.js) | Read an operator-editable XLSX mapping workbook (sheets per category) into the apply scripts' mappings object (requires `exceljs`) |
| [`find-missing-issues.skeleton.md`](plan-sync-audit/templates/find-missing-issues.skeleton.md) | The 14-step post-JCMA issue-recovery pipeline as a runnable skeleton (DC vs Cloud search, key preservation, false-positive guards) |

### Scripts

CI-safe bash helpers in `plan-sync-audit/scripts/`:

| Script | Purpose |
|---|---|
| [`preflight-check.sh`](plan-sync-audit/scripts/preflight-check.sh) | Verify Node ≥20, `.env` present, base URLs reachable |
| [`test-auth.sh`](plan-sync-audit/scripts/test-auth.sh) | Hit `/myself` on Cloud and DC, report OK/FAIL per host |
| [`new-script.sh`](plan-sync-audit/scripts/new-script.sh) | Scaffold a new sub-project from the skeleton template |
| [`lint-plan-file.sh`](plan-sync-audit/scripts/lint-plan-file.sh) | `jq`-validate plan JSON shape and per-entry status enum |
| [`audit-summary.sh`](plan-sync-audit/scripts/audit-summary.sh) | Aggregate pass/fail counts across `logs/audit_*.csv` |

Recommended workflow: `preflight-check.sh` → `test-auth.sh` → `new-script.sh my-job` → fill TODOs → run `--plan-only` → `lint-plan-file.sh logs/plan_*.json` → run `--execute-only --dry-run` → run with `--confirm` → run audit script → `audit-summary.sh`.

## Track 2 — Cloud-to-Cloud copy over REST (`cloud-to-cloud/`)

Read from the source site, write to the target site, and control every byte that lands — the runbook from a real
production move of over a dozen Jira projects (tens of thousands of work items, several JSM desks, test-management
data) and a similar number of Confluence spaces (thousands of pages, tens of thousands of attachments) into a busy
production site.

### When to Use This Skill

Use this skill when:
- The native Cloud-to-Cloud migration is **not usable**: the target site is already in production with other
  projects, you cannot get org admin on both sides, source IT will not support it, or the tool cannot do what is asked.
- **Keys and numbers must be preserved** (`PROJ-1234` stays `PROJ-1234`), or only a **subset** of projects/spaces moves.
- **Privacy filtering** is required: only a KEEP list of people may appear on the target; everyone else is anonymised.
- **Nothing pre-existing on the target may change** and **nobody may be e-mailed** during the load.
- The source will be **switched off** soon and you need a verified copy plus a local snapshot.

Skip this skill for:
- Generic migration plumbing (Plan/Sync/Audit, http client, pagination, ADF builders, multipart) →
  the Plan/Sync/Audit track above (`plan-sync-audit/`; this track links there instead of repeating it).
- Data Center → Cloud with JCMA → the Plan/Sync/Audit track above (post-JCMA docs).
- Org-level user/group/policy work beyond what a migration needs → `atlassian-organizations-api-skill`.
- Migrating Automation rules → `automation-engineer`.

### Pick a starting point

- **First time, planning the whole thing** → `cloud-to-cloud/docs/01-core-concepts.md` (phases, what a copy loses by design, red lines,
  rehearsal strategy) then `cloud-to-cloud/docs/02-preflight-and-target-config.md`.
- **Must not spam anyone** → `cloud-to-cloud/docs/03-silent-loading.md` + `cloud-to-cloud/templates/silent_window.py` (do this BEFORE the first item).
- **Keys and numbers must match** → `cloud-to-cloud/docs/04-jira-ordered-copy.md` + `cloud-to-cloud/templates/ordered_create.py`.
- **Privacy / anonymisation** → `cloud-to-cloud/docs/08-identity-and-text-privacy.md` + `cloud-to-cloud/docs/09-attachment-privacy.md` +
  `cloud-to-cloud/templates/attachment_verdicts.py` + `cloud-to-cloud/templates/att_gate.py` (every upload goes through it) +
  `cloud-to-cloud/templates/check_upload_paths.py` + `cloud-to-cloud/scripts/leak-scan.sh`.
- **Out of seats, inviting people** → `cloud-to-cloud/docs/10-users-licences-accounts.md` + `cloud-to-cloud/templates/inactive_users_report.py`.
- **Is it actually done?** → `cloud-to-cloud/docs/13-verification-and-guard-dog.md` ("a green number is not a passing test").

### Quick Reference

| I need to… | How | Doc |
|---|---|---|
| Prove the migration identity can see everything | per project `project/search?expand=insight` count vs JQL count | 02 |
| Prove a project key is free | `GET /rest/api/3/projectvalidate/key?key=K` + positive control on a taken key | 02 |
| Silence a project during load | swap to a PROVEN-EMPTY notification scheme, read back, restore + read back | 03 |
| Stop the migration account auto-watching | `PUT /rest/api/3/mypreferences?key=user.autowatch.disabled` body **bare** `true` | 03 |
| JSM customer (portal) notifications off | **no REST** — browser, record before-state, restore exactly | 03, 07 |
| Keep `PROJ-n` numbers | sequential create, filler items for gaps (create + delete), marker label per item | 04 |
| Parent refused ("does not belong to appropriate hierarchy") | fall back to an issue link of type Parent-Child | 04, `cloud-to-cloud/templates/parent_or_link.py` |
| Copy issue links the right way round | canonical triple; prove direction on ONE known pair first | 05, `cloud-to-cloud/templates/link_copy.py` |
| Comments beyond 100 | paginate `startAt` — the API caps a page at 100 whatever `maxResults` says | 04 |
| Recreate sprints | create → start → add items (≤50/call) → close, then re-seat open sprints | 05 |
| Issues the source search cannot list | enumerate by KEY RANGE, not by JQL | 06 |
| Request type on a JSM item | `PUT /rest/api/3/issue/{k}` `{"fields":{"<requestTypeField>":"<id as string>"}}` | 07 |
| Distinct icons for issue types you created | `POST /rest/api/3/universal_avatar/type/issuetype/owner/{id}` + `PUT /issuetype/{id} {"avatarId"}` | 07, `cloud-to-cloud/templates/issuetype_avatar.py` |
| Seats per product | `GET /rest/api/3/applicationrole` (`numberOfSeats`, `userCount`) — API token, needs Administer Jira | 10 |
| Invite a person without product access | `POST /rest/api/3/user {"emailAddress":e,"products":[]}` (caller must be ORG admin) then groups | 10 |
| Inactive users to free seats | admin-hub users search (resourceIds) + per-product last-active-dates | 10 |
| Delete a Confluence attachment for good | v2 `DELETE /wiki/api/v2/attachments/{id}` (trashes it), then the same with `?purge=true`; read back | 09, 11 |
| Archive migrated pages | `POST /wiki/rest/api/content/archive {"pages":[{"id":N}]}` → long task | 11 |
| Read page restrictions (do not lose them) | `GET /wiki/rest/api/content/{id}/restriction?expand=restrictions.user,restrictions.group` | 11 |
| Rate budget | Jira: cost points per ACCOUNT per SITE per hour; 429 → sleep to `x-ratelimit-reset` | 27 |

### The run, on one screen

```
0  decisions + approvals written down (files the scripts check)      cloud-to-cloud/docs/15
1  preflight: inventory, keys/names free, required fields, seats     cloud-to-cloud/docs/02
2  source freeze (read-only scheme COPIES, never edit originals)     cloud-to-cloud/docs/14
3  guard-dog BASELINE of target config (before the first write)      cloud-to-cloud/docs/13
4  target config: own per-project schemes, globals only if missing   cloud-to-cloud/docs/02, 07
5  silence: notification schemes, autowatch, JSM customer notif,
   automation that can fire on the new projects                      cloud-to-cloud/docs/03
6  load: Confluence spaces ‖ Jira chains (2 per account), ordered    cloud-to-cloud/docs/04, 11
7  post passes: cross-project links, attachment release, late
   sub-tasks, lost parents, request types, people, URLs, boards,
   sprints, fillers, worklog dedupe                                  cloud-to-cloud/docs/04-07, 11
8  verify + compare + leak hunt + adversarial final review           cloud-to-cloud/docs/13
9  notifications back (restore + read back), JSM customer notif on   cloud-to-cloud/docs/03
10 report to the right audience; decision log with reverts           cloud-to-cloud/docs/15
```

### Golden rules (each one cost real time)

1. **Never edit a pre-existing object on the target.** Create your own `<KEY>: …` schemes/screens/workflows; reuse a
   global status/type by NAME only if it exists; create globals only with written approval. `POST /rest/api/3/workflows/create`
   **upserts** an existing global status you list — send its current description or it is wiped.
2. **Silence is a read-back, not a PUT.** Prove the silent scheme has zero recipients, assign, re-read until it shows.
   Scheme writes have been observed to apply late; a crash must not lose the remembered originals (save per project).
3. **A 0, a 404 or "not found" authorises nothing until proven on the same object.** Search-hidden items, deactivated
   users hidden from user search, Forge apps that 404 on the Connect probe, CQL missing attachments — all real.
4. **Never blind-retry a write.** A POST that timed out may have created the item: look for your marker label at the
   expected key before posting again. Retry 5xx only for GET; 429 is always safe to resend.
5. **The verifier must not share the copier's blind spot.** Same matcher on both sides proves nothing about people the
   matcher does not know; add an independent name-SHAPE scan and human review.
6. **Held wins.** Any non-clean verdict from any scan holds the file; a later "clean" re-scan needs its own release step.
7. **Edits leave history.** A Jira field edit keeps the old text in the History tab; only deleting the item removes it.
   Scrub must be final before the first write; Confluence old versions must be deleted explicitly.
8. **Every decision taken on the client's behalf goes in a log with its exact revert.** Ask the owner; log; move on.
9. **Kill by PID, wait on PIDs or files.** `pkill -f <pattern>` / `pgrep -f` match your own waiter and sibling subshells.

### Authentication — what's correct, what's wrong

| Pattern | Use? |
|---|---|
| Site REST (`/rest/api/3`, `/wiki/api/v2`, `/rest/servicedeskapi`) with Basic `email:api_token` of an admin account | **Yes** — every copy/verify script |
| Two admin migration accounts with disjoint project lists | **Yes, when the target owner provides them** — each had its own observed budget; never create accounts just to multiply limits |
| `notifyUsers=false` on issue edits and worklogs | **Yes, with Administer Jira or Administer Projects** — otherwise it is ignored; comment create, transitions, attachments, links have no such flag |
| Admin hub APIs (`admin.atlassian.com/gateway/api/admin/...`) with a user API token | **No** — 401; use the logged-in browser session, or an org API key on `api.atlassian.com/admin` (see `atlassian-organizations-api-skill`) |
| JSM customer notifications, JSM queue create, board columns, account claiming over REST | **No public endpoint** — browser automation, read back, screenshot |
| Setting comment `author`/`created` or issue `created` | **No** — 201 and silently ignored / 400; keep original author+date as TEXT |
| Test-management app API keys | Per USER **and** per SITE; generated in the app UI on the target |

### Failure strategies

| Symptom | First-pass fix | Detail |
|---|---|---|
| `NUMBER DRIFT: wanted PROJ-n, got PROJ-n+1` | a lost create was re-posted (duplicate); the template stops, reuse the spare by hand | 04 |
| Description on created items = a template text | create screen lacks system Description; PUT description right after create | 04 |
| `Field Team is required` though createmeta says optional | workflow validator; send a default (plain id string), never on sub-tasks | 02, 04 |
| Every sub-task became a Task | the "inherits team from parent" error contains "parent" → your fallback dropped the parent | 04 |
| Links read backwards on the target | `inwardIssue`/`outwardIssue` swapped; repair against the source by canonical triple | 05 |
| `400 does not belong to appropriate hierarchy` | level mismatch; Parent-Child link instead | 04 |
| Items lost their sprint | sprint's origin board no longer resolves on source; recreate from the item side | 05 |
| All desk tickets look the same type | new global issue types share the default avatar; upload icons | 07 |
| `LicenceExceededException` on group add | seat cap; measure, then free seats (approved) | 10 |
| Images vanished after someone opened a page editor | 0-byte attachment versions; re-upload good bytes as a new version | 11 |
| Count check passes but items are missing | the count used the same blind index as the copy; count by key range | 06 |
| Queue "All open" full of closed tickets | done items without resolution; set resolution silently | 07 |

### Documentation map

| File | Topic |
|---|---|
| [`01-core-concepts.md`](cloud-to-cloud/docs/01-core-concepts.md) | Why copy-based, what is lost by design, phases, red lines, rehearsals, roles |
| [`02-preflight-and-target-config.md`](cloud-to-cloud/docs/02-preflight-and-target-config.md) | Inventory, keys/names, required fields, own schemes, globals, mapping by name, automation |
| [`03-silent-loading.md`](cloud-to-cloud/docs/03-silent-loading.md) | Every e-mail channel and how each was closed; locks, windows, restore gates |
| [`04-jira-ordered-copy.md`](cloud-to-cloud/docs/04-jira-ordered-copy.md) | Keys/numbers, fillers, lost creates, parents, status walk, fields, comments, worklogs, attachments |
| [`05-links-sprints-boards.md`](cloud-to-cloud/docs/05-links-sprints-boards.md) | Link direction, missing link types, cross-project links, boards, filters, sprints |
| [`06-proving-negatives.md`](cloud-to-cloud/docs/06-proving-negatives.md) | Search-hidden items, hidden users, positive controls, index lag |
| [`07-jsm-desks.md`](cloud-to-cloud/docs/07-jsm-desks.md) | Desks on own config, request types, queues, avatars, roles, resolutions |
| [`08-identity-and-text-privacy.md`](cloud-to-cloud/docs/08-identity-and-text-privacy.md) | KEEP list, placeholder, matcher rounds, collisions, history caveat |
| [`09-attachment-privacy.md`](cloud-to-cloud/docs/09-attachment-privacy.md) | Default-deny, OCR passes, archives, draw.io, verdict merge, purge |
| [`10-users-licences-accounts.md`](cloud-to-cloud/docs/10-users-licences-accounts.md) | Invites, groups, claiming, seats, suspending inactive users |
| [`11-confluence.md`](cloud-to-cloud/docs/11-confluence.md) | Tree order, draw.io, archived pages, whiteboards, comments, link rewriting |
| [`12-test-management-data.md`](cloud-to-cloud/docs/12-test-management-data.md) | Zephyr-class apps: per-user rate limit, bulk jobs, what cannot be set |
| [`13-verification-and-guard-dog.md`](cloud-to-cloud/docs/13-verification-and-guard-dog.md) | Compare, spot checks, leak hunt, guard dog red lines, final review |
| [`14-source-freeze-and-snapshot.md`](cloud-to-cloud/docs/14-source-freeze-and-snapshot.md) | Read-only source, local snapshot before shutdown |
| [`15-decision-log-and-reporting.md`](cloud-to-cloud/docs/15-decision-log-and-reporting.md) | Decisions with reverts, approvals as files, the report |
| [`27-rate-limits-and-running.md`](cloud-to-cloud/docs/27-rate-limits-and-running.md) | Cost budget, chains, resume, locks, monitoring, process hygiene |
| [`gotchas.md`](cloud-to-cloud/docs/gotchas.md) | One-line traps, grouped |

### Templates

| Template | Purpose |
|---|---|
| [`atl_http.py`](cloud-to-cloud/templates/atl_http.py) | Stdlib client: 429 waits to reset, GET-only 5xx retry, no blind write retries, SRC always read-only |
| [`silent_window.py`](cloud-to-cloud/templates/silent_window.py) | Record schemes once, prove empty, swap, read back; writer gate (hold, window, stop time, scheme) used by every writer; restore closes the window, then waits for holders |
| [`ordered_create.py`](cloud-to-cloud/templates/ordered_create.py) | Create at exact number with fillers, marker labels, upward hidden-item probe, GET-forward resume, lost-create recovery, drift abort |
| [`link_copy.py`](cloud-to-cloud/templates/link_copy.py) | Safe direction probe per type, canonical triples, fallback type, attributable-only repair, record for revert |
| [`parent_or_link.py`](cloud-to-cloud/templates/parent_or_link.py) | Set parent; only a `parent` refusal becomes a Parent-Child link (direction verified); dry run default |
| [`issuetype_avatar.py`](cloud-to-cloud/templates/issuetype_avatar.py) | Upload a PNG as an issue-type avatar and assign it, before/after record |
| [`inactive_users_report.py`](cloud-to-cloud/templates/inactive_users_report.py) | Rank suspension candidates from admin-hub JSON with exclusions — never suspends |
| [`attachment_verdicts.py`](cloud-to-cloud/templates/attachment_verdicts.py) | Merge scan files: held wins (incl. holds after a release), exact eye-clear, exact-pair release, disagreements |
| [`att_gate.py`](cloud-to-cloud/templates/att_gate.py) | ONE verdict on the BYTES before every upload: recursive archives, office images + embeddings, every PDF page, EMF/WMF bitmaps, `data:` images, e-mail parts, binary strings, profile paths, secrets, video held; your list lens + a built-in shape lens; allowlists as data; fail closed |
| [`check_upload_paths.py`](cloud-to-cloud/templates/check_upload_paths.py) | Exit 1 while any script writes attachments without calling the gate; use as a preflight check and a ratchet test |
| [`jsm_customer_notifications.mjs`](cloud-to-cloud/templates/jsm_customer_notifications.mjs) | Playwright: record/disable/restore JSM customer notification rules |
| [`decision-log.md`](cloud-to-cloud/templates/decision-log.md) | Decision entry format with owner, why, scope, records, revert |

### Scripts

| Script | Purpose |
|---|---|
| [`preflight-check.sh`](cloud-to-cloud/scripts/preflight-check.sh) | Auth on both sites, admin rights, seats, project keys free (with positive control) |
| [`leak-scan.sh`](cloud-to-cloud/scripts/leak-scan.sh) | Grep a directory (export, snapshot, repo) for every term of a denylist file; prints locations only |

Offline regression tests: `python3 cloud-to-cloud/tests/test_templates_offline.py` and `bash cloud-to-cloud/tests/test_leak_scan.sh`.

## Changelog

- **2026-10-03 — merged** `atlassian-migration-scripts-skill` and `atlassian-cloud-to-cloud-migration-skill`
  into this one skill (the owner wants one generic skill per task). Content moved with `git mv` (history kept);
  each former skill's SKILL.md body is a track above, verbatim except heading levels and paths, which now carry
  the track folder. The old folders remain as README stubs so existing links keep resolving.

### From atlassian-cloud-to-cloud-migration-skill
- **2026-10-02** After-care lessons: one attachment gate for every upload path (`cloud-to-cloud/templates/att_gate.py`, `cloud-to-cloud/templates/check_upload_paths.py`, cloud-to-cloud/docs/09), Confluence draft-media breakage + fix (cloud-to-cloud/docs/11), test steps hidden by missing Forge panel properties (cloud-to-cloud/docs/12), contractor-to-full account switch and freeing licence seats (cloud-to-cloud/docs/10).

- **2026-10-01 (initial release)** Distilled from a production Cloud-to-Cloud copy (Jira incl. JSM desks and
  test-management data, Confluence spaces) into a live production target under a KEEP-list privacy requirement:
  runbook, decision log, tooling and anonymised field notes. Client identifiers removed.
- **2026-10-01 (live-verified)** Templates exercised on a test site (ordered copy with gap/late parent/lost create,
  link probe + repair, hierarchy fallback, silent window record/restore, autowatch bare `true`, avatar upload, JSM
  customer notifications off/on); test objects deleted, verified 404 with positive controls.
- **2026-10-01 (adversarial review pass)** Privacy + technical reviews fixed: writer gate enforced in every writer,
  ordered copy (upward probe, 403 aborts, GET-forward resume, map log healed, marker collisions, description off the
  create), safe link probe + attributable-only repair, parent link only on a `parent` refusal, held-wins after
  releases, leak-scan false-cleans, v2 space-key preflight, ~60 spec corrections, identifying details generalised;
  new lesson: OCR screenshots embedded in office files/PDFs. Offline tests in `cloud-to-cloud/tests/`; writers re-run live.

### From atlassian-migration-scripts-skill
- **2026-06-26 (JSM + automation + recovery + macro pass)** Distilled four new sub-disciplines from VAL-migration-scripts (OpenBet C2C, McLaren DC→Cloud). New docs: `19-jsm-migration-patterns.md` (the **`Service Desk Team` role trap** — JSM actor mutations 400 with `component.missing.permissions.actor` unless the actor is in the agent role; site-admin and `/mypermissions` don't count; plus app-actor `atlassian-addons-project-access`, Assets object-type-by-label remap, customer account types), `20-automation-rule-migration.md` (gateway REST surface, actor strategies, modes import-clean/reconcile-target/fix-refs/repoint-actor, **dedup-by-NAME silent skip**, **DC has no Automation REST API** → hybrid UI-export flow), `21-post-jcma-issue-recovery.md` (the 14-step find-missing pipeline: DC vs Cloud search key diff, conditional key preservation on re-import, transitive parent recovery, re-keyed-as-label false-positive guards), `22-confluence-app-macro-migration.md` (Composition deck/card → tab-group/tab; default-deny verification, ancestor stack, back-to-front splice, server-truth post-409 version). Enhanced `16` (XLSX-workbook mapping, pre-run field analysis, `multi_field_copy` one-to-many) and `17` (c2c-postmigration suite: JCMA "Requires Attention" CSV, verify-issue-links, compare-changelogs). Patterns 38–40 in `24`. New gotchas sections incl. org-level account ops (suspension is **org-admin** — see `atlassian-organizations-api-skill`). New templates: `jsm-role-preflight.js`, `composition-macro-rewriter.js`, `xlsx-mapping-reader.js`, `find-missing-issues.skeleton.md`. Noted Bitbucket (BBMA) out of scope.
- **2026-05-26 (second survey pass — 7 new patterns)** Continued the survey across `sync_issue_parents`, `sync_traffic_light_fields`, `c2c-postmigration`, `field-merge-script`, `clone_workflow_rules`. Seven new patterns added: (1) **Phase-1b transitive discovery** — walk inverse JQL by parent / Epic Link / Parent Link to find orphaned children the operator's JQL didn't cover, with first-writer-wins dedup and bulk Cloud-state filtering. `plan-sync-audit/docs/15-transitive-discovery.md`. (2) **Config-driven multi-field migration** — one JSON config (`field_mappings.json`) drives N option-field migrations; per-field plans naturally enable multi-key parallelism; unmapped-value CSV stops silent value drops. `plan-sync-audit/docs/16-config-driven-multi-field.md` + `plan-sync-audit/templates/field-config-mapper.js`. (3) **`approximate-count` endpoint** — `POST /rest/api/3/search/approximate-count` returns issue counts without pagination at ~1 point, 1000× more efficient than full pagination for "is there work to do?" questions. Now in `plan-sync-audit/templates/cloud-jira-client.js`. (4) **`(migrated)` field pairing** — JCMA's name-collision strategy renames colliding destination fields with a `(migrated)` suffix; the discover-quantify-recommend audit triad cleans these up. Both in `plan-sync-audit/docs/17-post-jcma-audit-endpoints.md`. (5) **Three-way overwrite policy** — `--skip-empty` / `--overwrite-existing` / `--treat-equal-as-noop` decision matrix; default skip-target-not-empty prevents silent user-edit overwrites in long-running plans. `plan-sync-audit/templates/overwrite-policy.js`, pattern 36. (6) **Auxiliary cache flush on shutdown** — pattern 35 (plan + master) refined: identity/field/perms caches also need flush on SIGINT, otherwise resume re-queries thousands of paid lookups. `flushCache()` added to `plan-sync-audit/templates/identity-resolver.js`; pattern 37. (7) **ScriptRunner export + validate-only roundtrip** — ScriptRunner Groovy bodies aren't in the workflow API, so emit an SMS scaffold (`extensions.yaml` + Groovy stubs) for human paste; `validateOnly=true` on workflow create/update surfaces ruleKey and ID-remap bugs at validation cost (1 pt) rather than apply cost. `plan-sync-audit/docs/18-scriptrunner-and-validate-only.md` + `plan-sync-audit/templates/scriptrunner-exporter.js`.
- **2026-05-26 (mega-scale resilience pass)** Distilled the heap, multi-key, and unattended-agent patterns from `recover_truncated_content` and `sync_asset_ticket_associations`. New `plan-sync-audit/docs/14-heap-and-memory.md` covering the canonical OOM defenses: self-bumping `--max-old-space-size` via single re-exec at startup, append-only JSONL hit stream during plan-build, snapshot-then-null per-hit refs, streamed CSV writers, streaming binary I/O, when `global.gc()` is actually justified, and an OOM postmortem playbook. Expanded `plan-sync-audit/docs/08-concurrency-and-pool.md` with two new sections on multi-key parallelism: an in-process K-clients × W-workers pool (one client per `CLOUD_API_TOKEN_X`) and an out-of-process dispatcher (one Node child per token-slot with persistent state JSON). Added decision matrix for picking between them, token hygiene rules, and rate-limit math explaining when extra tokens stop helping (tenant pool exhausted). Expanded `plan-sync-audit/docs/13-running-and-monitoring.md` with the AI-agent unattended-start contract: refuse-without-confirm, smoke-test-then-background-launch, capture log path once, poll on a cadence aligned to prompt-cache TTL (60–270s or 1200–1800s — avoid the 300s worst-case), per-tick snapshot commands (5 parallel greps), stall detection via two-of-three signals, an end-loudly final message format. New templates: `heap-bumper.js`, `multi-key-pool.js`, `dispatcher.js`, `run-driver.sh.template`. Updated `env-example.txt` to document `CLOUD_API_TOKEN_2..N` slots.
- **2026-05-19 (attachment sync + agent-observation pass)** Distilled the new `sync_issue_attachments` sub-project (jira-data) into the skill. Added `plan-sync-audit/docs/13-running-and-monitoring.md` — the first doc explicitly aimed at an *AI agent observer* of a long-running script (progress-line contract, background launch, FINAL REPORT marker, stall detection, how to report status back to the user without echoing the log). Added `plan-sync-audit/templates/multipart-builder.js` — retry-safe streaming multipart with a body-factory pattern, the upload primitive missing from `cloud-jira-client.js#uploadAttachment` (which buffers the whole file in memory and cannot be retried after a 429). Added patterns 31–35 to `24-production-patterns.md`: streaming multipart with body factory, streaming binary download with redirect-following, filename+size fingerprint as idempotency key, destination-policy preflight (Cloud `/configuration` + `--max-bytes` override + 413 reclassification), graceful shutdown that flushes both plan and master index. Expanded `28-adf-and-attachments.md` with the canonical attachment re-upload pattern (plan→download→upload with disk staging). Expanded `gotchas.md` with seven attachment-specific footguns (retry-safety of multipart, 413 mid-upload, redirect handling, filename sanitization for disk, fingerprint re-check at execute, single-element response array) and a new "Running and monitoring (agent observation)" section.
- **2026-05-18 (initial release + three enrichment passes)** Distilled ~25 production migration sub-projects into the core skill: PlanManager, native-`https` clients with separate 429/5xx/network retry counters, two-phase + two-gate execution, Mulberry32 sampling audits, identity resolution (email→accountId), Forge KVS remote mending via `appSystemToken`, post-Aug-2025 pagination (`POST /search/jql` + `nextPageToken`, no `total`), and March-2026 rate-limit guidance. Successive passes added docs 02/04/09–12 and templates for JQL rewrite/sanitize, ADF builders, backup-manager (version-history rollback + intervention detection), instance fingerprinting, asset/CMDB field rewriting, owner-swap, preflight/staleness, logger, CSV reader, workflow-transformer, cloud-config-comparator, and excel-report-writer; production patterns grew from 12 to 30 (semantic-hash no-op, multi-pass pipeline, state machine, sub-plan splitting, stratified sampling, discovery-dump, lossy-parameter audit, two-sided backup-restore).

## Support & Resources
- [Jira Cloud REST API v3](https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/)
- [Confluence Cloud REST API v2](https://developer.atlassian.com/cloud/confluence/rest/v2/intro/)
- [Jira rate limiting (Mar 2026)](https://developer.atlassian.com/cloud/jira/platform/rate-limiting/)
- [Atlassian migration best practices](https://support.atlassian.com/migration/docs/migration-best-practices/)
- [Forge remote storage access](https://developer.atlassian.com/platform/forge/remote/accessing-storage/)
- [JCMA user-API migration guide](https://developer.atlassian.com/cloud/jira/platform/deprecation-notice-user-privacy-api-migration-guide/)
