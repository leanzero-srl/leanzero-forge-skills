# Bitbucket Merge Checks Code Examples

This document provides code examples for implementing merge checks in Atlassian Forge apps. Merge checks validate pull requests before merging, ensuring code quality and team standards are maintained.

## Table of Contents
1. [Basic Merge Check](#basic-merge-check)
2. [Merge Check Manifest Configuration](#merge-check-manifest-configuration)
3. [Accessing Pull Request Context](#accessing-pull-request-context)
4. [Common Use Cases](#common-use-cases)
5. [Error Handling](#error-handling)

---

## Basic Merge Check

### Manifest Configuration

```yaml
modules:
  bitbucket:mergeCheck:
    - key: require-approvals-check
      name: { value: 'Require Review Approvals' }
      description: { value: 'Ensures pull request has required approvals' }
      function: requireApprovalsFunction
```

### Function Implementation

```javascript
export const requireApprovalsFunction = async (payload, context) => {
  console.log('Merge check triggered:', JSON.stringify(payload, null, 2));
  
  // Extract information from the payload
  const { pullRequest } = payload;
  
  try {
    // Check if PR has required approvals
    const hasRequiredApprovals = await checkApprovalStatus(pullRequest);
    
    if (hasRequiredApprovals) {
      return {
        status: 'success',
        name: { value: 'Required Approvals' },
        description: { value: 'All required approvals are in place' }
      };
    }
    
    return {
      status: 'failure',
      name: { value: 'Missing Approvals' },
      description: { 
        value: 'This PR needs at least 2 reviewer approvals before merging'
      }
    };
  } catch (error) {
    console.error('Merge check error:', error);
    throw error;
  }
};

const checkApprovalStatus = async (pullRequest) => {
  // Your approval checking logic here
  return pullRequest.reviewers.some(r => r.approved === true) && 
         pullRequest.reviewers.length >= 2;
};
```

---

## Merge Check Manifest Configuration

### Complete Merge Check Module

```yaml
modules:
  bitbucket:mergeCheck:
    - key: test-coverage-check
      name: { value: 'Test Coverage Check' }
      description: { value: 'Ensures pull request has sufficient test coverage' }
      function: testCoverageCheck
      
      # Configuration options for the merge check
      configurationUI:
        fields:
          - key: minimumCoverage
            type: text
            label: Minimum Coverage (%)
            defaultValue: '80'
            
    - key: pr-size-check
      name: { value: 'PR Size Limit' }
      description: { value: 'Limits pull request size for review efficiency' }
      function: prSizeCheck
      
      configurationUI:
        fields:
          - key: maxLinesChanged
            type: text
            label: Max Lines Changed
            defaultValue: '500'
```

### Multiple Merge Checks

```yaml
modules:
  bitbucket:mergeCheck:
    - key: code-approval-check
      name: { value: 'Code Approval' }
      description: { value: 'Requires minimum number of approvals' }
      function: codeApprovalFunction
      
    - key: test-coverage-check
      name: { value: 'Test Coverage' }
      description: { value: 'Ensures adequate test coverage' }
      function: testCoverageFunction
      
    - key: branch-naming-check
      name: { value: 'Branch Naming' }
      description: { value: 'Enforces branch naming conventions' }
      function: branchNamingFunction
```

---

## Accessing Pull Request Context

### Complete Payload Structure

```javascript
export const detailedContextFunction = async (payload, context) => {
  console.log('Full payload:', JSON.stringify(payload, null, 2));
  
  // Extract pull request information
  const { 
    pullRequest,
    repository,
    actor,
    fromRef,
    toRef
  } = payload;
  
  console.log(`Pull Request: ${pullRequest.id} - ${pullRequest.title}`);
  console.log(`Repository: ${repository.fullKey}`);
  console.log(`Actor (approving): ${actor.displayName}`);
  
  // Access ref information
  console.log(`From branch: ${fromRef.displayId}`);
  console.log(`To branch: ${toRef.displayId}`);
  
  return {
    status: 'success',
    message: { value: 'Merge check passed' }
  };
};

// Example of parsing the pull request data
const analyzePullRequest = (pullRequest) => {
  const stats = {
    id: pullRequest.id,
    title: pullRequest.title,
    author: pullRequest.author?.displayName || 'Unknown',
    reviewersCount: pullRequest.reviewers.length,
    approvedCount: pullRequest.reviewers.filter(r => r.approved).length,
    linesAdded: pullRequest.fromRef.diffStat?.added || 0,
    linesDeleted: pullRequest.fromRef.diffStat?.deleted || 0
  };
  
  return stats;
};
```

---

## Common Use Cases

### 1. Require Review Approvals

```yaml
modules:
  bitbucket:mergeCheck:
    - key: require-approvals-check
      name: { value: 'Require Approvals' }
      description: { value: 'Requires at least 2 reviewer approvals' }
      function: requireApprovalsFunction
```

```javascript
export const requireApprovalsFunction = async (payload, context) => {
  console.log('Checking approval requirements...');
  
  const { pullRequest } = payload;
  
  // Count approvals from unique users
  const approvals = pullRequest.reviewers.filter(r => 
    r.approved && r.user?.accountId !== pullRequest.author?.user?.accountId
  );
  
  const requiredApprovals = 2; // Configure this in your app settings
  
  if (approvals.length >= requiredApprovals) {
    return {
      status: 'success',
      name: { value: 'Approval Check' },
      description: { 
        value: `PR has ${approvals.length} approvals (required: ${requiredApprovals})` 
      }
    };
  }
  
  return {
    status: 'failure',
    name: { value: 'Insufficient Approvals' },
    description: { 
      value: `Need at least ${requiredApprovals} approvals. Current: ${approvals.length}` 
    }
  };
};
```

### 2. Test Coverage Validation

```yaml
modules:
  bitbucket:mergeCheck:
    - key: test-coverage-check
      name: { value: 'Test Coverage' }
      description: { value: 'Validates code coverage meets minimum threshold' }
      function: testCoverageFunction
```

```javascript
export const testCoverageFunction = async (payload, context) => {
  console.log('Checking test coverage...');
  
  const { pullRequest } = payload;
  
  try {
    // Get coverage data from your CI/CD system or code analysis tool
    const coverageData = await fetchTestCoverage(pullRequest);
    
    if (!coverageData) {
      return {
        status: 'failure',
        name: { value: 'No Coverage Data' },
        description: { value: 'Coverage report not available for this PR' }
      };
    }
    
    const minCoverage = 80; // Minimum required coverage percentage
    
    if (coverageData.coverage >= minCoverage) {
      return {
        status: 'success',
        name: { value: 'Coverage Check' },
        description: { 
          value: `Coverage is ${coverageData.coverage}% (required: ${minCoverage}%)` 
        }
      };
    }
    
    return {
      status: 'failure',
      name: { value: 'Low Coverage' },
      description: { 
        value: `Current coverage is ${coverageData.coverage}%. Need at least ${minCoverage}%` 
      }
    };
  } catch (error) {
    console.error('Coverage check error:', error);
    
    return {
      status: 'failure',
      name: { value: 'Coverage Error' },
      description: { value: `Error checking coverage: ${error.message}` }
    };
  }
};

const fetchTestCoverage = async (pullRequest) => {
  // Fetch coverage from your CI/CD system
  // This is a placeholder for actual API calls
  
  return {
    coverage: 85,
    testsPassed: 150,
    testsFailed: 3
  };
};
```

### 3. Branch Naming Convention

```yaml
modules:
  bitbucket:mergeCheck:
    - key: branch-naming-check
      name: { value: 'Branch Naming' }
      description: { value: 'Enforces branch naming conventions' }
      function: branchNamingFunction
```

```javascript
export const branchNamingFunction = async (payload, context) => {
  console.log('Checking branch naming convention...');
  
  const { pullRequest, fromRef } = payload;
  const branchName = fromRef.displayId;
  
  // Define allowed patterns
  const validPatterns = [
    /^feature\/[a-zA-Z0-9_-]+$/,      // feature/branch-name
    /^bugfix\/[a-zA-Z0-9_-]+$/,       // bugfix/issue-description
    /^hotfix\/[a-zA-Z0-9_-]+$/,       // hotfix/critical-fix
    /^release\/[0-9]+\.[0-9]+\.[0-9]+$/  // release/1.0.0
  ];
  
  const isValid = validPatterns.some(pattern => pattern.test(branchName));
  
  if (isValid) {
    return {
      status: 'success',
      name: { value: 'Branch Naming' },
      description: { value: `Branch naming convention is valid` }
    };
  }
  
  return {
    status: 'failure',
    name: { value: 'Invalid Branch Name' },
    description: { 
      value: `Branch "${branchName}" does not match required patterns.` +
             `\nValid patterns: feature/..., bugfix/..., hotfix/..., release/x.x.x` 
    }
  };
};
```

### 4. PR Size Limit

```yaml
modules:
  bitbucket:mergeCheck:
    - key: pr-size-check
      name: { value: 'PR Size Limit' }
      description: { value: 'Limits pull request size for efficient review' }
      function: prSizeFunction
```

```javascript
export const prSizeFunction = async (payload, context) => {
  console.log('Checking PR size...');
  
  const { pullRequest } = payload;
  
  // Get diff statistics
  const response = await api.asApp().requestBitbucket(
    `/2.0/repositories/${pullRequest.toRef.repository.project.key}/${pullRequest.toRef.repository.slug}/diffstat/${pullRequest.id}`
  );
  
  const data = await response.json();
  
  let totalLinesChanged = 0;
  for (const file of data) {
    totalLinesChanged += (file.additions || 0) + (file.lines || 0);
  }
  
  const maxLines = 500; // Configure this in your app settings
  
  if (totalLinesChanged <= maxLines) {
    return {
      status: 'success',
      name: { value: 'PR Size' },
      description: { 
        value: `PR has ${totalLinesChanged} lines changed (max: ${maxLines})` 
      }
    };
  }
  
  return {
    status: 'failure',
    name: { value: 'PR Too Large' },
    description: { 
      value: `PR has ${totalLinesChanged} lines changed. Please break into smaller PRs (max: ${maxLines})` 
    }
  };
};
```

---

## Error Handling

### Comprehensive Error Handling

```javascript
export const robustMergeCheck = async (payload, context) => {
  try {
    // Validate payload
    if (!payload?.pullRequest?.id) {
      throw new Error('Invalid payload: Missing pull request ID');
    }
    
    // Your merge check logic
    await performCheck(payload);
    
    return {
      status: 'success',
      name: { value: 'Merge Check' },
      description: { value: 'All checks passed' }
    };
  } catch (error) {
    console.error('Merge check error:', {
      message: error.message,
      stack: error.stack,
      payload: payload
    });
    
    // Log to external logging service if needed
    
    return {
      status: 'failure',
      name: { value: 'Check Error' },
      description: { 
        value: `Error during merge check: ${error.message}` 
      }
    };
  }
};
```

### Handling External Service Failures

```javascript
export const gracefulMergeCheck = async (payload, context) => {
  try {
    // Try primary data source
    return await performPrimaryCheck(payload);
  } catch (primaryError) {
    console.warn('Primary check failed:', primaryError);
    
    // Fall back to alternative check or skip gracefully
    if (isCriticalCheck(primaryError)) {
      throw primaryError; // Critical failure, should fail the merge
    }
    
    // Non-critical, allow PR to proceed with warning
    return {
      status: 'success',
      name: { value: 'Merge Check (Fallback)' },
      description: { 
        value: `Primary check unavailable. Using fallback validation.` 
      }
    };
  }
};

const isCriticalCheck = (error) => {
  // Define which errors should fail the merge
  return error.message.includes('approval') || error.message.includes('coverage');
};
```

---

## Best Practices

1. **Keep checks fast** - Merge checks should complete quickly
2. **Handle failures gracefully** - Don't block merges for non-critical issues
3. **Provide clear messages** - Users need to understand what failed
4. **Cache data when possible** - Avoid redundant API calls
5. **Test thoroughly** - Test with various PR scenarios

---

## Related Documentation

- [Forge Bitbucket Merge Checks](https://developer.atlassian.com/cloud/forge/application-structure/#bitbucketmergablecheck)
- [Bitbucket REST API](../api-endpoints/bitbucket-rest-api.md)

---

## Complete Example: All-in-One Merge Check App

```yaml
modules:
  bitbucket:mergeCheck:
    - key: code-quality-checks
      name: { value: 'Code Quality Suite' }
      description: { value: 'Comprehensive code quality checks' }
      function: comprehensiveMergeCheck
```

```javascript
export const comprehensiveMergeCheck = async (payload, context) => {
  console.log('Running comprehensive merge checks...');
  
  const results = [];
  
  // Run all checks and collect results
  try {
    results.push(await checkApprovals(payload));
  } catch (e) {
    results.push({ name: 'Approvals', status: 'error', message: e.message });
  }
  
  try {
    results.push(await checkCoverage(payload));
  } catch (e) {
    results.push({ name: 'Coverage', status: 'warning', message: e.message });
  }
  
  try {
    results.push(await checkBranchNaming(payload));
  } catch (e) {
    results.push({ name: 'Branch Naming', status: 'success', message: 'OK' });
  }
  
  // Determine overall status
  const hasFailures = results.some(r => r.status === 'failure');
  const failures = results.filter(r => r.status === 'failure');
  const warnings = results.filter(r => r.status === 'warning');
  
  if (hasFailures) {
    return {
      status: 'failure',
      name: { value: 'Code Quality Issues' },
      description: { 
        value: `${failures.length} failures, ${warnings.length} warnings` +
               `\n${failures.map(r => `❌ ${r.name}`).join('\n')}` +
               `\n${warnings.map(r => `⚠️ ${r.message}`).join('\n')}`
      }
    };
  }
  
  return {
    status: 'success',
    name: { value: 'Code Quality Passed' },
    description: { 
      value: `All ${results.length} checks passed` 
    }
  };
};

const checkApprovals = async (payload) => {
  const approvals = payload.pullRequest.reviewers.filter(r => r.approved).length;
  if (approvals >= 2) return { name: 'Approvals', status: 'success' };
  return { name: 'Approvals', status: 'failure', message: 'Need 2+ approvals' };
};

const checkCoverage = async (payload) => {
  // Your coverage checking logic
  return { name: 'Coverage', status: 'warning', message: 'No data available' };
};