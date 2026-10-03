# Storage Format & ADF

Confluence pages have two body formats. Jira issue descriptions and comments use one of them. Migrating content between products, or rewriting content in place, lives or dies by getting the format right.

This doc covers both formats, when to choose which, the two main rewriting approaches (regex vs. tree parser), and the ADF builders / semantic hashing that make whole-document mutations safe.

## The two formats

| Format | Used by | Shape |
|---|---|---|
| **Atlassian Document Format (ADF)** | Jira (all rich-text), Confluence (modern editor) | JSON tree of nodes with `type`, `content`, `attrs`, `marks` |
| **Storage format** | Confluence only | XHTML-flavoured XML with custom `<ac:structured-macro>` etc. elements |

You can choose either format on most Confluence endpoints by passing `body-format=atlas_doc_format` or `body-format=storage`. Jira returns rich-text fields as ADF; there's no alternative.

## When to use which (Confluence)

| Need | Use |
|---|---|
| Surgical edits to specific macros/links/attributes inside a page | **Storage** — easier to edit XHTML than walk an ADF tree, and preserves any unknown ancestor attributes |
| Whole-document replacement / construction | **ADF** — future-proof; the editor's native shape |
| Preserve byte-identical macro IDs / unknown vendor parameters | **Storage** — splice rewriting keeps everything you don't touch |
| Migrating from non-Confluence source (Notion, Markdown, HTML) | **ADF** — easier to build a tree than escape XHTML |
| Rendering "what the user sees" | **ADF + `?expand=renderedFields`** for HTML |
| Re-parsing a page edited via the API | Either; ADF is more uniform across surfaces |

The general rule: **edit storage, build ADF**.

## Storage format — XHTML surgery

Storage format looks like:

```xml
<p>Hello <a href="https://example.com">world</a>.</p>
<ac:structured-macro ac:name="info" ac:macro-id="abc-123" ac:schema-version="1">
  <ac:rich-text-body>
    <p>An info panel.</p>
  </ac:rich-text-body>
</ac:structured-macro>
```

Two rewriting approaches:

### Approach 1 — regex + offset splicing (zero deps)

For renames, attribute swaps, and macro replacements where you don't need to understand nesting:

```javascript
// Replace "deck" macros with "tab-group"
const macroRegex = /<ac:structured-macro\s+ac:name="(deck|card)"([^>]*)>/g;
const newStorage = oldStorage.replace(macroRegex, (match, oldName, rest) => {
  const newName = oldName === "deck" ? "tab-group" : "tab";
  return `<ac:structured-macro ac:name="${newName}"${rest}>`;
});
```

For complex parameter rewrites, find each macro's byte span and splice back-to-front (so earlier offsets stay stable):

```javascript
const instances = findMacroInstances(storage);   // [{span: [start, end], params}, ...]
instances.sort((a, b) => b.span[0] - a.span[0]);  // back-to-front
for (const inst of instances) {
  const rewritten = rewriteOneMacro(storage.slice(inst.span[0], inst.span[1]));
  storage = storage.slice(0, inst.span[0]) + rewritten + storage.slice(inst.span[1]);
}
```

This preserves byte-identical content outside the spans. Useful when vendor macros include unknown attributes you don't want to lose.

### Approach 2 — `fast-xml-parser` tree walk

For nested macro detection, structural changes (split-around-descendant, un-nesting), or any edit that needs to understand the tree:

```javascript
// Requires: npm install fast-xml-parser
const { XMLParser, XMLBuilder } = require("fast-xml-parser");

const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  allowBooleanAttributes: true,
  parseTagValue: false,
});
const builder = new XMLBuilder({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  format: false,
});

const tree = parser.parse(`<root>${storage}</root>`);
walkTree(tree, (node) => {
  if (node["ac:structured-macro"]) {
    node["ac:structured-macro"][":@"]["@_ac:name"] = "tab-group";
  }
});
const newStorage = builder.build(tree).replace(/^<root>|<\/root>$/g, "");
```

`preserveOrder` is essential — without it, fast-xml-parser reorders attributes and elements, breaking byte equality of unchanged regions.

Wrap with a small helper (`storageFormatParser.js` in your sub-project) that exposes:

- `parse(xml)` / `serialize(nodes)`
- `findChildByTag(node, tag)`, `getAttr(node, name)`, `setAttr(node, name, value)`
- `isStructuredMacro(node)`, `getMacroName(node)`
- `hasDescendantStructuredMacro(node)` (for nested-macro detection)
- `newMacroId()` (UUID generator for split macros)
- `cloneNode(node)`

This breaks the zero-dep promise. Accept it for storage-surgery work — fast-xml-parser is the only realistic option.

## ADF — JSON tree

ADF documents look like:

```json
{
  "version": 1,
  "type": "doc",
  "content": [
    { "type": "paragraph", "content": [
      { "type": "text", "text": "Status: " },
      { "type": "text", "text": "APPROVED", "marks": [{"type": "strong"}] }
    ]}
  ]
}
```

