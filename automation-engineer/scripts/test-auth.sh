#!/usr/bin/env bash
# test-auth.sh — verify your token can reach the Automation REST API, by listing rule summaries.
#
# Reads from env:
#   ATLASSIAN_CLOUDID                 the site's cloud id (required)
#   ATLASSIAN_EMAIL + ATLASSIAN_API_TOKEN     classic (unscoped) API token, Basic auth
#   ATLASSIAN_PRODUCT                 "jira" or "confluence" (default: jira)
#
# A granular/scoped API token will authenticate against other Atlassian REST APIs but gets a
# distinct 401 "Unauthorized; scope does not match" here on every call, including this one — see
# docs/gotchas.md before assuming the scope needs adjusting.
#
# Exits 0 on 200, 1 on any error.

set -uo pipefail

: "${ATLASSIAN_CLOUDID:?ATLASSIAN_CLOUDID is required}"
: "${ATLASSIAN_EMAIL:?ATLASSIAN_EMAIL is required}"
: "${ATLASSIAN_API_TOKEN:?ATLASSIAN_API_TOKEN is required}"

PRODUCT="${ATLASSIAN_PRODUCT:-jira}"
URL="https://api.atlassian.com/automation/public/${PRODUCT}/${ATLASSIAN_CLOUDID}/rest/v1/rule/summary?limit=1"

echo "[test-auth] GET ${URL}"

HTTP_CODE=$(curl -sS -o /tmp/automation-test-auth-body.$$ -w "%{http_code}" \
  -u "${ATLASSIAN_EMAIL}:${ATLASSIAN_API_TOKEN}" \
  -H "Accept: application/json" "$URL" || true)

if [[ "$HTTP_CODE" == "200" ]]; then
  echo "[test-auth] OK:   200 — token can list automation rules"
  rm -f /tmp/automation-test-auth-body.$$
  exit 0
fi

echo "[test-auth] FAIL: HTTP ${HTTP_CODE}" >&2
echo "  ----" >&2
cat /tmp/automation-test-auth-body.$$ >&2 || true
echo "" >&2
echo "  ----" >&2
if [[ "$HTTP_CODE" == "401" ]]; then
  echo "  If the response says 'scope does not match', you're likely using a granular/scoped API" >&2
  echo "  token — this API isn't covered by that catalog at all. Use a classic token instead." >&2
fi
rm -f /tmp/automation-test-auth-body.$$
exit 1
