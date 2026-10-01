# Attachment privacy: scanning, verdicts, release, purge

Attachments are where privacy filtering gets hard: screenshots of user menus and chat windows, PDFs with author
metadata, archives full of logs, diagrams with names in labels. Text scrubbing cannot fix a PNG. The working model:

> **Default DENY.** A file is uploaded only if a scan of its CONTENT says clean. Everything else is HELD and replaced
> by a note "[attachment not migrated: withheld (may contain personal data) or unavailable]". Held files can be
> RELEASED later — by a better scan, a transformation, or a human look — never by default.

Field note: the first copy uploaded archives that had passed on their file NAMES only (~200 zips). An adversarial
review found it; they were scanned by content, and the failing ones deleted from the sandbox. Scan contents, always.

## The extraction stack

| File kind | Extraction |
|---|---|
| Text, code, logs, CSV, JSON, XML, notebooks, unknown extensions | read as text; SNIFF unknown extensions (an MP4/PNG/zip without extension read as text wasted hours of matching — binary → held, UTF-16 decoded) |
| PDF | text layer + **OCR for scanned PDFs** + document metadata (Author, Creator, Producer) |
| Office (docx/xlsx/pptx) | text + core properties (author, lastModifiedBy) + comments; change-tracking tables in documents named people |
| Images | OCR (Tesseract, languages of the content) — see the passes below |
| Animated GIF | OCR ~12 frames via ffmpeg, de-duplicated (one project had >1,000 GIFs held until this existed) |
| Archives (zip, tar, gz, xz, bz2, 7z, rar, cab, jar) | unpack, check paths + archive metadata (tar uname, zip comments, gz FNAME), extract every member with the same extractors |
| draw.io (`.drawio`, embedded XML) | decode (`<diagram>` = `base64(deflateRaw(encodeURIComponent(xml)))` when compressed), match every string, OCR embedded images |
| PNG/PDF exported from draw.io | the diagram XML sits in a `tEXt` chunk / metadata, URL-encoded — decode before matching (a 2.4 MB single token hung the regex) |
| Key stores, VPN profiles, `.har`, `.npmrc`, `.env` | SECRET rule → held regardless of names; count separately in the report |

Performance that mattered:
- Cache extracted text per file by content hash (`sha1(space|item|name|url|size)`), separately per extraction pass. A
  matcher change then re-checks tens of thousands of files in minutes instead of hours.
- Process pool for OCR (CPU-bound); one pool for all batches (a new pool per batch made the slowest file gate each
  batch).
- Chunk huge texts (1 MB pieces) and match pieces in parallel; a 155 MB-text zip took 20 minutes before chunking.
- Never edit the scanner while a rebuild that spawns new processes is running — new workers pick up the half-edited
  file.

## Three OCR passes, because one was not enough

1. **Plain OCR** of the image as is. Tesseract binarises for dark text on light background.
2. **Light-on-dark pass**. White text on a dark UI bar (user menus, dark headers, dark-theme apps) is NOT read by pass
   1, not even at 2× scale. Field note: a screenshot passed as clean and was copied to production showing a non-mover's
   name in the white-on-dark user menu; a human spotted it. Method that worked: grey → 8×8 blocks, mean luminance < 130 →
   connected components → each dark crop autocontrast + **inverted** + 3× scale, psm 6; plus the whole image inverted,
   psm 11; transparency flattened on white AND black. Measured on the known positives first: full-image invert alone
   found 1/3, dark-region crops 3/3, 0/16 clean negatives flagged. Over ~20k "clean" images it found ~1,200 more hits;
   ~1,200 attachments were deleted from the target and recorded.
