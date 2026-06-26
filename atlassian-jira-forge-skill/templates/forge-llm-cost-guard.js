/*
 * Template: Three-layer cost guard for an (advisory) AI feature
 * ----------------------------------------------------------------------------
 * Wraps any paid LLM call so it is:
 *   1. OFF by default + behind soft monthly/daily caps (admin kill-switch)
 *   2. Result-cached (TTL) keyed by content hash + entity + account
 *   3. Token-metered, best-effort — a meter write NEVER fails the feature
 *
 * Cache ONLY complete, clean results (never errors / truncated answers), or a
 * cut-off answer freezes and gets re-served as authoritative. Meter ONLY
 * billable round-trips (usage present == the LLM was actually charged).
 *
 * Auth/caveats:
 *   - Advisory only: the run() callback must not mutate user data.
 *   - hashSummary is pure-JS FNV-1a (no crypto import needed in the sandbox).
 *   - run() returns { result, usage }; usage carries input_tokens/output_tokens.
 * Source: lz-ppm-forge src/resolvers/ai-resolvers.js
 */
import { kvs } from '@forge/kvs';

const CFG_KEY = 'cfg:ai';
const CACHE_TTL_MS = 10 * 60 * 1000;     // 10 minutes
const DEFAULT_MONTHLY_CAP = 500;
const DEFAULT_DAILY_CAP = 100;

async function getCfg() {
  const c = (await kvs.get(CFG_KEY)) || {};
  return {
    enabled: !!c.enabled,                                          // default OFF
    monthlyCap: Number.isFinite(c.monthlyCap) ? c.monthlyCap : DEFAULT_MONTHLY_CAP,
    dailyCap: Number.isFinite(c.dailyCap) ? c.dailyCap : DEFAULT_DAILY_CAP,
  };
}

/** Stable FNV-1a hash of a value (+ length). Identical input => free cache hit. */
export function hashSummary(value) {
  const str = JSON.stringify(value);
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${(h >>> 0).toString(16)}-${str.length}`;
}

/**
 * Guarded AI call.
 * @param {string} cacheKey  unique per {entity, account, content-hash}
 * @param {() => Promise<{ result: object, usage?: {input_tokens,output_tokens} }>} run
 */
export async function guardedAi(cacheKey, run) {
  const cfg = await getCfg();
  if (!cfg.enabled) return { enabled: false };

  // 1. Cache hit — free, no LLM, no meter.
  if (cacheKey) {
    try {
      const cached = await kvs.get(cacheKey);
      if (cached?.result && Date.now() - (cached.at || 0) < CACHE_TTL_MS) {
        return { enabled: true, cached: true, cachedAt: cached.at, ...cached.result };
      }
    } catch { /* cache read is best-effort */ }
  }

  // 2. Cap enforcement — BEFORE any spend.
  const month = new Date().toISOString().slice(0, 7);
  const day = new Date().toISOString().slice(0, 10);
  const monthKey = `cfg:ai:usage:${month}`;
  const dayKey = `cfg:ai:usage:day:${day}`;
  const monthMeter = (await kvs.get(monthKey)) || { reviews: 0, inputTokens: 0, outputTokens: 0 };
  const dayMeter = (await kvs.get(dayKey)) || { reviews: 0 };

  if (cfg.monthlyCap > 0 && monthMeter.reviews >= cfg.monthlyCap)
    return { enabled: true, capReached: true, scope: 'month', cap: cfg.monthlyCap, used: monthMeter.reviews };
  if (cfg.dailyCap > 0 && dayMeter.reviews >= cfg.dailyCap)
    return { enabled: true, capReached: true, scope: 'day', cap: cfg.dailyCap, used: dayMeter.reviews };

  // 3. The only path that calls the paid LLM.
  const { result, usage } = await run();

  // 4. Meter ONLY billable round-trips (usage present, even on a parse failure).
  if (usage) {
    try {
      monthMeter.reviews += 1;
      monthMeter.inputTokens  += usage.input_tokens  || 0;
      monthMeter.outputTokens += usage.output_tokens || 0;
      dayMeter.reviews += 1;
      await kvs.set(monthKey, monthMeter);
      await kvs.set(dayKey, dayMeter);
    } catch { /* meter is best-effort; never fail the feature on a meter write */ }
  }

  // 5. Cache ONLY complete, clean results.
  if (cacheKey && result && !result.error && !result.parseError && !result.incomplete) {
    try { await kvs.set(cacheKey, { result, at: Date.now() }); } catch { /* best-effort */ }
  }

  return { enabled: true, cached: false, ...result };
}

/* --- Example usage ---------------------------------------------------------
resolver.define('reviewThing', async ({ payload, context }) => {
  const accountId = context?.accountId || 'anon';
  const cacheKey = `cfg:ai:cache:${payload.entityId}:${accountId}:${hashSummary(payload.summary)}`;
  return guardedAi(cacheKey, async () => {
    const { findings, usage } = await callTheLLM(payload.summary); // your BYOK/@forge-llm call
    return { result: { findings }, usage };
  });
});
--------------------------------------------------------------------------- */
