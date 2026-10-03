# Silent loading — no e-mail to anyone

Loading tens of thousands of items into a production site without a single notification is a design problem, not a
flag. List every channel that can send mail, close each one with a mechanism you can READ BACK, and keep them closed
for every write — including the repairs that happen after the "end" of the run.

## The channels, and how each one was closed

| Channel | Who would get mail | Closed by | Proof |
|---|---|---|---|
| Jira notification scheme (issue created/updated/commented/...) | reporter, assignee, watchers, any user/group the scheme names | Assign a **proven-empty** scheme to every loaded project | read back `GET /rest/api/3/project/{k}/notificationscheme` until it shows the silent id |
| Edits and worklogs | same | `?notifyUsers=false` on every issue PUT and worklog call (honoured only with Administer Jira or Administer Projects, ignored otherwise) | the account holds one of them |
| Auto-watch of the writer | the migration account becomes watcher of everything it touches | `user.autowatch.disabled` = bare `true` for EACH writer account | read back the preference |
| @mentions in copied text | the mentioned person | ADF `mention` nodes → plain text `@Name`; Confluence `<ac:link><ri:user>` → text | scrubber unit tests |
| JSM customer notifications (portal mails to reporters/participants) | customers | **No REST** — browser toggles per desk, before-state recorded | read back every rule = off; gate file |
| Automation rules | whatever they do | Pause event rules that can reach the new projects; exclude scheduled JQL rules | doc 02 §6 |
| Confluence page create/edit | space/page watchers | New spaces are watched only by the creator; edits `minorEdit=true`; **watcher gate** before editing an existing page | doc 11 |
| Invites | the invitee | Nobody is invited during the load; invites are a separate, deliberate step (doc 10) | |
| Sprints, versions, components | — | No notification-scheme events for these | |
| Team-managed project | its own simplified scheme | **Cannot be reassigned over REST**: `PUT /project/{k}` → 400 "Unable to validate, notification scheme cannot be changed for this project."; editing its scheme → 400 "…used by a team-managed project. We only support notification schemes for company-managed projects." — skip it in every write tool and close by content (make sure every recipient is the migration account) | read the item's people |

Field note: the first production attempt was blocked because the target's shared notification scheme mailed a fixed
user on EVERY "Issue Created" — tens of thousands of mails waiting to happen. Nothing was loaded until the silent
scheme read back on every project. Audit the recipients of every scheme a new project would inherit — including the
`User` and `Group` recipient types, not just roles — before go.

`notifyUsers=false` is not honoured on CREATE: only a silent scheme assigned BEFORE the first item protects creates.
Only issue edits, comment EDITS and worklogs take the flag (`PUT …/worklog/{id}?notifyUsers=false&adjustEstimate=leave`).
Comment create, transitions, attachment uploads, issue links, remote links and the assignee endpoint have NO
`notifyUsers` parameter — only the silent scheme protects them.

## The silent scheme

Create one empty scheme once, then **pin it by id** and prove it is empty before every use:

```http
POST /rest/api/3/notificationscheme
{"name": "Migration - silent (load only)", "description": "Empty: no notifications while content is loaded."}

GET /rest/api/3/notificationscheme/{id}?expand=all
-> sum(len(e.notifications) for e in notificationSchemeEvents) MUST be 0

PUT /rest/api/3/project/{key}   {"notificationScheme": <id>}
```

Traps, each one measured:

- **Scheme writes can apply late.** On one occasion the target accepted scheme POSTs that returned ids but did not
  persist for a long time: `GET /rest/api/3/notificationscheme/{id}` answered 404 "does not exist", the project PUT
  answered 400 "Unable to validate, notification scheme could not be retrieved.", a DELETE of a notification returned
  HTTP 500 (`GenericDataSourceException: SQL Exception`), a rename was ignored. Every retry created another phantom.
  Later the queued writes landed — duplicate "silent" schemes plus a rename that had turned a REAL scheme (with dozens
  of recipients) into something named "silent". Hence: create config objects ONCE, never in a retry loop; pin by id;
  refuse a scheme with recipients; read back with a wait (we polled up to 4 minutes per project) instead of trusting the
  PUT; let a background poller write a `SILENT-OK` marker the run waits for; load the independent half (Confluence)
  meanwhile; afterwards delete your own duplicates and rename back anything that was hijacked. Create the silent scheme
  hours ahead of the window.
