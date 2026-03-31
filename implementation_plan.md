# Implementation Plan

[Overview]
This implementation plan outlines the addition of valuable code snippets and reference materials related to recently resolved Forge Jira topics, REST API endpoints, and best practices from the Atlassian community. The goal is to expand the skill's knowledge base with practical examples and up-to-date information that developers frequently seek.

[Types]  
The type system will remain unchanged as this update focuses on adding reference documentation rather than modifying core logic structures.

Detailed additions:

1. API Endpoint Types
   - Jira REST API v2 endpoints (new)
   - Confluence REST API v2 endpoints (enhancement)
   - Bitbucket REST API endpoints (enhancement)

2. Module Type Definitions
   - New module types for enhanced functionality:
     * Scheduled triggers
     * Automation actions
     * Dashboard widgets (EAP)
     * Confluence content properties
     * Bitbucket merge checks

[Files]
Detailed breakdown of new files and modifications:

New Files to be Created:
1. forge-skill/api-endpoints/jira-rest-api-v2.md - Comprehensive list of Jira REST API v2 endpoints
2. forge-skill/api-endpoints/confluence-rest-api-v2.md - Confluence REST API v2 endpoints reference
3. forge-skill/snippets/scheduled-triggers.md - Code examples for scheduled triggers
4. forge-skill/snippets/automation-actions.md - Automation action implementation patterns
5. forge-skill/snippets/dashboard-widgets.md - Dashboard widget examples (EAP)
6. forge-skill/snippets/bitbucket-merge-checks.md - Merge check configuration and examples
7. forge-skill/events-payloads/jira-event-filters.md - Event filtering with Jira expressions
8. forge-skill/snippets/confluence-content-properties.md - Content property handling

Existing Files to be Modified:
1. forge-skill/README.md - Add new sections for snippets directory and API references
2. forge-skill/api-endpoints/README.md - Link to v2 API documentation
3. forge-skill/events-payloads/README.md - Include event filtering information

[Functions]
Function examples to be added:

New Functions:
1. Scheduled Trigger Function
   - File: forge-skill/snippets/scheduled-triggers.md
   - Signature: handler(event, context)
   - Purpose: Execute logic at scheduled intervals (fiveMinute, hour, day, week)

2. Automation Action Handler
   - File: forge-skill/snippets/automation-actions.md
   - Signature: actionHandler(payload, context)
   - Purpose: Handle custom automation actions in Jira rules

3. Merge Check Validator
   - File: forge-skill/snippets/bitbucket-merge-checks.md
   - Signature: validate(mergeProperties, context)
   - Purpose: Validate pull requests before merging

4. Dashboard Widget Resolver
   - File: forge-skill/snippets/dashboard-widgets.md
   - Signature: resolver(context)
   - Purpose: Provide dynamic content for dashboard widgets

Modified Functions:
1. Event Filter Expression Builder
   - Current file: forge-skill/events-payloads/
   - Required changes: Add examples of Jira expression syntax for filtering

[Classes]
No new classes will be added as Forge primarily uses function modules.

Key Module Types to Document:
1. scheduledTrigger - For time-based execution
2. action - For custom automation
3. dashboard-background-script - For EAP dashboard widgets
4. macro - For Confluence macros
5. confluence:contentAction - For Confluence page actions

[Dependencies]
No external dependencies are required for this update.

Current dependencies in project:
- @atlaskit/css-reset (Confluence styling)
- React (UI rendering)

[Testing]
Testing approach:

1. Validate manifest.yml syntax using `forge lint`
2. Test scheduled triggers with `forge deploy` and monitor execution
3. Verify automation actions appear in Jira rule builder
4. Test dashboard widgets installation via `forge install`

Validation strategies:
- Use forge validate-manifest to check configuration
- Review web trigger logs for error handling
- Test filter expressions against sample payloads

[Implementation Order]
Numbered steps showing the logical order of changes:

1. Create API endpoint documentation files (v2 references)
   a. jira-rest-api-v2.md
   b. confluence-rest-api-v2.md
   
2. Add event filtering documentation
   a. Update events-payloads/README.md
   b. Create jira-event-filters.md with examples

3. Create code snippet files for common patterns
   a. scheduled-triggers.md
   b. automation-actions.md
   c. bitbucket-merge-checks.md
   d. dashboard-widgets.md (if available)

4. Add content property documentation
   a. confluence-content-properties.md
   b. Space and issue property handling

5. Update main README files
   a. Add navigation to new snippet categories
   b. Include links to API v2 references