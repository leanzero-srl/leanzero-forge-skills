---
name: automation-engineer
description: >-
  Read, create, update and migrate Jira/Confluence Cloud Automation rules over REST — the real,
  working Automation REST API (api.atlassian.com/automation/public/...), not the site's own
  /rest/api/3/... surface. Use whenever a task needs to enumerate what automation rules exist on a
  project, inspect a rule's trigger/condition/action configuration, create or update a rule
  programmatically, or migrate/replicate rules from one Jira/Confluence site to another (e.g.
  production → sandbox). Also use to correct the common belief that "Jira Automation has no REST
  surface" — every endpoint that belief is usually based on is on the wrong host.
---

# Automation Engineer — the real Jira/Confluence Automation REST API

Built 2026-09-22 migrating a client's production Jira Automation rules onto a sandbox tenant, after
the desk's own notes had recorded — twice, on two separate occasions weeks apart — that "Jira
Automation has no API-token-accessible REST surface." Both times, every endpoint tried
(`/rest/cb-automation/...`, `/gateway/api/automation/internal-api/...`, `/rest/api/3/automation/rule`)
was on the site's own domain. **The real API lives on a completely different host and works fine
with a plain API token.**

> **The founding lesson: read reachability is not the same as write reachability, and "generic
> parse error" is not the same as "impossible."** `GET` worked on the first real try. `POST /rule`
> (create) then rejected every payload — including a byte-perfect resubmission of a rule this same
> API had just created and handed back — with one identical, unhelpful error, until bisecting
> field-by-field against a known-working rule found three specific, undocumented requirements.
> Never let a platform's bad error messages stand in for "the operation can't be done."

## The one-command version

```bash
python3 scripts/automation_client.py list --email you@x.com --token $TOKEN --cloudid $CID \
  --scope-ari "ari:cloud:jira:$CID:project/<projectId>"
python3 scripts/automation_client.py get  --email you@x.com --token $TOKEN --cloudid $CID --uuid <ruleUuid>
python3 scripts/automation_client.py scan --email you@x.com --token $TOKEN --cloudid $CID --uuid <ruleUuid>
python3 scripts/automation_client.py create --email you@x.com --token $TOKEN --cloudid $CID \
  --file rewritten-rule.json --author <target-tenant-accountId> --disabled
```

`create_rule()` in the client enforces the two easy-to-forget requirements itself (fresh v7 uuid,
a valid `authorAccountId`) and fails LOUD with a clear message instead of letting the API's own
generic 400 hide a missing field again. `scan` finds the hidden cross-tenant references
(`cf[NNNNN]` field ids and Assets object ARIs) buried inside a rule's JQL strings — the part a
naive migration script would never think to look for.

## Reference files (read on demand)

- **`docs/gotchas.md`** — ⚠️ **READ THIS BEFORE CALLING `POST /rule`.** The exact three rules that
  make create work, the fourth trap (raw `project`/`issuetype` ids inside `jira.issue.create`
  actions), and why every wrong guess along the way produced the identical unhelpful error.
- **`docs/01-core-concepts.md`** — the host, auth model, full endpoint table, the rule/trigger/
  component data model, and real worked examples of every component type seen in production.
- **`docs/24-production-patterns.md`** — the full production→sandbox migration this skill was
  built from: 15 real rules, what broke, what the remap pipeline actually needed to handle.

## The method

1. **Enumerate first** (`GET /rule/summary`, filtered by `scope` ARI) — never assume a project has
   zero rules just because the site's own `/rest/api/3/...` surface can't see them.
2. **Read the full rule** (`GET /rule/{uuid}`) before touching anything — the trigger/condition/
   action tree's `value` shape is undocumented in the OpenAPI schema; the only way to learn a new
   component type is to read a real one (`docs/01-core-concepts.md` has the ones found so far —
   add to it when you meet a new one).
3. **Scan for hidden cross-tenant references** before migrating a rule anywhere: `ruleScopeARIs`
   and the trigger's `eventFilters` (project/site ARIs), `cf[NNNNN]` inside any JQL string, Assets
   object ARIs inside JQL, and raw `project`/`issuetype` numeric ids inside `jira.issue.create`
   actions. None of these fail loudly if you miss one — a stale field id in JQL just silently never
   matches, forever.
4. **Resolve every reference by NAME, not by copying the id** — field ids, project ids, issue type
   ids and Assets object ids are all tenant-local. Group UUIDs and user accountIds are the one
   exception: they're shared across every site in the same Atlassian organization, proven live by
   checking the same group/account resolves identically on two different sites.
5. **Create DISABLED first, read it back, diff against what you meant to send** (not against the
   source rule — the ids are supposed to differ), only then flip to enabled.

## Golden rules

**A generic, identical error across wildly different payloads means you're missing something
structural, not that the shape is close.** Every attempt from a two-field hand-built body to a
faithful full-rule remap failed with the exact same `api.error.unknown` "could not be parsed"
until all three real requirements (see `docs/gotchas.md`) were met at once. Bisect against a
known-working example rather than guessing variations on a broken one.

**A platform's own Postman collection can carry a requirement its OpenAPI schema and prose docs
both omit.** The "rule uuid must be v7" rule was findable in exactly one place: the endpoint
description string inside the public Postman collection JSON. Read every source the vendor
publishes, not just the rendered docs page.

**"Optional-looking" is not the same as optional.** `authorAccountId` is clearly populated by the
server on every `GET` response, which makes omitting it on `POST` a completely reasonable
assumption — and it was the actual root cause of the whole blocker, indistinguishable by symptom
from a dozen wrong structural guesses. When every other explanation is exhausted, suspect the field
that "the server fills in for you."

**Stale beliefs compound.** This skill exists because the exact same wrong conclusion —
"Automation has no REST surface" — was written down independently on two different occasions,
because nobody re-tried the real host once it was found. If you inherit a note saying an API is
unreachable, check which host it actually tried before trusting it.

## Standing directive: keep this current

New component `type`s, new cross-tenant reference shapes, and new API quirks turn up every time
this skill is used on a rule nobody has migrated before. When you find one, add it to
`docs/01-core-concepts.md` (component examples) or `docs/gotchas.md` (a new trap) with a dated
line, the same day.

## Changelog

- **2026-09-22 — Skill created**, distilled from a live client engagement: 15 production
  automation rules on one project read, remapped and recreated on a sandbox tenant. Corrects a
  wrong "no REST surface" conclusion recorded twice, independently, on that engagement. Solved
  `POST /rule` create (three rules + one late-stage trap, see `docs/gotchas.md`) after every
  structural guess produced an identical, unhelpful generic error. `scripts/automation_client.py`'s
  `create_rule()` now enforces the fix itself rather than relying on the caller to remember it.
