"use strict";

/**
 * jql-rewriter — pure-function rewrite of numeric filter / customfield IDs
 * in JQL expressions. Zero deps. Deterministic.
 *
 * Filter ID rewriting handles:
 *   filter = 12345                  →  filter = 67890
 *   filter != "12345"               →  filter != "67890"
 *   filter IN (123, 456, 789)       →  filter IN (501, 502, 503)
 *   filter NOT IN ("123", "456")    →  filter NOT IN ("501", "502")
 *   savedFilter = 12345             →  (alias — treated identically)
 *
 * Custom field ID rewriting handles:
 *   cf[10042]                       →  cf[10318]
 *   customfield_10042               →  customfield_10318
 *
 * AQL function bodies (Assets/CMDB queries embedded inside JQL via
 * aqlFunction("...")) are rewritten via a caller-supplied function — see
 * `rewriteAqlFunctionBodies`. The wrapper handles backslash escaping
 * so the inner AQL string can use a different rewriter.
 *
 * Untouched:
 *   filter = "Some Name"            (non-numeric operand)
 *   ORDER BY / time expressions
 *   String literals like `summary ~ "filter = 123"` — quoted strings are
 *   tokenized into placeholders before rewriting, so the regex passes
 *   never accidentally match inside them.
 */

// Pre-anchored on a non-word char so `savedFilter` matches its own regex and
// `Xfilter` is never accidentally matched.
const EQ_RE = /(?<![A-Za-z0-9_])(filter|savedFilter)(\s*)(=|!=)(\s*)("?)(\d+)\5/gi;
const IN_RE = /(?<![A-Za-z0-9_])(filter|savedFilter)(\s+)(not\s+in|in)(\s*)\(([^)]*)\)/gi;

// Tokenize quoted strings into single-token placeholders so subsequent
// regex passes can't accidentally match inside them.
const PH_OPEN = "\x01";
const PH_CLOSE = "\x02";
const PH_RE_G = new RegExp(`${PH_OPEN}Q(\\d+)${PH_CLOSE}`, "g");

function _tokenizeQuoted(jql) {
  const placeholders = [];
  let result = "";
  let i = 0;
  while (i < jql.length) {
    const c = jql[i];
    if (c === '"' || c === "'") {
      const quote = c;
      let body = "";
      i++;
      while (i < jql.length) {
        const cc = jql[i];
        if (cc === "\\" && i + 1 < jql.length) { body += cc + jql[i + 1]; i += 2; continue; }
        if (cc === quote) { i++; break; }
        body += cc; i++;
      }
      const idx = placeholders.length;
      placeholders.push({ quote, body });
      result += `${PH_OPEN}Q${idx}${PH_CLOSE}`;
    } else {
      result += c; i++;
    }
  }
  return { tokenized: result, placeholders };
}

function _detokenize(s, placeholders) {
  return s.replace(PH_RE_G, (match, n) => {
    const p = placeholders[Number(n)];
    if (!p) return match;
    return `${p.quote}${p.body}${p.quote}`;
  });
}

/**
 * Extract every numeric filter-id reference found in a JQL string.
 *
 * @param {string} jql
 * @returns {Array<{id: string, keyword: string, operator: string, form: "eq"|"in"}>}
 */
function extractFilterIds(jql) {
  if (!jql || typeof jql !== "string") return [];
  const found = [];

  // For EQ form, tokenize quoted strings so we ignore embedded numeric IDs
  // inside string literals (e.g. summary ~ "filter = 123"). For IN form,
  // we operate on raw text because IN-list members like `"3"` are legitimate
  // quoted numeric IDs that should be picked up — those don't appear inside
  // string literals because `IN ("...")` would be parsed as a search value,
  // not an ID list.
  const { tokenized } = _tokenizeQuoted(jql);

  EQ_RE.lastIndex = 0;
  let m;
  while ((m = EQ_RE.exec(tokenized)) !== null) {
    found.push({ id: m[6], keyword: m[1], operator: m[3], form: "eq" });
  }

  IN_RE.lastIndex = 0;
  while ((m = IN_RE.exec(jql)) !== null) {
    const keyword = m[1];
    const operator = m[3];
    for (const token of m[5].split(",")) {
      const t = token.trim();
      const num = t.match(/^"?(\d+)"?$/);
      if (num) found.push({ id: num[1], keyword, operator, form: "in" });
    }
  }
  return found;
}

/**
 * Rewrite filter-id references in `jql` using `dcToCloudMap` (string→string,
 * or a Map). IDs without a mapping are left intact and reported in
 * `unresolved`.
 *
 * @param {string} jql
 * @param {Map<string,string>|Object<string,string>} dcToCloudMap
 * @returns {{ rewritten: string, replacements: Array<{dcId, cloudId, form}>, unresolved: string[] }}
 */
