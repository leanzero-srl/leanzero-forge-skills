# Proving negatives: search-hidden items, hidden users, and other zeros that lie

A migration is full of checks that return "nothing": 0 items missing, user not found, app not installed, 0 leaks.
Each one is a claim about the WHOLE population, made through an instrument that may not see all of it. The rule:

> A count of 0, an empty list, a 404 or "not found" authorises nothing until the same query, on the **same object**,
> has been shown to return the thing when it IS there (a positive control). A control on a different project, space
> or table proves nothing — visibility is usually per object.

## Items the source's search cannot list

Field note: after the load, the per-project counts matched the source exactly — and 22 items were missing. They were
readable by key (`GET /rest/api/3/issue/PROJ-n` → 200, no issue security level set) but **JQL never returned them**:
the source's search index simply did not list them. The ordered copy enumerated by JQL, so it saw a gap at each of
those numbers, created a filler there and deleted it — burning the numbers on the target forever. The count check used
the same blind index, so it agreed.

How it was found: comparing the list of numbers the copy had treated as gaps against direct GETs on the source.

What to do, before the load:
- **Enumerate by key range**: for every number 1..max, `GET /rest/api/3/issue/PROJ-n?fields=key` (or a bulk fetch of a
  range: `POST /rest/api/3/issue/bulkfetch {"issueIdsOrKeys":[…≤100], "fields":["key"]}`). Anything that exists and is
  not in the JQL result is search-hidden. Do this BEFORE creating fillers, so those numbers are created as real items.
- Count completeness by key range, never by the same index the copy used.

What we did after the fact (decision logged): the numbers were already burned, so the items were copied with **new
numbers** at the end of each project, an origin note saying "original number could not be kept", and a separate map
log for them. Every post step had to learn about that map:
- link passes (both directions — the items' OWN links, which no cross-link pass had seen, and links pointing at them)
- URL rewriting (a source URL of such an item must map to its NEW key, not the same key — that is a deleted filler)
- request types, reporter/assignee setting, late sub-tasks: every post step that **enumerated the source by JQL was
  blind to these items too**. The key-based map log is the only complete list; post steps must iterate the map, not
  re-search the source.
- their attachments had never been scanned (a never-listed item is never scanned) → held until scanned.

## Users that user search hides

- `GET /rest/api/3/user/search?query=<email>` **does not return deactivated accounts**. A "not found → invite" flow
  passed two people who had deactivated accounts; the invite (`POST /rest/api/3/user`) then answered **400 with the
  existing inactive user** in the body. No duplicate was created, but the plan was wrong.
- The same person can exist under another address (`first.last@` vs `first.last.ext@`, a different domain). Search by
  e-mail, by display name, and by the known address variants before inviting.
- E-mail is hidden for most accounts (profile visibility), so a directory dump matched against e-mails finds almost
  nothing; `user/search?query=` matched most but silently missed an ACTIVE account — treat it as a floor and add a
  name-based pass with human review (a shared display name is not a shared person).
- A freshly invited account is not in user search for a while — keep a "forced mappings" file so a rebuild of your
  people map does not silently drop them.
- A different admin account can see e-mails another one cannot (managed accounts of the target org show their e-mail
  to an account of that org).

## Index lag and other lies

| Instrument | Lie | Control |
|---|---|---|
| JQL right after a write | Index lag — a just-written value may not be searchable yet | Read the item by key |
| CQL `type = attachment` | Misses attachments a direct `GET /wiki/rest/api/content/{pageId}/child/attachment` lists | Direct child listing per page |
| CQL `/wiki/rest/api/content/search` | No `totalSize` | Use `/wiki/rest/api/search?cql=` for counts |
| JQL `text ~ "Surname"` | Tokenises glued words (`FromSurname`) as one word — invisible | Direct read of the body |
| JQL `text ~` vs your reader | JQL is case-insensitive; a case-SENSITIVE reader said "clean" on items JQL kept finding | A JQL hit your reader "cannot find" is a bug in the reader until proven otherwise — print the raw body |
| JQL `labels = "with space"` | Invalid, but returns 0 with no error from search and approximate-count | `POST /rest/api/3/jql/parse?validation=strict` |
| `GET /rest/api/3/search` | 410 Gone now; `/search/jql` pages by `nextPageToken` (sending `startAt` → generic 400) | — |
| JSM queue / paged lists | 50 values + `isLastPage:false` looks like a total of 50 | Read `isLastPage` |
| `GET .../addons/{key}` (Connect) | 404 for a Forge app that is installed | The app's own data (issue properties, types) |
| A space "No space found" | The account lost access (spaces became invisible mid-run on the source) — not deletion | Ask the owner; never silently drop from scope |
| `HTTP 200` from a Confluence export/action URL | Body is the SPA shell, not the export | Assert the content, not the status |
| Download URL `/wiki/download/attachments/...` | 401 to an API token for ANY file (the negative control 401s too) | Prove bytes via REST `child/attachment` + its download link |
| JQL/CQL dates | Interpreted in the ACCOUNT's time zone — a UTC run start on a local-time account gave hundreds of false "outside scope" hits | Convert to the account's zone first |
| Jira changelog times | Also in the account's zone (+01:00 vs local) — a filter found 0 of 38 | Same |

## How to write a negative into a report

"0 non-mover names on the target" is only a sentence you may write when:
1. the same query found the planted/known positive on the same project/space (e.g. the placeholder label itself, or a
   KEEP person's name, or a planted test string), and
2. the population it ran over is stated (N items / M pages, which projects), and
3. the instrument's known blind spots are listed (doc 13).
