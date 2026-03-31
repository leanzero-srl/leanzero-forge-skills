# Forge Resolver Patterns

This document provides comprehensive reference for the Forge Resolver pattern, which enables Custom UI apps to communicate with backend functions through a defined interface.

## Table of Contents
1. [Resolver Pattern Overview](#resolver-pattern-overview)
2. [Basic Setup](#basic-setup)
3. [Function Definitions](#function-definitions)
4. [Advanced Patterns](#advanced-patterns)
5. [Best Practices](#best-practices)

---

## Resolver Pattern Overview

### What is the Resolver?

The Forge Resolver pattern is a communication mechanism that:
- **Decouples** frontend UI from backend logic
- **Provides type safety** through defined interfaces
- **Enables testing** by allowing mock implementations
- **Simplifies maintenance** by centralizing API calls

### Architecture Diagram

```
┌─────────────────┐     Bridge API      ┌──────────────────┐
│   Custom UI     │◄────────────────────►│  Backend Funcs   │
│   (Frontend)    │     Resolver          │  (Serverless)    │
└─────────────────┘                       └──────────────────┘
         │                                                       
         ▼                                                       
┌──────────────────────────────────────────────────────────┐    
│                   Atlassian Platform                     │    
│                  (Jira, Confluence, etc.)                │    
└──────────────────────────────────────────────────────────┘    
```

### When to Use Resolver

| Scenario | Use Resolver? |
|----------|---------------|
| Simple API calls from UI | Yes |
| Complex business logic | Yes |
| Multiple related API calls | Yes |
| UI configuration management | Yes |
| Event handling from backend | Yes |

---

## Basic Setup

### 1. Define Functions in Backend

```javascript
// src/functions.js

export const fetchData = async (payload, context) => {
  // This function runs on Atlassian's serverless infrastructure
  console.log('Fetching data...');
  
  // Make authenticated API calls
  const response = await api.asApp().requestJira('/rest/api/3/myself');
  const user = await response.json();
  
  return {
    user: user,
    timestamp: new Date().toISOString()
  };
};

export const processIssue = async (payload, context) => {
  const { issueKey, action } = payload;
  
  // Validate input
  if (!issueKey || !action) {
    throw new Error('Missing required parameters');
  }
  
  // Process the issue based on action
  switch (action) {
    case 'approve':
      return await approveIssue(issueKey);
    case 'reject':
      return await rejectIssue(issueKey);
    default:
      throw new Error(`Unknown action: ${action}`);
  }
};

// Helper functions
const approveIssue = async (issueKey) => {
  // Logic to approve an issue
  return { success: true, message: 'Issue approved' };
};

const rejectIssue = async (issueKey) => {
  // Logic to reject an issue
  return { success: true, message: 'Issue rejected' };
};
```

### 2. Configure the Resolver

```javascript
// src/resolver.js

import Resolver from '@forge/resolver';

const resolver = new Resolver();

// Define your functions
resolver.define('fetchData', fetchData);
resolver.define('processIssue', processIssue);

// Export the handler
export const handler = resolver.getDefinitions();
```

### 3. Use in Custom UI

```javascript
// src/CustomApp.js

import React, { useState, useEffect } from 'react';
import { bridge } from '@forge/bridge';

function CustomApp() {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch data using resolver
  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        
        // Call the resolver function
        const result = await bridge.invoke('fetchData');
        
        setData(result);
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadData();
  }, []);

  return (
    <div>
      {isLoading ? (
        <p>Loading...</p>
      ) : (
        <pre>{JSON.stringify(data, null, 2)}</pre>
      )}
    </div>
  );
}

export default CustomApp;
```

---

## Function Definitions

### Input Payload Structure

```javascript
// Resolver function signature
const myFunction = async ({ 
  payload,   // Data sent from frontend
  parameters // Additional configuration
}, context) => {
  // Your logic here
  
  return {
    result: 'success',
    data: yourData,
    message: 'Operation completed'
  };
};
```

### Payload Types

```javascript
// Simple string/number payload
await bridge.invoke('processIssue', { 
  payload: 'SVC-123' 
});

// Object payload with nested structure
await bridge.invoke('updateUserPreferences', {
  payload: {
    theme: 'dark',
    notifications: {
      email: true,
      push: false
    },
    language: 'en'
  }
});

// Payload with configuration parameters
await bridge.invoke('searchIssues', {
  payload: {
    jql: 'project = PROJ AND status = Open',
    maxResults: 50
  },
  parameters: {
    timeout: 10000, // Custom parameter for your logic
    includeHistory: true
  }
});
```

### Return Values

```javascript
// Basic success response
export const simpleResponse = async ({ payload }, context) => {
  return {
    success: true,
    data: payload.value * 2
  };
};

// Complex response with metadata
export const complexResponse = async ({ payload }, context) => {
  return {
    success: true,
    data: {
      items: [],
      total: 0,
      page: 1
    },
    meta: {
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    }
  };
};

// Error response pattern
export const errorResponse = async ({ payload }, context) => {
  try {
    // Your logic
    return { success: true, data: result };
  } catch (error) {
    console.error('Function error:', error);
    
    return {
      success: false,
      error: {
        code: error.code || 'INTERNAL_ERROR',
        message: error.message,
        details: error.details || null
      }
    };
  }
};
```

### Async/Await Patterns

```javascript
// Sequential async operations
export const sequentialOperations = async ({ payload }, context) => {
  // Step 1: Fetch user data
  const userData = await api.asApp().requestJira(
    `/rest/api/3/user?accountId=${payload.accountId}`
  );
  
  // Step 2: Fetch user projects
  const projectsResponse = await api.asApp().requestJira(
    '/rest/api/3/project'
  );
  
  // Step 3: Return combined data
  return {
    user: await userData.json(),
    projects: await projectsResponse.json()
  };
};

// Parallel async operations
export const parallelOperations = async ({ payload }, context) => {
  // Run multiple API calls simultaneously
  const [userResponse, projectResponse] = await Promise.all([
    api.asApp().requestJira('/rest/api/3/myself'),
    api.asApp().requestJira('/rest/api/3/projects')
  ]);
  
  return {
    user: await userResponse.json(),
    projects: await projectResponse.json()
  };
};
```

---

## Advanced Patterns

### Input Validation

```javascript
// Helper for validation
const validatePayload = (payload, requiredFields) => {
  const missingFields = requiredFields.filter(field => !(field in payload));
  
  if (missingFields.length > 0) {
    throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
  }
  
  return true;
};

// Resolver function with validation
export const createUser = async ({ payload }, context) => {
  // Validate input
  validatePayload(payload, ['name', 'email', 'password']);
  
  // Type checking
  if (typeof payload.name !== 'string') {
    throw new Error('Name must be a string');
  }
  
  if (!payload.email.includes('@')) {
    throw new Error('Invalid email format');
  }
  
  if (payload.password.length < 8) {
    throw new Error('Password must be at least 8 characters');
  }
  
  // Process the valid payload
  return { success: true, userId: Date.now() };
};
```

### Error Handling and Retry Logic

```javascript
// Retry mechanism for flaky API calls
export const robustApiCall = async ({ payload }, context) => {
  const maxRetries = 3;
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await api.asApp().requestJira(payload.endpoint);
    } catch (error) {
      lastError = error;
      
      // Only retry on network errors or rate limits
      if (attempt < maxRetries && 
          (error.code === 'ECONNRESET' || 
           error.status === 429)) {
        await new Promise(resolve => 
          setTimeout(resolve, 1000 * attempt) // Exponential backoff
        );
      } else {
        break; // Don't retry on other errors
      }
    }
  }
  
  throw lastError;
};

// Custom error class
class ResolverError extends Error {
  constructor(message, code, httpStatus = 500) {
    super(message);
    this.name = 'ResolverError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export const handleError = async ({ payload }, context) => {
  try {
    // Your logic
    return { success: true, data: result };
  } catch (error) {
    if (error instanceof ResolverError) {
      return {
        success: false,
        error: {
          code: error.code,
          message: error.message,
          httpStatus: error.httpStatus
        }
      };
    }
    
    // Re-throw unexpected errors
    throw error;
  }
};
```

### Caching

```javascript
// Simple in-memory cache (note: for production, use KV Store)
let dataCache = {};
const CACHE_TTL = 60000; // 1 minute

export const getCachedData = async ({ payload }, context) => {
  const { key } = payload;
  
  // Check if we have valid cached data
  if (dataCache[key] && 
      Date.now() - dataCache[key].timestamp < CACHE_TTL) {
    console.log('Using cache for:', key);
    return dataCache[key].data;
  }
  
  // Fetch fresh data
  const response = await api.asApp().requestJira(
    `/rest/api/3/${key}`
  );
  
  const data = await response.json();
  
  // Cache the result
  dataCache[key] = {
    data: data,
    timestamp: Date.now()
  };
  
  return data;
};

// Clear cache helper
export const clearCache = async ({ payload }, context) => {
  if (payload.key) {
    delete dataCache[payload.key];
    return { success: true, message: `Cleared ${payload.key}` };
  } else {
    dataCache = {};
    return { success: true, message: 'Cache cleared' };
  }
};
```

### Authentication and Authorization

```javascript
// Check if user has required permission
const checkPermission = (context, permission) => {
  // Access context for user information
  const { accountId, accountType } = context;
  
  // Example permission logic
  switch (permission) {
    case 'ADMIN':
      return accountType === 'licensed';
    case 'PROJECT_MEMBER':
      // More complex logic to check project membership
      return ['licensed', 'customer'].includes(accountType);
    default:
      return true; // Allow by default for unknown permissions
  }
};

// Protected resolver function
export const adminOnlyOperation = async ({ payload }, context) => {
  if (!checkPermission(context, 'ADMIN')) {
    throw new ResolverError(
      'Admin access required',
      'PERMISSION_DENIED',
      403
    );
  }
  
  return { success: true, data: performAdminAction(payload) };
};

export const projectMemberOperation = async ({ payload }, context) => {
  if (!checkPermission(context, 'PROJECT_MEMBER')) {
    throw new ResolverError(
      'Project member access required',
      'PERMISSION_DENIED',
      403
    );
  }
  
  return { success: true, data: performProjectAction(payload) };
};
```

### Transaction Management

```javascript
// Database transaction pattern (conceptual)
let activeTransaction = null;

export const startTransaction = async ({ payload }, context) => {
  // Begin a new transaction
  activeTransaction = {
    id: `txn-${Date.now()}`,
    operations: [],
    createdAt: Date.now()
  };
  
  return { transactionId: activeTransaction.id };
};

export const addToTransaction = async ({ payload }, context) => {
  if (!activeTransaction) {
    throw new ResolverError(
      'No active transaction',
      'NO_TRANSACTION',
      400
    );
  }
  
  // Validate and add operation to transaction
  activeTransaction.operations.push({
    id: `op-${Date.now()}`,
    type: payload.type,
    data: payload.data,
    timestamp: Date.now()
  });
  
  return { success: true, operationCount: activeTransaction.operations.length };
};

export const commitTransaction = async ({ payload }, context) => {
  if (!activeTransaction) {
    throw new ResolverError(
      'No active transaction',
      'NO_TRANSACTION',
      400
    );
  }
  
  try {
    // Commit all operations
    for (const operation of activeTransaction.operations) {
      await executeOperation(operation);
    }
    
    const result = { 
      transactionId: activeTransaction.id,
      committedOperations: activeTransaction.operations.length
    };
    
    // Clear the transaction
    activeTransaction = null;
    
    return result;
  } catch (error) {
    console.error('Transaction commit failed:', error);
    throw error;
  }
};

export const rollbackTransaction = async ({ payload }, context) => {
  if (!activeTransaction) {
    return { success: true, message: 'No transaction to rollback' };
  }
  
  activeTransaction = null;
  return { 
    success: true, 
    rolledBackOperations: payload.force ? 'all' : activeTransaction.operations.length 
  };
};
```

---

## Best Practices

### 1. Error Handling
- Always include error handling in your resolver functions
- Use try-catch blocks around API calls
- Return meaningful error messages to the frontend
- Log errors for debugging

### 2. Input Validation
- Validate all inputs before processing
- Check types and required fields
- Provide clear error messages for invalid inputs

### 3. Performance Optimization
- Use Promise.all() for independent API calls
- Implement caching for expensive operations
- Consider pagination for large datasets

### 4. Security
- Check user permissions before sensitive operations
- Sanitize user inputs to prevent injection attacks
- Use HTTPS for all external API calls

### 5. Testing
- Test resolver functions with mock payloads
- Verify error handling paths
- Test with valid and invalid input combinations

## Related Documentation

- [Bridge API Reference](./15-bridge-api-reference.md)
- [UI Kit Components](./17-ui-kit-components.md)