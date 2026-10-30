# Track 1: when to use, where to start

Moved verbatim from SKILL.md on 2026-10-30 (skills audit); lines 28-69 of the old file. Read by section; the CORE card in SKILL.md wins on conflict.
Part of Track 1 (Plan/Sync/Audit, `plan-sync-audit/`). Backtick paths below are relative to the skill root (~/.claude/skills/atlassian-migration/); markdown links were re-pointed (`../`) so they resolve from references/.

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
