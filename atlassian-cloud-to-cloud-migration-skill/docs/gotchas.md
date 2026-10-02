# Gotchas — one line each, grouped

Each line was paid for in a real run. The doc number points at the detail.

## Target safety
- `POST /rest/api/3/workflows/create` upserts every existing global status you list — send its current description or it is wiped (02).
- `createshared` ignores `lead`: write an ownership property right after create (02).
- A JSM template creates missing global types/statuses on its own; count them against the approved list (02, 07).
- Never edit a shared scheme to freeze the source: assign new read-only COPIES (14).
- A sandbox may share org groups with production: a "sandbox" group add can grant production access (01).
- Deleting a project made from a classic template leaves its `KEY: …` schemes, screens, workflow and board filter behind; delete them too when cleaning up rehearsals (15).

## Access and inventory
- A 401/403 on YOUR token is about that identity — probe every identity you hold before saying "no access" (02).
- Site admin ≠ issue Browse: compare `project/search?expand=insight` counts with JQL counts per project (02).
- Archived Confluence spaces still hold their keys (02).
- The mapping file must actually be read by the copy — assert every source type has an entry (02).
- Native cross-org copy needs one person who is org admin in BOTH orgs, and cannot anonymise (01).
- Native copy merges same-named groups additively in both directions; re-runs only add (01).

## Silence
- Autowatch preference: body must be bare `true`; quoted `"true"` stores false (03).
- A restore turns autowatch back on while later writers still run — re-disable (03).
- Notification-scheme writes can apply very late; pin the silent scheme by id, prove it empty, read back (03).
- A JSM template desk can have NO notification scheme (404) — not proven silent; assign the silent one (03).
- Team-managed projects: notification scheme cannot be reassigned over REST (400) (03).
- JSM customer notifications: no REST; record before-state once, restore exactly (03).
- Confluence `minorEdit=true` reads back false and does not stop the mail — gate edits on page AND space watchers (03).
- `content/{id}/notification/child-created` = PAGE watchers, `notification/created` = SPACE watchers — the paths mislead (03).
- A new page under a watched parent or in a watched space can mail those watchers (03, 11).
- A test-management loader creates Jira issues → mail after the restore unless the restore waits (12).
- Existing automation will comment on / transition your items — list and pause (02).
- `notifyUsers=false` does not protect CREATES — the silent scheme must be in place before the first item (03).
- `PUT {"notificationScheme": null}` is ignored: a project that had NO scheme can never be put back to "none" (03).
- Changing a resolution on a live desk can mail customers ("request resolved") (03, 07).
- Take the HOLD file before checking the window, or the window can close under you (03).

## Jira copy
- Jira never reuses a number; a probe create burns one (04).
- A timed-out POST may have created the item — look for your marker label before re-posting (04).
- Create screen without system Description → 400, or (custom description field with a template default) the item shows the template; omit it from the create, PUT it after (04).
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
- The issue payload embeds at most 20 worklogs; `expand=versionedRepresentations` moves every field out of `fields` (04).
- A failed first create consumes number 1 — recreate the project (04).
- Bulk move rejects mixed standard/sub-task source lists and can clear custom field values (04).
- Description limit 32,767 is on TEXT, not ADF JSON (04).
- Name-matched custom fields can hit a "(migrated N)" duplicate — pin ids (04).

## Links, sprints, boards
- `POST /issueLink`: the `inwardIssue` you pass ends up holding the OUTWARD wording — prove on one pair first (05).
- Link counts per item cannot detect inverted links (05, 13).
- A target link type may carry the opposite wording of the source type with the same name (05).
- Only filters shared with you are readable (05).
- Board columns/swimlanes/quick filters: no public write API (05).
- Closed sprint `completeDate` cannot be set (05).
- Adding an item to a replayed sprint moves it out of its open sprint — re-seat afterwards (05).
- Sprints of deleted source boards are invisible from the board side — read the item's Sprint field (05).
- Adding a sprint batch fails entirely if one key does not exist yet — boards/sprints after ALL projects (05).
- Kanban boards answer 400 on the sprint endpoint (05).

