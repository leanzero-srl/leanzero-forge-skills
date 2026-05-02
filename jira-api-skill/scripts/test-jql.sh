#!/usr/bin/env bash
# test-jql.sh — run a JQL query against /rest/api/3/search/jql and print the first page.
#
# Usage:  ./scripts/test-jql.sh "project = PROJ AND status != Done"
#         ./scripts/test-jql.sh "assignee = currentUser()"  "summary,status,updated"
#
# Env (same as test-auth.sh):
#   ATLASSIAN_SITE  (required)
#   ATLASSIAN_EMAIL + ATLASSIAN_API_TOKEN  OR  ATLASSIAN_ACCESS_TOKEN

set -uo pipefail

: "${ATLASSIAN_SITE:?ATLASSIAN_SITE is required}"
JQL="${1:-order by created desc}"
FIELDS="${2:-summary,status}"
MAX="${3:-25}"

if [[ -n "${ATLASSIAN_ACCESS_TOKEN:-}" ]]; then
  AUTH=( -H "Authorization: Bearer ${ATLASSIAN_ACCESS_TOKEN}" )
elif [[ -n "${ATLASSIAN_EMAIL:-}" && -n "${ATLASSIAN_API_TOKEN:-}" ]]; then
  AUTH=( -u "${ATLASSIAN_EMAIL}:${ATLASSIAN_API_TOKEN}" )
else
  echo "[test-jql] FAIL: no auth credentials in env" >&2
  exit 1
fi

URL="${ATLASSIAN_SITE%/}/rest/api/3/search/jql"
echo "[test-jql] POST $URL"
echo "[test-jql] JQL: $JQL"
echo "[test-jql] fields: $FIELDS"
echo ""

# Build JSON body without jq (portable)
BODY=$(cat <<EOF
{
  "jql": $(printf '%s' "$JQL" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))'),
  "fields": $(python3 -c 'import json,sys; print(json.dumps([s.strip() for s in sys.argv[1].split(",") if s.strip()]))' "$FIELDS"),
  "maxResults": $MAX
}
EOF
)

HTTP_CODE=$(curl -sS -o /tmp/test-jql.$$ -w "%{http_code}" \
  -X POST "${AUTH[@]}" \
  -H "Accept: application/json" -H "Content-Type: application/json" \
  -d "$BODY" "$URL" || true)

if [[ "$HTTP_CODE" != "200" ]]; then
  echo "[test-jql] FAIL: HTTP $HTTP_CODE" >&2
  cat /tmp/test-jql.$$ >&2; echo "" >&2
  rm -f /tmp/test-jql.$$
  exit 1
fi

# Pretty-print summary if python is available
if command -v python3 >/dev/null 2>&1; then
  python3 -c "
import json, sys
d = json.load(open('/tmp/test-jql.$$'))
print(f\"[test-jql] OK: total={d.get('total','?')} returned={len(d.get('issues',[]))}\")
for i in d.get('issues', []):
    f = i.get('fields', {})
    s = (f.get('status') or {}).get('name', '')
    summary = (f.get('summary') or '')[:60]
    print(f\"  {i.get('key',''):<14} [{s:<14}] {summary}\")
nxt = d.get('nextPageToken')
if nxt:
    print(f\"[test-jql] more pages — nextPageToken={nxt[:24]}...\")
"
else
  cat /tmp/test-jql.$$
fi
rm -f /tmp/test-jql.$$
