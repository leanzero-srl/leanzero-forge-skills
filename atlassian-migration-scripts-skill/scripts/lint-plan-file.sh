#!/usr/bin/env bash
# lint-plan-file.sh — validate a plan_*.json file's shape.
#
# Checks:
#   - Top-level keys: version, runId, createdAt, updatedAt, stats, entries
#   - stats has: total, pending, completed, failed, skipped (all numbers)
#   - every entry has: status ∈ {pending, completed, failed, skipped},
#     error (string|null), updatedAt (string|null)
#   - entries count matches stats.total
#
# Usage:
#   ./scripts/lint-plan-file.sh logs/plan_1747549872311.json
#
# Output prefix: [lint-plan-file] OK: / FAIL: — CI-safe, no emoji.

set -uo pipefail

if [[ $# -ne 1 ]]; then
  echo "[lint-plan-file] FAIL: exactly one argument required (path to plan_*.json)"
  exit 2
fi

PLAN="$1"

if [[ ! -f "$PLAN" ]]; then
  echo "[lint-plan-file] FAIL: file not found: $PLAN"
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "[lint-plan-file] FAIL: jq is required (install via 'brew install jq' or 'apt install jq')"
  exit 1
fi

# Parse JSON; fail fast if malformed
if ! jq -e . "$PLAN" >/dev/null 2>&1; then
  echo "[lint-plan-file] FAIL: $PLAN is not valid JSON"
  exit 1
fi

# Top-level keys
for KEY in version runId createdAt updatedAt stats entries; do
  if ! jq -e "has(\"$KEY\")" "$PLAN" >/dev/null; then
    echo "[lint-plan-file] FAIL: top-level key missing: $KEY"
    exit 1
  fi
done
echo "[lint-plan-file] OK: top-level keys present"

# Stats sub-keys
for KEY in total pending completed failed skipped; do
  if ! jq -e ".stats | has(\"$KEY\")" "$PLAN" >/dev/null; then
    echo "[lint-plan-file] FAIL: stats.$KEY missing"
    exit 1
  fi
done
echo "[lint-plan-file] OK: stats keys present"

# Status enum validation
INVALID_STATUS=$(jq -r '
  .entries | to_entries
  | map(select(.value.status as $s | $s != "pending" and $s != "completed" and $s != "failed" and $s != "skipped"))
  | length
' "$PLAN")
if [[ "$INVALID_STATUS" -ne 0 ]]; then
  echo "[lint-plan-file] FAIL: $INVALID_STATUS entries have invalid status"
  jq -r '.entries | to_entries | map(select(.value.status as $s | $s != "pending" and $s != "completed" and $s != "failed" and $s != "skipped")) | .[0:5] | .[] | "  \(.key): status=\(.value.status)"' "$PLAN"
  exit 1
fi
echo "[lint-plan-file] OK: all statuses are valid"

# Entry count matches stats.total
TOTAL=$(jq -r '.stats.total' "$PLAN")
COUNT=$(jq -r '.entries | length' "$PLAN")
if [[ "$TOTAL" -ne "$COUNT" ]]; then
  echo "[lint-plan-file] FAIL: stats.total ($TOTAL) != actual entry count ($COUNT)"
  exit 1
fi
echo "[lint-plan-file] OK: stats.total ($TOTAL) matches entry count"

# Print summary
echo "[lint-plan-file] OK: $PLAN"
jq -r '"  runId:      \(.runId)\n  createdAt:  \(.createdAt)\n  stats:      total=\(.stats.total) pending=\(.stats.pending) completed=\(.stats.completed) failed=\(.stats.failed) skipped=\(.stats.skipped)"' "$PLAN"
