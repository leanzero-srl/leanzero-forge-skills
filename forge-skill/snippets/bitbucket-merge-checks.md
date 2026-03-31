# Bitbucket Merge Checks Code Examples

This document provides code examples for implementing custom merge checks in Atlassian Forge apps. Merge checks validate pull requests before merging to ensure code quality and compliance.

## Table of Contents
1. [Basic Merge Check](#basic-merge-check)
2. [Success/Failure Configuration](#successfailure-configuration)
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
  const { pullRequest, actor } = payload;
  const { id: pullRequestId, toRef, fromRef, title } = pullRequest;
  
  console.log(`PR #${pullRequestId}: ${title}`);
  console.log(`From: ${fromRef.id} -> To: ${toRef.id}`);
  
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
  const response = await api.asApp().requestJira(
    `/rest/pull-requests/${pullRequest.id}/approvals`,
    { method: 'GET' }
  );
  
  const data = await response.json();
  
  // Check if we have enough approvals
  return data.approvals.length >= 2;
};
```

---

## Success/Failure Configuration

The merge check can return either success or failure:

```javascript
// Successful validation
return {
  status: 'success',
  name: { value: 'Build Status' },
  description: { 
    value: 'All CI checks passed. Ready to merge.' 
  }
};

// Failed validation
return {
  status: 'failure',
  name: { value: 'Code Review Required' },
  description: { 
    value: 'This PR needs code review before merging' 
  }
};
```

---

## Accessing Pull Request Context

The pull request payload contains comprehensive information:

```javascript
export const detailedContextFunction = async (payload, context) => {
  console.log('Full payload:', JSON.stringify(payload, null, 2));
  
  // Pull request information
  const { pullRequest } = payload;
  const { 
    id,                // PR ID
    title,
    description,
    state,
    createdDate,
    updatedDate,
    closedDate
  } = pullRequest;
  
  // Reference information
  const { fromRef, toRef } = pullRequest;
  console.log(`Branch: ${fromRef.displayId} -> ${toRef.displayId}`);
  
  // Actor information
  const { actor } = payload;
  const { 
    accountId,
    displayName,
    email,
    active
  } = actor;
  
  console.log(`Actor: ${displayName} (${accountId})`);
  
  // Repository information
  const { repository } = payload;
  const { 
    slug,              // Repository slug
    project,           // Project key
    name               // Repository name
  } = repository;
  
  console.log(`Repo: ${project}/${slug}`);
  
  return {
    status: 'success',
    message: 'Context processed successfully'
  };
};
```

---

## Common Use Cases

### 1. Require Test Coverage

```yaml
modules:
  bitbucket:mergeCheck:
    - key: test-coverage-check
      name: { value: 'Test Coverage' }
      description: { value: 'Ensures minimum test coverage' }
      function: testCoverageCheckFunction
```

```javascript
export const testCoverageCheckFunction = async (payload, context) => {
  console.log('Checking test coverage...');
  
  const { pullRequest } = payload;
  
  // Get changed files
  const changedFiles = await getChangedFiles(pullRequest);
  
  if (changedFiles.length === 0) {
    return {
      status: 'success',
      name: { value: 'No Changes' },
      description: { value: 'No files were modified in this PR' }
    };
  }
  
  // Check if tests were modified
  const testFiles = changedFiles.filter(file => 
    file.path.includes('test') || 
    file.path.includes('__tests__')
  );
  
  if (testFiles.length === 0) {
    return {
      status: 'failure',
      name: { value: 'Missing Tests' },
      description: { 
        value: 'This PR modifies code without updating tests' 
      }
    };
  }
  
  // Check coverage report
  const coverageReport = await getCoverageReport(pullRequest);
  
  if (coverageReport.lineCoverage < 80) {
    return {
      status: 'failure',
      name: { value: 'Low Coverage' },
      description: { 
        value: `Current coverage is ${coverageReport.lineCoverage}%. Minimum required: 80%` 
      }
    };
  }
  
  return {
    status: 'success',
    name: { value: 'Test Coverage OK' },
    description: { 
      value: `Coverage is ${coverageReport.lineCoverage}%` 
    }
  };
};

const getChangedFiles = async (pullRequest) => {
  const response = await api.asApp().requestJira(
    `/rest/api/1.0/projects/${payload.repository.project.key}/repos/${payload.repository.slug}/compare/changes?context=${pullRequest.fromRef.id}&since=${pullRequest.toRef.id}`,
    { method: 'GET' }
  );
  
  const data = await response.json();
  return data.values || [];
};

const getCoverageReport = async (pullRequest) => {
  // This would fetch from your CI system
  // Implementation depends on your testing infrastructure
  return {
    lineCoverage: 85,
    branchCoverage: 78,
    testsPassed: 120,
    testsFailed: 3
  };
};
```

### 2. Branch Naming Convention

```yaml
modules:
  bitbucket:mergeCheck:
    - key: branch-naming-check
      name: { value: 'Branch Naming' }
      description: { value: 'Enforces branch naming conventions' }
      function: branchNamingCheckFunction
```

```javascript
export const branchNamingCheckFunction = async (payload, context) => {
  console.log('Checking branch naming convention...');
  
  const { pullRequest } = payload;
  const branchName = pullRequest.fromRef.displayId;
  
  // Define allowed patterns
  const allowedPatterns = [
    /^feature\/[a-z0-9-]+$/,           // feature/branch-name
    /^bugfix\/[a-z0-9-]+$/,             // bugfix/issue-number
    /^hotfix\/[a-z0-9-]+$/,             // hotfix/critical-fix
    /^release\/v?\d+\.\d+\.\d+$/,       // release/v1.2.3 or release/1.2.3
    /^develop$/,                        // develop branch
    /^main$/                            // main/master branch (for updates)
  ];
  
  const isValid = allowedPatterns.some(pattern => 
    pattern.test(branchName)
  );
  
  if (!isValid) {
    return {
      status: 'failure',
      name: { value: 'Invalid Branch Name' },
      description: { 
        value: `Branch name "${branchName}" doesn't follow naming convention`,
        html: `<p>Valid patterns:</p>
               <ul>
                 <li><code>feature/issue-number</code></li>
                 <li><code>bugfix/JIRA-123</code></li>
                 <li><code>release/v1.2.3</code></li>
                 <li><code>develop/main</code></li>
               </ul>`
      }
    };
  }
  
  return {
    status: 'success',
    name: { value: 'Branch Name OK' },
    description: { 
      value: `Branch "${branchName}" follows naming convention` 
    }
  };
};
```

### 3. Pull Request Size Limit

```yaml
modules:
  bitbucket:mergeCheck:
    - key: pr-size-check
      name: { value: 'PR Size Limit' }
      description: { value: 'Limits PR size to encourage small changes' }
      function: prSizeCheckFunction
```

```javascript
export const prSizeCheckFunction = async (payload, context) => {
  console.log('Checking pull request size...');
  
  const { pullRequest } = payload;
  
  // Get PR statistics
  const response = await api.asApp().requestJira(
    `/rest/api/1.0/projects/${payload.repository.project.key}/repos/${payload.repository.slug}/pull-requests/${pullRequest.id}/stat`,
    { method: 'GET' }
  );
  
  const stats = await response.json();
  
  // Define limits
  const MAX_FILES = 50;
  const MAX_LINES_CHANGED = 500;
  
  const fileCount = stats.files?.length || 0;
  const linesAdded = stats.linesAdded || 0;
  const linesRemoved = stats.linesRemoved || 0;
  const totalChanged = linesAdded + linesRemoved;
  
  // Check if PR is too large
  if (fileCount > MAX_FILES) {
    return {
      status: 'failure',
      name: { value: 'PR Too Large' },
      description: { 
        value: `This PR modifies ${fileCount} files. Maximum allowed: ${MAX_FILES}` 
      }
    };
  }
  
  if (totalChanged > MAX_LINES_CHANGED) {
    return {
      status: 'failure',
      name: { value: 'Too Many Changes' },
      description: { 
        value: `This PR changes ${totalChanged} lines. Maximum allowed: ${MAX_LINES_CHANGED}` 
      }
    };
  }
  
  return {
    status: 'success',
    name: { value: 'PR Size OK' },
    description: { 
      value: `${fileCount} files, ${totalChanged} lines changed` 
    }
  };
};
```

---

## Error Handling

### Comprehensive Error Handling

```javascript
export const robustMergeCheck = async (payload, context) => {
  console.log('Starting merge check...');
  
  try {
    // Validate payload
    if (!payload?.pullRequest?.id) {
      throw new Error('Invalid payload: Missing pull request ID');
    }
    
    // Check repository access
    await validateRepositoryAccess(payload.repository);
    
    // Perform validation
    const result = await performCheck(payload.pullRequest);
    
    return result;
  } catch (error) {
    console.error('Merge check error:', {
      message: error.message,
      stack: error.stack,
      pullRequestId: payload?.pullRequest?.id
    });
    
    // Handle specific errors
    if (error.code === 'ETIMEDOUT') {
      return {
        status: 'failure',
        name: { value: 'Timeout' },
        description: { 
          value: 'Merge check timed out. Please try again later.' 
        }
      };
    }
    
    // Re-throw for unexpected errors
    throw error;
  }
};

const validateRepositoryAccess = async (repository) => {
  // Verify the app has access to this repository
  const response = await api.asApp().requestJira(
    `/rest/api/1.0/projects/${repository.project.key}/repos/${repository.slug}`,
    { method: 'GET' }
  );
  
  if (!response.ok) {
    throw new Error('Repository not accessible');
  }
};
```

### Handling Timeouts

```javascript
export const timedMergeCheck = async (payload, context) => {
  const TIMEOUT_MS = 10000; // 10 second timeout
  
  try {
    const result = await Promise.race([
      performComplexCheck(payload),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), TIMEOUT_MS)
      )
    ]);
    
    return result;
  } catch (error) {
    if (error.message === 'Timeout') {
      return {
        status: 'pending',
        name: { value: 'Checking...' },
        description: { 
          value: 'Merge check is still running. Please wait.' 
        }
      };
    }
    
    throw error;
  }
};
```

---

## Best Practices

1. **Keep checks fast** - Merge checks should complete quickly
2. **Provide clear messages** - Users need to understand what needs fixing
3. **Handle edge cases** - Handle empty PRs, large PRs gracefully
4. **Cache when possible** - Avoid redundant API calls
5. **Fail gracefully** - Don't block merges on transient errors

---

## Related Documentation

- [Forge Merge Checks](https://developer.atlassian.com/cloud/forge/application-structure/#merge-checks)
- [Bitbucket REST API](../api-endpoints/bitbucket-rest-api.md)

---

## Example Complete Implementation

```javascript
// main.js

import api from '@forge/api';

export const myMergeCheck = async (payload, context) => {
  console.log('Starting custom merge check...');
  
  try {
    // Validate input
    if (!payload?.pullRequest) {
      throw new Error('Invalid payload');
    }
    
    const { pullRequest } = payload;
    
    // Your validation logic here
    const isValid = await validatePullRequest(pullRequest);
    
    return isValid 
      ? {
          status: 'success',
          name: { value: 'Validation Passed' },
          description: { value: 'All checks passed!' }
        }
      : {
          status: 'failure',
          name: { value: 'Validation Failed' },
          description: { value: 'Please fix the issues below...' }
        };
  } catch (error) {
    console.error('Merge check error:', error);
    
    return {
      status: 'pending',
      name: { value: 'In Progress' },
      description: { 
        value: `Error during validation: ${error.message}` 
      }
    };
  }
};

const validatePullRequest = async (pullRequest) => {
  // Implement your validation logic here
  return true;
};