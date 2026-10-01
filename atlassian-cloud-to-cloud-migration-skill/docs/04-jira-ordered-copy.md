# Jira: the ordered copy (keys AND numbers preserved)

Jira assigns the next number in a project to whatever is created next, and **never reuses a number** — not after a
delete, not after a failed create. So `PROJ-1234` on the target can only equal `PROJ-1234` on the source if the target
project is new, items are created strictly in source-number order, and every gap in the source numbering is consumed
by a throwaway item.

## The algorithm

```
source = every item of the project (see doc 06: enumerate by KEY RANGE, not only by JQL)
byNumber = {n: item}
resume  = rebuild MAP from the target by marker label (labels = migrated AND src-<SOURCE KEY>)
for n in (last number already on target + 1) .. max(byNumber):
    if n in byNumber: create the item, insist the new key is PROJ-n, queue its post-work
    else:            log n as filler BEFORE creating, create a minimal "filler" item at n, delete it (async)
abort loudly on NUMBER DRIFT (got a higher number than wanted)
after the loop: late parents, intra-project links, write the map
```

`templates/ordered_create.py` implements create-at-number, filler logging, marker labels and lost-create recovery.

Measured: source projects whose numbering started high (a desk whose first key was ~800, because earlier items had
been moved away) need ~800 fillers before the first real item — about 45 minutes at the rate budget. Plan for it.

### Marker labels are the resume key

Every created item carries two labels: a run label (`migrated`) and a source marker (`src-PROJ-1234`); fillers carry
`fill-<n>`. Then:
- **Resume** rebuilds the source→target map from the target itself (`labels = migrated`, paged), not from a log that a
  crash may have truncated.
- **Ownership**: every later script refuses an item without the marker (never touch what you did not create).
- **Lost-create recovery**: see below.

Keep a per-create append-only map log (`maplog-PROJ.log`: `SRC-KEY TGT-KEY`) as well; it is the only complete list
for later post-steps (doc 06), written under a lock, one line per create.

### Never blind-retry the create

A `POST /rest/api/3/issue` that times out or returns a 5xx **may have created the item**. A blind retry creates a
second one, which takes the next number, and every following item is off by one.

Field note: during a period of site slowness three chains hit this within the same three minutes; the duplicates
took the next numbers and the chains stopped with `NUMBER DRIFT`. The fix that held:

1. After a lost response, wait, then `GET /rest/api/3/issue/PROJ-n?fields=labels`. If it carries the marker label of
   the item you tried to create, it is yours: log `RECOVERED lost create PROJ-n` and continue.
2. Only if it is not yours, post again.
3. On resume, a duplicate already on the target (two items with the same marker) is kept as a SPARE and REUSED for the
   source item with that number: PUT its fields + type. If the type change is refused (e.g. to a sub-task), keep the
   type and write "Original type X, original parent Y" into the description. Log `REUSED duplicate`.
4. If a number really cannot be held, log `NUMBER LOST PROJ-n` and alert — never silently shift.

Also: **never probe the counter**. A "what number comes next?" probe create burns that number forever (this cost two
numbers in a rehearsal before the filler log replaced it).

A brand-new item can 404 for up to ~30 s right after create on a loaded site; retry GETs on `/issue/` 404 a few times
before concluding anything.

## Parents, sub-tasks and hierarchy

Order the creates so parents exist first where numbering allows: sort by (is-subtask, hierarchy rank, number) for the
**unordered** copy; the **ordered** copy has no freedom, so:

| Case | What happens | Fix |
|---|---|---|
| Parent has a LOWER number | Parent exists; set `fields.parent` on create | — |
| Parent has a HIGHER number, child is not a sub-task | Create without parent, remember it | **Late-parent pass** after the loop: `PUT parent` |
| Parent has a HIGHER number, child IS a sub-task | A sub-task cannot exist without a parent | Create as **Task** with note "Original parent: PROJ-n (was a sub-task of it)"; afterwards bulk-MOVE it back (below) |
| Parent at a level the target cannot hold | `PUT parent` → `400 "Given parent work item does not belong to appropriate hierarchy"` | Issue link of type **Parent-Child** instead (below) |

