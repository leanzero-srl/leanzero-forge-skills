# Boards and JSM queues: writing their configuration over REST

> **Internal and unsupported.** Apart from board create/delete, filters and the read endpoints marked *public*,
> everything on this page is an **internal endpoint** that the Jira UI itself calls (`/rest/greenhopper/1.0/...`,
> `/rest/servicedesk/1/...`, the GraphQL gateway). None of it is in Atlassian's REST reference. Atlassian does not
> support it and can change it without notice. It accepts a normal **API token (Basic auth)** of a user who
> administers the board / project. Every recipe here was run end to end against a Jira Cloud Premium site on
> 2026-10-29 (company-managed software project + company-managed JSM ITSM desk). Always back up first, write, then
> **read back** — never trust the 2xx alone.

Where the old advice said "no write API, use the browser": that is true for the **public, documented** API only.
The internal endpoints below work with a token and are what the board/queue settings screens use.

## What is public and what is internal

| Task | Endpoint | Status |
|---|---|---|
| Create a board | `POST /rest/agile/1.0/board` | public |
| Read board columns | `GET /rest/agile/1.0/board/{id}/configuration` | public |
| Read quick filters | `GET /rest/agile/1.0/board/{id}/quickfilter` | public |
| Delete a board | `DELETE /rest/agile/1.0/board/{id}` | public |
| Read full board settings (columns, unmapped statuses, swimlanes, WIP statistic) | `GET /rest/greenhopper/1.0/rapidviewconfig/editmodel.json?rapidViewId={id}` | internal |
| Write board columns (incl. WIP min/max) | `PUT /rest/greenhopper/1.0/rapidviewconfig/columns` | internal |
| Create / edit / delete a quick filter | `POST /rest/greenhopper/1.0/quickfilters/{boardId}`, `PUT`/`DELETE .../{boardId}/{quickFilterId}` | internal |
| Swimlane method (none, assignee, custom query...) | `PUT /rest/greenhopper/1.0/rapidviewconfig/swimlaneStrategy` | internal |
| Create / edit / delete a query swimlane | `POST /rest/greenhopper/1.0/swimlanes/{boardId}`, `PUT`/`DELETE .../{boardId}/{swimlaneId}` | internal |
| Read JSM queues (jql, columns, order, Board view id) | `GET /rest/servicedesk/1/servicedesk/{projectKey}/queues/categories` | internal |
| Read JSM queues (jql, fields) | `GET /rest/servicedeskapi/servicedesk/{deskId}/queue` | public, read only |
| Create a JSM queue | `POST /rest/servicedesk/1/servicedesk/{projectKey}/queues` | internal |
| Edit a queue (name, JQL, List-view columns) | `PUT /rest/servicedesk/1/servicedesk/{projectKey}/queues/{queueId}` | internal |
| Delete queues | `PUT /rest/servicedesk/1/servicedesk/{projectKey}/queues` `{"deleted":[ids]}` | internal |
| Reorder queues | `PUT /rest/servicedesk/1/servicedesk/{projectKey}/queues` `{"order":[ids]}` | internal |
| Add a **Board** view to a queue | GraphQL `createSimpleNavigationItem` on `/gateway/api/graphql` | internal |
| Columns of a queue's Board view | same `rapidviewconfig/columns` PUT, on the queue's hidden board | internal |

Setup used in every example:

```bash
SITE=https://your-domain.atlassian.net
AUTH="$ATLASSIAN_EMAIL:$ATLASSIAN_API_TOKEN"
j() { curl -s -u "$AUTH" -H 'Content-Type: application/json' -H 'Accept: application/json' "$@"; }
```

## 1. Create a Kanban board (public)

```bash
# 1) the filter: take its id from THIS response
FID=$(j -X POST "$SITE/rest/api/3/filter" \
  -d '{"name":"KEY Kanban filter","jql":"project = KEY ORDER BY Rank ASC"}' | jq -r .id)

# 2) the board, located in the project (without location it sits under the calling user)
j -X POST "$SITE/rest/agile/1.0/board" -d "{\"name\":\"KEY Kanban\",\"type\":\"kanban\",\"filterId\":$FID,
  \"location\":{\"type\":\"project\",\"projectKeyOrId\":\"KEY\"}}"
# -> 201 {"id":2995,"name":"KEY Kanban","type":"kanban",...}
```

