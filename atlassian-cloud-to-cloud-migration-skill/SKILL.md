---
name: atlassian-cloud-to-cloud-migration-skill
description: >-
  Field-proven runbook for copying Jira projects (incl. JSM desks) and Confluence spaces between two
  Atlassian CLOUD sites over REST when native Cloud-to-Cloud migration cannot be used: busy production
  target, issue keys AND numbers must survive, only a subset moves, people who are not moving must be
  anonymised, existing target config must not change. Covers silent loading (notification schemes,
  autowatch, JSM customer notifications), ordered copy with fillers, parents, link direction, sprints,
  JSM desks on own config, issue-type avatars, KEEP-list anonymisation and attachment privacy
  scanning, user invites and seats, search-hidden items, test-management data, a guard dog,
  verification, source snapshot and a decision log with reverts. Use for "migrate projects/spaces to
  another Atlassian cloud site", "copy Jira between cloud instances keeping keys", "cloud to cloud
  without the migration tool", "anonymise users during migration", "load without spamming users".
---

# Atlassian Cloud-to-Cloud Migration (copy over REST)

Read from the source site, write to the target site, and control every byte that lands — the runbook from a real
production move of over a dozen Jira projects (tens of thousands of work items, several JSM desks, test-management
data) and a similar number of Confluence spaces (thousands of pages, tens of thousands of attachments) into a busy
production site.

## When to Use This Skill

Use this skill when:
- The native Cloud-to-Cloud migration is **not usable**: the target site is already in production with other
  projects, you cannot get org admin on both sides, source IT will not support it, or the tool cannot do what is asked.
- **Keys and numbers must be preserved** (`PROJ-1234` stays `PROJ-1234`), or only a **subset** of projects/spaces moves.
- **Privacy filtering** is required: only a KEEP list of people may appear on the target; everyone else is anonymised.
- **Nothing pre-existing on the target may change** and **nobody may be e-mailed** during the load.
- The source will be **switched off** soon and you need a verified copy plus a local snapshot.

Skip this skill for:
- Generic migration plumbing (Plan/Sync/Audit, http client, pagination, ADF builders, multipart) →
  `atlassian-migration-scripts-skill` (this skill links there instead of repeating it).
- Data Center → Cloud with JCMA → `atlassian-migration-scripts-skill` (post-JCMA docs).
- Org-level user/group/policy work beyond what a migration needs → `atlassian-organizations-api-skill`.
- Migrating Automation rules → `automation-engineer`.

## Pick a starting point

- **First time, planning the whole thing** → `docs/01-core-concepts.md` (phases, what a copy loses by design, red lines,
  rehearsal strategy) then `docs/02-preflight-and-target-config.md`.
- **Must not spam anyone** → `docs/03-silent-loading.md` + `templates/silent_window.py` (do this BEFORE the first item).
- **Keys and numbers must match** → `docs/04-jira-ordered-copy.md` + `templates/ordered_create.py`.
- **Privacy / anonymisation** → `docs/08-identity-and-text-privacy.md` + `docs/09-attachment-privacy.md` +
  `templates/attachment_verdicts.py` + `templates/att_gate.py` (every upload goes through it) +
  `templates/check_upload_paths.py` + `scripts/leak-scan.sh`.
- **Out of seats, inviting people** → `docs/10-users-licences-accounts.md` + `templates/inactive_users_report.py`.
- **Is it actually done?** → `docs/13-verification-and-guard-dog.md` ("a green number is not a passing test").

## Quick Reference

