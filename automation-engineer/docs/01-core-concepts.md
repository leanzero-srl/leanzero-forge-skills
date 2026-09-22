# Core concepts — host, auth, endpoints, data model

## The host — this is the whole reason the API "doesn't exist" for most people

```
Primary:        https://api.atlassian.com/automation/public/{product}/{cloudid}/rest/v1/...
Site-specific:  https://{sitename}.atlassian.net/gateway/api/automation/public/{product}/{cloudid}/rest/v1/...
```

`{product}` is `jira` or `confluence`. `{cloudid}` is the site's cloud id (any `myself`/tenant-info
call on the site echoes it). Both hosts accept the same API-token auth; the site-specific one also
accepts a live browser session cookie. **Every path that lives on the site's own domain —
`/rest/api/3/automation/...`, `/rest/cb-automation/...`, `/gateway/api/automation/internal-api/...`
— 404s.** That's not evidence the capability is missing; it's evidence of the wrong host.

## Auth

Plain HTTP Basic auth, `Authorization: Basic base64(email:api_token)` — an ordinary Atlassian API
token, the same one you'd use against `/rest/api/3/...`. No OAuth 2.0 3LO is documented for this
API, and **Forge apps and OAuth2 apps cannot call it** — this is a plain server-to-server surface.

Authorization is per-object, following the calling user's own product permissions — for
tenant-wide listing or cross-project scope changes this generally means the token needs site- or
project-admin rights, same as it would in the UI. There is no separate "automation" OAuth scope to
grant, and **granular (scoped) API tokens do not cover this API at all** — confirmed live: no
automation/rule-related scope exists in the granular-token scope picker, and a scoped token gets a
distinct `401 "Unauthorized; scope does not match"` on every call including plain reads, where a
classic (unrestricted) token works. Don't spend time trying to scope a token down for this API.

```bash
curl -u "$EMAIL:$TOKEN" \
  "https://api.atlassian.com/automation/public/jira/$CLOUDID/rest/v1/rule/summary?limit=50"
```

## The endpoints — verified against the real OpenAPI spec (`swagger.v3.json`), not prose

Fetch it yourself before trusting a shape below — prose docs summarize it and can drift:
`https://dac-static.atlassian.com/cloud/automation/swagger.v3.json`. Every path below also exists
at `/rest/latest/...` as an alias for `/rest/v1/...`.

| Path | Method | Purpose |
|---|---|---|
| `/rule/summary` | GET | List rule summaries, cursor-paginated (`cursor`, `limit`) |
| `/rule/summary` | POST | Search rule summaries by `trigger`, `state`, `scope` (ARI), `author` (accountId) |
| `/rule` | POST | **Create** a rule (see `gotchas.md` — this one has real teeth) |
| `/rule/{ruleUuid}` | GET | Fetch one rule's FULL configuration (trigger + every component) |
| `/rule/{ruleUuid}` | PUT | **Update** a rule |
| `/rule/{ruleUuid}` | DELETE | Delete a rule (disable it first) |
| `/rule/{ruleUuid}/state` | PUT | Enable/disable (`{"value": "ENABLED"\|"DISABLED"}`) — proven live, simplest write to test with |
| `/rule/{ruleUuid}/rule-scope` | PUT | Overwrite the rule's scope ARIs entirely |
| `/rule/manual/search` | GET, POST | List/search **manually-triggered** rules (the "..." menu run-now kind) |
| `/rule/manual/{ruleId}/invocation` | POST | **Execute** a manual rule against target object ARIs |
| `/template/{templateId}` | GET | Fetch one template's metadata |
| `/template/search` | GET, POST | Search Atlassian's rule-template library (filter by `categories`, e.g. `jsm.default` for service-desk-shaped templates vs `jira-software.*`) |
| `/template/create` | POST | Instantiate a rule from a template (`templateId` + `ruleHome` ARI) — good smoke test that your token/scope/project combination can create rules at all, before debugging a hand-built payload |

