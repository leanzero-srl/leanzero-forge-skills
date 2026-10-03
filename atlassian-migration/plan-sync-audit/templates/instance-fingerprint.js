"use strict";

/**
 * Instance fingerprint — guard against accidentally applying a plan to the
 * WRONG tenant.
 *
 * Every plan is built against a specific (sourceBaseUrl, destBaseUrl) pair.
 * Re-using a plan against a different destination silently writes data to
 * the wrong place: cached IDs from tenant A leak into tenant B, the audit
 * compares against the wrong issues, and a 1-minute mistake takes hours to
 * roll back.
 *
 * Usage:
 *
 *   // At plan time, stamp the plan
 *   const fp = require("../src/instanceFingerprint");
 *   planManager.patchEntry("__meta__", { instanceSignature: fp.build({
 *     destBaseUrl: process.env.CLOUD_BASE_URL,
 *     sourceBaseUrl: process.env.DC_BASE_URL,
 *   })});
 *
 *   // At sync time, verify before mutating
 *   fp.verify(plan.entries.__meta__.instanceSignature, {
 *     destBaseUrl: process.env.CLOUD_BASE_URL,
 *     sourceBaseUrl: process.env.DC_BASE_URL,
 *     allowMismatch: opts.allowInstanceMismatch,
 *   });   // throws unless URLs match or allowMismatch=true
 *
 * Compatibility is checked on baseUrl pairs (case-insensitive,
 * trailing-slash insensitive). Empty source URL (Cloud→Cloud-source-less
 * plans) is permitted.
 */

const crypto = require("crypto");

function _normalize(u) {
  return String(u || "").trim().toLowerCase().replace(/\/+$/, "");
}

function _fingerprint(dest, source) {
  return crypto
    .createHash("sha1")
    .update(`dest:${dest}|source:${source}`)
    .digest("hex")
    .slice(0, 8);
}

/**
 * Build a signature record to stamp into a plan at creation time.
 *
 * @param {{destBaseUrl: string, sourceBaseUrl?: string}} opts
 * @returns {{fingerprint: string, destBaseUrl: string, sourceBaseUrl: string, capturedAt: string}}
 */
function build(opts) {
  const dest = _normalize(opts.destBaseUrl);
  const source = _normalize(opts.sourceBaseUrl);
  return {
    fingerprint: _fingerprint(dest, source),
    destBaseUrl: dest,
    sourceBaseUrl: source,
    capturedAt: new Date().toISOString(),
  };
}

const REASONS = {
  DEST_MISMATCH: "dest-baseurl-mismatch",
  SOURCE_MISMATCH: "source-baseurl-mismatch",
  NO_STORED: "no-stored-signature",
};

/**
 * Compare a stored signature against the current configuration.
 *
 * @param {object|null} stored        Signature stamped on the plan
 * @param {{destBaseUrl: string, sourceBaseUrl?: string}} current
 * @returns {{compatible: boolean, reason?: string, details?: string, currentFingerprint: string, storedFingerprint: string|null}}
 */
function compare(stored, current) {
  const curDest = _normalize(current.destBaseUrl);
  const curSource = _normalize(current.sourceBaseUrl);
  const currentFingerprint = _fingerprint(curDest, curSource);
  if (!stored || (!stored.destBaseUrl && !stored.sourceBaseUrl)) {
    return {
      compatible: false,
      reason: REASONS.NO_STORED,
      details: "plan has no instance signature — either pre-dates this check or was hand-edited",
      currentFingerprint,
      storedFingerprint: (stored && stored.fingerprint) || null,
    };
  }
  const storedDest = _normalize(stored.destBaseUrl);
  const storedSource = _normalize(stored.sourceBaseUrl);
  if (storedDest && curDest && storedDest !== curDest) {
    return {
      compatible: false,
      reason: REASONS.DEST_MISMATCH,
      details: `destination baseUrl mismatch: plan built for "${storedDest}", current config points at "${curDest}"`,
      currentFingerprint,
      storedFingerprint: stored.fingerprint,
    };
  }
  if (storedSource && curSource && storedSource !== curSource) {
    return {
      compatible: false,
      reason: REASONS.SOURCE_MISMATCH,
      details: `source baseUrl mismatch: plan built against "${storedSource}", current config points at "${curSource}"`,
      currentFingerprint,
      storedFingerprint: stored.fingerprint,
    };
  }
  return { compatible: true, currentFingerprint, storedFingerprint: stored.fingerprint };
}

/**
 * Verify a stored signature, throwing on mismatch unless `allowMismatch` is
 * true. Logs a warning on the soft `NO_STORED` case and proceeds.
 *
 * @param {object|null} stored
 * @param {{destBaseUrl: string, sourceBaseUrl?: string, allowMismatch?: boolean, log?: object}} opts
 */
function verify(stored, opts) {
  const log = opts.log || console;
  const result = compare(stored, {
    destBaseUrl: opts.destBaseUrl,
    sourceBaseUrl: opts.sourceBaseUrl,
  });

  if (result.compatible) {
    log.log(
      `[instance-fingerprint] OK — plan and current config match (fp=${result.currentFingerprint})`,
    );
    return;
  }

  const header = `INSTANCE MISMATCH: plan was built for a different (source, destination) pair than the one this run targets.`;
  const detail =
    `  reason:    ${result.reason}\n` +
    `  details:   ${result.details}\n` +
    `  stored fp: ${result.storedFingerprint || "(none)"}\n` +
    `  current fp:${result.currentFingerprint}`;

  if (opts.allowMismatch) {
    log.warn(header);
    log.warn(detail);
    log.warn(
      "  Continuing only because --allow-instance-mismatch was passed.\n" +
      "  Cached IDs, custom field mappings, and validation responses will be sent\n" +
      "  to the currently-configured destination — make sure that's what you want.",
    );
    return;
  }

  if (result.reason === REASONS.NO_STORED) {
    log.warn(
      `[instance-fingerprint] Plan has no signature (pre-dates this check, or hand-edited). ` +
      `Proceeding, but verify this is the right plan for "${_normalize(opts.destBaseUrl)}".`,
    );
    return;
  }

  throw new Error(
    `${header}\n${detail}\n\n` +
    `Two ways out:\n` +
    `  1. (RECOMMENDED) Re-run the plan phase against the current configuration.\n` +
    `  2. (DANGEROUS) Pass --allow-instance-mismatch — only if you intentionally\n` +
    `     want to apply a plan from another tenant.`
  );
}

module.exports = { build, compare, verify, REASONS };
