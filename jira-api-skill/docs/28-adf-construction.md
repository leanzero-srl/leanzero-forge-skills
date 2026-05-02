# ADF Construction (Jira REST API)

Jira issue **descriptions**, **comments**, and **worklog comments** are stored as ADF — Atlassian Document Format. ADF is a JSON tree, *not* Markdown or HTML. If you POST a string where ADF is expected, the API either rejects it or stores raw text without formatting.

## Minimal valid ADF document

```json
{
  "type": "doc",
  "version": 1,
  "content": [
    { "type": "paragraph", "content": [{ "type": "text", "text": "Hello, Jira!" }] }
  ]
}
```

The outer wrapper is always `{ type: 'doc', version: 1, content: [...] }`. `version` is always `1` — other numbers are not valid.

## Builder helpers

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
const emoji = (shortName) => ({ type: 'emoji', attrs: { shortName, text: `:${shortName}:` } });

// Block nodes
const paragraph = (...inline) => ({ type: 'paragraph', content: inline });
const heading = (level, ...inline) => ({
  type: 'heading',
  attrs: { level },                          // 1..6
  content: inline,
});
const bulletList = (...items) => ({
  type: 'bulletList',
  content: items.map((blocks) => ({ type: 'listItem', content: blocks })),
});
const orderedList = (...items) => ({
  type: 'orderedList',
  content: items.map((blocks) => ({ type: 'listItem', content: blocks })),
});
const codeBlock = (lang, src) => ({
  type: 'codeBlock',
  attrs: { language: lang },
  content: [text(src)],
});
const quote = (...blocks) => ({ type: 'blockquote', content: blocks });
const rule = () => ({ type: 'rule' });
const panel = (kind, ...blocks) => ({
  // kind: 'info' | 'note' | 'warning' | 'success' | 'error'
  type: 'panel',
  attrs: { panelType: kind },
  content: blocks,
});
const table = (rows) => ({
  type: 'table',
  content: rows.map((cells) => ({
    type: 'tableRow',
    content: cells.map((cellBlocks) => ({ type: 'tableCell', content: cellBlocks })),
  })),
});

// Document wrapper
const doc = (...blocks) => ({ type: 'doc', version: 1, content: blocks });
```

## Common cases

### Posting a comment

```javascript
await callJira(`/rest/api/3/issue/${issueKey}/comment`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    body: doc(
      paragraph(text('Deployed to '), code('staging'), text(' at '), text(new Date().toISOString())),
    ),
  }),
});
```

### Mentioning a user

```javascript
const body = doc(
  paragraph(mention(accountId, displayName), text(' please review when you have time.')),
);
```

> Mentions only fire notifications when the comment is posted as a real user (or via OAuth user impersonation). App-token comments don't trigger @mention emails the same way.

### Description with structure

```javascript
const description = doc(
  heading(2, text('Steps to Reproduce')),
  orderedList(
    [paragraph(text('Open the login page'))],
    [paragraph(text('Enter valid credentials'))],
    [paragraph(text('Click "Sign in"'))],
  ),
  heading(2, text('Expected')),
  paragraph(text('User is redirected to the dashboard.')),
  heading(2, text('Actual')),
  panel('error', paragraph(text('500 Internal Server Error.'))),
  heading(2, text('Logs')),
  codeBlock('text', 'TypeError: undefined is not a function\n  at Login.js:42'),
);
```

### Updating an existing description

```javascript
await callJira(`/rest/api/3/issue/${issueKey}`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ fields: { description } }),
});
```

The whole description is replaced — there's no "patch ADF" endpoint.

## Reading ADF (and converting to plain text)

When you GET an issue, `fields.description` is already a parsed ADF tree (no `JSON.parse` needed — different from Confluence's stringified body).

```javascript
function adfToText(node) {
  if (!node) return '';
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'hardBreak') return '\n';
  if (Array.isArray(node.content)) {
    const sep = node.type === 'paragraph' || node.type === 'heading' ? '\n\n' : '';
    return node.content.map(adfToText).join('') + sep;
  }
  return '';
}
```

For a richer conversion (preserving lists and code blocks), use a library like `adf-to-md` or `@atlaskit/editor-json-transformer`.

## Markdown → ADF (when your input is Markdown)

If your source is Markdown (e.g. user comments from another tool), don't try to translate by hand. Use:

- `marked` + `markdown-to-jira` (lossy)
- `@atlaskit/editor-markdown-transformer` (more accurate, browser-flavored)
- Atlassian's own [wiki-renderer](https://developer.atlassian.com/cloud/jira/platform/apis/document/playground/) for one-off conversions

For programmatic pipelines, prefer building ADF directly via the helpers above — fewer round-trips, no escaping ambiguity.

## What can break

- **Forgetting `version: 1`** on the outer doc → 400.
- **Using `marks` on non-text nodes** → 400. Marks live on `text` only.
- **Empty paragraphs** with no `content` array → some clients render them, others throw.
- **Wrong heading level** (only 1..6) → 400.
- **Code blocks with a `language` Jira doesn't recognize** → renders as plain text (no error, but no syntax highlighting either).
- **Tables outside `bodyContent` on `description`** — supported; on `comment.body`, less reliable.
- **Mentions with the user's display name as `id`** instead of `accountId` → silently drops the mention.

## See also

- ADF specification (interactive playground): https://developer.atlassian.com/cloud/jira/platform/apis/document/playground/
- ADF structure reference: https://developer.atlassian.com/cloud/jira/platform/apis/document/structure/
- `24-rest-integration-patterns.md` — calling endpoints that take ADF
