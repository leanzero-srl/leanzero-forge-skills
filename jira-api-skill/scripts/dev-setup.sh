#!/usr/bin/env bash
# dev-setup.sh — starts `forge tunnel` for the bundled Forge templates.
# Usage:  ./dev-setup.sh                  # default (development)
#         ./dev-setup.sh -e staging       # custom environment

set -euo pipefail

ENV_ARG=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    -e|--environment)
      [[ -z "${2:-}" ]] && { echo "[dev-setup] FAIL: -e requires an environment name" >&2; exit 2; }
      ENV_ARG="$2"; shift 2 ;;
    -h|--help) sed -n '2,5p' "$0"; exit 0 ;;
    *) echo "[dev-setup] FAIL: unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [[ -n "$ENV_ARG" ]]; then
  echo "[dev-setup] Starting tunnel for environment: $ENV_ARG"
  exec forge tunnel -e "$ENV_ARG"
else
  echo "[dev-setup] Starting tunnel for default (development) environment"
  exec forge tunnel
fi
