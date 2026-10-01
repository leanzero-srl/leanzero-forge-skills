#!/usr/bin/env bash
# leak-scan.sh — grep a directory for every term of a DENYLIST file. Exit 1 on any hit.
#
# Use it on anything that leaves your hands: a skill/doc folder before publishing, an export, a report, a snapshot
# you are about to share, a repo before pushing. The denylist holds what must NOT appear (client names, people,
# project/space keys, hostnames, ids, e-mail domains). Keep the denylist itself OUT of the scanned directory and out
# of git — it is the most sensitive file you have.
#
# Usage:
#   leak-scan.sh <dir> <denylist-file> [--allow <allow-file>] [--words] [--case] [--binary]
#
# Denylist format (one term per line):
#   plain text        matched as a fixed string, case-insensitive (default)
#   re:<regex>        matched as an extended regex, e.g.  re:[a-z0-9-]+\.atlassian\.net
#   # comment / blank lines ignored
# --allow <file>   extended regexes; a HIT LINE matching any of them is ignored (e.g. ^.*(source|target)\.atlassian\.net)
# --words          whole-word match for plain terms (short keys like "AB" or "QA" need this, or every word matches)
# --case           case-sensitive
# --binary         also scan binary files (grep -a). Default: text files only, and the number of skipped binary files
#                  is reported, because a name inside a PDF/PNG/zip is still a leak.
#
# Output prefixes: [leak-scan] OK: / [leak-scan] FAIL: / [leak-scan] INFO:  — CI-safe, no colour, no emoji.
# Exit: 0 clean, 1 hits found, 2 usage error.

set -uo pipefail

DIR="${1:-}"; DENY="${2:-}"
[[ -z "$DIR" || -z "$DENY" ]] && { sed -n '2,26p' "$0"; exit 2; }
[[ -d "$DIR" ]] || { echo "[leak-scan] FAIL: not a directory: $DIR"; exit 2; }
[[ -f "$DENY" ]] || { echo "[leak-scan] FAIL: denylist not found: $DENY"; exit 2; }
shift 2

ALLOW=""; WORDS=0; CASE=0; BINARY=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --allow)  ALLOW="${2:-}"; [[ -f "$ALLOW" ]] || { echo "[leak-scan] FAIL: allow file not found: $ALLOW"; exit 2; }; shift 2 ;;
    --words)  WORDS=1; shift ;;
    --case)   CASE=1; shift ;;
    --binary) BINARY=1; shift ;;
    *) echo "[leak-scan] FAIL: unknown argument: $1"; exit 2 ;;
  esac
done

# refuse to scan the denylist itself (it would match everything and the scan would print the secrets)
DENY_ABS="$(cd "$(dirname "$DENY")" && pwd)/$(basename "$DENY")"
DIR_ABS="$(cd "$DIR" && pwd)"
case "$DENY_ABS" in "$DIR_ABS"/*) echo "[leak-scan] FAIL: the denylist is inside the scanned directory - move it out"; exit 2 ;; esac

BASE_OPTS=(-r -n)
[[ $CASE -eq 0 ]] && BASE_OPTS+=(-i)
if [[ $BINARY -eq 1 ]]; then BASE_OPTS+=(-a); else BASE_OPTS+=(-I); fi

HITS=0; TERMS=0
TMP="$(mktemp)"; trap 'rm -f "$TMP"' EXIT

while IFS= read -r line || [[ -n "$line" ]]; do
  term="${line%$'\r'}"
  [[ -z "${term// /}" || "$term" == \#* ]] && continue
  TERMS=$((TERMS + 1))
  opts=("${BASE_OPTS[@]}")
  if [[ "$term" == re:* ]]; then
    pat="${term#re:}"; opts+=(-E)
  else
    pat="$term"; opts+=(-F)
    [[ $WORDS -eq 1 ]] && opts+=(-w)
  fi
  grep "${opts[@]}" -e "$pat" -- "$DIR" > "$TMP" 2>/dev/null
  if [[ -n "$ALLOW" && -s "$TMP" ]]; then
    grep -v -E -f "$ALLOW" "$TMP" > "$TMP.f" 2>/dev/null; mv "$TMP.f" "$TMP"
  fi
  if [[ -s "$TMP" ]]; then
    n=$(wc -l < "$TMP" | tr -d ' ')
    HITS=$((HITS + n))
    # print location + the term index, never echo the denylist term itself into CI logs
    while IFS= read -r hit; do
      echo "[leak-scan] FAIL: term #$TERMS -> ${hit:0:240}"
    done < "$TMP"
  fi
done < "$DENY"

if [[ $BINARY -eq 0 ]]; then
  NBIN=$(grep -r -l -I -e '' -- "$DIR" 2>/dev/null | wc -l | tr -d ' ')
  NALL=$(find "$DIR" -type f | wc -l | tr -d ' ')
  SKIPPED=$((NALL - NBIN))
  [[ $SKIPPED -gt 0 ]] && echo "[leak-scan] INFO: $SKIPPED binary/empty file(s) not scanned - re-run with --binary to include them"
fi

if [[ $HITS -gt 0 ]]; then
  echo "[leak-scan] FAIL: $HITS hit(s) for $TERMS term(s) in $DIR"
  exit 1
fi
echo "[leak-scan] OK: 0 hits for $TERMS term(s) in $DIR"
exit 0
