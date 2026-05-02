# ADF and Storage Format (Confluence REST)

Confluence pages are stored as a structured document. From the REST API you can ask for either of two body formats — they represent the same content but in very different shapes.

## The two formats

| Format | What it is | Returned as | Use when |
|---|---|---|---|
| `atlas_doc_format` (ADF) | Atlassian Document Format — a JSON tree. Same shape used by Jira issues, comments, descriptions. | `body.atlas_doc_format.value` (a JSON **string** — `JSON.parse` it before traversing) | You're programmatically constructing or surgically editing pages. |
| `storage` | Confluence's legacy XHTML "storage format". Tags include `<ac:link>`, `<ri:user/>`, `<ac:structured-macro/>`. | `body.storage.value` (an XML/HTML string) | You need a Confluence-specific element with no ADF equivalent (mention with `account-id`, certain macros), or you're integrating with older content. |

Pick one consciously; mixing them halfway through a workflow is a common bug source.

## Reading a page in ADF

```javascript
const r = await fetch(
  `${BASE}/wiki/api/v2/pages/${pageId}?body-format=atlas_doc_format`,
  { headers: { Authorization: authHeader, Accept: 'application/json' } },
);
const page = await r.json();

// IMPORTANT: body.atlas_doc_format.value is a *stringified* JSON tree.
const adf = JSON.parse(page.body.atlas_doc_format.value);
// adf.type === 'doc', adf.content is an array of block nodes
```

## Writing / updating a page (ADF)

PUT requires the existing `version.number` + 1, plus the unchanged `title`, `status`, and `spaceId`:

```javascript
const get = await fetch(
  `${BASE}/wiki/api/v2/pages/${pageId}?body-format=atlas_doc_format`,
  { headers: { Authorization: authHeader, Accept: 'application/json' } },
);
const current = await get.json();

const newAdf = {
  type: 'doc',
  version: 1,
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Hello from external app' }] },
  ],
};

await fetch(`${BASE}/wiki/api/v2/pages/${pageId}`, {
  method: 'PUT',
  headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    id: pageId,
    status: 'current',
    title: current.title,
    spaceId: current.spaceId,
    body: { representation: 'atlas_doc_format', value: JSON.stringify(newAdf) },
    version: { number: current.version.number + 1 },
  }),
});
```

> A mismatched `version.number` returns `409 Conflict`. Always GET → bump → PUT.

## ADF builder helpers

```javascript
// Inline / leaf nodes
const text = (t) => ({ type: 'text', text: t });
const link = (t, href) => ({ type: 'text', text: t, marks: [{ type: 'link', attrs: { href } }] });
const code = (t) => ({ type: 'text', text: t, marks: [{ type: 'code' }] });
const mention = (accountId, displayName) => ({
  type: 'mention',
  attrs: { id: accountId, text: `@${displayName}` },
});
const hardBreak = () => ({ type: 'hardBreak' });

// Block nodes
const paragraph = (...inline) => ({ type: 'paragraph', content: inline });
const heading = (level, ...inline) => ({ type: 'heading', attrs: { level }, content: inline });
const bulletList = (...items) => ({
  type: 'bulletList',
  content: items.map((blocks) => ({ type: 'listItem', content: blocks })),
});
const codeBlock = (lang, src) => ({
  type: 'codeBlock',
  attrs: { language: lang },
  content: [text(src)],
});
const panel = (kind, ...blocks) => ({
  // kind: 'info' | 'note' | 'warning' | 'success' | 'error'
  type: 'panel',
  attrs: { panelType: kind },
  content: blocks,
});

// Document wrapper
const doc = (...blocks) => ({ type: 'doc', version: 1, content: blocks });
```

## Mentions are tricky — different shape per format

```javascript
// ADF mention node — what you build for a page body
{ type: 'mention', attrs: { id: 'ACCOUNT_ID', text: '@Display Name' } }
```

```xml
<!-- Storage-format link with user-reference — what you put in a footer comment -->
<p>
  <ac:link>
    <ri:user ri:account-id="ACCOUNT_ID"/>
  </ac:link>
  please review this page.
</p>
```