**Late parents must be recomputed from the SOURCE at the end of every run**, not kept in memory: a resumed chain had
forgotten every late parent of the items created before the restart.

**Sub-tasks under higher-numbered parents are NOT rare**: 5.5% of one project, and over a thousand items across the
estate. The repair keeps the key, status and worklogs — bulk move into a sub-task type under the parent:

```http
POST /rest/api/3/bulk/issues/move
{"sendBulkNotification": false,
 "targetToSourcesMapping": {
   "<projectId>,<subTaskTypeId>,<parentIssueId>": {
     "inferClassificationDefaults": true, "inferFieldDefaults": true,
     "inferStatusDefaults": true, "inferSubtaskTypeDefault": true,
     "issueIdsOrKeys": ["PROJ-30", "PROJ-31"] }}}
-> {"taskId": "..."}   poll GET /rest/api/3/bulk/queue/{taskId} until status COMPLETE|FAILED
```

- ONE target (project, type, parent) per request; a multi-group body is refused ("You can only move issues to a single
  target project, issue type, and parent issue").
- A sub-task type with required fields the move cannot infer (e.g. a "Bug Sub-task" needing severity) fails → fall
  back to the plain Sub-task type; the origin note still names the source type.
- It is slow (one bulk job per parent, polled): ~1,500 items took about an hour. A second instance on a disjoint
  project list halves it; two instances on the same parent group fail harmlessly with "mixed standard/subtask".

**Parent-Child link fallback** (`templates/parent_or_link.py`): when the target hierarchy cannot hold a relation (two
source levels both mapped to the same target level), keep the relation visible with the site's existing
`Parent-Child` link type. Verify the direction on ONE pair first, then run:

```http
POST /rest/api/3/issueLink
{"type": {"id": "<Parent-Child id>"}, "inwardIssue": {"key": "<PARENT>"}, "outwardIssue": {"key": "<CHILD>"}}
```

Read back both items: the parent must show "is parent of CHILD" and the child "is child of PARENT". The direction
semantics depend on the link type's inward/outward wording — see doc 05 before trusting any direction.

### The Team field broke the parent fallback

A create fallback that "drops the parent when the error mentions parent" turned EVERY sub-task into a parentless Task:
the error for setting Team on a sub-task is "… is a subtask, and inherits the team assignment from its parent" — it
contains the word "parent". Rules: never send Team (or other inherited fields) on sub-task types; match errors on the
field key, not on a word in the prose; when a refusal is about a person field (`assignee`/`reporter` not assignable),
drop only that field and write "Original assignee X" into the text.

## Description, required fields and the origin note

- Build the description = scrubbed source ADF + an **origin paragraph**: `Migrated from <SRC-KEY> (type T, status S),
  created YYYY-MM-DD, resolved …, resolution …, components …, fix versions ….` Components/versions go in the text too
  because some target screens (desk screens) have no Components field.
- **Check `createmeta` per type at start**: `GET /rest/api/3/issue/createmeta/{project}/issuetypes/{typeId}` — if the
  system `description` is not on the create screen, Jira ACCEPTS the POST and stores the screen's template default.
  For those types, `PUT /rest/api/3/issue/{k}?notifyUsers=false {"fields":{"description":…}}` right after create.
  Print "types without Description on create: [...]" at the start of every copy log and check it.
- After ~50 items of each project, query for the template text (`description ~ "<template phrase>"`) — must be 0.
- Required-field defaults: doc 02 §3. Fillers need them too.

## Status: walk to the agreed NAME, safely

There is no "set status" — you walk transitions:

```
target = mapping.statuses[source status name]  (else: source status CATEGORY)
if source category is done and resolution is a "not done" resolution: target = not_done_status
repeat ≤ 10 hops:
    current == target name?  -> done
    transitions = GET /issue/{k}/transitions, minus UNSAFE ones (below)
    prefer a transition straight to the target name, else one to an unseen status in the right category, else any unseen
    if already closed and the target name is not reachable from here: STOP, keep closed (never re-open to hunt)
re-check after the last hop (the last hop may have reached it)
```

- **Unsafe transitions**: read the workflow and drop every transition whose post-functions include a non-system
  (app/Connect/Forge) function. A target workflow offered "Create capability"-style transitions whose app
  post-function created items in OTHER projects. The greedy walk avoided it only because another transition happened
  to be listed first.
- **Never re-open**: a walk once went Rejected → Re-open → Backlog hunting for an unreachable "Done". If the target
  status is restricted (some workflows restrict "Done" to automation only), log `STATUS NAME NOT REACHABLE` and keep
  the closed status of the same category.
- A transition can 400 on `fields.resolution` ("cannot be set. It is not on the appropriate screen") while a plain edit
  accepts it. Transition bare, then `PUT /rest/api/3/issue/{k} {"fields":{"resolution":{"name":"…"}}}` — two calls.
- `editmeta` is not a whitelist: it did not list `resolution` (or `priority` on one type), yet the admin PUT was
  accepted and read back. Try the edit on one item, read back.
- When a transition into a done status cannot carry the resolution, the post-function writes ITS default (Done,
  Won't Do). Compare resolutions after the load and fix by edit.

**Resolution must be set on done items.** Items in a done status with an EMPTY resolution count as "unresolved" in every
JQL and queue (`resolution = Unresolved`). Field note: a service desk's "All open" queue showed ~1,000 tickets that were
closed on the source; setting resolution Done on the ~800 closed-without-resolution tickets (silently, doc 03) brought
it to ~240. The source had the same data problem — it was faithful, but useless to the agents.

## Priorities and resolutions by NAME

Copy only values that exist on the target, mapped by name (`mapping.json`). Do not create priorities or resolutions on
a shared production site. Example mapping that was agreed: `Blocker → Highest`, `Minor → Low`, empty → leave empty.
A priority the target lacked silently became the default (Medium) on hundreds of items until the mapping was applied
by edit afterwards — compare priorities explicitly.

## Fields

- Custom fields: match by NAME + schema `custom` type (never by id). Skip types that are structural or personal:
  sprint, epic link, rank, request type, SLA, request participants, customer organizations, approvals, dev summary.
- User-type fields: not copied (personal data, doc 08); a person on the KEEP list may be set later.
- Option fields: copy the value only if that option exists on the target; an option VALUE that names a person is not
  set.
- **Fields with no target home** (no field, or not on the edit screen): the decision taken was to append them as a
  marked section of the description ("Source fields with no target field:" + labelled blocks, original estimate
  "64h, remaining 62h" in the source's own strings), idempotent on the marker line, with a backup of every
  before-description and a rollback that strips exactly that section. The alternative (create fields + add to shared
  screens) is a config change on the target and needs the config owner's yes. Note: a description edit leaves a
  "description changed" record in History — say so.
- Measure what was dropped on the SOURCE, never from your own "unmapped" log: resumed chains overwrote the per-project
  unmapped-field file with their last chunk only, so it under-reported badly.
- Time tracking: write `timetracking` as `"Nh Mm"` from source SECONDS, never days/weeks (hours-per-day differ).
- Labels: drop labels with spaces (invalid) and labels that name a person; add your markers.
- Due date, environment, components, fix/affects versions: copy by name.

## Components and versions

- Create missing components/versions on the target project before the items (names scrubbed).
- **Create versions UNARCHIVED**, set them on items, then archive at the end: an archived version cannot be assigned
  (a rehearsal hit ~300 field failures on one project), and re-archive restores the source state.
- Compare component names case-insensitively: a target template may already have a component that differs only in
  case, and the copy lands on it.

## Comments

- **Paginate.** `GET /rest/api/3/issue/{k}/comment` caps a page at **100 whatever `maxResults` says** — `maxResults=5000`
  silently returned 100 of 156 and the copy lost 56 comments on one item. The same applies to every reader (compare,
  verify, leak scans): one shared `all_comments()` helper, `startAt` paging until `startAt + len >= total`.
- Internal vs public on desks: if the source comment has `jsdPublic: false`, post with
  `"properties":[{"key":"sd.public.comment","value":{"internal":true}}]`.
- Author/date: header paragraph `"<author or placeholder> (YYYY-MM-DD):"` — the API ignores `author`/`created`.
- Media in comments: upload the attachment first, map source media id → target media id, rewrite the ADF `media`
  nodes; a media node whose file was withheld becomes a text note "[attachment not migrated: withheld …]".
- Replies on Confluence: doc 11.

## Worklogs

```http
POST /rest/api/3/issue/{k}/worklog?adjustEstimate=leave&notifyUsers=false
{"timeSpentSeconds": max(60, src), "started": "<source started>", "comment": <ADF with "Logged by X" header>}
```

- Jira rejects worklogs under 60 s → round up and note "original duration 36s, rounded up".
- Jira stores whole MINUTES: 14,850 s comes back as 14,820 s.
- A worklog comment cannot hold media (`400 "Worklog body is not valid"`) → replace media with the placeholder text.
- Fetch all worklogs when `total > len(worklogs)` in the item payload.

**Dedupe pitfall**: a resumed post-work pass re-added worklogs (redo cleaned comments and attachments but not
worklogs). A dedupe that matched `(started, seconds)` EXACTLY then deleted three LEGITIMATE worklogs (36 s → 60 s,
1 s → 60 s, and the minute rounding above). Correct matching: a target worklog is legit if an unconsumed source
worklog has the same `started` and `|max(60, src) − tgt| < 60`; never delete an unmatched singleton. And make "redo"
clean everything the post-work writes: comments (paged), attachments, worklogs, remote links.

## Attachments

- Default DENY: upload only files whose scan verdict is clean (doc 09); everything else becomes a note.
- Upload: `POST /rest/api/3/issue/{k}/attachments`, multipart, header `X-Atlassian-Token: no-check` (see
  `atlassian-migration-scripts-skill` doc 28 for a retry-safe multipart body).
- Media ids for ADF: `GET /rest/api/3/attachment/content/{id}` without following the redirect; the `Location` header
  contains `/file/<uuid>/` = the media id. Do it on both sites to build the source→target media map.
- A copy-time upload once silently uploaded NOTHING on a project (likely fresh-item 404 retries exhausted). Make upload
  failures loud, and run a separate "release" pass per project after the copy as the catch-all.
- Key the held/clean decision by (project, item, file), not (project, file): ~90 same-name files collided otherwise.

## Remote links

Copy with scrubbed title/summary; drop links whose URL names a person. Record items whose remote links point at the
source site (for the URL rewrite pass, doc 11). Relative DC-era links in the source (e.g. a test-run link without a
host) 400 on create — drop them and log.

## Post-work runs in a pool — and must say when it fails

Creates are sequential (numbers); post-work (attachments, description PUT, fields, worklogs, remote links, comments,
status walk) runs in a thread pool and marks the item done in an append-only `postdone` log. On resume, items in the
map but not in `postdone` are re-done with `redo=True` (clean first, then write).

A `POST FAIL` in one item's post-work used to end the chain with `done:` anyway; the item stayed half-copied. The
orchestrator now runs a SECOND pass of the project (resume re-does exactly the missing items) and alerts if it
persists after pass 2.

## Log lines to watch (make your copy print these)

| Line | Meaning |
|---|---|
| `types without Description on create: [...]` | Check against the target's screens at start |
| `RECOVERED lost create` / `REUSED duplicate` | Fine — numbers held |
| `NUMBER DRIFT` / `NUMBER LOST` | Alert — stop and look |
| `Original assignee/reporter …` | Person not assignable on the target; name kept in text |
| `STATUS NOT REACHED` / `STATUS NAME NOT REACHABLE` | A fix-status pass re-walks them; review the second kind |
| `POST FAIL` | Second pass will redo; alert if it persists |
| `FILLER NOT DELETED` | A delete-fillers pass (summary exactly "filler", created by your accounts, number absent from the full source list) |
| `done: mapped N, fillers F, late parents L, links K` | Chain finished; compare N with the source count |
