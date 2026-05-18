#!/usr/bin/env bash
# test-auth.sh — verify Cloud + DC credentials by calling /myself.
#
# Reads vars from .env (or --env-file). Hits:
#   - $CLOUD_BASE_URL/rest/api/3/myself        (Jira Cloud)
#   - $CLOUD_BASE_URL/rest/api/user/current    (Confluence Cloud; if /wiki path)
#   - $DC_BASE_URL/rest/api/2/myself           (Jira DC)
#
# Output prefix: [test-auth] OK: / FAIL: — CI-safe, no emoji.

set -uo pipefail

ENV_FILE=".env"
FAILED=0

while [[ $# -gt 0 ]]; do
  case $1 in
    --env-file) ENV_FILE="$2"; shift 2 ;;
    *) echo "[test-auth] FAIL: unknown arg: $1"; exit 2 ;;
  esac
done

if [[ ! -f "$ENV_FILE" ]]; then
  echo "[test-auth] FAIL: $ENV_FILE not found"
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

# ── Cloud: Jira or Confluence ────────────────────────────────────────
if [[ -n "${CLOUD_BASE_URL:-}" && -n "${CLOUD_EMAIL:-}" && -n "${CLOUD_API_TOKEN:-}" ]]; then
  # Detect Confluence by /wiki path; otherwise treat as Jira
  if [[ "$CLOUD_BASE_URL" == */wiki* ]]; then
    URL="$CLOUD_BASE_URL/rest/api/user/current"
    LABEL="Confluence Cloud"
  else
    URL="$CLOUD_BASE_URL/rest/api/3/myself"
    LABEL="Jira Cloud"
  fi
  STATUS=$(curl -sS -o /dev/null -w "%{http_code}" \
    --max-time 30 \
    -u "$CLOUD_EMAIL:$CLOUD_API_TOKEN" \
    -H "Accept: application/json" \
    "$URL" || echo "000")
  if [[ "$STATUS" == "200" ]]; then
    echo "[test-auth] OK: $LABEL ($URL → 200)"
  else
    echo "[test-auth] FAIL: $LABEL ($URL → $STATUS)"
    FAILED=1
  fi
else
  echo "[test-auth] FAIL: Cloud credentials incomplete in $ENV_FILE"
  FAILED=1
fi

# ── DC: Jira (basic or PAT) ──────────────────────────────────────────
if [[ -n "${DC_BASE_URL:-}" ]]; then
  AUTH_ARG=""
  if [[ -n "${DC_PAT:-}" ]]; then
    AUTH_ARG=(-H "Authorization: Bearer $DC_PAT")
    AUTH_LABEL="PAT"
  elif [[ -n "${DC_USERNAME:-}" && -n "${DC_PASSWORD:-}" ]]; then
    AUTH_ARG=(-u "$DC_USERNAME:$DC_PASSWORD")
    AUTH_LABEL="Basic"
  else
    echo "[test-auth] FAIL: DC_BASE_URL set but no DC_PAT or DC_USERNAME/DC_PASSWORD"
    exit 1
  fi
  STATUS=$(curl -sS -o /dev/null -w "%{http_code}" \
    --max-time 30 \
    "${AUTH_ARG[@]}" \
    -H "Accept: application/json" \
    "$DC_BASE_URL/rest/api/2/myself" || echo "000")
  if [[ "$STATUS" == "200" ]]; then
    echo "[test-auth] OK: DC Jira ($AUTH_LABEL → 200)"
  else
    echo "[test-auth] FAIL: DC Jira ($AUTH_LABEL → $STATUS)"
    FAILED=1
  fi
fi

exit "$FAILED"
