# Blog Post Custom UI: Confluence Extensions

This guide covers building custom UI extensions for Confluence blog posts. Note that blog post extensions use the same modules as page extensions.

---

## Available Module Types for Blog Posts

Confluence uses these module types for blog post extensions:

| Module | Description |
|--------|-------------|
| `confluence:pageBanner` | Adds a banner to blog posts (same as pages) |
| `confluence:contentAction` | Adds menu item to "more actions" for blog posts |
| `confluence:contextMenu` | Adds menu entry when text is selected on a blog post |

**Note**: Confluence does not have a separate `confluence:blogPostCustomUi` module type. Blog posts use the same extension modules as pages.

---

## Basic Implementation (Page Banner on Blog)

### Manifest Configuration

```yaml
app:
  id: ari:cloud:ecosystem::app/my-confluence-app
  name: My Confluence App

permissions:
  scopes:
    - read:confluence-content.summary

modules:
  confluence:pageBanner:
    - key: my-blog-banner
      resource: main
      title: Blog Post Banner
      icon: icon.png
      displayConditions:
        pageTypes:
          - blogpost  # Only show on blog posts

resources:
  - key: main
    path: src/blog-post-banner.jsx
```
---

### React Component

```jsx
import React from 'react';
import { useProductContext } from '@forge/bridge';

export default function BlogPostBanner() {
  const context = useProductContext();
  
  // Context provides blog post information
  console.log('Blog Post ID:', context.content.id);
  console.log('Space ID:', context.space.id);

  return (
    <div className="blog-post-banner">
      <h3>My Blog Post Banner</h3>
      <p>This banner appears on all blog posts.</p>
    </div>
  );
}
```

---

## Getting Blog Post Context

### Extracting Blog Post ID from URL

Blog posts have different URL patterns than regular pages:

```jsx
import { routeHandlers } from '@forge/bridge';

function getBlogPostIdFromRoute() {
  const route = routeHandlers.getCurrentRoute();
  
  // Confluence blog posts have routes like:
  // /spaces/~username/blog/123456789/Page+Title
  // /spaces/SPACEKEY/blog/123456789/Page+Title
  
  if (route.path.includes('/blog/')) {
    const match = route.path.match(/\/blog\/(\d+)/);
    if (match) {
      return parseInt(match[1], 10);
    }
  }
  
  // Legacy URL format: /pages/viewblogpost.action?blogPostId=123456789
  const searchParams = new URLSearchParams(route.search);
  const blogPostIdParam = searchParams.get('blogPostId');
  if (blogPostIdParam) {
    return parseInt(blogPostIdParam, 10);
  }
  
  return null;
}

// Hook for easier use in components
function useBlogPostContext() {
  const [blogPostId, setBlogPostId] = useState(null);

  useEffect(() => {
    // Small delay to ensure route context is ready
    const timer = setTimeout(() => {
      const id = getBlogPostIdFromRoute();
      setBlogPostId(id);
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  return blogPostId;
}
```

### Using Route Handlers for Blog Posts

```jsx
import { routeHandlers } from '@forge/bridge';
import { useEffect, useState } from 'react';

export default function BlogPostExtension() {
  const [blogPostId, setBlogPostId] = useState(null);
  const [spaceKey, setSpaceKey] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      const route = routeHandlers.getCurrentRoute();
      
      // Parse blog post ID and space key from route
      if (route.path.includes('/blog/')) {
        const match = route.path.match(/\/spaces\/([^/]+)\/blog\/(\d+)/);
        if (match) {
          setSpaceKey(match[1]);
          setBlogPostId(parseInt(match[2], 10));
        }
      }
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div>
      <p>Space: {spaceKey || 'Loading...'}</p>
      <p>Blog Post ID: {blogPostId || 'Loading...'}</p>
    </div>
  );
}
```

---

## Fetching Current Blog Post Data

Once you have the blog post ID, fetch its content:

```jsx
import React, { useEffect, useState } from 'react';
import { api, routeHandlers } from '@forge/bridge';

async function getCurrentBlogPostData() {
  const token = await AP.context.getToken();
  
  // Extract blog post ID from current route
  const route = routeHandlers.getCurrentRoute();
  const match = route.path.match(/\/blog\/(\d+)/);
  
  if (!match) return null;
  
  const blogPostId = match[1];
  
  const response = await api.fetch({
    url: `/wiki/api/v2/blogposts/${blogPostId}`,
    headers: { Authorization: `Bearer ${token}` }
  });
  
  return response.ok ? await response.json() : null;
}

export default function BlogPostExtension() {
  const [blogPost, setBlogPost] = useState(null);

  useEffect(() => {
    getCurrentBlogPostData().then(setBlogPost);
  }, []);

  if (!blogPost) return <div>Loading blog post data...</div>;

  return (
    <div className="blog-post-extension">
      <h3>Blog Post: {blogPost.title}</h3>
      <p>Author: {blogPost.author.displayName}</p>
      <p>Published: {new Date(blogPost.created).toLocaleDateString()}</p>
    </div>
  );
}
```

