# Leverage Cline Skills to Build Jira Forge Apps Without Memorizing a Single API Endpoint

Mihai Perdum
Author
12 min read
March 31, 2026

You've just added a `jira:workflowValidator` module to your Forge app's manifest.yml. Now what? Do you remember the exact structure of the response object? What about the required permissions scope? How do you call the Jira REST API from inside a validator function? And for that matter, how do validators differ from conditions and post functions?

For many developers, building Jira Forge apps means either:
1. Keeping multiple Atlassian documentation tabs open and constantly cross-referencing them
2. Spending hours debugging because a minor detail (a missing scope, an incorrect field name) was overlooked
3. Copy-pasting code from old projects without fully understanding why it works

The skill approach changes all this.

## What Is a Cline Skill?

Cline is an AI coding assistant designed for developers who want to write production-ready code with minimal setup. A "skill" in Cline is a curated collection of documentation, examples, and reference material that the AI uses as context when working on specific types of tasks.

Think of it like having a senior developer's cheat sheet embedded directly into your AI assistant. When you tell Cline to "create a Jira workflow validator that validates description content quality using AI," it doesn't guess — it follows the exact patterns defined in the `atlassian-jira-forge-skill`.

## The Atlassian Forge Jira Skill

This skill is not a framework, not a library, and not yet another boilerplate. It's documentation-as-context. It lives inside your `.cline/skills/` directory and automatically activates whenever you're working on a Forge project.

The skill doesn't try to do everything. Instead, it focuses on what developers actually need when building JiraForge apps:
- The exact structure of workflow validator, condition, and post function modules
- How to handle configuration persistence using the Jira bridge API
- Complete reference for all available Jira REST v3 endpoints
- Examples of bulk operations, search with JQL, worklog management
- Event payloads for triggers and listeners

Let's walk through what this means in practice.

## The Three Pillars of Workflow Automation

Forge's workflow modules are its most powerful feature — they let you extend Jira's native behavior without touching server-side Java code. But there are three distinct module types, each solving a different problem. The skill makes it obvious when to use which one.

### Validators: Gatekeepers at the Transition Door

A validator decides whether a workflow transition can complete. It runs after the user clicks "Resolve" or "Close" but before Jira actually changes the issue status.

The key insight: **Validators can block transitions**.

```yaml
modules:
  jira:workflowValidator:
    - key: content-quality-validator
      name: Content Quality Validator
      description: Validates issue fields meet minimum quality requirements
      
      function: validateContent  # Points to your function handler
      errorMessage: "Description must contain at least 20 characters"
      
      create:
        resource: validator-config-ui
```

The skill provides the exact response format:

```javascript
// Success - allow transition
return { result: true };

// Failure - block transition with custom error message
return { 
  result: false, 
  errorMessage: "Description must contain at least 20 characters" 
};
```

It also documents that you can use Jira expressions for simple cases:

```yaml
# Instead of a function, use a single expression
modules:
  jira:workflowValidator:
    - key: summary-required-validator
      name: Summary Required Validator
      expression: issue.summary != null && issue.summary.length > 5
      errorMessage: "Summary must be at least 5 characters"
```

### Conditions: Invisible Gatekeepers That Hide Transitions

A condition decides whether a transition is visible in the workflow UI. It runs before the transition screen renders — if false, users never see the option to click.

The key insight: **Conditions hide transitions; validators block them after viewing**.

```yaml
modules:
  jira:workflowCondition:
    - key: release-manager-only-condition
      name: Release Manager Only Condition
      description: Only show release transition for users in release-managers group
      
      function: checkReleaseManager
      expression: user.inGroup('release-managers')
```

The skill clarifies the difference:

| Aspect | Condition | Validator |
|--------|-----------|-----------|
| **When it runs** | Before transition screen renders | After user submits transition |
| **Purpose** | Hide/show transitions in UI | Validate data before completion |
| **Failure behavior** | Transition hidden from user | Transition blocked, error shown |

### Post Functions: The After-Transition Workhorse

A post function executes after a workflow transition completes successfully. This is where you do the heavy lifting — create related issues, update fields, call external APIs.

The key insight: **Post functions run after completion and typically don't block** (they log errors but continue).

```yaml
modules:
  jira:workflowPostFunction:
    - key: create-follow-up-issue
      name: Create Follow-up Issue
      description: Automatically creates a follow-up task in theOps project
      
      function: createFollowUp
```

