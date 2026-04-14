# When to Use Which Module Type

A comprehensive decision guide for selecting the right Forge module type.

---

## Decision Tree: Workflow Modules

```
┌─────────────────────────────────────────────────────────────┐
│ What do you want to achieve?                                │
└─────────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
  Validation?      UI Visibility Control?    Post-Action?
        │                   │                   │
        ▼                   ▼                   ▼
   Validator          Condition            Post Function
```

### Choose a Validator When:
✅ You need to **block or allow** a workflow transition  
✅ You want to validate data **before** the transition completes  
✅ You need custom validation logic beyond Jira's built-in validators  

**Examples:**
- Validate that issue description contains minimum length
- Check external system for validation rules
- Ensure custom fields meet business requirements

---

### Choose a Condition When:
✅ You want to **hide/show** transitions in the UI  
✅ You need conditional visibility based on context  
✅ You don't block the transition, just control what users see  

**Examples:**
- Hide transition if user doesn't have required permissions
- Only show transitions relevant to current issue state
- Conditional visibility based on custom field values

---

### Choose a Post Function When:
✅ You need to execute logic **after** the transition completes  
✅ You want to update fields, create subtasks, or trigger events  
✅ The workflow should continue regardless of your function's result  

**Examples:**
- Update related issues when status changes
- Send notifications after issue creation
- Create subtasks for complex workflows

---

## Module Selection Matrix

| Requirement | Recommended Module |
|-------------|-------------------|
| Block transition if invalid | `jira:workflowValidator` |
| Control UI visibility | `jira:workflowCondition` |
| Run after success | `jira:workflowPostFunction` |
| Update fields automatically | `jira:workflowPostFunction` |
| Schedule recurring tasks | `scheduledTrigger` |
| Custom UI configuration | Custom UI + Bridge API |
| Execute in automation rules | `action` module |

---

## Specific Use Cases

### 1. Creating an Issue Requires Validation

**Module**: `jira:workflowValidator`

```yaml
modules:
  jira:workflowValidator:
    - key: create-validation
      name: Create Validation
      description: Validates on issue creation
      function: validateOnCreate
      
      create:
        resource: config-ui
```

---

### 2. Moving Issue to "In Progress" Requires Review

**Module**: `jira:workflowValidator` + `jira:workflowPostFunction`

```yaml
modules:
  # Block transition if not reviewed
  jira:workflowValidator:
    - key: in-progress-validator
      name: In Progress Validator
      description: Requires review before moving to In Progress
      function: requireReview
      
  # Notify stakeholders after transition
  jira:workflowPostFunction:
    - key: notify-stakeholders
      name: Notify Stakeholders
      description: Sends notification on status change
      function: notifyAfterTransition
```

---

### 3. Only Show "Close Issue" to Managers

**Module**: `jira:workflowCondition`

```yaml
modules:
  jira:workflowCondition:
    - key: manager-only-close
      name: Manager Only
      description: Only managers can see close transition
      function: checkManagerPermission
      
      create:
        resource: config-ui
```

---

### 4. Auto-Assign Issues Based on Category

**Module**: `jira:workflowPostFunction`

```yaml
modules:
  jira:workflowPostFunction:
    - key: auto-assign-category
      name: Auto-Assign by Category
      description: Assigns issues based on category field
      function: assignByCategory
      
      create:
        resource: config-ui
```

---

### 5. Send Daily Report

**Module**: `scheduledTrigger`

```yaml
modules:
  scheduledTrigger:
    - key: daily-report
      name: { value: 'Daily Report' }
      description: { value: 'Sends daily summary report' }
      function: sendDailyReport
      schedule:
        period: day
        time: '09:00'
```

---

## UI Module Decisions

### When to Use Custom UI vs. Standard Configuration

**Use Standard Configuration (no custom UI)** when:
- Simple validation logic is sufficient
- Using Jira expressions for validation
- No complex user interaction needed

**Use Custom UI** when:
- Dropdowns, date pickers, or form inputs needed
- Dynamic configuration based on user input
- Multi-step configuration process

---

### Bridge API Use Cases

Use `@forge/bridge` when you need:

| Feature | Module Type |
|---------|-------------|
| Access Jira REST API from UI | Custom Page + Bridge API |
| Configuration for workflow rules | validator/condition/post-function config-ui |
| Dashboard widgets | jira:dashboardGadget |
| Portal panel customization | jsm portal modules |

---

## API Endpoint Selection

### Which API to Use?

| Scenario | API Method |
|----------|-----------|
| From within Forge function (no user session) | `api.asApp()` |
| From within Forge function (preserve user permissions) | `api.asUser()` |
| From Custom UI component | `bridge.requestJira()` |

---

## Permissions Checklist

### Common Permission Requirements

| Module Type | Required Scopes |
|-------------|-----------------|
| Read issues only | `read:jira-work` |
| Update issues | `read:jira-work`, `write:jira-work` |
| Access workflows | `read:workflow:jira` |
| External API calls | Add domain to `external.fetch.backend` |

---

## Performance Considerations

### Function Execution Time Limits

| Module Type | Timeout |
|-------------|---------|
| Workflow validators/conditions | 30 seconds |
| Post functions | 30 seconds |
| Scheduled triggers | 60 seconds |
| Automation actions | 30 seconds |

**Best Practices:**
- Use `api.asApp()` for faster execution (no user session)
- Batch operations to reduce API calls
- Offload heavy processing to scheduled triggers

---

## Testing Strategy

### Development Order

1. **Start with validators/conditions** - Easiest to test, immediate feedback
2. **Then add post functions** - Require existing workflow setup
3. **Add scheduled triggers** - Test timing and batching
4. **Custom UI last** - Requires full development environment

---

## Troubleshooting Common Issues

| Issue | Likely Solution |
|-------|-----------------|
| Validator doesn't appear in workflow editor | Check `create: resource: config-ui` is present |
| Condition not hiding/showing transitions | Verify condition returns `{ result: true/false }` |
| Post function runs before expected | Ensure it's configured to run at correct stage |
| External API calls failing | Add domain to permissions.external.fetch.backend |

---

## Next Steps

1. Review existing docs in `docs/` for detailed module configurations
2. Check `problem-patterns.md` for copy-paste code examples
3. See `templates/` directory for boilerplate files