# Atlassian Migration Scripts Skill

Zero-dependency Node.js scaffolding for Atlassian Cloud migration scripts — Data Center → Cloud or Cloud → Cloud.

See [`SKILL.md`](SKILL.md) for the full skill content (the file an AI assistant loads when this skill is selected).

## What this skill gives you

A `templates/` folder of production-tested code (HTTP clients, plan manager, worker pool, identity resolver, CSV writer, three script templates) and a `docs/` folder of decision-making references (the Plan→Sync→Audit mental model, rate-limit math, the post-JCMA ID-mapping rules, Forge KVS remote mending, gotchas).

Drop the clients into a new folder, fill the TODOs in the three script templates, and you have a resumable, idempotent migration job with CSV outputs for human review and an audit script to verify the outcome.

## Quick start

```bash
# 1. Scaffold a new migration sub-project
./scripts/new-script.sh ~/my-migration-jobs/fix-broken-filters

# 2. Fill in credentials
cd ~/my-migration-jobs/fix-broken-filters
cp templates/env-example.txt .env && $EDITOR .env

# 3. Sanity check
./scripts/preflight-check.sh
./scripts/test-auth.sh

# 4. Build a plan (no mutations)
node main/plan-script.js --space DOCS --limit 50

# 5. Lint the plan
./scripts/lint-plan-file.sh logs/plan_*.json

# 6. Dry-run the sync (still no mutations)
node main/sync-script.js --execute-only --plan-file logs/plan_*.json --dry-run

# 7. Execute (requires --confirm)
node main/sync-script.js --execute-only --plan-file logs/plan_*.json --confirm

# 8. Audit the result
node main/audit-script.js --plan-file logs/plan_*.json --seed 42 --sample 150

# 9. Roll-up across audit CSVs
./scripts/audit-summary.sh logs/
```

## Why a skill, not a npm package?

Migration scripts are short-lived, one-off jobs. The patterns below are stable; the scripts that use them are not. A skill is the right granularity: load it when you start a migration, copy the bits you need, throw the script away when the migration is done.

## Repository layout

```
atlassian-migration-scripts-skill/
├── SKILL.md           ← agent-facing entry point
├── README.md          ← this file
├── docs/              ← decision-making references
├── templates/         ← copy-paste-ready code
└── scripts/           ← CI-safe bash helpers
```

See `SKILL.md` for the full documentation map and template index.
