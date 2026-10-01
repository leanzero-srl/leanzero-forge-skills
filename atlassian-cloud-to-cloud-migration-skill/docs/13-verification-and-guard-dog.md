# Verification, the guard dog, and the final review

> A green number is not a passing test. Every "0 mismatches" below was, at some point, wrong — because the check
> shared a blind spot with the thing it checked, compared the wrong property, or ran over a smaller population than
> claimed.

## 1. Per-project compare (source vs target, every item)

For every mapped pair (source key → target key), compare:

| Property | How | Trap it caught / false alarm it caused |
|---|---|---|
| Exists | every source key (by KEY RANGE, doc 06) has a target | count via the same blind index agreed with the copy |
| Type | target type == mapping(source type) | — |
| Status | target NAME == agreed name (mapping); `status_name_only` when both closed | comparing CATEGORY flagged every correct desk item (and the auto-fixer then moved them) |
| Resolution | mapped by name | transitions that could not carry a resolution wrote the post-function default |
| Priority | mapped by name | missing target priority → silent default |
| Summary/description | scrubbed source == target (or contains origin note) | template description stored instead of text |
| Comments | count + text in order, internal/public flag | 100-per-page cap: 156 vs 100 on one item |
| Worklogs | count, started, max(60,s) within 60 s | dedupe deleted legit worklogs |
| Attachments | target set == clean verdicts; held absent | "fewer attachments" is expected (held) — compare against VERDICTS |
| Components / versions | SCRUBBED and case-insensitive | raw compare flagged a scrubbed version name on every item that had it |
| Links | (pair, type, DIRECTION) triples | per-item counts cannot see an inversion |
| Parent | mapped parent, or Parent-Child link where the hierarchy refused | lost parents were silent |
| Sprints | per source sprint: item count equal | dead-board sprints never copied |
| Labels | source labels minus dropped (person, spaces) + markers | — |
| Request type (desks) | name + issue type | — |

Run it 5-8 ways parallel by project; verification was CPU-bound and took longer than expected (a full changelog scan
of the target per item). Decouple: the compare that gates the notification restore must be the fast one; deep leak
verification can continue in the background.

A parallel runner once failed silently on "argument list too long" and wrote a false DONE line. Every runner must
check its children's exit codes and count its outputs.

## 2. Side-by-side spot checks by a second pair of eyes

Every 30 minutes during the load, a separate reviewer (human or agent with read-only access) picked 5 random migrated
items and 2 pages and compared them field by field with the source: number, type, status, comments (count, headers,
internal flag), attachments, watchers (only migration accounts), mentions (none), origin note, names (none outside the
KEEP list). This found things no script was looking for (lone first names in signatures — doc 08 round 9).

## 3. Leak hunt: structural and text

- **Structural**: walk every key/value of sampled items/pages on the TARGET: user objects (assignee, reporter, creator,
  author, watchers, voters, user pickers), accountIds inside strings, ADF mention nodes, e-mail addresses, employee
  IDs, `/people/` and `ri:account-id` links, changelog entries, page restrictions, versions. Positive control: run it on
  a SOURCE sample, where every class must light up.
- **Text**: the scrubber's detector over target text; JQL/CQL per deny term over your projects/spaces.
- **Independent shape scan** (doc 08): because the detector shares the matcher's lists, it cannot see people the lists
  do not know. A clean detector run after the load said nothing about those.
- Review flagged items by hand. Field note: the final "leak hunt flagged" list contained 0 real leaks — mover reporters,
  a known history caveat, a KEEP person's first name, a product name — but each one had to be READ to know that.
- The migration account itself appears as comment AUTHOR object on every comment it posted. A check that counts user
  objects will "find" it on every item: exclude your own accounts explicitly (and prove that exclusion is the only
  difference by re-running the sample without author objects).

## 4. The guard dog (watchdog with HALT)

A read-only process that ticks every 5 minutes for the whole run and HALTS it on a red-line violation. It never
repairs anything.

