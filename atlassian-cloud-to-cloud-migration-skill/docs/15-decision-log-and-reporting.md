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

During a live migration, decisions arrive faster than owners answer. The rule that worked: take the reversible option,
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
| Priorities missing on the target mapped (Blocker → Highest, Minor → Low); empty left empty | PUT recorded old values |
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

## The pre-load evidence report (for the source owner)

Promised before the load, published before the first production write:
- scope (projects/spaces, counts), the KEEP list version, what is anonymised and how
- what is lost by design (doc 01), what stays on the source
- samples from the REAL loader output (scrubbed), diverse, word-aligned before/after
- residual = 0 from the same matcher fingerprint; the independent scan's reviewed candidates
- attachment figures: clean / held (person) / held (not checkable) — and how a held file can be released
- reviewed adversarially (two lenses: facts vs code/data, and reader + privacy) before publishing — the first review
  found a dozen real defects, the second as many

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

## After sign-off

- Delete rehearsal copies (projects, spaces) and purge both products' trash.
- Purge local data (snapshots, packages, name lists, extracted texts) within the agreed time; dry-run default; rewrite
  history if any list was ever committed.
- Hand over: the decision log, the report, the records files, and the list of open decisions with their owners.
