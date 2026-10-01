# Preflight and target configuration

Two jobs: know exactly what the source holds, and prepare a target that can receive it **without changing anything
that already exists there**.

## 0. Prove access with EVERY identity you hold

- A 401/403 on your token means "this identity has no access", not "there is no access". Field note: the consultancy
  account answered 401/403 on the source for weeks and "no read access" was concluded; a client-issued account (a
  different Atlassian account) turned out to be site admin there. Probe `/rest/api/3/myself` and
  `/wiki/rest/api/user/current` on BOTH sites with each identity before asserting anything.
- **Site admin does not grant issue Browse.** `ADMINISTER: true` lets you read every project's config, statuses,
  schemes and `insight` counts — and JQL still returns 0 / `PROJ-1` 404 on projects whose permission scheme does not
  grant you Browse. Compare per project:
  ```http
  GET /rest/api/3/project/search?maxResults=100&expand=insight&status=live&status=archived
      -> insight.totalIssueCount (visible to admins regardless of Browse)
  POST /rest/api/3/search/approximate-count {"jql":"project = PROJ"}
  ```
  A mismatch = a blind project (12 of 19 were blind in one probe). Ask for Browse for the migration identity.
- A 401 HTML login page = the account is not on that site (or its product access was removed); a 404 on a project =
  not in your access group — neither proves the project does not exist.
- Access notes rot: "PROJ is fully readable" was true in July and false in go-live week. Re-probe, never cite the note.
- Saved browser sessions expire silently; org API keys expire (a week of failed runs traced to an expired org key).
  Probe every credential at the start of every run.

## 1. Inventory the source (read-only)

Per Jira project:
- `GET /rest/api/3/project/{key}` — `style` (`classic` = company-managed, `next-gen` = team-managed), `projectTypeKey`
  (`software`, `service_desk`, `business`), issue types.
- Counts by type, status, resolution, priority: `POST /rest/api/3/search/approximate-count {"jql": ...}` per bucket
  (cheap) — but see doc 06 before trusting any count as "everything".
- **Max key number** per project (`ORDER BY key DESC`, first item). Gaps between 1 and max become fillers (doc 04).
- Fields actually used: walk the items once with `fields=*all` and record which custom fields are non-empty.
- Link types used, components, versions (and which are archived), boards, filters, sprints (`/rest/agile/1.0/board`,
  `/board/{id}/sprint`), JSM request types (`/rest/servicedeskapi/servicedesk/projectKey:{key}/requesttype`).
- Attachment count and bytes; people appearing anywhere (reporter, assignee, creator, comment/worklog authors,
  mentions, user-picker fields) — you need this for the KEEP list (doc 08).

Per Confluence space: pages, blog posts, folders, whiteboards, databases, archived pages, attachments, draw.io
diagrams (custom content), comments (footer + inline + replies), page restrictions, people.

### The measured "what will be lost" inventory

Before promising a date, run a read-only inventory per product of what will NOT come across, with a number on every
line and an explicit "not measured" list. Categories that turned out to matter:

- Jira: filters referencing moving projects — including shared/subscribed filters and filters that mix moving and
  staying projects; dashboards (blind: dashboard search has no admin override — most probed ids 404); boards whose
  filter also covers a staying project; sprints; versions/components; plans that point at boards you cannot see;
  automation rules scoped to the projects and multi-project rules that also cover staying projects; schemes shared with
  many other projects (copy, never move); team-managed projects (project-local config is rebuilt by hand); JSM request
  types/queues/SLAs/customers/organisations/e-mail channel/portal; app-held data (time tracking, test management,
  Assets); remote links; attachments (GB); worklogs; watchers; votes; internal comments; security levels; restricted
  comments; pages in STAYING Confluence spaces that reference moving issues (they keep pointing at the old site).
- Confluence: version history, attachment versions, authors and editors, mentioned people with no target account,
  likes, watchers, page views, space permission rows and groups that do not exist on the target, page restrictions,
  whiteboards, databases, folders, archived and trashed pages, Jira macros (to the source AND to orphaned server ids),
  absolute links to the source host incl. smart-link cards, inline tasks, dynamic macros, app macros, templates,
  logos, categories, cross-space includes.
