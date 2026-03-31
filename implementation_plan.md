# Implementation Plan

## Overview
This plan extends the Atlassian Jira Forge development skill to include comprehensive coverage of all available Forge modules, UI modifications, bridge API patterns, and advanced implementation techniques. The goal is to transform the current documentation from a working reference into a complete developer guide.

## Types

### Module Configuration Structure (Extended)
```yaml
modules:
  # Jira workflow modules
  jira:workflowValidator: [...]
  jira:workflowCondition: [...]
  jira:workflowPostFunction: [...]
  
  # Jira UI modification modules
  jira:uiModification: [...]           # Modify existing UI elements
  jira:jqlFunction: [...]               # Custom JQL functions
  jira:adminPage: [...]                 # Admin configuration pages
  
  # Confluence modules
  macro: [...]                          # Page macros
  full-page: [...]                      # Full page apps
  dashboard-background-script: [...]    # Dashboard widgets
  
  # Bitbucket modules
  bitbucket:mergeCheck: [...]           # PR validation
  bitbucket:uiModification: [...]       # UI extensions
  
  # JSM modules (Jira Service Management)
  jiraServiceManagement:portalRequestDetail: [...]
  jiraServiceManagement:portalHeader: [...]
  jiraServiceManagement:organizationPanel: [...]
  jiraServiceManagement:requestTypeForms: [...]
  
  # Additional module types
  scheduledTrigger: [...]               # Timed execution
  action: [...]                         # Automation actions
  trigger: [...]                        # Event triggers
  
  # Custom UI and resources
  customPage: [...]                     # Full page apps
  page: [...]                           # Page modules
  
permissions:
  scopes:
    - read:jira-work
    - write:jira-work
    - read:project:jira
    - storage:app
```

### Bridge API Types (Custom UI Communication)
```typescript
// Bridge API methods available in custom UI
interface ForgeBridge {
  // Data fetching
  requestJira(endpoint: string, options?: RequestInit): Promise<Response>
  requestConfluence(endpoint: string, options?: RequestInit): Promise<Response>
  
  // Context access
  getInstallContext(): Promise<InstallContext>
  getContext(): Promise<UserContext>
  
  // UI operations
  configure(configuration: object): Promise<void>
  close(): Promise<void>
  refresh(): Promise<void>
  
  // Router
  useRouter(): Router
}

interface InstallContext {
  cloudId: string
  installKey: string
  product: string
}

interface UserContext {
  accountId: string
  accountType: 'licensed' | 'unlicensed' | 'customer' | 'anonymous'
}
```

### Resolver Pattern Types
```typescript
// Resolver pattern for backend communication
class ForgeResolver {
  define(name: string, handler: Function): void
  getDefinitions(): Record<string, Function>
}

interface ResolverPayload {
  payload?: any
  parameters?: Record<string, any>
}

interface ResolverContext {
  accountId: string
  cloudId: string
  installContext: string
}
```

## Files

### New Documentation Files to Create
1. **`.cline/skills/atlassian-jira-forge-skill/docs/02-ui-modifications.md`**
   - Jira UI modifications for extending existing UI elements
   - Confluence macro development with custom UI
   - Bitbucket UI extensions and PR page modifications
   
2. **`.cline/skills/atlassian-jira-forge-skill/docs/15-bridge-api-reference.md`**
   - Complete bridge API reference (requestJira, requestConfluence)
   - Context retrieval patterns
   - Router and navigation patterns
   - Configuration UI examples
   
3. **`.cline/skills/atlassian-jira-forge-skill/docs/16-resolver-patterns.md`**
   - Resolver pattern introduction and architecture
   - Frontend to backend communication
   - Async data fetching patterns
   - Error handling in resolvers

4. **`.cline/skills/atlassian-jira-forge-skill/docs/17-ui-kit-components.md`**
   - Complete UI Kit component reference
   - Form components (Form, Field, Button, etc.)
   - Layout components (Layout, Section, Grid)
   - Data display components (Table, List, Spinner)
   - Feedback components (Alert, Toast, Modal)

5. **`.cline/skills/atlassian-jira-forge-skill/docs/18-custom-ui-advanced.md`**
   - React component patterns
   - State management with hooks
   - Routing and navigation
   - Custom CSS and styling
   - Performance optimization

### Files to Modify

