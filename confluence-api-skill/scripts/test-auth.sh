#!/bin/bash

# test-auth.sh - Test Confluence Forge app authentication and API access

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "🧪 Testing Confluence Forge Authentication"
echo "==========================================="
echo ""

# Check if forge CLI is installed
if ! command -v forge &> /dev/null; then
  echo -e "${RED}❌ ERROR: 'forge' CLI not found in PATH.${NC}"
  echo "   Install it using: npm install -g @forge/cli"
  exit 1
fi

echo -e "${GREEN}✅ Forge CLI is installed${NC}"

# Check if user is logged in
AUTH_STATUS=$(forge whoami 2>&1)
if [[ "$AUTH_STATUS" == *"not logged in"* ]] || [[ "$AUTH_STATUS" == *"authentication required"* ]]; then
  echo -e "${RED}❌ ERROR: Not logged into Forge.${NC}"
  echo "   Run 'forge login' to authenticate."
  exit 1
fi

echo -e "${GREEN}✅ You are logged in${NC}"
echo ""

# Show current user
echo -e "${BLUE}Current user:${NC}"
forge whoami
echo ""

# Check for manifest.yml
if [ ! -f "manifest.yml" ]; then
  echo -e "${YELLOW}⚠️  No manifest.yml found. This is OK for testing authentication.${NC}"
  echo "   For full API testing, ensure you're in a Forge app directory."
else
  echo -e "${GREEN}✅ Found manifest.yml${NC}"
fi

echo ""
echo -e "${BLUE}Testing Confluence API endpoint...${NC}"

# Get the current site URL from forge context if available
SITE_URL=$(forge list --json 2>/dev/null | head -1 | grep -o '"siteUrl":"[^"]*' | cut -d'"' -f4)

if [ -n "$SITE_URL" ]; then
  echo "Site URL: $SITE_URL"
  
  # Test using forge tunnel context (app token)
  # Note: This requires a running tunnel or deployed app
  echo ""
  echo -e "${YELLOW}To test actual API access:${NC}"
  echo "1. Start tunnel: 'forge tunnel'"
  echo "2. Or deploy first: 'forge deploy && forge install --upgrade'"
  echo ""
  echo "Then use the token from Forge runtime in your code:"
  echo ""
  echo -e "${BLUE}Example JavaScript (in resolver function):${NC}"
  cat << 'EOF'
import api, { route } from '@forge/api';

export const testConnection = async ({ context }) => {
  // Test Confluence API
  const response = await api.asUser().requestConfluence(
    route`/wiki/api/v2/spaces?limit=5`
  );
  
  if (response.ok) {
    const data = await response.json();
    console.log('✅ Successfully connected to Confluence!');
    console.log('Spaces:', JSON.stringify(data.results, null, 2));
    return { success: true, count: data.results?.length || 0 };
  } else {
    return { 
      success: false, 
      status: response.status,
      error: await response.text() 
    };
  }
};
EOF
else
  echo -e "${YELLOW}⚠️  No site URL found. This is expected before deployment.${NC}"
fi

echo ""
echo "==========================================="
echo -e "${GREEN}Authentication test completed!${NC}"
echo ""
echo "Next steps:"
echo "1. Deploy your app: 'forge deploy'"
echo "2. Install on site: 'forge install --upgrade'"
echo "3. Test with tunnel: 'forge tunnel'"