The footer-comment endpoint accepts both, but storage-format is more reliable for triggering Confluence's @mention email notification path. Use it when notifying users.

## ADF tree surgery (surgical edits)

When you need to find or remove specific nodes (e.g. an extension/macro your app placed earlier):

```javascript
// Collect every media node id referenced anywhere
function collectMediaFileIds(node, out = new Set()) {
  if (node?.type === 'media' && node.attrs?.id) out.add(node.attrs.id);
  if (Array.isArray(node?.content)) for (const c of node.content) collectMediaFileIds(c, out);
  return out;
}

// Remove all extension nodes whose extensionKey matches
function removeExtensions(node, extensionKey) {
  if (Array.isArray(node?.content)) {
    node.content = node.content
      .filter((c) => !(c.type === 'extension' && c.attrs?.extensionKey === extensionKey))
      .map((c) => removeExtensions(c, extensionKey));
  }
  return node;
}
```

## Storage format quick reference

| Need | Storage tag |
|---|---|
| Mention by `accountId` | `<ac:link><ri:user ri:account-id="..."/></ac:link>` |
| Page link by id | `<ac:link><ri:page ri:content-id="..."/></ac:link>` |
| Status badge | `<ac:structured-macro ac:name="status"><ac:parameter ac:name="title">In Progress</ac:parameter></ac:structured-macro>` |
| Info panel | `<ac:structured-macro ac:name="info"><ac:rich-text-body><p>…</p></ac:rich-text-body></ac:structured-macro>` |
| Code block | `<ac:structured-macro ac:name="code"><ac:parameter ac:name="language">javascript</ac:parameter><ac:plain-text-body><![CDATA[…]]></ac:plain-text-body></ac:structured-macro>` |
| Task list item | `<ac:task-list><ac:task><ac:task-status>incomplete</ac:task-status><ac:task-body>…</ac:task-body></ac:task></ac:task-list>` |

## Mixing v1 and v2 endpoints

| Endpoint | Body format support |
|---|---|
| v2 `/wiki/api/v2/pages/{id}` | `?body-format=atlas_doc_format` (preferred), `storage`, `view` |
| v2 `/wiki/api/v2/blogposts/{id}` | same |
| v2 `/wiki/api/v2/footer-comments` (POST) | `representation: 'atlas_doc_format'` or `'storage'` in body |
| v1 `/wiki/rest/api/content/{id}` | `?expand=body.storage,body.atlas_doc_format,body.view` |

Stick to v2 for new code unless an operation is only available in v1 (CQL search, certain space operations, expanding macro bodies).

## Common gotchas

- **Stringified ADF**: `body.atlas_doc_format.value` is a string. Forgetting `JSON.parse` is the #1 ADF bug.
- **`version.number` on PUT**: must be exactly `current + 1`. GET → bump → PUT, never compute it from a cached value.
- **Title and spaceId required**: PUT page is full-replacement. Always include `title`, `status`, `spaceId`, and the full new body.
- **Inline storage markup is HTML-like but case-sensitive**: `<ri:user>` (lowercase) works; `<RI:user>` doesn't.
- **CDATA in code blocks**: storage format requires `<![CDATA[…]]>` wrapping for raw code.
- **ADF version is `1`**: every `doc` node should have `version: 1`. Other numbers are not valid.
- **Empty paragraphs** with no `content` array → some clients render them, others throw.
- **`marks` on non-text nodes** → 400. Marks live on `text` only.

## Markdown → ADF

Don't translate by hand. Use:

- `marked` + `markdown-to-jira` (lossy)
- `@atlaskit/editor-markdown-transformer` (more accurate, browser-flavored)
- Atlassian's [ADF playground](https://developer.atlassian.com/cloud/jira/platform/apis/document/playground/) for one-off conversions

For pipelines, build ADF directly via the helpers above — fewer round-trips, no escaping ambiguity.

## See also

- `06-content-properties.md` — content-property schemas (separate from page body)
- `08-api-endpoints.md` — REST endpoint reference
- ADF interactive playground: https://developer.atlassian.com/cloud/jira/platform/apis/document/playground/
- Confluence storage format: https://developer.atlassian.com/cloud/confluence/storage-format/
