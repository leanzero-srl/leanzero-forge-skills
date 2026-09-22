# Production patterns — a real 15-rule migration

This skill was distilled from a live engagement: replicating one Jira Service Management project's
entire automation rule library from a production tenant onto a sandbox tenant in the same
Atlassian organization, with production kept strictly read-only throughout. This is the shape of
what that actually took, end to end.

## The setup

- One project's automation rules on production: 15 rules, enumerated via `GET /rule/summary`
  filtered by `scope=ari:cloud:jira:<prodCloudId>:project/<id>`.
- Target: the same project (same key, different numeric id) on a sandbox site in the same
  Atlassian organization.
- Constraint: zero writes to production at any point; every create landed on sandbox only, gated
  on an explicit client go-ahead before the first write.

## What the remap pipeline actually needed to handle

Enumerating the 15 rules and running the cross-tenant-reference scan (`docs/gotchas.md` §"three
ways a copied rule breaks") found:

- **13 of 15 rules** had no hidden cross-tenant references beyond the structural ones
  (`ruleScopeARIs`, trigger `eventFilters`) — straightforward once the field-id map for the
  project's custom fields was built.
- **1 rule** embedded both a `cf[NNNNN]` field id AND a full Assets object ARI in the same JQL
  condition string (a region-gating rule reading an Assets-typed "Region" field and comparing it
  against a specific Assets object). Resolving the object required reading its `Name` on the
  source workspace, then AQL-searching the target workspace for an object with that same name in
  the equivalent object type.
- **2 rules** (both `jira.issue.create` actions building tickets in a sibling project) used the
  raw project/issuetype id trap from `docs/gotchas.md` — invisible to the `cf[]`/ARI scanner,
  surfaced only after a successful create with a specific `CREATE_ISSUES ... missing.permissions
  .connection-user` error, because the connection-user genuinely couldn't create in what was, from
  the target's perspective, someone else's (production's) project.
- **Zero rules** needed group-UUID remapping — every `restrict-issue-transition`-style group
  reference and every `authorAccountId`/collaborator accountId resolved identically on both sites,
  confirmed by looking the same group/account up on each site independently and getting the same
  UUID back. This is a genuinely useful shortcut when the source and target are in the same
  Atlassian organization: don't build remapping machinery for something that doesn't need it.

## The actual run

1. Fetch all 15 full rule bodies from production (`GET /rule/{uuid}` × 15).
2. Build the field-id map once (source field id → name → target field id), reused across all 15
   rules and across the parallel workflow-migration work happening on the same project.
3. Remap each rule: `ruleScopeARIs`, trigger `eventFilters`, every `cf[NNNNN]` found by regex, the
   one Assets object ARI, and — after the first pass surfaced them — the two raw project/issuetype
   ids.
4. Create each rule `DISABLED` on the target with a fresh v7 uuid and a valid target-tenant
   `authorAccountId` (`docs/gotchas.md`'s three rules).
5. Verify: full-text-scan every created rule's read-back for the source tenant's cloudId or any
   source project id — zero matches on all 15 confirmed no cross-tenant reference survived.
6. Flip each rule's `state` to match production's exactly (12 enabled, 3 disabled in this case) —
   only after step 5 passed, never before.

**Result:** 13 of 15 rules succeeded outright on the first properly-formed attempt once the three
create rules were known; the remaining 2 needed one additional, specific fix (the raw id trap) that
only revealed itself after a real, informative error — not the generic parse failure — because the
first four requirements were already satisfied.

## What this generalizes to

The pattern — enumerate, scan for hidden references, resolve by name, verify by scanning the
read-back rather than trusting a diff against the source — is the same shape needed for:

- Auditing what automation exists on a project before a migration or a security review (you can't
  see rules from the site's own REST API at all; this is the only path).
- Copying one client tenant's automation-rule library into a reusable template for a similar
  client (strip the source-specific field/project/object references, replace with placeholders,
  document what each placeholder needs).
- "What fires on this ticket" investigations where the UI's own rule list doesn't make triggers and
  scope obvious at a glance.
