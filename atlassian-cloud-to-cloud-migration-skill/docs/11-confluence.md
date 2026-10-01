# Confluence: spaces, pages, attachments, diagrams, archived pages, whiteboards, links

Confluence is the easier half to load (no numbering constraint) and the harder half to make faithful: hierarchy,
macros, diagrams, comments and links all reference ids that change.

Some v1 calls below (`POST /wiki/rest/api/content`, `GET …/content/{id}`, `GET …/child/attachment`) answered in the
run but are no longer in Atlassian's v1 spec. Prefer v2 where it can do the job; keep v1 `POST content` where v2
cannot (restrictions inside the create call).

## Spaces

- Create with the source's name (minus migration decorations) and the agreed key (doc 02 for key collisions).
- New spaces get the TARGET site's default space permissions — i.e. whoever the site default grants can see the content
  from the first page. If the owner wants spaces closed during the load, restrict before loading.
- Space admins afterwards: grant via a group (`read` + `administer`), record, revert = delete those permissions.
  Space Admin and View are SEPARATE grants — an admin without View sees nothing (map both explicitly).
- Space permission writes have side effects (measured once, live): a v1 `read/space` grant appears in v2 as TWO rows
  (`read/space` + `export_content/space`); deleting a group's `read/space` CASCADED to its `create/page` and
  `update/page`, and re-adding read did not bring them back. Write the view permission first, never delete-and-re-add a
  view grant on a live target, re-read after every write. A NEW space grants every installed app user ~27 permissions
  (most rows on a fresh space) — filter app principals out of permission diffs; v2 also returns distinct grant ids for
  duplicate principal+operation pairs, so dedupe on the semantic key.
- Permission audits before/after: key on space key + page title + principal name (ids change across sites); append the
  id only when one display name maps to several principals; self-diff a snapshot first as a positive control; write
  snapshots to immutable timestamped files. In a diff, a page whose restriction rows ALL disappeared is NEW ACCESS (the
  page is now open), not lost access.
- Create: v1 `POST /wiki/rest/api/space {"key","name"}`.
- Space home page: map the source home page to the target home page (do not create a second "home" under it).
  Field note: a rehearsal created the source home as a child of the target's auto-created home: +1 page and every
  "homepage mapped" check failed.

## Pages: order, parents, titles

- Walk the source tree **parents first**. If a parent is not created yet (paging order, a failure), mark the child
  PENDING and create it when the parent appears — a rehearsal put 8 pages in the wrong place before this existed.
- Titles are unique per space: a resume can hit "title already exists" for its OWN leftover from a crashed attempt —
  adopt it (it is yours: check the creator/marker) instead of creating "Title (1234)" variants. A separate
  `fix_hierarchy` pass compares every page's parent with the source and moves misplaced pages
  (`PUT` with `ancestors`), and strips id suffixes from titles.
- Folders (v2 content type) are part of the hierarchy: a checker that ignored folders raised ~200 false "wrong parent"
  flags.
- Blog posts: same scrub, their own map file.
- Origin note: put it at the **TOP** of every page ("Migrated from <source space>/<page id> on …, original author …")
  — readers did not find it at the bottom of a page with a 21k-character table.
- Some macros fail on create (a content-report-table macro returned 500): retry the page without that macro (replaced
  by a note) rather than losing the page.
- Restricted pages: a copy that does not read restrictions silently makes every restricted source page visible to
  the whole target space (a client page claimed otherwise; a reviewer caught it). Read them (`GET
  /wiki/rest/api/content/{id}/restriction?expand=restrictions.user,restrictions.group` — at most 100 users and 100
  groups per call; page with `start`/`limit`), carry restrictions for KEEP
  people/groups that exist on the target, and decide the rest with the owner before access opens. The copying account
  only sees pages whose restriction includes it — ask space owners to confirm nothing restricted is missing.
- A scrubbed TITLE can collide with an existing page title ("A page with this title already exists") — suffix the id.
- Read an earlier version body: v2 `GET /wiki/api/v2/pages/{id}?version=N&body-format=storage`; list versions with
  `GET /wiki/api/v2/pages/{id}/versions` (the v1 forms used in the run are no longer in the v1 spec).

## Attachments

Upload under the target page (scrubbed file name), multipart, `minorEdit=true`:

```http
POST /wiki/rest/api/content/{pageId}/child/attachment          # new file
POST /wiki/rest/api/content/{pageId}/child/attachment/{attId}/data   # new VERSION of an existing file
X-Atlassian-Token: no-check
```

