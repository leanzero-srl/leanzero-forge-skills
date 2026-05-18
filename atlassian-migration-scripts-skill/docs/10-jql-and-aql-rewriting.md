# JQL & AQL Rewriting

JCMA migrates filter definitions but does NOT rewrite the JQL inside them. After a DC→Cloud migration, hundreds of filters typically end up broken because:

- The numeric filter IDs in `filter = 12345` references point at DC-only filters.
- The custom-field IDs in `cf[10042]` and `customfield_10042` references no longer exist.
- The destination's strict JQL parser rejects DC-tolerated syntax (un-quoted `IN` list values, lowercase `not in`, paren-less function names).
- Assets/CMDB references in `aqlFunction("...")` point at DC asset keys/IDs that have been re-minted.

This doc covers the rewriters and sanitizers that fix these — they're the most common post-JCMA cleanup task at scale.

## Filter ID rewriting

When JCMA migrates filters, each filter gets a brand-new numeric ID. If filter `A` (DC id 12345, now Cloud id 67890) references filter `B` (DC id 678, now Cloud id 543) in its JQL via `filter = 678`, that reference is broken — it points at a DC filter ID that has no Cloud meaning.

Fix:

```javascript
const { rewriteFilterIds } = require("../src/jqlRewriter");

const dcToCloud = new Map(Object.entries(
  JSON.parse(fs.readFileSync("mappings/filters.json", "utf8"))
));   // { "678": "543", ... }

const { rewritten, replacements, unresolved } = rewriteFilterIds(
  "filter IN (123, 456) AND filter != 999",
  dcToCloud,
);
// rewritten:    "filter IN (4501, 4502) AND filter != 9001"
// replacements: [{dcId: "123", cloudId: "4501", form: "in"}, ...]
// unresolved:   ["999"]   ← couldn't find a mapping; left intact
```

The rewriter handles:

- Equality forms: `filter = 12345`, `filter != "12345"`
- IN-lists: `filter IN (1, 2, 3)`, `filter NOT IN ("1", 2)`
- The `savedFilter` alias (treated identically)
- Mixed quoted / unquoted IDs in IN-lists

It leaves untouched:

- Non-numeric operands: `filter = "My Saved Filter"`
- ORDER BY / time clauses
- String literals like `summary ~ "in flight"` (the regex anchors require word boundaries)

Build the `dcToCloud` map during the plan phase — see `post-jcma-id-mapping.md`.

## Custom field ID rewriting

DC custom fields like `cf[10042]` and `customfield_10042` map to fresh Cloud IDs (`customfield_10318` or similar). Embedded in JQL, these break the same way.

```javascript
const { rewriteCustomFieldIds } = require("../src/jqlRewriter");

const { rewritten, replacements } = rewriteCustomFieldIds(
  'cf[10042] = "Approved" AND customfield_10043 IS NOT EMPTY',
  { "10042": "10318", "10043": "10319" },
);
// rewritten: 'cf[10318] = "Approved" AND customfield_10319 IS NOT EMPTY'
```

Build the source→destination custom-field map at plan time via `CloudCatalog#buildFieldMapFrom` or by hand from `mappings/fields.json`.

## JQL sanitization (the post-JCMA parser-strictness fix)

DC's JQL parser is lenient; Cloud's is strict. The same JQL that worked on DC may be syntactically invalid on Cloud. The sanitizer fixes these in one pass:

```javascript
const { sanitizeJql } = require("../src/jqlSanitizer");

const { sanitized, changes } = sanitizeJql(
  'Project = ABC and labels not in (Test, TEST) and "Customer Request Type" = "Bug"',
  {
    fieldRenames: { "Customer Request Type": "Request Type" },
    cfMap: { "10042": "10318" },     // optional cf remap in one pass
    uppercaseOperators: true,         // default: true
    quoteInLists: true,               // default: true
  },
);
// sanitized: 'Project = ABC AND labels NOT IN ("Test", "TEST") AND "Request Type" = "Bug"'
// changes:   [
//   {kind: "op_upper",    from: "and",   to: "AND"},
//   {kind: "op_upper",    from: "not in",to: "NOT IN"},
//   {kind: "quote_in_list", from: "Test", to: '"Test"'},
//   {kind: "quote_in_list", from: "TEST", to: '"TEST"'},
//   {kind: "field_rename", from: "Customer Request Type", to: "Request Type"},
// ]
```

What the sanitizer does, in order:

