#!/usr/bin/env bash
#
# Copyright (C) 2026 LeanZero
# SPDX-License-Identifier: Apache-2.0
#
# Refresh the official Atlassian OpenAPI specs this repo carries.
#
# The specs are the AUTHORITY for every endpoint table in these skills (the prose is
# checked against them, never the other way round), and CogniRunner bakes its REST
# operation catalogue from them. So they come from ONE place: Atlassian's own
# developer-docs static host, dac-static.atlassian.com. The URL list below is the whole
# allow-list; there is no "fetch this URL" argument, because a spec from anywhere else is
# a spec nobody can vouch for.
#
# What it does, per spec:
#   1. downloads it over HTTPS with redirects REFUSED (a redirect off the official host
#      would silently change where the authority came from);
#   2. refuses anything that is not a JSON OpenAPI 3.x document with a non-empty `paths`;
#   3. writes the upstream bytes VERBATIM (no reformatting), so the sha-256 recorded in
#      OPENAPI-SPECS.md is the sha-256 of what Atlassian served, and a consumer can pin it;
#   4. only then replaces the file in the repo (temp file + mv), so a failed run never
#      leaves half a spec behind.
# Nothing is written if ANY spec fails validation: a partial refresh is a corpus where
# the table in OPENAPI-SPECS.md describes files that are not there.
#
# Usage:
#   scripts/refresh-specs.sh             # refresh every spec + OPENAPI-SPECS.md
#   scripts/refresh-specs.sh --dry-run   # download + validate, write nothing
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOST="https://dac-static.atlassian.com/cloud"

DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    *) echo "refresh-specs: unknown flag $arg" >&2; exit 2 ;;
  esac
done

# "<file in this repo>|<path under $HOST>". The three original file names are kept as
# they were (openapi-jira-cloud.json etc.) so nothing that names them breaks.
SPECS=(
  "openapi-jira-cloud.json|jira/platform/swagger-v3.v3.json"
  "openapi-jira-software.json|jira/software/swagger.v3.json"
  "openapi-jira-service-desk.json|jira/service-desk/swagger.v3.json"
  "openapi-assets-cloud.json|assets/swagger.v3.json"
  "openapi-cloud-conflue.json|confluence/openapi-v2.v3.json"
  "openapi-confluence-v1.json|confluence/swagger.v3.json"
  "openapi-admin-organization.json|admin/organization/swagger.v3.json"
  "openapi-admin-api-access.json|admin/api-access/swagger.v3.json"
  "openapi-admin-control.json|admin/control/swagger.v3.json"
  "openapi-admin-user-management.json|admin/user-management/swagger.v3.json"
  "openapi-automation.json|automation/swagger.v3.json"
)

command -v curl >/dev/null || { echo "refresh-specs: curl is required" >&2; exit 2; }
command -v python3 >/dev/null || { echo "refresh-specs: python3 is required (JSON validation)" >&2; exit 2; }

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

sha256_of() { shasum -a 256 "$1" | awk '{print $1}'; }

# Prints "<openapi version>\t<title>\t<info.version>\t<operation count>" or exits non-zero.
describe() {
  python3 - "$1" <<'PY'
import json, sys
try:
    with open(sys.argv[1], "rb") as fh:
        doc = json.load(fh)
except Exception as exc:  # not JSON at all (an HTML error page, a truncated body)
    sys.exit(f"not JSON: {exc}")
ver = str(doc.get("openapi", ""))
if not ver.startswith("3."):
    sys.exit(f"not an OpenAPI 3.x document (openapi={ver!r})")
paths = doc.get("paths")
if not isinstance(paths, dict) or not paths:
    sys.exit("no paths")
methods = {"get", "put", "post", "delete", "patch", "head", "options"}
ops = sum(1 for item in paths.values() if isinstance(item, dict) for m in item if m in methods)
if ops == 0:
    sys.exit("no operations")
info = doc.get("info") or {}
title = str(info.get("title", "")).replace("\t", " ").replace("|", "/")
print(f"{ver}\t{title}\t{info.get('version', '')}\t{ops}")
PY
}

fetched_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
rows=()
failed=0
for entry in "${SPECS[@]}"; do
  file="${entry%%|*}"
  rel="${entry#*|}"
  url="$HOST/$rel"
  tmp="$STAGE/$file"
  code="$(curl -sS --proto '=https' --max-redirs 0 -o "$tmp" -w '%{http_code}' "$url" || echo "000")"
  if [ "$code" != "200" ]; then
    echo "FAIL     $file  <- $url  (HTTP $code)"
    failed=$((failed + 1)); continue
  fi
  if ! desc="$(describe "$tmp" 2>&1)"; then
    echo "FAIL     $file  <- $url  ($desc)"
    failed=$((failed + 1)); continue
  fi
  IFS=$'\t' read -r oas title version ops <<< "$desc"
  sum="$(sha256_of "$tmp")"
  prev="-"
  [ -f "$REPO_ROOT/$file" ] && prev="$(sha256_of "$REPO_ROOT/$file")"
  state="changed"; [ "$prev" = "$sum" ] && state="same"; [ "$prev" = "-" ] && state="new"
  printf '%-8s %-36s %4s ops  %s\n' "$state" "$file" "$ops" "$title"
  rows+=("| \`$file\` | $title | $version | $ops | $url | \`${sum:0:16}\` |")
done

if [ "$failed" -ne 0 ]; then
  echo
  echo "refresh-specs: $failed spec(s) failed. NOTHING was written."
  exit 1
fi

if [ "$DRY_RUN" -eq 1 ]; then
  echo
  echo "refresh-specs: dry run, ${#SPECS[@]} specs valid, nothing written."
  exit 0
fi

for entry in "${SPECS[@]}"; do
  file="${entry%%|*}"
  mv "$STAGE/$file" "$REPO_ROOT/$file"
done

{
  echo "<!-- GENERATED by scripts/refresh-specs.sh. Re-run it rather than editing. -->"
  echo
  echo "# Official OpenAPI specs"
  echo
  echo "Fetched $fetched_at from Atlassian's developer-docs host (dac-static.atlassian.com),"
  echo "stored byte for byte as served. The sha-256 prefix below is of those bytes, so a"
  echo "consumer that pins it can tell a refreshed spec from an edited one."
  echo
  echo "| file | title | version | operations | source | sha-256 (16) |"
  echo "|---|---|---|---:|---|---|"
  printf '%s\n' "${rows[@]}"
} > "$REPO_ROOT/OPENAPI-SPECS.md"

echo
echo "refresh-specs: ${#SPECS[@]} specs written, OPENAPI-SPECS.md updated."
