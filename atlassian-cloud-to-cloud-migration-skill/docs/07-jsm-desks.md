# JSM service desks

Service desks carry the most config that is NOT reachable over REST (queues, SLAs, customer notifications, portal
settings, e-mail channel) and the most people data (customers, participants, organizations). Plan them separately.

For the general JSM migration traps (the `Service Desk Team` role requirement for any mutating actor, app-actor
roles, Assets workspace remap) see `atlassian-migration-scripts-skill/docs/19-jsm-migration-patterns.md`.

## Shared target desk config, or the desk's own config?

First plan: the new desks share an existing target desk configuration. Rehearsal showed why that fails: the target's
service workflows started in an "in progress" status (hundreds of status mismatches), one workflow restricted its Done
transition to automation only, a type mapping put source "Change" items into a workflow whose transitions had app
post-functions creating items elsewhere, and the shared screen had no Components field (adding it would have been a
change to SHARED config). The target config owner then decided: **each desk gets its own configuration mirroring the
source**, and nothing shared is touched.

### Own-config recipe (company-managed desk)

1. Create the project from a light JSM template whose generated schemes are per project:
   ```http
   POST /rest/api/3/project
   {"key":"DESK","name":"…","projectTypeKey":"service_desk",
    "projectTemplateKey":"com.atlassian.servicedesk:simplified-internal-service-desk",
    "leadAccountId":"<migration account>","assigneeType":"UNASSIGNED"}
   ```
   Team-managed source desk → team-managed target from `com.atlassian.servicedesk:next-gen-it-service-desk`: project-
   scoped types and statuses, zero global objects (but its notification scheme cannot be reassigned, doc 03).
2. Refuse to reconfigure if the project is not yours (lead ≠ you and no ownership property) or already has items.
3. **Globals**: the source desk's issue type and status NAMES; reuse existing ones by name (case-insensitive — a source
   "IN DEVELOPMENT" lands on the existing "In Development"); create only the approved missing ones in a separate step.
4. **Workflow** `DESK: <source> workflow` via `POST /rest/api/3/workflows/create`: every source status by name; INITIAL →
   "Opened"/"Open"/first to-do status; one GLOBAL "any → X" transition per status; no conditions; **no app
   post-functions**; into a DONE status a transition screen `DESK: resolve screen` (with Resolution) so the copy can set
   the source resolution; into any other status the system post-function that clears the resolution. Send existing
   global statuses with their current description (upsert trap, doc 02).
5. **Workflow scheme** `DESK: workflow scheme`, default = that workflow, assign to the project.
6. **Issue type scheme**: the project's own generated scheme set to the source's types (remove template types; set the
   default type).
7. **Request types** mirrored by NAME + issue type:
   `POST /rest/servicedeskapi/servicedesk/{id}/requesttype {"issueTypeId","name","description","helpText"}` (texts
   scrubbed — request-type help texts are copied content too). Delete template request types not on the source — except
   the e-mail channel's default request type, which cannot be deleted over REST (it and its type stay).
8. **Screens**: the project's own generated screens get Description, Components, Fix versions, Labels, Priority, Due date.
9. **Prove from the scheme side** that every new scheme/workflow is used by exactly this project
   (`expand=projects`; positive control: a shared scheme reports N projects).

Not mirrored (no REST, or not readable on the source without desk admin there): SLAs, queues, approvals, portal name /
groups / forms / announcements, e-mail channel, customer-notification templates, the exact source transition graph
(global transitions instead), field configuration. List them in the report.

Field note: the own-config approach was proven on a sandbox with scratch keys first (a 47-item desk: type, status,
components, fix versions, comments, labels, priority, request type all equal; only difference = an agreed resolution
mapping) before touching production.

## Request type on each item

The copy creates items with `POST /rest/api/3/issue` (full field set), so a desk item is **not a request** until its
request type field is set — `GET /rest/servicedeskapi/request/{key}` 404s until then. Afterwards:

```http
PUT /rest/api/3/issue/DESK-12?notifyUsers=false
{"fields": {"customfield_<requestType>": "<requestTypeId>"}}      # a plain STRING; {"id":"…"} → 400 "Operation value must be a string"
```

