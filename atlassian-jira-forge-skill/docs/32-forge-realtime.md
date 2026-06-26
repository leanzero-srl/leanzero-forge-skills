# Forge Realtime (`@forge/realtime`)

Push live UI updates between users of the same app surface without polling on the critical path. Grounded in **lz-ppm-forge** (`src/services/realtime/publisher.js`), which uses it for multi-user plan presence and draft-lock awareness.

> Realtime is a **Preview** Forge feature as of 2026-06. The design below treats it as **additive** — polling stays the authoritative path so a realtime miss never corrupts state.

## The shape that works in production

```javascript
// src/services/realtime/publisher.js
import { publish } from '@forge/realtime';

export async function emitPlanEvent(planId, type, data = {}) {
  if (!planId || !type) return;
  try {
    await publish(`plan:${planId}`, { v: 1, type, planId, ts: Date.now(), ...data });
  } catch (err) {
    // Realtime is additive; the polling fallback covers any miss. Never throw.
  }
}
```

Four non-negotiable design rules, all visible above:

1. **Module-scoped, per-entity channel** — `plan:{planId}`. One channel per logical entity keeps events inside the globalPage context (no cross-context data leak) and lets a client subscribe to exactly the entity it's viewing.
2. **Metadata-only events (<1 KB)** — send `{ v, type, planId, ts }` plus a tiny diff, never the full state. Clients **re-fetch full state** via existing resolvers on receipt. This dodges payload limits and keeps the authoritative read in one place.
3. **Never-throw, best-effort** — a publish failure must never break the mutation that triggered it. Swallow every error.
4. **Polling fallback is the authoritative path** — lz-ppm polls every **60 s** regardless (see KVS cost control in `24-production-patterns.md`). Realtime only *shortens* the window between a change and other users seeing it; if an event is dropped, the next poll reconciles.

## Versioned event envelope

The `v: 1` field future-proofs the wire format — a client that sees a `v` it doesn't understand can ignore the event and fall back to its poll. Keep `type` a small enum (`draft-saved`, `lock-acquired`, `lock-released`, `plan-written`, `presence`) and let each `type` carry only the ids a client needs to decide whether to re-fetch.

## Where it fits the concurrency model

lz-ppm pairs realtime with the drafts + write-locks model (see `24-production-patterns.md` pattern 5):

- On `acquireLock` / `refreshLock` / `releaseLock` → emit a lock event so other tabs grey out the editor immediately rather than after the next 60 s poll.
- On `saveDraft` → emit a presence/draft event so collaborators see overlap warnings sooner.
- The actual lock/draft **state** still lives in KVS and is still polled — realtime is purely a latency optimisation over that.

## Gotchas

- **Don't make realtime load-bearing.** If your correctness depends on the event arriving, you've built a bug. Always reconcile via a poll or an explicit re-fetch.
- **Subscribe client-side to the same channel string** you publish to; mismatched channel names fail silently (no error, no events).
- **Keep events tiny.** Treat anything over ~1 KB as a smell — send an id, let the client read the rest.
- **Preview status** — verify the API surface against the current runtime reference before shipping; phrase any behaviour you depend on as "observed in production (2026-06)".

## See also

- `24-production-patterns.md` — drafts + write-locks (pattern 5), KVS cost control / 60 s polling
- `15-bridge-api-reference.md` — the `@forge/bridge` client side
- `templates/realtime-publisher.js` — copy-paste publisher
- https://developer.atlassian.com/platform/forge/runtime-reference/ (check for the current `@forge/realtime` reference)
