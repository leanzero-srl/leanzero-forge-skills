#!/usr/bin/env bash
# deploy-and-install.sh — runs `forge deploy` then `forge install --upgrade`.
# Stops on first error; safe for CI (no emoji, no color escapes).

set -euo pipefail

echo "[deploy-and-install] Step 1/2: forge deploy"
if ! forge deploy; then
  echo "[deploy-and-install] FAIL: forge deploy exited non-zero. Aborting." >&2
  exit 1
fi
echo "[deploy-and-install] OK: deploy succeeded"

echo "[deploy-and-install] Step 2/2: forge install --upgrade"
if ! forge install --upgrade; then
  echo "[deploy-and-install] FAIL: forge install --upgrade exited non-zero." >&2
  echo "  Hint: new scopes require user approval. Re-run interactively if scopes changed." >&2
  exit 1
fi
echo "[deploy-and-install] OK: install/upgrade succeeded"
