# Source: freeze it, then snapshot it before it goes away

The source keeps changing until it is frozen (one item was created on the source an hour after it had been copied in
a rehearsal), and it may be switched off earlier than planned. Freeze it at an agreed time, and keep a local copy of
everything you might still need.

## Freeze (read-only) without editing anything the source owner shares

The same rule as on the target applies: do not edit shared objects.

**Jira** — the permission scheme of the projects in scope is typically shared with many other projects. Never edit it.
Instead:
1. Snapshot every project's current permission scheme assignment.
2. Create a NEW scheme per original: `<original name> - migration READ-ONLY` = a copy of the original with every
   BROWSE/view grant kept, all write/transition/comment/attach/delete grants removed, EXCEPT: full permissions for the
   migration accounts' group (or BROWSE + ADMINISTER_PROJECTS for them), and anything the source owner asks to keep
   (their own crew group kept full rights in the field run).
3. Assign the copies to the in-scope projects only. Portal customers keep browse, lose create/comment.
4. Restore = assign the originals back (recorded), delete the copies.
5. Proven on a sandbox first: an ordinary user could only browse, the crew group kept full rights, the originals
   unchanged, restore exact.

Traps measured on the way:
- Project admins cannot do this: the default scheme grants edit/comment/transition to "any user with Jira access" (an
  application role), so changing role members removes ACCESS rather than making it read-only. It needed a temporary
  site admin on the source, granted by the source owner.
- `POST /rest/api/3/permissionscheme` with copied grants returned 400 "The permission 'VIEW_AGGREGATED_DATA' can't be
  granted to 'sd.customer.portal.only'" — parse the message, drop exactly that grant, retry in a loop; a couple of
  other grants (incl. PROJECT_VIEW_ALL_WORKLOGS, app permissions) were refused too.
- Losing a "view all worklogs"-style grant could silently make your own copy read fewer worklogs: MEASURE worklog
  counts on a dozen issues before and after the freeze, one project first.
- After each assignment, verify the ORIGINAL scheme's grant count is unchanged.
- Verify from the users' seat: `mypermissions` for several ordinary users → browse yes, create/edit/comment/transition
  no. Undoing the freeze needs an admin again — tell the owner.
- The UI labels the frozen space "Custom access" before and after, which confused the owner — explain with a
  per-user permission diff. Space admins can grant themselves edit back.

Team-managed projects cannot have their scheme swapped — check who can still write (often only portal customers; set
everyone to Viewer, or turn off the portal channel). Turn off the e-mail channel on the source desks during the freeze
(new requests keep arriving otherwise).

**Confluence** — remove add/edit/delete permissions per in-scope space, keeping read and space admin:
1. Snapshot all space permissions: v2 `GET /wiki/api/v2/spaces/{id}/permissions?limit=250` (paged; space id from
   `GET /wiki/api/v2/spaces?keys=KEY`). Never overwrite a snapshot once taken.
2. Dry run: count write permissions per space (thousands across a few hundred users/groups).
3. Apply: v1 `DELETE /wiki/rest/api/space/{key}/permission/{id}` — the id is the v2 permission id. Log every removal.
4. Restore = re-add every logged removal with v1 `POST /wiki/rest/api/space/{key}/permission {subject, operation}`;
   compare set-identical with the snapshot. Note: deleting `create:page` also drops `update:page`; restore re-adds both.
   Apply + restore were proven on a sandbox space first (≈100 removed → 0 write left → restored identical).

Get the source owner's written yes for both, with the time. During a rehearsal the source owner made the migration
account site admin so it could apply the Jira freeze itself.

Verify at the end that the freeze held and that YOUR accounts wrote nothing on the source (CQL contributor, JQL
`updatedBy`) — the guard dog's T4 and the final review's R6.

## Snapshot before shutdown

Field note: the source's switch-off was brought forward to the evening of the last migration day. A read-only snapshot
ran in priority order and kept going until the source stopped answering:

| Priority | What | Why first |
|---|---|---|
| P1 | Bytes of every source attachment NOT on the target: held files, later purges, draw.io, archives, files without extension | Releases after shutdown need the original bytes |
| P3 | The evidence/report pages you wrote on the source + their attachments (storage + exported view HTML) | Small; would be lost |
| P2 | Raw JSON of every item (`fields=*all`, changelog, rendered fields, ALL comments paged, worklogs, remote links) + project metadata (versions, components, statuses, boards, sprints, desks); every page/blog (storage, version, ancestors, labels, restrictions, comments, attachment lists); whiteboard exports | Re-checks and repairs after shutdown |
| P4 | Every remaining attachment byte of the in-scope projects/spaces | Completeness |

- **Confirm the shutdown time at kick-off** and take the snapshot BEFORE go. Field note: the notes said "source off on
  Wednesday end of business"; the switch-off moved to that same night and was missed until the lead pointed at it —
  the snapshot became an emergency.
- **Gitignore the snapshot directory BEFORE writing to it** (tens of GB of personal data, one `git add -A` away from a
  commit). Agents must append to shared ignore files, never rewrite them: a later worker replaced the snapshot ignore
  line with a narrower one that would have un-ignored the whole snapshot.
- Resumable: skip a file that exists locally with the API-reported size; skip a JSON record already on disk. Keep a
  manifest (kind, container, item, attachment id, file name, size, sha256, path) and a progress line every minute.
- Reconcile the snapshot against your inventory (every page and item present; max changelog length and max comment
  count spot-checked complete).
- Prove "no source edits after the freeze" with CQL `lastmodified >= <freeze>` (positive control: an earlier date
  returns > 0) and JQL `updated >= "<time>"` (in the API user's time zone — `GET /rest/api/3/myself` → `timeZone`).
- Threads ~20 for bytes; it is read-only on the source but shares its rate budget with anything else reading it —
  stop competing reads first.
- Measured: several thousand priority files (well over 10 GB) in minutes; every item as JSON; tens of thousands of attachment files,
  ~20 GB in total.
- Some attachments were **gone on the source itself** (download 404, media store NotFound; also older versions) —
  retried by two routes, then listed as unrecoverable in the report. Do not loop on them.
- Page PDF export (`flyingpdf`) answered 403 to an API token; store storage + exported-view HTML instead.
- There is no REST space export on Confluence Cloud (the export is a UI long-running task): page-by-page snapshot is
  the only scripted route.
- Archived pages, comment attachments and whiteboards are easy to miss — the final reviewer found ~60 source-only files
  in exactly those places; the snapshot fetched them while the source was still up, and the decisions about them were
  taken from the local copy afterwards.
- Resolve and CACHE every source URL your link rewriter needs (doc 11) before shutdown.
- Keep the snapshot out of git (personal data); purge it within an agreed time after sign-off.

Source spaces disappeared mid-preparation (404 "No space found" for current AND archived status, visible hours
earlier) and builds crashed on an empty `/wiki/api/v2/spaces?keys=` result. Re-check visibility right before the run,
handle an empty lookup, flag to the owner, never drop scope silently.

## What still worked after the source was gone

Everything that had been designed to work from local data: release of transformed archives (prepared from snapshot
blobs, no network), archived-pages migration, link rewriting from the cached resolutions, report rebuilding. Anything
that would have needed a live source read was impossible — so decide early which post-steps must be source-independent.
