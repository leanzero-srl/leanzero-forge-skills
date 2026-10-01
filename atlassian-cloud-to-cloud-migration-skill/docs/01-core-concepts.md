# Core concepts — copy-based Cloud-to-Cloud migration

A copy-based migration reads every object from the **source** site over REST and creates a new object on the
**target** site. Nothing is "moved": the target gets brand-new items that look like the old ones, and you decide,
field by field, what they carry. That is both the cost (you rebuild what the platform would have carried) and the
point (nothing reaches the target that your code did not write).

For the generic plumbing — resumable plan files, retrying http client, pagination, ADF builders, multipart uploads,
seeded audits — use `atlassian-migration-scripts-skill`. This skill is about what is specific to copying between two
live cloud sites under production constraints.

## When the native Cloud-to-Cloud tooling is not the answer

Atlassian's own cloud-to-cloud migration is the first thing to evaluate. Teams end up copying over REST when one or
more of these hold:

| Constraint | Why it pushes you to a copy |
|---|---|
| The target is a busy production site | You need certainty that no shared scheme, field, status or workflow changes; you want every object you create to be named and owned by the migration so it can be audited and reverted |
| Org admin is not available on both sides, or the source org's IT will not support the tool | The native route needs those roles; a copy needs only site/product admin on the source (read) and target (write) |
| Keys AND numbers must be preserved | A copy can hold numbers by creating in order and burning gaps (doc 04) |
| Only a subset moves | Copy exactly the projects/spaces in scope, exclude pages by id, leave the rest |
| Privacy: only a KEEP list of people may appear on the target | Changelogs, page versions, creators and worklog authors cannot be edited after a move — only a copy can keep names out (doc 08) |
| The source is switched off on a fixed date | A copy can be run, verified and repaired while the source is still readable, and snapshotted locally before it goes (doc 14) |

Field note: the decisive argument was privacy. The issue CHANGELOG (who changed what) has no edit/delete API, the
Creator field is not editable, worklog and attachment authors are not editable, Confluence page/comment authors are
not editable and every page version carries its editor. Anything that moves those objects carries the names. A copy
writes only what passed the scrubber.

## The routes, compared honestly

Do not dismiss a supported route in writing — the other side can quote Atlassian's documentation back at you. Put the
trade-off on the table and let the owner choose.

| Route | Needs | Keeps | Cannot |
|---|---|---|---|
| Native cross-org copy ("Copy product data" / data transfer) | ONE person who is org admin in BOTH orgs (the destination only appears in the dropdown for that person) | history, authors, dates | anonymise (every referenced user is copied under their real name); keep target config untouched in every case (see below) |
| Confluence CSV space export/import | exporter = space admin on source, importer = site admin on target | page history, comments, mentions | whiteboards, databases, user accounts; a space whose key already exists on the target (it never overwrites); page-level selection (all-or-nothing per space) |
| Jira CSV import | Jira admin on target | Created/Updated dates, reporter, assignee, comment author + date, worklog author + date, parents (parents before children), links, sprint, resolved date (only with the Resolution column) | fetch attachments behind the source login; more than ~1,500 items per file comfortably; numbers — CSV numbers sequentially, so source gaps shift every key |
| REST copy (this skill) | read on source (site admin helps), admin on target | keys AND numbers (fillers), privacy filtering, item-by-item control, resume, re-runs up to the freeze, verification per item | Created/Updated/Resolved/Creator, comment/worklog authors (all become the migration account + date) — keep them as text |

Field note: the plan originally relied on the native transfer with the source org admin clicking through it; it died
when the source organisation's IT declined to support it. The constraint to establish first is "who is org admin
where" — REST is the route precisely because it works without org admin. Another point that went back and forth: a
site admin exporting a Confluence space via CSV/XML exports ALL content, a non-admin only what they can see.

Field note: the lead overruled CSV for Jira ("all in REST") for control — project by project, item by item, stop /
resume / re-run up to the freeze, same route as Confluence — not for fidelity. Write both columns honestly.

### If the native route is evaluated: what it does to groups and config

From Atlassian's own pages (re-fetched and quoted during the engagement; reproduce before relying on them):