**Trap: never look the filter up by name.** `GET /rest/api/3/filter/search?filterName=` is a word-based fuzzy
match: searching for one new filter's name also returned the project's auto-created `Filter for KEY`. Taking the first
hit attaches the board to somebody else's filter, and the board then shows (and its admins can edit) that filter. Use
the id from the `POST /filter` response, or `GET /rest/api/3/filter/my` on re-runs.

A board created this way comes with: columns To Do / In Progress / Done (every status mapped by category), a fixed
Backlog column, quick filters **"Recently Updated"** (`updatedDate >= -1d`) and **"Assigned to me"**
(`assignee = currentUser()`), and swimlane method None with two predefined query lanes ("Expedite", "Everything Else").
Check before you add your own so you do not create duplicates.

## 2. Board columns (internal)

Back up first — the editmodel is the only place that shows the unmapped statuses and the WIP statistic:

```bash
j "$SITE/rest/greenhopper/1.0/rapidviewconfig/editmodel.json?rapidViewId=2995" > board-2995-before.json
jq '.rapidListConfig | {stat: .currentStatisticsField.id,
    cols: [.mappedColumns[] | {name, isKanPlanColumn, max, ids: [.mappedStatuses[].id]}],
    unmapped: [.unmappedStatuses[] | {id, name, issueCount}]}' board-2995-before.json
```

Write (the body replaces the whole column set):

```bash
j -X PUT "$SITE/rest/greenhopper/1.0/rapidviewconfig/columns" -d '{
  "currentStatisticsField": {"id": "issueCount_"},
  "rapidViewId": 2995,
  "mappedColumns": [
    {"name":"Backlog","mappedStatuses":[],"isKanPlanColumn":true,"min":"","max":""},
    {"name":"New","mappedStatuses":[{"id":"1"},{"id":"4"}],"isKanPlanColumn":false,"min":"","max":""},
    {"name":"Working","mappedStatuses":[{"id":"3"},{"id":"10031"}],"isKanPlanColumn":false,"min":"","max":"5"},
    {"name":"Done","mappedStatuses":[{"id":"5"},{"id":"6"}],"isKanPlanColumn":false,"min":"","max":""}
  ]}'
# -> 200 with the new rapidListConfig
```

Proven behaviour and traps:

- **`currentStatisticsField` is the WIP-limit statistic, not decoration.** Sending `{"id":"none_"}` switched the board's
  column constraint to *None* (WIP limits off). Send the board's current value (`issueCount_` on a default board) from
  the editmodel backup.
- **Kanban boards keep a fixed Backlog column.** Left out of the body, it was re-created anyway (`isKanPlanColumn:true`,
  no statuses). Send it explicitly as the first column so the body you keep matches what Jira stores.
- **Every column gets a new id on each PUT** (column ids are not stable keys). Match columns by name.
- **Omitting `min`/`max` removes the WIP limits** of that column. A minimal body (`name` + `mappedStatuses` only)
  is accepted.
