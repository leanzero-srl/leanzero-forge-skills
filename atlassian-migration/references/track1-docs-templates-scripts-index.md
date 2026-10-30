# Track 1: documentation map, templates, scripts

Moved verbatim from SKILL.md on 2026-10-30 (skills audit); lines 255-368 of the old file. Read by section; the CORE card in SKILL.md wins on conflict.
Part of Track 1 (Plan/Sync/Audit, `plan-sync-audit/`). Backtick paths below are relative to the skill root (~/.claude/skills/atlassian-migration/); markdown links were re-pointed (`../`) so they resolve from references/.

## Contents
- Documentation map
- Templates
- Scripts

### Documentation map

#### Core mental model
| File | Topic |
|---|---|
| [`01-core-concepts.md`](../plan-sync-audit/docs/01-core-concepts.md) | Plan→Sync→Audit triad, two-phase + two-gate, runId, resumability |
| [`02-plan-manager.md`](../plan-sync-audit/docs/02-plan-manager.md) | PlanManager class API, JSON shape, autosave, sub-plan splitting, instance signature |
| [`03-http-client-pattern.md`](../plan-sync-audit/docs/03-http-client-pattern.md) | Native `https`, retry state machine for 429/5xx/network |
| [`04-pagination.md`](../plan-sync-audit/docs/04-pagination.md) | Jira `POST /search/jql` + `nextPageToken`; Confluence v1 cursor; v2 cursor |
| [`05-identity-resolution.md`](../plan-sync-audit/docs/05-identity-resolution.md) | DC→Cloud user/group, `accountId` discipline, caches, overrides |
| [`06-csv-and-cli-conventions.md`](../plan-sync-audit/docs/06-csv-and-cli-conventions.md) | Standard flags, `logs/` layout, plan/audit CSV columns |
| [`07-audit-and-sampling.md`](../plan-sync-audit/docs/07-audit-and-sampling.md) | Mulberry32 seeded RNG, pool selection, expected-vs-actual |
| [`08-concurrency-and-pool.md`](../plan-sync-audit/docs/08-concurrency-and-pool.md) | Bounded worker pool, tuning, 429-driven shrinking |

#### Format & transform
| File | Topic |
|---|---|
| [`09-backup-and-rollback.md`](../plan-sync-audit/docs/09-backup-and-rollback.md) | Confluence version-history restore, per-entity Jira backups, semantic-hash no-op detection, intervention detection |
| [`10-jql-and-aql-rewriting.md`](../plan-sync-audit/docs/10-jql-and-aql-rewriting.md) | Filter ID rewriting, custom-field ID rewriting, JQL sanitization, AQL bodies inside JQL, Assets-field rewriting (ARI / key / objectId resolution) |
| [`11-storage-format-and-adf.md`](../plan-sync-audit/docs/11-storage-format-and-adf.md) | Storage XHTML surgery (regex vs tree), ADF builders, walker, semantic hash |
| [`12-preflight-and-staleness.md`](../plan-sync-audit/docs/12-preflight-and-staleness.md) | Drift detection between plan and apply time, abort thresholds, forward-roll vs backward-roll |
| [`13-running-and-monitoring.md`](../plan-sync-audit/docs/13-running-and-monitoring.md) | Progress-line contract, background launch, completion + stall detection, **the AI-agent unattended-start contract** (poll every X seconds, distill log into one-line state), how an AI agent should report status to the user |
| [`14-heap-and-memory.md`](../plan-sync-audit/docs/14-heap-and-memory.md) | Self-bumping `--max-old-space-size`, JSONL hit streams, snapshot-then-null per-hit refs, streaming CSV/binary, when `global.gc()` is justified, OOM postmortem |
| [`15-transitive-discovery.md`](../plan-sync-audit/docs/15-transitive-discovery.md) | Phase-1b reverse graph walk: inverse JQL by parent/Epic-Link/Parent-Link to find orphaned children; first-writer-wins dedup; bulk Cloud-state check before re-queue |
| [`16-config-driven-multi-field.md`](../plan-sync-audit/docs/16-config-driven-multi-field.md) | One JSON config (`config/field_mappings.json`) drives N field migrations; per-field plans; unmapped-values CSV; reuse same config for audit |
| [`17-post-jcma-audit-endpoints.md`](../plan-sync-audit/docs/17-post-jcma-audit-endpoints.md) | `POST /search/approximate-count` for free population checks; `(migrated)` suffix detection + pairing + recommendation flow; the audit-endpoint table |
| [`18-scriptrunner-and-validate-only.md`](../plan-sync-audit/docs/18-scriptrunner-and-validate-only.md) | ScriptRunner detection in workflows, SMS scaffold export (`extensions.yaml` + Groovy stubs); `validateOnly=true` workflow roundtrip; three-gate apply path |
| [`19-jsm-migration-patterns.md`](../plan-sync-audit/docs/19-jsm-migration-patterns.md) | JSM `Service Desk Team` role trap (`component.missing.permissions.actor`), app-actor permission schemes, Assets workspace/object-type remap, customer account types, Request Type rename, SLAs not migrated |
| [`20-automation-rule-migration.md`](../plan-sync-audit/docs/20-automation-rule-migration.md) | Automation for Jira migration: gateway REST surface, actor strategies, modes (import-clean / reconcile-target / fix-refs / repoint-actor), dedup-by-name, DC-has-no-rule-REST hybrid flow, ID/ARI remap |
| [`21-post-jcma-issue-recovery.md`](../plan-sync-audit/docs/21-post-jcma-issue-recovery.md) | The 14-step find-missing pipeline: DC vs Cloud search key diff, key preservation on re-import, transitive parent recovery, CSV-import + REST fallback, false-positive guards |
| [`22-confluence-app-macro-migration.md`](../plan-sync-audit/docs/22-confluence-app-macro-migration.md) | Appfire Composition deck/card → tab-group/tab: CQL discovery, default-deny verification, ancestor stack, back-to-front splice rewrite, 409 + version-truth, rollback; the macro-fix family |