- **Groups link by NAME on every route.** Cloud-to-Cloud copy merges a same-named group ADDITIVELY in BOTH directions:
  the merged group keeps the source group's project permissions and gets the destination group's permissions. A
  destination-only member gains source projects under either user option ("users and groups separately" or "users
  with their groups"). Run a group-name collision audit in both directions before the first run
  (`GET /rest/api/3/group/bulk`, lower-case both lists, intersect, print member counts).
- Ordinary admin groups (jira-admins-style) are migrated and merge; only a short blocklist (site-admins,
  system-administrators, atlassian-addons, atlassian-addons-admin) is skipped. Measured on a test site: adding a user to
  the site's Jira admin group granted global ADMINISTER immediately, even without Jira app access.
- Re-running a transfer from the same source only ADDS users, groups and memberships; it never removes any. A
  test-then-production plan leaves the union of every run in the target groups.
- Content ids are not preserved; entities with the same name that cannot be linked get a "(migrated)" suffix (statuses,
  priorities, fields — you will meet these on a target that already went through a native copy; match exact names).
- Documented soft limits seen: 200 projects per copy plan, 100 GB of attachments per project. Data transfer into a
  destination with customer-managed keys was not documented either way — get written confirmation and test small.
- Audit logs are not carried by Atlassian's migration tooling (stated for server→cloud) and a REST copy cannot carry
  them either: export the source audit log before decommissioning if anyone may need it.

## What a copy loses by design (state it up front)

| Lost | Why | What we did instead |
|---|---|---|
| Created/updated dates of items | `POST /rest/api/3/issue` with `created` → 400 "Field 'created' cannot be set" | Origin note in the description: source key, original type/status, created/resolved dates, resolution |
| Comment author and date | `author`/`created` in the comment body → **201 and silently ignored** | A header line on every comment: `<author or placeholder> (<date>):` |
| Attachment uploader and date | Same: uploader = the API account, date = now | Nothing (file name kept, scrubbed) |
| Issue history / changelog | No write API | Nothing — say so |
| Votes, watchers | Deliberately not copied (watchers would also be e-mailed) | Nothing |
| Confluence page history and authors | New pages start at v1 by the migration account | Origin note at the TOP of every page (readers asked for top, not bottom) |
| Inline comment anchors | `POST /wiki/api/v2/inline-comments` mints its own marker ref and ignores yours | Re-post as footer comments quoting the selection, or re-bind (doc 11) |
| JSM SLA history, request participants, organizations, portal settings, queues, customer-notification templates | Not readable/writable over REST, or personal data | Rebuild queues in the UI; SLAs start fresh; say so |
| Board columns, swimlanes, quick filters | No public write API | List the source columns in the report; set by hand if wanted |
| Closed sprint `completeDate` | Agile API ignores it on close | Sprint closes "today"; say so |
| Automation rules | Separate subsystem | `automation-engineer` skill |
| Fields the target has no home for | No field / not on the screen | Decision: append as a marked section in the description (doc 04) |
| Time in status, likes, page views, watchers of pages, inline tasks' history | Not settable | Nothing — list it |
| Restricted Jira comments and Confluence page restrictions | Not read/copied by a naive copy — restricted content becomes VISIBLE | Read restrictions; re-restrict for KEEP people/groups, or keep the content out (doc 11) |
| Dynamic macros (recently updated, contributors, children, task reports) | They render the TARGET's data | List them as "changes", not "breaks" |

## Phases and their gates

```
DECIDE      what moves, KEEP list, mappings, keys, silence approach, freeze time      -> approvals as files
PREFLIGHT   inventory, keys/names free, required fields, seats, rate budget           -> preflight passes
FREEZE      source read-only (scheme COPIES), source snapshot started                   -> source owner confirms
BASELINE    guard-dog snapshot of every pre-existing target config object              -> refuses to re-baseline
CONFIGURE   projects, own schemes, globals (approved list), JSM desks, teams            -> ownership marker per project
SILENCE     notification schemes, autowatch, JSM customer notif, automation pause       -> read back, gate file written
LOAD        Confluence loop ‖ Jira chains (sequential per project, parallel post-work)  -> chain says `done:`
POST        cross links, attachment release, late sub-tasks, lost parents, request types,
            people, URL rewrite, boards/sprints, fillers, worklog dedupe               -> each step idempotent
VERIFY      compare, leak hunt, spot checks, final review + adversarial reviewer        -> FAILs explained one by one
RESTORE     notification schemes back (read back), JSM customer notif on, automation    -> table equals before-state
REPORT      post-migration report (restricted), decision log with reverts               -> owner sign-off
CLEAN UP    rehearsal copies deleted + trash purged; local data purged after sign-off
```

Every gate is a **file or a read-back the next script checks**, not a sentence in a runbook. "The run refuses to start
without `approvals/client-yes.ok`" is a gate. "Remember to ask the client" is not.

## Red lines (write them down, then enforce them in code)

These came from the engagement owner and every script checked them:

1. **Never change anything pre-existing on the target.** Breaking target data is the one unrecoverable outcome.
2. **No e-mails or notifications to anyone** during the load.
3. **The source stays read-only; we write nothing to it** (apart from the freeze itself, done with new scheme copies).
4. **No personal data of non-movers on the target.**

The guard dog (doc 13) checks all four every few minutes and can HALT the run.

## Rehearse on a sandbox with production's configuration

The single most valuable thing was two full rehearsals plus a mini-rehearsal on the CURRENT code, each on a sandbox
whose configuration matched production. Each one found defects that would have shipped:

- The production create screens had **no system Description** for most types, only a custom "Story Description" with
  a template default. Jira accepted the POST and stored the template; the copied text and the origin note were lost on
  ~half of all items in rehearsal 2. Fix: read `createmeta` per type at start, PUT the description right after create
  for types without it (doc 04).
- A required field enforced by a **workflow validator** that `createmeta` reports as optional (doc 02).
- The agreed type mapping was never applied (a legacy map won) → every Epic child lost its parent.
- A workflow transition with an **app post-function** that creates items in OTHER projects (doc 04).
- A greedy status walk that **re-opened** closed items while hunting for an unreachable status.

A note saying "the sandbox is config-identical to production" was stale by the time it mattered (production had over a
hundred more types, statuses and fields). "Representative" means: the same target configuration, measured; projects
created the way production will create them; the whole scope in one run; the real KEEP list; the same evidence and
sign-off flow; results checked from the users' seat.

Rules that follow:

- Rehearse the production PATH (same scripts, same mapping, same defaults files), not a convenient variant.
- Sandbox copies hold real data too. If the privacy rules apply to production they apply to the sandbox: a leak into a
  sandbox of the client's organisation is still a transfer. Restrict rehearsal spaces/projects to admins and delete them
  (and purge the trash) when done.
- A sandbox may share groups with production (cloud sandboxes do share org-level groups): adding someone to a group "on
  the sandbox" can grant production access. Check where a group grants access before touching it.
- Rehearsal copies made with an older scrubber carry its residue; they are not evidence for the final code.

## Data protection statement

Content passes through the operator's machine (download, scan, transform, upload). Say so to the data owner before the
run: where it sits (an authorised work machine), what is kept (packages, caches, snapshots, people lists), and when it
is deleted (rehearsal copies by a fixed date, local copies within an agreed time after sign-off — including git history
if any list was ever committed).

## Roles

| Role | Typically | Decides |
|---|---|---|
| Source owner | the team that owns the source site | scope, KEEP list, freeze time, what is acceptable to lose, report sign-off |
| Target config owner | target Jira/Confluence admin | schemes shared or own, new globals, mapping tables, required-field defaults, screens |
| Target org admin | identity/licensing | invites, managed accounts, group-only access, seats, suspensions |
| Migration operator | you | everything else, logged in the decision log with a revert |

Ask the owner before every config change on their production system; a yes to the plan is not a yes to each write
inside it. When a decision is needed fast, take the reversible option, log it as "open for review" with its exact
revert, and tell the owner (doc 15).

## Throughput you can plan with (measured, rounded)

- Jira writes: one admin account sustained roughly 1,700-2,100 items/hour (create + comments + attachments + status)
  before the per-account hourly cost budget ran out; two accounts with two chains each ≈ 4,000-6,000 items/hour.
- Post passes after the load took about as long again as a third of the load (cross links ~10 min, attachment release
  ~1 h, URL rewrite ~50 min, boards+sprints ~1.5 h) — budget them.
- A test-management app capped at ~30 calls/min PER USER is the long pole if it has thousands of steps (doc 12).
- Attachment privacy scanning (OCR) is CPU-bound and can run for hours; start it days before, cache text by content
  hash so a matcher change re-checks in minutes.

## See also

- `docs/15-decision-log-and-reporting.md` — the decision log is a first-class artefact, not an afterthought.
- `atlassian-migration-scripts-skill/docs/01-core-concepts.md` — Plan→Sync→Audit triad, two-gate safety flags.
