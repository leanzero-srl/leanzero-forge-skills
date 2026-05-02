#!/usr/bin/env bash
# test-api-endpoint.sh — probe a few common Confluence REST API endpoints.
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
  printf "[test-api] %-26s %s  HTTP %s\n" "$label" "$path" "$code"
}

probe "list spaces (5)"        "/wiki/api/v2/spaces?limit=5"
probe "list pages (5)"         "/wiki/api/v2/pages?limit=5"
probe "list blogposts (5)"     "/wiki/api/v2/blogposts?limit=5"
probe "list footer-comments"   "/wiki/api/v2/footer-comments?limit=5"
probe "current user (v1)"      "/wiki/rest/api/user/current"
probe "CQL search (v1)"        "/wiki/rest/api/search?cql=type=page&limit=1"

echo "[test-api] done. 200 = OK, 401 = bad auth, 403 = scope/permission, 4xx/5xx = inspect."
