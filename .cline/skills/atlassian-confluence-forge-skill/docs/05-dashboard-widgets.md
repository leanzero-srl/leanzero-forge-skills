# Dashboard Widgets: Confluence Gadgets

This guide covers building custom dashboard widgets (gadgets) for Confluence. Dashboard widgets appear on Confluence dashboards and can display real-time data, charts, summaries, or any custom content you want to show at a glance.

---

## What are Dashboard Widgets?

Dashboard widgets are small, self-contained applications that display information on Confluence dashboards. They're ideal for showing:
- Real-time metrics and statistics
- Recent activity feeds
- Charts and graphs
- Quick action buttons
- External system integrations

```yaml
modules:
  confluence:dashboardGadget:
    - key: my-dashboard-widget
      title: My Dashboard Widget
      description: A custom widget for the dashboard
      resource: main
      icon: icon.png
      width: 300
      height: 400

  resource:
    - key: main
      path: src/dashboard-widget.jsx
```

---

## Basic Implementation

### Manifest Configuration

```yaml
app:
  id: ari:cloud:ecosystem::app/my-confluence-app
  name: My Confluence App

permissions:
  scopes:
    - read:confluence-content:*
    - write:confluence-content:*

modules:
  confluence:dashboardGadget:
    - key: my-dashboard-widget
      title: My Dashboard Widget
      description: Display recent page activity
      resource: main
      icon: dashboard-icon.png
      width: 300
      height: 400
      # Optional: Allow resizing
      resizable: true

  resource:
    - key: main
      path: src/dashboard-widget.jsx
```

### React Component

```jsx
import React, { useEffect, useState } from 'react';
import { api } from '@forge/bridge';

export default function DashboardWidget() {
  const [recentPages, setRecentPages] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadRecentPages() {
      try {
        const token = await AP.context.getToken();
        
        // Fetch recently updated pages
        const response = await api.fetch({
          url: '/wiki/api/v2/search?cql=order%20by%20lastmodified&limit=10',
          headers: { Authorization: `Bearer ${token}` }
        });
        
        if (response.ok) {
          const data = await response.json();
          setRecentPages(data.results || []);
        }
      } catch (error) {
        console.error('Failed to load recent pages:', error);
      } finally {
        setLoading(false);
      }
    }

    loadRecentPages();
  }, []);

  if (loading) return <div>Loading...</div>;

  return (
    <div className="dashboard-widget">
      <h3>Recently Updated Pages</h3>
      <ul>
        {recentPages.map(page => (
          <li key={page.id}>
            <a href={`/pages/viewpage.action?pageId=${page.id}`}>
              {page.title}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

---

## Widget Configuration Options

### Size and Resizing

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| `width` | number | Initial width in pixels | 300 |
| `height` | number | Initial height in pixels | 400 |
| `resizable` | boolean | Allow user to resize widget | false |

```yaml
confluence:dashboardGadget:
  - key: my-widget
    width: 400
    height: 300
    resizable: true
```

### Configuration Dialog

Allow users to configure the widget:

```yaml
modules:
  confluence:dashboardGadget:
    - key: configurable-widget
      title: Configurable Widget
      resource: main
      configurationResource: config
      width: 300
      height: 400

  resource:
    - key: main
      path: src/widget.jsx
    - key: config
      path: src/widget-config.jsx
```

### Configuration Component

```jsx
import React, { useState } from 'react';
import { Button } from '@atlaskit/button';
import { TextField } from '@atlaskit/textfield';

export default function WidgetConfig() {
  const [config, setConfig] = useState({
    spaceKey: '',
    limit: 10,
    showAuthors: false
  });

  const handleSave = () => {
    // Save configuration to the widget
    window.parent.postMessage({
      type: 'CONFIGURE',
      config: JSON.stringify(config)
    }, '*');
  };

  return (
    <div className="widget-config">
      <h3>Widget Configuration</h3>
      
      <TextField
        label="Space Key"
        value={config.spaceKey}
        onChange={(e) => setConfig({ ...config, spaceKey: e.target.value })}
      />
      
      <TextField
        label="Number of items to show"
        type="number"
        value={config.limit}
        onChange={(e) => setConfig({ ...config, limit: parseInt(e.target.value) })}
      />
      
      <label>
        <input
          type="checkbox"
          checked={config.showAuthors}
          onChange={(e) => setConfig({ ...config, showAuthors: e.target.checked })}
        />
        Show authors
      </label>
      
      <Button onClick={handleSave}>Save</Button>
    </div>
  );
}
```

---

## Common Widget Patterns

### Pattern 1: Activity Feed Widget

Display recent activity across spaces:

```jsx
import React, { useEffect, useState } from 'react';
import { api } from '@forge/bridge';

