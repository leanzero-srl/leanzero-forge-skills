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
  render **"X <type.outward> Y"** on the sites we used — i.e. the issue you pass as `inwardIssue` is the one that
  HOLDS the outward description. Yes, that reads backwards. Do not trust this paragraph either:

### Prove it on one known pair before any bulk write

```
1. pick two scratch/migrated items A and B
2. POST /issueLink type=Blocks, inwardIssue=A, outwardIssue=B
3. GET /issue/A?fields=issuelinks  -> expect an entry with outwardIssue=B   ("A blocks B")
   GET /issue/B?fields=issuelinks  -> expect an entry with inwardIssue=A    ("B is blocked by A")
4. if not, swap your mapping; delete the probe link
```

`templates/link_copy.py --probe A B` does exactly this and refuses to run the bulk copy until a probe result for that
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
  wrong one (never delete without the correct twin present)
- `missing` — create
- `extra` on the target — leave alone unless you created it
- only links whose BOTH ends are migrated items are touched

Record every change (old link id → new link id) so the repair itself is revertible.

**The final compare must compare links per (pair, type, DIRECTION).** A count per item cannot see an inversion.

## Link types the target does not have

Options: ask the target config owner to add the types, or map to an existing type. The decision taken: map missing
types (things like "Action item", "Mention", custom review types) to **Relates**, keep the source direction, and log
every created link id so the decision can be reverted if the types are added later. Never create link types on a
shared production site without the owner's yes.

## Cross-project links

The per-project copy can only link items inside the project it is copying (the other project may not exist yet).
After ALL projects are loaded, a separate pass recreates links whose two ends live in different migrated projects:
- build the map from EVERY run map (per-project maplogs, map json files, the map of items copied with new keys —
  doc 06); three items that were in a map json but not in the maplog once came out as "not possible"
- idempotent: skip links already present (by triple)
- links to items that were NOT migrated: keep as a remote link to the source URL or drop — decide and log

## Filters and boards

- **Only filters shared with the migration account are readable**; `overrideSharePermissions` did not help ("You don't
  have permissions"). Inventory boards first; each board's filter must be readable.
- Recreate the filter owned by the migration account, JQL remapped: custom field ids by NAME (`cf[10042]` → the
  target's id), project ids/keys, version and component ids by name, issue types through the type mapping (`Epic` →
  `Feature`), user references of non-movers removed. A filter whose JQL names things that do not exist on the target
  (a type, a project that is not migrating) must be simplified — and recorded as a decision.
- Boards: `POST /rest/agile/1.0/board {"name","type":"scrum|kanban","filterId"}`. Columns, swimlanes, quick filters
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