#### Patterns, limits, references
| File | Topic |
|---|---|
| [`24-production-patterns.md`](../plan-sync-audit/docs/24-production-patterns.md) | 40 patterns extracted from real shipping migration scripts |
| [`27-rate-limits-and-quotas.md`](../plan-sync-audit/docs/27-rate-limits-and-quotas.md) | March 2026 points model, headers, backoff math, bulk endpoints |
| [`28-adf-and-attachments.md`](../plan-sync-audit/docs/28-adf-and-attachments.md) | ADF set-only, attachment CSRF header, ADF node builders |
| [`29-forge-kvs-remote-mending.md`](../plan-sync-audit/docs/29-forge-kvs-remote-mending.md) | `appSystemToken`, `x-forge-oauth-system`, KVS REST surface |
| [`30-testing-migration-scripts.md`](../plan-sync-audit/docs/30-testing-migration-scripts.md) | nock fixtures, plan replay, dry-run CI harness |
| [`post-jcma-id-mapping.md`](../plan-sync-audit/docs/post-jcma-id-mapping.md) | Which IDs change vs persist; mapping table layout |
| [`gotchas.md`](../plan-sync-audit/docs/gotchas.md) | Common pitfalls, environment-specific quirks (now with JQL/AQL/storage/ADF/backup sections) |
| [`when-to-use-which.md`](../plan-sync-audit/docs/when-to-use-which.md) | Decision tree: plan vs sync vs audit vs one-shot |

### Templates

Copy-paste-ready files in `plan-sync-audit/templates/`:

#### Core scaffolding
| Template | Purpose |
|---|---|
| [`sub-project-skeleton.md`](../plan-sync-audit/templates/sub-project-skeleton.md) | Folder tree, zero-dep `package.json`, `.env.example`, file glossary |
| [`plan-manager.js`](../plan-sync-audit/templates/plan-manager.js) | Generic resumable PlanManager class (entity-agnostic) |
| [`plan-script.template.js`](../plan-sync-audit/templates/plan-script.template.js) | Plan entry-point template with TODO markers |
| [`sync-script.template.js`](../plan-sync-audit/templates/sync-script.template.js) | Sync entry-point template with TODO markers |
| [`audit-script.template.js`](../plan-sync-audit/templates/audit-script.template.js) | Audit entry-point template (seeded sampling) |
| [`cli-flags.md`](../plan-sync-audit/templates/cli-flags.md) | Standard flag table + zero-dep `parseArgs` helper |
| [`env-example.txt`](../plan-sync-audit/templates/env-example.txt) | Canonical `.env.example` |

