# Jira Workflow Validators (Jira Expressions)

## Overview

Forge apps **DO have a `jira:workflowValidator` module type**. This allows you to execute custom Forge functions to validate transitions, providing much more power than simple Jira expressions.

The `jira:workflowValidator` module is used to run custom backend logic during a workflow transition. This is the correct way to implement complex, data-driven validation that requires external API calls, database lookups, or advanced business logic that exceeds the capabilities of Jira Expressions.

### When to use `jira:workflowValidator` vs Jira Expressions

| Feature | Jira Expressions | `jira:workflowValidator` |
|---------|-----------------|---------------------------|
| **Complexity** | Simple logic (field presence, length) | Complex logic (external API, KVS, DB) |
| **Execution** | Within Jira engine (fast) | As a Forge function (more powerful) |
| **Manifest** | No declaration needed | Requires `manifest.yml` entry |
| **Configuration** | Direct in Workflow UI | Workflow UI + Forge Function |

## Module Configuration

### Manifest Definition

To use a validator, you must declare it in your `manifest.yml`:

```yaml
modules:
  jira:workflowValidator:
    - key: my-custom-validator
      name: My Custom Validator
      description: Validates data using external logic
      function: validateTransition
      # Optional: UI for configuring the validator
      create:
        resource: validator-config-ui

functions:
  - key: validateTransition
    handler: src/index.validateTransition

resources:
  - key: validator-config-ui
    path: static/validator-config/build
```

### Function Implementation

Your Forge function should return a response indicating whether the transition is allowed or blocked.

```javascript
export const validateTransition = async (payload) => {
  const { issue, configuration, modifiedFields } = payload;

  try {
    // Example: Validate against an external system
    const response = await api.asApp().requestJira(route`/rest/api/3/issue/${issue.id}`);
    
    if (!response.ok) {
       return { 
         result: false, 
         message: "Could not verify issue status with external system." 
       };
    }

    // Complex logic: Check if a specific custom field meets a business requirement
    const customFieldValue = issue.fields.customfield_10001;
    if (customFieldValue === 'REJECTED') {
       return { 
         result: false, 
         message: "You cannot transition an issue that has been rejected." 
       };
    }

    // If all checks pass
    return { result: true };

  } catch (error) {
    console.error("Validator error:", error);
    // Best practice: Fail open or closed based on business criticality
    // Failing open allows the transition but logs the error
    return { result: true, message: "Validation error occurred. Transition allowed." };
  }
};
```

## Response Formats

The function must return an object with a `result` property (boolean).

| Scenario | Return Value | Result in Jira |
|----------|--------------|----------------|
| **Success** | `{ result: true }` | Transition proceeds normally |
| **Blocked (with message)** | `{ result: false, message: "Error text" }` | Transition blocked; user sees "Error text" |
| **Blocked (no message)** | `{ result: false }` | Transition blocked; default error shown |

## Important Considerations

### 1. Timeout Limits
Workflow validators have a strict execution time limit (typically **25-30 seconds**). If your function exceeds this, the transition may fail or behave unexpectedly. 
- **Tip**: Implement a "deadline check" pattern to fail gracefully before the hard timeout.

### 2. Permissions
Since validators often run in a workflow context where a user might not have sufficient permissions for all actions, it is recommended to use `api.asApp()` for the validation logic to ensure reliability.

### 3. No "Validation Failed" Event
Currently, there is **no** Forge event (like `jira:workflow_validation_failed`) that triggers when a validator blocks a transition. If you need to track failed validation attempts, you must implement that logic within the validator function itself (e.g., by logging to an external system or updating a custom field).

## Comparison: Connect vs Forge Approach

| Aspect | Connect Apps | Forge Apps |
|--------|-------------|------------|
| Module Type | `jiraWorkflowValidators` | `jira:workflowValidator` |
| Execution Environment | External Server | Atlassian Forge Infrastructure |
| Configuration | Manifest + External Server | Manifest + Forge Function |

## Common Use Cases

1. **External System Sync**: Validate that an issue's state matches an external CRM or ERP before allowing a transition.
2. **Complex Data Integrity**: Ensure that multiple custom fields across different issue types meet complex inter-dependent rules.
3. **Dynamic Business Rules**: Fetch rules from Forge Storage (KVS) to allow admins to change validation logic without redeploying code.
4. **Advanced Formatting**: Validate that text inputs match complex regex patterns that Jira Expressions cannot handle.

## Next Steps

- **Workflow Conditions**: Learn how to hide/show transitions using `jira:workflowCondition`.
- **Workflow Post Functions**: Learn how to execute logic *after* a successful transition using `jira:workflowPostFunction`.
- **Error Handling**: Review the "Real-World Patterns" for advanced error management and timeout strategies.
