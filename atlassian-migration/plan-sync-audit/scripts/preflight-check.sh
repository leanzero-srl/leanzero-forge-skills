#!/usr/bin/env bash
# preflight-check.sh — verify the host is ready to run a migration script.
#
# Checks:
#   - Node.js ≥ 20
#   - .env present in the current directory (or accepted via --env-file)
#   - Required env vars set
#   - Cloud base URL reachable (HTTPS handshake succeeds)
#   - DC base URL reachable (if configured)
#
# Output prefix: [preflight-check] OK: / FAIL: — CI-safe, no emoji.

set -uo pipefail

ENV_FILE=".env"
FAILED=0

while [[ $# -gt 0 ]]; do
  case $1 in
    --env-file) ENV_FILE="$2"; shift 2 ;;
    *) echo "[preflight-check] FAIL: unknown arg: $1"; exit 2 ;;
  esac
done

# ── Node version ─────────────────────────────────────────────────────
if ! command -v node >/dev/null 2>&1; then
  echo "[preflight-check] FAIL: node not on PATH"
  FAILED=1
else
  NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
  if [[ "$NODE_MAJOR" -lt 20 ]]; then
    echo "[preflight-check] FAIL: Node ${NODE_MAJOR} found; need ≥ 20"
    FAILED=1
  else
    echo "[preflight-check] OK: Node $(node --version)"
  fi
fi

# ── .env present ─────────────────────────────────────────────────────
if [[ ! -f "$ENV_FILE" ]]; then
  echo "[preflight-check] FAIL: $ENV_FILE not found"
  FAILED=1
else
  echo "[preflight-check] OK: $ENV_FILE present"
  # Load it so we can inspect vars
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

# ── Required vars ────────────────────────────────────────────────────
REQUIRED=(CLOUD_BASE_URL CLOUD_EMAIL CLOUD_API_TOKEN)
for V in "${REQUIRED[@]}"; do
  if [[ -z "${!V:-}" ]]; then
    echo "[preflight-check] FAIL: \$$V is empty"
    FAILED=1
  else
    echo "[preflight-check] OK: \$$V set"
  fi
done

# ── Cloud reachability ───────────────────────────────────────────────
if [[ -n "${CLOUD_BASE_URL:-}" ]]; then
  if curl -fsS -o /dev/null --max-time 10 "$CLOUD_BASE_URL"; then
    echo "[preflight-check] OK: $CLOUD_BASE_URL reachable"
  else
    echo "[preflight-check] FAIL: $CLOUD_BASE_URL unreachable"
    FAILED=1
  fi
fi

# ── DC reachability (optional) ───────────────────────────────────────
if [[ -n "${DC_BASE_URL:-}" ]]; then
  if curl -fsS -o /dev/null --max-time 10 "$DC_BASE_URL"; then
    echo "[preflight-check] OK: $DC_BASE_URL reachable"
  else
    echo "[preflight-check] FAIL: $DC_BASE_URL unreachable"
    FAILED=1
  fi
fi

exit "$FAILED"