- **Statuses you leave out become unmapped, and their issues disappear from the board.** Measured: one ticket in
  status "Waiting for support"; that status left out of the body; the ticket was still in the board's filter but
  `GET /rest/greenhopper/1.0/xboard/work/allData.json?rapidViewId=N` (the board's own data call) returned zero issues.
  The editmodel lists each unmapped status with its `issueCount` — check it is empty after every write.
- Rule of thumb when you map a workflow onto named columns: one column per main status in flow order, then fold every
  leftover status (template statuses like "Pending", "Escalated") into **the first column of the same status category**
  (`new` → first To Do-category column, `indeterminate` → first in-progress column, `done` → the done column) so no
  ticket drops off.
- Status ids for a project: `GET /rest/api/3/project/{KEY}/statuses` (per issue type) or the editmodel itself.

Verify:

```bash
j "$SITE/rest/agile/1.0/board/2995/configuration" | jq '[.columnConfig.columns[] | {name, ids:[.statuses[].id], max}]'
j "$SITE/rest/greenhopper/1.0/rapidviewconfig/editmodel.json?rapidViewId=2995" | jq '.rapidListConfig.unmappedStatuses'
# expect: your columns in order, Backlog first, unmappedStatuses == [] (or only statuses with issueCount 0)
```

## 3. Quick filters (internal write, public read)

```bash
j -X POST "$SITE/rest/greenhopper/1.0/quickfilters/2995" \
  -d '{"name":"Unassigned","query":"assignee is EMPTY","description":"No assignee yet"}'
# -> 200 {"id":2869,"name":"Unassigned","query":"assignee is EMPTY",...}
j -X PUT "$SITE/rest/greenhopper/1.0/quickfilters/2995/2869" \
  -d '{"id":2869,"name":"Unassigned","query":"assignee is EMPTY AND priority = High","description":"x"}'   # 200
j -X DELETE "$SITE/rest/greenhopper/1.0/quickfilters/2995/2869"                                            # 204
j "$SITE/rest/agile/1.0/board/2995/quickfilter" | jq '[.values[] | {id,name,jql}]'                          # verify
```

`POST /rest/greenhopper/1.0/quickfilters` without the board id in the path is a 404.

## 4. Swimlanes (internal)

```bash
# method: proven values "none", "assignee", "custom" (query lanes); anything else -> 400
j -X PUT "$SITE/rest/greenhopper/1.0/rapidviewconfig/swimlaneStrategy" -d '{"id":2995,"swimlaneStrategyId":"custom"}'  # 204

# query lanes (used when the method is "custom"); a new lane is inserted at position 0
j -X POST "$SITE/rest/greenhopper/1.0/swimlanes/2995" -d '{"name":"High","query":"priority = High","description":""}'
j -X PUT  "$SITE/rest/greenhopper/1.0/swimlanes/2995/2826" -d '{"id":2826,"name":"Highest","query":"priority = Highest","description":""}'
j -X DELETE "$SITE/rest/greenhopper/1.0/swimlanes/2995/2826"                                                 # 204

# verify
j "$SITE/rest/greenhopper/1.0/rapidviewconfig/editmodel.json?rapidViewId=2995" \
  | jq '.swimlanesConfig | {swimlaneStrategy, lanes:[.swimlanes[] | {id,name,query,position}]}'
```

The strategy body is `{"id": <boardId>, "swimlaneStrategyId": ...}` — `rapidViewId` there gives
"Invalid request payload".

## 5. JSM queues (internal)

**Read.** `GET /rest/servicedesk/1/servicedesk/{KEY}/queues/{id}` answers **405**; read every queue through categories:

```bash
j "$SITE/rest/servicedesk/1/servicedesk/KEY/queues/categories" \
  | jq '.categories[] | {category: .key, queues: [.queues[] | {id,name,order,jql,columns,rapidViewId}]}'
```

`jql` is stored WITHOUT the project clause (`completeJql` shows `project = KEY AND ...`). `rapidViewId` is present
only on queues that have a Board view. On an ITSM desk the queues sit in practice categories
(`service-request`, `incident-management`, ...) plus `no-category`; the public
`GET /rest/servicedeskapi/servicedesk/{deskId}/queue` returned only the `no-category` ones.

**Edit** (List-view columns, name, JQL). Partial bodies are accepted; send the full object you read so the intent is
explicit:

```bash
j -X PUT "$SITE/rest/servicedesk/1/servicedesk/KEY/queues/422" -d '{"id":422,"name":"All open",
  "jql":"resolution = Unresolved ORDER BY created DESC",
  "columns":["issuekey","summary","priority","duedate","assignee","status","created"],
  "order":0,"canBeHidden":false,"favourite":false}'
# -> 200 with the queue (columns + columnsDetails)
```

- Write the JQL **without** `project = KEY`; Jira adds it.
- Invalid JQL → 400 `{"reasonKey":"sd.admin.queue.general.error.incompletefields","errors":{"jql":"Field 'x' does not exist..."}}`.
- **An unknown column id is accepted silently** (`customfield_99999` was stored, 200). Validate column ids against
  `GET /rest/api/3/field` before writing.
- `order` in this body is ignored; reorder with the call below.

**Create:**

```bash
j -X POST "$SITE/rest/servicedesk/1/servicedesk/KEY/queues" \
  -d '{"name":"Unassigned","jql":"assignee is EMPTY AND resolution = Unresolved ORDER BY created DESC",
       "columns":["issuekey","summary","status","created"]}'
# -> 200 {"id":425,"name":"Unassigned","order":3,"columns":[...],...}  (lands last, in no-category)
```

**Delete** (`DELETE /queues/{id}` is 405; this is the call the UI makes):

```bash
j -X PUT "$SITE/rest/servicedesk/1/servicedesk/KEY/queues" -d '{"deleted":[425]}'   # 200, returns a queue list
```

**Reorder:**

```bash
j -X PUT "$SITE/rest/servicedesk/1/servicedesk/KEY/queues" -d '{"order":[445,442,443,444]}'
```

On the ITSM desk tested, a list of the four `no-category` queue ids (the set the public queue listing returns) was
accepted, and the full list of all 19 queues across categories got **409** "The list of queue IDs to reorder must match
queue IDs of current queues". Send the ids of the queues you see in the public listing, then read `order` back from
`/queues/categories`; a 409 means the set did not match.

## 6. A queue's Board view (hidden board)

The **Board** tab next to **List** on a queue is a hidden Kanban board. It does not exist until someone adds the view
(the "+" next to List → Board → Add to navigation). Once it exists, `/queues/categories` shows its `rapidViewId`, and
it is an ordinary board to the APIs above: `GET /rest/agile/1.0/board/{rapidViewId}` works, the editmodel works, and
its columns are written with the same `rapidviewconfig/columns` PUT as section 2.

What a new Board view brings (measured on four of them): a board named `<project name> <queue name>`, a new filter
`Filter for KEY (n)` with the queue's complete JQL, columns Backlog / To Do / In Progress / Done, quick filter
"Assigned to me" only. **Every Board view added later to another queue starts again at To Do / In Progress / Done**:
re-run your column write for its `rapidViewId`.

Adding the view over the API (the UI's own call, a GraphQL mutation):

```bash
CLOUD=$(curl -s "$SITE/_edge/tenant_info" | jq -r .cloudId)
ACT=$(j -X POST "$SITE/gateway/api/graphql" -d "{\"query\":\"query Act { tenantContexts(cloudIds:[\\\"$CLOUD\\\"]) { activationIdByProduct(product:\\\"jira\\\") { active } } }\"}" \
  | jq -r '.data.tenantContexts[0].activationIdByProduct.active')
QID=422
j -X POST "$SITE/gateway/api/graphql" -d "{\"query\":\"mutation AddQueueBoardView { jira { createSimpleNavigationItem(input:{scopeId:\\\"ari:cloud:jira-servicedesk:$CLOUD:queue/activation/$ACT/$QID\\\", typeKey: BOARD}) { success errors { message } navigationItem { id ... on JiraSoftwareBuiltInNavigationItem { url } } } } }\"}"
# -> {"data":{"jira":{"createSimpleNavigationItem":{"success":true,"errors":null,
#      "navigationItem":{"id":"...","url":"/jira/servicedesk/projects/KEY/queues/custom/422/board/2994"}}}}}
```

- The trailing number of `url` is the board id (`rapidViewId`).
- The operation **must be named** (`mutation AddQueueBoardView {...}`); an anonymous one is rejected with
  `NO_OPERATION_NAME`. In our run the rejected anonymous call had **still created the view** — read
  `/queues/categories` before retrying any failed call.
- One Board view per queue: a second call answers `success:false`, "Scope limit reached for this item type".
- `activationIdByProduct` with `product:"jira-servicedesk"` or `"jira-software"` returned null; `"jira"` returned the id.

## 7. Clean-up traps

- **Deleting a queue deletes its hidden board** (`GET /rest/agile/1.0/board/{rapidViewId}` → 404) **but not its filter.**
  Those `Filter for KEY (n)` filters are PROJECT-scoped: `DELETE /rest/api/3/filter/{id}` answers
  **500 "Illegal Entity Scope for Entity class (FILTER). Expected entity scope 'GLOBAL' but has scope 'PROJECT'"**, and
  they stayed after the project itself was deleted. Expect leftovers; there is no proven REST way to remove them.
- `DELETE /rest/agile/1.0/board/{id}` on a queue's hidden board answered 204. What that leaves on the queue's Board tab
  was not checked; to remove a queue completely, delete the queue.

## Verification checklist (after any write)

1. Board columns: `GET /rest/agile/1.0/board/{id}/configuration` matches the intended names and status ids, in order.
2. Nothing fell off: editmodel `unmappedStatuses` is empty, or every entry has `issueCount` 0.
3. Board issue count unchanged: `GET /rest/greenhopper/1.0/xboard/work/allData.json?rapidViewId={id}` →
   `issuesData.issues | length` before vs after the write (do not compare with the filter's count: Kanban boards
   legitimately hide old done items).
4. WIP statistic unchanged: editmodel `rapidListConfig.currentStatisticsField.id` equals the backup.
5. Queues: `/queues/categories` shows the expected `jql`, `columns`, `order`, and a `rapidViewId` where a Board view
   should exist; for queues outside practice categories, `GET /rest/servicedeskapi/servicedesk/{deskId}/queue/{id}/issue`
   returns the expected tickets.

## Not proven here (do not assume)

Removing a Board view from a queue over the API; choosing an ITSM practice category when creating a queue; card
colours, card layout and working days; team-managed (next-gen) boards and queues; scrum boards (only Kanban was
written). Prove each on a test site before relying on it.
