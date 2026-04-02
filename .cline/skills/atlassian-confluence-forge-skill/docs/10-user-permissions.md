# User Permissions: Confluence Forge Apps

This guide covers working with users, groups, and permissions in Confluence Forge applications.

---

## Overview

Confluence provides several APIs for:
- Getting current user information
- Checking user permissions on content
- Listing users in a space
- Verifying group membership

---

## Key Concepts

| Concept | Description |
|---------|-------------|
| **Account ID** | Unique identifier for a user across Atlassian products |
| **Permission** | Ability to perform an action (view, edit, delete) |
| **Space Permission** | Permission at space level |
| **Content Permission** | Permission on specific content |

---

## Getting Current User Info

### Get Current User Account ID

```javascript
// src/utils/user.js
import { AP } from '@forge/bridge';

export function getCurrentUserId() {
  return AP.context.getUserId();
}

// Usage
const userId = getCurrentUserId();
console.log(`Current user: ${userId}`);
```

### Get Current User Details

```javascript
import { route } from '@forge/api';
import { requestConfluence } from '@forge/bridge';

export async function getCurrentUserDetails() {
  const token = await AP.context.getToken();
  const userId = AP.context.getUserId();

  const response = await requestConfluence(
    route`/wiki/api/v2/users/${userId}`
  );

  if (!response.ok) throw new Error('Failed to get user');

  return await response.json();
}

// Usage
const user = await getCurrentUserDetails();
console.log(`${user.displayName} (${user.email})`);
```

### Get User Display Name

```javascript
export function getUserDisplayName() {
  const displayName = AP.context.getUserDisplayName();
  return displayName || 'Unknown';
}

// Usage in React component
function UserProfile() {
  return <div>Logged in as: {getUserDisplayName()}</div>;
}
```

---

## Checking Permissions

### Check if User Can View Page

```javascript
import { route } from '@forge/api';
import { requestConfluence } from '@forge/bridge';

export async function canViewPage(pageId) {
  const token = await AP.context.getToken();
  
  // Make a lightweight check request
  try {
    const response = await requestConfluence(
      route`/wiki/api/v2/pages/${pageId}?expand=permissions`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    return response.ok;
  } catch (error) {
    if (error.message.includes('403')) {
      return false; // Forbidden
    }
    throw error;
  }
}

// Usage
if (await canViewPage(pageId)) {
  // Show content
} else {
  // Show "access denied" message
}
```

### Check if User Can Edit Page

```javascript
export async function canEditPage(pageId) {
  const token = await AP.context.getToken();
  
  try {
    // Try to get edit metadata
    const response = await requestConfluence(
      route`/wiki/api/v2/pages/${pageId}?expand=operations`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!response.ok) return false;

    const data = await response.json();
    
    // Check if edit operation is available
    return data.operations?.editable || false;
  } catch (error) {
    return false;
  }
}

// Usage in UI
function EditButton({ pageId }) {
  const [canEdit, setCanEdit] = useState(false);

  useEffect(() => {
    canEditPage(pageId).then(setCanEdit);
  }, [pageId]);

  if (!canEdit) return null;

  return <button>Edit Page</button>;
}
```

### Check Space Permissions

```javascript
export async function hasSpacePermission(spaceKey, permissionType) {
  const token = await AP.context.getToken();
  
  // Get space details to check permissions
  const response = await requestConfluence(
    route`/wiki/api/v2/spaces/${spaceKey}?expand=permissions`
  );

  if (!response.ok) return false;

  const data = await response.json();

  // Check for specific permission type
  const permissions = data.permissions || [];
  
  return permissions.some(p => {
    if (p.type === permissionType && p.globalPermission === true) {
      return true;
    }
    
    // Check space-specific permissions
    if (p.spacePermissions?.some(sp => sp.name === permissionType)) {
      return true;
    }
    
    return false;
  });
}

// Usage
const canAdmin = await hasSpacePermission('PROJ', 'administer');
```

### Comprehensive Permission Checker

