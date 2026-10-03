"use strict";

/**
 * Composition / app-macro storage-XHTML rewriter.
 *
 * Distilled from confluence/composition-tabs/src/compositionMacroProcessor.js
 * (Appfire Composition Tabs DC->Cloud fix). See docs/22-confluence-app-macro-migration.md.
 *
 * Rewrites mis-migrated app macros in Confluence STORAGE format (not ADF):
 * the structure is itself storage-format, so a pure splice rewrite preserves
 * macro ids, schema versions, rich-text bodies, and unsupported params
 * byte-for-byte. Example default: deck -> tab-group, card -> tab,
 * card "label" param -> tab "title" param.
 *
 * Core ideas:
 *   1. findCandidateMacros  - walk XHTML, maintain an ancestorStack so each
 *                             instance knows its parent_name + ancestors[].
 *   2. shouldRewrite        - DEFAULT-DENY: rewrite "deck" always; rewrite
 *                             "card" only with positive evidence (Composition
 *                             ancestor OR Composition-shaped param), else SKIP
 *                             with a recorded reason (don't touch native cards).
 *   3. rewriteStorage       - splice edits applied BACK-TO-FRONT (descending
 *                             span start) so earlier edits never shift later
 *                             offsets; param rename with conflict-delete.
 *   4. semanticHash         - skip byte-identical no-ops on re-run (idempotency).
 *
 * No external deps. No emoji (CI-safe).
 */

const crypto = require("crypto");

const STRUCT_CLOSE = "</ac:structured-macro>";
const STRUCT_CLOSE_LEN = STRUCT_CLOSE.length;

const DEFAULT_RULES = {
  // oldName -> { newName, paramRenames: { fromParam: toParam } }
  deck: { newName: "tab-group", paramRenames: { id: "deckId" } }, // Composition renames the deck's id param to deckId on tab-group; set {} to keep id
  card: { newName: "tab", paramRenames: { label: "title" } },
};
// names that count as a "Composition ancestor" when classifying a card
const DEFAULT_COMPOSITION_ANCESTORS = new Set(["deck", "card", "tab-group", "tab"]);

class CompositionMacroProcessor {
  constructor(opts = {}) {
    this.rules = opts.rules || DEFAULT_RULES;
    this.oldDeckSet = new Set(opts.oldDeckKeys || ["deck"]);
    this.oldCardSet = new Set(opts.oldCardKeys || ["card"]);
    this.compositionAncestors = opts.compositionAncestors || DEFAULT_COMPOSITION_ANCESTORS;
    this.log = opts.log || (() => {});
  }

