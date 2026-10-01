# Silent loading — no e-mail to anyone

Loading tens of thousands of items into a production site without a single notification is a design problem, not a
flag. List every channel that can send mail, close each one with a mechanism you can READ BACK, and keep them closed
for every write — including the repairs that happen after the "end" of the run.

## The channels, and how each one was closed

| Channel | Who would get mail | Closed by | Proof |
|---|---|---|---|
| Jira notification scheme (issue created/updated/commented/...) | reporter, assignee, watchers, any user/group the scheme names | Assign a **proven-empty** scheme to every loaded project | read back `GET /rest/api/3/project/{k}/notificationscheme` until it shows the silent id |
| Edits and worklogs | same | `?notifyUsers=false` on every PUT/worklog (honoured only for admins) | the account is Jira admin |
| Auto-watch of the writer | the migration account becomes watcher of everything it touches | `user.autowatch.disabled` = bare `true` for EACH writer account | read back the preference |
| @mentions in copied text | the mentioned person | ADF `mention` nodes → plain text `@Name`; Confluence `<ac:link><ri:user>` → text | scrubber unit tests |
| JSM customer notifications (portal mails to reporters/participants) | customers | **No REST** — browser toggles per desk, before-state recorded | read back every rule = off; gate file |
| Automation rules | whatever they do | Pause event rules that can reach the new projects; exclude scheduled JQL rules | doc 02 §6 |
| Confluence page create/edit | space/page watchers | New spaces are watched only by the creator; edits `minorEdit=true`; **watcher gate** before editing an existing page | doc 11 |
| Invites | the invitee | Nobody is invited during the load; invites are a separate, deliberate step (doc 10) | |
| Sprints, versions, components | — | No notification-scheme events for these | |
| Team-managed project | its own simplified scheme | **Cannot be reassigned over REST** (400 "only company-managed") — close by content: make sure every recipient is the migration account | read the item's people |

Field note: the first production attempt was blocked because the target's shared notification scheme mailed a fixed
user on EVERY "Issue Created" — tens of thousands of mails waiting to happen. Nothing was loaded until the silent
scheme read back on every project.

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
  persist for about an hour; a DELETE of a notification returned HTTP 500; a rename was ignored. Later the queued writes
  landed — a dozen duplicate "silent" schemes plus a rename that had turned a REAL scheme (with ~50 recipients) into
  something named "silent". Hence: pin by id, refuse a scheme with recipients, and read back with a wait (we polled up
  to 4 minutes per project) instead of trusting the PUT.
- **Save the original per project, immediately.** A silent run that crashed before saving the originals left projects
  silent with nothing to restore. Write the before-state to disk after each project, never at the end. If an original
  is unknown at restore time, fall back to a documented default (the template project's scheme) — never leave a
  project silent by accident and never guess for a project that is not yours.
- **"No scheme" is not proven silent.** A JSM desk created from a template may have no notification scheme
  (`GET .../notificationscheme` → 404). Atlassian does not document that as silent; put it on the silent scheme too.
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

1. Assert the logged-in identity (`fetch('/rest/api/3/myself')` from the page) is the migration admin.
2. Read every rule's state; write the record **only if no record exists** (a second `off` must not overwrite the true
   before-state).
3. Click each enabled checkbox; accept a confirmation dialog if one appears; reload; re-read; up to 3 passes.
4. `on` re-enables exactly the rules the record says were on — never "all".
5. Screenshot before/after; write the gate file (`jsm-customer-notif-off.ok`) only when every desk reads back all-off.

Same page for company- and team-managed desks. `templates/jsm_customer_notifications.mjs` is a fresh implementation of
this procedure (Playwright).

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
writer           refuses unless go/WINDOW-OPEN exists; creates go/HOLD-WINDOW-<name> while writing;
                 re-reads its project's scheme before every write (cached ≤ 2 min); hard stop time
window restore   waits until no HOLD-WINDOW-* exists -> PUT recorded ids -> read back -> table must equal before-state
```

`templates/silent_window.py` implements both.

Rules learned:
- **Every writer re-checks the scheme of the project it is about to write**, not just the window file. A different
  process switched two projects back to their normal scheme while our lock was held; part of the writes then ran on
  the normal scheme (notifyUsers=false was still on every PUT, which is why it is never optional).
- **Restore waits for holders and for the processes that still write**: status fixers, parallel compares that repair,
  loaders that create items (a test-management loader creates Test issues — doc 12). We had a restore that had loaded
  an older version of the code without the hold check; it was killed and restarted with the current code.
- **Restore may be partial on purpose** (projects still being written stay silent) — then the guard dog must know which
  projects are expected silent, or it raises false alarms.
- After the restore, print the table `recorded -> now` for every project and exit non-zero if any differs.
- Hard stop times in code (e.g. "no writes after 23:00 local") keep a long tail from running into business hours.

## Confluence: minorEdit is not a guarantee

`minorEdit=true` on a page update is the documented way to avoid watcher mails, but the API read the version back
with `minorEdit=false` on the sites we used. Treat any edit of an existing page as potentially mailing its watchers:

```http
GET /wiki/rest/api/content/{id}/notification/created       # watchers of this page (edits mail them)
GET /wiki/rest/api/content/{id}/notification/child-created # watchers of new children under it
GET /wiki/rest/api/space/{spaceKey}/watch                  # space watchers
```

Edit only pages whose watchers are exclusively the migration accounts; list the rest for a human. Creating a CHILD of
a watched page mails the parent's child-created watchers: place such pages at the space root or under the home page
instead, and say so in the decision log.

## Restore checklist

1. All writers finished (no locks, no HOLD files, no loader process).
2. Schemes back to the recorded ids, read back, table printed.
3. Desks: assign each its notification scheme (a copy of the source desk's scheme if that was agreed) — only if the
   desk has no scheme or the silent one.
4. JSM customer notifications back on from the record, read back.
5. Paused automation re-enabled exactly from the paused list (also wired to `trap EXIT` in the orchestrator; after a
   `kill -9` run `resume` by hand).
6. Autowatch back to its recorded value — and re-disabled if any writer is still running.
