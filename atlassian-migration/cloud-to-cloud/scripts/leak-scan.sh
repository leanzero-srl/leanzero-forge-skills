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
#   # comment / blank lines ignored. A denylist with 0 terms is an ERROR (exit 2), never "clean".
# --allow <file>   extended regexes, one per line (blank and # lines ignored); a hit whose matched LINE TEXT matches
#                  any of them is ignored (e.g. (source|target)\.atlassian\.net). Applied to the line text only, never
#                  to the file path.
# --words          whole-word match for plain terms (short keys like "AB" or "QA" need this, or every word matches)
# --case           case-sensitive
# --binary         also grep binary files byte-wise (grep -a). That finds plain UTF-8/ASCII strings inside binaries;
#                  it CANNOT see inside compressed containers (zip, docx/xlsx/pptx, most PDFs, gz, PNG text that is
#                  deflated) or UTF-16 text. Extract those first (unzip, pdftotext, strings -el) and scan the output.
#                  Default: text files only, and the number of skipped binary files is reported.
#
# Output: hit LOCATIONS only (term number + file:line) — never the matched text, which contains the protected term.
# Prefixes: [leak-scan] OK: / [leak-scan] FAIL: / [leak-scan] INFO:  — CI-safe, no colour, no emoji.
# Exit: 0 clean, 1 hits found, 2 usage error, invalid regex, unreadable input or grep error (never "clean").

set -uo pipefail

DIR="${1:-}"; DENY="${2:-}"
[[ -z "$DIR" || -z "$DENY" ]] && { sed -n '2,30p' "$0"; exit 2; }
[[ -d "$DIR" ]] || { echo "[leak-scan] FAIL: not a directory: $DIR"; exit 2; }
[[ -f "$DENY" && -r "$DENY" ]] || { echo "[leak-scan] FAIL: denylist not found/readable: $DENY"; exit 2; }
shift 2

ALLOW=""; WORDS=0; CASE=0; BINARY=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --allow)  ALLOW="${2:-}"; [[ -f "$ALLOW" && -r "$ALLOW" ]] || { echo "[leak-scan] FAIL: allow file not found: $ALLOW"; exit 2; }; shift 2 ;;
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

WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT

# allow file: drop blank and comment lines (an EMPTY pattern matches every line and would hide every hit), and
# validate every regex (an invalid one makes grep exit 2 - which must never read as "no hits")
ALLOWC="$WORK/allow"
if [[ -n "$ALLOW" ]]; then
  : > "$ALLOWC"; ai=0
  while IFS= read -r a || [[ -n "$a" ]]; do
    a="${a%$'\r'}"; ai=$((ai + 1))
    [[ -z "${a//[[:space:]]/}" || "$a" == \#* ]] && continue
    grep -E -e "$a" /dev/null >/dev/null 2>&1; [[ $? -eq 2 ]] && { echo "[leak-scan] FAIL: invalid allow regex on line $ai"; exit 2; }
    printf '%s\n' "$a" >> "$ALLOWC"
  done < "$ALLOW"
  [[ -s "$ALLOWC" ]] || ALLOW=""
fi

BASE_OPTS=(-r -n --null)
[[ $CASE -eq 0 ]] && BASE_OPTS+=(-i)
if [[ $BINARY -eq 1 ]]; then BASE_OPTS+=(-a); else BASE_OPTS+=(-I); fi

HITS=0; TERMS=0; LN=0
RAW="$WORK/raw"; LOC="$WORK/loc"; TXT="$WORK/txt"; KEEP="$WORK/keep"

while IFS= read -r line || [[ -n "$line" ]]; do
  LN=$((LN + 1))
  term="${line%$'\r'}"
  [[ -z "${term//[[:space:]]/}" || "$term" == \#* ]] && continue
  TERMS=$((TERMS + 1))
  opts=("${BASE_OPTS[@]}")
  if [[ "$term" == re:* ]]; then
    pat="${term#re:}"; opts+=(-E)
    [[ -z "$pat" ]] && { echo "[leak-scan] FAIL: empty regex on denylist line $LN"; exit 2; }
    grep -E -e "$pat" /dev/null >/dev/null 2>&1; [[ $? -eq 2 ]] && { echo "[leak-scan] FAIL: invalid regex on denylist line $LN"; exit 2; }
  else
    pat="$term"; opts+=(-F)
    [[ $WORDS -eq 1 ]] && opts+=(-w)
  fi
  grep "${opts[@]}" -e "$pat" -- "$DIR" > "$RAW" 2>"$WORK/err"; rc=$?
  if [[ $rc -eq 2 ]]; then
    echo "[leak-scan] FAIL: grep error on denylist line $LN (unreadable file or bad pattern): $(head -c 200 "$WORK/err" | tr '\n' ' ')"
    exit 2
  fi
  [[ -s "$RAW" ]] || continue
  # split "path\0lineno:text" into locations and texts (same order)
  : > "$LOC"; : > "$TXT"
  while IFS= read -r -d '' path && IFS= read -r rest; do
    printf '%s:%s\n' "$path" "${rest%%:*}" >> "$LOC"
    printf '%s\n' "${rest#*:}" >> "$TXT"
  done < "$RAW"
  if [[ -n "$ALLOW" ]]; then
    grep -n -v -E -f "$ALLOWC" "$TXT" > "$KEEP"; rc=$?
    [[ $rc -eq 2 ]] && { echo "[leak-scan] FAIL: grep error applying the allow file"; exit 2; }
    cut -d: -f1 "$KEEP" > "$KEEP.n"
    awk 'NR==FNR { k[$1]=1; next } (FNR in k)' "$KEEP.n" "$LOC" > "$LOC.f"; mv "$LOC.f" "$LOC"
  fi
  n=$(grep -c '' "$LOC" | tr -d ' ')
  [[ "$n" -gt 0 ]] || continue
  HITS=$((HITS + n))
  # locations only: the matched line holds the protected term itself
  while IFS= read -r loc; do
    echo "[leak-scan] FAIL: term #$TERMS (denylist line $LN) -> ${loc:0:240}"
  done < "$LOC"
done < "$DENY"

if [[ $TERMS -eq 0 ]]; then
  echo "[leak-scan] FAIL: the denylist has 0 terms - nothing was checked"
  exit 2
fi

if [[ $BINARY -eq 0 ]]; then
  NBIN=$(grep -r -l -I -e '' -- "$DIR" 2>/dev/null | wc -l | tr -d ' ')
  NALL=$(find "$DIR" -type f | wc -l | tr -d ' ')
  SKIPPED=$((NALL - NBIN))
  [[ $SKIPPED -gt 0 ]] && echo "[leak-scan] INFO: $SKIPPED binary/empty file(s) not scanned - re-run with --binary, and extract compressed files (zip/docx/pdf) first"
fi

if [[ $HITS -gt 0 ]]; then
  echo "[leak-scan] FAIL: $HITS hit(s) for $TERMS term(s) in $DIR"
  exit 1
fi
echo "[leak-scan] OK: 0 hits for $TERMS term(s) in $DIR"
exit 0
