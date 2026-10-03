#!/usr/bin/env bash
# new-script.sh — scaffold a new migration sub-project from the skeleton.
#
# Usage:
#   ./scripts/new-script.sh <target-directory> [--with confluence|jira|both] [--with-dc]
#                                              [--with-transforms] [--with-all]
#
# Creates:
#   <target-directory>/
#   ├── main/           plan.js, sync.js, audit.js (TODO-marked)
#   ├── src/            clients you asked for, plan-manager.js, worker-pool.js,
#   │                   csv-writer.js, identity-resolver.js, instance-fingerprint.js
#   ├── mappings/       empty, ready for fields.json / users.json
#   ├── logs/           .gitkeep
#   ├── .env.example
#   ├── .gitignore
#   ├── package.json    zero-dep (dotenv only)
#   └── README.md       one-line description
#
# Flags:
#   --with confluence|jira|both    Which product clients to include (default: jira)
#   --with-dc                      Also copy DC client variants
#   --with-transforms              Copy ALL transform helpers (adf-builders, jql-rewriter,
#                                  jql-sanitizer, backup-manager, cloud-catalog)
#   --with-all                     Same as --with both --with-dc --with-transforms
#
# Output prefix: [new-script] OK: / FAIL: — CI-safe, no emoji.

set -uo pipefail

SKILL_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATES="$SKILL_ROOT/templates"

TARGET=""
WITH_PRODUCT="jira"
WITH_DC=0
WITH_TRANSFORMS=0

while [[ $# -gt 0 ]]; do
  case $1 in
    --with)              WITH_PRODUCT="$2"; shift 2 ;;
    --with-dc)           WITH_DC=1; shift ;;
    --with-transforms)   WITH_TRANSFORMS=1; shift ;;
    --with-all)          WITH_PRODUCT="both"; WITH_DC=1; WITH_TRANSFORMS=1; shift ;;
    -h|--help)
      sed -n '2,28p' "$0"
      exit 0
      ;;
    *)
      if [[ -z "$TARGET" ]]; then
        TARGET="$1"
        shift
      else
        echo "[new-script] FAIL: unexpected arg: $1"
        exit 2
      fi
      ;;
  esac
done

if [[ -z "$TARGET" ]]; then
  echo "[new-script] FAIL: target directory is required"
  echo "Usage: $0 <target-directory> [--with confluence|jira|both] [--with-dc]"
  exit 2
fi

case "$WITH_PRODUCT" in
  jira|confluence|both) ;;
  *) echo "[new-script] FAIL: --with must be jira, confluence, or both (got: $WITH_PRODUCT)"; exit 2 ;;
esac

if [[ -e "$TARGET" ]]; then
  echo "[new-script] FAIL: $TARGET already exists; refusing to clobber"
  exit 1
fi

mkdir -p "$TARGET/main" "$TARGET/src" "$TARGET/mappings" "$TARGET/logs"
touch "$TARGET/logs/.gitkeep" "$TARGET/mappings/.gitkeep"

# ── Always-included library code ─────────────────────────────────────
cp "$TEMPLATES/plan-manager.js"        "$TARGET/src/planManager.js"
cp "$TEMPLATES/worker-pool.js"         "$TARGET/src/workerPool.js"
cp "$TEMPLATES/csv-writer.js"          "$TARGET/src/csvWriter.js"
cp "$TEMPLATES/identity-resolver.js"   "$TARGET/src/identityResolver.js"
cp "$TEMPLATES/instance-fingerprint.js" "$TARGET/src/instanceFingerprint.js"

