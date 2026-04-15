#!/bin/bash

# test-api-endpoint.sh - Test Confluence REST API endpoints from a Forge app

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "🧪 Testing Confluence REST API Endpoints"
echo "========================================="
echo ""

# Check if forge CLI is installed
if ! command -v forge &> /dev/null; then
  echo -e "${RED}❌ ERROR: 'forge' CLI not found in PATH.${NC}"
  echo "   Install it using: npm install -g @forge/cli"
  exit 1
fi

# Check if we're in a Forge app directory
if [ ! -f "manifest.yml" ]; then
  echo -e "${RED}❌ ERROR: No manifest.yml found in current directory.${NC}"
  echo "   This script must be run from within a Forge app project."
  exit 1
fi

echo -e "${GREEN}✅ Found Forge app (manifest.yml detected)${NC}"

# Check if tunnel is running or app is deployed
TUNNEL_STATUS=$(forge list --json 2>/dev/null | grep -o '"siteUrl":"[^"]*' || true)
if [ -z "$TUNNEL_STATUS" ]; then
  echo -e "${YELLOW}⚠️  No active deployment or tunnel detected.${NC}"
  echo ""
  echo "   To test API endpoints, you need to:"
  echo "   1. Deploy and install: 'forge deploy && forge install --upgrade'"
  echo "   2. Or use tunnel: 'forge tunnel'"
  echo ""
  
  read -p "Do you want to deploy now? (y/N) " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Deploying..."
    forge deploy
    echo "Installing..."
    forge install --upgrade
  else
    exit 0
  fi
fi

echo ""
echo -e "${BLUE}Available API Endpoint Tests:${NC}"
echo ""
echo "1. List Spaces"
echo "2. Get Pages in a Space"
echo "3. Create a Test Page"
echo "4. Search Content (CQL)"
echo "5. Get User Info"
echo ""
echo "To run these tests, use the resolver pattern in your code:"
echo ""

cat << 'EOF'
# Example: Resolver function to test API endpoints
import api, { route } from '@forge/api';

export const testConfluenceAPI = async ({ context }) => {
  try {
    // Test 1: List spaces
    console.log('Testing: GET /wiki/api/v2/spaces');
    let spacesResponse = await api.asUser().requestConfluence(
      route`/wiki/api/v2/spaces?limit=5`
    );
    
    if (spacesResponse.ok) {
      const spaces = await spacesResponse.json();
      console.log('✅ Spaces retrieved:', spaces.results?.length || 0);
    } else {
      console.error('❌ Spaces request failed:', spacesResponse.status);
    }
    
    // Test 2: Get pages (requires space-id)
    console.log('Testing: GET /wiki/api/v2/pages');
    const testSpaceId = context.spaceId; // From resolver payload
    if (testSpaceId) {
      let pagesResponse = await api.asUser().requestConfluence(
        route`/wiki/api/v2/pages?space-id=${testSpaceId}&limit=5`
      );
      
      if (pagesResponse.ok) {
        const pages = await pagesResponse.json();
        console.log('✅ Pages retrieved:', pages.results?.length || 0);
      }
    }
    
    return { success: true };
  } catch (error) {
    console.error('API Test Error:', error.message);
    return { success: false, error: error.message };
  }
};
EOF

echo ""
echo -e "${BLUE}Running quick manifest validation...${NC}"
forge lint 2>&1 | head -5 || echo "Manifest validation check complete"

echo ""
echo "========================================="
echo -e "${GREEN}API Endpoint Testing Guide Complete!${NC}"
