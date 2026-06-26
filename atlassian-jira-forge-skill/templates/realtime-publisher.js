/*
 * Template: Forge Realtime publisher (additive, never-throw)
 * ----------------------------------------------------------------------------
 * Module-scoped, per-entity channel. Events are metadata-only (<1 KB) — clients
 * re-fetch full state via existing resolvers. A publish failure must NEVER break
 * the mutation that triggered it, so every error is swallowed. Polling stays the
 * AUTHORITATIVE path (e.g. every 60 s); realtime only shortens the latency.
 *
 * Auth/caveats:
 *   - @forge/realtime is a Preview Forge feature (verify against the current
 *     runtime reference before shipping).
 *   - Subscribe client-side to the SAME channel string, or events drop silently.
 *   - Never make correctness depend on an event arriving — always reconcile via
 *     a poll / explicit re-fetch.
 * Source: lz-ppm-forge src/services/realtime/publisher.js
 */
import { publish } from '@forge/realtime';

/**
 * Emit a tiny, versioned event on the per-entity channel.
 * @param {string} entityId  e.g. a plan/board/record id
 * @param {string} type      small enum: 'lock-acquired' | 'draft-saved' | ...
 * @param {object} [data]    a few ids only — NOT the full state
 */
export async function emitEntityEvent(entityId, type, data = {}) {
  if (!entityId || !type) return;
  try {
    await publish(`entity:${entityId}`, { v: 1, type, entityId, ts: Date.now(), ...data });
  } catch (err) {
    // Additive: the polling fallback covers any miss. Never throw.
  }
}

/* --- Example wiring (pair with the drafts + write-lock model) --------------
import { emitEntityEvent } from './realtime-publisher';

await acquireLock(planId, accountId, displayName);
await emitEntityEvent(planId, 'lock-acquired', { accountId });   // others grey out the editor now

await saveDraft(planId, accountId, displayName, changes, calc, keys);
await emitEntityEvent(planId, 'draft-saved', { accountId });     // collaborators see overlap sooner
--------------------------------------------------------------------------- */
