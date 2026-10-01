# Decision log, approvals, and the report

## Approvals are files the scripts check

Every irreversible or client-visible step refuses to run without an approval file that records who said yes, where,
when, and their words:

```
approvals/client-yes.ok            "<name>, <channel> <time>: '<their words>' — create N projects with source keys + names"
approvals/schemes.ok               shared vs own config per project, confirmed
approvals/type-status-mapping.ok   the mapping table, confirmed
approvals/desk-globals.ok          the exact list of new global statuses/issue types
approvals/notif-silent.ok          the silent-scheme approach
approvals/automation-pause.ok      pausing / excluding named automation rules
approvals/keep-list.ok             KEEP list version + who signed it
approvals/report.ok                pre-load evidence report accepted
approvals/space-keys.ok            source→target space key map
approvals/source-readonly.ok       freeze approach + time
approvals/jsm-customer-notif-off.ok  written by the browser script ONLY when every desk read back all-off
```

A file written by a script after a read-back (the last one) is the strongest kind: it cannot exist unless the state is
true. Superseded approvals move to `approvals/superseded/` with a note — never deleted.

## The decision log: every decision taken on the owner's behalf, with its revert

During a live migration, decisions arrive faster than owners answer. The rule that worked, for decisions about the migrated data (a
change to pre-existing config on the owner's production site is ASKED first, never logged-and-done): take the reversible option,
log it as **open for review** with the exact revert, tell the owner, keep going. The log is published to the owners
with the report. Each entry:

```markdown
## D7 — <one-line decision>
- Scope: what exactly, how many (measured), which projects/spaces
- Confirm with: <role/person who owns this>  — status: open | confirmed <date> | reverted <date>
- Why: the reason this option, and the alternative left open
- Done: when, by which script, result counts, anything NOT done and why
- Records: files holding every touched id with before/after values
- Revert: the exact command or REST calls, preconditions (e.g. "projects on the silent scheme first, read back")
```

Decisions that were taken this way in the field run (anonymised), as examples of what deserves an entry:

| Decision | Revert |
|---|---|
| Source fields with no target home appended to the description (marked section), not new fields on shared screens | rollback strips exactly the marked section (backups of every before-description) |
| Movers made assignable via a GROUP in the projects' member role (admin: groups only); individual actors removed | remove the group from the roles; re-add recorded actors |
| Items the source search could not list copied with NEW numbers | delete those keys (map log) |
| Missing link types → Relates | delete the recorded link ids |
| Priorities missing on the target mapped (e.g. Critical → Highest, Trivial → Lowest); empty left empty | PUT recorded old values |
| Sprints of deleted source boards recreated on the nearest migrated board | delete the recorded sprint ids (items fall back to backlog) |
| A board filter rewritten (types mapped, a non-migrated type dropped) | PUT the recorded JQL |
| Invited movers' accounts claimed as managed (specific accounts only) | unclaim with the same CSV, with the org admin |
| Archived source pages migrated as archived pages | delete the recorded page ids + purge |
| Reviewer test edits removed | restore the saved bodies |
| Whiteboards carried as image pages | delete the 2 pages |
| Resolution "Done" set on closed desk tickets that had none | set back to empty (recorded keys) |
| A new desk queue for an agent | delete the queue |
| Space admins via a group | delete the recorded permissions + group |
| Inactive users suspended to free seats (owner's rule) | restore access per recorded id |
| Icons uploaded for the issue types the migration created | PUT the old avatar id |

Write the decision BEFORE or WHILE doing it, not after; a decision you cannot write a revert for is a decision you
should not take on someone else's behalf.

## Asking the owner

- Research first so the question is answerable in one line: measured options, volumes, what each changes. "Which do
  you want: A (fields on your screens, config change) or B (text in the description, no config change)? 12k items."
- Ask the owner of THAT system — the target config owner for config, the org admin for accounts/licences, the source
  owner for scope/privacy/fidelity. Do not route their decision through someone else.
- Record the answer verbatim in the approval file or decision entry.

## Communicating while it runs

- Separate "done" from "queued" and "dropped" in every status line, and name the binding constraint (rate budget, a
  per-user app limit, a gate) and the knob that controls it.
- Estimates were repeatedly too optimistic (the start happened hours after the announced time; the post-load phase
  ended hours late). Each late matcher round and each hung scan cost an unannounced hour. Freeze the anonymiser and
  evidence well before go, budget a full rebuild per round, and state each delay's cost when it happens.
- When a report cannot wait for every number, publish with explicit "check running (X of Y)" placeholders and update in
  place, rather than slipping the whole page.
- Don't park work on the client that you can do yourself: sort open items into ours and genuinely theirs.
- Drafts that may be forwarded must be client-ready: an internal status naming people was once forwarded as-is.
- Report migrated counts from the TARGET's own API, split by category — never from the run log alone.
- Never publish content built from an admin-only scan to people who could not see that data with a normal account.

## The pre-load evidence report (for the source owner)

Promised before the load, published before the first production write:
- scope (projects/spaces, counts), the KEEP list version, what is anonymised and how
- what is lost by design (doc 01), what stays on the source
- samples from the REAL loader output (scrubbed), diverse, word-aligned before/after
- residual = 0 from the same matcher fingerprint; the independent scan's reviewed candidates
- attachment figures: clean / held (person) / held (not checkable) — and how a held file can be released
- reviewed adversarially (two lenses: facts vs code/data, and reader + privacy) before publishing — the first review
  found a dozen real defects, the second as many. Review it against the CODE that runs, not the design notes: three
  claims were false about what the code did ("exactly that package is written" — the loader re-reads the live source;
  "counted against the source" — no such count existed; archives checked by member names only).
- labels must say what was measured: "found", not "checked", when part could not be checked; "to be copied", not
  "copied", before the load; say which fields the pre-load check covered (it scanned summary, description, comments
  and attachment names — everything else was checked only on the target after the load)
- one definition per number (two different figures for "names without an account" sat in one draft); scope-mixing is
  the commonest defect — state the measured base next to every number ("on the projects we can see" vs "on every project in scope")
- every sentence traces to a measurement; every loss item carries a number; an explicit "not measured yet" list closes
  the section
- after any scope change, drop out-of-scope rows from the page AND the CSVs AND the sample table, and pin the numbers to
  the evidence fingerprint and the KEEP-list version they were built with

## The post-migration report

- Restricted to its audience: put the restriction IN the create call (v1 `POST /wiki/rest/api/content` with
  `restrictions` read + update for the named people) so there is no window in which space watchers see it. Verify with
  `GET /wiki/rest/api/content/{id}/restriction` and `POST /wiki/rest/api/content/{id}/permission/check` — the owner can
  read; another member of the reviewers' group cannot, with a positive control (that member CAN read the parent page).
- Every number has a source (a records file, a query); re-collect right before publishing — repairs kept landing after
  each read.
- Attachment truth: every source scan record vs a direct per-page / per-item listing of the target (CQL misses
  files); a reason per missing file; "unexplained" must be 0.
- File names and titles in the report are withheld (`(file name not shown).ext`) for any person/secret reason.
  Field note: the report's own adversarial review found account ids hidden in base64 macro definitions, a file name
  with a first name in camelCase, key-store file names, vulnerability report titles — all withheld.
- Check: detector 0 with the current KEEP list AND with an empty KEEP list (nobody kept) — a greeting to the
  addressee tripped it.
- Watch over-claims: "only you can open this" is false (admins can recover restricted pages) → "restricted to";
  "keys and ids only" was false (CSVs carried titles).
- Never edit the owner's OWN check pages; add your report as a separate page or a dated addendum.
- Reports hold counts and keys only, never names: a skip says how MANY words failed, not which; leaked words go to a
  scratch file outside the repo.
- Wording for a mixed audience: one audience per page; do not address the owner as "you" on a page for everyone;
  explain the placeholder once; do not name internal tools or agents; times in the READER's time zone (a reviewer caught
  a time in the operator's zone); "no active account" rather than "deactivated"; never "kept on the source" for a site
  that is about to go offline.
- A "why is X missing" section that answered most post-go-live questions: what moved (per project/space, incl. items
  with new numbers, old → new), files not on the target per reason (held before copy: person / unreadable / secret;
  removed after load by later passes; released later), other known differences (history caveat, sprint completion
  date, fields without a target home, sub-types downgraded, people fields, whiteboards, link types mapped).

## After sign-off

- Delete rehearsal copies (projects, spaces) and purge both products' trash.
- Purge local data (snapshots, packages, name lists, extracted texts) within the agreed time; dry-run default; rewrite
  history if any list was ever committed.
- Hand over: the decision log, the report, the records files, and the list of open decisions with their owners.