# ── Per-product clients ──────────────────────────────────────────────
case "$WITH_PRODUCT" in
  jira)
    cp "$TEMPLATES/cloud-jira-client.js" "$TARGET/src/cloudJiraClient.js"
    [[ "$WITH_DC" -eq 1 ]] && cp "$TEMPLATES/datacenter-jira-client.js" "$TARGET/src/datacenterJiraClient.js"
    ;;
  confluence)
    cp "$TEMPLATES/cloud-confluence-client.js" "$TARGET/src/cloudConfluenceClient.js"
    [[ "$WITH_DC" -eq 1 ]] && cp "$TEMPLATES/datacenter-confluence-client.js" "$TARGET/src/datacenterConfluenceClient.js"
    ;;
  both)
    cp "$TEMPLATES/cloud-jira-client.js"       "$TARGET/src/cloudJiraClient.js"
    cp "$TEMPLATES/cloud-confluence-client.js" "$TARGET/src/cloudConfluenceClient.js"
    if [[ "$WITH_DC" -eq 1 ]]; then
      cp "$TEMPLATES/datacenter-jira-client.js"       "$TARGET/src/datacenterJiraClient.js"
      cp "$TEMPLATES/datacenter-confluence-client.js" "$TARGET/src/datacenterConfluenceClient.js"
    fi
    ;;
esac

# ── Transform helpers (opt-in via --with-transforms) ────────────────
if [[ "$WITH_TRANSFORMS" -eq 1 ]]; then
  cp "$TEMPLATES/adf-builders.js"         "$TARGET/src/adfBuilders.js"
  cp "$TEMPLATES/jql-rewriter.js"         "$TARGET/src/jqlRewriter.js"
  cp "$TEMPLATES/jql-sanitizer.js"        "$TARGET/src/jqlSanitizer.js"
  cp "$TEMPLATES/asset-field-rewriter.js" "$TARGET/src/assetFieldRewriter.js"
  cp "$TEMPLATES/backup-manager.js"       "$TARGET/src/backupManager.js"
  cp "$TEMPLATES/cloud-catalog.js"        "$TARGET/src/cloudCatalog.js"
  cp "$TEMPLATES/owner-swap.js"           "$TARGET/src/ownerSwap.js"
  cp "$TEMPLATES/preflight.js"            "$TARGET/src/preflight.js"
  cp "$TEMPLATES/logger.js"               "$TARGET/src/logger.js"
  cp "$TEMPLATES/csv-reader.js"           "$TARGET/src/csvReader.js"
fi

# ── Entry-point templates ────────────────────────────────────────────
cp "$TEMPLATES/plan-script.template.js"  "$TARGET/main/plan.js"
cp "$TEMPLATES/sync-script.template.js"  "$TARGET/main/sync.js"
cp "$TEMPLATES/audit-script.template.js" "$TARGET/main/audit.js"

# ── .env.example ─────────────────────────────────────────────────────
cp "$TEMPLATES/env-example.txt" "$TARGET/.env.example"

# ── package.json (zero-dep) ──────────────────────────────────────────
TARGET_NAME=$(basename "$TARGET")
cat > "$TARGET/package.json" <<EOF
{
  "name": "${TARGET_NAME}",
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
EOF

# ── .gitignore ───────────────────────────────────────────────────────
cat > "$TARGET/.gitignore" <<'EOF'
.env
node_modules/
logs/
backups/
*.tmp
EOF

# ── README.md ────────────────────────────────────────────────────────
cat > "$TARGET/README.md" <<EOF
# ${TARGET_NAME}

Atlassian migration sub-project. Generated by \`new-script.sh\`.

## Quick start

\`\`\`bash
cp .env.example .env && \$EDITOR .env
npm install
node main/plan.js --help
\`\`\`

See the parent skill's docs for the patterns this uses.
EOF

echo "[new-script] OK: scaffolded $TARGET"
echo "  product:    $WITH_PRODUCT"
echo "  DC clients: $([[ $WITH_DC -eq 1 ]] && echo yes || echo no)"
echo "  transforms: $([[ $WITH_TRANSFORMS -eq 1 ]] && echo yes || echo no)"
echo "  next steps:"
echo "    cd $TARGET"
echo "    cp .env.example .env && \$EDITOR .env"
echo "    npm install"
echo "    fill TODOs in main/plan.js, main/sync.js, main/audit.js"