| I need to… | How | Doc |
|---|---|---|
| Prove the migration identity can see everything | per project `project/search?expand=insight` count vs JQL count | 02 |
| Prove a project key is free | `GET /rest/api/3/projectvalidate/key?key=K` + positive control on a taken key | 02 |
| Silence a project during load | swap to a PROVEN-EMPTY notification scheme, read back, restore + read back | 03 |
| Stop the migration account auto-watching | `PUT /rest/api/3/mypreferences?key=user.autowatch.disabled` body **bare** `true` | 03 |
| JSM customer (portal) notifications off | **no REST** — browser, record before-state, restore exactly | 03, 07 |
| Keep `PROJ-n` numbers | sequential create, filler items for gaps (create + delete), marker label per item | 04 |
| Parent refused ("does not belong to appropriate hierarchy") | fall back to an issue link of type Parent-Child | 04, `templates/parent_or_link.py` |
| Copy issue links the right way round | canonical triple; prove direction on ONE known pair first | 05, `templates/link_copy.py` |
| Comments beyond 100 | paginate `startAt` — the API caps a page at 100 whatever `maxResults` says | 04 |
| Recreate sprints | create → start → add items (≤50/call) → close, then re-seat open sprints | 05 |
| Issues the source search cannot list | enumerate by KEY RANGE, not by JQL | 06 |
| Request type on a JSM item | `PUT /rest/api/3/issue/{k}` `{"fields":{"<requestTypeField>":"<id as string>"}}` | 07 |
| Distinct icons for issue types you created | `POST /rest/api/3/universal_avatar/type/issuetype/owner/{id}` + `PUT /issuetype/{id} {"avatarId"}` | 07, `templates/issuetype_avatar.py` |
| Seats per product | `GET /rest/api/3/applicationrole` (`numberOfSeats`, `userCount`) — API token, needs Administer Jira | 10 |
| Invite a person without product access | `POST /rest/api/3/user {"emailAddress":e,"products":[]}` (caller must be ORG admin) then groups | 10 |
| Inactive users to free seats | admin-hub users search (resourceIds) + per-product last-active-dates | 10 |
| Delete a Confluence attachment for good | v2 `DELETE /wiki/api/v2/attachments/{id}` (trashes it), then the same with `?purge=true`; read back | 09, 11 |
| Archive migrated pages | `POST /wiki/rest/api/content/archive {"pages":[{"id":N}]}` → long task | 11 |
| Read page restrictions (do not lose them) | `GET /wiki/rest/api/content/{id}/restriction?expand=restrictions.user,restrictions.group` | 11 |
| Rate budget | Jira: cost points per ACCOUNT per SITE per hour; 429 → sleep to `x-ratelimit-reset` | 27 |

## The run, on one screen

```
0  decisions + approvals written down (files the scripts check)      docs/15
1  preflight: inventory, keys/names free, required fields, seats     docs/02
2  source freeze (read-only scheme COPIES, never edit originals)     docs/14
3  guard-dog BASELINE of target config (before the first write)      docs/13
4  target config: own per-project schemes, globals only if missing   docs/02, 07
5  silence: notification schemes, autowatch, JSM customer notif,
   automation that can fire on the new projects                      docs/03
6  load: Confluence spaces ‖ Jira chains (2 per account), ordered    docs/04, 11
7  post passes: cross-project links, attachment release, late
   sub-tasks, lost parents, request types, people, URLs, boards,
   sprints, fillers, worklog dedupe                                  docs/04-07, 11
8  verify + compare + leak hunt + adversarial final review           docs/13
9  notifications back (restore + read back), JSM customer notif on   docs/03
10 report to the right audience; decision log with reverts           docs/15
```

## Golden rules (each one cost real time)

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

## Authentication — what's correct, what's wrong

| Pattern | Use? |
|---|---|
| Site REST (`/rest/api/3`, `/wiki/api/v2`, `/rest/servicedeskapi`) with Basic `email:api_token` of an admin account | **Yes** — every copy/verify script |
| Two admin migration accounts with disjoint project lists | **Yes, when the target owner provides them** — each had its own observed budget; never create accounts just to multiply limits |
| `notifyUsers=false` on issue edits and worklogs | **Yes, with Administer Jira or Administer Projects** — otherwise it is ignored; comment create, transitions, attachments, links have no such flag |
| Admin hub APIs (`admin.atlassian.com/gateway/api/admin/...`) with a user API token | **No** — 401; use the logged-in browser session, or an org API key on `api.atlassian.com/admin` (see `atlassian-organizations-api-skill`) |
| JSM customer notifications, JSM queue create, board columns, account claiming over REST | **No public endpoint** — browser automation, read back, screenshot |
| Setting comment `author`/`created` or issue `created` | **No** — 201 and silently ignored / 400; keep original author+date as TEXT |
| Test-management app API keys | Per USER **and** per SITE; generated in the app UI on the target |

## Failure strategies

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

## Documentation map

