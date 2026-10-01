# Decision log — <source site> → <target site> migration

> Decisions taken on the owners' behalf during the migration, OPEN FOR REVIEW. Each entry says what was decided, who
> should confirm it, why, what exactly was touched, where the records are, and the exact revert. Nothing here is final
> until its owner confirms it. Keep this file next to the run's records; publish it with the post-migration report.

Status values: `open` (taken, awaiting the owner) · `confirmed <date> by <role>` · `reverted <date>` · `superseded by Dn`

---

## D1 — <one-line decision, e.g. "Source fields with no target field appended to the description">

- **Status:** open
- **Confirm with:** <role / person who owns this system or data>
- **Scope (measured):** <N items in PROJ1, PROJ2 …; which fields; what was NOT touched and why>
- **Why this option:** <reason; the alternative that stays open, e.g. "option A = new fields on the shared screens is a
  config change on your production site and needs your yes">
- **Done:** <date/time, script + version, result counts, failures, items deliberately skipped>
- **Side effects:** <e.g. "each item's History shows one 'description changed' entry">
- **Records:** <files holding every touched id with before/after values — gitignored if they contain content>
- **Revert:** <exact command or REST calls, in order, with preconditions>
  ```
  <script> --rollback <record file> --apply        # precondition: project on the silent scheme, read back
  ```

## D2 — <next decision>

- **Status:** open
- **Confirm with:**
- **Scope (measured):**
- **Why this option:**
- **Done:**
- **Side effects:**
- **Records:**
- **Revert:**

---

### Checklist before adding an entry
- [ ] I can state exactly what it touches and how many (measured, not estimated)
- [ ] I can write the revert, and the records it needs exist BEFORE the change
- [ ] It does not change pre-existing config on someone's production site (if it does: ask first, do not log-and-go)
- [ ] The owner has been told (one line, answerable)
