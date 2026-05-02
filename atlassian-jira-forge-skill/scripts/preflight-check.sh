#!/usr/bin/env bash
# preflight-check.sh — checks Forge CLI is installed, you're logged in,
# manifest.yml exists, and `forge lint` passes. CI-safe.

set -uo pipefail
# NOTE: we deliberately don't `set -e` because we want to collect all failures
# before exiting. Each check sets FAILED=1 on its own.

echo "[preflight] Running Forge environment check"
echo "[preflight] -------------------------------"

FAILED=0

# 1. forge CLI installed
if ! command -v forge >/dev/null 2>&1; then
  echo "[preflight] FAIL: 'forge' CLI not found in PATH"
  echo "  Hint: npm install -g @forge/cli"
  FAILED=1
else
  echo "[preflight] OK:   forge CLI is installed"
fi

# 2. Logged in (only attempt if CLI exists)
if [[ "$FAILED" -eq 0 ]]; then
  AUTH_CHECK="$(forge list 2>&1 || true)"
  if [[ "$AUTH_CHECK" == *"not logged in"* ]] || [[ "$AUTH_CHECK" == *"authentication required"* ]]; then
    echo "[preflight] FAIL: not logged into Forge"
    echo "  Hint: forge login"
    FAILED=1
  else
    echo "[preflight] OK:   forge authentication present"
  fi
fi

# 3. manifest.yml present
if [[ ! -f "manifest.yml" ]]; then
  echo "[preflight] FAIL: manifest.yml not found in current directory"
  FAILED=1
else
  echo "[preflight] OK:   manifest.yml found"

  # 4. forge lint passes
  echo "[preflight] Validating manifest with 'forge lint'"
  if LINT_OUTPUT="$(forge lint 2>&1)"; then
    echo "[preflight] OK:   forge lint passed"
  else
    echo "[preflight] FAIL: forge lint reported errors"
    echo "  ----"
    echo "$LINT_OUTPUT" | grep -E "error|warning" || echo "  (no parsed error/warning lines; full output above)"
    echo "  ----"
    FAILED=1
  fi
fi

echo "[preflight] -------------------------------"
if [[ "$FAILED" -eq 0 ]]; then
  echo "[preflight] OK:   pre-flight check passed"
  exit 0
else
  echo "[preflight] FAIL: pre-flight check failed — fix the errors above"
  exit 1
fi
