# atlassian-organizations-api-skill changelog

Dated entries moved out of SKILL.md (skill-lint, 2026-10-30). Newest entries may be at the top or bottom as they were in SKILL.md.

- **2026-10-09** — Measured on a 17-site org: `POST /admin/v2/orgs/{orgId}/workspaces` rows are ~3.2 KB each (icons,
  links, relationships), so `{"limit":100}` (91 rows) is ~290 KB and `{"limit":50}` ~158 KB; the next page's cursor goes
  in the BODY (`{"cursor": ..., "limit": n}`), and a body `query` naming a product (e.g. "jira") answers 400. Group
  membership writes are eventually consistent: a DELETE then POST of the same membership both answered 204 and the
  count/groups reads reflected the POST within ~15 s. `users/count` with `resourceIds`, `roleIds=atlassian/user`,
  `roleIds=atlassian/admin`, `status=active` matched a hand count on all 32 products.

- **2026-10-09** — `docs/15-license-and-activity-patterns.md` Pattern 8: per-product per-site seat counts in one call (`users/count?resourceIds=&roleIds=atlassian/user&roleIds=atlassian/admin&status=active`), `groups?accountIds=&resourceIds=` for a user's seat-granting groups, no v2 member-list GET (404), `platformRoles` on user details, billable-role table. Measured on the wolfaenpak org (17 sites, 19 users) for CogniRunner 1.32.0's rolling-licence agent. The wolfaenpak org key is `WOLF_ORG_API_KEY` / `WOLF_ORG_ID` in ~/Projects/forge-live-harness/.env; it reaches ONE org (wolfaenpak), which owns leanzero-demo, leanzero.atlassian.net and 15 test sites.
- **2026-10-27** — `WOLF_ORG_API_KEY` now returns 401 on every call; `WOLF_ORG_API_KEY_WATCHDOG` (same .env) works. Measured on wolfaenpak (23 members): bare `users/count` with `-` equals the real directory id and INCLUDES suspended members; `status` on count takes active|suspended|not_invited|deactivated|for_deletion (`inactive` and `claimStatus=claimed` -> 400). Docs: "By default, users in all your directories and all your managed accounts are counted". Community thread 3314762: a customer's count returns 0 while stats/search work with the same (scoped) key, not reproduced.

- **2026-08-26** — `problem-patterns.md` gains a section establishing that this API is a **separate rate-limit regime from the 2026 product points model**, assembled from three documented facts (its limits are counted in REQUESTS not points; the Admin API key is token traffic, which CHANGE-2958 explicitly exempts; and the points doc scopes itself to Jira/Confluence, while from Forge this is reached by external fetch). Carries the published per-endpoint numbers — **last-active-dates at 200/min per organization**, Events and Polling APIs down to 10/min since May 2025 — the ~68-minute floor 200/min imposes on a 13,500-user sweep, and the operational traps (the pace gate is per isolate, so two concurrent Org-heavy passes blow a pool a user-facing path may share; 429 WARNs with `retry 1/2` are normal on long cursor walks; `links.next` is a bare cursor token, not a URL). Upshot: a Jira/Confluence points exhaustion does not stop Org API work, making it a genuine relief valve for identity questions.
- **2026-06-26** — Added `docs/15-license-and-activity-patterns.md` and
  `templates/last-active-and-membership.js`; expanded `gotchas.md` (suspend-is-global,
  Admin-API-key specifics, last-active "2s view" + multi-site scoping, membership ≠
  product access). Source: **License Leash** Forge app — production
  use of the per-product/per-site license-management + activity endpoint cluster
  (`last-active-dates`, workspace resolution, forward-filtered license groups, group
  role-assignments, idempotent membership writes, App Access Funnel role-assign).

---
