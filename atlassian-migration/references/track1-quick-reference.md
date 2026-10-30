# Track 1: quick reference (I need to... template, doc)

Moved verbatim from SKILL.md on 2026-10-30 (skills audit); lines 70-118 of the old file. Read by section; the CORE card in SKILL.md wins on conflict.
Part of Track 1 (Plan/Sync/Audit, `plan-sync-audit/`). Backtick paths below are relative to the skill root (~/.claude/skills/atlassian-migration/); markdown links were re-pointed (`../`) so they resolve from references/.

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