```javascript
export class PermissionChecker {
  constructor() {}

  async _getPermissions(pageId) {
    const token = await AP.context.getToken();
    
    try {
      const response = await requestConfluence(
        route`/wiki/api/v2/pages/${pageId}?expand=permissions`
      );
      
      if (!response.ok) return null;
      return await response.json();
    } catch (error) {
      console.error('Error getting permissions:', error);
      return null;
    }
  }

  async canView(pageId) {
    const perms = await this._getPermissions(pageId);
    return !!perms && !perms.status?.includes('restricted');
  }

  async canEdit(pageId) {
    const perms = await this._getPermissions(pageId);
    
    if (!perms) return false;
    
    // Check operations
    if (perms.operations?.editable === true) return true;
    
    // Check permissions array
    return perms.permissions?.some(p => 
      p.type === 'edit' && p.globalPermission !== false
    );
  }

  async canDelete(pageId) {
    const perms = await this._getPermissions(pageId);
    
    if (!perms) return false;
    
    if (perms.operations?.deletable === true) return true;
    
    return perms.permissions?.some(p => 
      p.type === 'delete' && p.globalPermission !== false
    );
  }

  async canSetPermissions(pageId) {
    const perms = await this._getPermissions(pageId);
    
    if (!perms) return false;
    
    // Check for admin or manage permissions permission
    return perms.permissions?.some(p => 
      ['administer', 'manage'].includes(p.type)
    );
  }

  async canComment(pageId) {
    const perms = await this._getPermissions(pageId);
    
    if (!perms) return false;
    
    // Check for comment permissions
    return perms.permissions?.some(p => 
      p.type === 'comment' || p.type === 'add'
    );
  }
}

export const permissionChecker = new PermissionChecker();
```

---

## User & Group Operations

### Get Space Users

```javascript
import { route } from '@forge/api';
import { requestConfluence } from '@forge/bridge';

export async function getSpaceUsers(spaceKey, options = {}) {
  const token = await AP.context.getToken();
  
  const {
    start = 0,
    limit = 25,
    expand = 'user'
  } = options;

  const response = await requestConfluence(
    route`/wiki/api/v2/spaces/${spaceKey}/users?start=${start}&limit=${limit}&expand=${expand}`
  );

  if (!response.ok) throw new Error('Failed to get space users');

  const data = await response.json();
  
  return {
    users: data.results || [],
    start: data.start,
    limit: data.limit,
    size: data.size,
    next: data._links?.next
  };
}

// Usage - Get first 25 users
const result = await getSpaceUsers('PROJ');
console.log(result.users.length, 'users found');

// Usage - Iterate through all users with pagination
async function getAllSpaceUsers(spaceKey) {
  let start = 0;
  const allUsers = [];

  do {
    const result = await getSpaceUsers(spaceKey, { start, limit: 100 });
    allUsers.push(...(result.users || []));
    
    if (!result.next) break;
    
    // Parse next URL to get start parameter
    const url = new URL(result.next);
    start = parseInt(url.searchParams.get('start'), 10);
  } while (true);

  return allUsers;
}
```

### Check User Group Membership

```javascript
export async function userInGroup(accountId, groupName) {
  const token = await AP.context.getToken();
  
  try {
    // Get user's groups
    const response = await requestConfluence(
      route`/wiki/api/v2/users/${accountId}/groups`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!response.ok) return false;

    const data = await response.json();
    
    return (data.results || []).some(g => g.name === groupName);
  } catch (error) {
    console.error('Error checking group membership:', error);
    return false;
  }
}

// Usage
const isAdmin = await userInGroup(userId, 'confluence-administrators');
```

### Get Users in a Group

```javascript
export async function getGroupUsers(groupName, options = {}) {
  const token = await AP.context.getToken();
  
  const { start = 0, limit = 25 } = options;

  try {
    const response = await requestConfluence(
      route`/wiki/api/v2/groups/${encodeURIComponent(groupName)}/members?start=${start}&limit=${limit}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!response.ok) return null;

    const data = await response.json();
    
    return {
      users: data.results || [],
      start: data.start,
      limit: data.limit,
      size: data.size
    };
  } catch (error) {
    console.error('Error getting group members:', error);
    return null;
  }
}

// Usage
const admins = await getGroupUsers('confluence-administrators');
```

---

## Permission UI Components

### Permission-Based Conditional Rendering

```jsx
// src/components/ConditionalContent.jsx
import React, { useState, useEffect } from 'react';
import { permissionChecker } from '../utils/permissions';

export function ConditionalContent({ pageId, children }) {
  const [canView, setCanView] = useState(null);

  useEffect(() => {
    async function checkPermission() {
      try {
        setCanView(await permissionChecker.canView(pageId));
      } catch (error) {
        console.error('Permission check failed:', error);
        setCanView(false);
      }
    }

    if (pageId) {
      checkPermission();
    }
  }, [pageId]);

  if (canView === null) {
    return <div>Loading...</div>;
  }

  if (!canView) {
    return (
      <div style={{ padding: '20px', color: '#6b7280' }}>
        You don't have permission to view this content.
      </div>
    );
  }

  return children;
}

// Usage
<ConditionalContent pageId={pageId}>
  <div>This is protected content</div>
</ConditionalContent>
```

### Permission-Based Action Menu

```jsx
// src/components/ActionMenu.jsx
import React, { useState, useEffect } from 'react';
import Button from '@atlaskit/button';
import DropdownMenu, {
  Item,
  Section,
  Divider
} from '@atlaskit/dropdown-menu';

