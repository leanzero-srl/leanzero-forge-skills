# Post-JCMA Audit Endpoints

After a JCMA run completes, you don't trust it — you verify. Two endpoints are the cheap-and-fast workhorses for that verification, both barely mentioned in the JCMA docs and both costing ~1 rate-limit point per call:

1. **`POST /rest/api/3/search/approximate-count`** — issue count for a JQL without iterating issues.
2. **The "(migrated)" custom-field convention** — JCMA's name-collision strategy, surfaced by walking `/rest/api/3/field` and pairing fields by base-name.

This doc covers both, with the script shapes from `c2c-postmigration/find_migrated_fields.js`.

## 1. The approximate-count endpoint

Plain `POST /rest/api/3/search/jql` paginates issues — the operator pays for an issue payload (often 10–50 KB) just to know "are there any?". The approximate-count endpoint returns just the count:

```javascript
async function approximateCount(jql) {
  const body = { jql };
  const data = await client.makeRequest(
    "POST", "/rest/api/3/search/approximate-count", body,
  );
  // Response shape has varied across Cloud rollouts; try each key:
  for (const k of ["count", "issueCount", "approximateIssueCount", "approximate_count", "total"]) {
    if (typeof data?.[k] === "number") return data[k];
  }
  if (typeof data?.data?.count === "number") return data.data.count;
  throw new Error(`Unexpected count response: ${JSON.stringify(data).slice(0, 500)}`);
}
```

The shape-tolerance is necessary — Atlassian has shipped this endpoint with three different response keys (`count`, `issueCount`, `approximateIssueCount`) and may change again. Default to the first one that's a number.

### When to use it

- **Population check before a real run.** `approximateCount("project = X AND cf[NNN] is not EMPTY")` tells you how big the job is in one call. Naive scripts paginate to find out.
- **Empty-project detection.** `approximateCount("project = X")` returns 0 → skip the project entirely.
- **Field-population audit.** "How many issues have a value in `customfield_10101`?" — one call vs. a full sweep.
- **Migration completeness check.** Compare DC's count (via the DC `/search` endpoint or DB query) to Cloud's count. Mismatch = JCMA dropped issues.
- **Budgeting.** Estimate runtime + rate-limit point spend before launching a 4-hour job.

### What "approximate" means