- `PUT /wiki/rest/api/content/{pageId}/child/attachment` (multipart, `minorEdit=true`) is create-or-update; retry a 404
  on `child/attachment` a few times right after a page create (not yet visible).
- Re-uploaded attachments read back as `application/octet-stream` — they still render.
- An attachment 404 on the source must never kill the whole page (some bytes were gone on the source itself: the media
  store answered NotFound — those were listed, not retried forever).
- Verify by downloading through REST and comparing sha256 with the source bytes. The browser download URL
  `/wiki/download/attachments/<page>/<file>` answers 401 to an API token for ANY file (the negative control 401s too) —
  it proves nothing.
- CQL (`type = attachment`) misses attachments the direct child listing shows; count with
  v2 `GET /wiki/api/v2/pages/{id}/attachments` per page (paged; the v1 `child/attachment` GET answered in the run but
  is no longer in Atlassian's v1 spec).

### Zero-byte versions after someone opens the editor

Field note: a page lost all its images a day after the load. Every body-referenced image had a new VERSION 2 of size 0
with media id `UNKNOWN_MEDIA_ID` (download 400), created by a tester's brand-new account in one half-second window
when he OPENED THE EDITOR (an unpublished draft existed; no content change). Version 1 (ours) was intact. Blast radius
measured: ~7,000 Confluence attachments scanned → about twenty broken, all on that page; Jira 0. Viewing did not cause it (thousands
of untouched attachments after a day of viewing), and other editor sessions broke nothing — so mechanism confidence
is medium (a brand-new account without media access yet, or a referenced image that was held and missing on the page).

Detection: list every attachment with `fileSize == 0` or `fileId == "UNKNOWN_MEDIA_ID"` and per-version byte counts
(`GET /wiki/api/v2/pages/{id}/attachments`, `GET /wiki/api/v2/attachments/{attId}/versions`, download with
`?version=1`, `GET /wiki/api/v2/pages/{id}?get-draft=true` shows an unpublished draft; the Confluence audit log has no
attachment-version events).
Repair: upload the newest earlier good version (or the source bytes, if the verdict is clean and sha256 matches) as a
new version, `minorEdit=true`, same name; verify version+1, size, real fileId, download sha256. Idempotent; re-runnable.
Tell testers: viewing is safe; if pictures vanish after opening Edit, close without publishing and report the page.

## draw.io diagrams (custom content)

Current draw.io stores each diagram as **custom content** on the page (type
`ac:com.mxgraph.confluence.plugins.diagramly:drawio-diagram`, body = URL-encoded JSON with `pageId`, `diagramName`,
`version`, …) plus two page attachments: `<name>.drawio` (XML) and `<name>.drawio.png` (preview). The copied macro
still points at the SOURCE page id / custom content id / base URL → an empty diagram on the target.

Fix per diagram: upload both attachments, create the custom content on the TARGET page with the body re-pointed
(target `pageId`), then rewrite the macro parameters (`pageId`, `custContentId`; drop `baseUrl`). For an
"include diagram" macro, `imgPageId` must point at the page that holds `<name>-<aspectHash>.png`. Verify that it
renders (screenshot), not just that the parameters changed. The diagramming app must be installed on the target
(a sandbox without it showed nothing — install it first).

Custom content create shape that worked:

```http
POST /wiki/rest/api/content
{"type": "ac:com.mxgraph.confluence.plugins.diagramly:drawio-diagram", "title": "<diagramName>",
 "space": {"key": "SPACE"}, "container": {"id": "<pageId>", "type": "page"},
 "body": {"raw": {"value": "<url-encoded JSON {pageId, diagramName, version, …}>", "representation": "raw"}}}
```

Legacy diagrams are an attachment WITHOUT extension (mediaType `application/vnd.jgraph.mxfile`) plus `~<name>.tmp`
drafts. Snapshot every attachment VERSION of a diagram (one had dozens) if you may need to rebuild after the source is
gone. A draw.io macro without a `pageId` parameter still works when the diagram attachment is on the same page — a
check that flags it is a false alarm. If the diagramming app is not installed on the target, creating the content type
fails with 400 "Invalid content type…" (and CQL `type=` too) — check first. Installing an app on a sandbox means
accepting terms: let the site admin click it.

A site-wide CQL macro search (`macro in ("drawio","inc-drawio",…)`) ran past 300 s on a busy target and was killed;
scan per space with `GET /wiki/api/v2/spaces/{id}/pages?limit=250&body-format=storage` and a positive control.

Forge-based diagram macros keep the source cloud id in their embedded macro context; it is context, not a link, and
was left as is.

## Comments

- Footer comments: re-post with a header line "<author or placeholder> (date):"; replies as replies (the v1 API
  `POST /wiki/rest/api/content` with `container` + `ancestors`, or v2 `footer-comments` with `parentCommentId`).
- Inline comments: the source marker refs cannot be replayed — `POST /wiki/api/v2/inline-comments` mints its own ref and
  ignores the one you pass (201 either way). Options: (a) re-post as footer comments quoting the selected text (what we
  did), or (b) anchor it the documented way, `inlineCommentProperties` {`textSelection`, `textSelectionMatchCount`,
  `textSelectionMatchIndex`}, or create it and then write the ref it RETURNED into the body around the target text
  (verified to render as an annotation).
- Comment ids are not monotonic; pair by content and created date, never by id order (doc 08).
- Comment attachments (files attached to a comment) are separate: `child/attachment` of the COMMENT id. A final
  reviewer found about a dozen never copied. Page-level listings never show them; find them with CQL
  `space=X and type=attachment` + `expand=container,version,extensions`, filtered on `container.type = comment`
  (`expand=container.container` → 400). A bare `<ri:attachment ri:filename>` inside a comment resolves against the
  COMMENT's attachments — upload to the target comment (`POST /wiki/rest/api/content/<commentId>/child/attachment`) and
  check that `body.view` no longer shows the unknown-attachment placeholder.
- Replies: v2 `footer-comments` and `inline-comments` return top-level comments only — fetch children separately
  (`/footer-comments/{id}/children`). Blog posts have comments, replies and attachments too; each was missed somewhere.
- Inline comments whose anchor text is already gone on the source ("dangling", about a third in one estate) cannot be
  recreated inline at all — footer comment with a note of what it referred to. Resolved inline comments must be
  re-resolved.

## Archived pages

Archived source pages are not in the normal tree walk. They were brought over only after the source owner said yes,
from the local snapshot (the source was already shutting down):

```http
POST /wiki/rest/api/content/archive   {"pages": [{"id": 123}, {"id": 456}]}
-> long task; poll GET /wiki/rest/api/longtask/{id}; then GET /wiki/api/v2/pages/{id} -> status "archived"
```

- Create parents first; an archived parent is created (then archived) before its children; archived children keep
  `parentId`.
- A page with no surviving parent → under the space home before archiving; an archived FOLDER parent → space home.
- A parent watched by anyone but the migration accounts → place at the space ROOT instead (its watchers could
  get a mail).
- Same scrub, same attachment verdicts, same draw.io re-pointing as live pages.
- Attachments of archived pages answer 404 on download unless you add `?status=archived`. Inventory
  `pages?status=archived` (and trashed, draft) per space at the START — a current-only copy and snapshot silently missed
  them; list them by page id only (titles can carry names).
- Field note: the source's live-space scans recorded these pages' files as "download-failed" (archived pages were not
  downloadable then) and HELD WINS held all of them. The archived-pages pass was allowed to supersede exactly
  `download-failed` records with its own fresh scan — every other non-clean record still held.
- A map file with a different naming scheme (`cmap-ARCHIVED.json`) broke every script that parsed `cmap-<SRC>-<TGT>.json`
  file names (a purge that crashed mid-way would have stopped trash purging). Keep map file names uniform.

## Whiteboards (no export API)

There is no REST export or copy for whiteboards. They were carried as IMAGE pages (decision logged):
1. Export in the browser from the source: the whiteboard's "More actions" → Export (the dialog lives inside the
   whiteboard iframe) → PNG, area "Entire board", quality "High". Confirm the board's version is unchanged afterwards.
