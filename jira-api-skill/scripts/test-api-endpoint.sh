#!/bin/bash

# test-api-endpoint.sh - Test Jira REST API endpoints from a Forge app

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "🧪 Testing Jira REST API Endpoints"
echo "==================================="
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
echo "1. List Projects"
echo "2. Get Issue by Key"
echo "3. Search Issues (JQL)"
echo "4. Create Issue"
echo "5. Update Issue Fields"
echo "6. Add Worklog"
echo "7. Get Users"
echo "8. Get Workflow Transitions"
echo ""
echo "To run these tests, use the resolver pattern in your code:"
echo ""

cat << 'EOF'
# Example: Resolver function to test API endpoints
import api, { route } from '@forge/api';

export const testJiraAPI = async ({ context }) => {
  try {
    // Test 1: List projects
    console.log('Testing: GET /rest/api/3/project');
    let projectsResponse = await api.asUser().requestJira(
      route`/rest/api/3/project?maxResults=5`
    );
    
    if (projectsResponse.ok) {
      const projects = await projectsResponse.json();
      console.log('✅ Projects retrieved:', projects.length || 0);
      console.log('Project keys:', projects.map(p => p.key).join(', '));
    }
    
    // Test 2: Search issues with JQL
    console.log('Testing: GET /rest/api/3/search (JQL)');
    const jql = encodeURIComponent('project = TEST ORDER BY created DESC');
    let searchResponse = await api.asUser().requestJira(
      route`/rest/api/3/search?jql=${jql}&maxResults=5`
    );
    
    if (searchResponse.ok) {
      const results = await searchResponse.json();
      console.log('✅ Search returned:', results.issues?.length || 0, 'issues');
    }
    
    // Test 3: Get issue details
    if (results?.issues?.[0]?.key) {
      const issueKey = results.issues[0].key;
      console.log(`Testing: GET /rest/api/3/issue/${issueKey}`);
      let issueResponse = await api.asUser().requestJira(
        route`/rest/api/3/issue/${issueKey}?expand=changelog`
      );
      
      if (issueResponse.ok) {
        const issue = await issueResponse.json();
        console.log('✅ Issue retrieved:', issue.key);
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
echo "==================================="
echo -e "${GREEN}API Endpoint Testing Guide Complete!${NC}"
