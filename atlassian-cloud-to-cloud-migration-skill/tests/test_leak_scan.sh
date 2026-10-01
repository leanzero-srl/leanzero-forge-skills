#!/usr/bin/env bash
# test_leak_scan.sh — offline regression tests for scripts/leak-scan.sh (the false-clean cases a review found).
#   bash tests/test_leak_scan.sh [path/to/leak-scan.sh]      exit 0 = all pass
set -uo pipefail
SCAN="${1:-$(cd "$(dirname "$0")/.." && pwd)/scripts/leak-scan.sh}"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
mkdir -p "$T/d/sub"
printf 'nothing here\nwe met Zorblat Quenx on monday\n' > "$T/d/a.txt"
printf 'url: https://source.atlassian.net/x and Zorblat again\n' > "$T/d/sub/b.md"
printf 'clean file\n' > "$T/d/c.txt"
PASS=0; FAILN=0
check() {  # name expected_exit cmd...
  local name="$1" want="$2"; shift 2
  out="$("$@" 2>&1)"; rc=$?
  if [[ $rc -eq $want ]]; then PASS=$((PASS+1)); else FAILN=$((FAILN+1)); echo "FAIL $name: exit $rc, wanted $want"; echo "$out" | sed 's/^/    /'; fi
}
nolit() {  # name term cmd... : output must not contain the term
  local name="$1" term="$2"; shift 2
  out="$("$@" 2>&1)"
  if grep -qiF -- "$term" <<<"$out"; then FAILN=$((FAILN+1)); echo "FAIL $name: output echoes the protected term"; else PASS=$((PASS+1)); fi
}

printf 'Zorblat\n' > "$T/deny1"
check "hit -> exit 1"                1 bash "$SCAN" "$T/d" "$T/deny1"
nolit "never echoes the term"        Zorblat bash "$SCAN" "$T/d" "$T/deny1"
printf 'Nonexistentword\n' > "$T/deny2"
check "clean -> exit 0"              0 bash "$SCAN" "$T/d" "$T/deny2"

printf '\n# c\n(source|target)\\.atlassian\\.net\n\n' > "$T/allow_blank"
check "blank allow line must not hide hits" 1 bash "$SCAN" "$T/d" "$T/deny1" --allow "$T/allow_blank"
out="$(bash "$SCAN" "$T/d" "$T/deny1" --allow "$T/allow_blank")"
n=$(grep -c 'term #' <<<"$out")
[[ $n -eq 1 ]] && PASS=$((PASS+1)) || { FAILN=$((FAILN+1)); echo "FAIL allow applies to the matched line only: $n hits (want 1: a.txt; b.md allowed)"; }

printf 're:Zorb[lat\n' > "$T/deny_badre"
check "invalid deny regex -> exit 2" 2 bash "$SCAN" "$T/d" "$T/deny_badre"
printf 'foo(\n' > "$T/allow_badre"
check "invalid allow regex -> exit 2" 2 bash "$SCAN" "$T/d" "$T/deny1" --allow "$T/allow_badre"
printf '# only comments\n\n   \n' > "$T/deny_empty"
check "0 terms -> exit 2"            2 bash "$SCAN" "$T/d" "$T/deny_empty"
check "missing dir -> exit 2"        2 bash "$SCAN" "$T/nope" "$T/deny1"
cp "$T/deny1" "$T/d/deny-inside"
check "denylist inside dir -> exit 2" 2 bash "$SCAN" "$T/d" "$T/d/deny-inside"
rm "$T/d/deny-inside"
printf 'quenx\n' > "$T/deny_case"
check "case-insensitive default"     1 bash "$SCAN" "$T/d" "$T/deny_case"
check "--case respects case"         0 bash "$SCAN" "$T/d" "$T/deny_case" --case
printf 'Zorbla\n' > "$T/deny_part"
check "--words: partial word is not a hit" 0 bash "$SCAN" "$T/d" "$T/deny_part" --words
printf 'path with : colon Zorblat\n' > "$T/d/c.txt"
out="$(bash "$SCAN" "$T/d" "$T/deny1")"
grep -q 'c.txt:1$' <<<"$out" && PASS=$((PASS+1)) || { FAILN=$((FAILN+1)); echo "FAIL location format: $out"; }

echo "leak-scan tests: $PASS passed, $FAILN failed"
[[ $FAILN -eq 0 ]]