2. Privacy check the PNG (diagram OCR: binarised tiles, psm 11; light-on-dark; bands) — lone first names cannot be proven
   movers, so every name box was blacked out (boxes from Tesseract TSV), then re-checked and looked at. Flatten
   transparency on white so it is readable in dark mode.
3. Create a child page "<title> (whiteboard snapshot)" under the mapped parent with a note + the image
   (`<ac:image ac:width="760">` — at 1800 it overflowed and needed another edit); say on the page that names were
   blacked out and that it is no longer editable; exclude these pages from page-count comparisons.

Also confirm WHICH space a whiteboard is in from `GET /wiki/api/v2/whiteboards/{id}` (`spaceId`) — a status line had
named the wrong spaces.

## Jira macros and links inside pages

- Jira issue macros carry a `serverId` (the application link of the site). Rewrite to the TARGET's server id
  (majority vote over existing macros on the target, per target) — keys are identical, so only the server id changes.
- A Jira-table macro's DATASOURCE carries the source cloud id + JQL; swapping the host in the href is not enough — the
  table kept querying the source. Rewrite the cloud id AND map the JQL (version ids by name, type names through the
  mapping, keys of items copied with new numbers).

## Link rewriting (after Jira AND Confluence are loaded)

Rewrite links that point at something that ALSO moved; leave everything else pointing at the source (and list it).

