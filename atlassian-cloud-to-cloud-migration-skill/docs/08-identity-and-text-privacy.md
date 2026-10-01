# Identity and text privacy: the KEEP list and the scrubber

The requirement, as the source owner stated it: names of people who are NOT moving to the target organisation must not
appear anywhere in the migrated data — creator, reporter, assignee, any user field, comments, inline comments, page
text, file names, history.

## The model

- **Ask for an ALLOW list (who moves), never a deny list (who does not).** A list of excluded people lets anyone
  missing from it slip through. Hand the owner a CSV of every person found (busiest first, counts per project/space,
  where seen) with a KEEP column; match on source accountId (e-mails are hidden by profile visibility). Expect it back
  as a spreadsheet with typos, a name in the e-mail column and missing addresses — parse defensively, never guess.
- **The people list is itself personal data.** Keep it on the SOURCE site, on a page marked as not-for-migration whose
  id is on the copier's exclude list, restricted to the owner. Link it in the page BODY (an attachment that was only
  attached, not linked, could not be found by the owner) and check the rendered page.

- **KEEP list** (allow): the people who move, signed off by the source owner, keyed by **source accountId**. Everything
  is default-DENY: anyone not on it becomes one neutral placeholder label, e.g. `Former member`.
- People have **several accounts** (one person had three). Merge accounts whose normalised display name is the same
  person into the KEEP entry, or keeping one of them still scrubs him.
- The KEEP list changes during the run. Version it (v1, v2…), keep backups, and know which content was written with
  which version (doc "re-scrub" below).
- The placeholder must never itself trip the detector, must never be read as an e-mail address, and must be
  idempotent (scrubbing scrubbed text changes nothing).

## What gets scrubbed, and where names hide

| Where | How |
|---|---|
| User fields (reporter, assignee, user pickers) | KEEP person with a target account → set; else migration account / empty + "Original reporter: <name or placeholder>" in text |
| ADF `mention` nodes | → plain text `@Name` (KEEP) or `@Former member` — also kills the notification |
| Confluence `<ac:link><ri:user …/>` (mentions, task assignees) | → plain text; a bare `ri:user` (profile macro) kept only for movers |
| Comment / worklog author | header line with name or placeholder |
| Summary, description, comments, worklog comments, custom text fields, labels, option values | text scrub |
| Component, version, sprint, board, filter names; sprint goals | text scrub (these are content too) |
| Attachment FILE names | text scrub; a name that cannot be cleaned → neutral `archive-<item>.<ext>` |
| Link marks / hrefs, media attrs, card URLs | scrub attribute values; a link whose URL names a person (`/people/…`, `first.last` profile slugs) → "[link removed]" |
| URL-encoded strings (`%20`, `+`) | decode, match, replace in encoded form (the link breaks — privacy wins) |
| E-mail addresses | personal (`first.last@`, `initial.surname@`, contains a known name) → removed whole; functional mailboxes (`support@`) kept |
| Employee/user IDs in text (company-specific formats) | regex → `id-removed` |
| Confluence CDATA link bodies, macro parameters, base64 macro definitions | scrub; account ids hid inside base64 `macro?definition=` strings |
| JSON escapes / HTML entities | decode first (JSON `\u00f6` escapes, HTML `&ouml;` entities) — `json.dumps` escaping hid non-ASCII names from the first matcher |

## How the matcher evolved (each round = a class of leak an independent check found)

1. **Accounts** — display names of all non-KEEP accounts that appear on the source, token-level (a misspelled surname
   still matched).
2. **No-account names** — people who never had an account but are named in text (signatures, e-mail threads). Harvest:
   known first name + capitalised surname next to a placeholder; a curated surname list; a 45k first-name list for the
   independent scan.
3. **Other spellings / scripts** — names in a non-Latin script (transliterated stems + case endings + nicknames), names next to a
   placeholder in another spelling.
