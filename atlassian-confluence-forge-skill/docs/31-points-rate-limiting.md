# Points-based rate limiting (enforced 2026-03-02) — surviving Tier 1

Battle-tested on a 13,500-user Confluence estate (License Leash, Aug 2026: a 42h
outage → ~447k pts/day measured). Facts verified against
https://developer.atlassian.com/cloud/confluence/rate-limiting/ on 2026-08-12 and
re-verified 2026-08-26; re-verify before quoting, the tiers are still labelled beta
in places.

> ⚠ **2026-08-26 correction.** An earlier version of this file claimed "~12-point
> quiet hours". That number was what four count-probes cost the app's OWN METER, not
> what the hour cost. Atlassian's server-side telemetry for the same app came back at
> **~1,110,000 pts/day (P75 66k/hr, P90 98k, max 102k)** against a self-reported
> 250-280k — a ~4x under-count caused entirely by the app's own instrument. Never
> quote a self-measured points figure without the reconciliation in §"Measuring
> truthfully" below. If your meter and Atlassian's telemetry disagree, your meter is
> wrong until proven otherwise.

## The model (verified numbers)

- **1 point per request**, +**2 points per identity object** returned (users,
  groups, permissions), +1 per core content object (pages, spaces). Writes = 1.
  ⇒ a `limit=200` group-members page = **401 points**.
- **Tier 1 (default): 65,000 points/hour SHARED ACROSS EVERY INSTALL of your app**
  — one noisy tenant starves the rest, and you can observe your pool being drained
  by tenants you cannot see (measured: `remaining=0` at :23 past with own spend ≈ 0).
- **Tier 2 (per-tenant, post-review only)**: Free 65k · Standard 100k+10/user ·
  Premium 130k+20/user · Enterprise 150k+30/user, capped 500k/hr. No self-serve.
- **Headers**: `Beta-RateLimit-Policy: "global-app-quota";q=65000;w=3600` (drops
  the Beta- prefix at enforcement); on 429 `RateLimit-Reason` says which limit —
  doc values `confluence-quota-global-based|tenant-based`, but LIVE we received
  `conf-global-based`: match loosely. **Never infer your pool from silence** — the
  header on a real 429 is the only proof a Tier-2 grant took effect.
- The **Org Admin API is a separate pool** (~200 req/60s; pace ~325ms) and Forge
  SQL/KVS cost nothing against either — both are relief valves.

## What actually counts (the cheapest optimisation there is)

