# Identity and text privacy: the KEEP list and the scrubber

The requirement, as the source owner stated it: names of people who are NOT moving to the target organisation must not
appear anywhere in the migrated data — creator, reporter, assignee, any user field, comments, inline comments, page
text, file names, history.

## The model

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
3. **Other spellings / scripts** — Cyrillic names (transliterated stems + case endings + nicknames), names next to a
   placeholder in another spelling.
4. **The KEEP list weakened coverage**: the loader skipped any deny token that a mover shares (a first name that also belongs to a
   mover) → "Surname, <that first name>" of a NON-mover survived because nothing next to it was replaced. Fix: never skip shared
   tokens; protect movers by masking their FULL names before scrubbing. Consequence to state: a first name or surname
   standing ALONE is replaced even when it belongs to a mover.
5. **Greetings** — any known first name right after Hi/Hello/Dear/Thanks/Hallo… is replaced; hyphenated names whole.
6. **ALL CAPS** — curated surnames in capitals ("JOHN DOE DOE" style headers).
7. **Org-unit pattern** — Outlook-style `Surname, First (ORG UNIT)` of non-movers; movers protected; country codes
   excluded.
8. **E-mail forms** — `first.last@`, `initial.surname@`, addresses split across link text/href, a trailing-address rule
   applied before names, and again after absorption.
9. **Same-document rule** — a non-mover whose FULL name appears anywhere in an item/page loses their lone first name
   everywhere in that item/page (signature lines, "Thanks, X", user tables). The copy scrubbed text node by text node,
   so no single call ever saw both — scrub with the WHOLE document as context (thread-local; a shared list mixed eight
   workers' documents in the first attempt).

Implementation notes that cost a round each:
- `re.sub` does not rescan its own output: "Anna Anna Smith" left one "Anna" → loop to a fixpoint.
- Match overlapping pairs (lookahead) on decoded strings: "When John Doe" and "\nJane" hid names.
- Ambiguous first names that are English words or tags (Mark, Till, Hill, Frank, Roman…) are case-sensitive; the
  storage tag `ac:adf-mark` matched "Mark" → scrub text and attribute VALUES only, never tag names.
- Cyrillic stems matched case-insensitively replaced ordinary Russian words ("в 2 раза", "машина") — over-scrub found
  only by reading real samples. Cyrillic name stems match Capitalised only.
- Placeholder account ids (`unknown`, `unidentified`) and generic account names ("Service Team", "Former user") on the
  STOP list, or the scrubber rewrites a company or product word in prose.
- A pathological regex: a 3 MB base64 "text" attachment made the e-mail regex backtrack for 20+ minutes per 1 MB
  piece. Blank base64 runs (≥200 chars) before matching; give every match a timeout that fails CLOSED (held). A C-level
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

## The history caveat (say it before the load)

- **Jira**: editing a field keeps the OLD text in the item's History tab, visible to anyone who can browse it. Only
  deleting the item removes it — and the ordered copy can never reuse that number. Ask the owner per item: delete
  (number lost) or edit (history keeps it). Comment edits keep no user-visible old text; delete + re-post is cleaner.
- **Confluence**: a page update keeps the old version. Delete versions explicitly:
  `DELETE /wiki/rest/api/content/{id}/version/{n}` (versions renumber after each delete — delete `1` while more than
  one exists; a 409 right after the PUT is transient, retry). One of two admin accounts got 400 "not authorized" on
  version delete — find out which account can before you need it. Then purge the trash.
- This is why the scrub must be FINAL before the first production write.

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
