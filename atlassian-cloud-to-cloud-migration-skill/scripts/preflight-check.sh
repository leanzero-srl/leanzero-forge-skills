#!/usr/bin/env bash
# preflight-check.sh — read-only checks before a Cloud-to-Cloud copy. Never writes to either site.
#
# Env (export, or put in .env and pass --env-file .env):
#   SRC_BASE, SRC_EMAIL, SRC_TOKEN     source site (read)
#   TGT_BASE, TGT_EMAIL, TGT_TOKEN     target site (write account)
#   TGT2_EMAIL, TGT2_TOKEN             optional second target account (its own rate budget)
#   PROJECT_KEYS="PROJ DESK"           target project keys that must be FREE
#   KNOWN_TAKEN_KEY=ABC                a key that EXISTS on the target (positive control for the key check)
#   SPACE_KEYS="SPACE DOCS"            target space keys that must be FREE
#   KNOWN_SPACE_KEY=XYZ                a space that EXISTS on the target (route/auth positive control)
#   USE_ADMIN_KEY=1                    Confluence Premium/Enterprise + site/org admin: look up space keys with an admin
#                                      key (sees spaces restricted from you); disabled again at the end
#   ACCEPT_UNPROVEN_SPACE_KEYS=1       downgrade "not visible to this account" from FAIL to INFO (a decision - log it)
#
# Checks: curl + python3 present; /myself on both sites (and the second account); ADMINISTER on the target;
# seats per product (/applicationrole - needs Administer Jira); project keys free via /projectvalidate/key WITH a
# positive control; space keys via v2 /wiki/api/v2/spaces?keys= (current AND archived). A space restricted from your
# account is INVISIBLE there, so "not found" proves the key free only with an admin key; otherwise it is a FAIL
# unless ACCEPT_UNPROVEN_SPACE_KEYS=1. A negative without its control is reported as FAIL.
# Credentials never appear on a command line (curl reads them from a process-substitution config, not argv).
#
# Output prefixes: [preflight] OK: / [preflight] FAIL: / [preflight] INFO:  — CI-safe, no emoji.
# Exit 0 if every check passed, 1 otherwise.

set -uo pipefail
FAILED=0
ok()   { echo "[preflight] OK: $*"; }
fail() { echo "[preflight] FAIL: $*"; FAILED=1; }
info() { echo "[preflight] INFO: $*"; }

if [[ "${1:-}" == "--env-file" ]]; then
  [[ -f "${2:-}" ]] || { echo "[preflight] FAIL: env file not found: ${2:-}"; exit 1; }
  set -a; # shellcheck disable=SC1090
  source "$2"; set +a
fi

for t in curl python3; do command -v "$t" >/dev/null 2>&1 && ok "$t present" || fail "$t missing"; done
for v in SRC_BASE SRC_EMAIL SRC_TOKEN TGT_BASE TGT_EMAIL TGT_TOKEN; do
  [[ -n "${!v:-}" ]] || fail "env $v not set"
done
[[ $FAILED -eq 1 ]] && exit 1