4. **The KEEP list weakened coverage**: the loader skipped any deny token that a mover shares (a first name that also belongs to a
   mover) → "Surname, <that first name>" of a NON-mover survived because nothing next to it was replaced. Fix: never skip shared
   tokens; protect movers by masking their FULL names before scrubbing. Consequence to state: a first name or surname
   standing ALONE is replaced even when it belongs to a mover.
5. **Greetings** — any known first name right after Hi/Hello/Dear/Thanks… (and their equivalents in the content's languages) is replaced; hyphenated names whole.
6. **ALL CAPS** — curated surnames in capitals ("JOHN DOE DOE" style headers).
7. **Org-unit pattern** — directory-style display names that carry an org unit, for non-movers; movers protected; country codes
   excluded.
8. **E-mail forms** — `first.last@`, `initial.surname@`, addresses split across link text/href, a trailing-address rule
   applied before names, and again after absorption.
9. **Same-document rule** — a non-mover whose FULL name appears anywhere in an item/page loses their lone first name
   everywhere in that item/page (signature lines, "Thanks, X", user tables). The copy scrubbed text node by text node,
   so no single call ever saw both — scrub with the WHOLE document as context (thread-local; a shared list mixed eight
   workers' documents in the first attempt).

Implementation notes that cost a round each:
- STOP words: generic tokens of account names ("Team", "Service", "test", "user", "Former") produced ~900 false hits on
  ~100 items before they went on a stop list.
- Curated surname lists collect ordinary words (Database, Debian, Django, Requested, Friday, Dec, Feb, Nov…). One bad
  list turned "Dec-23" into "<placeholder>-23" hundreds of times; removing ~20 non-names cut one project's replacements by a
  quarter. A plural filter took a surname ending in -s for the plural of a first name. Probe the matcher with ordinary sentences, and keep
  standalone surnames distinctive (others pair-only, as "First Surname").
- Tokens shorter than 4 letters are never matched alone (two- and three-letter surnames): disclose it as a known limit
  rather than claiming "names in any form".
- Public authors (book/paper/library authors in text) are replaced too — disclose; org-unit codes next to a placeholder
  survive and can be quasi-identifiers (a small unit + a date can point at one person) — remove or disclose.
- Rule tests must use names that are on NO list, or a "greeting rule" test passes only because the name was listed.
  Prove every new test fails on a copy of the old matcher (it must bite), then make the suite a preflight gate.
- Writing a patch with Cyrillic literals through a shell heredoc raised a "Non-UTF-8 code" error and the patch silently
  did not apply — write patches to a file with a UTF-8 coding header.
- Detect and scrub must share ONE rule set: the Confluence path only scrubbed a segment when the detector found
  something, and the detector had no greeting rule, so "Hello <First>," survived on pages while Jira caught it.
- The detector must mask movers' kept names exactly like the scrubber, or the KEEP list makes residual counts jump
  (one project 0 → 320).
- Usernames in pasted user tables (logins like surname-prefix + digits) are not a matcher rule — dozens of them sat in one
  comment and were cleaned by hand, keeping the movers' logins.
- Windows user folders in build logs (`C:\Users\<NAME>~1`) and credential assignments in scripts are carriers too; add
  credential patterns to the secret check (a plaintext OAuth client secret slipped past the key-file rules).
- `re.sub` does not rescan its own output: "Anna Anna Smith" left one "Anna" → loop to a fixpoint.
- Match overlapping pairs (lookahead) on decoded strings: "When John Doe" and "\nJane" hid names.
- Ambiguous first names that are English words or tags (Mark, Till, Hill, Frank, Roman…) are case-sensitive; the
  storage tag `ac:adf-mark` matched "Mark" → scrub text and attribute VALUES only, never tag names.
- Name stems in another script, matched case-insensitively, replaced ordinary words of that language — over-scrub
  found only by reading real samples. Such stems match Capitalised only.
- Placeholder account ids (`unknown`, `unidentified`) and generic account names ("Service Team", "Former user") on the
  STOP list, or the scrubber rewrites a company or product word in prose.
- A pathological regex: a 3 MB base64 "text" attachment made the e-mail regex backtrack for 20+ minutes per 1 MB
  piece. Blank base64 runs (≥200 chars) before matching; give every match a wall-clock timeout enforced from OUTSIDE (a
  worker process that is killed), failing CLOSED (held). A C-level
  regex hang cannot be interrupted by a Python alarm — decode %-encoding first so pieces are not one giant token.

## False positives (over-scrub) — the keep-words list

Real examples of names-that-are-not-people: a release version named after a musician (its first name was on the deny
list, so the version became "0.12 Former member" on ~90 items), a component that is also a first name, a product
whose name is a surname, a font family ("Times New Roman" → "Roman" in every diagram label), a programming language
(Pascal, Julia), month abbreviations (Jan), "Max"/"Min" in UI tables, "NaN", a code fragment ("eva"), sample names in
templates. Keep a `keep_words` list, include it in the matcher fingerprint, and show the source owner the
over-scrub list — fidelity loss is a decision too.

Field note: a product name had been put on the curated surname list; a sandbox re-scrub ran with the matcher loaded
at start while the list was being fixed, and removed the product name from ~20 sandbox items. Rule: never run a bulk
re-scrub while the matcher is changing; check the regression tests and git log of the lists first.

## Evidence BEFORE the load ("package first")

Promise made to the source owner and kept: before any production write, a package of exactly what WOULD be written
(scrubbed text per item/page) and a report with samples and residuals.

- Build the package with the **same scrubber functions and the same matcher fingerprint** (hash of the code + every
  list) the copy uses; preflight refuses a stale package.
- Residual = what the detector still finds in the scrubbed package. Must be 0.
- **Independent name-shape scan** of the package (first name from a big list + capitalised word, both orders, pairs
  overlapping) → candidates reviewed by a human: name / not a name / mover. This is what finds round 2/3/6/9 classes;
  the detector cannot find what its own lists do not know.
- Filter movers by TOKEN membership, not only by full-name mask — movers appear as "Surname, First", "First M.
  Surname"; otherwise 500 mover strings bury the 5 real names.
- Samples in the report from the REAL loader output, not a POC.
- The report itself is reviewed adversarially; it must pass the detector with the current list AND with an empty KEEP
  list (nobody kept) — a greeting to the addressee tripped it once.

## Re-scrubbing content that was already written

When the KEEP list or the matcher changes mid-run:
- **Removing names that should not be there (a leak)**: find with JQL `text ~ "term" OR worklogComment ~ "term"` / CQL
  `text ~ "term"` per term over YOUR projects/spaces (positive control: the same query found them before cleaning), edit
  under the silent scheme with `notifyUsers=false`, re-search to 0, read the edited items directly (case-insensitive).
  Confluence: update the body, then DELETE every older version (below).
- **Restoring names that should now be KEPT (fidelity)**: a three-way merge per text unit — base = source scrubbed with
  the old list (what the copy wrote), theirs = source scrubbed with the new list, ours = target now. Apply a change only
  where the target still holds exactly the base tokens (so every later edit survives). Red line in code: every ADDED
  word must be a KEEP token, and the rewritten unit must not have more detector hits than before.
  Field note: applying a SUBSET of a word-level diff's operations corrupted 7 text segments ("<First> <Last> member"-style
  fragments, a duplicated mention) — ops of one diff are not independent. Fix: the placeholder is one token, only a
  REPLACE that removes a placeholder is applied, and every edit must project back to exactly what the old copy would
  have written. **Re-plan after every apply: a correct restore re-plans to zero changes.**
- Confluence comment ids are NOT monotonic (four comments posted in order got ids out of order). Pair target comments
  to source comments by CONTENT in created order, never by id order — pairing by id put a name on the wrong comment.
- Confluence normalises empty elements (`<ac:link></ac:link>` → `<ac:link />`): normalise both sides before diffing.
- Red-line gate per restored change: every ADDED word must be a name or e-mail token of a KEEP person (drop tokens of
  ≤2 characters such as particles and initials, but mask FULL keep names first so particles inside them count), the
  added text must give 0 detector hits, and the unit must not end with more hits than before. Do not write cosmetic
  diffs (a mover whose display name gained an org-unit suffix changes every mention): only apply ops where a placeholder
  disappears.
- Allowing a name can LEAK one: under the old list a non-mover sharing a token with a newly kept mover was removed only
  because that token was denied. Re-run a source-only scan (scrub every unit with old and new list, report every change
  that ADDS a non-KEEP word) whenever the allow list grows, and add the non-mover's FULL name to a deny-pairs list
  before the affected project copies.
- Which list did a running process load? Compare its start time (`ps -o lstart`) with the list file's mtime (a chain
  started 41 s after the write used the new list; earlier chains did not). Every derived artefact must be rebuilt on a
  list change: matcher fingerprint, evidence, the movers→target-account map (it still had the old count, so the
  reporter step missed the added people), attachment verdicts, leak scans.

