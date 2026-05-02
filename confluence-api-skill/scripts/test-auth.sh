#!/usr/bin/env bash
# test-auth.sh — verify your Confluence Cloud auth works by hitting /wiki/api/v2/spaces.
#
# Reads from env (set EITHER/OR):
#   ATLASSIAN_SITE                   e.g. https://your-domain.atlassian.net  (required)
#   ATLASSIAN_EMAIL + ATLASSIAN_API_TOKEN     for Basic auth
#   ATLASSIAN_ACCESS_TOKEN                    for OAuth 2.0 Bearer
#
# Exits 0 on 200, 1 on any error.

set -uo pipefail

: "${ATLASSIAN_SITE:?ATLASSIAN_SITE is required}"

if [[ -n "${ATLASSIAN_ACCESS_TOKEN:-}" ]]; then
  AUTH=( -H "Authorization: Bearer ${ATLASSIAN_ACCESS_TOKEN}" )
  AUTH_LABEL="OAuth Bearer"
elif [[ -n "${ATLASSIAN_EMAIL:-}" && -n "${ATLASSIAN_API_TOKEN:-}" ]]; then
  AUTH=( -u "${ATLASSIAN_EMAIL}:${ATLASSIAN_API_TOKEN}" )
  AUTH_LABEL="Basic (email + API token)"
else
  echo "[test-auth] FAIL: no auth credentials in env" >&2
  echo "  Set EITHER  ATLASSIAN_ACCESS_TOKEN  (OAuth)" >&2
  echo "         OR  ATLASSIAN_EMAIL + ATLASSIAN_API_TOKEN  (Basic)" >&2
  exit 1
fi

URL="${ATLASSIAN_SITE%/}/wiki/api/v2/spaces?limit=1"
echo "[test-auth] GET ${URL}  (auth: ${AUTH_LABEL})"

HTTP_CODE=$(curl -sS -o /tmp/test-auth-body.$$ -w "%{http_code}" \
  -H "Accept: application/json" "${AUTH[@]}" "$URL" || true)

if [[ "$HTTP_CODE" == "200" ]]; then
  TOTAL=$(grep -o '"total":[0-9]*' /tmp/test-auth-body.$$ | head -1 | cut -d: -f2)
  echo "[test-auth] OK:   200  (sees ${TOTAL:-?} space(s) on this site)"
  rm -f /tmp/test-auth-body.$$
  exit 0
fi

echo "[test-auth] FAIL: HTTP ${HTTP_CODE}" >&2
echo "  ----" >&2
cat /tmp/test-auth-body.$$ >&2 || true
echo "" >&2
echo "  ----" >&2
rm -f /tmp/test-auth-body.$$
exit 1