- Blind spots to state: drafts (`status=draft` → 400), page watchers, sidebar shortcuts, comment likes, dashboards,
  issue links to projects you cannot browse (link search only returns links whose OTHER end you can see — "0 links to
  staying projects" is not proof), a `service_desk` project the servicedesk API does not list.
- CQL `macro = "X"` cannot prove an app is absent: built-in macros also return 0, so only >0 means something (use a
  nonsense-macro control). CQL found 13 pages with Jira macros where a body scan found 69 — scan bodies.
- Renaming source projects to tag the scope (e.g. a "[MOVE TO …]" prefix) broke saved filters that referenced the
  projects by NAME. Flag it, and rebuild filters by key/id.

Apps: which marketplace apps hold data you are expected to bring (test management, diagramming, forms). Prove an app
is present by its DATA (issue properties, issue types it owns, custom content types), never by one app-key probe:
a Forge app answers 404 on the Connect descriptor endpoint and that 404 once made us write "the app is not installed
on the target" when it was.

## 2. Prove keys and names are free — with a positive control

```bash
# project key: free = BOTH errorMessages and errors empty
GET /rest/api/3/projectvalidate/key?key=PROJ
# positive control on a key you KNOW is taken — the answer is in the errors MAP, not errorMessages:
#   {"errorMessages":[],"errors":{"projectKey":"Project 'X' uses this project key."}}
GET /rest/api/3/projectvalidate/key?key=TAKEN

# project name: returns the name unchanged if free, a suffixed variant if taken
GET /rest/api/3/projectvalidate/validProjectName?name=My%20Project

# space key: 404 = free only if a known space returns 200 in the same run — and check ARCHIVED spaces too,
# an archived space still holds its key
GET /wiki/rest/api/space/SPACE
GET /wiki/api/v2/spaces?keys=SPACE&status=archived
```

Field note: one source space key was already used on the target by an unrelated team. The source owner picked a new
key; every script took the mapping from one place (`SRC_KEY -> TGT_KEY`), including the link rewriter and the
attachment purge — one script that used the SOURCE key for a trash purge would have purged someone else's space.
Make the space-key map a single input, and grep your scripts for hard-coded source keys used against the target.

Also strip migration-era decorations from names (e.g. a `[MOVE TO …]` prefix the source team added) when creating
production names; decide this with the source owner.

## 3. Required fields: create ONE real item before trusting `createmeta`

`createmeta` under-reports. Measured: `GET /rest/api/3/issue/createmeta/{project}/issuetypes/{typeId}` listed four
required fields and called `Team` optional; the create returned
`400 {"errorMessages":["Field Team is required."],"errors":{}}` — the requirement came from a **workflow validator**,
and note the empty `errors` map (no field key to react to, only prose).

Rules:
- Probe each target issue type with one real create (on a sandbox with production config, or a scratch project you
  delete) and read the error.
- Keep a `defaults.json` per project/type for required values (team id as a **plain string**, a severity option, an
  Assets object, a required "Bug description" ADF field). Fillers need them too.
- Do not set a value the target derives: Jira refuses `Team` on a sub-task ("is a subtask, and inherits the team
  assignment from its parent") — see doc 04 for how that message broke a parent fallback.
- An Assets/CMDB field can accept `204` and store nothing when the workspace does not match. Read every such field
  back after the first write. The read shape (`{"workspaceId","id":"<ws>:<obj>","objectId"}`) is not the write shape
  (`[{"objectId":"…"}]` or `[{"objectKey":"…"}]`).

Assets defaults: the create on production accepted `[{"workspaceId":"<W>","id":"<W>:<objectId>","objectId":"<objectId>"}]`
(found via the Assets API, AQL by Name). Trap: the first default object was rejected because the FIELD's own AQL filter
excluded it (the object lacked the attribute the filter needs) — pick a default that the field's filter admits. Keep
hand-maintained defaults in their own file: a generator step that rewrote the defaults file at every run start wiped
the per-project mapping and the error came back mid-run.

Field note: production required an Assets "Product" field on one type that no sandbox had; every chain died at its
first item of that type in the first minutes of the production run. A per-project default (agreed placeholder value,
bulk-editable later) fixed it. Lesson: diff the required fields of production against the rehearsal site per type.

## 4. Create projects and give them their OWN configuration

Two patterns were used, chosen with the target config owner:

**A. Share an existing configuration** (software projects that should behave like an existing one): create with
shared configuration from a template project (the UI's "share settings with an existing project", internally
`POST /rest/project-templates/1.0/createshared/{existingProjectId}`). Nothing new is created, nothing existing changes.
Trap: this endpoint ignores `lead`; write an **ownership marker** right after create so later scripts can prove the
project is yours:

```http
PUT /rest/api/3/project/PROJ/properties/migration.owner
{"created":"2026-01-01T00:00:00Z","by":"create_targets"}
```

Every reconfiguring script then refuses a project that has neither you as lead nor this property, and refuses a
project that already has items (`approximate-count > 0`) — "same key, someone else's project" is never touched.

**B. Own configuration mirroring the source** (JSM desks whose workflows the target did not have): create from a
light template whose generated schemes are per-project, then build everything new and name it `<KEY>: …`. Doc 07 has
the full desk recipe. Generic rules:

- **New objects only, named after the project**: `<KEY>: <source> workflow`, `<KEY>: workflow scheme`,
  `<KEY>: resolve screen`. Easy to audit, easy to delete, impossible to confuse with shared config.
- **Prove ownership from the scheme side**: `GET /rest/api/3/workflowscheme/...` / issue type scheme with
  `expand=projects` must list exactly your project. Positive control: a shared scheme reports N projects.
- **Global objects** (statuses, issue types) are reused by NAME, case-insensitive. Missing ones are created only in a
  SEPARATE, approved step (`--globals`, gated by an approval file listing the exact names). The config step stops if a
  global is missing; it never creates globals itself.
- **`POST /rest/api/3/workflows/create` UPSERTS any existing global status you list.** Send its current `description`
  (and name/category) verbatim, or the call wipes the description on a status every other project uses. A rehearsal
  audit caught four shared statuses losing their descriptions this way.
- Templates may create globals on their own (a JSM template created "IT Help", "Waiting for support" when missing).
  Count those against the same approved list.
- Team-managed (next-gen) projects: types and statuses are project-scoped, so they create zero global objects — but
  you cannot reassign their notification scheme over REST (doc 03).

## 5. Mapping by NAME, agreed and written down

Write one `mapping.json` the copy, compare, fix-status and verify scripts all read:

```json
{
  "software": {
    "types":    {"Epic": "Feature", "Sub-bug": "Sub-task", "Initiative": "Feature"},
    "statuses": {"Done": ["Closed", "Resolved", "Done"], "Backlog": ["Open", "Opened"]},
    "not_done_status": "Rejected",
    "feature_by_target": {"Backlog": "Funnel", "In Progress": "Implementing"}
  },
  "desk": {"types": {}, "statuses": {}, "not_done_status": null},
  "resolutions": {"Fixed": "Done", "Won't Fix": "Won't Do"},
  "not_done_resolutions": ["Won't Fix", "Duplicate", "Cannot Reproduce"],
  "priorities": {"Blocker": "Highest", "Minor": "Low"}
}
```

- The mapping must cover EVERY type and status IN USE on the source, not only the ones without an obvious match
  (seven statuses and a type were uncovered in the first draft); compare names case-insensitively ("To do" vs "To Do").
- **The mapping file must actually be read by the copy.** A reviewer found that no script read it; a rehearsal then
  showed Epics arriving as Tasks (children lost their parents) because a legacy hard-coded map won. Assert at start that
  every source type has a mapping entry and print it; spot-check one parent-with-children per project.
- Map by name, never by id; ids differ per site and per project (a test app had different status ids per project).
- Compare by the agreed NAME, not by status category: a target status "Open" in category *in progress* is a correct
  mapping of source "Opened" in category *to do*. A category comparison flagged every correctly mapped open desk item,
  and the auto-fixer then MOVED them to the wrong status.
- When the target lacks a value (priority "Blocker"), do not create config — map to the nearest existing value and log
  it as a decision (doc 15).
- Level matters: if Epic maps to a level-1 type that has nothing above it, every source parent above Epic is lost
  (doc 04 Parent-Child fallback).

## 6. Automation on the target that can fire on your new items

List every ENABLED rule whose scope is the whole site or includes one of your new projects, with an event trigger
(created, transitioned, updated, commented). Use the Automation REST API (`automation-engineer` skill):

```
GET  {AUTO}/rest/v1/rule/summary?limit=300                       # AUTO = https://<site>.atlassian.net/gateway/api/automation/public/jira/{cloudId}
                                                                  #   (or https://api.atlassian.com/automation/public/jira/{cloudId}); cloudId from GET /_edge/tenant_info
PUT  {AUTO}/rest/v1/rule/{uuid}/state  {"value":"DISABLED"}      # pause; record exactly what you paused
PUT  {AUTO}/rest/v1/rule/{uuid}/state  {"value":"ENABLED"}       # resume exactly that list (also in a trap EXIT)
```

- A JSM template gives each new desk its own rules (e.g. "when a deployment is completed…"): pause those for the load.
- Site-wide SCHEDULED rules: read their JQL. A weekly "set resolution Done on done items without one" would rewrite
  your items; we added `AND project not in (<new keys>)` to its JQL (before-copy kept, JQL parse-checked with
  `POST /rest/api/3/jql/parse?validation=strict` before the PUT, read back, restore tested on a scratch clone).
- Field note: in a rehearsal, moving items to Rejected triggered an existing automation that added an internal comment
  under the migration account. Listing and pausing rules is not optional. A rule that CREATES an issue in one of your
  new projects would take the next number and break the ordered copy.
- Classify by scope first: `ruleScopeARIs` `ari:cloud:jira:<cloudId>:project/<id>` = project scope (rules scoped to OTHER
  existing projects cannot fire on yours), `ari:cloud:jira::site/<cloudId>` = site-wide. Rows of `rule/summary` carry
  `uuid` (not `id`); `/rule/search` and `/rules` 404.
- Pause only rules scoped to YOUR projects by default. Pausing a site-wide rule for ten hours stops it for every
  existing project — that needs the owner's explicit yes.
- When you edit an approved site-wide rule (the JQL exclusion), diff EVERYTHING else against the before-copy after the
  PUT (`PUT {AUTO}/rest/v1/rule/{uuid} {"rule":{…minus created/updated},"connections":[]}`); if more than the JQL
  changed, restore and stop. The exclusion can only run AFTER your projects exist: the parse check correctly refuses
  "The value 'PROJ' does not exist for the field 'project'" before that.
- Deleting a rule needs it DISABLED first and a `Content-Type: application/json` header. Prove pause/resume and the
  exclusion on a scratch CLONE of the real rule (create, exclude, restore identical, delete, count back to baseline).
- Wire it: silence → exclude scheduled rules → pause event rules → `trap ... EXIT` resume; after `kill -9`, resume by
  hand from the recorded list.

## 7. Seats, roles and accounts before the first write

- Both migration accounts: Administrators (and **Service Desk Team** on desks — a chain once marked two desks "done"
  with 0 items copied because the second account had no desk role; see `atlassian-migration-scripts-skill` doc 19).
- **Check every project permission the run needs, per new project**, after creating it:
  `GET /rest/api/3/mypermissions?projectKey=K&permissions=CREATE_ISSUES,DELETE_ISSUES,EDIT_ISSUES,TRANSITION_ISSUES,
  MODIFY_REPORTER,ASSIGN_ISSUES,LINK_ISSUES,CREATE_ATTACHMENTS,DELETE_ALL_ATTACHMENTS,ADD_COMMENTS,WORK_ON_ISSUES,
  ADMINISTER_PROJECTS`. Fillers need **DELETE_ISSUES**: on a test site a project created over REST did not give its
  own lead (a site admin) Delete issues until the account was added to the project's Administrators role. Note that
  `mypermissions` still read `false` immediately after the role grant while the delete already succeeded — permission
  reads can lag; prove with the real operation on a scratch item.
- Grant roles via a group if the target admin requires groups only.
- Seats: `GET /rest/api/3/applicationrole` → `numberOfSeats` and `userCount` per product (plain API token, no admin hub
  needed). `userCount` drifts daily; quote it with a date.
- Rate budget: the Jira hourly cost budget is per account per site — plan accounts and chains (doc 27).
- Your own accounts' product access: `GET /rest/api/3/myself?expand=applicationRoles,groups`
  (`/user?accountId=…&expand=…` returned empty products for self).
- Teams (if the target requires a Team value): Teams are ORG-level objects, i.e. production even while you test.
  `GET https://api.atlassian.com/public/teams/v1/org/{orgId}/teams?siteId={cloudId}` (without `siteId` → 400
  `SITE_ID_REQUIRED_FOR_TEAM_API`, cursor paging). A create with `{"displayName","description","siteId",
  "teamType":"MEMBER_INVITE"}` on `/teams/` worked on a test org; the org may forbid creation — find-or-create by name
  with a UI fallback, and create teams EMPTY (adding members mails them).

## 8. Preflight as code

The orchestrator refuses to start unless every check passes. The set that earned its place:

| Gate | Checks |
|---|---|
| P1 | KEEP list present and signed off |
| P2 | Name coverage: evidence package rebuilt, independent name-shape scan reviewed |
| P3 | Attachment scans complete for every project/space |
| P4 | Pre-load evidence residual = 0 (no unscrubbed hit in what WOULD be written) |
| P5 | Approval files present (client yes, schemes, mapping, report, keys) |
| P6 | Both accounts can create + browse in every target project |
| P7 | Keys/space keys free (or exist and are OURS, for a resume) |
| P8 | Evidence built with the SAME matcher fingerprint the copy uses (hash of code + every list) |
| P9 | Scrubber regression tests pass (cases proven to fail without each rule) |

P7 needs a resume exception: on a re-run after a crash, a space that exists and was created by THIS run (its page map
exists) passes; anything else fails. Without it the orchestrator could not be restarted.

P8 exists because a stale report file from an older grouping that no rebuild overwrote made P8 impossible to pass —
move superseded evidence aside explicitly.
