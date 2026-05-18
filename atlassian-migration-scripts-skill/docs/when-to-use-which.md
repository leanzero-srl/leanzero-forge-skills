# When to Use Which

Decision trees for choosing the right pattern, endpoint, or sub-skill for the job at hand.

## What kind of job is this?

```
Are you discovering source state?
├── Yes → plan-script.template.js
│         (read source, write logs/plan_<runId>.json + plan_<runId>.csv)
│
Are you applying changes to a destination?
├── Yes → sync-script.template.js
│         (load plan, apply changes, two-gate safety)
│
Are you verifying changes landed?
├── Yes → audit-script.template.js
│         (sample, compare expected vs actual, write audit_<runId>.csv)
│
Are you doing something that doesn't fit any phase?
└── Use a one-shot script in tools/ (no plan, no audit — operator owns the risk)
```

## Is this a job for this skill?

```
Does JCMA already do this?
├── Yes → run JCMA; only come here for post-cutover cleanup
│
Is it a Forge app you're building?
├── Yes → use atlassian-jira-forge-skill or atlassian-confluence-forge-skill
│
Is it a one-off curl?
├── Yes → just use curl or `gh api`
│
Is it ongoing automation (not a migration)?
├── Yes → build a Forge app or an external service with proper monitoring
│
Is it a bulk, one-shot data fixup against Atlassian Cloud?
└── Yes → this skill is the right tool
```

## Plan-only, execute-only, or both?

```
Plan size: how many entries are you migrating?
├── < 50           → run with no flags (plan + execute in one go)
├── 50 – 1,000     → --plan-only, eyeball logs/plan_*.csv, then --execute-only
└── > 1,000        → --plan-only, attach CSV to change ticket, --execute-only later

Are you in a maintenance window with a deadline?
├── Yes → --plan-only ahead of the window, --execute-only on the day
└── No  → flexible — pick based on data size
```

## Native `https` or a library?

```
Are you in this skill's templates?
└── Yes → native https — zero deps is non-negotiable

Are you outside the skill's templates, doing migration-adjacent work?
├── Need predictable retries → still native https; copy the retry state machine
├── Need HTTP/2 / brotli / DNS caching → undici
├── Want the smallest readable code → got v14
└── Don't reach for axios — its config is harder to audit
```

## Bulk endpoint or per-entity loop?

```
How many entities are you reading?
├── < 50    → either works; per-entity is simpler
├── 50–100  → bulk wins on rate-limit cost
└── > 100   → bulk is mandatory; loop the bulk call with batches of 100

Are you creating issues?
├── 1–10   → individual POST /issue
├── 11–50  → POST /issue/bulk (one call)
└── > 50   → POST /issue/bulk, batched (≤50 per call)

Are you deleting issues?
└── Always use POST /bulk/issues/delete (≤1000 per call, even for one)
```

## Storage format or ADF for Confluence?

```
Are you doing surgical macro / attribute / parameter rewrites?
└── Use storage format (XHTML) — preserves unknown fields byte-for-byte

Are you replacing whole-document content?
└── Use ADF (atlas_doc_format) — modern, future-proof

Are you anchored on text fragments / links?
└── Either works; ADF is more uniform across surfaces

Are you re-rendering from non-Confluence source?
└── Generate ADF directly — don't try to round-trip through storage
```

## Concurrency level?

```
What kind of operations?
├── Bulk reads (POST /bulkfetch)             → concurrency = 1–2
├── Single-entity reads                       → concurrency = 8–10
├── Single-entity writes                      → concurrency = 3–5
├── Writes to the same issue/page (comments, attachments) → concurrency = 1 per entity
└── KVS writes                                → concurrency = 5–10
```

## Audit: sample or full sweep?

```
Pool size?
├── ≤ 500            → full sweep
├── 500 – 10,000     → seeded sample (150 entries, ±5% margin)
├── 10,000 – 100,000 → seeded sample (200 entries)
└── > 100,000        → stratified sample (400 entries) AND a 2nd seed re-run

Is the data high-stakes (security, finance, legal)?
└── full sweep, regardless of pool size

Did the first sample show > 2 FAILs?
└── escalate to full sweep before any release
```

## Identity: email lookup, displayName, or override?

```
Do you have an email for the source user?
├── Yes → email lookup first; if it succeeds, use the result
│         if it returns empty (privacy-restricted), fall through to displayName
│
Do you have a displayName?
├── Yes → exact (case-insensitive) match
│         single hit → use it
│         multiple hits → multiMatch=true; require operator triage
│         zero hits → miss; record in failed CSV
│
No identifier?
└── Skip with reason "no source identity"
```

## Bulk Forge data fix — in-app or remote?

```
Is the data fix tied to user activity in the app?
├── Yes → in-app: trigger by scheduled job or on-demand UI action
│
Is the data fix part of a one-shot migration?
└── Remote: use appSystemToken + KVS REST (this skill's pattern)
         the migration ends; in-app code stays clean

Is the data structure changing too?
├── Yes → remote: easier to debug from a regular Node script
│         migrate the data, redeploy the app with the new shape
└── No  → either; remote is faster to iterate
```

## Two-gate safety on a non-migration script?

```
Does the script ever mutate?
├── Yes → ship --dry-run + --confirm, no exceptions
└── No  → safe to skip; document in usage that it's read-only
```

## When to abort a plan run vs continue with errors

```
Was the error transient (429, 5xx, network)?
└── Continue — the retry state machine handles these

Was the error a payload bug (400, 422)?
├── In one entry      → mark failed, continue, fix later
└── In every entry    → abort; you have a script bug, not a data bug

Was the error auth-related (401, 403)?
└── Abort — there's no use retrying with the wrong credentials

Was the mapping table missing or wrong (404 on lookups)?
└── Abort — you're about to write garbage; fix mappings/ first
```

## See also

- [`01-core-concepts.md`](01-core-concepts.md) — the mental model behind the triad
- [`24-production-patterns.md`](24-production-patterns.md) — concrete patterns for the choices above
- [`27-rate-limits-and-quotas.md`](27-rate-limits-and-quotas.md) — math behind the concurrency table