1. **Custom field ID remap** — `cf[N]` and `customfield_N` rewritten via the provided map.
2. **Quote tokenization** — string literals are extracted into placeholders (`\x01Q1\x02`) so subsequent regex passes can't accidentally match inside them.
3. **Field renames** — both unquoted and quoted forms. Default rename: `Customer Request Type` → `Request Type` (JCMA renames this on every JSM project). Add your own via `options.fieldRenames`.
4. **Operator uppercasing** — `not in` → `NOT IN`, `is empty` → `IS EMPTY`, etc. Cloud accepts the lowercase form but the canonical form is uppercase and some tools depend on it.
5. **IN-list quoting** — bare strings inside `IN (...)` get quoted. Reserved words (`empty`, `currentUser`, `now`) and numeric tokens are left alone.
6. **Paren-less function names** — `IN (standardIssueTypes)` becomes `IN (standardIssueTypes())`. Cloud requires the paren form; DC tolerated either.

The default rename set lives in `jqlSanitizer.DEFAULT_FIELD_RENAMES` and the reserved-word + paren-less function name lists are exported as `RESERVED_WORDS` and `PARENLESS_FUNCTION_NAMES`. Extend them per migration.

## AQL inside JQL (Assets/CMDB)

Filters that reference CMDB assets do so via `aqlFunction("...")` in JQL. The inner AQL string has its own DC→Cloud rewriting concerns:

- Asset IDs (e.g. `objectId = 12345`) change post-migration.
- Asset keys (`Key = "ABC-123"`) sometimes survive, sometimes don't.
- Asset references by ARI are stable.

Wrap with `rewriteAqlFunctionBodies`:

```javascript
const { rewriteAqlFunctionBodies } = require("../src/jqlRewriter");

function rewriteAql(aql) {
  // Your own AQL rewriter — see assetFieldRewriter pattern
  return { rewritten: aql, replacements: [], unresolved: [] };
}

const { rewritten, replacements, unresolved } = rewriteAqlFunctionBodies(
  'Asset = aqlFunction("objectId = 12345") AND ...',
  rewriteAql,
);
```

The wrapper handles backslash-escaped quotes inside the AQL body so the inner rewriter sees the un-escaped string.

## Multi-pass pipeline

The full filter-rewrite for a single JQL string is typically four sequential passes:

```javascript
let jql = filter.jql;

// 1. Filter IDs (other-filter references)
let r = rewriteFilterIds(jql, filterIdMap);
jql = r.rewritten;

// 2. AQL bodies (asset references inside aqlFunction("..."))
r = rewriteAqlFunctionBodies(jql, aqlRewriter);
jql = r.rewritten;

// 3. Custom-field IDs + parser-strictness sanitization
r = sanitizeJql(jql, { cfMap, fieldRenames });
jql = r.sanitized;

// 4. (optional) Project-key rewrites if you renamed projects
r = rewriteProjectKeys(jql, projectMap);
jql = r.rewritten;
```

Each pass is pure (no I/O) and idempotent. Apply them in this order — sanitization must run last because the earlier passes can introduce strings the sanitizer needs to quote.

## What you can't fix automatically

- **Filter references to deleted entities**: a filter referencing `project = DELETED_PROJ` can't be rewritten — the destination has no such project. Surface in the failed CSV for human handling.
- **AQL syntax errors that pre-dated migration**: the rewriter assumes the input was valid DC AQL. Pre-existing typos pass through unchanged.
- **Dashboard gadget JQL**: gadgets store JQL separately from filters. They have their own migration story (often via the dashboard export/import, not JCMA).

## Sanity-check after rewriting

Always run the rewritten JQL through Jira's parser before saving:

```javascript
try {
  await jira.makeRequest("POST", "/rest/api/3/jql/parse", {
    queries: [rewritten], validation: "strict"
  });
} catch (err) {
  // Parser rejected — record in failed CSV, don't write
}
```

The parse endpoint is cheap (1 point) and catches sanitizer bugs before they corrupt your destination.

## See also

- [`templates/jql-rewriter.js`](../templates/jql-rewriter.js) — filter / AQL rewriters
- [`templates/jql-sanitizer.js`](../templates/jql-sanitizer.js) — parser-strictness fixes
- [`post-jcma-id-mapping.md`](post-jcma-id-mapping.md) — building the mapping tables
- [`24-production-patterns.md`](24-production-patterns.md) — pattern 15 (multi-pass pipeline)