Rules:

1. **Always send the whole document.** No partial updates, no `add` operations.
2. **`version: 1`** at the root, always.
3. **Empty `text` nodes (`text: ""`) are invalid.** Prune them before serializing.
4. **Marks attach to `text` nodes, not paragraphs.** A link is `{type: "text", text: "...", marks: [{type: "link", attrs: {href}}]}`.

The `adf-builders.js` template gives you a fluent API:

```javascript
const adf = require("../src/adfBuilders");

const description = adf.doc(
  adf.paragraph(adf.text("Status: "), adf.text("APPROVED", [adf.strong()])),
  adf.paragraph(
    adf.text("See "),
    adf.link("the ticket", "https://example.atlassian.net/browse/ABC-1"),
  ),
  adf.heading(2, adf.text("Next steps")),
  adf.bulletList(
    adf.listItem(adf.paragraph(adf.text("Run migration"))),
    adf.listItem(adf.paragraph(adf.text("Verify in staging"))),
  ),
  adf.panel("info", adf.paragraph(adf.text("This will take ~30 minutes."))),
);

await jira.updateIssue("ABC-1", { fields: { description } });
```

Builders included:

- Inline: `text`, `link`, `mention`, `emoji`, `hardBreak`
- Marks: `strong`, `em`, `code`, `strike`, `underline`, `subscript`, `superscript`, `textColor`
- Blocks: `paragraph`, `heading`, `codeBlock`, `blockquote`, `rule`, `panel`
- Lists: `bulletList`, `orderedList`, `listItem`
- Tables: `table`, `tableRow`, `tableHeader`, `tableCell`

## ADF surgery — walk and mutate

When you need to edit specific nodes inside an ADF document (e.g. rewriting a `mention` from an old accountId to a new one):

```javascript
const adf = require("../src/adfBuilders");

const doc = await getJiraDescription(issueKey);

// Replace all mentions of old accountId
adf.walk(doc, (node) => {
  if (node.type === "mention" && node.attrs.id === oldAccountId) {
    node.attrs.id = newAccountId;
    node.attrs.text = `@${newDisplayName}`;
  }
});

adf.prune(doc);   // drop empty text nodes that may have crept in

await jira.updateIssue(issueKey, { fields: { description: doc } });
```

For ID-anchored mutations (always preferred over array-index access):

```javascript
adf.mutateById(doc, "macro-12345", (node) => {
  node.attrs.flavor = "updated";
});
```

## Semantic hashing — detect no-op writes

Two ADF documents can be byte-different but semantically identical (different whitespace inside text nodes, different attribute ordering, an empty `marks` array on one but not the other). Writing a no-op bumps the version and confuses downstream tooling.

`adf-builders.js` provides:

```javascript
const adf = require("../src/adfBuilders");

const plannedHash = adf.semanticHash(plannedDoc);
const currentHash = adf.semanticHash(currentDoc);

if (plannedHash === currentHash) {
  planManager.updateEntryStatus(id, "skipped", "destination already matches plan");
  return;
}
```

Canonicalization, in order:

1. Object keys sorted alphabetically.
2. Empty `text` nodes dropped.
3. Empty `marks: []` and `attrs: {}` removed.
4. Whitespace inside `text` collapsed to single spaces, trimmed.

Then SHA1 of the canonical JSON. Two structurally-equal ADFs hash identically.

For storage XHTML, use the lower-bound implementation `BackupManager.storageHash(xml)` (whitespace-collapse + SHA1) — it's not parser-grade but catches most no-ops.

## Anti-patterns

- **Don't try to convert ADF ↔ text/wiki/HTML in script.** Atlassian doesn't expose a public converter. Read `renderedFields` for read-only HTML; for editable round-trips, you have to live in ADF.
- **Don't deep-clone an ADF doc by `JSON.parse(JSON.stringify(...))` and then forget to call `prune`.** Most ADF-emitting code accidentally leaves empty nodes around; the destination rejects them with cryptic 400s.
- **Don't sort `content` arrays.** Order matters in lists, tables, and table-rows. Sorting silently corrupts the document.
- **Don't manually URL-encode hrefs inside `link` marks.** ADF stores them raw; the API encodes on render.

## See also

- [`28-adf-and-attachments.md`](28-adf-and-attachments.md) — Jira-side ADF + the attachment CSRF header
- [`09-backup-and-rollback.md`](09-backup-and-rollback.md) — semantic hashing for no-op detection
- [`templates/adf-builders.js`](../templates/adf-builders.js) — the builder + walker + hasher
- [Atlassian: ADF structure](https://developer.atlassian.com/cloud/jira/platform/apis/document/structure/)
- [fast-xml-parser](https://github.com/NaturalIntelligence/fast-xml-parser) — for storage XHTML surgery