- **Save the original per project, immediately.** A silent run that crashed before saving the originals left projects
  silent with nothing to restore. Write the before-state to disk after each project, never at the end. If an original
  is unknown at restore time, fall back to a documented default (the template project's scheme) — never leave a
  project silent by accident and never guess for a project that is not yours.
- **"No scheme" is not proven silent — and it is a one-way door.** A JSM desk created from a template, and (verified
  on a test site) a company-managed software project created over REST from a classic template, can have NO
  notification scheme (`GET .../notificationscheme` → 404 "No notification scheme associated with this project").
  Atlassian does not document that state as silent, so put such projects on the silent scheme too. But
  `PUT /rest/api/3/project/{k} {"notificationScheme": null}` is **ignored** (verified): once a scheme is assigned you
  cannot return to "none". Agree with the target owner, BEFORE the load, which scheme each new project gets afterwards
  (e.g. the desk's copy of its source scheme, doc 07).
- **Record the before-state ONCE.** A second `enter` must keep the first record (the true before-state), or the
  restore puts back the silent scheme.

## Autowatch: the bare-`true` trap

```http
PUT /rest/api/3/mypreferences?key=user.autowatch.disabled
Content-Type: application/json

true
```

The body must be the bare JSON literal `true`. A quoted `"true"` returns success and **silently stores false**.
Read it back with `GET /rest/api/3/mypreferences?key=user.autowatch.disabled`. Do it for EVERY account that writes,
and do it again after any "restore" step — restoring the before-state turns autowatch back on while later writers may
still be running (a guard-dog HALT fired exactly on this).

## JSM customer notifications (no REST)

The project setting at `/jira/servicedesk/projects/{KEY}/settings/customer-notifications` (an older path is
`.../settings/notifications/customer-notifications`) lists one rule per event (request created, public comment
added, request resolved, …) with an enable checkbox. There is no public API. Browser automation that worked:

1. Assert the logged-in identity is the migration admin (`fetch('/gateway/api/me')` from the page — it still answered
   while `/rest/api/3/myself` was answering 429 during the load); the template requires `--expect <accountId>`.
2. Read every rule's state; write the record **only if no record exists** (a second `off` must not overwrite the true
   before-state).
3. Click each enabled checkbox; accept a confirmation dialog if one appears; reload; re-read; up to 3 passes.
4. `on` re-enables exactly the rules the record says were on — never "all".
5. Screenshot before/after; write the gate file (`jsm-customer-notif-off.ok`) only when every desk reads back all-off.

Same page for company- and team-managed desks; ten rules per desk (Customer invited, Request created, Public comment
added, Public comment edited, Request resolved — "Request done" on team-managed —, Request reopened, Participant added,
Organization added, Approval required, Customer-visible status changed). `templates/jsm_customer_notifications.mjs` is a
fresh implementation of this procedure (Playwright), re-verified on a test site: off → second off kept the record →
on restored all ten.

ORDER: create the target projects in a SEPARATE step first, then switch customer notifications off, THEN start the
load. When project creation was inside the run, only ~12 minutes separated "desk exists" from "first desk item" — too
tight for a browser step. Turn them back ON only after the desks' own notification schemes are assigned.

Changing a resolution or status on a LIVE desk can e-mail customers ("request resolved") — any late desk repair runs
with customer notifications off, read back, under the project lock.

Field note: a reporter change on a desk item ran once with customer notifications ON. A reporter change is not one of
the standard customer-notification triggers as far as we know — but it was not verified. When in doubt, keep the
channel off for every desk write, including late repairs.

## One window, many writers: locks and holds

After the bulk load, repairs kept arriving (decisions, link fixes, late releases). Toggling silence per script
created races: one process restored a project's scheme while another was still writing to it. What worked:

**Per-project lock protocol** (works across processes and languages):

```
mkdir go/lock-<KEY>.d          # atomic; fails if someone holds it -> wait
  PUT scheme -> silent, read back
  ... writes with notifyUsers=false ...
  PUT scheme -> recorded original, read back
rmdir go/lock-<KEY>.d          # in a finally block
```

**One global silent window** when many writers run together:

```
window enter     record every project's scheme once -> PUT all to silent -> read back each -> write go/WINDOW-OPEN
                 (silent id, project list, hard stop time)
writer           creates go/HOLD-WINDOW-<name> FIRST, then refuses unless go/WINDOW-OPEN exists and the stop time has
                 not passed; before EVERY write re-checks both and re-reads its project's scheme (cached ≤ 2 min)
window restore   removes go/WINDOW-OPEN FIRST, then waits until no HOLD-WINDOW-* / lock exists -> PUT recorded ids ->
                 read back -> table must equal before-state -> archive the record (a later migration records afresh)
```

The two orders together close the race: a writer either finds the window closed and refuses, or its hold file exists
before restore looks for holds. `templates/silent_window.py` implements both protocols (`hold`, `project_lock`,
`require_silent`), and `ordered_create.py`, `link_copy.py` and `parent_or_link.py` call them before every write
(`SILENT_GATE=off` skips the gate, loudly, for a deliberately different silence mechanism).

Rules learned:
- **Take the HOLD before you check the window, not after.** The window was closed by the coordinator before two agents
  had created their HOLD files; they then waited forever for a window that would not reopen and had to switch to
  per-project locks.
- **Every writer re-checks the scheme of the project it is about to write**, not just the window file. A different
  process switched two projects back to their normal scheme while our lock was held; part of the writes then ran on
  the normal scheme (notifyUsers=false was still on every PUT, which is why it is never optional).
- **Restore waits for holders and for the processes that still write**: status fixers (a transition on a restored
  project mails the newly set reporters), parallel compares that repair, loaders that create items (a test-management
  loader creates Test issues — doc 12). We had a restore that had loaded an older version of the code without the hold
  check; it was killed and restarted with the current code. A long-waiting gated process keeps the code it started
  with: restart waiters after you edit gate logic.
- **Writes found after the restore are recorded as PENDING, not forced.** A release job re-read each project's scheme
  right before each upload and skipped files whose project was already restored; they were uploaded later inside a
  window. Late privacy deletions likewise went into a pending list and ran under a temporary silent switch.
- **Restore may be partial on purpose** (projects still being written stay silent) — then the guard dog must know which
  projects are expected silent, or it raises false alarms.
- After the restore, print the table `recorded -> now` for every project and exit non-zero if any differs.
- Hard stop times in code (e.g. "no writes after 23:00 local") keep a long tail from running into business hours.

## Confluence: minorEdit is not a guarantee

`minorEdit=true` on a page update is the documented way to avoid watcher mails, but the API read the version back
with `minorEdit=false` on the sites we used, and it did not stop the e-mail: the watcher check is the real guard. Treat
any edit of an existing page as mailing its watchers. The path names mislead — read the operation ids:

```http
GET /wiki/rest/api/content/{id}/notification/child-created # getWatchesForPage: watchers of THIS page
GET /wiki/rest/api/content/{id}/notification/created       # getWatchesForSpace: watchers of the page's SPACE
GET /wiki/rest/api/space/{spaceKey}/watch                  # space watchers by key
```

Edit only pages whose page AND space watchers are exclusively the migration accounts; list the rest for a human. A
new page in a watched space, or under a parent someone watches together with its children, can mail them: place such
pages at the space root or under the home page instead, and say so in the decision log.

## Other mail you might cause

- **Inviting or creating a user sends a mail** (and the guard sees `User created` / `User added to group` in the audit
  log). Invites are a separate, approved step (doc 10); unexplained account events by a shared migration login must be
  confirmed by the person who did them.
- **Teams**: create them empty — adding members mails "added to team".
- **Restricted pages** (a report for one owner): put the `restrictions` (read + update user lists) INSIDE the v1
  `POST /wiki/rest/api/content` body, so there is no moment in which space watchers can see and be mailed about it
  (doc 15).
- **An approved one-off mail is recorded, not avoided**: when the owner approved removing a reviewer's test edits on a
  page that reviewer watches, the resulting mail was accepted and written into the decision record.

## Restore checklist

1. All writers finished (no locks, no HOLD files, no loader process).
2. Schemes back to the recorded ids, read back, table printed.
3. Desks: assign each its notification scheme (a copy of the source desk's scheme if that was agreed) — only if the
   desk has no scheme or the silent one.
4. JSM customer notifications back on from the record, read back.
5. Paused automation re-enabled exactly from the paused list (also wired to `trap EXIT` in the orchestrator; after a
   `kill -9` run `resume` by hand).
6. Autowatch back to its recorded value — and re-disabled if any writer is still running.