Map by request type NAME + issue type from the source item (the source's request-type field holds the request type;
the ids differ per site). Run it as a post step after the load (and over the map log, not a JQL search — doc 06).

Why not create through `POST /rest/servicedeskapi/request`? The request type FORM exposes only some fields (one form
had only `summary`; `description` → 400 "not valid for this request type"). Create through the Jira API, then bind.

## Customers, participants, organizations, reporters

- Request participants and customer organizations were NOT copied (people data, and they would be notified).
- A reporter who is a portal customer and not on the KEEP list → the migration account + "Original reporter:
  <placeholder>" in the text. Movers with a target account were set later (doc 10).
- **Assignee on a desk needs a JSM agent licence**: setting a mover who has only Jira Software access → 400 "cannot be
  assigned". Those stay unassigned with the name in the text; list them for the org admin.
- The `Service Desk Team` role: the target admin required group-only grants → a group for the desk agents added to the
  role, never individual actors.

## Queues (no REST create)

`GET /rest/servicedeskapi/servicedesk/{id}/queue` reads queues; there is no create. A queue requested by a desk agent
after the move was created by driving the UI (`/jira/servicedesk/projects/{KEY}/queues/custom/new`):
- the form is already scoped to the project ("This queue is already filtered by: project = …"): type the JQL WITHOUT
  the project clause; REST will store `project = KEY AND …` afterwards
- copy the column set of an existing queue
- queue order is desk-wide; a new queue lands at the bottom — moving it is a second UI step
- `stage` mode that fills the form, validates, screenshots and CANCELS; `apply` mode only after; then read back over
  REST that the other queues' JQL and columns are unchanged

## Resolutions on closed desk tickets

Doc 04: done items without a resolution fill every "unresolved" queue. On a desk this is the first thing agents see.
Field note: a desk agent asked why "All open" held ~1,000 tickets; ~780 were closed on the source without a
resolution. Setting resolution Done on those (JSM customer notifications off, silent scheme, `notifyUsers=false`) fixed
it. The source was the same, so this is a decision, logged with its revert.

## Issue-type avatars: "every ticket looks like the same type"

Field note: a desk agent reported that all tickets in the queue showed as one type. The DATA was right. Cause: the
global issue types created for the desks were all created with the **default avatar**, so two different types rendered
the same icon in queues and lists.

Fix (`templates/issuetype_avatar.py`):

```http
# 1. upload the image as an avatar OWNED by the issue type
POST /rest/api/3/universal_avatar/type/issuetype/owner/{issueTypeId}?size=96
X-Atlassian-Token: no-check
Content-Type: image/png
<raw PNG bytes>
-> {"id": "<avatarId>", ...}

# 2. assign it
PUT /rest/api/3/issuetype/{issueTypeId}   {"avatarId": <avatarId>}
```

- `size` (query) is required; `x`/`y` crop offsets are optional.
- Where do icons come from? The classic JSM type icons are served by any JSM site as SVG at
  `/servicedesk/issue-type-icons?icon=<name>`; render to a square PNG (e.g. 96 px with a headless browser or rsvg) and
  upload. A system avatar id that already matches the source (e.g. a generic question icon) can be assigned directly
  with the PUT.
- Only touch types YOU created; before the change, check that no item outside your projects uses them
  (`issuetype = X AND project not in (…)` = 0). Record before/after avatar ids; revert = PUT the old `avatarId`.

## Desk notification schemes after the load

The source desks had their own notification schemes; the agreed target state was "what they had". Readable on the
source with `GET /rest/api/3/project/{k}/notificationscheme?expand=all`. A copy per desk was created on the target
(`DESK: <source scheme name>`): events by name, recipients `CurrentAssignee`, `Reporter`, `AllWatchers`,
`ComponentLead` as is, `ProjectRole` by role NAME → the target's role id. Created during setup, **assigned only after
the load** (desks stay silent). A recipient role that does not exist on the target is reported, not created.

## Desk automation from the template

A JSM template can add project-scoped automation rules to each new desk. Pause them for the load (doc 02 §6).