**`.cline/skills/atlassian-jira-forge-skill/SKILL.md`**
- Add new sections for UI modifications, bridge API, resolver patterns, UI Kit components
- Update the table of contents
- Add advanced implementation patterns section
- Update Quick Reference with more module types

**`.cline/skills/atlassian-jira-forge-skill/docs/01-core-concepts.md`**
- Add comprehensive list of all available Forge modules by product
- Add module resolution flow diagram description
- Expand on Custom UI architecture

### Files to Update for JSM Modules

**`forge-skill/jsm-modules/README.md`**
- Complete rewrite with detailed examples for each JSM module type
- Add organization panel documentation
- Add request type forms documentation
- Add portal footer/header customization examples
- Include advanced patterns and best practices

## Functions

### New Function Examples to Document

1. **UI Modification Handler** (`src/ui-modifications.js`)
   ```javascript
   export const modifyIssuePanel = async (payload, context) => {
     // Handle UI modification requests
     return {
       content: renderCustomContent(payload)
     };
   };
   ```

2. **Resolver Definition** (`src/resolver.js`)
   ```javascript
   import Resolver from '@forge/resolver';
   
   const resolver = new Resolver();
   resolver.define('fetchData', fetchDataHandler);
   resolver.define('saveConfiguration', saveConfigHandler);
   
   export const handler = resolver.getDefinitions();
   ```

3. **Bridge Data Fetcher** (`src/bridge-api.js`)
   ```javascript
   import { bridge } from '@forge/bridge';
   
   export const loadIssueData = async (issueKey) => {
     const response = await bridge.requestJira(`/rest/api/3/issue/${issueKey}`);
     return await response.json();
   };
   ```

### Modified Function Signatures

The existing workflow function signatures remain the same, but will be expanded with more comprehensive examples including:
- Complex configuration handling
- Multiple return patterns
- Error recovery strategies

## Classes

### New Classes to Document

1. **ForgeResolver Class**
   - `define(name, handler)` - Register a resolver function
   - `getDefinitions()` - Get all registered definitions
   - Usage for frontend-to-backend communication

2. **Bridge API Methods** (Documentation of available methods)
   - `requestJira(endpoint, options)`
   - `requestConfluence(endpoint, options)`
   - `getContext()`
   - `configure(configuration)`
   - `close()`, `refresh()`

3. **UI Kit Components** (React components reference)
   - Form components
   - Layout components
   - Data display components

### Modified Classes
- Existing Resolver pattern documentation will be expanded with comprehensive examples

## Dependencies

### New External Resources to Reference
- Atlassian Forge UI Kit GitHub repository
- Bridge API documentation site
- Jira Expressions reference

### Internal Dependencies Update
No new dependencies required. The skill leverages:
- `@forge/api` - For backend functions and API calls
- `@forge/bridge` - For Custom UI communication
- `@forge/resolver` - For resolver pattern implementation
- Forge UI Kit for React components

## Testing

### Test File Requirements
Create example test patterns in documentation:

1. **Unit Tests**
   - Resolver function testing with mock context
   - Bridge API response mocking
   - Event handler testing

2. **Integration Tests**
   - End-to-end workflow validator testing
   - UI modification rendering validation
   - Custom UI component interaction testing

3. **Testing Commands to Document**
   ```bash
   # Run local tests
   npm test
   
   # With coverage
   npm run test:coverage
   
   # Lint and type check
   npm run lint
   npm run type-check
   ```

## Implementation Order

1. **Update core concepts** - Add comprehensive module list to `01-core-concepts.md`
2. **Create UI modifications documentation** - Document all Jira/Confluence/Bitbucket UI modification modules
3. **Create bridge API reference** - Complete reference for bridge methods with examples
4. **Create resolver patterns documentation** - Frontend-to-backend communication guide
5. **Create UI Kit components reference** - All available UI components with examples
6. **Create advanced custom UI guide** - React patterns, state management, optimization
7. **Rewrite JSM modules documentation** - Complete documentation for all JSM module types
8. **Update main SKILL.md file** - Integrate all new sections into the skill documentation

## Next Steps After Implementation

1. Update `implementation_plan.md` to point to new section anchors
2. Create a "Module Selection Guide" in the main README
3. Add troubleshooting section for common issues
4. Include performance optimization tips
5. Add security best practices section