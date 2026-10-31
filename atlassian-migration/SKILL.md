---
name: atlassian-migration
description: "Atlassian migrations: Node.js DC-to-Cloud or Cloud-to-Cloud sync/audit scripts (post-JCMA ID repair, identity resolution, Forge KVS mending, bulk backfills, macro rewrites, broken filter JQL) and Cloud-to-Cloud copy over REST without the native tool (keys kept, subsets, anonymisation, silent loading). Use for moving Jira/spaces between cloud sites or JCMA cleanup."
---

# Atlassian Migration
CORE CARD. Read this card whole: it holds the hard rules, the Definition of Done, the gates in code and the LONG RUNS
section. The references are LOOKUP: open only the file the index at the end names for your task; this card wins over
any reference line. Track docs, templates and scripts stay in `plan-sync-audit/` and `cloud-to-cloud/`.

One skill, two tracks. They share the same discipline (plan before you write, never blind-retry a write,
prove every negative, audit with an independent method) and link to each other instead of repeating.

| Your job | Track | Start at |
|---|---|---|
| Writing migration / bulk data-fix scripts (DC→Cloud or Cloud↔Cloud), post-JCMA repair, Forge KVS mending, filter JQL rewrites, macro rewrites | **Plan/Sync/Audit** — `plan-sync-audit/` | references/track1-triad-flags-and-skeleton.md, then `plan-sync-audit/docs/` |
| Copying whole Jira projects (incl. JSM desks) and Confluence spaces between two CLOUD sites over REST, keeping keys, under a privacy/KEEP list, without e-mailing anyone | **Cloud-to-Cloud copy** — `cloud-to-cloud/` | references/track2-run-and-golden-rules.md, then `cloud-to-cloud/docs/01-core-concepts.md` |

Neighbours: org-level user/group/policy work → `atlassian-organizations-api-skill`; Automation rules →
`atlassian-automation`; plain Jira/Confluence REST from an external app → `jira-api-skill` / `confluence-api-skill`.

## HARD RULES
1. **No mutation without `--confirm`; dry-run first.** Plans, dry-runs and audits refuse to write without it; dry-run
   wins over confirm (old L136-143, L168-171). WHY: a bulk write you did not preview cannot be un-sent.
2. **Plan, then apply only a saved, fresh plan to the right tenant.** `--plan-only` -> CSV spot-check -> preflight drift
   check -> `--execute-only --plan-file` (old L121-151, L59, L93). WHY: a stale plan or the wrong site silently
   overwrites user edits.
3. **Every numeric ID changes; map at plan time.** Only `accountId` is a stable user id; custom field ids are never
   portable; persist the maps (old L216-218). WHY: a source id used on the target hits the wrong object or 404s.
4. **Never blind-retry a write.** A timed-out POST may have created the item: look for your marker label at the
   expected key first. Retry 5xx only for GET; 429 is always safe to resend (old L458-459). WHY: duplicates and
   `NUMBER DRIFT` (old L485).
5. **A 0, a 404 or "not found" authorises nothing until proven on the same object** (old L456-457; doc 06). Count by
   KEY RANGE, not with the copy's own blind index (old L495). WHY: search-hidden items, hidden users, Forge 404s.
6. **Never edit a pre-existing object on the target**; own `<KEY>: ...` schemes; globals only with written approval;
   `workflows/create` upserts a listed global status (old L451-453). WHY: the target is a busy production site.
7. **Silence is a read-back, before item 1**, and restoring it is read back too (old L397, L454-455, run steps 5 and 9).
   WHY: nobody may be e-mailed during the load.
8. **Every attachment upload goes through `att_gate.py`; held wins** (old L462, L532-533). WHY: 2026-09-30, 1,209
   files with private content were live on a target for 10-13 h (LONG RUNS below).
9. **The verifier must not share the copier's blind spot**: audit with an independent method (old L9, L460-461).
10. **Every decision taken on the client's behalf goes in a log with its exact revert** (old L465). On a CLIENT's
    production site, config changes need the client's yes first (~/.claude/CLAUDE.md "Production config on a CLIENT
    system"); wolfaenpak is the free test bed.