3. **Status-bar band pass**. The remaining misses: `Surname, First: <message>` in a dark status bar of an internal app.
   Both earlier passes had READ that text — the miss was the MATCHER (the person had no source account). Band = rows with
   ≥30% dark pixels, 10-140 px high → crop, 4×, invert, Otsu, psm 7. Match with the matcher PLUS a structural rule:
   `Surname[,.] First` with First in the first-name list, Surname not a dictionary word / first name / weekday /
   placeholder / KEEP mover (and OCR near-misses of a mover's first name within edit distance 1 skipped).
   Control: 5/5 known holds hit (the matcher alone 0/5), 0/19 clean.

For DIAGRAM images (whiteboard exports, architecture drawings): Tesseract's default page segmentation read ~0 words;
only binarised tiles at native size with psm 11 read every box (178 words vs 4).

Precision you should expect: roughly a quarter of hits carry a full name or e-mail; the rest are lone first names or
surnames, some false (a Cyrillic word in a bookmark bar read as a first name). Over-held images are fidelity loss only;
they can be released after a look.

**Eye review is a pass, not a fallback.** Every image of a small set (late releases, the items copied with new keys,
archived pages) was looked at by a human/vision check: it caught names OCR missed in dark bars, a face photo of an
unnamed meeting participant, a bookmark-bar surname. Use contact sheets (thumbnails in a grid) to make it fast.

## Name-SHAPE scan over attachment text

The matcher knows only accounts + curated lists, so a person WITHOUT an account inside attachment text (OCR, PDF/Office
text, author metadata) is invisible to it. Run the independent shape scan (doc 08) over every extracted text of every
file ON the target too:
- map each target attachment back to its source file and cache key (same name or scrubbed name; same size preferred)
- candidates = first-name-list + capitalised word pairs, `Surname, First`; drop movers (token rule), your own accounts,
  placeholders, already-reviewed strings
- every candidate string reviewed by eye with context: person / not a person + why (UI labels, OCR noise from binary
  streams, product and place names, generator demo names, public OSS/paper authors are not-person)
- Field note: ~1,800 candidate strings → 43 real non-movers in 55 attachments (screenshot user lists, chat profiles,
  document metadata, change tables, an IDE author annotation) → deleted. Regex trap: an alternation of ~1k first names
  inside a lookahead at every position ran >11 minutes; pair regexes + a set lookup did it in 30 s.
- Not covered by a pair scan: lone surnames/first names ("Dr. X", "Greetings, Y"). State it.

## One verdict per file: held wins

Over time you will have several scan files per project (first pass, light-on-dark, band, shape, eye, hidden items,
late release). `templates/attachment_verdicts.py` merges them:

- Key = `(kind, space/project, SOURCE item key, file name)`. Items copied with a new key carry `source_item` so they
  key by the source.
- **HELD WINS**: any non-clean record from any scan holds the file, even if another record says clean.
- **RELEASE override** applies to exactly the `(kind, space, item, file)` pair a transformation produced and uploaded
  (scrubbed diagram, rebuilt archive, regenerated preview), recorded with the uploaded sha256. It means "the bytes on the
  TARGET are clean", not "the source original is clean" — the copy/release scripts must never re-upload the source
  original of such a pair.
- **Eye-cleared false positives** must be honoured by every consumer: a band-scan file recorded every hit as HIT
  including the ones a human cleared; a "held reconcile" would have deleted clean files.
- Every consumer of "clean" goes through the merger. Grep your scripts for direct `status == "clean"` checks. Field
  note: a draw.io re-pointing step read only the first-pass scan (no held-wins) and its `--apply` would have uploaded
  files the light-on-dark pass had held.
- Report disagreements: ~100 files read "clean" in a scan file that had been rewritten after the copy while the held
  list said held. Held won; the cause of the rewrite was investigated separately.

## Verdict flips need a release step

When a re-scan (new matcher) flips a held file to clean, nothing uploads it — every release step had already run.
Field note: a final review found ~130 "clean but missing" files; all had been held at copy time under the older
matcher, flipped clean later, and never released. Rule: any verdict flip to clean is followed by a release pass AND the
newer passes (light-on-dark, band, shape, eye) on the released files before upload.

## Transform instead of hold (release 2)

Two held classes carried little or no personal data a reader could see:

**draw.io diagrams** — often FALSE hits ("Times New Roman" → "Roman" in every label; a first name inside a URL claim) or
a first name in a label ("Anna's team"). And with the diagram held, its macro pointed at nothing. Transform:
decode → map fonts (`Times New Roman` → `serif`, renders the same) → scrub every string inside ONE document context →
never scrub graph refs (`id`, `parent`, `source`, `target`; a hit there = hold) → mask `data:` URIs and OCR each
embedded image → re-encode in the SAME format → verify: re-parse, cell count equal, the scanner's own extract+match
clean, detector 0 over every string, and the diagram RENDERS (draw.io desktop CLI: `drawio -x -f png`). Previews are
re-rendered from the scrubbed XML; an exported PNG with a name in the PIXELS stays held.

**Archives** — held fail-closed as not checkable (the scanner never opened 7z/tar, or one unreadable member held a
whole zip). Transform: unpack, check every member; all clean → upload the ORIGINAL unchanged; else REBUILD in the same
format with hit text scrubbed (re-verified), everything else removed, and a `_REMOVED_IN_MIGRATION.txt` listing removed
paths; re-check the rebuilt archive from scratch. Still held: signed code packages, packages that would lose a file,
rar/cab that need a rebuild, encrypted archives, nothing checkable left, documents whose hit cannot be pinned to one
member. Found real people this way that every other pass missed: PDF author metadata inside a zip, a change table in a
7z, an engineer's name in a code comment, an `.env` file in a tarball (removed).

Sort jobs smallest-first, write progress as you go (resume), and expect a long tail: the largest archives took ~95
minutes each to match and the second pass ran for a day after the main migration. Lower the job's priority (`nice`)
so it does not starve the copy.

## Deleting held files that reached the target

- Jira: `DELETE /rest/api/3/attachment/{id}` — no trash. Gate every delete on: target item carries your marker label,
  project on the silent scheme (read back), name/size/sha256 match the source file you mean.
- Confluence: `DELETE` of a page/attachment only moves it to the **space trash** (still readable there). Purge:
  ```
  DELETE /wiki/api/v2/attachments/{id}?purge=true          # attachment; trashed ones are listed via
  GET    /wiki/api/v2/pages/{id}/attachments?status=trashed
  DELETE /wiki/rest/api/content/{id}?status=trashed         # purge a trashed page
  ```
  Delete ALL versions of an attachment. Read back each delete; v2 read-back is eventually consistent (one read
  "current" right after the purge and 404 a minute later — retry the read 6×5 s).
- Record every deletion (target item, scrubbed file name, attachment id, reason) with no names in the record.
- Verify independently: re-read every deleted id → 404, with a positive control (a still-present attachment → 200 via
  the same endpoint).

## Keep the evidence out of your repo

Name lists, extracted texts, package files, scan results and snapshots are personal data. Keep them in a gitignored
state directory, purge them (dry-run default script) within an agreed time after sign-off, and rewrite history if a
list was ever committed. Run `scripts/leak-scan.sh` with your denylist over anything you publish.
