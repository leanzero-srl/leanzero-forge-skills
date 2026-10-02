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
| PDF | text layer + document metadata (Author, Creator, Producer) + **every page rendered and OCR'd** (normal + inverted) — not only scanned PDFs (below) |
| Office (docx/xlsx/pptx) | text + XML attributes + core properties (author, lastModifiedBy) + comments; change-tracking tables in documents named people; **embedded images** (`word/media/*`, `ppt/media/*`, `xl/media/*`) extracted and OCR'd (below) |
| Images | OCR (Tesseract, languages of the content) — see the passes below |
| Animated GIF | OCR ~12 frames via ffmpeg, de-duplicated (one project had >1,000 GIFs held until this existed) |
| Archives (zip, tar, gz, xz, bz2, 7z, rar, cab, jar) | unpack, check paths + archive metadata (tar uname, zip comments, gz FNAME), extract every member with the same extractors |
| draw.io (`.drawio`, embedded XML) | decode (`<diagram>` = `base64(deflateRaw(encodeURIComponent(xml)))` when compressed), match every string, OCR embedded images |
| PNG/PDF exported from draw.io | the diagram XML sits in a `tEXt` chunk / metadata, URL-encoded — decode before matching (a 2.4 MB single token hung the regex) |
| Key stores, VPN profiles, `.har`, `.npmrc`, `.env` | SECRET rule → held regardless of names; count separately in the report |

Extractor traps that held files for the wrong reason, or passed them unchecked:
- MP4 videos without an extension (hundreds of MB) were decoded as TEXT and cost hours of matcher time; ~70 PNGs and
  zipped Office files without an extension passed as "clean" UNCHECKED; UTF-16 files went undecoded. Sniff the head of
  every file read as text (binary / UTF-16 / text); binary = not checkable = held; do not trust cached verdicts for
  those files.
- File names with a query suffix (`name.png?version=1&…`) broke extension detection — strip the query first.
- Tools that worked: `pdftotext`, `pdftoppm` + OCR for scanned PDFs, `pdfinfo` (Info + XMP), Office docProps and
  tracked-change authors (`w:author`), `strings` for legacy .doc/.xls/.msg, `tesseract <img> - -l <langs>` (install the
  language packs), ffmpeg scene-change frames for GIFs.
- One slow screenshot crashed a whole multi-project scan and LOST every result: per-file timeouts, one process per
  project, results written per file (atomic tmp+mv — release and purge read the scan files concurrently).
- A regex that runs inside C cannot be interrupted by a Python alarm: decode first (URL-encoding, base64 blanking), and
  run each file's match in a worker process that is killed after 120 s and fails CLOSED (not checkable = held) — a
  SIGALRM in the same process cannot interrupt a regex running in C.
- State in the report what no scan can see: faces in photos, files with no extractable text, and any embedded image
  your scanner does not extract (below).

Performance that mattered:
- Cache extracted text per file by the sha256 of its BYTES, separately per extraction pass (the run keyed
  by `sha1(space|item|name|url|size)` — metadata: a replaced same-size file would reuse stale text). A
  matcher change then re-checks tens of thousands of files in minutes instead of hours.
- Process pool for OCR and matching (pure-Python regex under the GIL kept 6 threads on ONE core); one pool for all
  batches (a new pool per batch made the slowest file gate each batch). On macOS forked children need
  `OBJC_DISABLE_INITIALIZE_FORK_SAFETY=YES`, and forked children doing HTTPS died — download in threads, match in
  processes. Verify the parallel output is identical to the serial one on a small project first.
- Chunk huge texts (1 MB pieces, overlapping ~400 characters so a name on a boundary is not split) and match pieces in
  parallel; a 155 MB-text zip took 20 minutes before chunking, 3 after, identical results.
- Cache match RESULTS by (text hash, matcher fingerprint) too, so a post-freeze rebuild only matches changed files.
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

