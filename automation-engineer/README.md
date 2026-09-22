# automation-engineer

Read, create, update and migrate Jira/Confluence Cloud **Automation rules** over REST — the real,
working API, not the site's own `/rest/api/3/...` surface most people (and most AI agents) try
first and give up on.

## Why this exists

Two independent attempts, weeks apart, on the same engagement, both concluded "Jira Automation has
no API-token-accessible REST surface" after trying `/rest/api/3/automation/rule`,
`/rest/cb-automation/...`, and `/gateway/api/automation/internal-api/...` — every one 404s.

**Both conclusions were wrong.** Every path tried was on the site's own domain. The real API lives
on a completely different host:

```
https://api.atlassian.com/automation/public/{product}/{cloudid}/rest/v1/...
```

Plain HTTP Basic auth with an ordinary API token works. `GET /rule/summary` lists every rule on a
project; `GET /rule/{uuid}` returns the full trigger/condition/action tree. Read access was never
the problem — the belief that this API doesn't exist was.

## Use it

```bash
python3 scripts/automation_client.py list --email you@x.com --token $TOKEN --cloudid $CID \
  --scope-ari "ari:cloud:jira:$CID:project/<projectId>"
python3 scripts/automation_client.py get  --email you@x.com --token $TOKEN --cloudid $CID --uuid <ruleUuid>
python3 scripts/automation_client.py scan --email you@x.com --token $TOKEN --cloudid $CID --uuid <ruleUuid>
python3 scripts/automation_client.py create --email you@x.com --token $TOKEN --cloudid $CID \
  --file rewritten-rule.json --author <target-tenant-accountId> --disabled
```

`create_rule()` bakes in the two easy-to-forget requirements (fresh v7 uuid, a valid target-tenant
`authorAccountId`) and fails loud with a clear message instead of the API's own generic error.

## What makes creating a rule harder than it should be

- **`docs/gotchas.md` — read first.** `POST /rule` rejects any payload violating any one of three
  undocumented rules — a hand-built minimal body, a byte-perfect resubmission of a rule the same
  API just created and handed back, a fully faithful cross-tenant remap — all fail with the
  identical, unhelpful `"could not be parsed"` error until all three are satisfied at once:
  1. Keep the entire structure exactly as `GET` returned it — never hand-build or strip a payload.
  2. `uuid` must be a fresh, valid **v7** UUID (documented only in the vendor's Postman collection,
     nowhere in the OpenAPI schema or the prose docs).
  3. `authorAccountId` must be present and valid on the **target** tenant. Omitting it — a
     completely reasonable assumption, since the server clearly populates it on every `GET` —
     silently produces the identical generic error as every structural mistake above.
- **A fourth, later-stage trap**: a `jira.issue.create` action can set `project`/`issuetype` by raw
  numeric ID rather than an ARI — invisible to any `cf[]`/ARI scanner, surfacing only *after* a
  successful create, with a real (if terse) permissions error.
- **`docs/24-production-patterns.md`** — a full 15-rule migration built from these rules: what
  needed remapping, what didn't (group UUIDs and accountIds are shared across every site in the
  same Atlassian organization — proven live, needs zero handling), and the actual run order.

## Contents

| File | What |
|---|---|
| `SKILL.md` | The method and the golden rules |
| `docs/gotchas.md` | ⚠️ The three create rules + the raw-id trap. Read before calling `POST /rule`. |
| `docs/01-core-concepts.md` | Host, auth, full endpoint table, the rule/component data model with real worked examples of every component type |
| `docs/24-production-patterns.md` | A real 15-rule production→sandbox migration, start to finish |
| `scripts/automation_client.py` | The client — list/get/create/scan/diff, credential-free |
| `scripts/test-auth.sh` | Confirm your token can reach the API (and isn't a granular/scoped token — those don't cover this API at all) |
| `scripts/preflight-check.sh` | Env/tooling check |

## The framing that works

> Automation rules are fully readable and writable over REST — the API most guides never mention,
> on a host most people never try. Migrating them is scriptable and diffable, not a browser-only,
> hand-recreate-it-in-the-UI job.

"Automation can't be automated" does not.
