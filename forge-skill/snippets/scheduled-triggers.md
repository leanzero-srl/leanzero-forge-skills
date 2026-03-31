# Scheduled Triggers Code Examples

This document provides code examples for implementing scheduled triggers in Atlassian Forge apps. Scheduled triggers execute your function at regular intervals (fiveMinute, hour, day, week).

## Table of Contents
1. [Basic Scheduled Trigger](#basic-scheduled-trigger)
2. [Multiple Schedule Intervals](#multiple-schedule-intervals)
3. [Accessing Execution Context](#accessing-execution-context)
4. [Common Use Cases](#common-use-cases)
5. [Error Handling](#error-handling)

---

## Basic Scheduled Trigger

### Manifest Configuration

```yaml
modules:
  scheduledTrigger:
    - key: daily-report-trigger
      name: { value: 'Daily Report Generator' }
      description: { value: 'Generates and sends daily activity report' }
      function: dailyReportFunction
      schedule:
        period: day
        time: '09:00'
```

### Function Implementation

```javascript
export const dailyReportFunction = async (event, context) => {
  console.log('Scheduled trigger executed:', event);
  
  // Get execution metadata
  const { scheduledTrigger } = event;
  console.log(`Running at: ${scheduledTrigger.timestamp}`);
  console.log(`Schedule period: ${scheduledTrigger.period}`);
  
  try {
    // Your scheduled logic here
    await generateAndSendReport();
    
    return {
      status: 'success',
      message: 'Daily report generated successfully'
    };
  } catch (error) {
    console.error('Error in scheduled trigger:', error);
    throw error;
  }
};

const generateAndSendReport = async () => {
  // Example: Get issues created today
  const response = await api.asApp().requestJira('/rest/api/3/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jql: 'created >= startOfDay()',
      maxResults: 50
    })
  });
  
  const data = await response.json();
  // Process and send report...
};
```

---

## Multiple Schedule Intervals

Configure multiple scheduled triggers in the same app:

```yaml
modules:
  scheduledTrigger:
    - key: hourly-check-trigger
      name: { value: 'Hourly Service Check' }
      description: { value: 'Checks service status every hour' }
      function: hourlyCheckFunction
      schedule:
        period: hour
        
    - key: daily-summary-trigger  
      name: { value: 'Daily Summary Email' }
      description: { value: 'Sends daily summary at 9 AM' }
      function: dailySummaryFunction
      schedule:
        period: day
        time: '09:00'
        
    - key: weekly-report-trigger
      name: { value: 'Weekly Analytics Report' }
      description: { value: 'Generates weekly analytics on Monday at 10 AM' }
      function: weeklyReportFunction
      schedule:
        period: week
        dayOfWeek: MONDAY
        time: '10:00'
```

### Corresponding Functions

```javascript
// Hourly check function
export const hourlyCheckFunction = async (event, context) => {
  console.log('Hourly service check started');
  
  // Example: Check external API status
  try {
    await checkExternalService();
    console.log('External service is operational');
  } catch (error) {
    // Alert on failure
    await notifyAdmin('External service failure detected');
  }
};

// Daily summary function
export const dailySummaryFunction = async (event, context) => {
  console.log('Daily summary generation started');
  
  // Gather data for summary
  const issues = await getIssuesCreatedToday();
  const comments = await getCommentsCreatedToday();
  const worklogs = await getWorklogsCreatedToday();
  
  // Send email summary
  await sendEmailSummary({
    issuesCount: issues.length,
    commentsCount: comments.length,
    worklogsCount: worklogs.length
  });
};

// Weekly report function
export const weeklyReportFunction = async (event, context) => {
  console.log('Weekly analytics report started');
  
  // Get weekly metrics
  const response = await api.asApp().requestJira('/rest/api/3/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jql: 'created >= startOfWeek()',
      maxResults: 0,
      fields: []
    })
  });
  
  const data = await response.json();
  console.log(`Total issues this week: ${data.total}`);
  
  // Generate analytics...
};
```

---

## Accessing Execution Context

The scheduled trigger event includes execution metadata:

```javascript
export const myScheduledFunction = async (event, context) => {
  console.log('Event received:', JSON.stringify(event, null, 2));
  
  // Scheduled trigger information
  const { 
    timestamp,        // ISO 8601 format timestamp
    period,           // 'hour', 'day', or 'week'
    dayOfWeek,        // 'MONDAY' through 'SUNDAY' (only for weekly)
    time              // Time of day in HH:MM format
  } = event.scheduledTrigger;
  
  console.log(`Execution time: ${timestamp}`);
  console.log(`Schedule: Every ${period}${dayOfWeek ? ` on ${dayOfWeek}` : ''} at ${time}`);
  
  // Context contains app information
  const { 
    cloudId,          // The Atlassian Cloud ID
    moduleKey         // The key of this trigger module
  } = context;
  
  console.log(`Cloud ID: ${cloudId}`);
  console.log(`Module Key: ${moduleKey}`);
  
  return { status: 'processed' };
};
```

---

## Common Use Cases

### 1. Sync Data with External System

```yaml
modules:
  scheduledTrigger:
    - key: external-sync-trigger
      name: { value: 'External System Sync' }
      description: { value: 'Syncs data with external CRM system daily' }
      function: syncWithCrm
      schedule:
        period: day
        time: '02:00'
```

```javascript
export const syncWithCrm = async (event, context) => {
  console.log('Starting CRM synchronization...');
  
  // Get issues that need to be synced
  const response = await api.asApp().requestJira('/rest/api/3/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jql: 'updated >= startOfDay(-1) AND project = PROJ',
      maxResults: 100,
      fields: ['key', 'summary', 'status', 'assignee']
    })
  });
  
  const data = await response.json();
  
  // Sync each issue with CRM
  for (const issue of data.issues) {
    try {
      await syncIssueToCrm(issue.key, issue.fields);
      console.log(`Synced issue: ${issue.key}`);
    } catch (error) {
      console.error(`Failed to sync ${issue.key}:`, error);
    }
  }
  
  return { status: 'synced', count: data.issues.length };
};

const syncIssueToCrm = async (issueKey, fields) => {
  // Implement CRM sync logic here
  // This is a placeholder for actual CRM API calls
};
```

### 2. Clean Up Old Data

```yaml
modules:
  scheduledTrigger:
    - key: cleanup-trigger
      name: { value: 'Data Cleanup' }
      description: { value: 'Cleans up old temporary data weekly' }
      function: cleanupOldData
      schedule:
        period: week
        dayOfWeek: SUNDAY
        time: '03:00'
```

```javascript
export const cleanupOldData = async (event, context) => {
  console.log('Starting cleanup process...');
  
  // Clean up old KVS entries
  await deleteOldKvsEntries(7); // Keep data for 7 days
  
  // Clean up comments older than 30 days
  await cleanUpOldComments();
  
  return { status: 'cleanup complete' };
};

const deleteOldKvsEntries = async (daysToKeep) => {
  const now = new Date().getTime();
  const cutoffTime = now - (daysToKeep * 24 * 60 * 60 * 1000);
  
  // Delete entries older than cutoff
  // Implement your KVS cleanup logic here
};

const cleanUpOldComments = async () => {
  // Find and delete comments older than 30 days
  const response = await api.asApp().requestJira('/rest/api/3/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jql: 'comment.created <= startOfDay(-30)',
      maxResults: 100,
      fields: ['key']
    })
  });
  
  // Process comments for deletion
};
```

### 3. Send Daily/Weekly Digest

```yaml
modules:
  scheduledTrigger:
    - key: digest-trigger
      name: { value: 'Daily Activity Digest' }
      description: { value: 'Sends daily activity digest at noon' }
      function: sendDailyDigest
      schedule:
        period: day
        time: '12:00'
```

```javascript
export const sendDailyDigest = async (event, context) => {
  console.log('Generating daily digest...');
  
  // Gather data for digest
  const [issues, comments, worklogs] = await Promise.all([
    getNewIssuesToday(),
    getNewCommentsToday(),
    getNewWorklogsToday()
  ]);
  
  // Build digest content
  const htmlContent = buildDigestHtml(issues, comments, worklogs);
  
  // Send to users
  await sendEmailToSubscribers(htmlContent);
};

const getNewIssuesToday = async () => {
  const response = await api.asApp().requestJira('/rest/api/3/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jql: 'created >= startOfDay() ORDER BY created DESC',
      maxResults: 50,
      fields: ['key', 'summary', 'issuetype', 'reporter']
    })
  });
  
  return (await response.json()).issues;
};

const getNewCommentsToday = async () => {
  // Get comments from today
  const response = await api.asApp().requestJira('/rest/api/3/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jql: 'comment.created >= startOfDay()',
      maxResults: 50,
      fields: ['key']
    })
  });
  
  return (await response.json()).issues.length;
};
```

---

## Error Handling

### Proper Error Handling Pattern

```javascript
export const robustScheduledFunction = async (event, context) => {
  console.log('Starting scheduled task...');
  
  try {
    // Your main logic
    await processTasks();
    
    return {
      status: 'success',
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    // Log detailed error information
    console.error('Scheduled trigger error:', {
      message: error.message,
      stack: error.stack,
      event: event.scheduledTrigger
    });
    
    // Send notification of failure
    try {
      await notifyAdminOfFailure(error);
    } catch (notificationError) {
      console.error('Notification failed:', notificationError);
    }
    
    throw error; // Re-throw to indicate failure
  }
};

const notifyAdminOfFailure = async (error) => {
  // Implement admin notification logic
  // This could send an email, Slack message, etc.
};
```

### Rate Limiting Considerations

```javascript
export const rateLimitedTrigger = async (event, context) => {
  const BATCH_SIZE = 50;
  
  // Process in batches to avoid rate limits
  for (let i = 0; i < totalItems; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    
    try {
      await processBatch(batch);
      
      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`Error processing batch starting at ${i}:`, error);
    }
  }
  
  return { status: 'completed' };
};
```

---

## Testing Scheduled Triggers

### Local Development Testing

```javascript
// Test file: test/scheduled-trigger.test.js

describe('Scheduled Trigger Tests', () => {
  it('should handle scheduled trigger events correctly', async () => {
    const mockEvent = {
      scheduledTrigger: {
        timestamp: '2024-01-15T09:00:00.000Z',
        period: 'day',
        time: '09:00'
      }
    };
    
    const context = {
      cloudId: 'test-cloud-id',
      moduleKey: 'test-trigger'
    };
    
    // Mock the API calls
    jest.mock('@forge/api', () => ({
      asApp: () => ({
        requestJira: jest.fn()
      })
    }));
    
    const result = await myScheduledFunction(mockEvent, context);
    
    expect(result.status).toBe('success');
  });
});
```

---

## Best Practices

1. **Use appropriate intervals** - Don't set triggers to run too frequently
2. **Handle errors gracefully** - Never let a scheduled trigger fail silently
3. **Monitor execution logs** - Check logs regularly for failures
4. **Rate limiting awareness** - Respect API rate limits when processing
5. **Test thoroughly** - Test with different scenarios before production deployment
6. **Keep it short** - Scheduled triggers should complete within the timeout
7. **Use context properly** - Leverage context for app-specific operations

---

## Related Documentation

- [Forge Scheduled Triggers](https://developer.atlassian.com/cloud/forge/application-structure/#scheduled-triggers)
- [Jira REST API Reference](../api-endpoints/jira-rest-api-v2.md)