**OCR variants read DIFFERENT text — run them as a UNION, then judge hits on the pixels.** Tiny UI text in screenshots
(a name in a taskbar) was only read after a 2-3× upscale, so a scanner was switched to upscale-only. Measured afterwards
on the real files: the native-resolution page render still produced tokens the upscale did not. In the measured cases
those tokens were OCR artefacts — a context-menu item read as a first name, an Explorer breadcrumb read as a
profile-folder name — and an earlier eye review, reading the OCR LINE instead of the image, had accepted both as real
and held two manuals for nothing. Two rules follow: run native + upscaled + inverted (+ dark crops + bands for images)
as a union, with a test per real case so dropping a variant fails loudly; and give every eye verdict on a crop of the
pixels at the place the scanner reports, never on the OCR text.

Precision you should expect: roughly a quarter of hits carry a full name or e-mail; the rest are lone first names or
surnames, some false (a word in another script in a bookmark bar read as a first name). Over-held images are fidelity loss only;
they can be released after a look.

Before trusting a HIT, print ~120 characters of context around it: the font name "Times New Roman" ("Roman") and a
first-name token inside a JWT claim URL held several diagrams for nothing.

**Eye review is a pass, not a fallback.** Every image of a small set (late releases, the items copied with new keys,
archived pages) was looked at by a human/vision check: it caught names OCR missed in dark bars, a face photo of an
unnamed meeting participant, a bookmark-bar surname, pentest-report authors, and a script with a plaintext OAuth
client secret and password that the secret rules missed. Use contact sheets (thumbnails in a grid) to make it fast.
Eye verdicts go in their OWN verdict file that no rescan rewrites; an eye review can HOLD anything, and can clear a
specific scan's false positive only through an explicit eye-clear record (`templates/attachment_verdicts.py`): it
names ONE scan file exactly (a substring tag such as "conf" once matched every Confluence scan and cleared a SECRET)
and clears only a `HIT`, never `SECRET` / not checkable / download-failed.

## Screenshots inside documents: "office text clean" is NOT clean

Field note: the scanner read office documents' text and XML attributes only, and OCR'd a PDF only when it had no text
layer. Screenshots EMBEDDED in docx/pptx/xlsx and in text-layer PDFs were therefore never read. User manuals whose text
hits had been reviewed by hand and released turned out to show non-movers' names in their screenshots (user lists,
"logged in as" bars) — they had to be deleted from the target and purged from the trash.

- Office files are zips: extract `word/media/*`, `ppt/media/*`, `xl/media/*` and OCR every image like any other image
  (plain + light-on-dark passes, doc above).
- PDFs: render EVERY page (`pdftoppm -r 150 -png`) and OCR each page normal AND inverted — whether or not the PDF has a
  text layer; the text layer never contains the pixels of an embedded screenshot.
- EMF/WMF images (common in older Office files) are not readable by Tesseract. Treating them as "unreadable" held
  whole manuals whose EMF carried nothing but a font name. Parse the records instead: the drawn text sits in UTF-16
  text records (a strings pass with UTF-16 runs reads it; strip font-face names and their truncations first), and
  every bitmap record (EMF `STRETCHDIBITS`/`SETDIBITSTODEVICE`, `BITBLT`/`STRETCHBLT` with a bitmap, WMF DIB records)
  is a DIB you can wrap in a BMP header and OCR like any image. Anything you cannot decode stays not checkable
  (`templates/att_gate.py` does this).
- Also recurse into what an Office file EMBEDS (`*/embeddings/*`: OLE objects, embedded workbooks) and into e-mail
  (`.eml`) attachments — a text extractor that blanks long base64 runs skips them silently.
- Until a document's embedded images are OCR'd its verdict is NOT clean (not checkable = held), whatever its text says.
- When the rule changes, RE-SCAN everything already released under the old rule — the releases were the exposure.

## Name-SHAPE scan over attachment text

The matcher knows only accounts + curated lists, so a person WITHOUT an account inside attachment text (OCR, PDF/Office
text, author metadata) is invisible to it. Run the independent shape scan (doc 08) over every extracted text of every
file ON the target too:
- map each target attachment back to its source file and cache key (same name or scrubbed name; same size preferred)
- candidates = first-name-list + capitalised word pairs, `Surname, First`; drop movers (token rule), your own accounts,
  placeholders, already-reviewed strings
