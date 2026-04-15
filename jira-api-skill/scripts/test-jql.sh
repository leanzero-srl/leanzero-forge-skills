#!/bin/bash

# test-jql.sh - Test Jira Query Language (JQL) queries from a Forge app

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo "🧪 Testing Jira Query Language (JQL)"
echo "======================================"
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
  echo "   To test JQL queries, you need to:"
  echo "   1. Deploy and install: 'forge deploy && forge install --upgrade'"
  echo "   2. Or use tunnel: 'forge tunnel'"
  exit 0
fi

echo -e "${GREEN}✅ Active deployment detected${NC}"
echo ""

# JQL Query Examples
echo -e "${BLUE}Common JQL Query Patterns:${NC}"
echo ""

cat << 'EOF'
┌─────────────────────────────────────────────────────────────┐
│                      Basic Queries                          │
└─────────────────────────────────────────────────────────────┘

# Get all issues in a project
project = "PROJ"

# Get open issues assigned to me
assignee = currentUser() AND status = Open

# Get issues created today
created >= startOfDay()

# Get high priority issues
priority = High AND status != Done

┌─────────────────────────────────────────────────────────────┐
│                    Workflow Status Queries                  │
└─────────────────────────────────────────────────────────────┘

# All issues in a workflow step
status = "In Progress"

# Issues needing review (custom workflow)
status = "Ready for Review"

# Open issues across multiple statuses
status in (Open, "In Progress", Reopened)

┌─────────────────────────────────────────────────────────────┐
│                      Date Range Queries                     │
└─────────────────────────────────────────────────────────────┘

# Issues created this week
created >= startOfWeek()

# Issues created last month
created >= startOfMonth(-1) AND created < startOfMonth()

# Issues due this month
due <= endOfMonth() AND due >= startOfDay()

┌─────────────────────────────────────────────────────────────┐
│                     Text Search Queries                     │
└─────────────────────────────────────────────────────────────┘

# Search in summary and description
text ~ "bug fix"

# Exact phrase match
summary ~ '"login error"'

# Search with wildcards
description ~ "error*"

┌─────────────────────────────────────────────────────────────┐
│                   Complex Combined Queries                  │
└─────────────────────────────────────────────────────────────┘

# High priority bugs assigned to team this week
project = PROJ 
AND issuetype = Bug 
AND priority = High 
AND assignee in membersOf(dev-team) 
AND created >= startOfWeek()

# Issues not updated in 7 days (stale issues)
status != Done AND updated < -7d

# Issues with attachments
attachments is not EMPTY

EOF

echo ""
echo -e "${BLUE}To use these queries in your Forge app:${NC}"
echo ""

cat << 'EOF'
import api, { route } from '@forge/api';

export const runJqlQuery = async ({ context }) => {
  // Example: Get open issues assigned to current user
  const jql = encodeURIComponent('assignee = currentUser() AND status = Open');
  
  try {
    console.log(`Running JQL: ${decodeURIComponent(jql)}`);
    
    const response = await api.asUser().requestJira(
      route`/rest/api/3/search?jql=${jql}&maxResults=50&fields=key,summary,status,priority`
    );
    
    if (response.ok) {
      const results = await response.json();
      console.log(`Found ${results.total} issues`);
      
      // Process results
      results.issues.forEach(issue => {
        console.log(`${issue.key}: ${issue.fields.summary}`);
      });
      
      return { 
        success: true, 
        count: results.total,
        issues: results.issues.map(i => ({
          key: i.key,
          summary: i.fields.summary,
          status: i.fields.status.name
        }))
      };
    } else {
      const error = await response.text();
      console.error('JQL Search failed:', response.status, error);
      return { success: false, error };
    }
  } catch (error) {
    console.error('Error running JQL:', error.message);
    return { success: false, error: error.message };
  }
};

// Example: Get issues by status
export const getIssuesByStatus = async (status, context) => {
  const jql = encodeURIComponent(`status = "${status}"`);
  
  const response = await api.asUser().requestJira(
    route`/rest/api/3/search?jql=${jql}&maxResults=10`
  );
  
  if (response.ok) {
    return await response.json();
  }
  return null;
};

// Example: Search with pagination
export const searchWithPagination = async (jqlQuery, startAt = 0, maxResults = 50) => {
  const encodedJql = encodeURIComponent(jqlQuery);
  
  const response = await api.asUser().requestJira(
    route`/rest/api/3/search?jql=${encodedJql}&startAt=${startAt}&maxResults=${maxResults}`
  );
  
  if (response.ok) {
    return await response.json();
  }
  return null;
};
EOF

echo ""
echo -e "${BLUE}Running quick manifest validation...${NC}"
forge lint 2>&1 | head -5 || echo "Manifest validation check complete"

echo ""
echo "======================================"
echo -e "${GREEN}JQL Testing Guide Complete!${NC}"
