# Gotchas — one line each, grouped

Each line was paid for in a real run. The doc number points at the detail.

## Target safety
- `POST /rest/api/3/workflows/create` upserts every existing global status you list — send its current description or it is wiped (02).
- `createshared` ignores `lead`: write an ownership property right after create (02).
- A JSM template creates missing global types/statuses on its own; count them against the approved list (02, 07).
- Never edit a shared scheme to freeze the source: assign new read-only COPIES (14).
- A sandbox may share org groups with production: a "sandbox" group add can grant production access (01).

## Silence
- Autowatch preference: body must be bare `true`; quoted `"true"` stores false (03).
- A restore turns autowatch back on while later writers still run — re-disable (03).
- Notification-scheme writes can apply an hour late; pin the silent scheme by id, prove it empty, read back (03).
- A JSM template desk can have NO notification scheme (404) — not proven silent; assign the silent one (03).
- Team-managed projects: notification scheme cannot be reassigned over REST (400) (03).
- JSM customer notifications: no REST; record before-state once, restore exactly (03).
- Confluence `minorEdit=true` reads back false — gate edits on page watchers (03).
- Creating a child of a watched page mails its child-created watchers (03, 11).
- A test-management loader creates Jira issues → mail after the restore unless the restore waits (12).
- Existing automation will comment on / transition your items — list and pause (02).

## Jira copy
- Jira never reuses a number; a probe create burns one (04).
- A timed-out POST may have created the item — look for your marker label before re-posting (04).
- Create screen without system Description → Jira stores the template default silently (04).
- `createmeta` says optional, a workflow validator says required (02).
- Team on a sub-task → refused with a message containing "parent" (04).
- Sub-task whose parent has a higher number: ~5% of items, not rare (04).
- Parent at an impossible level → 400 "does not belong to appropriate hierarchy" (04).
- Resolution cannot be set on a transition without the field on its screen; set by edit after (04).
- `editmeta` is not a whitelist; try the edit and read back (04).
- Done items without a resolution count as unresolved everywhere (04, 07).
- Comments API caps a page at 100 whatever `maxResults` says (04).
- Comment `author`/`created`: 201 and silently ignored (01, 04).
- Worklogs < 60 s are refused; Jira stores whole minutes (04).
- Worklog comment cannot contain media (04).
- Archived versions cannot be assigned — create unarchived, archive at the end (04).
- Assets/CMDB field: 204 and empty when the workspace does not match; read back (02).
- Request type field value must be a plain string (07).
- A desk assignee needs a JSM licence (07, 10).
- `GET /rest/api/3/search` is 410; `/search/jql` pages by `nextPageToken`, `startAt` → generic 400 (06).

## Links, sprints, boards
- `POST /issueLink`: the `inwardIssue` you pass ends up holding the OUTWARD wording — prove on one pair first (05).
- Link counts per item cannot detect inverted links (05, 13).
- A target link type may carry the opposite wording of the source type with the same name (05).
- Only filters shared with you are readable (05).
- Board columns/swimlanes/quick filters: no public write API (05).
- Closed sprint `completeDate` cannot be set (05).
- Adding an item to a replayed sprint moves it out of its open sprint — re-seat afterwards (05).
- Sprints of deleted source boards are invisible from the board side — read the item's Sprint field (05).

## Negatives
- Items readable by key can be invisible to the source's JQL (06).
- Deactivated users are hidden from user search; invite returns 400 with the existing user (06, 10).
- Forge apps 404 on the Connect add-on probe (06, 12).
- A JQL label with a space returns 0, no error (06).
- JQL/CQL dates and changelog times are in the account's time zone (06).
- CQL misses attachments the direct child listing shows (06, 11).
- Browser download URLs 401 to API tokens for every file (06, 11).

## Privacy
- Changelog, creator, worklog/attachment authors, page versions cannot be edited — only a copy keeps names out (01).
- A Jira field edit keeps the old text in History; only deleting the item removes it (08).
- Confluence keeps old versions — delete them explicitly, then purge the trash (08, 09).
- Skipping deny tokens a mover shares lets "Surname, First" of a non-mover survive (08).
- The verifier that shares the copier's matcher cannot see people the matcher does not know (08, 13).
- OCR misses light text on dark UI bars; invert dark regions (09).
- Name in a status bar = matcher miss, not OCR miss (person without an account) (09).
- Base64 blobs make e-mail regexes backtrack for minutes; blank them first (08, 09).
- URL-encoded draw.io XML inside PNG metadata hid names and hung the matcher (09).
- A verdict that flips to clean needs its own release step (09).
- Every consumer of "clean" must go through the held-wins merger (09).
- Confluence comment ids are not monotonic — pair by content (08, 11).

## Users and licences
- User API tokens get 401 on admin hub APIs; use the browser session or an org API key (10).
- "Claim accounts" wizard defaults to ALL accounts and AUTOMATIC claiming (10).
- "Suspend access" in the admin UI has no confirmation dialog (10).
- Suspension is org-wide (all products, all sites); group removal frees one product seat (10).
- New accounts show "never active" — exclude recently added users from inactivity rules (10).
- Confluence seat cap (`LicenceExceededException`) is invisible from the Jira side (10).

## Process
- `pkill -f`/`pgrep -f` match your own waiter and sibling subshells — use PIDs (27).
- Never edit a running shell script; temp file + `mv` (27).
- A job loads the matcher once; restart it after a list change (08, 27).
- A long job without its first checkpoint is broken, not slow (27).
- A parallel runner can fail on "argument list too long" and still write DONE — check exit codes (13).