- every candidate string reviewed by eye with context: person / not a person + why (UI labels, OCR noise from binary
  streams, product and place names, generator demo names, public OSS/paper authors are not-person)
- Field note: ~1,800 candidate strings → a few dozen real non-movers in roughly fifty attachments (screenshot user lists, chat profiles,
  document metadata, change tables, an IDE author annotation) → deleted. Regex trap: an alternation of ~1k first names
  inside a lookahead at every position ran >11 minutes; pair regexes + a set lookup did it in 30 s.
- Not covered by a pair scan: lone surnames/first names ("Dr. X", "Greetings, Y"). State it.

## One verdict per file: held wins

Over time you will have several scan files per project (first pass, light-on-dark, band, shape, eye, hidden items,
late release). `templates/attachment_verdicts.py` merges them:

- Key = `(kind, space/project, SOURCE item key, file name)`. Items copied with a new key carry `source_item` so they
  key by the source; a scan record WITHOUT it forms a second key nobody asks about — pass the new-key map log
  (`--item-map`) so such records fold onto the source key.
- **HELD WINS**: any non-clean record from any scan holds the file, even if another record says clean.
- **RELEASE override** applies to exactly the `(kind, space, item, file)` pair a transformation produced and uploaded
  (scrubbed diagram, rebuilt archive, regenerated preview), recorded with the uploaded sha256. It means "the bytes on the
  TARGET are clean", not "the source original is clean" — the copy/release scripts must never re-upload the source
  original of such a pair. A release covers only holds from scans that ran BEFORE it: a later pass (light-on-dark,
  band, eye) that holds the file wins again. Write `scanned_at` / `released_at` into the records; file mtimes reset
  when files are copied.
- **Eye-cleared false positives** must be honoured by every consumer: a band-scan file recorded every hit as HIT
  including the ones a human cleared; a "held reconcile" would have deleted clean files.
- Every consumer of "clean" goes through the merger. Grep your scripts for direct `status == "clean"` checks. Field
  note: a draw.io re-pointing step read only the first-pass scan (no held-wins) and its `--apply` would have uploaded
  files the light-on-dark pass had held.
- Report disagreements: ~100 files read "clean" in a scan file that had been rewritten after the copy while the held
  list said held. Held won; the cause of the rewrite was investigated separately.

## One gate, called by every upload path

The scanner is not the gate; the gate is the last function the BYTES pass before the PUT/POST. Field notes from one
run: the screenshot lens existed in one release script while four other upload scripts (late release, release of
later-cleared files, hidden items, page restores) kept their own idea of "clean"; the warning "don't reuse them until
the check is wired in" was a status note. Two later uploads then went out through exactly such paths:

- a **restore** of archives whose compiled binaries had been stripped (fail closed made the tools useless) checked the
  binaries' strings for NAMES only and put back the ORIGINAL archive — including a real private key that the earlier
  transform had removed;
- a **blurred** document was verified with the OCR lens that had missed the name in the first place; one page still
  showed a non-mover's e-mail in a white-on-blue "Sign in" row.

Rules:
- One function: `gate(name, bytes, context) -> clean | HIT | HELD_UNREADABLE | SECRET` + reasons + lines to blur
  (`templates/att_gate.py`): archives recursively, Office text + embedded images + embeddings, every PDF page and
  image, EMF/WMF, `data:` images, e-mail parts, metadata, file names and member paths, binary strings, user-profile
  paths, secrets, video/audio held. Your list matcher plugs in; the name-SHAPE lens is built in.
- Every upload script calls it right before the write — copy, release, late release, restore, replace, comment
  attachments, report CSVs. `templates/check_upload_paths.py` greps for attachment WRITE calls without the gate and
  exits 1; run it in preflight and as a ratchet test (today's offenders listed, any new one fails, delete a line when a
  script is fixed).