The skill provides the complete payload structure, including the changelog:

```javascript
{
  issue: { ... },
  transition: {
    id: "11",
    name: "In Progress",
    executionId: "6540951a-7c88-4620-835b-61aab8bbb13e" // New in v3 API
  },
  changelog: [
    {
      field: "status",
      from: "To Do (1)",
      to: "In Progress (2)"
    }
  ],
  configuration: { ... }
}
```

And the error handling pattern:

```javascript
return { 
  result: false,
  errorMessage: "External API call failed - continuing anyway"
};
// Post function failures typically log errors but don't roll back transitions
```

## API Access Made Simple

Forge apps can interact with multiple Atlassian products and external services. The skill provides a single reference for all of them.

### Jira REST API v3 (Comprehensive)

The `jira-rest-api.md` documentation covers every endpoint you'll ever need:

**Issue Operations**
```javascript
// Create an issue
await api.asApp().requestJira('/rest/api/3/issue', {
  method: 'POST',
  body: JSON.stringify({
    fields: {
      project: { key: 'PROJ' },
      summary: 'New issue from Forge app',
      issuetype: { id: '10000' }
    }
  })
});

// Search with JQL
await api.asApp().requestJira('/rest/api/3/search', {
  method: 'POST',
  body: JSON.stringify({
    jql: 'assignee = currentUser() AND status != Done',
    fields: ['summary', 'status', 'priority'],
    maxResults: 50
  })
});

// Bulk update (up to 1000 issues)
await api.asApp().requestJira('/rest/api/3/bulk/issues/fields', {
  method: 'PUT',
  body: JSON.stringify({
    update: { fields: { priority: { id: '2' } } },
    issues: ['PROJ-1', 'PROJ-2', ...] // Array of issue keys
  })
});
```

**Worklog Operations**
```javascript
// Add worklog to an issue
await api.asApp().requestJira(
  `/rest/api/3/issue/${issueKey}/worklog`,
  {
    method: 'POST',
    body: JSON.stringify({
      timeSpent: '2h',
      comment: 'Working on this issue',
      started: new Date().toISOString()
    })
  }
);

// Update worklog
await api.asApp().requestJira(
  `/rest/api/3/issue/${issueKey}/worklog/${worklogId}`,
  {
    method: 'PUT',
    body: JSON.stringify({ timeSpent: '3h' })
  }
);
```

**Field Management**
```javascript
// Get all fields for an issue type
await api.asApp().requestJira(
  `/rest/api/3/issue/createmeta?projectIds=10000&issuetypeIds=10000`
);

// Update a custom field
await api.asApp().requestJira(`/rest/api/3/issue/${issueKey}`, {
  method: 'PUT',
  body: JSON.stringify({
    fields: {
      customfield_10001: { value: 'My Value' }
    }
  })
});
```

### Bitbucket REST API v2.0

The skill also covers Bitbucket for when your Forge app needs to interact with code:

**Repository Operations**
```javascript
await api.asApp().requestJira(
  route`https://api.bitbucket.org/2.0/repositories/{workspace}/{repo}`
);
```

**Pull Request Management**
```javascript
// Create a PR
await api.asApp().requestJira(
  route`https://api.bitbucket.org/2.0/repositories/{workspace}/{repo}/pullrequests`,
  {
    method: 'POST',
    body: JSON.stringify({
      title: 'Feature implementation',
      description: 'Details here',
      source: { branch: { name: 'feature/new' } },
      destination: { branch: { name: 'main' } }
    })
  }
);

// Merge a PR
await api.asApp().requestJira(
  route`https://api.bitbucket.org/2.0/repositories/{workspace}/{repo}/pullrequests/${prId}/merge`,
  { method: 'POST' }
);
```

### Confluence REST API v2

For Confluence macros or page-based operations:

**Content Operations**
```javascript
// Get page with expanded content
await api.asApp().requestJira(
  route`/wiki/rest/api/content/${pageId}?expand=body.storage`
);