#### HTTP clients & infrastructure
| Template | Purpose |
|---|---|
| [`cloud-jira-client.js`](../plan-sync-audit/templates/cloud-jira-client.js) | Native-https client with `POST /search/jql`, bulk helpers, retry state machine |
| [`cloud-confluence-client.js`](../plan-sync-audit/templates/cloud-confluence-client.js) | Native-https client, v1 CQL + v2 cursor, 409 retry, `restoreVersion` |
| [`datacenter-jira-client.js`](../plan-sync-audit/templates/datacenter-jira-client.js) | DC variant: basic + PAT auth, `startAt` pagination |
| [`datacenter-confluence-client.js`](../plan-sync-audit/templates/datacenter-confluence-client.js) | DC variant: basic + PAT auth, CQL, http/https selection |
| [`identity-resolver.js`](../plan-sync-audit/templates/identity-resolver.js) | Email-first + displayName fallback, on-disk cache, CSV override |
| [`worker-pool.js`](../plan-sync-audit/templates/worker-pool.js) | Zero-dep bounded concurrency (~30 lines) |
| [`multi-key-pool.js`](../plan-sync-audit/templates/multi-key-pool.js) | K-client × W-worker pool — one client per API token, fixed worker→client binding for cache locality |
| [`dispatcher.js`](../plan-sync-audit/templates/dispatcher.js) | Out-of-process dispatcher: one child per slot/token, persistent state JSON, slot-to-job assignment survives Ctrl-C |
| [`run-driver.sh.template`](../plan-sync-audit/templates/run-driver.sh.template) | Bash equivalent: `xargs -P N` driver pinned to one `CLOUD_API_TOKEN_X`, runs M sub-plans concurrently |
| [`heap-bumper.js`](../plan-sync-audit/templates/heap-bumper.js) | Self-bump `--max-old-space-size` + `--expose-gc` via single re-exec at script start — paste in first line of `main/*.js` |
| [`field-config-mapper.js`](../plan-sync-audit/templates/field-config-mapper.js) | Config-driven multi-field mapper — loads `field_mappings.json`, handles string/option/multi-select shapes, aggregates unmapped values |
| [`overwrite-policy.js`](../plan-sync-audit/templates/overwrite-policy.js) | Three-way decision matrix (skip-empty / write / overwrite / skip-noop / skip-target-not-empty) with type-aware equality for option fields and multi-selects |
| [`scriptrunner-exporter.js`](../plan-sync-audit/templates/scriptrunner-exporter.js) | Detect ScriptRunner-shaped workflow rules across collected workflows; emit `extensions.yaml` + Groovy stubs; static helper for `validateOnly=true` workflow roundtrip |
| [`csv-writer.js`](../plan-sync-audit/templates/csv-writer.js) | Streaming RFC-4180 CSV writer, zero-dep |
| [`multipart-builder.js`](../plan-sync-audit/templates/multipart-builder.js) | RFC-7578 multipart/form-data envelope with a retry-safe body factory — use for any binary upload that must survive 429/5xx |

