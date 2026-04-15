# Blog Post Custom UI: Confluence Forge Extensions

This guide covers building Custom UI and UI Kit extensions for Confluence blog posts using the Forge platform. Blog post extensions use the same modules as page extensions — there is no separate blog post module type.

---

## Available Module Types for Blog Posts

Confluence Forge modules that work with blog posts:

| Module | Description |
|--------|-------------|
| `confluence:contentAction` | Adds a menu item to the "more actions" (•••) menu for pages and blogs |
| `confluence:contextMenu` | Adds a menu entry when text is selected on a page or blog |
| `confluence:pageBanner` | Adds a banner to pages (also renders on blog posts) |
| `confluence:contentBylineItem` | Adds an entry to the content byline section for pages and blogs |

**Important**: There is no `confluence:blogPostCustomUi` or `confluence:pageCustomUi` module type. Blog posts and pages share the same extension modules. Use `displayConditions` with `pageTypes` to target blog posts specifically.

---

## Basic Implementation (Content Action on Blog Posts)

### Manifest Configuration

```yaml
app:
  id: ari:cloud:ecosystem::app/my-confluence-app
  runtime:
    name: nodejs24.x

permissions:
  scopes:
    - read:page:confluence

modules:
  confluence:contentAction:
    - key: my-blog-action
      resource: main
      render: native
      title: Blog Post Action
      resolver:
        function: resolver
      displayConditions:
        pageTypes:
          - blogpost  # Only show on blog posts
  function:
    - key: resolver
      handler: index.handler

resources:
  - key: main
    path: src/frontend/index.jsx
```

### Page Banner on Blog Posts

```yaml
modules:
  confluence:pageBanner:
    - key: my-blog-banner
      resource: main
      render: native
      displayConditions:
        pageTypes:
          - blogpost  # Only show on blog posts

resources:
  - key: main
    path: src/frontend/index.jsx
```

---

### UI Kit Component

For UI Kit apps, use `useProductContext` from `@forge/react`:

```jsx
import React from 'react';
import ForgeReconciler, { Text, Heading, useProductContext } from '@forge/react';

const App = () => {
  const context = useProductContext();

  if (!context) return <Text>Loading...</Text>;

  // Context provides blog post information via extension
  const contentId = context.extension?.content?.id;
  const contentType = context.extension?.content?.type; // "blogpost" for blog posts
  const spaceKey = context.extension?.space?.key;

  return (
    <>
      <Heading as="h3">Blog Post Banner</Heading>
      <Text>Content ID: {contentId}</Text>
      <Text>Content Type: {contentType}</Text>
      <Text>Space: {spaceKey}</Text>
    </>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

### Custom UI Component

For Custom UI apps, use `view.getContext()` from `@forge/bridge`:

```jsx
import React, { useEffect, useState } from 'react';
import { view } from '@forge/bridge';

export default function BlogPostBanner() {
  const [context, setContext] = useState(null);

  useEffect(() => {
    view.getContext().then(setContext);
  }, []);

  if (!context) return <div>Loading...</div>;

  const contentId = context.extension?.content?.id;
  const contentType = context.extension?.content?.type; // "blogpost"
  const spaceKey = context.extension?.space?.key;

  return (
    <div>
      <h3>Blog Post Banner</h3>
      <p>Content ID: {contentId}</p>
      <p>Type: {contentType}</p>
      <p>Space: {spaceKey}</p>
    </div>
  );
}
```

---

## Getting Blog Post Context

### Extension Context Properties

When a Forge module renders on a blog post, the extension context includes:

| Property | Type | Description |
|----------|------|-------------|
| `extension.content.id` | string | The unique ID of the blog post |
| `extension.content.type` | string | `"blogpost"` for blog posts, `"page"` for pages |
| `extension.content.subtype` | string \| null | Subtype of the content, or null |
| `extension.space.id` | string | The unique ID of the space |
| `extension.space.key` | string | The key of the space |
| `location` | string | The full URL of the host page |

### UI Kit Example

```jsx
import React from 'react';
import ForgeReconciler, { Text, useProductContext } from '@forge/react';