  /**
   * Walk storage XHTML and return every <ac:structured-macro ac:name="..."> with
   * its ancestor context. Each entry:
   *   { name, macroId, params, parent_name, ancestors, span:[start,end], headerEnd, selfClose }
   */
  findCandidateMacros(xml) {
    const out = [];
    // stack of currently-open structured-macros: { name, end } where `end` is the
    // offset just past this macro's matching close tag. We pop entries whose close
    // we've already passed BEFORE recording ancestors, so siblings never inherit
    // each other's ancestry (this is what makes default-deny on "card" correct).
    const stack = [];
    const openRe = /<ac:structured-macro\b[^>]*?(\/?)>/g;
    let m;
    while ((m = openRe.exec(xml)) !== null) {
      const tag = m[0];
      const selfCloseTag = m[1] === "/";
      const nameMatch = /\bac:name\s*=\s*"([^"]*)"/.exec(tag);
      const idMatch = /\bac:macro-id\s*=\s*"([^"]*)"/.exec(tag);
      const name = nameMatch ? nameMatch[1] : null;
      const macroId = idMatch ? idMatch[1] : null;
      const start = m.index;
      const headerEnd = m.index + tag.length;

      // discard any ancestors whose close tag is before this macro starts
      while (stack.length && stack[stack.length - 1].end <= start) stack.pop();

      const ancestors = stack.map((s) => s.name);
      const parent_name = stack.length ? stack[stack.length - 1].name : null;
      const isCandidate = name && (this.oldDeckSet.has(name) || this.oldCardSet.has(name));

      if (selfCloseTag) {
        if (isCandidate) {
          out.push({
            name, macroId, params: {}, parent_name, ancestors,
            span: [start, headerEnd], headerEnd, selfClose: true,
          });
        }
        continue; // self-close never pushes
      }

      // opening tag: find its matching close to get the full span
      const end = this._findClose(xml, headerEnd);
      if (isCandidate) {
        out.push({
          name, macroId,
          params: this._topLevelParams(xml.slice(headerEnd, end - STRUCT_CLOSE_LEN)),
          parent_name, ancestors,
          span: [start, end], headerEnd, selfClose: false,
        });
      }
      // push this open onto the stack (named or not, so card->deck ancestry is right);
      // it will be popped once a later macro starts past `end`.
      stack.push({ name: name || "<unnamed>", end });
    }
    return out;
  }

  // Find the offset just past the matching </ac:structured-macro> for an open tag
  // whose body starts at `from`. Counts nested opens so we balance correctly.
  _findClose(xml, from) {
    let depth = 1;
    let i = from;
    const tokenRe = /<ac:structured-macro\b[^>]*?(\/?)>|<\/ac:structured-macro>/g;
    tokenRe.lastIndex = from;
    let t;
    while ((t = tokenRe.exec(xml)) !== null) {
      if (t[0] === STRUCT_CLOSE) {
        depth--;
        if (depth === 0) return t.index + STRUCT_CLOSE_LEN;
      } else if (t[1] !== "/") {
        depth++;
      }
      i = t.index;
    }
    return xml.length; // unbalanced — fall back to EOF
  }

  // Extract top-level <ac:parameter ac:name="X"> names present in a macro body.
  _topLevelParams(inner) {
    const params = {};
    const re = /<ac:parameter\b[^>]*?\bac:name\s*=\s*"([^"]*)"[^>]*?(\/?)>/g;
    let m;
    while ((m = re.exec(inner)) !== null) params[m[1]] = true;
    return params;
  }

  /**
   * DEFAULT-DENY decision. -> { rewrite:boolean, reason:string }
   */
  shouldRewrite(instance) {
    if (!instance || !instance.name) return { rewrite: false, reason: "no-name" };
    if (this.oldDeckSet.has(instance.name)) return { rewrite: true, reason: "deck-always" };
    if (this.oldCardSet.has(instance.name)) {
      const hasCompositionAncestor = (instance.ancestors || []).some((a) => this.compositionAncestors.has(a));
      if (hasCompositionAncestor) return { rewrite: true, reason: "card-composition-ancestor" };
      const labelKey = Object.keys(this.rules[instance.name]?.paramRenames || {})[0];
      if (labelKey && labelKey in (instance.params || {})) {
        return { rewrite: true, reason: `card-has-${labelKey}-param` };
      }
      return { rewrite: false, reason: "ambiguous-card-no-deck-ancestor-no-label" };
    }
    return { rewrite: false, reason: "name-not-in-old-keys" };
  }

  /**
   * Splice-rewrite accepted instances back-to-front. Returns { newXml, changes, skipped }.
   */
  rewriteStorage(xml, instances) {
    const changes = [];
    const skipped = [];
    const accepted = [];
    for (const inst of instances) {
      const d = this.shouldRewrite(inst);
      if (d.rewrite) accepted.push(inst);
      else skipped.push({ macroId: inst.macroId, name: inst.name, span: inst.span, reason: d.reason });
    }
    // descending by start so earlier rewrites don't shift later spans
    accepted.sort((a, b) => b.span[0] - a.span[0]);

    let cur = xml;
    for (const inst of accepted) {
      const rule = this.rules[inst.name];
      if (!rule || !rule.newName) {
        skipped.push({ macroId: inst.macroId, name: inst.name, span: inst.span, reason: "no-rule-for-name" });
        continue;
      }
      const [start, end] = inst.span;
      const macroXml = cur.slice(start, end);
      const headerLen = inst.headerEnd - start;
      const header = macroXml.slice(0, headerLen);
      const rest = macroXml.slice(headerLen);

      // 1. rename ac:name on the OPENING tag only
      const newHeader = header.replace(
        /(\bac:name\s*=\s*")([^"]+)(")/,
        (_f, p1, _n, p3) => `${p1}${rule.newName}${p3}`,
      );

      // 2. rename/delete top-level params in the body
      let newRest = rest;
      const renames = [];
      if (!inst.selfClose) {
        const innerLen = rest.length - STRUCT_CLOSE_LEN;
        if (innerLen > 0) {
          const inner = rest.slice(0, innerLen);
          const closer = rest.slice(innerLen);
          newRest = this._rewriteParams(inner, rule.paramRenames || {}, renames) + closer;
        }
      }
      cur = cur.slice(0, start) + newHeader + newRest + cur.slice(end);
      changes.push({
        macroId: inst.macroId, oldName: inst.name, newName: rule.newName,
        paramRenames: renames, ancestor: inst.parent_name, reason: this.shouldRewrite(inst).reason,
      });
    }
    return { newXml: cur, changes, skipped };
  }

  // Rename top-level <ac:parameter ac:name="from"> -> "to"; if "to" already exists,
  // DELETE the "from" block instead (canonical "to" wins). Back-to-front to keep offsets.
  _rewriteParams(inner, paramRenames, renamesOut) {
    const existing = this._topLevelParams(inner);
    const ops = [];
    const re = /<ac:parameter\b[^>]*?\bac:name\s*=\s*"([^"]*)"[^>]*?(\/?)>/g;
    let m;
    while ((m = re.exec(inner)) !== null) {
      const from = m[1];
      const to = paramRenames[from];
      if (!to) continue;
      const tagStart = m.index;
      if (m[2] === "/") {
        ops.push({ from, to, kind: "rename-self", start: tagStart, tagEnd: m.index + m[0].length, end: m.index + m[0].length });
      } else {
        const closeIdx = inner.indexOf("</ac:parameter>", m.index);
        const blockEnd = closeIdx === -1 ? inner.length : closeIdx + "</ac:parameter>".length;
        ops.push({ from, to, kind: "rename", start: tagStart, tagEnd: m.index + m[0].length, end: blockEnd });
      }
    }
    ops.sort((a, b) => b.start - a.start); // back-to-front
    let out = inner;
    for (const op of ops) {
      if (existing[op.to]) {
        // conflict: delete the "from" block entirely
        out = out.slice(0, op.start) + out.slice(op.end);
        renamesOut.push({ from: op.from, to: op.to, deleted: true });
      } else {
        const openTag = out.slice(op.start, op.tagEnd).replace(
          /(\bac:name\s*=\s*")([^"]+)(")/, (_f, p1, _n, p3) => `${p1}${op.to}${p3}`,
        );
        out = out.slice(0, op.start) + openTag + out.slice(op.tagEnd);
        renamesOut.push({ from: op.from, to: op.to });
      }
    }
    return out;
  }

  // SHA-1 of storage for byte-identical no-op detection (idempotency on re-run).
  semanticHash(storage) {
    return crypto.createHash("sha1").update(storage, "utf8").digest("hex");
  }

  // Build the discovery CQL for a space (or all spaces if spaceKey is null).
  discoveryCql(spaceKey) {
    const macroList = [...new Set([...this.oldDeckSet, ...this.oldCardSet])].map((k) => `"${k}"`).join(",");
    return spaceKey
      ? `space = "${spaceKey}" AND macro in (${macroList}) AND type = page ORDER BY id`
      : `macro in (${macroList}) AND type = page ORDER BY id`;
  }
}

module.exports = { CompositionMacroProcessor, DEFAULT_RULES };
