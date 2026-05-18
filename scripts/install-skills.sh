#!/usr/bin/env bash
# install-skills.sh — symlink the six LeanZero Atlassian skills into agent-discovered paths.
#
# Default: install into ~/.claude/skills/ and ~/.cline/skills/ (global, for personal use).
#
# Flags:
#   --project           Install into ./.claude/skills and ./.cline/skills (current dir, for teams)
#   --cline-only        Skip Claude Code locations
#   --claude-only       Skip Cline locations
#   --dry-run           Print what would happen, do nothing
#   -h | --help         Show this help
#
# Idempotent — safe to re-run after pulling repo updates.

set -euo pipefail

SKILLS=(
  atlassian-jira-forge-skill
  atlassian-confluence-forge-skill
  atlassian-organizations-api-skill
  jira-api-skill
  confluence-api-skill
  atlassian-migration-scripts-skill
)

# Resolve the repo root (the directory containing this script's parent)
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Defaults
INSTALL_CLAUDE=1
INSTALL_CLINE=1
DRY_RUN=0
SCOPE="global"

usage() { sed -n '2,15p' "$0"; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project)     SCOPE="project"; shift ;;
    --cline-only)  INSTALL_CLAUDE=0; shift ;;
    --claude-only) INSTALL_CLINE=0;  shift ;;
    --dry-run)     DRY_RUN=1;        shift ;;
    -h|--help)     usage; exit 0 ;;
    *) echo "[install-skills] FAIL: unknown argument: $1" >&2; usage; exit 2 ;;
  esac
done

if [[ "$SCOPE" == "global" ]]; then
  CLAUDE_DIR="$HOME/.claude/skills"
  CLINE_DIR="$HOME/.cline/skills"
else
  CLAUDE_DIR="$REPO_ROOT/.claude/skills"
  CLINE_DIR="$REPO_ROOT/.cline/skills"
fi

run() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "[dry-run] $*"
  else
    eval "$@"
  fi
}

verify_skill() {
  local s="$1"
  if [[ ! -d "$REPO_ROOT/$s" ]]; then
    echo "[install-skills] FAIL: missing skill directory: $REPO_ROOT/$s" >&2
    exit 1
  fi
  if [[ ! -f "$REPO_ROOT/$s/SKILL.md" ]]; then
    echo "[install-skills] FAIL: missing SKILL.md in $s" >&2
    exit 1
  fi
}

install_into() {
  local target_dir="$1"
  run "mkdir -p '$target_dir'"
  for s in "${SKILLS[@]}"; do
    verify_skill "$s"
    local link="$target_dir/$s"
    if [[ -L "$link" ]]; then
      local existing
      existing="$(readlink "$link")"
      if [[ "$existing" == "$REPO_ROOT/$s" ]]; then
        echo "[install-skills] OK:   already linked: $link"
        continue
      fi
      echo "[install-skills] note: replacing stale symlink: $link -> $existing"
      run "rm '$link'"
    elif [[ -e "$link" ]]; then
      echo "[install-skills] FAIL: $link exists and is not a symlink — refusing to overwrite" >&2
      echo "  Move or delete it manually, then re-run." >&2
      exit 1
    fi
    run "ln -s '$REPO_ROOT/$s' '$link'"
    echo "[install-skills] OK:   linked $s -> $link"
  done
}

echo "[install-skills] Repo root: $REPO_ROOT"
echo "[install-skills] Scope: $SCOPE"
[[ "$DRY_RUN" -eq 1 ]] && echo "[install-skills] DRY RUN — no changes will be made"

if [[ "$INSTALL_CLAUDE" -eq 1 ]]; then
  echo "[install-skills] --- Claude Code skills ($CLAUDE_DIR) ---"
  install_into "$CLAUDE_DIR"
fi

if [[ "$INSTALL_CLINE" -eq 1 ]]; then
  echo "[install-skills] --- Cline skills ($CLINE_DIR) ---"
  install_into "$CLINE_DIR"
fi

echo "[install-skills] Done. Restart your AI tool to pick up the new skills."
