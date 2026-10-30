# Track 1: failure strategies and rate-limit math

Moved verbatim from SKILL.md on 2026-10-30 (skills audit); lines 222-254 of the old file. Read by section; the CORE card in SKILL.md wins on conflict.
Part of Track 1 (Plan/Sync/Audit, `plan-sync-audit/`). Backtick paths below are relative to the skill root (~/.claude/skills/atlassian-migration/); markdown links were re-pointed (`../`) so they resolve from references/.

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
