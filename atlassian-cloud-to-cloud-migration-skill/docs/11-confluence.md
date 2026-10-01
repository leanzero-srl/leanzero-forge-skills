# Confluence: spaces, pages, attachments, diagrams, archived pages, whiteboards, links

Confluence is the easier half to load (no numbering constraint) and the harder half to make faithful: hierarchy,
macros, diagrams, comments and links all reference ids that change.

## Spaces

- Create with the source's name (minus migration decorations) and the agreed key (doc 02 for key collisions).
- New spaces get the TARGET site's default space permissions — i.e. whoever the site default grants can see the content
  from the first page. If the owner wants spaces closed during the load, restrict before loading.
- Space admins afterwards: grant via a group (`read` + `administer`), record, revert = delete those permissions.
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
- Restricted pages: carry restrictions only for KEEP people/groups that exist on the target; otherwise the page
  becomes visible to more people than before — decide with the owner.

## Attachments

Upload under the target page (scrubbed file name), multipart, `minorEdit=true`:

```http
POST /wiki/rest/api/content/{pageId}/child/attachment          # new file
POST /wiki/rest/api/content/{pageId}/child/attachment/{attId}/data   # new VERSION of an existing file
X-Atlassian-Token: no-check
```

- An attachment 404 on the source must never kill the whole page (some bytes were gone on the source itself: the media
  store answered NotFound — those were listed, not retried forever).
- Verify by downloading through REST and comparing sha256 with the source bytes. The browser download URL
  `/wiki/download/attachments/<page>/<file>` answers 401 to an API token for ANY file (the negative control 401s too) —
  it proves nothing.
- CQL (`type = attachment`) misses attachments the direct child listing shows; count with
  `GET /wiki/rest/api/content/{pageId}/child/attachment` per page.

### Zero-byte versions after someone opens the editor

Field note: a page lost all its images a day after the load. Every body-referenced image had a new VERSION 2 of size 0
with media id `UNKNOWN_MEDIA_ID` (download 400), created by a tester's brand-new account in one half-second window
when he OPENED THE EDITOR (an unpublished draft existed; no content change). Version 1 (ours) was intact. Blast radius
measured: ~7,000 Confluence attachments scanned → 21 broken, all on that page; Jira 0. Viewing did not cause it (thousands
of untouched attachments after a day of viewing), and other editor sessions broke nothing — so mechanism confidence
is medium (a brand-new account without media access yet, or a referenced image that was held and missing on the page).

Detection: list every attachment with `fileSize == 0` or `fileId == "UNKNOWN_MEDIA_ID"` and per-version byte counts.
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

Forge-based diagram macros keep the source cloud id in their embedded macro context; it is context, not a link, and
was left as is.

## Comments

- Footer comments: re-post with a header line "<author or placeholder> (date):"; replies as replies (the v1 API
  `POST /wiki/rest/api/content` with `container` + `ancestors`, or v2 `footer-comments` with `parentCommentId`).
- Inline comments: the source marker refs cannot be replayed — `POST /wiki/api/v2/inline-comments` mints its own ref and
  ignores the one you pass (201 either way). Options: (a) re-post as footer comments quoting the selected text (what we
  did), or (b) create the inline comment first, then write the ref it RETURNED into the body around the target text
  (verified to render as an annotation).
- Comment ids are not monotonic; pair by content and created date, never by id order (doc 08).
- Comment attachments (files attached to a comment) are separate: `child/attachment` of the COMMENT id. A final
  reviewer found ~13 never copied.

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
- A parent watched by anyone but the migration accounts → place at the space ROOT instead (child-created watchers would
  get a mail).
- Same scrub, same attachment verdicts, same draw.io re-pointing as live pages.
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
3. Create a child page "<title> (whiteboard snapshot)" under the mapped parent with a note + the image.

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
| Old space-key ALIASES (pages that moved between spaces on the source long ago) | map by PAGE ID, never by the key in the URL |
| `/wiki/download/attachments/<srcPage>/<file>` | `…/<tgtPage>/<file>?api=v2` if the file is on the target page; else replace the link/image with "[attachment not migrated]" (link text kept) |
| Version report URLs `/projects/K/versions/<id>` | source version → name → target version id of the same name |
| `/issues?jql=…` | map the JQL (ids by name); unscoped JQL only when source and target return the SAME non-empty keys |
| Boards, desk queues, portals | through the boards map / desk map; queue ids are not readable on the source → queue list page |
| `focusedCommentId=` | dropped (comment ids differ) |

- Jira side: descriptions, environment, comments, custom text fields, remote links — under the silent window with
  `notifyUsers=false`. Confluence side: page/blog bodies with `minorEdit` + the watcher gate (doc 03).
- Resolve every source URL ONCE on the source and cache the answer; the rewrite then works after the source is gone.
- Run it LAST, and re-run after any later repair that writes source text again: a description restore re-introduced
  `/browse/` links after the rewrite had already run.
- Field note: a final reviewer found ~150 links on ~70 pages that still loaded migrated content from the source (space
  aliases, absolute attachment URLs, version reports, JQL tables) and would break at shutdown; fixed the same evening.
- A `threading.Lock` taken twice (append + save) deadlocked the first apply after one PUT per thread (4 pages written
  unrecorded, recovered from version 1). Use an `RLock`, or never nest.

## Space and page deletes

- `DELETE /wiki/api/v2/pages/{id}` → 204 = moved to TRASH (still readable). Purge as in doc 09.
- v2 has no space delete (400 "Expected type is GenericContentType…"); use v1 `DELETE /wiki/rest/api/space/{KEY}` → 202
  + a long task. Deleting the space removes its trashed pages too. Confirm with a control: deleted key 404 AND a known
  space 200 in the same run.
- v2 `_links.next` is site-root-relative and already contains `/wiki`: appending it to a base ending in `/wiki`
  gives `/wiki/wiki/…` → 404.

## Test edits by reviewers

Reviewers with edit rights WILL edit migrated pages ("Test!"). An editor save also re-serialised attachment macros into
`UNKNOWN_ATTACHMENT` on one page. With the source owner's yes, the pre-test content was restored as a new version
(`PUT` the earlier body) and the test comments deleted — and the page edit may mail its watchers (accepted). Tell
reviewers up front whether they may edit.
