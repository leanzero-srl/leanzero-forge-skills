"use strict";

/**
 * jql-sanitizer — fix common post-JCMA JQL issues that Cloud's strict
 * parser rejects but DC accepted.
 *
 * Transforms, in order:
 *   1. Custom-field ID remap (cf[N] / customfield_N) using a DC→Cloud map.
 *   2. Field rename (both quoted and unquoted forms):
 *        "Customer Request Type" → "Request Type"
 *        Customer Request Type   → Request Type
 *   3. Uppercase reserved operators: NOT IN, IN, IS EMPTY, IS NOT EMPTY,
 *      AND, OR, NOT, WAS, CHANGED.
 *   4. Quote bare string tokens inside IN-lists:
 *        labels NOT IN (Test, TEST)  →  labels NOT IN ("Test", "TEST")
 *      Skip reserved words, numeric tokens, and Cloud-style function calls.
 *   5. Add `()` to DC-style paren-less function names that Cloud requires
 *      with parentheses (e.g. `standardIssueTypes` → `standardIssueTypes()`).
 *
 * Quoted strings are tokenized into single-character placeholders so the
 * regex passes never accidentally match inside a string literal.
 *
 * Usage:
 *   const { sanitizeJql } = require("../src/jqlSanitizer");
 *   const { sanitized, changes } = sanitizeJql(jql, {
 *     fieldRenames: { "My Old Field": "New Field" },
 *     cfMap: { "10042": "10318" },   // DC cf id → Cloud cf id
 *   });
 */

const DEFAULT_FIELD_RENAMES = {
  // JCMA renames Customer Request Type → Request Type on every JSM project.
  "Customer Request Type": "Request Type",
};

const RESERVED_WORDS = new Set([
  "empty", "null", "cf", "true", "false",
  "and", "or", "not", "in", "is", "was", "changed",
  "before", "after", "during", "by", "from", "to", "on",
  "currentuser", "currentlogin", "now",
  "startofday", "endofday", "startofweek", "endofweek",
  "startofmonth", "endofmonth", "startofyear", "endofyear",
]);

// Cloud-required paren forms for what DC accepted bare-word.
const PARENLESS_FUNCTION_NAMES = new Set([
  "standardissuetypes", "subtaskissuetypes",
  "standardworktypes", "subtaskworktypes",
  "votedissues", "watchedissues",
  "votedworkitems", "watchedworkitems",
  "issuehistory", "workitemhistory",
]);

// SOH / STX control chars — cannot legally appear in user JQL.
const PH_OPEN = "\x01";
const PH_CLOSE = "\x02";
const PH_RE = new RegExp(`${PH_OPEN}Q(\\d+)${PH_CLOSE}`);
const PH_RE_G = new RegExp(`${PH_OPEN}Q(\\d+)${PH_CLOSE}`, "g");

