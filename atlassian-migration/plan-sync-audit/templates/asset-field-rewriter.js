"use strict";

/**
 * asset-field-rewriter — rewrite direct Assets (CMDB/Insight) field
 * references in JQL after a DC→Cloud or Cloud→Cloud migration.
 *
 * After migration:
 *   - DC numeric objectIds are stale (Cloud Assets re-mints IDs on import).
 *   - DC object keys (e.g. CI-21171) may or may not survive depending on
 *     how Cloud Assets was imported.
 *   - ARI references (`ari:cloud:cmdb::object/<workspaceId>/<id>`) contain
 *     stale objectIds and possibly a stale workspaceId.
 *
 * The Atlassian-documented Cloud syntax for direct asset-field references
 * is the OBJECT NAME, e.g.:
 *   "Development Team" = "Native Makers"
 *   "Affected Hardware" IN ("Laptop A", "Laptop B")
 *
 * This rewriter operates only on clauses whose LHS field name appears in
 * `assetFieldNames` (so non-asset fields aren't touched).
 *
 * Pairs with `jql-rewriter.js#rewriteAqlFunctionBodies` — the AQL function
 * wrapper rewriter handles `aqlFunction("...")` payloads separately; this
 * one masks those blocks so it doesn't accidentally touch them.
 *
 * Usage:
 *
 *   const { rewriteAssetFieldRefs } = require("../src/assetFieldRewriter");
 *
 *   const { rewritten, replacements, unresolved } = rewriteAssetFieldRefs(jql, {
 *     assetFieldNames: ["development team", "affected hardware"],  // lowercase
 *     dcKeyToCloudName:      new Map([["CI-21171", "Native Makers"]]),
 *     dcObjectIdToCloudName: new Map([["14032", "Native Makers"]]),
 *     cloudObjectIdToCloudName: new Map([["89001", "Native Makers"]]),
 *   });
 */

const ARI_RE  = /^ari:cloud:[^/]+\/(?:[^/]+\/)*([A-Z][A-Z0-9_]*-\d+|\d+)$/i;
const ASSET_KEY_RE = /^[A-Z][A-Z0-9_]*-\d+$/i;
const NUMERIC_RE   = /^\d+$/;
// Display form: "Some Name (CI-12345)" — the DC asset picker renders this
// way and JCMA copies the literal text into Cloud filter JQL.
const KEYED_NAME_RE = /^.+?\s*\(([A-Z][A-Z0-9_]*-\d+|\d+)\)\s*$/i;

function _normalizeName(s) {
  return String(s || "").normalize("NFC").trim().toLowerCase();
}
function _unescape(s) { return String(s).replace(/\\(.)/g, "$1"); }
function _escape(s) { return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"'); }

/**
 * Mask `aqlFunction("...")` (and `aqlfunction("...")`) blocks so the
 * field-ref regexes don't accidentally rewrite something inside an AQL
 * payload. Returns `{masked, restore}` — call `restore(s)` to re-insert
 * the originals into the rewritten string.
 */
function maskAqlFunctionBlocks(jql) {
  const stash = [];
  const re = /\baqlFunction\s*\(\s*"(?:[^"\\]|\\.)*"\s*\)/gi;
  const masked = jql.replace(re, (m) => {
    const idx = stash.length;
    stash.push(m);
    return `\x01AQL${idx}\x02`;
  });
  return {
    masked,
    restore: (s) => s.replace(/\x01AQL(\d+)\x02/g, (_m, n) => stash[Number(n)] || ""),
  };
}

/**
 * Classify a single RHS value token. Returns `{kind, core, originallyQuoted, quote, lookupKey}`.
 * `kind` ∈ "ari" | "key" | "numeric" | "keyed-key" | "keyed-numeric" | "name" | "empty".
 */
function classifyValueToken(rawToken) {
  let core = rawToken.trim();
  let originallyQuoted = false;
  let quote = '"';
  if ((core.startsWith('"') && core.endsWith('"')) ||
      (core.startsWith("'") && core.endsWith("'"))) {
    quote = core[0];
    core = _unescape(core.slice(1, -1));
    originallyQuoted = true;
  }
  if (!core) return { kind: "empty", originallyQuoted, quote, core: "" };
  const ari = core.match(ARI_RE);
  if (ari) return { kind: "ari", core, originallyQuoted, quote, lookupKey: ari[1] };
  if (ASSET_KEY_RE.test(core)) return { kind: "key", core, originallyQuoted, quote, lookupKey: core };
  if (NUMERIC_RE.test(core)) return { kind: "numeric", core, originallyQuoted, quote, lookupKey: core };
  const keyed = core.match(KEYED_NAME_RE);
  if (keyed) {
    return {
      kind: NUMERIC_RE.test(keyed[1]) ? "keyed-numeric" : "keyed-key",
      core, originallyQuoted, quote, lookupKey: keyed[1],
    };
  }
  return { kind: "name", core, originallyQuoted, quote };
}