---

## Using Confluence UI Kit Components

Atlassian provides React components that match Confluence's design system:

```jsx
import React from 'react';
import { Card, Heading, Text } from '@atlaskit/card';
import { InlineSpinner } from '@atlaskit/spinner';
import { Button } from '@atlaskit/button';
import { Badge } from '@atlaskit/badge';

export default function BlogPostExtension() {
  const [viewCount, setViewCount] = useState(0);

  useEffect(() => {
    // Fetch view count for this blog post
    async function loadStats() {
      const token = await AP.context.getToken();
      const response = await api.fetch({
        url: '/wiki/api/v2/blogposts/stats',
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setViewCount(data.views || 0);
      }
    }
    
    loadStats();
  }, []);

  return (
    <Card>
      <Heading>Blog Post Analytics</Heading>
      <Text weight="strong">This blog post has been viewed {viewCount} times.</Text>
      
      <Badge appearance="success">{viewCount > 100 ? 'Popular' : 'New'}</Badge>
    </Card>
  );
}
```

---

## Common Patterns for Blog Posts

### Pattern 1: Display Analytics and Engagement Metrics

```jsx
async function getBlogPostAnalytics(blogPostId, token) {
  const response = await api.fetch({
    url: `/wiki/api/v2/blogposts/${blogPostId}/analytics`,
    headers: { Authorization: `Bearer ${token}` }
  });

  return response.ok ? await response.json() : null;
}

export default function BlogAnalyticsExtension() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    async function loadStats() {
      const token = await AP.context.getToken();
      const blogPostId = getBlogPostIdFromRoute();
      
      if (blogPostId) {
        const analytics = await getBlogPostAnalytics(blogPostId, token);
        setStats(analytics);
      }
    }
    
    loadStats();
  }, []);

  if (!stats) return <div>Loading stats...</div>;

  return (
    <Card>
      <Heading>Engagement Stats</Heading>
      <Text>Views: {stats.views}</Text>
      <Text>Comments: {stats.comments}</Text>
      <Text>Likes: {stats.likes}</Text>
    </Card>
  );
}
```

### Pattern 2: Show Related Blog Posts

```jsx
async function findRelatedBlogPosts(currentSpaceKey, token) {
  // Search for other blog posts in the same space
  const response = await api.fetch({
    url: `/wiki/api/v2/search?cql=type=blogpost%20AND%20space=${currentSpaceKey}`,
    headers: { Authorization: `Bearer ${token}` }
  });

  return response.ok ? await response.json() : [];
}

export default function RelatedPostsExtension() {
  const [relatedPosts, setRelatedPosts] = useState([]);

  useEffect(() => {
    async function loadRelatedPosts() {
      const token = await AP.context.getToken();
      const route = routeHandlers.getCurrentRoute();
      
      // Extract space key from current route
      const match = route.path.match(/\/spaces\/([^/]+)/);
      if (match) {
        const spaceKey = match[1];
        const posts = await findRelatedBlogPosts(spaceKey, token);
        setRelatedPosts(posts.results || []);
      }
    }
    
    loadRelatedPosts();
  }, []);

  return (
    <Card>
      <Heading>Related Blog Posts</Heading>
      {relatedPosts.map(post => (
        <Text key={post.id}>
          <a href={`/spaces/${post.space.key}/blog/${post.id}`}>
            {post.title}
          </a>
        </Text>
      ))}
    </Card>
  );
}
```

### Pattern 3: Add Social Sharing Buttons

```jsx
import React from 'react';
import { ButtonGroup, Button } from '@atlaskit/button';
import { routeHandlers } from '@forge/bridge';

function getShareUrl() {
  const route = routeHandlers.getCurrentRoute();
  // Construct shareable URL
  return `${window.location.origin}${route.path}`;
}

export default function SocialSharingExtension() {
  const shareUrl = getShareUrl();

  return (
    <Card>
      <Heading>Share this post</Heading>
      <ButtonGroup>
        <Button onClick={() => window.open(`twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}`)}>
          Twitter
        </Button>
        <Button onClick={() => window.open(`linkedin.com/shareArticle?url=${encodeURIComponent(shareUrl)}`)}>
          LinkedIn
        </Button>
        <Button onClick={() => navigator.clipboard.writeText(shareUrl)}>
          Copy Link
        </Button>
      </ButtonGroup>
    </Card>
  );
}
```