| Check | Red line | Evidence | Action |
|---|---|---|---|
| T1 target config drift | pre-existing config changed by OUR accounts | baseline snapshot of every permission/notification/workflow/issue-type/screen/field-config scheme, screens (tabs+fields), workflows (statuses+transitions), statuses, issue types, resolutions, priorities, fields, projects (+schemes, components, versions), automation rules, spaces (+permissions) — hash name AND description; Jira audit log for WHO changed it | VIOLATION if ours, WARN if someone else |
| T2 writes outside scope | our accounts wrote outside our projects/spaces | audit records by our accounts on objects not ours; JQL `updatedBy(<our account>)` outside our projects; CQL `contributor = <our account>` outside our spaces | VIOLATION (update/delete), WARN (create) |
| T3 spam channel open | any loaded project not on the silent scheme, autowatch on, paused rule re-enabled, a non-ours watcher on new items, a mention node, desk items without the customer-notif gate file | read-backs | VIOLATION |
| T4 source written | our accounts modified anything on the source | JQL `updatedBy`, CQL `contributor` on the source (report pages allowed) | VIOLATION |
| T5 privacy | detector hit in the newest 30 items / 10 pages | detector | VIOLATION |
| T6 health | chains alive, logs advancing, alert lines, 429 storms, disk | process table, logs | WARN only |

**Baseline BEFORE the first write to the target** (before creating globals or projects); the baseline command refuses
to overwrite an existing baseline. Restart the watch with the SAME baseline after a halt. If the watch itself stops
ticking for >2 intervals, that is an alarm too.

HALT procedure: write an ALARM file + an alert line, SIGTERM then SIGKILL every migration process whose command line
carries THIS target URL followed by whitespace (matched by PID from `ps`, never `pkill -f` — and never matching a
sandbox URL that shares a prefix), resume paused automation, and stop. A human verifies by re-reading the object.

Prove the guard dog before trusting it: on a sandbox, a synthetic scheme change must trigger T1+T2, a foreign watcher
T3, a planted name T5, and HALT must kill a dummy run tree (including a process that ignores SIGTERM) while leaving
another site's process alive.

Lessons from building it:
- Attribution by bare key token is wrong: short keys (two letters) occur inside pre-existing names. "Ours" = the
  migration marker in the name, `<KEY>: ` / `<KEY>-<n>` / `<KEY> (` prefixes, or exactly one of our project names.
- Hash scheme descriptions too — a description change went unseen in the first proof.
- JQL/CQL dates are in the ACCOUNT's time zone (doc 06).
- `workflows/create` upserting shared statuses (doc 02) is exactly what T1 exists to catch.
- CQL index lag made T2 HALT once on attachments of our own new space; check the real space of the content before
  calling it "outside scope". Expect a few false HALTs; each one is a cheap reminder that it works.
- During a deliberately partial restore, tell T3 which projects are expected silent.
- A guard that halts on its own false positive at 05:30 costs a restart; run in report-only mode (`--no-halt`) once the
  load is stable if the false-positive rate is not zero, but keep ticking.

## 5. Final review (automated) + adversarial reviewer

At the end, a read-only script produces PASS/WARN/FAIL per check per project/space:

- R1 Jira: counts + highest key + no leftover fillers; full compare; desk compare; origin note + links (sample);
  boards/sprints; cross links
- R2 Confluence: page/blog counts, space names, homepage mapped; hierarchy; clean attachments present and held absent;
  draw.io re-pointed; origin note on top
- R3 privacy: leak hunt structural; 200 random items + 100 random pages through the detector; verify logs
- R4 guard-dog ticks reviewed
- R5 notification schemes restored (software = remembered scheme, desks = their scheme), automation resumed,
  scheduled-rule exclusions in place, JSM customer notifications back ON vs record, autowatch
- R6 source untouched: read-only schemes still assigned, write permissions 0, our accounts wrote nothing
- R7 test-management data == harvest
- R8 totals and time windows

Then an **adversarial reviewer** (a separate agent or person, read-only) re-verifies every FAIL/WARN and 10 random
PASS rows independently against both sites and hunts for what the script cannot see. Its findings in the field run,
all real, all fixed the same evening: ~8% of links inverted, ~2,000 items without their sprint (dead boards), hundreds
of priorities defaulted, ~230 resolutions overwritten by a post-function, ~150 links still pointing at the source, a
board filter simplified wrongly, three items outside every map log, ~130 clean attachments never released, ~60 source
files only on the source (comment attachments, archived pages).

Every FAIL is a real deviation until proven otherwise; every false alarm gets a code fix in the final review script so
the next run is quieter (e.g. comparing raw names where the scrubbed name was expected, comparing to old rehearsal
copies made before a fix).

## 6. Before you write "done"

- Enumerate what the target must contain (every field a user will see) and check each, on the real projects — not on
  the rehearsal site, not on one convenient project.
- State every number with its population and its control (doc 06).
- List what is known NOT to be covered (people without accounts in lone-name form, texts the scanners could not
  extract, history caveats, cosmetic buckets).
