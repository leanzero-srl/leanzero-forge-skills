# Track 2: the run on one screen and the golden rules

Moved verbatim from SKILL.md on 2026-10-30 (skills audit); lines 430-467 of the old file. Read by section; the CORE card in SKILL.md wins on conflict.
Part of Track 2 (Cloud-to-Cloud copy, `cloud-to-cloud/`). Backtick paths below are relative to the skill root (~/.claude/skills/atlassian-migration/); markdown links were re-pointed (`../`) so they resolve from references/.

### The run, on one screen

```
0  decisions + approvals written down (files the scripts check)      cloud-to-cloud/docs/15
1  preflight: inventory, keys/names free, required fields, seats     cloud-to-cloud/docs/02
2  source freeze (read-only scheme COPIES, never edit originals)     cloud-to-cloud/docs/14
3  guard-dog BASELINE of target config (before the first write)      cloud-to-cloud/docs/13
4  target config: own per-project schemes, globals only if missing   cloud-to-cloud/docs/02, 07
5  silence: notification schemes, autowatch, JSM customer notif,
   automation that can fire on the new projects                      cloud-to-cloud/docs/03
6  load: Confluence spaces ‖ Jira chains (2 per account), ordered    cloud-to-cloud/docs/04, 11
7  post passes: cross-project links, attachment release, late
   sub-tasks, lost parents, request types, people, URLs, boards,
   sprints, fillers, worklog dedupe                                  cloud-to-cloud/docs/04-07, 11
8  verify + compare + leak hunt + adversarial final review           cloud-to-cloud/docs/13
9  notifications back (restore + read back), JSM customer notif on   cloud-to-cloud/docs/03
10 report to the right audience; decision log with reverts           cloud-to-cloud/docs/15
```

### Golden rules (each one cost real time)

1. **Never edit a pre-existing object on the target.** Create your own `<KEY>: …` schemes/screens/workflows; reuse a
   global status/type by NAME only if it exists; create globals only with written approval. `POST /rest/api/3/workflows/create`
   **upserts** an existing global status you list — send its current description or it is wiped.
2. **Silence is a read-back, not a PUT.** Prove the silent scheme has zero recipients, assign, re-read until it shows.
   Scheme writes have been observed to apply late; a crash must not lose the remembered originals (save per project).
3. **A 0, a 404 or "not found" authorises nothing until proven on the same object.** Search-hidden items, deactivated
   users hidden from user search, Forge apps that 404 on the Connect probe, CQL missing attachments — all real.
4. **Never blind-retry a write.** A POST that timed out may have created the item: look for your marker label at the
   expected key before posting again. Retry 5xx only for GET; 429 is always safe to resend.
5. **The verifier must not share the copier's blind spot.** Same matcher on both sides proves nothing about people the
   matcher does not know; add an independent name-SHAPE scan and human review.
6. **Held wins.** Any non-clean verdict from any scan holds the file; a later "clean" re-scan needs its own release step.
7. **Edits leave history.** A Jira field edit keeps the old text in the History tab; only deleting the item removes it.
   Scrub must be final before the first write; Confluence old versions must be deleted explicitly.
8. **Every decision taken on the client's behalf goes in a log with its exact revert.** Ask the owner; log; move on.
9. **Kill by PID, wait on PIDs or files.** `pkill -f <pattern>` / `pgrep -f` match your own waiter and sibling subshells.
