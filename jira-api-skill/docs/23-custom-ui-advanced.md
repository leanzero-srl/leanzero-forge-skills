# Advanced Forge Custom UI Guide

This document covers advanced patterns and best practices for building sophisticated Custom UI applications in Atlassian Forge.

## Table of Contents
1. [Advanced State Management](#advanced-state-management)
2. [Complex Data Fetching Patterns](#complex-data-fetching-patterns)
3. [Performance Optimization](#performance-optimization)
4. [Authentication Patterns](#authentication-patterns)
5. [Custom Styling and Theming](#custom-styling-and-theming)

---

## Advanced State Management

### Using useEffect with Dependencies

```javascript
import React, { useState, useEffect } from 'react';

function UserDetail({ userId }) {
  const [user, setUser] = useState(null);
  const [projects, setProjects] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load user data when component mounts or userId changes
  useEffect(() => {
    const loadUserData = async () => {
      try {
        setIsLoading(true);
        
        // Load user
        const userResponse = await bridge.requestJira(
          `/rest/api/3/user?accountId=${userId}`
        );
        setUser(await userResponse.json());
        
        // Load user's projects
        const projectsResponse = await bridge.requestJira(
          `/rest/api/3/project?member=${userId}`
        );
        setProjects(await projectsResponse.json());
      } catch (error) {
        console.error('Failed to load user data:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    if (userId) {
      loadUserData();
    } else {
      setUser(null);
      setProjects([]);
    }
  }, [userId]);

  if (isLoading) {
    return <div>Loading user details...</div>;
  }

  return (
    <div className="user-detail">
      {user && (
        <>
          <h2>{user.displayName}</h2>
          <p>Email: {user.emailAddress}</p>
          
          <h3>Projects</h3>
          <ul>
            {projects.map(project => (
              <li key={project.id}>{project.name}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

// Multiple data sources with dependency control
function Dashboard() {
  const [issues, setIssues] = useState([]);
  const [assignees, setAssignees] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Load issues and assignees in parallel
    Promise.all([
      bridge.requestJira('/rest/api/3/search?jql=assignee=currentuser()'),
      bridge.requestJira('/rest/api/3/user/assignable/multiProjectSearch')
    ])
      .then(([issuesResponse, assigneesResponse]) => {
        return Promise.all([
          issuesResponse.json(),
          assigneesResponse.json()
        ]);
      })
      .then(([issuesData, assigneesData]) => {
        setIssues(issuesData.issues);
        setAssignees(assigneesData);
      })
      .catch(error => {
        console.error('Failed to load dashboard data:', error);
      })
      .finally(() => setIsLoading(false));
  }, []);

  return isLoading ? (
    <div>Loading dashboard...</div>
  ) : (
    <div className="dashboard">
      <h2>My Issues</h2>
      {issues.length > 0 ? (
        issues.map(issue => (
          <div key={issue.key} className="issue-card">
            <h3>{issue.key}</h3>
            <p>{issue.fields.summary}</p>
          </div>
        ))
      ) : (
        <p>No issues assigned to you</p>
      )}
    </div>
  );
}
```

### Custom Hook Pattern

```javascript
// hooks/useJiraData.js
export const useJiraData = (jql) => {
  const [issues, setIssues] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!jql) return;

    const fetchIssues = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        const response = await bridge.requestJira(
          `/rest/api/3/search?jql=${encodeURIComponent(jql)}&expand=changelog`
        );
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        setIssues(data.issues);
      } catch (error) {
        setError(error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchIssues();
  }, [jql]);

  return { issues, isLoading, error };
};

// hooks/useProjectMembers.js
export const useProjectMembers = (projectKey) => {
  const [members, setMembers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!projectKey) return;

    const fetchMembers = async () => {
      try {
        setIsLoading(true);
        
        const response = await bridge.requestJira(
          `/rest/api/3/project/${projectKey}/roles`
        );
        
        const roles = await response.json();
        
        // Flatten the role members
        const allMembers = Object.values(roles)
          .flat()
          .map(role => ({
            name: role.name,
            avatar: role.avatarUrls['24x24'],
            accountId: role.actorAccount?.accountId
          }));
        
        setMembers(allMembers);
      } catch (error) {
        console.error('Failed to fetch project members:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMembers();
  }, [projectKey]);

  return { members, isLoading };
};

// Usage in component
function IssueList({ jql }) {
  const { issues, isLoading: issuesLoading } = useJiraData(jql);
  const { members, isLoading: membersLoading } = useProjectMembers('PROJ');

  if (issuesLoading || membersLoading) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <h2>Issues</h2>
      {issues.map(issue => (
        <IssueCard key={issue.key} issue={issue} />
      ))}
      
      <h3>Team Members</h3>
      <MemberList members={members} />
    </div>
  );
}
```

### Context for Global State

```javascript
// context/ThemeContext.js
import React, { createContext, useContext, useState } from 'react';

const ThemeContext = createContext();

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    // Check localStorage or system preference
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) return savedTheme;
    
    // Check system theme
    if (window.matchMedia && 
        window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    
    return 'light';
  });

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
    localStorage.setItem('theme', theme === 'light' ? 'dark' : 'light');
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

// context/AuthContext.js
export const useAuth = () => {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const response = await bridge.requestJira('/rest/api/3/myself');
      setUser(await response.json());
    } catch (error) {
      console.error('Failed to load user:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return { user, isLoading };
};
```

---

## Complex Data Fetching Patterns

### Pagination Implementation

```javascript
// hooks/usePaginatedData.js
export const usePaginatedData = (jql) => {
  const [issues, setIssues] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [maxResults, setMaxResults] = useState(50);

  useEffect(() => {
    fetchPage();
  }, [jql, page]);

  const fetchPage = async () => {
    try {
      setIsLoading(true);
      
      const response = await bridge.requestJira(
        `/rest/api/3/search?jql=${encodeURIComponent(jql)}&start=${page * maxResults}&maxResults=${maxResults}`
      );
      
      const data = await response.json();
      
      // Update issues or append based on use case
      setIssues(prev => [...prev, ...data.issues]);
      setTotal(data.total);
    } catch (error) {
      console.error('Failed to fetch page:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNextPage = () => setPage(p => p + 1);
  const handlePrevPage = () => setPage(p => Math.max(0, p - 1));
  const hasMore = (page + 1) * maxResults < total;

  return {
    issues,
    isLoading,
    page,
    total,
    hasMore,
    handleNextPage,
    handlePrevPage
  };
};

// Usage
function PaginatedIssueList() {
  const { issues, isLoading, hasMore, handleNextPage } = usePaginatedData('project = PROJ');

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      {issues.map(issue => (
        <IssueCard key={issue.key} issue={issue} />
      ))}
      
      {hasMore && (
        <button onClick={handleNextPage}>Load More</button>
      )}
    </div>
  );
}
```

### Debounced Search

```javascript
// hooks/useDebounce.js
export const useDebounce = (value, delay) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
};

// Search component
function IssueSearch() {
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState([]);
  
  const debouncedQuery = useDebounce(searchQuery, 300);

  useEffect(() => {
    if (!debouncedQuery) {
      setResults([]);
      return;
    }

    const searchIssues = async () => {
      try {
        const response = await bridge.requestJira(
          `/rest/api/3/search?jql=text~"${encodeURIComponent(debouncedQuery)}"`
        );
        
        const data = await response.json();
        setResults(data.issues);
      } catch (error) {
        console.error('Search failed:', error);
      }
    };

    searchIssues();
  }, [debouncedQuery]);

  return (
    <div>
      <input
        type="text"
        placeholder="Search issues..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />
      
      {results.map(issue => (
        <div key={issue.key}>{issue.key}: {issue.fields.summary}</div>
      ))}
    </div>
  );
}
```

### Concurrent Requests with Control

```javascript
// utils/requestQueue.js
class RequestQueue {
  constructor() {
    this.queue = [];
    this.activeRequests = new Set();
    this.maxConcurrent = 3;
  }

  async add(requestFn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ requestFn, resolve, reject });
      this.processQueue();
    });
  }

  processQueue() {
    while (this.activeRequests.size < this.maxConcurrent && this.queue.length > 0) {
      const { requestFn, resolve, reject } = this.queue.shift();
      
      if (!requestFn) continue;
      
      this.activeRequests.add(requestFn);
      
      requestFn()
        .then(resolve)
        .catch(reject)
        .finally(() => {
          this.activeRequests.delete(requestFn);
          this.processQueue();
        });
    }
  }
}

const requestQueue = new RequestQueue();

// Usage
async function fetchMultipleProjects(projectKeys) {
  const promises = projectKeys.map(key =>
    requestQueue.add(() => 
      bridge.requestJira(`/rest/api/3/project/${key}`)
        .then(r => r.json())
    )
  );

  return Promise.all(promises);
}

// In component
function ProjectDashboard() {
  useEffect(() => {
    fetchMultipleProjects(['PROJ1', 'PROJ2', 'PROJ3'])
      .then(projects => console.log(projects));
  }, []);
}
```

---

## Performance Optimization

### React.memo for Component Caching

```javascript
// Memoized components
const IssueCard = React.memo(({ issue }) => {
  return (
    <div className="issue-card">
      <h3>{issue.key}</h3>
      <p>{issue.fields.summary}</p>
      <StatusBadge status={issue.fields.status.name} />
    </div>
  );
}, (prevProps, nextProps) => {
  // Only re-render if issue key or summary changes
  return prevProps.issue.key === nextProps.issue.key &&
         prevProps.issue.fields.summary === nextProps.issue.fields.summary;
});

// Custom comparison for complex objects
function areEqual(prevProps, nextProps) {
  return JSON.stringify(prevProps.data) === JSON.stringify(nextProps.data);
}

const DetailedView = React.memo(ComponentWithDeepData, areEqual);
```

### useMemo for Expensive Computations

```javascript
function IssueAnalytics({ issues }) {
  // Memoize expensive calculations
  const stats = useMemo(() => {
    if (!issues || !Array.isArray(issues)) return {};

    const byPriority = {};
    const byStatus = {};
    
    issues.forEach(issue => {
      const priority = issue.fields.priority?.name || 'Unknown';
      const status = issue.fields.status?.name || 'Unknown';
      
      byPriority[priority] = (byPriority[priority] || 0) + 1;
      byStatus[status] = (byStatus[status] || 0) + 1;
    });

    return { byPriority, byStatus };
  }, [issues]);

  // Memoized filtered list
  const highPriorityIssues = useMemo(() => {
    return issues?.filter(i => 
      i.fields.priority?.name === 'High' ||
      i.fields.priority?.name === 'Critical'
    ) || [];
  }, [issues]);

  // Memoized sorting function result
  const sortedByCreated = useMemo(() => {
    if (!issues) return [];
    
    return [...issues].sort((a, b) => 
      new Date(b.fields.created) - new Date(a.fields.created)
    );
  }, [issues]);

  return (
    <div>
      {/* Render memoized data */}
    </div>
  );
}
```

### useCallback for Function Memoization

```javascript
function IssueList({ issues }) {
  // Memoize callback functions
  const handleIssueClick = useCallback((issue) => {
    console.log('Clicked:', issue.key);
    // Navigate to issue view
  }, []);

  const handleSearch = useCallback((query) => {
    console.log('Searching for:', query);
    // Perform search
  }, []);

  return (
    <div>
      {issues.map(issue => (
        <IssueCard 
          key={issue.key} 
          issue={issue} 
          onClick={handleIssueClick}
        />
      ))}
      
      <SearchBox onSearch={handleSearch} />
    </div>
  );
}

// Avoid creating new functions in render
const IssueItem = React.memo(({ issue, onHover }) => {
  const handleMouseEnter = useCallback(() => {
    onHover(issue.key);
  }, [issue.key, onHover]);

  return (
    <div onMouseEnter={handleMouseEnter}>
      {issue.fields.summary}
    </div>
  );
}, (prev, next) => prev.issue.key === next.issue.key);
```

### Virtualization for Large Lists

```javascript
// hooks/useVirtualizedList.js
import { useState, useEffect, useCallback } from 'react';

export const useVirtualizedList = (items, itemHeight = 48) => {
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(500);

  // Calculate visible range
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight));
  const endIndex = Math.min(
    items.length - 1,
    Math.ceil((scrollTop + containerHeight) / itemHeight)
  );

  const visibleItems = items.slice(startIndex, endIndex + 1);
  const totalHeight = items.length * itemHeight;

  const handleScroll = useCallback(() => {
    const target = event.target;
    setScrollTop(target.scrollTop);
  }, []);

  return {
    visibleItems,
    startIndex,
    handleScroll,
    totalHeight,
    containerHeight
  };
};

// Usage with react-window equivalent pattern
function VirtualizedIssueList({ issues }) {
  const { visibleItems, startIndex, handleScroll } = useVirtualizedList(issues);

  // Simulated virtualization (real implementation would use react-window)
  return (
    <div 
      className="virtual-list" 
      onScroll={handleScroll}
      style={{ height: '500px', overflowY: 'auto' }}
    >
      {/* Spacer for invisible items */}
      <div style={{ height: startIndex * 48 }} />
      
      {visibleItems.map((issue, index) => (
        <IssueCard key={issue.key} issue={issue} />
      ))}
      
      {/* Spacer for remaining items */}
      <div 
        style={{ 
          height: (issues.length - endIndex - 1) * 48 
        }} 
      />
    </div>
  );
}
```

---

## Authentication Patterns

### Session Management

```javascript
// utils/sessionManager.js
class SessionManager {
  constructor() {
    this.session = null;
    this.token = null;
    this.lastCheck = 0;
  }

  async isAuthenticated() {
    const now = Date.now();
    
    // Check cache first (1 minute)
    if (this.session && (now - this.lastCheck) < 60000) {
      return true;
    }
    
    try {
      const response = await bridge.requestJira('/rest/api/3/myself');
      
      if (response.ok) {
        this.session = await response.json();
        this.lastCheck = now;
        return true;
      }
    } catch (error) {
      console.error('Session check failed:', error);
    }
    
    this.session = null;
    return false;
  }

  async getCurrentUser() {
    if (!this.session || (Date.now() - this.lastCheck) > 60000) {
      await this.isAuthenticated();
    }
    
    return this.session;
  }

  async getAuthToken() {
    // Get auth token for external API calls
    const response = await bridge.requestJira(
      '/rest/auth/1/session'
    );
    
    if (response.ok) {
      return (await response.json()).session.token;
    }
    
    throw new Error('Failed to get auth token');
  }
}

export const sessionManager = new SessionManager();

// Usage in components
function ProtectedContent() {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadUser = async () => {
      try {
        setUser(await sessionManager.getCurrentUser());
      } catch (error) {
        console.error('Failed to load user:', error);
      } finally {
        setIsLoading(false);
      }
    };

    if (!user) {
      loadUser();
    }
  }, [user]);

  return isLoading ? <div>Loading...</div> : <div>Welcome, {user.displayName}!</div>;
}
```

### Role-Based Access Control

```javascript
// utils/permissions.js
export const PERMISSIONS = {
  ADMIN: 'ADMIN',
  PROJECT_ADMIN: 'PROJECT_ADMIN',
  DELETE_ISSUES: 'DELETE_ISSUES',
  CREATE_ISSUES: 'CREATE_ISSUES'
};

export class PermissionChecker {
  constructor(context) {
    this.context = context;
  }

  hasPermission(permission) {
    const { accountType } = this.context;

    switch (permission) {
      case PERMISSIONS.ADMIN:
        // Admin requires licensed status
        return accountType === 'licensed';
      
      case PERMISSIONS.PROJECT_ADMIN:
        // Project admins typically have specific permissions
        return ['licensed', 'customer'].includes(accountType);
      
      case PERMISSIONS.DELETE_ISSUES:
        // Users can delete their own issues or those with proper permissions
        return accountType === 'licensed';
      
      default:
        return accountType !== 'anonymous';
    }
  }

  async checkPermission(permission) {
    if (this.hasPermission(permission)) {
      return true;
    }

    try {
      // For more complex checks, make API call
      const response = await bridge.requestJira(
        `/rest/api/3/mypermissions?permissions=${permission}`
      );
      
      const data = await response.json();
      return data.permissions[permission].havePermission;
    } catch (error) {
      console.error('Permission check failed:', error);
      return false;
    }
  }
}

// Usage in components
function AdminPanel({ context }) {
  const permissions = new PermissionChecker(context);

  if (!permissions.hasPermission(PERMISSIONS.ADMIN)) {
    return <div>Access Denied</div>;
  }

  return (
    <div className="admin-panel">
      <h2>Admin Panel</h2>
      {/* Admin controls */}
    </div>
  );
}
```

---

## Custom Styling and Theming

### Dynamic CSS with Theme Context

```javascript
// styles/theme.js
export const themes = {
  light: {
    primary: '#00657f',
    secondary: '#54a29b',
    background: '#ffffff',
    surface: '#f4f5f7',
    text: '#172b4d',
    textSecondary: '#5e6c84',
    border: '#dfe1e6',
    success: '#0066cc',
    warning: '#ffb347',
    error: '#de350b'
  },
  dark: {
    primary: '#54a29b',
    secondary: '#00657f',
    background: '#172b4d',
    surface: '#283e54',
    text: '#ffffff',
    textSecondary: '#c1c7d0',
    border: '#42526e',
    success: '#0066cc',
    warning: '#ffae00',
    error: '#de350b'
  }
};

export const useThemeStyles = (themeName) => {
  const theme = themes[themeName];

  return {
    container: {
      backgroundColor: theme.background,
      color: theme.text,
      minHeight: '100vh'
    },
    card: {
      backgroundColor: theme.surface,
      borderRadius: '4px',
      padding: '16px',
      marginBottom: '12px'
    },
    button: {
      backgroundColor: theme.primary,
      color: '#ffffff',
      border: 'none',
      padding: '8px 16px',
      borderRadius: '3px',
      cursor: 'pointer'
    }
  };
};

// usage
function ThemedComponent() {
  const { theme } = useTheme();
  const styles = useThemeStyles(theme);

  return (
    <div style={styles.container}>
      <Card style={styles.card}>
        <Button style={styles.button}>Action</Button>
      </Card>
    </div>
  );
}
```

### Responsive Design

```javascript
// hooks/useResponsive.js
export const useResponsive = () => {
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);
  const [isDesktop, setIsDesktop] = useState(true);

  useEffect(() => {
    const checkSize = () => {
      const width = window.innerWidth;
      setIsMobile(width < 768);
      setIsTablet(width >= 768 && width < 1200);
      setIsDesktop(width >= 1200);
    };

    // Initial check
    checkSize();

    // Add event listener
    window.addEventListener('resize', checkSize);

    return () => window.removeEventListener('resize', checkSize);
  }, []);

  return { isMobile, isTablet, isDesktop };
};

// Usage in component
function ResponsiveLayout() {
  const { isMobile, isTablet } = useResponsive();

  if (isMobile) {
    // Mobile-specific rendering
    return <div className="mobile-view">{renderMobileContent()}</div>;
  }

  if (isTablet) {
    // Tablet-specific rendering
    return <div className="tablet-view">{renderTabletContent()}</div>;
  }

  // Desktop default
  return <div className="desktop-view">{renderDesktopContent()}</div>;
}
```

### Animation and Transitions

```javascript
// hooks/useAnimations.js
export const useFadeIn = (delay = 0) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, delay);

    return () => clearTimeout(timer);
  }, [delay]);

  return isVisible;
};

// Usage
function AnimatedCard() {
  const isVisible = useFadeIn(100);

  return (
    <div 
      className={`card ${isVisible ? 'fade-in' : ''}`}
      style={{
        opacity: isVisible ? 1 : 0,
        transition: 'opacity 0.5s ease'
      }}
    >
      {/* Card content */}
    </div>
  );
}

// hooks/useHover.js
export const useHover = () => {
  const [isHovered, setIsHovered] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const handleMouseEnter = () => setIsHovered(true);
    const handleMouseLeave = () => setIsHovered(false);

    node.addEventListener('mouseenter', handleMouseEnter);
    node.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      node.removeEventListener('mouseenter', handleMouseEnter);
      node.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, []);

  return [ref, isHovered];
};

// Usage
function HoverCard() {
  const [hoverRef, isHovered] = useHover();

  return (
    <div 
      ref={hoverRef}
      className={`card ${isHovered ? 'hovered' : ''}`}
      style={{
        transform: isHovered ? 'translateY(-2px)' : 'none',
        boxShadow: isHovered ? '0 4px 12px rgba(0,0,0,0.15)' : 'none',
        transition: 'all 0.3s ease'
      }}
    >
      {/* Card content */}
    </div>
  );
}
```

---

## Best Practices Summary

### 1. State Management
- Use `useState` for simple component state
- Use `useEffect` with proper dependencies
- Create custom hooks for reusable logic
- Consider context for global state if needed

### 2. Performance
- Memoize expensive computations with `useMemo`
- Memoize callbacks with `useCallback`
- Use `React.memo` for component caching
- Implement virtualization for large lists

### 3. Data Fetching
- Handle loading and error states properly
- Implement debouncing for search inputs
- Use concurrent requests when appropriate
- Cache frequently accessed data

### 4. Styling
- Use CSS-in-JS for dynamic styling
- Implement responsive design patterns
- Provide dark mode support
- Optimize animations for performance

## Related Documentation

- [UI Kit Components](./17-ui-kit-components.md)
- [Bridge API Reference](./15-bridge-api-reference.md)
- [Resolver Patterns](./16-resolver-patterns.md)