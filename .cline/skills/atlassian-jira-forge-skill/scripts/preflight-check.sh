#!/bin/bash

# preflight-check.sh - A smart validator for the Forge development environment.

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🔍 Running Forge Pre-flight Check..."
echo "--------------------------------------------------"

FAILED=0

# 1. Check if forge CLI is installed
if ! command -v forge &> /dev/null; then
  echo -e "${RED}❌ ERROR: 'forge' CLI not found in PATH.${NC}"
  echo "   HINT: Install it using 'npm install -g @forge/cli'"
  FAILED=1
else
  echo -e "${GREEN}✅ Forge CLI is installed.${NC}"
fi

# 2. Check if user is logged in
if [ $? -eq 0 ]; then
  echo "Checking authentication status..."
  # We attempt to run a command that requires auth, like 'forge list'
  # Redirecting stderr to stdout to capture messages
  AUTH_CHECK=$(forge list 2>&1)
  if [[ "$AUTH_CHECK" == *"not logged in"* ]] || [[ "$AUTH_CHECK" == *"authentication required"* ]]; then
    echo -e "${RED}❌ ERROR: Not logged into Forge.${NC}"
    echo "   HINT: Run 'forge login' to authenticate."
    FAILED=1
  else
    echo -e "${GREEN}✅ Authentication verified.${NC}"
  fi
fi

# 3. Check for manifest.yml
if [ ! -f "manifest.yml" ]; then
  echo -e "${RED}❌ ERROR: 'manifest.yml' not found in current directory.${NC}"
  FAILED=1
else
  echo -e "${GREEN}✅ 'manifest.yml' found.${NC}"
  
  # 4. Run forge lint
  echo "Validating manifest with 'forge lint'..."
  LINT_OUTPUT=$(forge lint 2>&1)
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Manifest is valid.${NC}"
  else
    echo -e "${RED}❌ ERROR: Manifest validation failed.${NC}"
    echo "--------------------------------------------------"
    echo "$LINT_OUTPUT" | grep -E "error|warning" || echo "Lint failed with unknown error."
    echo "--------------------------------------------------"
    FAILED=1
  fi
fi

echo "--------------------------------------------------"
if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}🚀 PRE-FLIGHT CHECK PASSED! You are ready to develop.${NC}"
  exit 0
else
  echo -e "${RED}🛑 PRE-FLIGHT CHECK FAILED. Please fix the errors above before proceeding.${NC}"
  exit 1
fi