- Restores and transforms are uploads too: they go through the full gate, SECRET lens included.
- The gate judges BYTES. Verdict records keyed by (space, item, file) are bookkeeping; a name collision or a stale
  record cannot launder a file through a gate that reads the bytes.

## Compiled binaries inside archives

Removing every binary member as "unreadable" rebuilt tool archives as 1-4 KB shells; the owner reported "corrupted
files". Read binaries as text instead: ASCII and UTF-16 string runs, checked with the name lenses plus a
user-profile-path rule (`C:\Users\<name>`, `/home/<name>`; skip generic ones like Administrator, and OCR misspellings of
them). Expect open-source author credits compiled into libraries (zlib's copyright line naming its two authors, a
BoringSSL AES credit with a first name): allowlist the exact PHRASES, never the first names. Inside application jars,
the bundled dependency tree (`BOOT-INF/lib/*.jar`, `WEB-INF/lib`, `node_modules/`) carries public authors in
LICENSE/pom files: allow name findings there by PATH, while secrets and profile paths still count. A key-parsing class
carries `-----BEGIN PRIVATE KEY-----` as a constant: a secret needs the base64 body after the marker. Carve PNG/JPEG
resources out of binaries and OCR the larger ones; an unknown non-executable blob with near-random bytes
(compressed/encrypted payload) stays not checkable.

## Blur instead of hold (when the owner agrees)

Holding a whole manual for three names in its screenshots removed the team's documentation. With the data owner's
yes, blur and upload:
- per embedded image: OCR with word boxes (normal + inverted, upscaled), blur every LINE that carries a hit — blurring
  only the flagged token left the surname next to a blurred first name; for PDFs also redact on the rendered page;
- verify the OUTPUT with the full gate (every lens, not only the one that found the hit), then look at every changed
  image; blur whole dialogs when a line is not enough;
- replace a leaky file by DELETE + purge + upload of the blurred bytes, never as a new version (old versions stay
  downloadable);
- when a fragment survives several passes (a short Cyrillic name fragment, a first name), keep that file out and say
  so — the Word version of the same manual may be enough.

## Allowlists are data; eye verdicts are per file hash

Fail-closed matching over-holds: ordinary words in other languages ("raza", "lies"), OCR fragments of UI words cut to a
name stem, texture noise in a photo matching the local part of someone's e-mail, functional mailboxes printed in
manuals, an org-unit label used as document author, font names, product and company names. Keep each class as DATA with
a reason and a source (noise tokens with a scope — OCR only or everywhere —, functional mailboxes exact or by domain
suffix, OSS credit phrases, dependency paths, product/font names). Never allowlist a lone first name, nor a token that
could be the fragment of a real person: give that FILE an eye verdict instead, stored by sha256 of its bytes with the
reason; an eye verdict never clears a SECRET. The name-SHAPE lens is noisy on UI screenshots and photos by design: a
shape-only finding means "a human looks", not "held forever".

## Test the gate with the real cases

Every privacy gap in the run was found by looking at real content, never by a scanner designed for it. So the gate's
regression suite is built from the REAL files (referenced by path on the private machine, never copied): each file
that leaked must stay non-clean with the named person in the reasons (recall); each file a human cleared must come
back clean, and switching off the one allowlist entry it relies on must flip it (proving the lens read the content and
the entry is the only reason it passes); one synthetic test per lens (nested archive, data: image in a diagram, EMF
bitmap, e-mail attachment, dependency path vs the same text outside it, depth limit, video, random blob, matcher
timeout and gate exception fail closed). Run it before any lens change. The suite of one run caught, on its first
day, a leaked e-mail in an already-uploaded blurred PDF and a private key in an already-restored archive.

## A list change invalidates verdicts

Attachment verdicts built with the OLD keep list counted files naming newly anonymised people as clean. Grep the local
extracted-text cache for the new terms (tens of thousands of small JSON files: `grep -r -l -a`; a shell glob hits
"argument list too long"), rebuild the evidence with the new list, then purge every non-passing file from the target.

## Verdict flips need a release step