| Source URL form | Rewrite |
|---|---|
| `/browse/PROJ-n` | host swap (keys identical); items copied with new numbers → their NEW key |
| `/wiki/spaces/KEY/pages/<id>/…`, `viewpage.action?pageId=` | page map (source id → target id), target space read from the target page |
| Tiny links `/wiki/x/<code>` | decode to the page id, then map |
| Short links `/l/c/…`, `/l/cp/…` | follow ONE redirect on the source (read `Location`, do not follow further), then map |
| Old space-key ALIASES (pages that moved between spaces on the source long ago) | map by PAGE ID, never by the key in the URL (`spaces?keys=OLD` returns `[]`; v2 space has `currentActiveAlias`) |
| Folders `/wiki/spaces/K/folder/<id>` | not in page maps — match by title with `type=folder`, exactly one hit |
| `/wiki/download/attachments/<srcPage>/<file>` | `…/<tgtPage>/<file>?api=v2` if the file is on the target page; else replace the link/image with "[attachment not migrated]" (link text kept) |
| Version report URLs `/projects/K/versions/<id>` | source version → name → target version id of the same name |
| `/issues?jql=…` | map the JQL (ids by name); unscoped JQL only when source and target return the SAME non-empty keys |
| Boards, desk queues, portals | through the boards map / desk map; queue ids are not readable on the source → queue list page |
| `focusedCommentId=` | dropped (comment ids differ) |

- Jira side: descriptions, environment, comments, custom text fields, remote links — under the silent window with
  `notifyUsers=false`. Confluence side: page/blog bodies with `minorEdit` + the watcher gate (doc 03).
- Resolve every source URL ONCE on the source and cache the answer; the rewrite then works after the source is gone.
  Invalidate cached "stays on the source" answers whenever the migrated set grows (archived pages migrated later turned
  seven cached "stay" answers into rewrites).
- Absolute attachment URLs are a PRIVACY issue too: two images held for privacy were still being DISPLAYED from the
  source to anyone logged in there.
- Anchor text that repeats the URL must change with it; a check that only matches `browse/` and the new space key
  passes falsely — re-scan for every URL form above.
- Run it LAST, and re-run after any later repair that writes source text again: a description restore re-introduced
  `/browse/` links after the rewrite had already run.
- Field note: a final reviewer found over a hundred links on dozens of pages that still loaded migrated content from the source (space
  aliases, absolute attachment URLs, version reports, JQL tables) and would break at shutdown; fixed the same evening.
- A `threading.Lock` taken twice (append + save) deadlocked the first apply after one PUT per thread (4 pages written
  unrecorded, recovered from version 1). Use an `RLock`, or never nest.

## Space and page deletes

- `DELETE /wiki/api/v2/pages/{id}` → 204 = moved to TRASH (still readable). Purge as in doc 09.
- v2 has no space delete (400 "Expected type is GenericContentType…"); use v1 `DELETE /wiki/rest/api/space/{KEY}` → 202
  + a long task. Deleting the space removes its trashed pages too. Confirm with a control: deleted key 404 AND a known
  space 200 in the same run.
- v2 `_links.next` is site-root-relative and already contains `/wiki`: appending it to a base ending in `/wiki`
  gives `/wiki/wiki/…` → 404. v1 CQL `/wiki/rest/api/content/search` returns `_links.next` WITHOUT `/wiki` — the
  opposite trap. Neither has a usable `totalSize`; count with `/wiki/rest/api/search?limit=1&cql=…`.
- Before deleting a space you created (scope change), verify every page and attachment in it was created by your
  accounts; a deleted page can answer 403 "Requested content (id: N) doesn't exist" on its notification endpoint.
- A space roles mode exists (`GET /wiki/api/v2/space-role-mode` → e.g. `{"mode":"ROLES_TRANSITION"}`); record it
  before/after any bulk permission work. "Recover Permissions" (UI only) fixes spaces admins cannot see.

## Test edits by reviewers

Reviewers with edit rights WILL edit migrated pages ("Test!"). An editor save also re-serialised attachment macros into
`UNKNOWN_ATTACHMENT` on one page. With the source owner's yes, the pre-test content was restored as a new version
(`PUT` the earlier body) and the test comments deleted — and the page edit may mail its watchers (accepted). Tell
reviewers up front whether they may edit.
