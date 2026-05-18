"use strict";

/**
 * adf-builders — zero-dep helpers for constructing, walking, and hashing
 * Atlassian Document Format (ADF) JSON.
 *
 * Builder usage:
 *
 *   const adf = require("../src/adfBuilders");
 *   const description = adf.doc(
 *     adf.paragraph(adf.text("Status: "), adf.text("APPROVED", [adf.strong()])),
 *     adf.paragraph(adf.text("See "), adf.link("the ticket", "https://...")),
 *     adf.heading(2, adf.text("Next steps")),
 *     adf.bulletList(
 *       adf.listItem(adf.paragraph(adf.text("Step 1"))),
 *       adf.listItem(adf.paragraph(adf.text("Step 2"))),
 *     ),
 *   );
 *
 *   // Use as a Jira description / comment / custom-field value
 *   await jira.updateIssue("ABC-1", { fields: { description } });
 *
 * Walker usage:
 *
 *   adf.walk(doc, (node, parent, index) => {
 *     if (node.type === "mention" && node.attrs.id === oldAccountId) {
 *       node.attrs.id = newAccountId;
 *     }
 *   });
 *
 * Semantic hash:
 *
 *   adf.semanticHash(doc1) === adf.semanticHash(doc2)
 *
 * Useful for detecting no-op writes (the planned ADF and the destination's
 * actual ADF are byte-different but semantically identical — skip the
 * mutation). The hash is whitespace-insensitive and ignores empty `text`
 * nodes.
 */

const crypto = require("crypto");

// ─── Builders ────────────────────────────────────────────────────────

function doc(...content) {
  return { version: 1, type: "doc", content };
}

function paragraph(...content) {
  return { type: "paragraph", content };
}

function heading(level, ...content) {
  if (level < 1 || level > 6) throw new Error(`heading level must be 1-6, got ${level}`);
  return { type: "heading", attrs: { level }, content };
}

function text(s, marks) {
  if (s === "" || s == null) throw new Error("text() requires a non-empty string");
  const node = { type: "text", text: String(s) };
  if (marks && marks.length) node.marks = marks;
  return node;
}

function strong()   { return { type: "strong" }; }
function em()       { return { type: "em" }; }
function code()     { return { type: "code" }; }
function strike()   { return { type: "strike" }; }
function underline(){ return { type: "underline" }; }
function subscript()  { return { type: "subsup", attrs: { type: "sub" } }; }
function superscript(){ return { type: "subsup", attrs: { type: "sup" } }; }
function textColor(hex) {
  return { type: "textColor", attrs: { color: hex } };
}

function link(label, href, marks) {
  const linkMark = { type: "link", attrs: { href } };
  return text(label, [...(marks || []), linkMark]);
}

function mention(accountId, displayName) {
  return {
    type: "mention",
    attrs: {
      id: accountId,
      text: displayName ? `@${displayName}` : "",
      accessLevel: "",
    },
  };
}

function emoji(shortName, id) {
  return { type: "emoji", attrs: { shortName, id } };
}

function hardBreak() {
  return { type: "hardBreak" };
}

function bulletList(...items)  { return { type: "bulletList", content: items }; }
function orderedList(...items) { return { type: "orderedList", content: items }; }
function listItem(...content)  { return { type: "listItem", content }; }

function codeBlock(language, sourceCode) {
  return {
    type: "codeBlock",
    attrs: language ? { language } : {},
    content: [text(sourceCode)],
  };
}

function blockquote(...content) {
  return { type: "blockquote", content };
}

function rule() {
  return { type: "rule" };
}

function panel(panelType, ...content) {
  return { type: "panel", attrs: { panelType }, content };
}

function table(...rows) {
  return { type: "table", content: rows };
}
function tableRow(...cells) {
  return { type: "tableRow", content: cells };
}
function tableHeader(...content) {
  return { type: "tableHeader", attrs: {}, content };
}
function tableCell(...content) {
  return { type: "tableCell", attrs: {}, content };
}

// ─── Walker / Mutator ────────────────────────────────────────────────

/**
 * Walk the ADF tree, invoking `visitor(node, parent, index)` for every node.
 * Mutations to `node` are reflected in place. To remove a node, set the
 * matching slot in `parent.content` to null afterwards and call `prune(doc)`.
 */
function walk(node, visitor, parent = null, index = -1) {
  if (!node || typeof node !== "object") return;
  visitor(node, parent, index);
  const content = node.content;
  if (Array.isArray(content)) {
    for (let i = 0; i < content.length; i++) walk(content[i], visitor, node, i);
  }
}

/**
 * Find every node matching `predicate(node)`.
 *
 * @returns {Array<object>}
 */
function findAll(node, predicate) {
  const out = [];
  walk(node, (n) => { if (predicate(n)) out.push(n); });
  return out;
}

/**
 * Mutate every node where `node.attrs.id === targetId`. Useful for ADF
 * surgery by stable identifier (mentions, macros, custom inline nodes).
 */
function mutateById(node, targetId, transform) {
  walk(node, (n) => {
    if (n.attrs && n.attrs.id === targetId) transform(n);
  });
  return node;
}

/**
 * Remove empty `text` nodes and content arrays that became empty after
 * mutation. Empty text nodes cause Cloud to reject the whole document.
 */
function prune(node) {
  if (!node || typeof node !== "object") return node;
  if (Array.isArray(node.content)) {
    node.content = node.content
      .filter((c) => c !== null && c !== undefined)
      .map(prune)
      .filter((c) => {
        if (c && c.type === "text" && !c.text) return false;
        if (c && Array.isArray(c.content) && c.content.length === 0
            && ["paragraph", "heading", "blockquote", "tableCell", "tableHeader"].indexOf(c.type) === -1) {
          return false;
        }
        return true;
      });
  }
  return node;
}

// ─── Semantic hash ───────────────────────────────────────────────────

/**
 * Canonicalize an ADF document so two semantically-equal trees serialize
 * identically. Used as the basis for `semanticHash`.
 *
 * Normalizations:
 *   - Object keys sorted alphabetically
 *   - Empty `text` nodes dropped
 *   - Empty `attrs` / `marks` arrays removed
 *   - Whitespace inside `text` collapsed to single spaces, trimmed
 */
function canonicalize(node) {
  if (node === null || node === undefined) return null;
  if (typeof node !== "object") return node;
  if (Array.isArray(node)) {
    return node.map(canonicalize).filter((n) => n !== null);
  }
  const out = {};
  const keys = Object.keys(node).sort();
  for (const k of keys) {
    let v = node[k];
    if (k === "text" && typeof v === "string") {
      v = v.replace(/\s+/g, " ").trim();
      if (!v) return null;
    }
    if (k === "marks" && Array.isArray(v) && v.length === 0) continue;
    if (k === "attrs" && v && typeof v === "object" && Object.keys(v).length === 0) continue;
    out[k] = canonicalize(v);
  }
  return out;
}

/**
 * SHA1 hex digest of a canonicalized ADF document. Two semantically-equal
 * ADFs hash to the same value, even if their serialization differs in
 * whitespace, attribute ordering, or empty fields.
 */
function semanticHash(node) {
  const canon = canonicalize(node);
  return crypto.createHash("sha1").update(JSON.stringify(canon)).digest("hex");
}

module.exports = {
  doc, paragraph, heading, text,
  strong, em, code, strike, underline, subscript, superscript, textColor,
  link, mention, emoji, hardBreak,
  bulletList, orderedList, listItem,
  codeBlock, blockquote, rule, panel,
  table, tableRow, tableHeader, tableCell,
  walk, findAll, mutateById, prune,
  canonicalize, semanticHash,
};