/**
 * Resolve a classified token to a Cloud asset name using the supplied
 * lookup maps. Returns `{name, dcKey}` or `{name: null}` if no resolution
 * is possible.
 *
 * Resolution order (most specific first):
 *   1. ARI tail → cloudObjectIdToCloudName / cloudKeyToCloudName
 *   2. Asset key → dcKeyToCloudName, then cloudKeyToCloudName
 *   3. Numeric → dcObjectIdToCloudName, then cloudObjectIdToCloudName
 *   4. Bare name → pass through (assumed already correct)
 */
function resolveTokenToName(cls, maps) {
  const get = (m, k) => (m && m.get(k)) || null;
  switch (cls.kind) {
    case "ari": {
      const tail = cls.lookupKey;
      if (NUMERIC_RE.test(tail)) {
        return { name: get(maps.cloudObjectIdToCloudName, tail), dcKey: tail };
      }
      return { name: get(maps.cloudKeyToCloudName, tail), dcKey: tail };
    }
    case "key":
    case "keyed-key":
      return {
        name: get(maps.dcKeyToCloudName, cls.lookupKey) ||
              get(maps.cloudKeyToCloudName, cls.lookupKey),
        dcKey: cls.lookupKey,
      };
    case "numeric":
    case "keyed-numeric":
      return {
        name: get(maps.dcObjectIdToCloudName, cls.lookupKey) ||
              get(maps.cloudObjectIdToCloudName, cls.lookupKey),
        dcKey: cls.lookupKey,
      };
    case "name":
      // Bare name — assumed correct, no rewrite.
      return { name: null };
    default:
      return { name: null };
  }
}

/**
 * Rewrite direct asset-field references in `jql`. Only clauses whose LHS
 * field name appears in `assetFieldNames` are touched. Returns
 * `{rewritten, replacements, unresolved}`.
 *
 * @param {string} jql
 * @param {object} options
 * @param {Iterable<string>} options.assetFieldNames - asset field names (will be normalized to lowercase)
 * @param {Map<string,string>} [options.dcKeyToCloudName]
 * @param {Map<string,string>} [options.dcObjectIdToCloudName]
 * @param {Map<string,string>} [options.cloudObjectIdToCloudName]
 * @param {Map<string,string>} [options.cloudKeyToCloudName]
 */
