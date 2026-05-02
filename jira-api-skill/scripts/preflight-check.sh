#!/usr/bin/env bash
# preflight-check.sh — verify env vars and tools needed to call the Jira REST API.
# Checks ATLASSIAN_EMAIL + ATLASSIAN_API_TOKEN OR ATLASSIAN_ACCESS_TOKEN, plus ATLASSIAN_SITE.
# CI-safe.

set -uo pipefail

echo "[preflight] Jira REST API integration environment check"
echo "[preflight] -----------------------------------------"
FAILED=0

if ! command -v curl >/dev/null 2>&1; then
  echo "[preflight] FAIL: 'curl' not found in PATH"; FAILED=1
else
  echo "[preflight] OK:   curl is installed"
fi

if [[ -z "${ATLASSIAN_SITE:-}" ]]; then
  echo "[preflight] FAIL: ATLASSIAN_SITE is not set"
  echo "  Hint: export ATLASSIAN_SITE='https://your-domain.atlassian.net'"
  FAILED=1
else
  echo "[preflight] OK:   ATLASSIAN_SITE=$ATLASSIAN_SITE"
fi

if [[ -n "${ATLASSIAN_ACCESS_TOKEN:-}" ]]; then
  echo "[preflight] OK:   ATLASSIAN_ACCESS_TOKEN present (OAuth Bearer)"
elif [[ -n "${ATLASSIAN_EMAIL:-}" && -n "${ATLASSIAN_API_TOKEN:-}" ]]; then
  echo "[preflight] OK:   ATLASSIAN_EMAIL + ATLASSIAN_API_TOKEN present (Basic auth)"
else
  echo "[preflight] FAIL: no auth credentials in env"
  echo "  Set EITHER:  ATLASSIAN_ACCESS_TOKEN  (OAuth 2.0 access token)"
  echo "         OR :  ATLASSIAN_EMAIL + ATLASSIAN_API_TOKEN  (Basic auth)"
  FAILED=1
fi

if command -v forge >/dev/null 2>&1; then
  echo "[preflight] OK:   forge CLI present (only needed for the bundled Forge templates)"
else
  echo "[preflight] note: forge CLI not present (only matters if you use the bundled Forge templates)"
fi

echo "[preflight] -----------------------------------------"
if [[ "$FAILED" -eq 0 ]]; then
  echo "[preflight] OK:   pre-flight check passed"; exit 0
else
  echo "[preflight] FAIL: pre-flight check failed — fix the errors above"; exit 1
fi