function tokenizeQuoted(jql) {
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

function detokenize(s, placeholders) {
  return s.replace(PH_RE_G, (match, n) => {
    const p = placeholders[Number(n)];
    if (!p) return match;
    return `${p.quote}${p.body}${p.quote}`;
  });
}

function isPlaceholder(token) {
  return PH_RE.test(token.trim()) && PH_RE.exec(token.trim())[0] === token.trim();
}

function rewriteCustomFieldIds(jql, cfMap, changes) {
  if (!cfMap) return jql;
  const map = cfMap instanceof Map ? cfMap : new Map(Object.entries(cfMap));
  if (map.size === 0) return jql;
  let out = jql.replace(/\bcf\[(\d+)\]/g, (match, n) => {
    const cloud = map.get(String(n));
    if (cloud == null) return match;
    changes.push({ kind: "cf_remap", from: `cf[${n}]`, to: `cf[${cloud}]` });
    return `cf[${cloud}]`;
  });
  out = out.replace(/\bcustomfield_(\d+)\b/g, (match, n) => {
    const cloud = map.get(String(n));
    if (cloud == null) return match;
    changes.push({ kind: "cf_remap", from: `customfield_${n}`, to: `customfield_${cloud}` });
    return `customfield_${cloud}`;
  });
  return out;
}

function applyFieldRenamesInUnquoted(text, renames, changes) {
  let out = text;
  for (const [from, to] of Object.entries(renames)) {
    const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(?<![A-Za-z0-9_])${escaped}(?![A-Za-z0-9_])`, "g");
    out = out.replace(re, (match) => {
      changes.push({ kind: "field_rename", from: match, to });
      return to;
    });
  }
  return out;
}

function applyFieldRenamesInPlaceholders(placeholders, renames, changes) {
  for (const ph of placeholders) {
    if (ph.body in renames) {
      const to = renames[ph.body];
      changes.push({ kind: "field_rename", from: ph.body, to });
      ph.body = to;
    }
  }
}

function uppercaseOperators(text, changes) {
  const rules = [
    { re: /\b(not\s+in)\b/gi, upper: "NOT IN" },
    { re: /\b(is\s+not\s+empty)\b/gi, upper: "IS NOT EMPTY" },
    { re: /\b(is\s+empty)\b/gi, upper: "IS EMPTY" },
    { re: /\b(in)\b/gi, upper: "IN" },
    { re: /\b(is)\b/gi, upper: "IS" },
    { re: /\b(and)\b/gi, upper: "AND" },
    { re: /\b(or)\b/gi, upper: "OR" },
    { re: /\b(not)\b/gi, upper: "NOT" },
    { re: /\b(was)\b/gi, upper: "WAS" },
    { re: /\b(changed)\b/gi, upper: "CHANGED" },
  ];
  let out = text;
  for (const { re, upper } of rules) {
    out = out.replace(re, (match) => {
      if (match !== upper) changes.push({ kind: "op_upper", from: match, to: upper });
      return upper;
    });
  }
  return out;
}

function quoteInListValues(text, changes) {
  const re = /\b(NOT\s+IN|IN)\s*\(([^)]*)\)/g;
  return text.replace(re, (match, op, inner) => {
    const rewritten = inner.split(",").map((raw) => {
      const leading = raw.match(/^\s*/)[0];
      const trailing = raw.match(/\s*$/)[0];
      const core = raw.trim();
      if (core === "") return raw;
      if (isPlaceholder(core)) return raw;                          // already-quoted string
      if (/^".*"$/.test(core) || /^'.*'$/.test(core)) return raw;   // pre-quoted (defensive)
      if (/^-?\d+(\.\d+)?$/.test(core)) return raw;                 // numeric
      if (RESERVED_WORDS.has(core.toLowerCase())) return raw;       // reserved
      if (/\(/.test(core)) return raw;                              // already a function call
      if (PARENLESS_FUNCTION_NAMES.has(core.toLowerCase())) {
        const fixed = `${core}()`;
        changes.push({ kind: "fn_parens_added", from: core, to: fixed });
        return `${leading}${fixed}${trailing}`;
      }
      const quoted = `"${core.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
      changes.push({ kind: "quote_in_list", from: core, to: quoted });
      return `${leading}${quoted}${trailing}`;
    }).join(",");
    return `${op} (${rewritten})`;
  });
}

/**
 * @param {string} jql
 * @param {object} [options]
 * @param {Record<string,string>} [options.fieldRenames]
 * @param {boolean} [options.uppercaseOperators=true]
 * @param {boolean} [options.quoteInLists=true]
 * @param {Map<string,string>|Record<string,string>} [options.cfMap]    DC cf-id → Cloud cf-id
 * @returns {{ sanitized: string, changes: Array<{kind, from, to}> }}
 */
function sanitizeJql(jql, options = {}) {
  if (!jql || typeof jql !== "string") return { sanitized: jql, changes: [] };
  const renames = { ...DEFAULT_FIELD_RENAMES, ...(options.fieldRenames || {}) };
  const doUppercase = options.uppercaseOperators !== false;
  const doQuoteLists = options.quoteInLists !== false;
  const cfMap = options.cfMap || null;
  const changes = [];

  // cf[N] rewrite runs first, on raw input.
  let working = cfMap ? rewriteCustomFieldIds(jql, cfMap, changes) : jql;

  // Tokenize quoted strings so subsequent regexes can't touch them.
  const { tokenized, placeholders } = tokenizeQuoted(working);
  applyFieldRenamesInPlaceholders(placeholders, renames, changes);

  let t = tokenized;
  t = applyFieldRenamesInUnquoted(t, renames, changes);
  if (doUppercase) t = uppercaseOperators(t, changes);
  if (doQuoteLists) t = quoteInListValues(t, changes);

  return { sanitized: detokenize(t, placeholders), changes };
}

module.exports = {
  sanitizeJql,
  rewriteCustomFieldIds,
  DEFAULT_FIELD_RENAMES,
  RESERVED_WORDS,
  PARENLESS_FUNCTION_NAMES,
};