export default function ActivityFeedWidget() {
  const [activities, setActivities] = useState([]);

  useEffect(() => {
    async function loadActivity() {
      const token = await AP.context.getToken();
      
      // Fetch recent activity using search with CQL
      const response = await api.fetch({
        url: '/wiki/api/v2/search?cql=order%20by%20lastmodified&limit=20',
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setActivities(data.results || []);
      }
    }

    loadActivity();
    
    // Refresh every 60 seconds
    const interval = setInterval(loadActivity, 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="activity-feed">
      <h3>Recent Activity</h3>
      {activities.map(activity => (
        <div key={activity.id} className="activity-item">
          <span className="activity-type">{activity.type}</span>
          <a href={`/pages/viewpage.action?pageId=${activity.id}`}>
            {activity.title}
          </a>
          <span className="activity-time">
            {new Date(activity.lastModified).toLocaleDateString()}
          </span>
        </div>
      ))}
    </div>
  );
}
```

### Pattern 2: Statistics Widget with Charts

Display metrics and statistics:

```jsx
import React, { useEffect, useState } from 'react';
import { api } from '@forge/bridge';

export default function StatsWidget() {
  const [stats, setStats] = useState({
    totalPages: 0,
    totalBlogPosts: 0,
    totalSpaces: 0,
    recentUpdates: 0
  });

  useEffect(() => {
    async function loadStats() {
      const token = await AP.context.getToken();
      
      // Get page count
      const pagesResponse = await api.fetch({
        url: '/wiki/api/v2/search?cql=type=page&limit=0',
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (pagesResponse.ok) {
        const pagesData = await pagesResponse.json();
        setStats(prev => ({
          ...prev,
          totalPages: pagesData.total || 0
        }));
      }

      // Get blog post count
      const blogsResponse = await api.fetch({
        url: '/wiki/api/v2/search?cql=type=blogpost&limit=0',
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (blogsResponse.ok) {
        const blogsData = await blogsResponse.json();
        setStats(prev => ({
          ...prev,
          totalBlogPosts: blogsData.total || 0
        }));
      }
    }

    loadStats();
  }, []);

  return (
    <div className="stats-widget">
      <h3>Confluence Statistics</h3>
      
      <div className="stat-card">
        <span className="stat-value">{stats.totalPages}</span>
        <span className="stat-label">Total Pages</span>
      </div>
      
      <div className="stat-card">
        <span className="stat-value">{stats.totalBlogPosts}</span>
        <span className="stat-label">Blog Posts</span>
      </div>
      
      <div className="stat-card">
        <span className="stat-value">{stats.totalSpaces}</span>
        <span className="stat-label">Spaces</span>
      </div>
    </div>
  );
}
```

### Pattern 3: Quick Actions Widget

Provide quick access to common actions:

```jsx
import React from 'react';
import { Button } from '@atlaskit/button';
import { routeHandlers } from '@forge/bridge';

export default function QuickActionsWidget() {
  const handleCreatePage = () => {
    // Navigate to create page
    window.location.href = '/pages/createpage.action';
  };

  const handleCreateBlogPost = () => {
    window.location.href = '/pages/createblogpost.action';
  };

  const handleViewSpaces = () => {
    window.location.href = '/spaces/viewspaces.action';
  };

  return (
    <div className="quick-actions-widget">
      <h3>Quick Actions</h3>
      
      <Button onClick={handleCreatePage} appearance="primary">
        Create Page
      </Button>
      
      <Button onClick={handleCreateBlogPost}>
        Create Blog Post
      </Button>
      
      <Button onClick={handleViewSpaces}>
        View Spaces
      </Button>
    </div>
  );
}
```

### Pattern 4: External System Integration Widget

Display data from external systems:

```jsx
import React, { useEffect, useState } from 'react';

export default function JiraIssuesWidget() {
  const [issues, setIssues] = useState([]);

  useEffect(() => {
    async function loadJiraIssues() {
      try {
        // Fetch issues from your backend which connects to Jira API
        const response = await fetch('/api/jira/my-issues');
        
        if (response.ok) {
          const data = await response.json();
          setIssues(data);
        }
      } catch (error) {
        console.error('Failed to load Jira issues:', error);
      }
    }

    loadJiraIssues();
    
    // Refresh every 30 seconds
    const interval = setInterval(loadJiraIssues, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="jira-issues-widget">
      <h3>My Jira Issues</h3>
      
      {issues.length === 0 ? (
        <p>No open issues</p>
      ) : (
        <ul>
          {issues.map(issue => (
            <li key={issue.id}>
              <a href={`https://your-jira.atlassian.net/browse/${issue.key}`}>
                {issue.key}: {issue.summary}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

### Pattern 5: Search Widget

Provide quick search functionality:

```jsx
import React, { useState } from 'react';
import { api } from '@forge/bridge';
import { TextField } from '@atlaskit/textfield';

export default function SearchWidget() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);

  const handleSearch = async () => {
    if (!query.trim()) return;

    const token = await AP.context.getToken();
    
    const response = await api.fetch({
      url: `/wiki/api/v2/search?cql=${encodeURIComponent(query)}&limit=10`,
      headers: { Authorization: `Bearer ${token}` }
    });

    if (response.ok) {
      const data = await response.json();
      setResults(data.results || []);
    }
  };

  return (
    <div className="search-widget">
      <h3>Quick Search</h3>
      
      <TextField
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
        placeholder="Search..."
      />
      
      <Button onClick={handleSearch}>Search</Button>

      {results.length > 0 && (
        <ul className="search-results">
          {results.map(result => (
            <li key={result.id}>
              <a href={`/pages/viewpage.action?pageId=${result.id}`}>
                {result.title}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

---

## Styling Dashboard Widgets

Widgets are rendered in an iframe, so you can include custom CSS:

```jsx
import React from 'react';
import './widget.css';

export default function StyledWidget() {
  return (
    <div className="styled-widget">
      {/* Your widget content */}
    </div>
  );
}
```

```css
/* widget.css */
.styled-widget {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  padding: 16px;
  background: #fff;
  border-radius: 8px;
}

.styled-widget h3 {
  margin-top: 0;
  color: #172b4d;
  font-size: 16px;
}

.activity-item {
  padding: 8px 0;
  border-bottom: 1px solid #e1e3e6;
}

.activity-item:last-child {
  border-bottom: none;
}
```

---

## Widget Best Practices

### Performance

1. **Limit data fetching**: Only fetch what's needed for the widget size
2. **Implement caching**: Cache data and refresh periodically instead of on every render
3. **Use pagination**: For lists, implement virtual scrolling or pagination

```jsx
// Example: Cached data with periodic refresh
useEffect(() => {
  let isMounted = true;
  
  async function loadData() {
    const data = await fetchData();
    if (isMounted) {
      setData(data);
    }
  }

  loadData();
  const interval = setInterval(loadData, 60000); // Refresh every minute
  
  return () => {
    isMounted = false;
    clearInterval(interval);
  };
}, []);
```

### User Experience

1. **Loading states**: Show loading indicators while data is being fetched
2. **Error handling**: Gracefully handle errors with user-friendly messages
3. **Responsive design**: Ensure widget looks good at different sizes

```jsx
export default function RobustWidget() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const result = await fetchData();
        setData(result);
        setError(null);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
  if (!data) return <div>No data available</div>;

  return <WidgetContent data={data} />;
}
```

---

## Troubleshooting

### Widget Not Appearing on Dashboard

1. **Check manifest.yml**: Ensure `confluence:dashboardGadget` module is properly configured
2. **Verify permissions**: User needs dashboard viewing permissions
3. **Deploy latest version**: Run `forge deploy --verbose`

### Widget Shows Blank/Loading Forever

```jsx
// Add debugging to identify issues
useEffect(() => {
  console.log('Widget mounted, loading data...');
  
  async function loadData() {
    try {
      console.log('Fetching token...');
      const token = await AP.context.getToken();
      console.log('Token obtained:', token ? 'yes' : 'no');
      
      // Continue with data fetching...
    } catch (error) {
      console.error('Load error:', error);
      setError(error.message);
    }
  }

  loadData();
}, []);
```

### Configuration Not Persisting

Widget configurations are stored by Confluence. Ensure you're properly communicating config:

```jsx
// In configuration component
const handleSave = () => {
  window.parent.postMessage({
    type: 'CONFIGURE',
    config: JSON.stringify(config)
  }, '*');
};

// In main widget component
useEffect(() => {
  const handleMessage = (event) => {
    if (event.data.type === 'CONFIG') {
      setConfig(JSON.parse(event.data.config));
    }
  };

  window.addEventListener('message', handleMessage);
  return () => window.removeEventListener('message', handleMessage);
}, []);
```

---

## Next Steps

- [Page Custom UI](02-page-custom-ui.md) - Page extensions
- [Blog Post Custom UI](04-blogpost-custom-ui.md) - Blog post extensions
- [Content Properties](06-content-properties.md) - Storing widget data