11. **Kill by PID, never `pkill -f`**; a stalled Track 1 run is NOT killed on your own: diagnose, propose doc 13's
    action, `kill -SIGTERM <PID>` only on the owner's yes, then `--retry-failed` (old L26, L466).
12. **An agent's "done"/"green" is a claim, not evidence.** Re-check it yourself against the SOURCE with an
    independent method before relaying (derived from old L403 "a green number is not a passing test", L25, L460).

## DEFINITION OF DONE
- **Cloud-to-Cloud copy:** run steps 8-10 done (old L444-446): compare + leak hunt + adversarial final review;
  notifications and JSM customer notifications restored AND read back; report + decision log with reverts. Evidence
  you re-check yourself: per project a count by key range against the source (old L495); 5+ random items and 2+ pages
  field by field vs source (number, type, status, comments, attachments, watchers = migration accounts only, no
  mentions, no names outside the KEEP list; old L25); guard dog with 0 VIOLATION lines; `leak-scan.sh` and
  `check_upload_paths.py` exit 0; cloud-to-cloud/docs/13 section 6 "Before you write done" (every user-visible field
  on the real projects, every number with population + control, what is NOT covered).
- **Plan/Sync/Audit run** (old L367): `lint-plan-file.sh` passed on the plan; `--execute-only --dry-run` reviewed;
  preflight drift under threshold; the `--confirm` run ends with `failed` = 0 or each failure explained;
  the seeded audit script re-fetched a sample from the DESTINATION and `audit-summary.sh` shows no mismatch.
- **Skill edit:** `python3 ~/Projects/machine-sync/bin/skill-lint atlassian-migration` PASS;
  `/usr/bin/python3 ~/Projects/machine-sync/tests/test_long_run_sections.py` OK; in ~/Projects/leanzero-forge-skills
  `python3 scripts/check-frontmatter.py` and the CONVENTIONS.md link check OK; offline tests below pass; commit
  carries no AI credit line (public repo hooks refuse it).

## GATES IN CODE (each refuses with a non-zero exit or an exception)
| gate | command | refuses |
|---|---|---|
| confirm gate | `plan-sync-audit/templates/sync-script.template.js` (`main/sync.js`) | any mutating run without `--confirm` |
| wrong tenant | `plan-sync-audit/templates/instance-fingerprint.js` verify | a plan whose (source, destination) baseUrls differ |
| stale plan | `plan-sync-audit/templates/preflight.js` (exit 2 above the drift ratio) | applying a plan whose source drifted |
| plan shape | `plan-sync-audit/scripts/lint-plan-file.sh logs/plan_<id>.json` | bad plan JSON or a status outside pending/completed/failed/skipped |
| env / auth | `plan-sync-audit/scripts/preflight-check.sh`, `test-auth.sh`; `cloud-to-cloud/scripts/preflight-check.sh` | missing Node/.env, unreachable hosts, failed `/myself`, no admin, key taken |
| read-only source | `cloud-to-cloud/templates/atl_http.py` | any write to SRC ("REFUSED ... on read-only site"); 5xx retry on writes |
| key numbers | `cloud-to-cloud/templates/ordered_create.py` | continuing after `NUMBER DRIFT` |
| silent window | `cloud-to-cloud/templates/silent_window.py` writer gate | writes outside the hold/window/stop time/scheme (`SILENT_GATE=off` warns) |
| attachment bytes | `cloud-to-cloud/templates/att_gate.py` | any file not proven clean (fails closed: HELD_UNREADABLE) |
| ungated uploads | `python3 cloud-to-cloud/templates/check_upload_paths.py <scripts-dir>` | a script that uploads without calling the gate |
| leaks | `cloud-to-cloud/scripts/leak-scan.sh` | any denylist term in a dir (exit 1) |
| templates | `python3 cloud-to-cloud/tests/test_templates_offline.py`; `bash cloud-to-cloud/tests/test_leak_scan.sh` | template regressions |
| skill shape | `~/Projects/machine-sync/bin/skill-lint atlassian-migration`; `tests/test_long_run_sections.py` | card > 200 lines, no DoD, unindexed refs; a LONG RUNS section missing a part |
| repo | `scripts/check-frontmatter.py`; commit-msg + pre-push hooks (leanzero-forge-skills) | bad frontmatter; an AI credit line in a commit |
Prose only (no code gate): rules 3, 5, 6, 9, 10, 12; the five post-JCMA rules; vigil and kill criteria.