function rewriteAssetFieldRefs(jql, options = {}) {
  if (!jql || typeof jql !== "string") {
    return { rewritten: jql, replacements: [], unresolved: [] };
  }
  const nameSet = new Set(
    Array.from(options.assetFieldNames || []).map(_normalizeName),
  );
  if (nameSet.size === 0) return { rewritten: jql, replacements: [], unresolved: [] };

  const maps = {
    dcKeyToCloudName: options.dcKeyToCloudName || null,
    dcObjectIdToCloudName: options.dcObjectIdToCloudName || null,
    cloudObjectIdToCloudName: options.cloudObjectIdToCloudName || null,
    cloudKeyToCloudName: options.cloudKeyToCloudName || null,
  };

  const replacements = [];
  const unresolved = new Set();

  // Mask aqlFunction(...) bodies first.
  const { masked, restore } = maskAqlFunctionBlocks(jql);

  // Build a regex matching any quoted form of the asset field names.
  // (Bare unquoted form is risky inline-with-other-tokens — skip for safety.)
  const names = Array.from(nameSet)
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .map((n) => n.replace(/\s+/g, "\\s+"));
  if (names.length === 0) return { rewritten: jql, replacements, unresolved: [] };
  names.sort((a, b) => b.length - a.length);
  const FIELD_RE = new RegExp(`(["'])(${names.join("|")})\\1`, "gi");

  const matches = [];
  for (const m of masked.matchAll(FIELD_RE)) {
    if (!nameSet.has(_normalizeName(m[2]))) continue;
    matches.push({ start: m.index, end: m.index + m[0].length, original: m[0] });
  }
  matches.sort((a, b) => a.start - b.start);

  // Walk back-to-front so splice offsets stay valid.
  let work = masked;
  for (let i = matches.length - 1; i >= 0; i--) {
    const match = matches[i];
    const after = work.slice(match.end);
    const opMatch = after.match(/^\s*(=|!=|\bNOT\s+IN\b|\bIN\b)\s*/i);
    if (!opMatch) continue;
    const op = opMatch[1].toUpperCase().replace(/\s+/g, " ");
    const opEnd = match.end + opMatch[0].length;

    if (op === "IN" || op === "NOT IN") {
      if (work[opEnd] !== "(") continue;
      // Find matching close paren respecting quoted strings.
      let j = opEnd + 1, depth = 1, inQ = false, qc = "";
      while (j < work.length && depth > 0) {
        const ch = work[j];
        if (inQ) {
          if (ch === "\\" && j + 1 < work.length) { j += 2; continue; }
          if (ch === qc) inQ = false;
          j++; continue;
        }
        if (ch === '"' || ch === "'") { inQ = true; qc = ch; }
        else if (ch === "(") depth++;
        else if (ch === ")") depth--;
        if (depth === 0) break;
        j++;
      }
      if (depth !== 0) continue;

      const inner = work.slice(opEnd + 1, j);
      const tokens = _splitTopLevelCommas(inner);
      let anyChange = false;
      const newTokens = tokens.map((raw) => {
        const cls = classifyValueToken(raw);
        if (cls.kind === "empty" || cls.kind === "name") return raw;
        const resolved = resolveTokenToName(cls, maps);
        if (!resolved.name) {
          unresolved.add(`${match.original}:${cls.core}`);
          return raw;
        }
        anyChange = true;
        const leading = raw.match(/^\s*/)[0];
        const trailing = raw.match(/\s*$/)[0];
        replacements.push({ field: match.original, dcValue: cls.core, cloudName: resolved.name, form: cls.kind });
        return `${leading}"${_escape(resolved.name)}"${trailing}`;
      });
      if (!anyChange) continue;
      const newClause = `${match.original}${opMatch[0]}(${newTokens.join(",")})`;
      work = work.slice(0, match.start) + newClause + work.slice(j + 1);
      continue;
    }

    // Equality form
    const valSlice = work.slice(opEnd);
    let valMatch = valSlice.match(/^(["'])((?:[^"'\\]|\\.)*)\1/);
    let valLen;
    let valToken;
    if (valMatch) { valToken = valMatch[0]; valLen = valMatch[0].length; }
    else {
      valMatch = valSlice.match(/^(ari:cloud:[^\s)]+|[A-Z][A-Z0-9_]*-\d+|\d+)/i);
      if (!valMatch) continue;
      valToken = valMatch[0]; valLen = valMatch[0].length;
    }
    const cls = classifyValueToken(valToken);
    if (cls.kind === "empty" || cls.kind === "name") continue;
    const resolved = resolveTokenToName(cls, maps);
    if (!resolved.name) {
      unresolved.add(`${match.original}:${cls.core}`);
      continue;
    }
    replacements.push({ field: match.original, dcValue: cls.core, cloudName: resolved.name, form: cls.kind });
    const newClause = `${match.original}${opMatch[0]}"${_escape(resolved.name)}"`;
    work = work.slice(0, match.start) + newClause + work.slice(opEnd + valLen);
  }

  return {
    rewritten: restore(work),
    replacements,
    unresolved: Array.from(unresolved),
  };
}

// Split on top-level commas, respecting quoted strings and parentheses.
function _splitTopLevelCommas(s) {
  const out = [];
  let buf = "", depth = 0, inQ = false, qc = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQ) {
      buf += ch;
      if (ch === "\\" && i + 1 < s.length) { buf += s[++i]; continue; }
      if (ch === qc) inQ = false;
      continue;
    }
    if (ch === '"' || ch === "'") { buf += ch; inQ = true; qc = ch; continue; }
    if (ch === "(") { buf += ch; depth++; continue; }
    if (ch === ")") { buf += ch; depth--; continue; }
    if (ch === "," && depth === 0) { out.push(buf); buf = ""; continue; }
    buf += ch;
  }
  if (buf.length > 0) out.push(buf);
  return out;
}

module.exports = {
  rewriteAssetFieldRefs,
  classifyValueToken,
  resolveTokenToName,
  maskAqlFunctionBlocks,
};
