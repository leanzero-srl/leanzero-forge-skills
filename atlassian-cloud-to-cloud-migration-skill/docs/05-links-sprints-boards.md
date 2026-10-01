# Issue links, boards, filters and sprints

## Issue link direction — the trap that inverted thousands of links

Field note: the per-project copy created intra-project links with `inwardIssue` and `outwardIssue` swapped. Every
"A blocks B" became "B blocks A". The per-item link COUNT was right, so compare-by-count passed; an adversarial final
review found it by comparing direction. ~8% of all links were directional and wrong; another ~1,100 "relates to"
links were technically inverted too (invisible, because both sides read "relates to"). It was repaired the same night
against the source, before the source went offline.

### The semantics, stated once

- In `GET /rest/api/3/issue/X?fields=issuelinks`, an entry that carries `"outwardIssue": Y` means
  **"X <type.outward> Y"** (e.g. "X blocks Y"). An entry carrying `"inwardIssue": Y` means "X <type.inward> Y"
  (e.g. "X is blocked by Y").
- `POST /rest/api/3/issueLink {"type":{"name":T}, "inwardIssue":{"key":X}, "outwardIssue":{"key":Y}}` was observed to
  render **"X <type.outward> Y"** on every site we used, and was re-verified on a test site for this skill
  (`inwardIssue=A, outwardIssue=B`, type Blocks → A shows `outwardIssue: B` = "A blocks B") — i.e. the issue you pass
  as `inwardIssue` is the one that HOLDS the outward description. Yes, that reads backwards. Do not trust this
  paragraph either:

### Prove it on one known pair before any bulk write

```
1. pick two scratch/migrated items A and B
2. POST /issueLink type=Blocks, inwardIssue=A, outwardIssue=B
3. GET /issue/A?fields=issuelinks  -> expect an entry with outwardIssue=B   ("A blocks B")
   GET /issue/B?fields=issuelinks  -> expect an entry with inwardIssue=A    ("B is blocked by A")
4. if not, swap your mapping; delete the probe link
```

`templates/link_copy.py probe A B --type Blocks` does exactly this and refuses to run the bulk copy until a probe result for that
link type is recorded. A link type with custom wording can read differently: one target type "Test" had its wording
the other way round from the source's ("tests / is tested by" vs "is tested by / is test for"), so four links carried
the right direction but READ backwards. Another target type with the source's wording existed — mapping the type
instead was the right fix (a decision for the config owner).

### Canonical triples

Compare and copy links as `(holder of the outward description, type name, other end)`:

```python
def triples(key, issuelinks):
    out = set()
    for l in issuelinks:
        t = l["type"]["name"]
        if "outwardIssue" in l: out.add((key, t, l["outwardIssue"]["key"]))
        if "inwardIssue"  in l: out.add((l["inwardIssue"]["key"], t, key))
    return out
```

Collect triples from BOTH ends of every migrated item on the source, map keys through the run map, and diff against
the target's triples:
- `ok` — present with the same direction
- `inverted` — `(b, t, a)` present instead of `(a, t, b)`: create the correct link, read back its id, THEN delete the
  wrong one (never delete without the correct twin present). Skip SYMMETRIC types (inward wording == outward
  wording, e.g. Relates): the inversion is invisible and a repair only churns link ids. Repair before users get
  access — a link a user added between two migrated items looks exactly like one you created
- `missing` — create
- `extra` on the target — leave alone unless you created it
- only links whose BOTH ends are migrated items are touched

Record every change (old link id → new link id) so the repair itself is revertible. Snapshot all source links to disk
first if the source is going away. Re-snapshot before each re-plan: a plan made from the pre-fix snapshot re-queued an
already-fixed pair (a delete answered 404 — treat a 404 on delete as done). Measured repair throughput: ~3,200 creates
and ~3,000 deletes in ~20 minutes on 8-16 threads under the shared rate budget.

**The final compare must compare links per (pair, type, DIRECTION).** A count per item cannot see an inversion.

## Link types the target does not have

Options: ask the target config owner to add the types, or map to an existing type. The decision taken: map missing
types (things like "Action item", "Mention", custom review types) to **Relates**, keep the source direction, and log
every created link id so the decision can be reverted if the types are added later. Never create link types on a
shared production site without the owner's yes.

Some sites carry decorative duplicate link types (names containing "DO NOT USE") — map by exact name and wording.

## Cross-project links

The per-project copy can only link items inside the project it is copying (the other project may not exist yet).
After ALL projects are loaded, a separate pass recreates links whose two ends live in different migrated projects:
- build the map from EVERY run map (per-project maplogs, map json files, the map of items copied with new keys —
  doc 06); three items that were in a map json but not in the maplog once came out as "not possible"
- idempotent: skip links already present (by triple)
- links to items that were NOT migrated: keep as a remote link to the source URL or drop — decide and log. A naive copy
  DROPS them; only text links keep the old URL (and die at shutdown) — client documents claimed otherwise twice.
