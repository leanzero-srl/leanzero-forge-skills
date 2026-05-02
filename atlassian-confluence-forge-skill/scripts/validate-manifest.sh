#!/usr/bin/env bash
# validate-manifest.sh — runs `forge lint` and prints a parsed summary.
# CI-safe: no emoji, no color escapes.

set -uo pipefail

echo "[validate-manifest] Running 'forge lint'"

if LINT_OUTPUT="$(forge lint 2>&1)"; then
  echo "[validate-manifest] OK: manifest is valid"
  exit 0
fi

echo "[validate-manifest] FAIL: manifest validation failed" >&2
echo "  ----"
# Forge lint lines look like: path:line:col: <error|warning> message
echo "$LINT_OUTPUT" | grep -E "error|warning" >&2 || echo "  (no parsed error/warning lines — full output:)" >&2
echo "  ----" >&2
echo "$LINT_OUTPUT" >&2
echo "  ----" >&2
echo "  Hint: 'forge deploy' may surface more detailed errors." >&2
exit 1