Cursors are opaque, roughly 1-hour TTL — never hand-construct one. `limit` is 1–100, default 50.

## Reading a rule — the shape that actually matters

`GET /rule/{ruleUuid}` returns:

```json
{
  "rule": {
    "name": "...", "state": "ENABLED", "description": "...",
    "authorAccountId": "...", "actor": {"type": "ACCOUNT_ID", "actor": "<accountId>"},
    "notifyOnError": "FIRSTERROR", "canOtherRuleTrigger": false, "labels": [],
    "writeAccessType": "UNRESTRICTED", "collaborators": [],
    "ruleScopeARIs": ["ari:cloud:jira:<cloudId>:project/<id>"],
    "trigger": { "component": "TRIGGER", "type": "<trigger type>", "value": {...},
                 "conditions": [...], "id": "<uuid>" },
    "components": [ /* the rule BODY: a tree of CONDITION / CONDITION_BLOCK / BRANCH / ACTION /
                       ORCHESTRATION nodes, each with children[] and conditions[] */ ]
  }
}
```

Every component (trigger and body alike) shares one shape: `component` (the node kind — TRIGGER,
CONDITION, CONDITION_BLOCK, ACTION, BRANCH, ORCHESTRATION), `type` (the specific rule-part, e.g.
`jira.issue.field.changed`, `jira.jql.condition`, `jira.issue.edit`), `value` (an object whose
shape is **specific to `type` and undocumented in the schema**). The OpenAPI spec says it outright:
*"To get the expected shape for a specific component, export a rule containing the component."*
In practice: `GET` an existing real rule that uses the component you need and copy its `value`
shape. The worked examples below are every component type seen so far — add to this file the first
time you meet one that isn't here.

### Real component examples

**Trigger — `jira.issue.event.trigger:created`** (fires on issue creation, scoped by project):
```json
{"component": "TRIGGER", "type": "jira.issue.event.trigger:created", "schemaVersion": 1,
 "value": {"eventKey": "jira:issue_created", "issueEvent": "issue_created",
           "eventFilters": ["ari:cloud:jira:<cloudId>:project/<projectId>"]}}
```

**Trigger — `jira.issue.field.changed`** (fires when any of the named fields change; `fields[].type`
is `"fieldName"` — addressed by NAME, portable across sites once the scope ARI is remapped):
```json
{"component": "TRIGGER", "type": "jira.issue.field.changed", "schemaVersion": 2,
 "value": {"eventFilters": ["ari:cloud:jira:<cloudId>:project/<id>"], "changeType": "ANY_CHANGE",
           "fields": [{"value": "Region", "type": "fieldName"}], "actions": []}}
```

**Condition — `jira.jql.condition`** (raw JQL — this is where `cf[NNNNN]` and Assets-object-ARI
traps live, see `gotchas.md`):
```json
{"component": "CONDITION", "type": "jira.jql.condition", "schemaVersion": 1,
 "value": "type = \"Some Type\" and cf[22193] = \"ari:cloud:cmdb::object/<workspaceUuid>/<objectId>\""}
```

