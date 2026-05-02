#!/usr/bin/env bash
# test-api-endpoint.sh — probe a few common Jira REST API endpoints with your credentials.
#
# Env (same as test-auth.sh):
#   ATLASSIAN_SITE  (required)
#   ATLASSIAN_EMAIL + ATLASSIAN_API_TOKEN  OR  ATLASSIAN_ACCESS_TOKEN

set -uo pipefail

: "${ATLASSIAN_SITE:?ATLASSIAN_SITE is required}"

if [[ -n "${ATLASSIAN_ACCESS_TOKEN:-}" ]]; then
  AUTH=( -H "Authorization: Bearer ${ATLASSIAN_ACCESS_TOKEN}" )
elif [[ -n "${ATLASSIAN_EMAIL:-}" && -n "${ATLASSIAN_API_TOKEN:-}" ]]; then
  AUTH=( -u "${ATLASSIAN_EMAIL}:${ATLASSIAN_API_TOKEN}" )
else
  echo "[test-api] FAIL: no auth credentials in env" >&2
  exit 1
fi

probe() {
  local label="$1"
  local path="$2"
  local code
  code=$(curl -sS -o /dev/null -w "%{http_code}" -H "Accept: application/json" "${AUTH[@]}" \
    "${ATLASSIAN_SITE%/}${path}")
  printf "[test-api] %-30s %s  HTTP %s\n" "$label" "$path" "$code"
}

probe "current user"        "/rest/api/3/myself"
probe "list projects (5)"   "/rest/api/3/project?maxResults=5"
probe "list issuetypes"     "/rest/api/3/issuetype"
probe "list statuses"       "/rest/api/3/status"
probe "list permissions"    "/rest/api/3/permissions"
probe "JQL search (count)"  "/rest/api/3/search/jql?jql=order+by+created+desc&maxResults=1&fields=key"

echo "[test-api] done. 200 = OK, 401 = bad auth, 403 = scope/permission, 4xx/5xx = inspect."