const App = () => {
  const context = useProductContext();

  const contentId = context?.extension?.content?.id;
  const contentType = context?.extension?.content?.type;
  const spaceKey = context?.extension?.space?.key;
  const isBlogPost = contentType === 'blogpost';

  return (
    <>
      <Text>Space: {spaceKey || 'Loading...'}</Text>
      <Text>Content ID: {contentId || 'Loading...'}</Text>
      <Text>Is Blog Post: {isBlogPost ? 'Yes' : 'No'}</Text>
    </>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

### Custom UI Example

```jsx
import React, { useEffect, useState } from 'react';
import { view } from '@forge/bridge';

export default function BlogPostExtension() {
  const [contentId, setContentId] = useState(null);
  const [spaceKey, setSpaceKey] = useState(null);
  const [isBlogPost, setIsBlogPost] = useState(false);

  useEffect(() => {
    view.getContext().then((ctx) => {
      setContentId(ctx.extension?.content?.id);
      setSpaceKey(ctx.extension?.space?.key);
      setIsBlogPost(ctx.extension?.content?.type === 'blogpost');
    });
  }, []);

  return (
    <div>
      <p>Space: {spaceKey || 'Loading...'}</p>
      <p>Content ID: {contentId || 'Loading...'}</p>
      <p>Is Blog Post: {isBlogPost ? 'Yes' : 'No'}</p>
    </div>
  );
}
```

---

## Fetching Blog Post Data

Use `requestConfluence` from `@forge/bridge` (Custom UI) to call the Confluence REST API v2. Authentication is handled automatically by Forge — you do not need tokens.

### Get Blog Post by ID (Custom UI)

```jsx
import React, { useEffect, useState } from 'react';
import { view, requestConfluence } from '@forge/bridge';

export default function BlogPostExtension() {
  const [blogPost, setBlogPost] = useState(null);

  useEffect(() => {
    async function loadBlogPost() {
      const ctx = await view.getContext();
      const contentId = ctx.extension?.content?.id;

      if (!contentId) return;

      const response = await requestConfluence(
        `/wiki/api/v2/blogposts/${contentId}?body-format=storage`
      );

      if (response.ok) {
        setBlogPost(await response.json());
      }
    }
    loadBlogPost();
  }, []);

  if (!blogPost) return <div>Loading blog post data...</div>;

  return (
    <div>
      <h3>Blog Post: {blogPost.title}</h3>
      <p>Status: {blogPost.status}</p>
      <p>Author ID: {blogPost.authorId}</p>
      <p>Created: {new Date(blogPost.createdAt).toLocaleDateString()}</p>
    </div>
  );
}
```

### Get Blog Post by ID (UI Kit with Resolver)

**Frontend** (`src/frontend/index.jsx`):

```jsx
import React from 'react';
import ForgeReconciler, { Text, Heading, useProductContext } from '@forge/react';
import { invoke } from '@forge/bridge';

const App = () => {
  const context = useProductContext();
  const [blogPost, setBlogPost] = React.useState(null);

  React.useEffect(() => {
    if (context?.extension?.content?.id) {
      invoke('getBlogPost', { contentId: context.extension.content.id })
        .then(setBlogPost);
    }
  }, [context]);

  if (!blogPost) return <Text>Loading...</Text>;

  return (
    <>
      <Heading as="h3">{blogPost.title}</Heading>
      <Text>Status: {blogPost.status}</Text>
      <Text>Author: {blogPost.authorId}</Text>
    </>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

**Backend resolver** (`src/resolvers/index.js`):

```javascript
import Resolver from '@forge/resolver';
import api, { route } from '@forge/api';

const resolver = new Resolver();

resolver.define('getBlogPost', async ({ payload }) => {
  const { contentId } = payload;

  const response = await api.asApp().requestConfluence(
    route`/wiki/api/v2/blogposts/${contentId}`
  );

  if (response.ok) {
    return await response.json();
  }

  return null;
});

export const handler = resolver.getDefinitions();
```

---

## Blog Post API Response Structure

The Confluence REST API v2 returns blog posts in this format:

```json
{
  "id": "123456",
  "status": "current",
  "title": "My Blog Post",
  "spaceId": "789",
  "authorId": "5b10ac8d82e05b22cc7d4349",
  "createdAt": "2024-01-15T10:30:00.000Z",
  "version": {
    "createdAt": "2024-01-15T10:30:00.000Z",
    "message": "Initial version",
    "number": 1,
    "minorEdit": false,
    "authorId": "5b10ac8d82e05b22cc7d4349"
  },
  "body": {},
  "_links": {
    "webui": "/spaces/TEAM/blog/2024/01/15/123456/My+Blog+Post",
    "editui": "/spaces/TEAM/blog/edit/123456",
    "tinyui": "/x/abcdef"
  }
}
```

**Note**: The author is returned as `authorId` (a string account ID), not as a nested object. To get the author's display name, you must make a separate API call.

---

## Available Blog Post REST API v2 Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/wiki/api/v2/blogposts` | List all blog posts |
| POST | `/wiki/api/v2/blogposts` | Create a blog post |
| GET | `/wiki/api/v2/blogposts/{id}` | Get blog post by ID |
| PUT | `/wiki/api/v2/blogposts/{id}` | Update a blog post |
| DELETE | `/wiki/api/v2/blogposts/{id}` | Delete a blog post |
| GET | `/wiki/api/v2/blogposts/{id}/footer-comments` | Get footer comments |
| GET | `/wiki/api/v2/blogposts/{id}/inline-comments` | Get inline comments |
| GET | `/wiki/api/v2/blogposts/{id}/properties` | Get content properties |
| POST | `/wiki/api/v2/blogposts/{id}/properties` | Create content property |
| GET | `/wiki/api/v2/blogposts/{id}/attachments` | Get attachments |
| GET | `/wiki/api/v2/blogposts/{id}/versions` | Get version history |
| GET | `/wiki/api/v2/blogposts/{id}/operations` | Get permitted operations |
| GET | `/wiki/api/v2/blogposts/{id}/labels` | Get labels |
| GET | `/wiki/api/v2/blogposts/{id}/likes/users` | Get users who liked the post |
| GET | `/wiki/api/v2/blogposts/{id}/classification-level` | Get classification level |
| GET | `/wiki/api/v2/spaces/{id}/blogposts` | Get blog posts in a space |
| GET | `/wiki/api/v2/labels/{id}/blogposts` | Get blog posts by label |

---

## Common Patterns for Blog Posts

### Pattern 1: Check Permitted Operations

Use the operations endpoint to determine what the current user can do with a blog post:

```jsx
import React, { useEffect, useState } from 'react';
import { view, requestConfluence } from '@forge/bridge';

export default function BlogPostPermissions() {
  const [operations, setOperations] = useState(null);

  useEffect(() => {
    async function checkOperations() {
      const ctx = await view.getContext();
      const contentId = ctx.extension?.content?.id;

      if (!contentId) return;

      const response = await requestConfluence(
        `/wiki/api/v2/blogposts/${contentId}/operations`,
        { headers: { Accept: 'application/json' } }
      );

      if (response.ok) {
        const data = await response.json();
        setOperations(data.operations || []);
      }
    }

    checkOperations();
  }, []);

  if (!operations) return <div>Checking permissions...</div>;

  const canUpdate = operations.some(
    (op) => op.operation === 'update' && op.targetType === 'blogpost'
  );

  return (
    <div>
      <p>{canUpdate ? 'You can edit this blog post' : 'View only access'}</p>
    </div>
  );
}
```

### Pattern 2: Show Related Blog Posts via CQL Search

Use the v1 search API with CQL to find related blog posts. Note: CQL search is available via `/wiki/rest/api/search`, not the v2 API.

```jsx
import React, { useEffect, useState } from 'react';
import { view, requestConfluence } from '@forge/bridge';

export default function RelatedPostsExtension() {
  const [relatedPosts, setRelatedPosts] = useState([]);

  useEffect(() => {
    async function loadRelatedPosts() {
      const ctx = await view.getContext();
      const spaceKey = ctx.extension?.space?.key;

      if (!spaceKey) return;

      const cql = encodeURIComponent(`type=blogpost AND space=${spaceKey}`);
      const response = await requestConfluence(
        `/wiki/rest/api/search?cql=${cql}&limit=5`,
        { headers: { Accept: 'application/json' } }
      );

      if (response.ok) {
        const data = await response.json();
        setRelatedPosts(data.results || []);
      }
    }

    loadRelatedPosts();
  }, []);

  return (
    <div>
      <h4>Related Blog Posts</h4>
      {relatedPosts.length === 0 && <p>No related posts found.</p>}
      {relatedPosts.map((result) => (
        <p key={result.content?.id}>
          {result.content?.title}
        </p>
      ))}
    </div>
  );
}
```

### Pattern 3: Get Blog Post Comments

```jsx
import React, { useEffect, useState } from 'react';
import { view, requestConfluence } from '@forge/bridge';

export default function BlogPostComments() {
  const [comments, setComments] = useState([]);

  useEffect(() => {
    async function loadComments() {
      const ctx = await view.getContext();
      const contentId = ctx.extension?.content?.id;

      if (!contentId) return;

      const response = await requestConfluence(
        `/wiki/api/v2/blogposts/${contentId}/footer-comments`,
        { headers: { Accept: 'application/json' } }
      );

      if (response.ok) {
        const data = await response.json();
        setComments(data.results || []);
      }
    }

    loadComments();
  }, []);

  return (
    <div>
      <h4>Comments ({comments.length})</h4>
      {comments.map((comment) => (
        <div key={comment.id}>
          <p>{comment.title}</p>
        </div>
      ))}
    </div>
  );
}
```

### Pattern 4: Get Blog Post Likes

```jsx
import React, { useEffect, useState } from 'react';
import { view, requestConfluence } from '@forge/bridge';

export default function BlogPostLikes() {
  const [likers, setLikers] = useState([]);

  useEffect(() => {
    async function loadLikes() {
      const ctx = await view.getContext();
      const contentId = ctx.extension?.content?.id;

      if (!contentId) return;

      const response = await requestConfluence(
        `/wiki/api/v2/blogposts/${contentId}/likes/users`,
        { headers: { Accept: 'application/json' } }
      );

      if (response.ok) {
        const data = await response.json();
        setLikers(data.results || []);
      }
    }

    loadLikes();
  }, []);

  return (
    <div>
      <p>{likers.length} people liked this blog post</p>
    </div>
  );
}
```

### Pattern 5: Blog Post Content Properties (App Storage)

Store and retrieve custom metadata on blog posts:

```jsx
import React, { useEffect, useState } from 'react';
import { view, requestConfluence } from '@forge/bridge';

export default function BlogPostMetadata() {
  const [properties, setProperties] = useState([]);

  useEffect(() => {
    async function loadProperties() {
      const ctx = await view.getContext();
      const contentId = ctx.extension?.content?.id;

      if (!contentId) return;

      const response = await requestConfluence(
        `/wiki/api/v2/blogposts/${contentId}/properties`,
        { headers: { Accept: 'application/json' } }
      );

      if (response.ok) {
        const data = await response.json();
        setProperties(data.results || []);
      }
    }

    loadProperties();
  }, []);

  return (
    <div>
      <h4>Content Properties</h4>
      {properties.map((prop) => (
        <p key={prop.id}>{prop.key}: {JSON.stringify(prop.value)}</p>
      ))}
    </div>
  );
}
```

---

## Blog Post vs Page Extensions

| Feature | Blog Post | Page |
|---------|-----------|------|
| Module Type | Same modules (`confluence:contentAction`, etc.) | Same modules |
| `content.type` in context | `"blogpost"` | `"page"` |
| API Endpoint | `/wiki/api/v2/blogposts/{id}` | `/wiki/api/v2/pages/{id}` |
| CQL Type Filter | `type=blogpost` | `type=page` |
| Use Case | News, announcements, updates | Documentation, guides, specs |
| Target via displayConditions | `pageTypes: [blogpost]` | `pageTypes: [page]` |

---

## Troubleshooting

### Extension Not Showing on Blog Posts

1. **Check `displayConditions`**: If your module uses `displayConditions.pageTypes`, ensure `blogpost` is included in the list.
2. **Verify permissions**: Your app needs `read:page:confluence` scope at minimum. The user needs view permission for the blog post and its space.
3. **Deploy latest version**: Run `forge deploy` then `forge install --upgrade`.
4. **Check content type**: Use `context.extension.content.type` to confirm the content type is `"blogpost"`.

### Context Not Loading

If `useProductContext()` returns `undefined` or `view.getContext()` hangs:

1. Ensure you're importing from the correct package:
   - **UI Kit**: `import { useProductContext } from '@forge/react';`
   - **Custom UI**: `import { view } from '@forge/bridge';` then `await view.getContext()`
2. The context loads asynchronously — handle the loading state.
3. Check that your `manifest.yml` has the correct `resource` key pointing to your frontend code.

### API Calls Failing

1. **Use `requestConfluence`** from `@forge/bridge` for Custom UI — it handles authentication automatically. Do not use `fetch()` or tokens manually.
2. **Use `api.asApp().requestConfluence()`** from `@forge/api` in backend resolvers.
3. Ensure required scopes are declared in `manifest.yml` under `permissions.scopes`.

---

## Next Steps

- [Page Custom UI](02-page-custom-ui.md) - Regular page extensions
- [Space Settings](03-space-settings.md) - Space-level configuration panels
- [Content Properties](06-content-properties.md) - Storing app data with blog posts
