# Implementation Plan

[Overview]
This implementation plan expands the JIRA Forge skill to include more comprehensive templates and examples that reduce AI model depth issues and hallucinations when building Atlassian Forge apps.

## Scope
The skill currently has good reference documentation for validators, conditions, and post-functions but lacks templates for several important module types. This plan addresses:

1. **UI Modifications (UIM)** - One of the most powerful but under-documented features
2. **Dashboard Gadgets** - Custom UI integration patterns
3. **Event Triggers with Filtering** - Complex event handling patterns
4. **Bitbucket Merge Checks** - Pull request validation examples

These additions will provide concrete, working templates that help AI models generate correct implementations without hallucinating module structures.

[Types]
### Module Types and Their Structures

#### UI Modifications (jira:uiModifications)
```yaml
modules:
  jira:uiModifications:
    - key: ui-modifications-app
      title: Example UI modifications app
      resource: uiModificationsApp
resources:
  - key: uiModificationsApp
    path: static/ui-modifications/dist
permissions:
  scopes:
    - 'read:jira-user'
    - 'read:jira-work'
    - 'manage:jira-configuration'
```

#### Dashboard Gadgets (jira:dashboardGadget)
```yaml
modules:
  jira:dashboardGadget:
    - key: hello-world-gadget
      title: Hello world!
      description: A dashboard gadget example.
      resource: main
      thumbnail: 'https://example.com/icon.png'
permissions:
  scopes:
    - 'read:jira-work'
```

#### Event Triggers with Filtering (trigger)
```yaml
modules:
  trigger:
    - key: issue-created-trigger
      function: issueCreatedFunction
      events:
        - avi:jira:created:issue
      filter:
        ignoreSelf: true
        expression: event.issue.fields?.project.key == 'PROJ'
```

#### Bitbucket Merge Checks (bitbucket:mergeCheck)
```yaml
modules:
  bitbucket:mergeCheck:
    - key: check-pr-title
      function: main
      name: Check PR Title
      description: Validates pull request title format
      triggers:
        - on-merge
permissions:
  scopes:
    - 'read:pullrequest:bitbucket'
```

[Files]
### New Files to Create

#### Templates Directory (`/.cline/skills/atlassian-jira-forge-skill/templates/`)

| File | Purpose |
|------|---------|
| `ui-modifications.yml` | UI modifications module template with admin page integration |
| `dashboard-gadget.yml` | Dashboard gadget with custom UI configuration |
| `trigger-with-filter.yml` | Event trigger with complex filtering examples |
| `bitbucket-merge-check.yml` | Bitbucket merge check for pull request validation |

### Documentation to Update

#### Docs Directory (`/.cline/skills/atlassian-jira-forge-skill/docs/`)

| File | Description |
|------|-------------|
| `08-ui-modifications.md` | Comprehensive UIM guide with full working example |
| `19-dashboard-gadgets.md` | Dashboard gadget development examples |
| `20-event-triggers-filters.md` | Event filtering patterns and best practices |
| `21-bitbucket-merge-checks.md` | Bitbucket merge check implementation |

### Files to Delete

None - all new templates will be added without removing existing content.

[Functions]
### Function Templates for New Modules

#### UI Modifications Resolver
```javascript
import { bridge } from '@forge/bridge';
import { uiModificationsApi } from '@forge/jira-bridge';

export const onInit = async () => {
  uiModificationsApi.onInit(
    ({ api }) => {
      // Field modification logic here
    },
    ['priority', 'summary'] // Fields to monitor
  );
};
```

#### Dashboard Gadget Resolver
```javascript
import { bridge } from '@forge/bridge';
import Resolver from '@forge/resolver';

const resolver = new Resolver();

resolver.define('getWidgetData', async () => {
  // Fetch data for dashboard gadget
});

export const handler = resolver.getDefinitions();
```

#### Trigger Function with Filter
```javascript
export const issueCreatedFunction = async (event, context) => {
  // Check if self-generated event should be ignored
  if (context.installContext === 'self-generated') return;
  
  // Process filtered events only
  if (!shouldProcess(event)) return;
};
```

#### Merge Check Function
```javascript
export const main = async (event, context) => {
  // Validate pull request
  const prTitle = event.pullrequest.title;
  const success = !prTitle.includes('DRAFT');
  
  return {
    success,
    message: success ? 'PR title is valid' : 'PR contains DRAFT'
  };
};
```

[Classes]
No new classes are required. The skill uses a template-based approach with YAML manifests and function handlers.

[Dependencies]
### New Dependencies to Document

| Package | Purpose |
|---------|---------|
| `@forge/jira-bridge` | UIM API for field modifications |
| `@forge/react` | UI Kit components for gadgets |
| `@forge/resolver` | Bridge between Custom UI and backend |

No additional npm packages required beyond existing skill dependencies.

[Testing]
### Test Cases to Include

1. **UI Modifications Testing**
   - Field visibility toggle
   - Label/description modification
   - Tab hiding/showing

2. **Dashboard Gadget Testing**
   - Widget rendering with data
   - Configuration form submission
   - Theme-aware rendering

3. **Trigger Filtering Testing**
   - Self-event detection
   - Project/issue type filtering
   - Error handling for failed expressions

4. **Merge Check Testing**
   - Pass/fail scenarios
   - Required vs Recommended configurations
   - PR title/content validation

### Validation Strategy

Each template should include:
- Valid manifest.yml syntax verification
- Expected error messages and solutions
- Common configuration pitfalls to avoid

[Implementation Order]

1. ✅ **Create UI Modifications Template** (Priority: High)
   - `templates/ui-modifications.yml` - Created with UIM examples, REST API calls, field APIs

2. ✅ **Create Dashboard Gadget Template** (Priority: High)
   - `templates/dashboard-gadget.yml` - Created with UI Kit and Custom UI examples

3. ✅ **Create Trigger with Filter Template** (Priority: Medium)
   - `templates/trigger-with-filter.yml` - Created with filtering, event handling, use cases

4. ✅ **Create Bitbucket Merge Check Template** (Priority: High)
   - `templates/bitbucket-merge-check.yml` - Created with validation examples, trigger types

5. **Update Documentation Files**
   - Create/update all 4 documentation files
   - Ensure cross-referencing between templates and docs

6. **Create Integration Examples**
   - End-to-end workflow examples combining multiple modules
   - Migration guide from Connect to Forge patterns