**Condition — `jira.issue.condition`** (structured single-field comparison; field addressed by ID,
system fields like `issuetype` share the same id everywhere, custom fields don't):
```json
{"component": "CONDITION", "type": "jira.issue.condition", "schemaVersion": 3,
 "value": {"selectedField": {"type": "ID", "value": "issuetype"}, "selectedFieldType": "issuetype",
           "comparison": "EQUALS",
           "compareValue": {"type": "ID", "value": "<issueTypeId>", "multiValue": false}}}
```

**Condition — `jira.comparator.condition`** (compares two smart values — fully portable, smart
values reference fields by name inside `{{ }}`):
```json
{"component": "CONDITION", "type": "jira.comparator.condition", "schemaVersion": 1,
 "value": {"first": "{{issue.reporter.accountId}}", "second": "{{issue.creator.accountId}}",
           "operator": "NOT_EQUALS"}}
```

**Condition container tree:** every rule body starts with a `jira.condition.container.block`
(component `CONDITION`) wrapping one or more `jira.condition.if.block` (component
`CONDITION_BLOCK`, `value.conditionMatchType`: `"ALL"` or `"ANY"`) — the IF/ELSE-IF ladder from the
UI. The block's own `conditions[]` holds the actual conditions; its `children[]` holds what runs
when they match (further blocks, or ACTION nodes).

**Action — `jira.issue.edit`** (sets one or more fields; each operation can address its field by
NAME or ID — prefer NAME when hand-building for portability):
```json
{"component": "ACTION", "type": "jira.issue.edit", "schemaVersion": 12,
 "value": {"operations": [
   {"field": {"type": "NAME", "value": "Preparer"},
    "fieldType": "com.atlassian.jira.plugin.system.customfieldtypes:userpicker",
    "type": "SET", "value": {"type": "SMART", "value": "{{issue.creator}}"}}]}}
```
`value.type: "SMART"` means the value is itself a smart-value expression evaluated at run time —
fully portable. A literal option label (e.g. setting a select field to `"N/A"`) is also portable.

**Action — `jira.create.mapping-variable`** (builds a lookup-table variable for later smart-value
use — fully portable, just literal key/value pairs):
```json
{"component": "ACTION", "type": "jira.create.mapping-variable", "schemaVersion": 1,
 "value": {"name": {"type": "FREE", "value": "masterList"}, "mappings": [{"key": "1", "value": "1"}]}}
```

**Action — `jira.issue.create`** (creates an issue — **this is where the raw project/issuetype id
trap lives**, see `gotchas.md`):
```json
{"component": "ACTION", "type": "jira.issue.create", "schemaVersion": 12,
 "value": {"operations": [
   {"field": {"type": "ID", "value": "project"}, "fieldType": "project", "type": "SET",
    "value": {"type": "ID", "value": "<rawProjectId>"}},
   {"field": {"type": "ID", "value": "issuetype"}, "fieldType": "issuetype", "type": "SET",
    "value": {"type": "ID", "value": "<rawIssueTypeId>"}}]}}
```

**Branch — `jira.issue.related`** ("for each linked/related issue"; `linkTypes` addressed by NAME —
portable as long as the target has a link type with that exact name):
```json
{"component": "BRANCH", "type": "jira.issue.related", "schemaVersion": 1,
 "value": {"relatedType": "linked", "jql": "", "linkTypes": ["relates to"],
           "onlyUpdatedIssues": false, "similarityLimit": 40, "compareValue": 0}}
```

**Orchestration — `automation.orchestration.fragment`** (a named, optional grouping — purely
organisational, carries no tenant-specific reference itself):
```json
{"component": "ORCHESTRATION", "type": "automation.orchestration.fragment", "schemaVersion": 1,
 "value": {"name": "Group 2", "isOptional": false, "inputProjections": [], "outputProjections": []}}
```

## Manual rules and templates

Manual rules are the "..." menu **Automation → *rule name*** entries a user runs by hand.
`GET/POST /rule/manual/search` lists them (optionally filtered to rules valid for a given target
object type); `POST /rule/manual/{ruleId}/invocation` runs one against a list of object ARIs plus
any `userInputs` the rule's manual-trigger prompt defines — the response is keyed per-ARI with
`SUCCESS`/`INVALID_TARGET_OBJECT`.

Templates are Atlassian's library of pre-built rule blueprints. `/template/search` supports
filtering by `categories` — check the category matches your project TYPE (`jsm.*` for service-desk
projects, `jira-software.*` for software projects); a template from the wrong product family fails
`/template/create` with a specific `"Invalid template"` error rather than creating anything.
Useful both as a way to build a genuinely new rule and as a fast, low-risk way to confirm your
token/project/scope combination can create rules at all before debugging a hand-built `/rule` call.