## Negatives
- Items readable by key can be invisible to the source's JQL (06).
- Deactivated users are hidden from user search; invite returns 400 with the existing user (06, 10).
- Forge apps 404 on the Connect add-on probe (06, 12).
- A JQL label with a space returns 0, no error (06).
- JQL/CQL dates and changelog times are in the account's time zone (06).
- CQL misses attachments the direct child listing shows (06, 11).
- Browser download URLs 401 to API tokens for every file (06, 11).
- Gap probes mostly return a DIFFERENT key (moved issue); only "returned key == PROJ-n" is hidden (06).
- `…/restriction/byOperation` returns no data; restricted pages are invisible to an account not in the restriction (06, 11).
- A restricted space home page makes the whole space look empty (06).
- JQL history predicates lag minutes; `NOT IN` skips empty fields (06).
- A helper that maps errors to empty results produces fake diffs (06, 13).

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
- Comment attachments, comment replies, blog attachments and archived-page attachments (`?status=archived`) are each
  missed by page-level listings (11).
- A copy that ignores page restrictions makes restricted pages visible to the whole space (11).
- Deleting a group's view permission cascades to its create/update permissions; re-adding view does not restore them (11).
- Images embedded inside draw.io XML were skipped by base64 blanking (09).
- Extension-less videos read as text; extension-less PNG/Office passed unchecked — sniff file heads (09).
- Screenshots EMBEDDED in docx/pptx/xlsx/PDF are invisible to a text extractor: OCR `*/media/*` and every rendered PDF page; re-scan what was released (09).
- Your own records, logs and commit messages can carry names — scan before committing (08).
- One gate for every upload path: copy, release, restore, replace and report scripts each carried their own "clean"; restores re-published a key the transform had removed (09, `templates/att_gate.py`, `templates/check_upload_paths.py`).
- OCR variants read different text (native vs upscaled); run them as a union and judge each hit on a crop of the pixels, not the OCR line (09).
- A blurred file verified with the lens that missed the name can still show it; verify with every lens + look (09).
- Fail-closed stripping of binaries makes tools useless; read their strings instead, allowlist OSS credit PHRASES (09).
- A PEM BEGIN marker inside key-parsing code is not a key; require the base64 body (09).
- Pages created before their images were uploaded break images on the first edit (shared draft = `UNKNOWN_MEDIA_ID`); upload first or rebuild the draft (11).
- "Corrupted file" has at least four causes (editor 0-byte, held never uploaded, stripped archive, unlisted files); diagnose per page first (11).
- Video/audio recordings show their participants: hold them (09).

## Users and licences
- User API tokens get 401 on admin hub APIs; use the browser session or an org API key (10).
- "Claim accounts" wizard defaults to ALL accounts and AUTOMATIC claiming (10).
- "Suspend access" in the admin UI has no confirmation dialog (10).
- Suspension is org-wide (all products, all sites); group removal frees one product seat, if no other group grants it (10).
- New accounts show "never active" — exclude recently added users from inactivity rules (10).
- Confluence seat cap (`LicenceExceededException`) is invisible from the Jira side (10).
- Product-access groups open every project that grants Browse to "any licensed user" (10).
- Confluence users can edit by default — "view-only" reviewers edited migrated pages (10, 11).
- A migration account can be suspended on the source mid-run by the client — know which account each step uses (10).
- Re-inviting an e-mail resurrects the old account (06, 10).

## Process
- `pkill -f`/`pgrep -f` match your own waiter and sibling subshells — use PIDs (27).
- Never edit a running shell script; temp file + `mv` (27).
- A job loads the matcher once; restart it after a list change (08, 27).
- A long job without its first checkpoint is broken, not slow (27).
- A parallel runner can fail on "argument list too long" and still write DONE — check exit codes (13).
- Python 3.9 `socket.timeout` is not `TimeoutError` — catch `OSError` (27).
- A new file in a globbed directory can break every parser of that glob (27).
- A guard in `--no-halt` mode never stops anything; a leak found after the fact is reported, not HALTed (13).
- Confirm the source shutdown time at kick-off; gitignore the snapshot before writing it (14).

- **Test steps "missing" after the load** — usually not missing: REST-created issues never get the Forge panel properties
  the issue view needs (panel property + `issue.content.panel.customised.flag`). See docs/12.
- **Restores and transforms are uploads too** — an original restored to fix a "corrupted" archive can carry a file the
  cleanup had removed for a reason (a private key). Run the full gate, secrets included, on every restore.
- **Two accounts per person** (contractor-suffixed + full) — switch, then deactivate; claim unmanaged accounts first. See docs/10.
