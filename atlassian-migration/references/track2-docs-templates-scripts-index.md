# Track 2: documentation map, templates, scripts, offline tests

Moved verbatim from SKILL.md on 2026-10-30 (skills audit); lines 498-545 of the old file. Read by section; the CORE card in SKILL.md wins on conflict.
Part of Track 2 (Cloud-to-Cloud copy, `cloud-to-cloud/`). Backtick paths below are relative to the skill root (~/.claude/skills/atlassian-migration/); markdown links were re-pointed (`../`) so they resolve from references/.

### Documentation map

| File | Topic |
|---|---|
| [`01-core-concepts.md`](../cloud-to-cloud/docs/01-core-concepts.md) | Why copy-based, what is lost by design, phases, red lines, rehearsals, roles |
| [`02-preflight-and-target-config.md`](../cloud-to-cloud/docs/02-preflight-and-target-config.md) | Inventory, keys/names, required fields, own schemes, globals, mapping by name, automation |
| [`03-silent-loading.md`](../cloud-to-cloud/docs/03-silent-loading.md) | Every e-mail channel and how each was closed; locks, windows, restore gates |
| [`04-jira-ordered-copy.md`](../cloud-to-cloud/docs/04-jira-ordered-copy.md) | Keys/numbers, fillers, lost creates, parents, status walk, fields, comments, worklogs, attachments |
| [`05-links-sprints-boards.md`](../cloud-to-cloud/docs/05-links-sprints-boards.md) | Link direction, missing link types, cross-project links, boards, filters, sprints |
| [`06-proving-negatives.md`](../cloud-to-cloud/docs/06-proving-negatives.md) | Search-hidden items, hidden users, positive controls, index lag |
| [`07-jsm-desks.md`](../cloud-to-cloud/docs/07-jsm-desks.md) | Desks on own config, request types, queues, avatars, roles, resolutions |
| [`08-identity-and-text-privacy.md`](../cloud-to-cloud/docs/08-identity-and-text-privacy.md) | KEEP list, placeholder, matcher rounds, collisions, history caveat |
| [`09-attachment-privacy.md`](../cloud-to-cloud/docs/09-attachment-privacy.md) | Default-deny, OCR passes, archives, draw.io, verdict merge, purge |
| [`10-users-licences-accounts.md`](../cloud-to-cloud/docs/10-users-licences-accounts.md) | Invites, groups, claiming, seats, suspending inactive users |
| [`11-confluence.md`](../cloud-to-cloud/docs/11-confluence.md) | Tree order, draw.io, archived pages, whiteboards, comments, link rewriting |
| [`12-test-management-data.md`](../cloud-to-cloud/docs/12-test-management-data.md) | Zephyr-class apps: per-user rate limit, bulk jobs, what cannot be set |
| [`13-verification-and-guard-dog.md`](../cloud-to-cloud/docs/13-verification-and-guard-dog.md) | Compare, spot checks, leak hunt, guard dog red lines, final review |
| [`14-source-freeze-and-snapshot.md`](../cloud-to-cloud/docs/14-source-freeze-and-snapshot.md) | Read-only source, local snapshot before shutdown |
| [`15-decision-log-and-reporting.md`](../cloud-to-cloud/docs/15-decision-log-and-reporting.md) | Decisions with reverts, approvals as files, the report |
| [`27-rate-limits-and-running.md`](../cloud-to-cloud/docs/27-rate-limits-and-running.md) | Cost budget, chains, resume, locks, monitoring, process hygiene |
| [`gotchas.md`](../cloud-to-cloud/docs/gotchas.md) | One-line traps, grouped |

### Templates

| Template | Purpose |
|---|---|
| [`atl_http.py`](../cloud-to-cloud/templates/atl_http.py) | Stdlib client: 429 waits to reset, GET-only 5xx retry, no blind write retries, SRC always read-only |
| [`silent_window.py`](../cloud-to-cloud/templates/silent_window.py) | Record schemes once, prove empty, swap, read back; writer gate (hold, window, stop time, scheme) used by every writer; restore closes the window, then waits for holders |
| [`ordered_create.py`](../cloud-to-cloud/templates/ordered_create.py) | Create at exact number with fillers, marker labels, upward hidden-item probe, GET-forward resume, lost-create recovery, drift abort |
| [`link_copy.py`](../cloud-to-cloud/templates/link_copy.py) | Safe direction probe per type, canonical triples, fallback type, attributable-only repair, record for revert |
| [`parent_or_link.py`](../cloud-to-cloud/templates/parent_or_link.py) | Set parent; only a `parent` refusal becomes a Parent-Child link (direction verified); dry run default |
| [`issuetype_avatar.py`](../cloud-to-cloud/templates/issuetype_avatar.py) | Upload a PNG as an issue-type avatar and assign it, before/after record |
| [`inactive_users_report.py`](../cloud-to-cloud/templates/inactive_users_report.py) | Rank suspension candidates from admin-hub JSON with exclusions — never suspends |
| [`attachment_verdicts.py`](../cloud-to-cloud/templates/attachment_verdicts.py) | Merge scan files: held wins (incl. holds after a release), exact eye-clear, exact-pair release, disagreements |
| [`att_gate.py`](../cloud-to-cloud/templates/att_gate.py) | ONE verdict on the BYTES before every upload: recursive archives, office images + embeddings, every PDF page, EMF/WMF bitmaps, `data:` images, e-mail parts, binary strings, profile paths, secrets, video held; your list lens + a built-in shape lens; allowlists as data; fail closed |
| [`check_upload_paths.py`](../cloud-to-cloud/templates/check_upload_paths.py) | Exit 1 while any script writes attachments without calling the gate; use as a preflight check and a ratchet test |
| [`jsm_customer_notifications.mjs`](../cloud-to-cloud/templates/jsm_customer_notifications.mjs) | Playwright: record/disable/restore JSM customer notification rules |
| [`decision-log.md`](../cloud-to-cloud/templates/decision-log.md) | Decision entry format with owner, why, scope, records, revert |

### Scripts

| Script | Purpose |
|---|---|
| [`preflight-check.sh`](../cloud-to-cloud/scripts/preflight-check.sh) | Auth on both sites, admin rights, seats, project keys free (with positive control) |
| [`leak-scan.sh`](../cloud-to-cloud/scripts/leak-scan.sh) | Grep a directory (export, snapshot, repo) for every term of a denylist file; prints locations only |

Offline regression tests: `python3 cloud-to-cloud/tests/test_templates_offline.py` and `bash cloud-to-cloud/tests/test_leak_scan.sh`.