### Pattern 4: Display Author Information

```jsx
async function getAuthorDetails(authorAccountId, token) {
  const response = await api.fetch({
    url: `/wiki/api/v2/users/${authorAccountId}`,
    headers: { Authorization: `Bearer ${token}` }
  });

  return response.ok ? await response.json() : null;
}

export default function AuthorInfoExtension() {
  const [author, setAuthor] = useState(null);

  useEffect(() => {
    async function loadAuthor() {
      const token = await AP.context.getToken();
      const blogPostId = getBlogPostIdFromRoute();
      
      if (blogPostId) {
        // First get the blog post to find author
        const postResponse = await api.fetch({
          url: `/wiki/api/v2/blogposts/${blogPostId}`,
          headers: { Authorization: `Bearer ${token}` }
        });
        
        if (postResponse.ok) {
          const post = await postResponse.json();
          const authorData = await getAuthorDetails(post.author.accountId, token);
          setAuthor(authorData);
        }
      }
    }
    
    loadAuthor();
  }, []);

  if (!author) return <div>Loading...</div>;

  return (
    <Card>
      <Heading>About the Author</Heading>
      <Text weight="strong">{author.displayName}</Text>
      {author.profilePicture && (
        <img src={author.profilePicture} alt={author.displayName} style={{ width: '50px', height: '50px' }} />
      )}
    </Card>
  );
}
```

---

## Handling Permissions for Blog Posts

Check if user has permission to view/modify blog posts:

```jsx
async function checkBlogPostPermissions(blogPostId, token) {
  // Check if user can edit the blog post
  const response = await api.fetch({
    url: `/wiki/api/v2/blogposts/${blogPostId}/permissions`,
    headers: { Authorization: `Bearer ${token}` }
  });

  return response.ok ? await response.json() : null;
}

export default function BlogPostExtension() {
  const [canEdit, setCanEdit] = useState(false);

  useEffect(() => {
    async function checkPermissions() {
      const token = await AP.context.getToken();
      const blogPostId = getBlogPostIdFromRoute();
      
      if (blogPostId) {
        const permissions = await checkBlogPostPermissions(blogPostId, token);
        setCanEdit(permissions?.canEdit || false);
      }
    }
    
    checkPermissions();
  }, []);

  return (
    <div>
      <p>{canEdit ? 'You can edit this blog post' : 'View only access'}</p>
    </div>
  );
}
```

---

## Blog Post vs Page Extensions

| Feature | Blog Post Extension | Page Extension |
|---------|---------------------|----------------|
| Module Type | `confluence:blogPostCustomUi` | `confluence:pageCustomUi` |
| URL Pattern | `/spaces/KEY/blog/{id}` | `/spaces/KEY/page/{id}` |
| API Endpoint | `/wiki/api/v2/blogposts/{id}` | `/wiki/api/v2/pages/{id}` |
| Use Case | News, announcements, updates | Documentation, guides, specs |

---

## Troubleshooting

### Extension Not Showing on Blog Posts

1. **Check manifest.yml**: Ensure `confluence:blogPostCustomUi` module is properly configured
2. **Verify permissions**: User needs appropriate Confluence permissions for blog posts
3. **Deploy latest version**: Run `forge deploy --verbose`

### Route Parsing Issues for Blog Posts

Blog post URLs have different patterns than regular pages. Always handle both formats:

```jsx
function safeParseBlogPostRoute() {
  try {
    const route = routeHandlers.getCurrentRoute();
    
    // Handle various blog post URL formats
    const patterns = [
      /\/spaces\/[^/]+\/blog\/(\d+)/,     // Standard blog post
      /\/pages\/viewblogpost\.action\?blogPostId=(\d+)/  // Legacy URL
    ];

    for (const pattern of patterns) {
      const match = route.path.match(pattern);
      if (match) return match[1];
    }
    
    // Check query params for legacy URLs
    const searchParams = new URLSearchParams(route.search);
    const blogPostIdParam = searchParams.get('blogPostId');
    if (blogPostIdParam) return blogPostIdParam;
  } catch (error) {
    console.error('Blog post route parsing failed:', error);
  }
  
  return null;
}
```

---

## Next Steps

- [Page Custom UI](02-page-custom-ui.md) - Regular page extensions
- [Space Settings](03-space-settings.md) - Space-level configuration panels
- [Content Properties](06-content-properties.md) - Storing app data with blog posts