# ADF and Storage Format — Confluence body formats

Confluence pages are stored as a structured document. From the REST API you can ask for either of two body formats — they represent the same content but in very different shapes. Pick one consciously; mixing them halfway through a workflow is a common bug source.

## The two formats

| Format | What it is | Returned as | Use when |
|---|---|---|---|
| `atlas_doc_format` (ADF) | Atlassian Document Format — a JSON tree. Same shape used by Jira issues, comments, descriptions. | `body.atlas_doc_format.value` (a JSON string — `JSON.parse` it before traversing) | You're programmatically constructing or surgically editing pages. |
| `storage` | Confluence's legacy XHTML "storage format". Tags include `<ac:link>`, `<ri:user/>`, `<ac:structured-macro/>`. | `body.storage.value` (an XML/HTML string) | You need a Confluence-specific element with no ADF equivalent (e.g. mention with `account-id`, certain macros), or you're integrating with older content. |

> Forge UI Kit (`@forge/react`) renders ADF natively via the `Doc` component. Custom UI iframes render their own React; if you display Confluence content there, parse ADF with a library or convert to HTML.

## Reading a page in ADF

```javascript
import api, { route } from '@forge/api';

const r = await api.asApp().requestConfluence(
  route`/wiki/api/v2/pages/${pageId}?body-format=atlas_doc_format`
);
const page = await r.json();

// IMPORTANT: body.atlas_doc_format.value is a *stringified* JSON tree.
const adf = JSON.parse(page.body.atlas_doc_format.value);
// adf.type === 'doc', adf.content is an array of block nodes
```

## Writing / updating a page (ADF)

```javascript
import api, { route } from '@forge/api';

// PUT requires the existing page version. Always GET → bump → PUT.
const get = await api.asApp().requestConfluence(
  route`/wiki/api/v2/pages/${pageId}?body-format=atlas_doc_format`
);
const current = await get.json();

const newAdf = {
  type: 'doc',
  version: 1,
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Hello from Forge' }] },
  ],
};

const put = await api.asApp().requestConfluence(route`/wiki/api/v2/pages/${pageId}`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    id: pageId,
    status: 'current',
    title: current.title,                      // required even if unchanged
    spaceId: current.spaceId,                  // required
    body: { representation: 'atlas_doc_format', value: JSON.stringify(newAdf) },
    version: { number: current.version.number + 1 },
  }),
});
```

> **Don't forget to bump `version.number`.** A mismatched version returns `409 Conflict`.

## Building common ADF nodes

```javascript
const paragraph = (text) => ({
  type: 'paragraph',
  content: [{ type: 'text', text }],
});

const heading = (level, text) => ({
  type: 'heading',
  attrs: { level },
  content: [{ type: 'text', text }],
});

const bulletList = (items) => ({
  type: 'bulletList',
  content: items.map((it) => ({
    type: 'listItem',
    content: [paragraph(it)],
  })),
});

const codeBlock = (lang, src) => ({
  type: 'codeBlock',
  attrs: { language: lang },
  content: [{ type: 'text', text: src }],
});

const link = (text, href) => ({
  type: 'text',
  text,
  marks: [{ type: 'link', attrs: { href } }],
});

const panel = (kind, children) => ({
  // kind: 'info' | 'note' | 'warning' | 'success' | 'error'
  type: 'panel',
  attrs: { panelType: kind },
  content: children,
});
```

## Why mentions are tricky

A mention by `accountId` exists in both formats but with different shapes:

```javascript
// ADF mention node — what you build for a page body
{
  type: 'mention',
  attrs: { id: 'ACCOUNT_ID', text: '@Display Name' },
}
```

```xml
<!-- Storage-format link with user-reference — what you put in a footer comment if the API requires it -->
<p>
  <ac:link>
    <ri:user ri:account-id="ACCOUNT_ID"/>
  </ac:link>
  please review this page.
</p>
```

The footer-comment endpoint accepts both, but historically the storage form is more reliable for triggering Confluence's @mention notification. Sentinel Vault uses storage-format XML for its notification comments for exactly this reason — it gets users emailed without needing an external mail service.

## ADF tree surgery (recursive traversal)

When you need to find or remove specific nodes (e.g. an extension/macro you placed earlier):

```javascript
// Collect every media node id referenced anywhere in the doc
function collectMediaFileIds(node, out = new Set()) {
  if (node.type === 'media' && node.attrs?.id) out.add(node.attrs.id);
  if (Array.isArray(node.content)) for (const c of node.content) collectMediaFileIds(c, out);
  return out;
}

// Remove all extension nodes whose extensionKey matches
function removeExtensions(node, extensionKey) {
  if (Array.isArray(node.content)) {
    node.content = node.content.filter(
      (c) => !(c.type === 'extension' && c.attrs?.extensionKey === extensionKey)
    );
    for (const c of node.content) removeExtensions(c, extensionKey);
  }
  return node;
}
```

(Pattern lifted from Sentinel Vault's `doc-surgery.js` — see `24-production-patterns.md`.)

## Building an extension node (your macro on a page)

```javascript
// Inject your own confluence:macro extension into a page
const extensionKey = `${appId}/${envId}/static/my-macro`;
const node = {
  type: 'extension',
  attrs: {
    extensionType: 'com.atlassian.ecosystem',
    extensionKey,
    parameters: {
      extensionId: `ari:cloud:ecosystem::extension/${appId}/${envId}/static/my-macro`,
      // your macro's persisted config goes here
    },
  },
};
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

Body format support varies between v1 and v2:

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
- **Title and spaceId required**: Confluence's PUT page is a full-replacement. Always include `title`, `status`, `spaceId`, and the full new body.
- **Inline storage markup is HTML-like but case-sensitive**: `<ri:user>` (lowercase) works; `<RI:user>` doesn't.
- **CDATA in code blocks**: storage format requires `<![CDATA[…]]>` wrapping for raw code.
- **ADF version is `1`**: every `doc` node should have `version: 1`. Other numbers are not valid.

## See also

- `06-content-properties.md` — content-property schemas (separate from page body)
- `24-production-patterns.md` — ADF tree-surgery and version-tracking patterns from Sentinel Vault
- `08-api-endpoints.md` — REST endpoint reference
- https://developer.atlassian.com/cloud/jira/platform/apis/document/structure/ (ADF spec — same format used in Jira)
- https://developer.atlassian.com/cloud/confluence/storage-format/