| File | Topic |
|---|---|
| [`01-core-concepts.md`](docs/01-core-concepts.md) | Why copy-based, what is lost by design, phases, red lines, rehearsals, roles |
| [`02-preflight-and-target-config.md`](docs/02-preflight-and-target-config.md) | Inventory, keys/names, required fields, own schemes, globals, mapping by name, automation |
| [`03-silent-loading.md`](docs/03-silent-loading.md) | Every e-mail channel and how each was closed; locks, windows, restore gates |
| [`04-jira-ordered-copy.md`](docs/04-jira-ordered-copy.md) | Keys/numbers, fillers, lost creates, parents, status walk, fields, comments, worklogs, attachments |
| [`05-links-sprints-boards.md`](docs/05-links-sprints-boards.md) | Link direction, missing link types, cross-project links, boards, filters, sprints |
| [`06-proving-negatives.md`](docs/06-proving-negatives.md) | Search-hidden items, hidden users, positive controls, index lag |
| [`07-jsm-desks.md`](docs/07-jsm-desks.md) | Desks on own config, request types, queues, avatars, roles, resolutions |
| [`08-identity-and-text-privacy.md`](docs/08-identity-and-text-privacy.md) | KEEP list, placeholder, matcher rounds, collisions, history caveat |
| [`09-attachment-privacy.md`](docs/09-attachment-privacy.md) | Default-deny, OCR passes, archives, draw.io, verdict merge, purge |
| [`10-users-licences-accounts.md`](docs/10-users-licences-accounts.md) | Invites, groups, claiming, seats, suspending inactive users |
| [`11-confluence.md`](docs/11-confluence.md) | Tree order, draw.io, archived pages, whiteboards, comments, link rewriting |
| [`12-test-management-data.md`](docs/12-test-management-data.md) | Zephyr-class apps: per-user rate limit, bulk jobs, what cannot be set |
| [`13-verification-and-guard-dog.md`](docs/13-verification-and-guard-dog.md) | Compare, spot checks, leak hunt, guard dog red lines, final review |
| [`14-source-freeze-and-snapshot.md`](docs/14-source-freeze-and-snapshot.md) | Read-only source, local snapshot before shutdown |
| [`15-decision-log-and-reporting.md`](docs/15-decision-log-and-reporting.md) | Decisions with reverts, approvals as files, the report |
| [`27-rate-limits-and-running.md`](docs/27-rate-limits-and-running.md) | Cost budget, chains, resume, locks, monitoring, process hygiene |
| [`gotchas.md`](docs/gotchas.md) | One-line traps, grouped |

## Templates

| Template | Purpose |
|---|---|
| [`atl_http.py`](templates/atl_http.py) | Stdlib client: 429 waits to reset, GET-only 5xx retry, no blind write retries, SRC always read-only |
| [`silent_window.py`](templates/silent_window.py) | Record schemes once, prove empty, swap, read back; writer gate (hold, window, stop time, scheme) used by every writer; restore closes the window, then waits for holders |
| [`ordered_create.py`](templates/ordered_create.py) | Create at exact number with fillers, marker labels, upward hidden-item probe, GET-forward resume, lost-create recovery, drift abort |
| [`link_copy.py`](templates/link_copy.py) | Safe direction probe per type, canonical triples, fallback type, attributable-only repair, record for revert |
| [`parent_or_link.py`](templates/parent_or_link.py) | Set parent; only a `parent` refusal becomes a Parent-Child link (direction verified); dry run default |
| [`issuetype_avatar.py`](templates/issuetype_avatar.py) | Upload a PNG as an issue-type avatar and assign it, before/after record |
| [`inactive_users_report.py`](templates/inactive_users_report.py) | Rank suspension candidates from admin-hub JSON with exclusions — never suspends |
| [`attachment_verdicts.py`](templates/attachment_verdicts.py) | Merge scan files: held wins (incl. holds after a release), exact eye-clear, exact-pair release, disagreements |
| [`att_gate.py`](templates/att_gate.py) | ONE verdict on the BYTES before every upload: recursive archives, office images + embeddings, every PDF page, EMF/WMF bitmaps, `data:` images, e-mail parts, binary strings, profile paths, secrets, video held; your list lens + a built-in shape lens; allowlists as data; fail closed |
| [`check_upload_paths.py`](templates/check_upload_paths.py) | Exit 1 while any script writes attachments without calling the gate; use as a preflight check and a ratchet test |
| [`jsm_customer_notifications.mjs`](templates/jsm_customer_notifications.mjs) | Playwright: record/disable/restore JSM customer notification rules |
| [`decision-log.md`](templates/decision-log.md) | Decision entry format with owner, why, scope, records, revert |

## Scripts

| Script | Purpose |
|---|---|
| [`preflight-check.sh`](scripts/preflight-check.sh) | Auth on both sites, admin rights, seats, project keys free (with positive control) |
| [`leak-scan.sh`](scripts/leak-scan.sh) | Grep a directory (export, snapshot, repo) for every term of a denylist file; prints locations only |

Offline regression tests: `python3 tests/test_templates_offline.py` and `bash tests/test_leak_scan.sh`.

## Changelog

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
  new lesson: OCR screenshots embedded in office files/PDFs. Offline tests in `tests/`; writers re-run live.
