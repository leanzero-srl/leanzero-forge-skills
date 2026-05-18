#!/usr/bin/env bash
# audit-summary.sh — aggregate pass/fail/missing counts across audit_*.csv files.
#
# Usage:
#   ./scripts/audit-summary.sh                  # current dir's logs/
#   ./scripts/audit-summary.sh path/to/logs     # specific dir
#   ./scripts/audit-summary.sh path/to/audit_*.csv  # specific files
#
# Output prefix: [audit-summary] OK: / FAIL: — CI-safe, no emoji.

set -uo pipefail

# Resolve input — directory or files
INPUTS=()
if [[ $# -eq 0 ]]; then
  if [[ -d "logs" ]]; then
    while IFS= read -r f; do INPUTS+=("$f"); done < <(find logs -maxdepth 1 -name 'audit_*.csv' -type f)
  fi
elif [[ -d "$1" ]]; then
  while IFS= read -r f; do INPUTS+=("$f"); done < <(find "$1" -maxdepth 1 -name 'audit_*.csv' -type f)
else
  for arg in "$@"; do
    if [[ -f "$arg" ]]; then
      INPUTS+=("$arg")
    else
      echo "[audit-summary] FAIL: not a file: $arg"
      exit 1
    fi
  done
fi

if [[ ${#INPUTS[@]} -eq 0 ]]; then
  echo "[audit-summary] FAIL: no audit_*.csv files found"
  exit 1
fi

GRAND_TOTAL=0
GRAND_PASS=0
GRAND_FAIL=0
GRAND_MISSING=0

for FILE in "${INPUTS[@]}"; do
  # Each audit CSV ends with: # total=N pass=N fail=N missing=N
  FOOTER=$(grep '^# total=' "$FILE" | tail -1 || true)
  if [[ -z "$FOOTER" ]]; then
    # Compute from rows (column 6 is "match")
    T=$(tail -n +2 "$FILE" | grep -v '^#' | wc -l | tr -d ' ')
    P=$(tail -n +2 "$FILE" | grep -v '^#' | awk -F, '$6 ~ /PASS/    {n++} END {print n+0}')
    F=$(tail -n +2 "$FILE" | grep -v '^#' | awk -F, '$6 ~ /FAIL/    {n++} END {print n+0}')
    M=$(tail -n +2 "$FILE" | grep -v '^#' | awk -F, '$6 ~ /MISSING/ {n++} END {print n+0}')
  else
    T=$(echo "$FOOTER" | sed -E 's/.*total=([0-9]+).*/\1/')
    P=$(echo "$FOOTER" | sed -E 's/.*pass=([0-9]+).*/\1/')
    F=$(echo "$FOOTER" | sed -E 's/.*fail=([0-9]+).*/\1/')
    M=$(echo "$FOOTER" | sed -E 's/.*missing=([0-9]+).*/\1/')
  fi

  printf "[audit-summary] %s: total=%d pass=%d fail=%d missing=%d\n" \
    "$(basename "$FILE")" "$T" "$P" "$F" "$M"
  GRAND_TOTAL=$((GRAND_TOTAL + T))
  GRAND_PASS=$((GRAND_PASS + P))
  GRAND_FAIL=$((GRAND_FAIL + F))
  GRAND_MISSING=$((GRAND_MISSING + M))
done

printf "[audit-summary] TOTAL: %d audited, %d pass, %d fail, %d missing\n" \
  "$GRAND_TOTAL" "$GRAND_PASS" "$GRAND_FAIL" "$GRAND_MISSING"

if [[ "$GRAND_FAIL" -gt 0 || "$GRAND_MISSING" -gt 0 ]]; then
  echo "[audit-summary] FAIL: $GRAND_FAIL failures + $GRAND_MISSING missing across all CSVs"
  exit 1
fi

echo "[audit-summary] OK: all audited entries passed"