The endpoint's count is approximate — sometimes off by a handful of issues out of millions. The reason is Atlassian's Lucene-based search uses an in-memory index that lags actual data by seconds-to-minutes. For audit purposes the error is in the noise; for "did we migrate EXACTLY 12,400 issues" use case, switch to the count from a full `POST /search/jql` pagination (it's expensive but exact).

### Cost

~1 point regardless of result size. Compare with a full pagination on a 100k-issue JQL: 1,000 pages × 1 point = 1,000 points. **1000× rate-limit efficiency** for the "is there any work to do?" question.

## 2. The "(migrated)" custom-field problem

When JCMA migrates a DC custom field into Cloud and the field name **already exists** on Cloud, JCMA does NOT merge them. It appends `(migrated)` to the new field's name and creates it side-by-side with the existing one. Result:

| DC field | Cloud field after JCMA |
|---|---|
| `Severity` | `Severity` (untouched, was already on Cloud) |
| `Severity` (no DC counterpart) | `Severity (migrated)` (new, populated by JCMA) |
| `Severity (migrated)` (operator already cleaned up once) | `Severity (migrated)` (Cloud, even more confusion) |

Now you have two fields:
- **One with the data** the operator cares about (usually the `(migrated)` one).
- **One the operator's automations / boards / dashboards point at** (the non-migrated one, which is empty).

Until the operator picks one, every reference is broken.

### The pairing script

```javascript
const allCustomFields = await cloudClient.fetchCustomFields();

// Group by base-name (strip the suffix, lowercase)
const stripMigratedSuffix = (n) => n.replace(/\s*\(migrated\)\s*$/i, "").trim();
const hasMigratedTag      = (n) => /\(migrated\)/i.test(n);

const byBase = new Map();
for (const f of allCustomFields) {
  const base = stripMigratedSuffix(f.name).toLowerCase();
  if (!byBase.has(base)) byBase.set(base, []);
  byBase.get(base).push(f);
}

const pairs = [];
for (const fields of byBase.values()) {
  const migrated  = fields.filter(  hasMigratedTag);
  const originals = fields.filter(f => !hasMigratedTag(f.name));
  if (migrated.length && originals.length) {
    pairs.push({ baseName: stripMigratedSuffix(migrated[0].name), migrated: migrated[0], original: originals[0] });
  }
}
```

Each pair = one decision: which field wins?

### The decision matrix

For each pair, count populations:

```javascript
for (const p of pairs) {
  p.originalCount = await approximateCount(`cf[${idNum(p.original.id)}] is not EMPTY`);
  p.migratedCount = await approximateCount(`cf[${idNum(p.migrated.id)}] is not EMPTY`);
  p.recommendation = recommend(p);
}

function recommend(p) {
  if (p.originalCount === 0 && p.migratedCount > 0) {
    return "RENAME migrated field to canonical; delete original";
  }
  if (p.originalCount > 0 && p.migratedCount === 0) {
    return "DELETE migrated field; it's empty";
  }
  if (p.originalCount === 0 && p.migratedCount === 0) {
    return "DELETE both — neither is used";
  }
  // Both populated — this is the hard case
  return "MANUAL: both populated, merge required";
}
```

Output: a CSV the operator imports into the migration ticket. The "MANUAL" rows are the only ones that need human decision-making; everything else is the rename-or-delete script that comes next.

### The rename / delete step

Cloud's `PUT /rest/api/3/field/{id}` updates the name. There's no "merge" endpoint — the data lives where it lives. The pattern is:

1. **Pick the canonical ID** (typically the empty Cloud one, because automations and screens already point at it).
2. **Copy values** from the loser field to the winner field (use `templates/field-config-mapper.js` if there's value remapping, otherwise `field-merge-script` style direct copy).
3. **Rename the loser** to `Severity (deprecated)` or similar — never delete immediately, give automation rules a grace period to fail loudly.
4. **After 2 weeks of zero use**, delete via `DELETE /rest/api/3/field/{id}`.

The skill's `field-merge-script` distillation in `templates/overwrite-policy.js` is the right tool for step 2.

## 3. Combining the two — the audit triad

```
discover: fetch all custom fields, pair by base-name
  ↓
quantify: approximateCount each side of each pair
  ↓
recommend: produce a CSV with operator-actionable rows
```

This is a clean three-script audit pipeline. Each stage is independent and resumable:

- **`audit_step1_discover.js`** writes `pairs.json`.
- **`audit_step2_count.js`** reads `pairs.json`, calls `approximateCount`, writes `counts.csv`.
- **`audit_step3_recommend.js`** reads `counts.csv`, writes `recommendations.csv` + a Confluence-paste markdown summary.

Three small scripts beat one big one for this audit work because each step is the operator's checkpoint.

## Other audit endpoints worth knowing

| Endpoint | Returns | Cost | Use case |
|---|---|---|---|
| `GET /rest/api/3/field` | All custom fields with IDs and names | ~1 pt | Discovery, name-collision detection |
| `POST /rest/api/3/search/approximate-count` | Approximate count for a JQL | ~1 pt | Population checks (this doc) |
| `POST /rest/api/3/workflow/search` | Workflow list with usage stats | ~1 pt | Workflow audit (see `docs/24-production-patterns.md#16`) |
| `GET /rest/api/3/project/search` | Project list with archive status | ~1 pt | Cleanup of orphaned projects |
| `GET /rest/api/3/issue/{key}?expand=changelog` | Full changelog (last 100 events) | ~5 pts | Change-history audit |
| `POST /rest/api/3/changelog/bulkfetch` | Up to 100 issues' changelogs | ~1 pt | Same, at scale |

All are GET-equivalent in rate-limit terms (~1 point each). None requires admin permission unless explicitly noted — most work with a regular user token.

## 4. The c2c-postmigration suite (JCMA "Requires Attention")

A Cloud→Cloud JCMA run produces a **"Requires Attention" CSV** (`PostMigrationRequiresAttention_<timestamp>.csv`). It's the official list of what JCMA couldn't fully migrate — and it's the entry point for a small audit suite (`c2c-postmigration/`).

### analyse-migration.js — parse and categorize the report

```
node analyse-migration.js PostMigrationRequiresAttention_20251013T07_52_48.792Z.csv
```

It parses the CSV (papaparse), groups rows **by Problem category**, and emits:
- a summary of the issues encountered in the data copy,
- a JSON of **missing issue links** (`{ "JRA-101": ["JRA-207","JRA-330"], ... }`) that feeds `verify-issue-links.js`,
- a list of **workflows with post-functions that need fixing**.

Categorize by the report's Problem column — most rows fall into a handful of buckets (missing links, dropped post-functions, unmapped users, field-value issues). Triage by bucket, not row-by-row.

### verify-issue-links.js — confirm links actually landed

JCMA sometimes reports a link as "requires attention" when it actually migrated fine, and sometimes drops one silently. So you verify against the live target. Input is the `{ sourceKey: [expectedLinkedKeys] }` JSON from the analysis step; for each key it fetches the issue and checks every expected linked key is present:

```
GET /rest/api/3/issue/{key}?fields=issuelinks   → assert each expected key appears
```

Auth via `JIRA_BASE_URL` / `JIRA_EMAIL` / `JIRA_API_TOKEN`. Output: the subset of links genuinely missing (the real re-link work list).

### compare-jira-changelogs.js — DC-vs-Cloud audit-trail integrity

Changelogs (the issue history / change-groups) are easy to lose or reorder in migration. This compares change-group items **across two sites** (`SOURCE_URL` / `TARGET_URL`, one `JIRA_EMAIL` + `JIRA_API_TOKEN` valid on both). Input is `[{ issueId, groupIds:[...] }]`; output is a CSV of per-change-group differences — use it to prove the audit trail survived, or to quantify what didn't.

### The shape of the suite

Same three-stage discipline as §3: **discover** (parse the Requires-Attention CSV) → **verify** (re-check links / changelogs against live Cloud) → **act** (the real, much smaller, re-link / re-fix list). Don't trust the JCMA report as ground truth — it's the *candidate* list; verification against the live target is what produces the work list.

## See also

- [`21-post-jcma-issue-recovery.md`](21-post-jcma-issue-recovery.md) — recovering whole issues JCMA dropped
- [`07-audit-and-sampling.md`](07-audit-and-sampling.md) — the sampling layer that uses these endpoints
- [`12-preflight-and-staleness.md`](12-preflight-and-staleness.md) — pre-execute checks use approximate-count too
- [`post-jcma-id-mapping.md`](post-jcma-id-mapping.md) — why the (migrated) suffix appears in the first place
- [`27-rate-limits-and-quotas.md`](27-rate-limits-and-quotas.md) — point cost table
- [`templates/cloud-jira-client.js`](../templates/cloud-jira-client.js) — `approximateCount()` lives there