**Only app-initiated BACKEND traffic consumes points.** Atlassian Staff, on the
record (community.developer.atlassian.com thread 97828, post #133):

> "For the March 2 enforcement, only app-initiated backend traffic counts toward
> points-based rate limits. Direct, user-initiated UI calls from Forge UI to Jira or
> Confluence using `@forge/bridge.requestJira` (with no resolver or backend) is
> treated as standard UI traffic and is **not** included in points."

And what IS counted (post #135): "App-initiated backend calls — for example, UI →
resolver → backend (`@forge/api`); Forge Remote flows invoked from the UI; Forge
Remote flows invoked from backend code."

⇒ **A read that exists only to paint a screen for the user in front of it can be
moved from a resolver to `@forge/bridge` and stops costing points entirely.** This is
the highest-leverage change available to a points-constrained Forge app and it is
not in the rate-limiting docs. Caveats before you reach for it: Atlassian reserve the
right to include this category later "with clear advance notice"; `@forge/bridge`
calls run as the USER, so they see only what that user can see (a licence/admin view
that must be app-scoped cannot move); and it is not a laundering route for background
work — the exemption is for genuinely user-initiated UI reads.

`asApp()` vs `asUser()` through `@forge/api` makes no difference: both are
app-initiated backend calls. The line Atlassian draw is backend-vs-frontend, not
app-vs-user.

## The per-endpoint costs nobody publishes

**There is no official per-endpoint cost catalog.** Atlassian publish exactly three
worked Confluence examples (single page = 2, single space = 2, single user = 3) and
one multi-object example, on the JIRA page:

> "Since each user object costs 2 points ... `GET /rest/api/3/group/member` ...
> Cost calculation: 1 (base) + 8 users = 17 points (1 + 8 × 2)"

Everything else you will read — here included — is DERIVED from the published rule
plus the OpenAPI page-size defaults. Two consequences:

- **The rule is not applied consistently.** A Marketplace partner measured Jira
  endpoints that ignore it and charge a flat 1 point regardless of object count
  (`project/{id}/version` at ~500 results → 1 point; `permissions/project` at ~1000
  → 1). Their conclusion: "we cannot trust the global rule documented so far."
  Atlassian never answered. **Derived costs are upper bounds, not plans.**
- **A POST that READS is ambiguous, and the fork is 500x.** The doc's write row is
  keyed on HTTP verb but its description says "operations that create, update, or
  remove data". `POST /wiki/api/v2/users-bulk` (250 ids) is therefore either 1 point
  or 501. Partner measurements of `POST /rest/api/3/search/jql` show ~11.4 pts/call
  against 50 calls, i.e. per-object. **Assume the expensive reading on a hot path
  until you have measured it.**

### The space-permissions trap (measured, and it will bite you)

`GET /wiki/api/v2/spaces/{id}/permissions` returns one row per (principal,
operation), and **permissions are IDENTITY objects at 2 points each** — Atlassian's
own cost table names "Users, Groups, **Permissions**". A partner reported, on this
exact endpoint (thread 97828, post #157):

> "consumes two points. Not per call. Not per principal. **Two points per
> permission.** ... Confluence generates 480 permissions for this space with two real
> users, so invoking this endpoint once consumes nearly 1,000 points."

Atlassian Staff replied "I will review the point costs you highlighted and circle
back" (#160) and never did. At `limit=250` one page is **1 + 2×250 = 501 points**, so
a space whose permission list runs to 90 pages costs ~45,000 — most of a Tier-1 hour
in a single read. **Live confirmation from License Leash, 2026-08-26T08:51Z:** that
walk was refused with `remaining=0` on page 94. At 1 pt/page those 94 pages are 94
points and the hour could not have been exhausted; at 501 they are ~47,000 and it
lands exactly where it did.

The Confluence doc separately warns that "**Permissions, Search, Admin operations**"
carry additional burst protections beyond the points pool.

## Measuring truthfully (the mistake that produced the 4x gap)

**Your self-meter is not capture-only if anything reads it.** License Leash's meter
carried a "CAPTURE ONLY: never gates" contract — true of the function, false of the
system, because a self-imposed budgeter summed its `est_points` to decide when to
stand background work down. A meter that under-counts is a budgeter that never
fires. Three defects, all worth checking in your own instrument:

1. **Implementing only two of the three terms.** `points = 1 + 2*identity` drops
   "+1 per other object" — every content object you read records as free.
2. **The wrong argument at ONE call site.** One read passed its count as `objects:`
   where the pricing line only read `identityObjects:`; a 250-row page booked as 1
   point against 501. Grep every meter call site and make the odd one out impossible:
   a test asserting the exact expected points per shape catches it, a structural
   test does not.
3. **Tallies that never reach storage.** Batched tallies flushed from background
   handlers only; no resolver flushed, so everything spent serving the admin UI —
   chiefly the authorisation walk — died with the isolate.

**The ground truth is on every response.** `X-RateLimit-Remaining` (and
`RateLimit-Policy` / `RateLimit` post-beta, carrying `q`, `w`, `r`, `t`) is
Atlassian's own counter. The DELTA in `remaining` across two consecutive responses is
the true cost of what happened between them — which is how you calibrate a derived
model against reality without asking anybody. Log it.

**The Forge App metrics API cannot substitute.** `FORGE_API_REQUEST_COUNT`
(developer.atlassian.com/platform/forge/export-app-metrics/) returns REQUEST counts;
the object multiplier is precisely the term it does not carry, so it cannot tell 1
point per page from 501.

**Forge surfaces no Atlassian request/trace id to app code**, so a refusal in your
logs cannot be joined to a row in Atlassian's telemetry. Say so plainly in a support
ticket and offer to capture whatever header they name.

## Pool scope: what is actually documented

The docs and every Atlassian Staff answer say **per APP, shared across all tenants**:
"Your app shares a single 65,000 point hourly quota across all tenants." The word
*environment* appears in NEITHER rate-limiting doc, in no staff post in the 174-post
thread, and in the Forge environments doc.

Atlassian ecosystem support told License Leash (2026-08-26) that enforcement is keyed
on the **OAuth client id**, and that development/staging/production each therefore get
their own 65k. **That is not documented anywhere and the published evidence points the
other way** (a partner states in thread 98197 that "the Global Pool applies across all
environments", uncorrected by two replying staff). Get it in writing before you plan
around it, and do not assume your dev environment is free.

## Architecture patterns that survived production

1. **Contain at the SCHEDULING layer, never per call site.** Twelve polite callers
   still add up to the same 137 pages. Gate whether a PASS runs; per-call 429
   handling remains only as the reactive backstop. Never gate an AUTH path on
   quota state — a background job's 429 must not lock admins out.
2. **Count tripwires**: 1-pt member-count probes decide whether a full read runs.
   Baselines must be RAW per-group counts keyed by group id, recorded by the same
   representation you compare against (a filtered/union size never matches raw
   totals — ships an inert tripwire that everyone believes works). Counts decide
   whether to LOOK, never whether to ACT; exclude any consumer whose stale read
   can revoke/destroy. Prove skips FIRE in prod logs — and log full-read REASONS
   too, or flapping counts are indistinguishable from lost baselines.
3. **Scheduled re-reads belong in a quiet window** (e.g. 18:00–05:00 UTC). The
   count-can't-see swap case is schedule, not evidence: defer its re-baseline to
   the night with a hard ceiling (bound the deferral on an EPISODE stamp set at
   the first occurrence — a bound on a per-retry-restamped timestamp never fires).
4. **Self-imposed soft budget** (e.g. 40k of 65k) with per-pass admission at
   entry; exempt user-facing paths; clamp admitted cost to the whole budget or a
   pass estimated above it parks forever; the computed hold must never be
   persisted as an observed one.
5. **Telemetry first**: meter 1+2×objects per response into an hourly
   per-endpoint table (capture-only, never throws, never gates) BEFORE
   optimizing. Our worst consumer was not the one anyone guessed — and one
   consumer (auth memberof walks) was invisible until metered.
6. **User-facing resilience**: the claim path falls back to the app's own count
   (with an empty-read floor AND a near-cap margin) and writes through the Org
   API pool — a real user got access back in 7s mid-storm.
7. **Read-cost hygiene**: counts endpoints over member walks for display numbers;
   delete unused pagers (especially any without a rate-limit gate); memoize
   directory misses per invocation but record negatives ONLY from COMPLETE
   listings and never persist them.
8. **CREDIT YOUR OWN WRITES (2026-08-20).** An app that both watches group counts
   (pattern 2) and writes memberships reads its own writes as external change:
   one self-service grant at 11:00Z moved the managed count, and the 11:22Z
   tripwire ordered the full ~36k-point sweep to discover the app's own write —
   pool empty by :26. Keep a ledger of own membership writes at the LOWEST HTTP
   write layer (the two-to-four functions every feature path drains through, so
   no caller can forget it), and treat a count that moved exactly as far as your
   ledgered writes as no-evidence. Credit only GENUINE state changes: Confluence
   group add answers **409 for already-a-member**, DELETE **404 for
   not-a-member**, Org API v2 memberships the same shape — a credited no-op is
   the ONE inaccuracy that can mask a real external change (your phantom +1
   cancelling a real +1); every other inaccuracy just costs one spurious full
   read, so degrade toward "no credit" on any doubt (SQL error, missing baseline,
   failed write). Sum per watched group since each consumer's OWN baseline stamp;
   the residual maskable case (external change exactly cancelling real own
   writes) is the same count-identical swap the bounded re-baseline (pattern 3)
   has always existed to catch.
9. **Failed-pass retries are schedule, not evidence (2026-08-20).** A repair pass
   that retries a failed run every daytime hour spends the pool on a read that
   keeps failing — ours finished off an already-tight hour at 14:23Z. Defer
   retries of NON-load-bearing repair to the quiet window with bounded
   degradation: >48h since last completion → retry any hour (a broken window
   config degrades to old behaviour, never to "never"), never-completed → run
   immediately (bootstrap must not be parked), and the operator's run-now button
   bypasses everything. Persist the deferral in status, not only the log.
10. **Grace windows are not ground truth (2026-08-20).** Auth resilience built as
   a per-account stale-verdict TTL (serve the last proven verdict for ≤24h while
   Atlassian refuses) still locks out any admin returning after a gap LONGER
   than the grace, during an exhausted hour — widening the window (30min→24h
   after the first incident) only moved the edge, and the edge was hit 8 days
   later. Every fallback keyed to "recent success" expires; authorization that
   must survive rate-limit storms needs durable local state (a mirrored small
   group in SQL, refreshed opportunistically) whose staleness never opens a
   deny-shaped hole.

## Forge platform gotchas met on the way

- `forge logs` silently caps output (~21 lines) — always pass `-n`.
- Module scope survives warm containers: in-memory throttles/memos need explicit
  time bounds; cross-invocation state belongs in SQL/KVS.
- If your resolver wrapper authorizes BEFORE running migrations, any new column
  read on the auth path must tolerate both schemas or a mid-storm deploy locks
  admins out with no admin-path recovery.
- `forge deploy` ships the existing `static/*/build` — rebuild frontends and
  verify an in-app build stamp equals `git rev-parse --short HEAD`.
- Cross-hop queue events drop ad-hoc fields — persist per-run attribution in the
  run's own state blob, and always verify a threaded value has a PRODUCER.
- **Forge SQL has its own installation rate limits**, hit in practice by
  product-event handler storms: per-page-view tracking writes produced ~100
  `ForgeSQLError RATE_LIMIT_EXCEEDED` ("Limits for the current installation have
  been exceeded") in one burst (2026-08-20 11:44Z, 13.5k-user estate). Batch
  event-driven SQL writes and treat this error as transient backpressure, not
  data loss — but do NOT lean on SQL as a free relief valve inside hot loops.
- The shared Tier-1 pool draining at the SAME wall-clock hour on different days
  (`remaining=0` at ~:23 past 14:00Z on both 2026-08-12 and 2026-08-20, own
  spend modest) is evidence of ANOTHER tenant's scheduled job in your pool —
  export the per-hour ledger for the Tier-2 case rather than tuning your own app
  harder.