export function ActionMenu({ pageId }) {
  const [permissions, setPermissions] = useState({
    canEdit: false,
    canDelete: false,
    canComment: false
  });

  useEffect(() => {
    async function checkPermissions() {
      setPermissions({
        canEdit: await permissionChecker.canEdit(pageId),
        canDelete: await permissionChecker.canDelete(pageId),
        canComment: await permissionChecker.canComment(pageId)
      });
    }

    checkPermissions();
  }, [pageId]);

  if (!Object.values(permissions).some(p => p)) {
    return null; // No permissions to show
  }

  const handleEdit = () => {
    window.location.href = `/wiki/spaces/PROJ/pages/${pageId}/edit`;
  };

  const handleDelete = async () => {
    if (window.confirm('Are you sure?')) {
      try {
        await permissionChecker.deletePage(pageId);
        // Redirect to home or show success message
      } catch (error) {
        alert('Failed to delete page');
      }
    }
  };

  return (
    <DropdownMenu trigger={<Button>Actions</Button>} placement="bottom-right">
      {permissions.canEdit && (
        <Item onClick={handleEdit}>Edit Page</Item>
      )}
      
      {permissions.canComment && (
        <Item onClick={() => console.log('Add comment')}>
          Add Comment
        </Item>
      )}
      
      {permissions.canDelete && (
        <>
          <Divider />
          <Section>
            <Item onClick={handleDelete} appearance="danger">
              Delete Page
            </Item>
          </Section>
        </>
      )}
    </DropdownMenu>
  );
}
```

### User Avatar Component

```jsx
// src/components/UserAvatar.jsx
import React, { useState, useEffect } from 'react';

export function UserAvatar({ userId }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchUser() {
      try {
        const token = await AP.context.getToken();
        
        const response = await fetch(
          `/wiki/api/v2/users/${userId}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (response.ok) {
          setUser(await response.json());
        }
      } catch (error) {
        console.error('Failed to fetch user:', error);
      } finally {
        setLoading(false);
      }
    }

    if (userId) {
      fetchUser();
    }
  }, [userId]);

  if (loading) {
    return <div style={{ width: '32px', height: '32px' }}>...</div>;
  }

  if (!user) {
    return (
      <div 
        style={{
          width: '32px',
          height: '32px',
          borderRadius: '50%',
          backgroundColor: '#dee3e8',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        ?
      </div>
    );
  }

  return (
    <div 
      style={{
        width: '32px',
        height: '32px',
        borderRadius: '50%',
        backgroundColor: '#172b4d',
        color: 'white',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '12px'
      }}
    >
      {user.displayName.charAt(0).toUpperCase()}
    </div>
  );
}

// Usage
<UserAvatar userId={userId} />
```

---

## Best Practices

### 1. Always Check Permissions Before Actions

```javascript
// Bad - User might get error if they don't have permission
await api.fetch(...); // Direct API call

// Good - Check first
if (await canEditPage(pageId)) {
  await api.fetch(...);
}
```

### 2. Handle Missing Permissions Gracefully

```jsx
function EditButton({ pageId }) {
  const [canEdit, setCanEdit] = useState(false);

  useEffect(() => {
    canEditPage(pageId).then(setCanEdit).catch(() => setCanEdit(false));
  }, [pageId]);

  if (!canEdit) return null;

  return <button onClick={handleEdit}>Edit</button>;
}
```

### 3. Cache Permission Checks

```javascript
const permissionCache = new Map();

export async function getCachedPermission(pageId, checkFn) {
  const cacheKey = `${pageId}-${checkFn.name}`;
  
  if (permissionCache.has(cacheKey)) {
    return permissionCache.get(cacheKey);
  }

  const result = await checkFn(pageId);
  permissionCache.set(cacheKey, result);
  
  // Clear cache on page refresh
  window.addEventListener('beforeunload', () => permissionCache.clear());
  
  return result;
}
```

### 4. Use Permission-Based Layouts

```jsx
function PageLayout({ pageId }) {
  const [permissions, setPermissions] = useState(null);

  useEffect(() => {
    Promise.all([
      canViewPage(pageId),
      canEditPage(pageId),
      canDeletePage(pageId)
    ]).then(([view, edit, del]) => {
      setPermissions({ view, edit, delete: del });
    });
  }, [pageId]);

  if (!permissions?.view) {
    return <UnauthorizedMessage />;
  }

  return (
    <div>
      {permissions.edit && <EditToolbar pageId={pageId} />}
      
      <PageContent pageId={pageId} />
      
      {permissions.delete && <DeleteButton pageId={pageId} />}
    </div>
  );
}
```

---

## Next Steps

- [Labels Management](09-labels-management.md) - Tag content with metadata
- [Content Properties](06-content-properties.md) - Store structured data
- [Webhooks & Events](07-webhooks-events.md) - React to changes