When a re-scan (new matcher) flips a held file to clean, nothing uploads it — every release step had already run.
Field note: a final review found over a hundred "clean but missing" files; all had been held at copy time under the older
matcher, flipped clean later, and never released. Rule: any verdict flip to clean is followed by a release pass AND the
newer passes (light-on-dark, band, shape, eye) on the released files before upload.

## Transform instead of hold (release 2)

Two held classes carried little or no personal data a reader could see:

**draw.io diagrams** — often FALSE hits ("Times New Roman" → "Roman" in every label; a first name inside a URL claim) or
a first name in a label ("Ida's team"). And with the diagram held, its macro pointed at nothing. Transform:
decode → map fonts (`Times New Roman` → `serif`, renders the same) → scrub every string inside ONE document context →
never scrub graph refs (`id`, `parent`, `source`, `target`; a hit there = hold) → mask `data:` URIs and OCR each
embedded image → re-encode in the SAME format → verify: re-parse, cell count equal, the scanner's own extract+match
clean, detector 0 over every string, and the diagram RENDERS (draw.io desktop CLI: `drawio -x -f png`). Previews are
re-rendered from the scrubbed XML; an exported PNG with a name in the PIXELS stays held.

**Images embedded inside diagrams** were never read: the scanner blanked long base64 runs, so `data:` URI images in
draw.io XML were skipped. Any "blank long base64" optimisation must first decode embedded media; post-hoc, a few hundred live
diagrams held about a hundred embedded images, a handful flagged, none showing a person by eye.

**Archives** — held fail-closed as not checkable (the scanner never opened 7z/tar, or one unreadable member held a
whole zip). Transform: unpack, check every member; all clean → upload the ORIGINAL unchanged; else REBUILD in the same
format with hit text scrubbed (re-verified), everything else removed, and a `_REMOVED_IN_MIGRATION.txt` listing removed
paths; re-check the rebuilt archive from scratch. Still held: signed code packages, packages that would lose a file,
rar/cab that need a rebuild, encrypted archives, nothing checkable left, documents whose hit cannot be pinned to one
member, archives above an unpack cap (2 GB here; a 3 GB zip stayed held). Found real people this way that every
other pass missed: PDF author metadata inside a zip, a change table in a
7z, an engineer's name in a code comment, an `.env` file in a tarball (removed).

Sort jobs smallest-first, write progress as you go (resume), and expect a long tail: the largest archives took ~95
minutes each to match and the second pass ran for a day after the main migration. Lower the job's priority (`nice`)
so it does not starve the copy.

## Deleting held files that reached the target

- Jira: `DELETE /rest/api/3/attachment/{id}` — no trash. Gate every delete on: target item carries your marker label,
  project on the silent scheme (read back), name/size/sha256 match the source file you mean.
- Confluence: `DELETE` of a page/attachment only moves it to the **space trash** (still readable there). Purge:
  ```
  DELETE /wiki/api/v2/attachments/{id}                     # 1. moves it to the trash
  DELETE /wiki/api/v2/attachments/{id}?purge=true          # 2. purge: works ONLY on a trashed attachment; trashed ones via
  GET    /wiki/api/v2/pages/{id}/attachments?status=trashed
  DELETE /wiki/api/v2/pages/{id}?purge=true                 # purge a page that is already in the trash
  ```
  In the run both calls answered 200, and the read-back (the page's attachments, current AND `status=trashed`) came
  back empty — that read-back, not the status codes, is the proof. Delete ALL versions of an attachment. Read back
  each delete; v2 read-back is eventually consistent (one read
  "current" right after the purge and 404 a minute later — retry the read 6×5 s).
- Record every deletion (target item, scrubbed file name, attachment id, reason) with no names in the record.
- Verify independently: re-read every deleted id → 404, with a positive control (a still-present attachment → 200 via
  the same endpoint).

## Keep the evidence out of your repo

Name lists, extracted texts, package files, scan results and snapshots are personal data. Keep them in a gitignored
state directory, purge them (dry-run default script) within an agreed time after sign-off, and rewrite history if a
list was ever committed. Run `scripts/leak-scan.sh` with your denylist over anything you publish.
