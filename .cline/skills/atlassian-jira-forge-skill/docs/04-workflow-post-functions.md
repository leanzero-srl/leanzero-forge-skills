# Jira Workflow Post Functions

## Overview

Forge apps **DO have a `jira:workflowPostFunction` module type**. This allows you to execute custom Forge functions to perform complex actions immediately after a workflow transition completes successfully.

While Jira provides built-in system post functions for simple tasks, the `jira:workflowPostFunction` module is the correct way to implement advanced logic that requires external API calls, complex data processing, or integration with other systems.

### When to use `jira:workflowPostFunction` vs System Post Functions

| Feature | System Post Functions | `jira:workflowPostFunction` |
|---------|-----------------------|-----------------------------|
| **Complexity** | Simple (update field, change assignee) | High (external API, complex logic) |
| **Execution** | Built-in Jira logic | As a Forge function |
| **Manifest** | No declaration needed | Requires `manifest.yml` entry |
| **Configuration** | Direct in Workflow UI | Workflow UI + Forge Function |

## Configuration Approach

### Using the Workflow Editor (UI)

1. Open your workflow in Jira
2. Select the transition you want to add a post function to
3. Add a post function:
   - Select a **System Post Function** for simple, built-in actions.
   - Select **"Forge workflow post function"** to use your custom Forge module.
4. If using a Forge module, select your app and the specific function key.

### Using the Forge Module (`jira:workflowPostFunction`)

To implement a custom post function via Forge, you must declare it in your `manifest.yml`:

```yaml
modules:
  jira:workflowPostFunction:
    - key: my-custom-post-function
      name: Post-Transition Sync
      description: Syncs issue data to an external system
      function: syncData

functions:
  - key: syncData
    handler: src/index.syncData
```

### Function Implementation

Your Forge function performs the action after the transition is successful.

```javascript
export const syncData = async (payload) => {
  const { issue } = payload;

  try {
    // Example: Sync issue data to an external CRM
    const response = await api.asApp().requestJira(route`/rest/api/3/issue/${issue.id}`);
    
    if (response.ok) {
      console.log(`Successfully processed post-function for ${issue.key}`);
    }

    // Post functions typically do not return a 'result' to block the transition
    // because the transition has ALREADY succeeded.
  } catch (error) {
    console.error("Post-function error:", error);
  }
};
```

## Response Handling

Unlike validators, post functions run **after** the transition is complete.

1. The transition has already succeeded.
2. The user has already seen the success message/next screen.
3. If your Forge function fails, the transition **cannot be rolled back** automatically. 
4. **Best Practice**: Implement robust error handling (logging, retries, or error notification) within your function to handle failures gracefully.

## Comparison: Connect vs Forge Approach

| Aspect | Connect Apps | Forge Apps |
|--------|-------------|------------|
| Module Type | `jiraWorkflowPostFunctions` | `jira:workflowPostFunction` |
| Execution Environment | External Server | Atlassian Forge Infrastructure |
| Configuration | In manifest or via JS API | Workflow UI + Forge Function |

## Common Use Cases

1. **External System Sync**: Sync issue status or data to a CRM/ERP immediately after a transition.
2. **Automated Task Creation**: Create sub-tasks or linked issues based on the transition performed.
3. **Complex Field Updates**: Perform calculations or multi-field updates that exceed standard system post functions.
4. **Notification/Integration**: Send custom messages to Slack, Microsoft Teams, or other external tools.

## Testing Post Functions

1. **Test in development**: Use `forge tunnel` to test your function logic locally.
2. **Check logs**: Use `forge logs` to monitor your function's output and catch any errors.
3. **Verify outcome**: Always check the Jira issue after the transition to ensure the intended changes were applied.
4. **Robustness**: Since post functions run after the fact, ensure your code handles potential failures without leaving the system in an inconsistent state.

## Next Steps

- **Workflow Validators**: Validate data before transition completes (uses `jira:workflowValidator`).
- **Workflow Conditions**: Control visibility of transitions (uses `jira:workflowCondition`).
- **Jira Expressions Guide**: Learn more about the expression syntax at Atlassian's documentation.

**Remember**: Forge apps use the `jira:workflowPostFunction` module for complex logic after a transition, while system post functions handle simple tasks.
