# Atlassian EcoScanner / FSRT findings — what the scanner actually checks, and how to clear it

Learned 2026-09-12 on CogniRunner (AMS-65094..AMS-65118: 22 "Authorization bypass" + 3 "Insufficient
Authentication" tickets in the Ecosystem Jira, all `Custom-Check-Authorization-*` / `Custom-Check-Authentication-*`
from FSRT). Cleared in one commit; local FSRT run went 25 → 0.

## Run it locally FIRST — it reproduces the tickets exactly

```bash
git clone --depth 1 https://github.com/atlassian-labs/FSRT.git   # NOT atlassian/FSRT (404)
cd FSRT && cargo build --release -p fsrt                            # ~1 min, needs Rust
./target/release/fsrt /path/to/app -o out.json                      # scans manifest.yml + src/
# findings: grep -o 'found via [^"]*' out.json | sort | uniq -c
```

The "Failed to get metadata for cache file ~/.cache/fsrt/*.json" stderr lines are harmless.
`fsrt` is a dataflow analyzer over the JS AST: it walks from every manifest entrypoint (resolver handler
methods, `validate`, webtriggers, …) through the call graph and reports the FIRST unauthorized app-context
call per entrypoint. So after fixing one path the NEXT one surfaces — always re-run until zero.

## Authorization check (`Custom-Check-Authorization-*`) — what it accepts

An `api.asApp()` call is "unauthorized" unless, somewhere on the call path BEFORE it, one of these occurred
(may-analysis: any path through the callee counts, and the callee's state joins into the caller):

1. `authorize()` **imported by name from `@forge/api`** (`import { authorize } from "@forge/api"`). Detection
   is by the IMPORTED name, so `import { authorize as authz }` also works.
2. Any `requestJira` / `requestConfluence` (asApp OR asUser) whose route template **contains the substring
   `permission`** — e.g. `route\`/rest/api/3/mypermissions?permissions=ADMINISTER\`` or `/permissions/check`.

What does NOT count (and what CogniRunner had): a KVS roster lookup, `/rest/api/3/group/member` scans,
`context.accountId` checks, anything hand-rolled. `api.asUser()` calls are a "SafeCall" — not flagged, but
they do not authorize the asApp() calls after them either.

Routes matching `user|instance|avatar|license|preferences|server[iI]nfo` are "trivial" and never flagged;
`/wiki/api/v2/app/properties` is allowlisted.

**The one-fix pattern:** if every gated resolver funnels through ONE role helper (CogniRunner:
`getUserPermissions` → `requireRole` / `canActOnConfig` / `canDeleteConfig`), put a REAL user-context
permission check in that helper (`asUser()` + `mypermissions?permissions=ADMINISTER`) and every downstream
path inherits the authorized state. 17 of 22 findings cleared with that one edit. Then handle the genuinely
ungated resolvers individually, and workflow functions (`validate`) with an issue-level `mypermissions`
check as the acting user (TRANSITION_ISSUES + issueKey; skip on create where `issue.key` is null).

## Authentication check (`Custom-Check-Authentication-*`) — webtriggers

A webtrigger's app-context API call is "unauthenticated" unless a **storage read, `fetch`, or
`process.env` read** happens first on the path. Storage reads are only recognised for
`import { storage } from "@forge/api"` or **`import { kvs } from "@forge/kvs"`** (`.get` / `.getSecret` /
`.query`). A DEFAULT import — `import storage from "@forge/kvs"` — is INVISIBLE to it, so a perfectly
good bearer-token lookup + `timingSafeEqual` still gets flagged. Fix with zero logic change:
`import { kvs as storage } from "@forge/kvs"` (alias is fine; detection keys on the imported name).

## Verification that is NOT optional

- Re-run fsrt → 0 findings (the ticket set is exactly what it prints).
- Harness mocks that stub `@forge/kvs` / `@forge/api` must export the new names (`kvs`, `authorize`) or
  every offline suite fails at import.
- Live: the new `asUser()` permission call must work in EVERY context you put it in — resolvers (yes),
  workflow validators (yes, verified: 14 invocations, 0 skipped), post-functions (NO — asUser is not
  available there; never put it in `executePostFunction`).