#### Transform helpers
| Template | Purpose |
|---|---|
| [`adf-builders.js`](../plan-sync-audit/templates/adf-builders.js) | ADF node builders, walker, mutator, prune, semantic hash |
| [`jql-rewriter.js`](../plan-sync-audit/templates/jql-rewriter.js) | Filter ID + custom-field ID rewriters, AQL function-body wrapper |
| [`jql-sanitizer.js`](../plan-sync-audit/templates/jql-sanitizer.js) | Quoted-string-aware sanitizer: field renames, operator uppercasing, IN-list quoting, paren-less function fix |
| [`asset-field-rewriter.js`](../plan-sync-audit/templates/asset-field-rewriter.js) | Rewrite direct Assets/CMDB field refs (ARI / key / DC objectId → Cloud name), masks aqlFunction blocks |
| [`workflow-transformer.js`](../plan-sync-audit/templates/workflow-transformer.js) | Walk a workflow JSON, remap status/customField/screen/group/role IDs, drop dropped-statuses' transitions and globbed rule keys, clean JMWE prefix corruption |
| [`cloud-config-comparator.js`](../plan-sync-audit/templates/cloud-config-comparator.js) | Diff fields / statuses / issueTypes / linkTypes / priorities / resolutions between two Cloud tenants — `{missingInDest, extraInDest, changed}` per resource |
| [`excel-report-writer.js`](../plan-sync-audit/templates/excel-report-writer.js) | Multi-sheet workbook with status-color fills, frozen headers, auto-filter (requires `exceljs`) |
| [`backup-manager.js`](../plan-sync-audit/templates/backup-manager.js) | Per-entity snapshots, semantic hashing helpers, Confluence version-history rollback |
| [`cloud-catalog.js`](../plan-sync-audit/templates/cloud-catalog.js) | Snapshot fields/statuses/roles/groups/projects once; build source→dest field map |
| [`instance-fingerprint.js`](../plan-sync-audit/templates/instance-fingerprint.js) | Stamp + verify (source, destination) baseUrl pair on each plan |
| [`owner-swap.js`](../plan-sync-audit/templates/owner-swap.js) | Filter/dashboard owner-swap with try/finally + orphan-CSV on restore failure |
| [`preflight.js`](../plan-sync-audit/templates/preflight.js) | Pre-sync drift detection: compare planned source state vs live source, bucket results, abort threshold |
| [`logger.js`](../plan-sync-audit/templates/logger.js) | Dual-sink (console + file) logger with ISO timestamps and level filtering |
| [`csv-reader.js`](../plan-sync-audit/templates/csv-reader.js) | RFC-4180 CSV reader for scope filtering and identity overrides |
| [`jsm-role-preflight.js`](../plan-sync-audit/templates/jsm-role-preflight.js) | Grant a JSM actor the `Service Desk Team` role (or the app-actor permission-scheme grant) before mutating; discover Assets workspaceId |
| [`composition-macro-rewriter.js`](../plan-sync-audit/templates/composition-macro-rewriter.js) | Storage-XHTML app-macro rewriter: ancestor-stack walk, default-deny verification, back-to-front splice, param rename-with-conflict-delete, semantic-hash idempotency |
| [`xlsx-mapping-reader.js`](../plan-sync-audit/templates/xlsx-mapping-reader.js) | Read an operator-editable XLSX mapping workbook (sheets per category) into the apply scripts' mappings object (requires `exceljs`) |
| [`find-missing-issues.skeleton.md`](../plan-sync-audit/templates/find-missing-issues.skeleton.md) | The 14-step post-JCMA issue-recovery pipeline as a runnable skeleton (DC vs Cloud search, key preservation, false-positive guards) |

### Scripts

CI-safe bash helpers in `plan-sync-audit/scripts/`:

| Script | Purpose |
|---|---|
| [`preflight-check.sh`](../plan-sync-audit/scripts/preflight-check.sh) | Verify Node ≥20, `.env` present, base URLs reachable |
| [`test-auth.sh`](../plan-sync-audit/scripts/test-auth.sh) | Hit `/myself` on Cloud and DC, report OK/FAIL per host |
| [`new-script.sh`](../plan-sync-audit/scripts/new-script.sh) | Scaffold a new sub-project from the skeleton template |
| [`lint-plan-file.sh`](../plan-sync-audit/scripts/lint-plan-file.sh) | `jq`-validate plan JSON shape and per-entry status enum |
| [`audit-summary.sh`](../plan-sync-audit/scripts/audit-summary.sh) | Aggregate pass/fail counts across `logs/audit_*.csv` |

Recommended workflow: `preflight-check.sh` → `test-auth.sh` → `new-script.sh my-job` → fill TODOs → run `--plan-only` → `lint-plan-file.sh logs/plan_*.json` → run `--execute-only --dry-run` → run with `--confirm` → run audit script → `audit-summary.sh`.
