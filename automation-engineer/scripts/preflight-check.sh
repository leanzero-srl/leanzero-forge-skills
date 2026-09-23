#!/usr/bin/env bash
# preflight-check.sh — verify env vars and tools needed to call the Automation REST API.
# CI-safe.

set -uo pipefail

echo "[preflight] Automation REST API integration environment check"
echo "[preflight] -------------------------------------------------"
FAILED=0

if ! command -v python3 >/dev/null 2>&1; then
  echo "[preflight] FAIL: 'python3' not found in PATH"; FAILED=1
else
  echo "[preflight] OK:   python3 is installed"
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "[preflight] FAIL: 'curl' not found in PATH"; FAILED=1
else
  echo "[preflight] OK:   curl is installed"
fi

if [[ -z "${ATLASSIAN_CLOUDID:-}" ]]; then
  echo "[preflight] FAIL: ATLASSIAN_CLOUDID is not set"
  echo "  Hint: any myself/tenant-info call on your site echoes its cloudId."
  FAILED=1
else
  echo "[preflight] OK:   ATLASSIAN_CLOUDID=$ATLASSIAN_CLOUDID"
fi

if [[ -n "${ATLASSIAN_EMAIL:-}" && -n "${ATLASSIAN_API_TOKEN:-}" ]]; then
  echo "[preflight] OK:   ATLASSIAN_EMAIL + ATLASSIAN_API_TOKEN present (Basic auth)"
  echo "[preflight] note: this MUST be a classic (unscoped) API token - granular/scoped tokens do"
  echo "             not cover this API at all (see docs/gotchas.md)."
else
  echo "[preflight] FAIL: no auth credentials in env"
  echo "  Set:  ATLASSIAN_EMAIL + ATLASSIAN_API_TOKEN  (classic API token, Basic auth)"
  FAILED=1
fi

echo "[preflight] -------------------------------------------------"
if [[ "$FAILED" -eq 0 ]]; then
  echo "[preflight] OK:   pre-flight check passed"; exit 0
else
  echo "[preflight] FAIL: pre-flight check failed — fix the errors above"; exit 1
fi
