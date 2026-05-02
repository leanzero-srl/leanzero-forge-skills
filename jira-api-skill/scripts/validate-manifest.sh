#!/usr/bin/env bash
# validate-manifest.sh — runs `forge lint` if you're using the bundled Forge templates.
# CI-safe.

set -uo pipefail

if ! command -v forge >/dev/null 2>&1; then
  echo "[validate-manifest] note: 'forge' CLI not in PATH — skipping lint."
  echo "  This script is only useful if you've copied a Forge template from this skill."
  exit 0
fi

if [[ ! -f manifest.yml ]]; then
  echo "[validate-manifest] note: no manifest.yml in cwd — skipping lint."
  exit 0
fi

echo "[validate-manifest] Running 'forge lint'"
if LINT_OUTPUT="$(forge lint 2>&1)"; then
  echo "[validate-manifest] OK: manifest is valid"; exit 0
fi

echo "[validate-manifest] FAIL: manifest validation failed" >&2
echo "  ----" >&2
echo "$LINT_OUTPUT" | grep -E "error|warning" >&2 || echo "  (no parsed lines — full output:)" >&2
echo "  ----" >&2
echo "$LINT_OUTPUT" >&2
echo "  ----" >&2
exit 1