## LONG RUNS (>30 min)
Rule home: ~/.claude/CLAUDE.md "ANYTHING OVER 30 MINUTES". Measured numbers, incidents and the full vigil: references/long-runs.md.
- **Long jobs:** CAUSE = a production copy or data fix. C2C Jira chains (`ordered_create.py`, 2 accounts x 2 chains) ~6-7 h; Confluence copy + verify ~2-3 h; post passes ~1-1.5 h each (`cloud-to-cloud/docs/27-rate-limits-and-running.md`); Track 1 `--confirm` runs: estimate from the smoke's per-batch rate.
- **Past incident:** 2026-09-30 a prod C2C copy ran ~6 h with one attachment lens blind to light-on-dark text; a 2 h 34 min OCR pass later removed 1,209 files live for ~10-13 h.
- **Cheaper probe first:** `cloud-to-cloud/scripts/preflight-check.sh` (~10 min), then ONE small project end to end on a sandbox with prod config (470 items ~21 min); Track 1 `--dry-run --limit 5` (minutes).
- **Front-load (first 30 min):** guard-dog baseline PROVEN (T1-T5 synthetic triggers, HALT kills a dummy tree) before the first write; first project's creates with fillers; every attachment lens (`att_gate.py`, `check_upload_paths.py`) on a sample; one deliberate 429 wait.
- **Vigil checklist:** a separate read-only reviewer every 15-20 min: per chain from `runs/<target>/` logs (`PROJ n/max`, items/h), the ALERTS file (`NUMBER LOST`, `POST FAIL`, `CREATE <P> FAILED`), guard-dog tick < 10 min old with 0 VIOLATION; every 30 min 5 items + 2 pages field by field vs source. A silent chain: `sample <pid>` + map-log mtime.
- **Kill criteria:** guard-dog HALT; `NUMBER DRIFT`; a detector hit on the newest 30 items / 10 pages; no first checkpoint by its deadline; an instant reproducible 500. A stalled Track 1 run is NOT killed alone: surface doc 13's diagnosis, `kill -SIGTERM <PID>` only on the owner's yes.

## REFERENCE INDEX (one level deep; open only what your task needs)
| file | read when |
|---|---|
| references/track1-when-to-use-and-start.md | Track 1: is this the right tool; which doc/template to start from (JSM, automation rules, JCMA recovery, macros, JQL, attachments, Forge KVS) |
| references/track1-quick-reference.md | Track 1: "I need to..." -> template + doc table |
| references/track1-triad-flags-and-skeleton.md | Track 1: Plan->Sync->Audit diagram, two-gate and two-phase flags, complete sync entry point |
| references/track1-auth-and-post-jcma-rules.md | Track 1: which auth patterns are right/wrong; the five rules of post-JCMA work |
| references/track1-failures-and-rate-limits.md | Track 1: symptom -> first fix table (429, 409, 410, 401 KVS, JSM actor...); March 2026 rate-limit math |
| references/track1-docs-templates-scripts-index.md | Track 1: every doc, template and script in `plan-sync-audit/` with its purpose; recommended workflow |
| references/track2-when-to-use-and-start.md | Track 2: when a REST copy beats the native tool; where to start |
| references/track2-quick-reference.md | Track 2: "I need to..." -> how + doc (autowatch, keys free, sprints, seats, purge...) |
| references/track2-run-and-golden-rules.md | Track 2: the run on one screen (steps 0-10) and the nine golden rules |
| references/track2-auth-and-failures.md | Track 2: auth table (what has no REST); symptom -> first fix table |
| references/track2-docs-templates-scripts-index.md | Track 2: every doc, template and script in `cloud-to-cloud/`; offline tests |
| references/long-runs.md | LONG RUNS full text: every measured duration, incidents, the full vigil and kill list |
| references/official-docs.md | Atlassian REST, rate-limit, migration and Forge remote-storage pages |
| references/CHANGELOG.md | dated history of both tracks and the 2026-10-03 merge (never read it to decide what to do today) |
Grep across all: `grep -rn "<term>" ~/.claude/skills/atlassian-migration/references/ ~/.claude/skills/atlassian-migration/*/docs/`.
