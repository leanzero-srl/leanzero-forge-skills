# ADF & Attachments

The two body-format pitfalls of every Jira / Confluence migration: ADF for descriptions and comments, and attachment uploads that fail without a CSRF header.

## ADF — Atlassian Document Format

Jira v3 returns and accepts rich-text fields (descriptions, comments, custom-field text values) as **ADF JSON**. Not wiki markup. Not HTML.

Example minimal ADF document:

```json
{
  "version": 1,
  "type": "doc",
  "content": [
    { "type": "paragraph",
      "content": [
        { "type": "text", "text": "Hello world." }
      ]
    }
  ]
}
```

The full spec lives at <https://developer.atlassian.com/cloud/jira/platform/apis/document/structure/>.

### Rules for migration scripts

1. **`set`, not `add`.** When writing a description or comment, send the *whole* ADF document. There is no public "append to ADF" API. `PUT /rest/api/3/issue/{key}` accepts:
   ```json
   { "fields": { "description": <full ADF doc> } }
   ```
   `update` operations like `{ description: [{ add: ... }] }` are not supported.

2. **There is no public ADF↔text/wiki converter.** Atlassian doesn't expose one. If your source is wiki markup or HTML, you have to convert it client-side. Options:
   - **`?expand=renderedFields`** — Jira returns `renderedFields.description` as HTML. Useful for read-only display, not for round-tripping.
   - **Hand-roll the conversion** — feasible if your source format is simple (plaintext with a few link patterns).
   - **Library** — `adf-builder` (~70k weekly downloads) wraps the JSON construction in a fluent API. Outside the zero-dep philosophy, but worth it if you build many ADF docs.

3. **`text` nodes can't be empty.** `{ type: "text", text: "" }` is invalid — Confluence/Jira reject the whole document. Filter empties before serializing:
   ```javascript
   function pruneEmptyText(node) {
     if (node.type === "text" && !node.text) return null;
     if (Array.isArray(node.content)) {
       node.content = node.content.map(pruneEmptyText).filter(Boolean);
     }
     return node;
   }
   ```

4. **Always send `version: 1`** at the root. Future versions may exist; for now, hardcode 1.

5. **Marks attach to `text` nodes, not paragraph nodes.** A link is `{type: "text", text: "...", marks: [{type: "link", attrs: {href: "..."}}]}`.

### Common ADF node builders

Drop these helpers into a sub-project's `src/adfBuilders.js` when needed:

```javascript
const paragraph = (...inline) => ({ type: "paragraph", content: inline });

const text = (s, marks = []) =>
  marks.length ? { type: "text", text: s, marks } : { type: "text", text: s };

const link = (s, href) => text(s, [{ type: "link", attrs: { href } }]);

const mention = (accountId, displayName) => ({
  type: "mention",
  attrs: { id: accountId, text: `@${displayName}`, accessLevel: "" },
});

const heading = (level, ...inline) => ({
  type: "heading",
  attrs: { level },
  content: inline,
});

const doc = (...blocks) => ({ version: 1, type: "doc", content: blocks });
```

Build the document, JSON.stringify, send.

### Storage format (Confluence-only)

Confluence pages have two body formats:

- **`storage`**: XHTML-like XML with custom `<ac:structured-macro>` elements. Legacy but stable; the format Atlassian's editor compiles into. Best for surgical macro rewrites where you want to preserve unknown attributes.
- **`atlas_doc_format`**: ADF JSON. Same as Jira's. The new default.

The `cloud-confluence-client.js` template ships both `updatePageStorage` and `updatePageAdf`. Pick by the kind of edit:

| Edit | Use |
|---|---|
| Replace a macro / fix a parameter / change an attribute | `storage` (XHTML surgery is easier) |
| Replace whole-document body | `atlas_doc_format` (modern, future-proof) |
| Anchored text references | Either; `atlas_doc_format` is more uniform |

## Attachments

Jira and Confluence attachment uploads use `multipart/form-data` and the same critical header:

```
X-Atlassian-Token: no-check
```

Without it, the request is rejected by Atlassian's CSRF filter with HTTP 403 — and the error message doesn't say "CSRF". Common operator confusion when they first see a 403 without an obvious permission cause.

### Jira attachment upload

```
POST /rest/api/3/issue/{issueIdOrKey}/attachments
Content-Type: multipart/form-data; boundary=...
X-Atlassian-Token: no-check

(form field name="file", filename="...", binary contents)
```

The `cloud-jira-client.js` template implements this as:

```javascript
const result = await jira.uploadAttachment(issueKey, "report.pdf", buffer);
// → [{ id, filename, size, mimeType, content, thumbnail, author, created, ... }]
```

### Confluence attachment upload

```
POST /wiki/rest/api/content/{pageId}/child/attachment
Content-Type: multipart/form-data; boundary=...
X-Atlassian-Token: no-check
```

Same shape; different path. The `cloud-confluence-client.js` template does NOT currently ship this helper — implement per-job based on the Jira pattern.

### Attachment migration patterns

JCMA's **"Migrate attachments in advance"** feature can pre-stage binaries from your DC instance to Cloud storage before cutover. This shortens the cutover window dramatically — only the metadata (issue↔attachment links) needs to be applied on cutover day.

For post-JCMA mending where attachment IDs changed:

1. Build a `{sourceAttachmentId: destAttachmentId}` mapping (use issue key + filename + size as the join key).
2. Re-stitch references in custom fields, descriptions, comments, or app data.
3. Don't re-upload — wastes storage and bandwidth.

If you must re-upload (rare; JCMA didn't include some attachments):

```javascript
const buffer = await downloadFromSource(`/secure/attachment/${oldId}/${filename}`);
const result = await cloud.uploadAttachment(destIssueKey, filename, buffer);
mapping[oldId] = result[0].id;
```

### Attachment size limits

- Jira Cloud default: 100 MB per file.
- Confluence Cloud default: 100 MB per file.
- Both can be raised to 2 GB in tenant settings, but uploads >100 MB go through a different storage path and may time out the API client.

For files >50 MB, raise the HTTP client timeout to 5+ minutes:

```javascript
options.timeout = 5 * 60 * 1000;
```

## See also

- [`27-rate-limits-and-quotas.md`](27-rate-limits-and-quotas.md) — attachment endpoints have their own point cost
- [`24-production-patterns.md`](24-production-patterns.md) — pattern 5 (attachment upload with CSRF)
- [`templates/cloud-jira-client.js`](../templates/cloud-jira-client.js) — `uploadAttachment` implementation