// Create a new page
await api.asApp().requestJira('/wiki/rest/api/content', {
  method: 'POST',
  body: JSON.stringify({
    type: 'page',
    title: 'New Page',
    space: { key: 'DOCS' },
    body: {
      storage: { value: '<p>Page content</p>', representation: 'storage' }
    }
  })
});
```

## Events and Triggers

Forge apps can listen to Jira events. The skill provides the exact event structure you'll receive:

```yaml
modules:
  trigger:
    - key: issue-created-trigger
      events:
        - avi:jira:created:issue
        - avi:jira:updated:issue
      function: handleIssueEvents
```

The handler receives both the event and context:

```javascript
export const handleIssueEvents = async (event, context) => {
  console.log('Received:', event.eventType);
  console.log('User who triggered:', event.atlassianId);
  
  switch(event.eventType) {
    case 'avi:jira:created:issue':
      return onIssueCreated(event.issue);
      
    case 'avi:jira:updated:issue':
      return onIssueUpdated(event.issue, event.changelog);
  }
};
```

All available events are documented:
- Issue events (created, updated, deleted)
- Comment events
- Workflow transition events
- Notification events

## Configuration UI with the Jira Bridge

When you need user input for your validator/condition/post function, use `@forge/jira-bridge`:

```javascript
import { workflowRules } from '@forge/jira-bridge';

const onConfigureFn = async () => {
  // Get values from form inputs
  const fieldId = document.getElementById('field-select').value;
  const prompt = document.getElementById('prompt-input').value;
  
  return JSON.stringify({
    fieldId,
    prompt,
    enabled: true
  });
};

await workflowRules.onConfigure(onConfigureFn);
```

The skill even includes the UI modifications API for more complex scenarios where you need to modify existing Jira pages.

## Installation and Setup

Install the skill once, use it forever:

```bash
# Copy this skill to your project's Cline directory
mkdir -p ~/.cline/skills
cp -r atlassian-jira-forge-skill ~/.cline/skills/

# Or copy directly to a new project
mkdir -p my-forge-app/.cline/skills
cp -r ../skill-jira-forge/.cline/skills/atlassian-jira-forge-skill \
  my-forge-app/.cline/skills/
```

Add it to your `.clinerc`:

```json
{
  "skills": [
    {
      "name": "atlassian-jira-forge-skill",
      "path": "/Users/yourname/.cline/skills/atlassian-jira-forge-skill"
    }
  ]
}
```

Now when you describe any Forge task, Cline has the exact API structure, response format, and permissions ready.

## The Skill's Philosophy

This skill follows one principle: **Contextual precision over general knowledge**.

The Atlassian documentation is comprehensive but scattered. You need to jump between:
- Module definition reference
- REST API endpoint docs
- Permissions scope list
- Event payload examples

This skill brings everything together in one place, with the exact code patterns that work in production.

It doesn't try to teach Forge from first principles. It assumes you know JavaScript, React, and how Jira workflows work. What it provides is the precise integration points — the fields, scopes, response formats, and API calls.

## When Cline Skills Shine

You'll appreciate this skill when:
1. **Building complex validators** that need AI or external service calls
2. **Creating post functions** that span multiple products (Jira + Confluence)
3. **Debugging permission errors** — the skill lists every available scope
4. **Implementing bulk operations** — the JSON format for batch updates is tricky
5. **Setting up triggers** — the event payloads are complex and hard to remember

## Getting Started

1. Copy the skill to your `~/.cline/skills/` directory
2. Add it to `.clinerc`
3. Start describing your Forge feature:
   - "Create a validator that checks description length"
   - "Add a post function that creates subtasks"
   - "Set up a trigger for issue creation"

Cline will use the skill's exact patterns, documented response formats, and tested code snippets to generate production-ready code on the first try.

## The Complete Reference

The skill includes:
- **15+ categories** of Jira REST API endpoints
- **Complete module definitions** for validators, conditions, post functions
- **Event payload structures** for all trigger types
- **Permission scope documentation** with exact values needed
- **CLI command reference** for `forge deploy`, `forge tunnel`, etc.
- **Best practices** for error handling and performance

One skill. Zero memorization. All the API details you need, right where your AI assistant can see them.

## Next Steps

1. Copy this skill to `~/.cline/skills/atlassian-jira-forge-skill`
2. Add it to `.clinerc` in any Forge project
3. Start describing features and let Cline handle the API complexity
4. Share it with your team — everyone benefits from the shared context

The Atlassian Forge Jira Skill is open source and available on GitHub. Contributions are welcome for additional module types, product integrations, and real-world examples.