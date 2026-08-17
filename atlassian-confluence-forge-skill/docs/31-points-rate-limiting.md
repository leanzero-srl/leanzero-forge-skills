# Points-based rate limiting (enforced 2026-03-02) — surviving Tier 1

Battle-tested on a 13,500-user Confluence estate (License Leash, Aug 2026: a 42h
outage → ~447k pts/day measured → ~12-point quiet hours). Facts verified against
https://developer.atlassian.com/cloud/confluence/rate-limiting/ on 2026-08-12;
re-verify before quoting, the tiers are still labelled beta in places.

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