# call <method> <base> <email> <token> <path> [extra curl args...] -> prints "<http_code> <body>"
# the credentials go through a curl config on a file descriptor, so `ps` never shows the token
call() {
  local m="$1" base="$2" em="$3" tok="$4" path="$5" body code; shift 5
  body="$(curl -sS -X "$m" -w $'\n%{http_code}' -K <(printf 'user = "%s:%s"\n' "$em" "$tok") \
          -H 'Accept: application/json' "$@" "${base%/}$path" 2>/dev/null)"
  code="${body##*$'\n'}"; body="${body%$'\n'*}"
  printf '%s %s' "$code" "$body"
}
get() { call GET "$@"; }
field() { python3 -c "import sys,json
try: d=json.loads(sys.stdin.read())
except Exception: print(''); sys.exit()
print(eval(sys.argv[1]))" "$1"; }

# 1) identities
for side in SRC TGT TGT2; do
  base_v="${side}_BASE"; [[ "$side" == TGT2 ]] && base_v="TGT_BASE"
  em_v="${side}_EMAIL"; tok_v="${side}_TOKEN"
  [[ -z "${!em_v:-}" ]] && continue
  r="$(get "${!base_v}" "${!em_v}" "${!tok_v}" /rest/api/3/myself)"; code="${r%% *}"
  if [[ "$code" == 200 ]]; then
    ok "$side identity: $(printf '%s' "${r#* }" | field 'd.get("displayName","?")+" "+d.get("accountId","?")') on ${!base_v}"
  else
    fail "$side /myself -> HTTP $code on ${!base_v}"
  fi
done

# 2) admin on the target (notifyUsers=false, scheme changes and project creation need it)
r="$(get "$TGT_BASE" "$TGT_EMAIL" "$TGT_TOKEN" '/rest/api/3/mypermissions?permissions=ADMINISTER')"
adm="$(printf '%s' "${r#* }" | field 'd["permissions"]["ADMINISTER"]["havePermission"]')"
[[ "$adm" == True ]] && ok "target account is Jira admin" || fail "target account is NOT Jira admin (got: ${adm:-HTTP ${r%% *}})"

# 3) seats (measure, never guess; userCount drifts daily - quote with the date; needs Administer Jira)
r="$(get "$TGT_BASE" "$TGT_EMAIL" "$TGT_TOKEN" /rest/api/3/applicationrole)"
if [[ "${r%% *}" == 200 ]]; then
  printf '%s' "${r#* }" | python3 -c "import sys,json,datetime
for a in json.load(sys.stdin):
    s,u=a.get('numberOfSeats'),a.get('userCount')
    print('[preflight] INFO: seats %s: %s used of %s (%s free) on %s'%(a.get('key'),u,s,(s-u) if isinstance(s,int) and isinstance(u,int) else '?',datetime.date.today()))"
else
  fail "applicationrole -> HTTP ${r%% *}"
fi

# 4) project keys free - with a positive control on the same endpoint
validate() { get "$TGT_BASE" "$TGT_EMAIL" "$TGT_TOKEN" "/rest/api/3/projectvalidate/key?key=$1"; }
if [[ -n "${PROJECT_KEYS:-}" ]]; then
  if [[ -z "${KNOWN_TAKEN_KEY:-}" ]]; then
    fail "KNOWN_TAKEN_KEY not set - a 'key is free' answer without a positive control proves nothing"
  else
    r="$(validate "$KNOWN_TAKEN_KEY")"
    n="$(printf '%s' "${r#* }" | field 'len(d.get("errors",{}))+len(d.get("errorMessages",[]))')"
    if [[ "${n:-0}" -gt 0 ]]; then
      ok "positive control: $KNOWN_TAKEN_KEY reported as taken"
      for k in $PROJECT_KEYS; do
        r="$(validate "$k")"
        n="$(printf '%s' "${r#* }" | field 'len(d.get("errors",{}))+len(d.get("errorMessages",[]))')"
        [[ "${r%% *}" == 200 && "${n:-1}" == 0 ]] && ok "project key $k is free" \
          || fail "project key $k NOT free: $(printf '%s' "${r#* }" | head -c 200)"
      done
    else
      fail "positive control failed: $KNOWN_TAKEN_KEY not reported as taken - the key check cannot be trusted"
    fi
  fi
fi

# 5) space keys - v2 spaces?keys=, current AND archived (an archived space still holds its key)
spaces_found() {  # <key> [extra curl args] -> prints the number of spaces with that key visible, or ERR
  local n=0 st r c
  for st in current archived; do
    r="$(get "$TGT_BASE" "$TGT_EMAIL" "$TGT_TOKEN" "/wiki/api/v2/spaces?keys=$1&status=$st&limit=5" "${@:2}")"
    [[ "${r%% *}" == 200 ]] || { echo ERR; return; }
    c="$(printf '%s' "${r#* }" | field 'len([x for x in d.get("results",[]) if x.get("key")=="'"$1"'"])')"
    n=$((n + ${c:-0}))
  done
  echo "$n"
}
if [[ -n "${SPACE_KEYS:-}" ]]; then
  if [[ -z "${KNOWN_SPACE_KEY:-}" ]]; then
    fail "KNOWN_SPACE_KEY not set - a 'not found' without a positive control proves nothing"
  else
    ADM=()
    if [[ "${USE_ADMIN_KEY:-}" == 1 ]]; then
      r="$(call POST "$TGT_BASE" "$TGT_EMAIL" "$TGT_TOKEN" /wiki/api/v2/admin-key -H 'Content-Type: application/json' -d '{"durationInMinutes":10}')"
      if [[ "${r%% *}" == 200 ]]; then ADM=(-H 'Atl-Confluence-With-Admin-Key: true'); ok "admin key enabled (10 min)"
      else fail "admin key not available (HTTP ${r%% *}: Premium/Enterprise + site/org admin only)"; fi
    fi
    if [[ "$(spaces_found "$KNOWN_SPACE_KEY" ${ADM[@]+"${ADM[@]}"})" == 1 ]]; then
      ok "positive control: space $KNOWN_SPACE_KEY found by the same lookup"
      for s in $SPACE_KEYS; do
        n="$(spaces_found "$s" ${ADM[@]+"${ADM[@]}"})"
        if [[ "$n" == ERR ]]; then fail "space key $s: lookup failed"
        elif [[ "$n" -gt 0 ]]; then fail "space key $s is TAKEN"
        elif [[ ${#ADM[@]} -gt 0 ]]; then ok "space key $s is free (admin-key lookup sees restricted spaces too)"
        elif [[ "${ACCEPT_UNPROVEN_SPACE_KEYS:-}" == 1 ]]; then info "space key $s not visible to this account - UNPROVEN (accepted: log the decision)"
        else fail "space key $s not visible to this account - NOT proof it is free (a space restricted from you is invisible): USE_ADMIN_KEY=1, or confirm with a site admin, then ACCEPT_UNPROVEN_SPACE_KEYS=1"
        fi
      done
    else
      fail "positive control failed: space $KNOWN_SPACE_KEY not found by the lookup"
    fi
    [[ ${#ADM[@]} -gt 0 ]] && call DELETE "$TGT_BASE" "$TGT_EMAIL" "$TGT_TOKEN" /wiki/api/v2/admin-key >/dev/null
  fi
fi

info "not checked here (see docs/02): required fields per type (create ONE real item), automation that can fire, rate budget"
[[ $FAILED -eq 0 ]] && { echo "[preflight] OK: all checks passed"; exit 0; }
echo "[preflight] FAIL: see above"; exit 1
