#!/bin/bash
# validate-api.sh - Validate Organizations API endpoint syntax
# Usage: ./scripts/validate-api.sh

set -e

SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DOCS_DIR="$SKILL_DIR/docs"

echo "=== Atlassian Organizations API Skill Validation ==="
echo ""

# Check required files
echo "Checking required files..."
REQUIRED_FILES=(
  "SKILL.md"
  "docs/01-core-concepts.md"
  "docs/02-orgs.md"
  "docs/03-users.md"
  "docs/04-groups.md"
  "docs/05-directories.md"
  "docs/06-domains.md"
  "docs/07-events.md"
  "docs/08-policies.md"
  "docs/09-workspaces.md"
  "docs/10-app-access-settings.md"
  "docs/11-permissions-scopes.md"
  "docs/problem-patterns.md"
  "docs/gotchas.md"
)

MISSING=0
for file in "${REQUIRED_FILES[@]}"; do
  if [ ! -f "$SKILL_DIR/$file" ]; then
    echo "  MISSING: $file"
    MISSING=$((MISSING + 1))
  else
    echo "  OK: $file"
  fi
done

echo ""

# Check for common endpoint patterns
echo "Checking endpoint patterns in documentation..."
ENDPOINT_PATTERNS=(
  "GET /v1/orgs"
  "POST /v2/orgs/{orgId}/users/invite"
  "POST /v2/orgs/{orgId}/directories/{directoryId}/users/{accountId}/suspend"
  "GET /v1/orgs/{orgId}/events"
  "POST /v1/orgs/{orgId}/policies"
  "POST /v2/orgs/{orgId}/workspaces"
  "GET /v2/orgs/{orgId}/app-access-settings/domains"
)

for pattern in "${ENDPOINT_PATTERNS[@]}"; do
  if grep -rq "$pattern" "$DOCS_DIR" 2>/dev/null; then
    echo "  FOUND: $pattern"
  else
    echo "  MISSING: $pattern"
  fi
done

echo ""

# Check for deprecated endpoint warnings
echo "Checking deprecated endpoint warnings..."
if grep -rq "deprecated" "$DOCS_DIR/gotchas.md" 2>/dev/null; then
  echo "  OK: Deprecated endpoints documented in gotchas.md"
else
  echo "  WARNING: No deprecated endpoint warnings found"
fi

# Check for scope documentation
echo ""
echo "Checking scope documentation..."
if grep -rq "read:users:admin" "$DOCS_DIR/11-permissions-scopes.md" 2>/dev/null; then
  echo "  OK: OAuth scopes documented"
else
  echo "  WARNING: OAuth scopes may be incomplete"
fi

echo ""

if [ $MISSING -gt 0 ]; then
  echo "Validation FAILED: $MISSING required file(s) missing"
  exit 1
else
  echo "Validation PASSED: All required files present"
  exit 0
fi