## The history caveat (say it before the load)

- **Jira**: editing a field keeps the OLD text in the item's History tab, visible to anyone who can browse it. Only
  deleting the item removes it — and the ordered copy can never reuse that number. Ask the owner per item: delete
  (number lost) or edit (history keeps it). Comment edits keep no user-visible old text; delete + re-post is cleaner.
- **Confluence**: a page update keeps the old version. Delete versions explicitly:
  `DELETE /wiki/rest/api/content/{id}/version/{n}` (versions renumber after each delete — delete `1` while more than
  one exists; a 409 right after the PUT is transient, retry). One of two admin accounts got 400 "not authorized" on
  version delete — find out which account can before you need it. Then purge the trash.
- This is why the scrub must be FINAL before the first production write.

## Measuring a class of leak (method worth reusing)

For "lone first names of people without accounts": candidate first names (those recorded next to no-account surnames
+ non-mover account first names); count per name in scope (Jira `approximate-count` with `text ~ "X"`, Confluence
`/wiki/rest/api/search?limit=1&cql=…` → `totalSize`; `/content/search?limit=0` errors); positive control = the
placeholder count; run OLD and NEW matcher over every source document that holds a placeholder (only those can have
lost a full name) to get the exact set; then READ every hit of the small names in context (non-mover / mover / neither
/ attachment). For very common names look at the next-word distribution ("Mark" the verb, "Nan" = NaN, "Jan" = the
month, a first name that is also an everyday word in another
language). Batched JQL (`text ~ "a" OR text ~ "b" …`) was
validated against single-term queries before use. Interpret hit counts by DISTINCT term: a scan reporting thousands of hits
came from about ten terms, all movers or the migration account. Store full hit lists, not five examples.

## Your own records leak too

Run the detector over your decision records, state files and logs before committing anything: page titles with first
names, the owner's name and a reviewer's name were found in records. Keep files holding client titles or content out
of git, and never put a real name in code comments or commit messages (it stays in history).

## People without an account are invisible to an account-based matcher

The persistent blind spot: a person who never had an account on the source is unknown to every list derived from
accounts. They appear in e-mail signatures, pasted chat logs, user tables in screenshots, document change tables, PDF
author metadata. Only name-SHAPE scans with human review find them (and in images, doc 09). State this limit in the
report, with what was done about it.

## What the receiving side will ask

"Why do hundreds of tickets show 'Former member' as reporter/commenter?" — expect it from the first agents who open
the migrated desk. It is the intended anonymisation; the answer is ready in the report, and restoring names happens
only with the source owner's yes (the KEEP list is theirs). Also expect: "the reporter is the migration account" for
movers who had no target account at load time (doc 10 fixes those).
