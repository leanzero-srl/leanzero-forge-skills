# Sub-Project Skeleton

Every migration job ships as its own self-contained sub-project. This file is the canonical shape — copy it, fill the TODOs in the three script templates, run it.

## Folder layout

```
your-migration-job/
├── .env                       # secrets — gitignored
├── .env.example               # copied from this skill's env-example.txt
├── package.json               # zero deps (dotenv only, optional)
├── README.md                  # one-paragraph "what this script does + why"
├── main/
│   ├── plan.js                # phase 1 — from plan-script.template.js
│   ├── sync.js                # phase 2 — from sync-script.template.js
│   └── audit.js               # phase 3 — from audit-script.template.js
├── src/
│   ├── cloudJiraClient.js          # from this skill's templates/
│   ├── cloudConfluenceClient.js    # only if you need Confluence
│   ├── datacenterJiraClient.js     # only if you read from DC
│   ├── datacenterConfluenceClient.js
│   ├── planManager.js
│   ├── workerPool.js
│   ├── csvWriter.js
│   ├── identityResolver.js         # if mapping DC users/groups
│   └── <your-domain-processor>.js  # whatever transformation your job needs
├── logs/                      # runtime — gitignored
│   ├── plan_<runId>.json
│   ├── plan_<runId>.csv
│   ├── sync_<runId>.log
│   ├── failed_<runId>.csv
│   ├── audit_<runId>.csv
│   ├── cache_users.json       # if using IdentityResolver
│   └── cache_groups.json
├── mappings/                  # checked in — your durable ID translations
│   ├── users.json             # email/displayName → accountId
│   ├── fields.json            # source customfield_X → dest customfield_Y
│   └── projects.json          # source projectKey → dest projectKey
├── tools/                     # one-off diagnostics, exploratory scripts
└── backups/                   # gitignored — per-page or per-issue pre-mutation snapshots
```

## `package.json` (zero-dep template)

```json
{
  "name": "your-migration-job",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "plan":  "node main/plan.js",
    "sync":  "node main/sync.js",
    "audit": "node main/audit.js"
  },
  "dependencies": {
    "dotenv": "^16.4.5"
  }
}
```

The only required runtime dep is `dotenv`. Everything else is the Node standard library (`https`, `http`, `fs`, `url`, `crypto`). Migration scripts have a short half-life — keeping the dependency footprint tiny avoids supply-chain risk and lets the next operator skim the whole job in an afternoon.

## `.env` template

Copy `env-example.txt` from this skill into your sub-project as `.env.example`, then duplicate to `.env` and fill in the values.

## Naming conventions

| Item | Convention |
|---|---|
| Sub-project directory | `kebab-case-verb-noun`, e.g. `sync-security-levels`, `rewrite-filter-refs` |
| Plan file | `logs/plan_<runId>.json` where runId = `String(Date.now())` |
| Plan preview CSV | `logs/plan_<runId>.csv` |
| Sync log | `logs/sync_<runId>.log` |
| Failed-entries CSV | `logs/failed_<runId>.csv` |
| Audit CSV | `logs/audit_<runId>.csv` |
| Per-entity backup | `backups/<runId>/<entityId>.json` |
| Identity cache | `logs/cache_users.json`, `logs/cache_groups.json` |
| ID mapping (durable) | `mappings/<entity>.json` (checked in, version-controlled) |

## File glossary — what lives where

| Path | Lifecycle | What it is |
|---|---|---|
| `main/*.js` | Script source | Entry points; one file per phase (plan / sync / audit). Operator runs these directly. |
| `src/*.js` | Library code | Imported by main/. Owned by you; don't reach upstream for upgrades — copy improvements into the next sub-project. |
| `logs/` | Runtime artifacts | Gitignored. Plan files, audit CSVs, error CSVs, log files, identity caches. |
| `mappings/` | Durable artifacts | Checked in. Source-of-truth ID translations consumed by every phase. |
| `backups/` | Runtime artifacts | Gitignored. Pre-mutation snapshots for rollback. |
| `tools/` | Throwaway | One-off diagnostic scripts written during the migration; not maintained. |

## `.gitignore` essentials

```
.env
node_modules/
logs/
backups/
```

Leave `mappings/` checked in — that's your audit trail.
