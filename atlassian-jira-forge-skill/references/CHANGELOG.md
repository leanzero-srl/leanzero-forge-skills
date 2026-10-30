# atlassian-jira-forge-skill changelog

Dated entries moved out of SKILL.md (skill-lint, 2026-10-30). Newest entries may be at the top or bottom as they were in SKILL.md.

- **2026-10-03** — Corrected the claim that a `jira:workflowCondition` runs a Forge function (that `expression: "true"` was "REQUIRED" so Jira would invoke it on every issue view, that `validate` served conditions, a 25 s condition timeout). False per the Forge manifest schema (`@forge/manifest` 12.9.0): the condition module has a REQUIRED `expression` and NO `function` property; Jira evaluates the expression itself, so a condition cannot call REST, KVS or a model. Rewritten: `03-workflow-conditions.md` (also in `jira-api-skill`), `25` ("Conditions are Jira expressions, never functions"), `01`, `27`, `07`, `gotchas.md`, `when-to-use-which.md`, templates `condition.yml` and `workflow-config-view.yml`. The `25`/`01`/`27`/`gotchas` wording matches CogniRunner's F-2616 scrub of these passages word for word, so its knowledge bake is unchanged.
- **2026-08-26** — `19-rate-limit-handling.md` gains the verified 2026 points findings: **only app-initiated backend traffic counts** (`@forge/bridge` UI reads with no resolver are exempt — staff post #133 — the highest-leverage fix for a points-constrained app, with its caveats); **Jira's identity class adds Project Roles** on top of Users/Groups/Permissions, so role and permission-scheme walks are identity-priced; the only published multi-object worked example (1 + 8 users = 17) and the fact that everything else is derived; **the rule is measurably not applied consistently** (partner-measured endpoints charging flat 1 point at ~500-1000 objects); **POST-that-reads is charged per object** (`search/jql` measured at ~11.4 pts/call, not 1); measuring against the `X-RateLimit-Remaining` delta rather than a model, and why `FORGE_API_REQUEST_COUNT` cannot substitute; the self-meter defect classes that produced a 4x under-count on a live estate; and that "per Forge environment" pool scope is undocumented.
- **2026-08-26** — Folded in a day of production learnings from **ChatWise**
  (document → whole Jira backlog). `gotchas.md` gains a **Toolchain** section
  led by the one that cost two hours: a stubbed `node_modules/@forge/*` deploys
  silently and looks exactly like a platform outage, because lint, webpack,
  `forge lint` and the unit suite all pass — the unit tests stub those packages
  themselves. Plus `no-use-before-define` as a runtime, not style, rule; the KVS
  240 KiB limit being **bytes not characters** (chunk by chars and the first
  German document breaks the write); and `POST /issue/bulk` returning **only the
  successes** in `body.issues`, which makes positional mapping wrong and, on a
  hierarchy, silently re-parents everything after a rejected element.
  `31-forge-ai-and-llm.md` gains structured-generation practice: output length
  (not context) is the real ceiling so split one call per group; a deadline
  inside the 900 s consumer/poller ceiling with an honest partial; progress into
  the job row; and why a plan approval must be a stricter predicate than a
  destructive confirmation. `24-production-patterns.md` gains pattern 21,
  materialising a generated hierarchy into Jira resumably. New template
  `check-forge-deps.mjs`.
- **2026-08-20** — `19-rate-limit-handling.md` gains the transferable quota-survival patterns from the License Leash incident day: credit-your-own-writes (apps that watch and write the same population read their own writes as external change; ledger genuine changes only — 409/404 no-ops excluded), failed-pass retries deferred to a quiet window with bounded degradation, grace-TTL auth fallbacks vs durable mirrored state, and Forge SQL's own installation rate limits being hit by per-event write storms.
- **2026-06-26** — Folded in production learnings from **lz-ppm-forge**, **se-ppm-forge**, and **CogniRunner**. New docs `25-workflow-modules-deep-dive.md` (create/edit/view split, `expression:"true"`, per-instance rule ids, agentic validation, semantic-PF editmeta pre-flight), `31-forge-ai-and-llm.md` (`@forge/llm` hosted + BYOK multi-provider adapter + three-layer cost guard), `32-forge-realtime.md`. Enhanced `24` (patterns 13–20: stale-draft invalidation, write-verify, two-engine parity, layered config, KVS cost control, issue-link semantics, custom-field screen chain, field-screen preflight), `26` (consumer error handling + `FAIL_IF_EXISTS` idempotency), `06` (cursor-paged `search/jql`, bulkfetch, agile rank, write flags), `28` (HTTPS + port allowlist, correcting the "443 only" myth), `27` (hot-key batching, Forge LLM = Preview), `30` (offline harnesses + parity), `gotchas` (KVS TOCTOU, `expression:"true"`, registry staleness). New templates `workflow-config-view.yml`, `byok-provider-adapter.js`, `forge-llm-cost-guard.js`, `realtime-publisher.js`.
- Merged `06-api-endpoints.md` and the prior `-enhanced.md` variant into one canonical reference, with the per-resource `docs/api/` folder linked as an appendix.
- Renumbered duplicate prefixes: `02-ui-modifications.md` → `14-`, `18-custom-ui-advanced.md` → `23-`.
- Removed the long-stale claim that workflow validators/conditions/post-functions are Connect-only — they are real, supported Forge modules.
- Standardized on the named KVS import: `import { kvs } from '@forge/kvs'`.
- Added five new docs: `26-async-events-and-queues.md`, `27-faas-limits-and-cost.md`, `28-forge-remote-and-egress.md`, `29-custom-field-types.md`, `30-testing-and-tunneling.md`.
- Added three new templates: `async-queue-consumer.yml`, `custom-field-type.yml`, `capability-token-webtrigger.yml`.
- Stripped emoji from shell scripts; added `set -euo pipefail` headers.
