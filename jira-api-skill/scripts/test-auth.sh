#!/usr/bin/env bash
# test-auth.sh — verify your Jira Cloud auth works by hitting /rest/api/3/myself.
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

URL="${ATLASSIAN_SITE%/}/rest/api/3/myself"
echo "[test-auth] GET ${URL}  (auth: ${AUTH_LABEL})"

HTTP_CODE=$(curl -sS -o /tmp/test-auth-body.$$ -w "%{http_code}" \
  -H "Accept: application/json" "${AUTH[@]}" "$URL" || true)

if [[ "$HTTP_CODE" == "200" ]]; then
  ACCOUNT_ID=$(grep -o '"accountId":"[^"]*' /tmp/test-auth-body.$$ | head -1 | cut -d'"' -f4)
  EMAIL=$(grep -o '"emailAddress":"[^"]*' /tmp/test-auth-body.$$ | head -1 | cut -d'"' -f4)
  echo "[test-auth] OK:   200 ${ACCOUNT_ID:-<no accountId>}  ${EMAIL:-<email hidden>}"
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