function rewriteFilterIds(jql, dcToCloudMap) {
  if (!jql || typeof jql !== "string") {
    return { rewritten: jql, replacements: [], unresolved: [] };
  }
  const map = dcToCloudMap instanceof Map
    ? dcToCloudMap
    : new Map(Object.entries(dcToCloudMap || {}));

  const replacements = [];
  const unresolved = new Set();
  const lookup = (id) => {
    const v = map.get(String(id));
    return v != null ? String(v) : null;
  };

  // Phase 1 — equality forms (`filter = N`). Tokenize quoted strings first
  // so we don't rewrite an ID embedded in a text-search string literal
  // like `summary ~ "filter = 123"`.
  const { tokenized, placeholders } = _tokenizeQuoted(jql);
  let rewritten = tokenized.replace(EQ_RE, (match, keyword, ws1, op, ws2, quote, numId) => {
    const cloudId = lookup(numId);
    if (!cloudId) { unresolved.add(numId); return match; }
    replacements.push({ dcId: numId, cloudId, form: "eq" });
    return `${keyword}${ws1}${op}${ws2}${quote}${cloudId}${quote}`;
  });
  // Detokenize before IN-list rewriting (which needs to see quoted numeric
  // members like `"3"` inside the IN parens).
  rewritten = _detokenize(rewritten, placeholders);

  // Phase 2 — IN lists. Operate on raw text per-token, so quoted numerics
  // (legitimate quoted IDs) and named/function tokens (filter names) are
  // handled in one pass. The IN_RE captures the inner content as a single
  // group, so we never accidentally match into adjacent string literals.
  rewritten = rewritten.replace(IN_RE, (_, keyword, ws1, op, ws2, inner) => {
    const tokens = inner.split(",").map((tok) => {
      const leading = tok.match(/^\s*/)[0];
      const trailing = tok.match(/\s*$/)[0];
      const core = tok.trim();
      const numMatch = core.match(/^("?)(\d+)("?)$/);
      if (!numMatch) return tok;
      const [, openQ, numId, closeQ] = numMatch;
      if (openQ !== closeQ) return tok;
      const cloudId = lookup(numId);
      if (!cloudId) { unresolved.add(numId); return tok; }
      replacements.push({ dcId: numId, cloudId, form: "in" });
      return `${leading}${openQ}${cloudId}${closeQ}${trailing}`;
    });
    return `${keyword}${ws1}${op}${ws2}(${tokens.join(",")})`;
  });

  return { rewritten, replacements, unresolved: Array.from(unresolved) };
}

/**
 * Rewrite `cf[N]` and `customfield_N` references inside JQL using
 * `dcToCloudCfMap` (DC numeric id → Cloud numeric id).
 *
 *   cf[10042]            →  cf[10318]
 *   customfield_10042    →  customfield_10318
 *
 * Operates on the raw string — these forms don't appear inside legitimate
 * string literals.
 */
function rewriteCustomFieldIds(jql, dcToCloudCfMap) {
  if (!jql || typeof jql !== "string") return { rewritten: jql, replacements: [] };
  const map = dcToCloudCfMap instanceof Map
    ? dcToCloudCfMap
    : new Map(Object.entries(dcToCloudCfMap || {}));
  if (map.size === 0) return { rewritten: jql, replacements: [] };

  const replacements = [];

  let out = jql.replace(/\bcf\[(\d+)\]/g, (match, n) => {
    const cloud = map.get(String(n));
    if (cloud == null) return match;
    replacements.push({ from: `cf[${n}]`, to: `cf[${cloud}]` });
    return `cf[${cloud}]`;
  });

  out = out.replace(/\bcustomfield_(\d+)\b/g, (match, n) => {
    const cloud = map.get(String(n));
    if (cloud == null) return match;
    replacements.push({ from: `customfield_${n}`, to: `customfield_${cloud}` });
    return `customfield_${cloud}`;
  });

  return { rewritten: out, replacements };
}

/**
 * Scan `jql` for `aqlFunction("...")` calls and rewrite the inner AQL
 * string via the supplied function. Handles backslash-escaped quotes.
 *
 * @param {string} jql
 * @param {(aql: string) => {rewritten: string, replacements: any[], unresolved: string[]}} aqlRewriteFn
 */
function rewriteAqlFunctionBodies(jql, aqlRewriteFn) {
  if (!jql || typeof jql !== "string" || typeof aqlRewriteFn !== "function") {
    return { rewritten: jql, replacements: [], unresolved: [] };
  }
  const replacements = [];
  const unresolved = new Set();
  const re = /\b(aqlFunction)\s*\(\s*"((?:[^"\\]|\\.)*)"\s*\)/gi;

  const rewritten = jql.replace(re, (_match, fname, escapedBody) => {
    const body = escapedBody.replace(/\\(.)/g, "$1");
    const result = aqlRewriteFn(body);
    if (result && Array.isArray(result.replacements)) {
      for (const r of result.replacements) replacements.push({ ...r, function: fname });
    }
    if (result && Array.isArray(result.unresolved)) {
      for (const u of result.unresolved) unresolved.add(u);
    }
    const newBody = (result && result.rewritten) || body;
    const reescaped = newBody.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return `${fname}("${reescaped}")`;
  });

  return { rewritten, replacements, unresolved: Array.from(unresolved) };
}

module.exports = {
  extractFilterIds,
  rewriteFilterIds,
  rewriteCustomFieldIds,
  rewriteAqlFunctionBodies,
};
