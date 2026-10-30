# jira-api-skill — changelog

Moved out of SKILL.md (skill-lint, 2026-10-30). Newest first.

- **2026-10-29** — New `docs/31-boards-and-queues.md`: writing board columns (incl. WIP limits), quick filters, swimlanes, JSM queues (create, edit List-view columns, delete, reorder) and a queue's Board view (a hidden Kanban board, added through a GraphQL mutation) with an API token. All internal and unsupported, every recipe run end to end on a test site and read back. Traps: filter lookup by name is fuzzy (take the id from the POST response), `currentStatisticsField:"none_"` switches WIP limits off, unmapped statuses drop their issues off the board, unknown queue column ids are stored silently, deleted queues leave undeletable project-scoped filters.
- **2026-10-03** — `01-core-concepts.md`, `03-workflow-conditions.md`, `07-permissions-scopes.md` and `when-to-use-which.md` no longer say the workflow modules are Connect-only or that a condition runs a Forge function. Per the Forge manifest schema (`@forge/manifest` 12.9.0) `jira:workflowCondition` has a REQUIRED `expression` and NO `function`; validators and post-functions run functions.
- **2026-08-26** — `gotchas.md` gains the `POST /issue/bulk` result-mapping trap,
  found while building a document→backlog generator: the response carries only
  the SUCCESSES in `body.issues` and reports failures separately by
  `failedElementNumber`, so positional mapping mis-attributes every key after a
  rejected element — cosmetic on a flat batch, and silently wrong parenthood on
  a hierarchy. Includes the failures-first mapping and the rule that a count
  mismatch must record nothing rather than guess.

- **2026-08-26** — `27-rate-limits-and-quotas.md` now states plainly that the 2026 **points-based model does NOT govern API-token integrations** — CHANGE-2958: "API token-based traffic is not affected by this change" — so token auth stays on the classic burst limits and must not be re-architected around points. Flags the exception that DOES reach here (OAuth 2.0 3LO is app-initiated backend traffic and IS in scope, sharing one 65k/hr pool across every tenant of the client id) and points at the Forge points guide for that case. Plus: the delta in `X-RateLimit-Remaining` across two consecutive responses is the real cost of what happened between them — log it before modelling anything.
- 2026-06-26: Distilled REST edge-cases from production Forge apps (se-ppm-forge `services/jira-client.js`, CogniRunner) into `06-api-endpoints.md` and `gotchas.md`: issue-link inward/outward direction (counter-intuitive — verify before bulk), cursor-paginated `POST /rest/api/3/search/jql` (`nextPageToken`), `POST /rest/api/3/issue/bulkfetch` (chunk 100), `GET /editmeta` pre-flight to avoid silent no-op field writes, verify-after-write (re-read + diff), and `notifyUsers=false` / `overrideScreenSecurity=true` write flags.
- Replaced the legacy "JWT — Server-to-server authentication" claim with the three actually-valid Cloud REST options (API token Basic auth, OAuth 2.0 3LO, Forge `api.asUser/asApp`). Locally-signed JWTs are an Atlassian Connect pattern and are not validated by the v3 REST API.
- Added four new REST-API-specific docs: `24-rest-integration-patterns.md`, `27-rate-limits-and-quotas.md`, `28-adf-construction.md`, `30-testing-rest-integrations.md`.
- Standardized scripts: stripped emoji, added `set -euo pipefail`, made CI-safe.
- Added a "Pick a starting point" block and a documentation map that distinguishes canonical REST coverage from the bundled Forge-flavored reference content.
- 2026-10-22: added the transition-date post function recipe (system:update-field + %%CURRENT_DATETIME%%), proven live on wolfaenpak.