- If you stage through an intermediate site or mix tool-migrated and REST-copied projects, you own link restoration:
  Atlassian's tooling restores cross-wave links only when both ends go from the same source to the same destination,
  and re-creating missing items by CSV does not restore their links.
- With preserved keys, a link created FROM the target to the same key on a still-connected source is treated as a link
  to itself (documented behaviour for application-linked sites with identical keys).

## Filters and boards

- **Only filters shared with the migration account are readable**; `overrideSharePermissions` did not help ("You don't
  have permissions"). Inventory boards first; each board's filter must be readable.
- Filter name clash → 400 "Filter with same name already exists." → suffix the name; on re-runs reuse your OWN filter
  via `GET /rest/api/3/filter/my`. Old or renamed project keys inside JQL resolve through the source
  (`GET /rest/api/3/project/{token}`); ids of non-migrated objects → 400 "A value with ID '…' does not exist for the
  field 'project'". Log a WARN when you simplify a filter — one board silently got a single-project filter where the
  source had `project in (A, B, C) AND issuetype in (…) ORDER BY Rank DESC`.
- Recreated filters: owner = the migration account, shared with the project only, no edit shares, no subscriptions.
  Board admins default to the migration account — hand them to a mover afterwards.
- Recreate the filter owned by the migration account, JQL remapped: custom field ids by NAME (`cf[10042]` → the
  target's id), project ids/keys, version and component ids by name, issue types through the type mapping (`Theme` →
  `Epic`), user references of non-movers removed. A filter whose JQL names things that do not exist on the target
  (a type, a project that is not migrating) must be simplified — and recorded as a decision.
- Boards: `POST /rest/agile/1.0/board {"name","type":"scrum|kanban","filterId",
  "location":{"type":"project","projectKeyOrId":"K"}}` (without `location` the board sits under the calling user). Columns, swimlanes, quick filters
  and card layout have **no public write API** — list the source's columns per board in the report; set by hand.
- A board filter that referenced a stale project id crashed the board pass; recreate the filter and continue per
  board (one failing board must not stop the rest).
- Verify each board's filter by count: `filter = <id>` vs the source board's count.

## Sprints

Recreate per board, oldest first. The order matters:

```
create   POST /rest/agile/1.0/sprint {"name" (≤30 chars), "originBoardId", "goal" (scrubbed)}
start    POST /rest/agile/1.0/sprint/{id} {"state":"active","startDate","endDate"}   # BEFORE adding items
add      POST /rest/agile/1.0/sprint/{id}/issue {"issues":[≤50 keys]}
close    POST /rest/agile/1.0/sprint/{id} {"state":"closed"}
```

- Sprint names are capped at 30 characters (check collisions after truncation); goals are scrubbed (they can hold
  names). Adding a batch fails as a whole if ONE key does not exist yet ("Issue does not exist") — run the board/sprint
  pass after ALL projects are loaded and filter memberships to keys present in the maps.
- The Sprint field id differs per site (schema custom `…gh-sprint`): resolve it by name. A kanban board answers 400 on
  the sprint endpoint — treat as "no sprints".
- Count sprints LIVE from the boards (`GET /rest/agile/1.0/board/{id}/sprint?startAt=`, dedupe by id), not from your own
  map file: the map file missed ~40 sprints created after a resume and a report understated them.

Why start before add: if the start is refused (a second active sprint on a board without parallel sprints), you can
delete the empty sprint without having moved a single item.

**Re-seat pass afterwards.** An item can be in only one OPEN sprint: adding it to a sprint you are replaying moves it
out of its current open sprint, and closing the replayed sprint drops it to the backlog. After the replay, every item
whose source OPEN sprint maps to a target sprint it is not in gets added back.

Limits to state:
- `completeDate` of a closed sprint cannot be set — it becomes "today".
- A sprint is closed with the items' CURRENT status, so "completed/not completed" reflects today, not the source at
  close time.
- On a closed sprint the Agile API allows only name/goal edits.

### Sprints of boards that no longer exist

Field note: ~2,000 items lost their sprint membership. Their sprints' `originBoardId` pointed at source boards that
no longer resolved (deleted boards), and the board pass only walked sprints of resolvable boards — so it never saw
them. A final reviewer found it.

Measure from the ITEM side, not the board side: read every item's Sprint field on the source (the sprint custom field
holds id, name, state, dates, originBoardId); any sprint id not in your boards map is "dead". Recreate those on the
migrated board that covers the project — chosen by **filter coverage** (`filter = X AND project = P` count on the
target). Where no scrum board covers a project, use the nearest board of the same team: the item's Sprint field is
right, the sprint just is not on that project's board. Verify per source sprint: item count on the source == item
count on the target sprint, and no membership missing.

## Rank

The ordered copy creates in number order, so rank ≈ creation order. If backlog order matters, re-rank afterwards with
`PUT /rest/agile/1.0/issue/rank {"issues":[…≤50], "rankBeforeIssue"|"rankAfterIssue"}` walking the source's
`ORDER BY Rank` list. We did not; say so if you do not.
