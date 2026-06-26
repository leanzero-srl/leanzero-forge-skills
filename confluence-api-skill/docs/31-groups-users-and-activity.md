# Groups, users & activity (the v1-only cluster)

The group-membership, user-lookup, and content-activity surfaces that Confluence
Cloud **only** exposes on the v1 REST API (`/wiki/rest/api`). The v2 API
(`/wiki/api/v2`) has **no group-member endpoints**, no `user/memberof`, and no
CQL search — if you manage seats, audit memberships, or infer user activity, you
live on v1 for these calls (use v2 for everything else).

Source: **License Leash** (axpo-license-manager), a Confluence seat-reclaim app
that revokes/re-grants licenses by adding/removing users from the
`confluence-users-{site}` group and backfills "last active" from content history.
The app runs as Forge (`api.asApp().requestConfluence(route\`…\`)`), but every
path below is identical for an external HTTPS consumer using Basic/OAuth auth —
prepend your base URL and add the `Authorization` header.

## Group membership (write + read)

| Task | Endpoint | Notes |
|---|---|---|
| Add user to group | `POST /wiki/rest/api/group/userByGroupId?groupId={id}` body `{"accountId":"…"}` | 200/204 on success |
| Remove user from group | `DELETE /wiki/rest/api/group/userByGroupId?groupId={id}&accountId={aid}` | idempotent-ish: 404 = already absent |
| List members (paginated) | `GET /wiki/rest/api/group/{groupId}/membersByGroupId?start=0&limit=200` | offset pagination, **max `limit=200`** |
| Count members cheaply | `GET /wiki/rest/api/group/{groupId}/membersByGroupId?limit=1&shouldReturnTotalSize=true` | read `totalSize` (falls back to `size`) — one call instead of paging every member |
| Resolve group by name | `GET /wiki/rest/api/group/by-name?name={name}` | returns `{id,name}` — you need the `id` for the `*ByGroupId` calls |
| List all groups | `GET /wiki/rest/api/group?start=0&limit=200` | offset pagination; **returns groups from ALL sites in the org** (see Multi-site) |
| User's own memberships | `GET /wiki/rest/api/user/memberof?accountId={aid}&start=0&limit=200` | paginated; the authoritative "what groups is this user really in" |

Prefer the `*ByGroupId` variants over the older `?groupName=` ones — group names
are not unique across an org, group ids are. Membership reads use **`start`/`limit`
offset pagination** (not v2's cursor `_links.next`); stop when `results.length < limit`.

```javascript
// Count members without paging the whole group (License Leash getGroupMemberCount)
const r = await fetch(
  `${BASE}/wiki/rest/api/group/${groupId}/membersByGroupId?limit=1&shouldReturnTotalSize=true`,
  { headers: authHeaders });
const { totalSize, size } = await r.json();
const memberCount = totalSize ?? size;       // license-limit gate reads this
```

> GOTCHA — **suspended users are silently omitted from membership reads.** The
> `membersByGroupId` results carry no `status`/`active` field, and a suspended
> account simply doesn't appear. You cannot detect suspension from Confluence
> alone. For suspended visibility, cross-reference the Org API
> (`/v1/orgs/{orgId}/directory/users`) — see `atlassian-organizations-api-skill`.

## User lookup & email

| Task | Endpoint | Returns |
|---|---|---|
| Profile | `GET /wiki/rest/api/user?accountId={aid}` | `displayName`, `accountType`, `profilePicture.path`, `publicName` |
| Email (separate call + scope) | `GET /wiki/rest/api/user/email?accountId={aid}` | `{ "email": "…" }` |

Email is a **separate, separately-permissioned** endpoint. Reading it requires
the `read:email-address:confluence` scope (OAuth) or, in Forge, an `asApp()` call
with that scope granted — a plain **user-context** token frequently lacks email
permission and the call 403s/returns null even when the profile call succeeds.
Don't assume `GET /user` includes the address; on most tenants it returns
`publicName` only and you must hit `/user/email` with the right scope.

## CQL activity backfill (v1 only — no v2 equivalent)

When you have no access to the Org API's last-active dates, you can approximate a
user's "last active" from **content history** via CQL search. License Leash
combines three signals and takes the most recent:

```javascript
// 1. last edit  — captures editors
GET /wiki/rest/api/search?cql=contributor="{accountId}" ORDER BY lastmodified DESC&limit=3&expand=content.version
// 2. last create — captures authors
GET /wiki/rest/api/search?cql=creator="{accountId}" ORDER BY created DESC&limit=1
// 3. last watched-content change — partial proxy for engagement
GET /wiki/rest/api/search?cql=watcher="{accountId}" ORDER BY lastmodified DESC&limit=1
```

Read the timestamp from `result.content.version.when` (edit), `content.history.createdDate`
(create), or `result.lastModified` (watcher); sort and keep the newest. Quote the
`accountId` (`contributor="…"`) and never interpolate raw user input into a CQL
string — see CQL injection avoidance in `24-rest-integration-patterns.md`.

**Limitation (be honest about it):** this is content history only. It cannot see
**logins or pure page views** — a read-only user who never edits, creates, or
watches anything looks permanently inactive. CQL is the *fallback*; the Org API
`last-active-dates` endpoint is the authoritative source for view/login activity.
Budget ~3 sequential searches per user; bound the concurrency (License Leash uses
a small pool) and it is markedly slower than one Org-API call.

## Multi-site group contamination

`GET /wiki/rest/api/group` returns **every group across every site in the org**,
not just the site you think you're talking to. On a multi-site org a naive
membership audit silently mixes `confluence-users-siteA` with
`confluence-users-siteB`.

Derive the current site name from the access group naming convention and filter:

```javascript
// License Leash: deriveSiteNameFromGroup — the confluence-users-{site} group
// names the site. Filter all lookups to *-{site} plus explicit global admins.
const g = (await listAllGroups()).find(g => /^confluence-users-(.+)$/.test(g.name));
const site = g && g.name.match(/^confluence-users-(.+)$/)[1];
// keep groups whose name endsWith(`-${site}`) + explicit globals: site-admins, org-admins
```

> Performance: the live `/wiki/rest/api/group` listing takes **20–30 s on large
> orgs** (observed in production, 2026-06) and group-picker UIs hit it twice.
> Cache the group list (License Leash snapshots it to a `groups_cache` table on
> each sync and serves the cache to settings UIs — at most one-sync-stale).

### Which groups grant a billable seat

Not every Confluence group is a license. License Leash's name-pattern floor
(used when the Org API is unavailable; the Org API role-assignment path agrees):

| Group pattern | Grants a seat? | On revoke |
|---|---|---|
| `confluence-users[-{site}]` | **Yes** (User/App-admin role) | remove to reclaim the seat |
| `confluence-admins[-{site}]`, `confluence-administrators`, `site-admins`, `org-admins` | yes, but **admin** | **NEVER remove** — strips admin rights, not just a seat |
| `confluence-user-access-admins[-{site}]` | **No** — administers users/groups, grants no product access | leave |
| `confluence-guests-{site}` | **No** — Guest role (free, read-only, no seat) | see below |

### Guest groups are a reactivation backdoor

`confluence-guests-{site}` is a built-in group; Atlassian classifies its members
as **Guests** (they keep their login, consume no seat, get read-only access to
content explicitly shared with them). Adding a license-revoked user to a guest
group lets them reach unlicensed/public pages again — effectively a soft
reactivation. Detect guest-only status via the Org API role-assignment (a
guest-only role), not from the Confluence group read.

## Group writes from background jobs: Org-API-first, REST-fallback

Membership **writes** (`POST/DELETE …/userByGroupId`) need a privileged identity.
In a scheduled/web-trigger context there is no authenticated user, so a
user-scoped token can't perform the write. License Leash uses an Org-API-first
ladder and falls back to Confluence REST (`addToGroupWithFallback`):

```javascript
// Prefer the Org API for group writes (no user context needed, works in cron
// jobs); fall back to the Confluence REST group endpoint. Returns which path won.
async function addToGroupWithFallback(groupId, accountId) {
  if (await isOrgApiConfigured()) {
    const org = await addUserToGroupViaOrgApi(groupId, accountId);
    if (org.success) return { ok: true, via: 'org-api' };
    // log + fall through to REST
  }
  await addUserToGroup(groupId, accountId);   // POST …/userByGroupId
  return { ok: true, via: 'forge' };
}
```

See `24-rest-integration-patterns.md` (pattern 12) for the auth-context detail and
`atlassian-organizations-api-skill` for the Org API group endpoints.

> **Eventual consistency.** Suspending or reactivating a user at
> `admin.atlassian.com` (or the Org API) is **not** immediately reflected in
> Confluence group reads — propagation takes minutes (observed in production,
> 2026-06). The org/admin view shows the user Active within minutes while a group
> read still lags. Re-check the more-authoritative Org API before acting on a
> membership read, and don't treat a freshly-changed user's stale membership as
> truth.

## No native email → notify via Jira

Confluence has no "send this user an email" REST endpoint. License Leash sends
suspension/warning mail by posting to a **Jira** issue's notify endpoint
(the app spans both products):

```javascript
POST /rest/api/3/issue/{issueKey}/notify
{ "subject": "...", "htmlBody": "...", "textBody": "...",
  "to": { "users": [ { "accountId": "..." } ] } }
// 204 No Content === sent
```

Requires a designated Jira issue (its key is configured) and the integration/app
authorized on the Jira side too. A `204` is success; anything else is a failure to
log. For an in-Confluence alternative that needs no Jira, post a footer comment
that **@mentions** the user (pattern 11 in `24-rest-integration-patterns.md`) —
Confluence then emails them per their own notification preferences.

## See also

- `24-rest-integration-patterns.md` — Org-API-first write ladder (pattern 12), CQL injection avoidance (pattern 9)
- `gotchas.md` — v1-only surfaces, suspended-user invisibility, multi-site contamination
- `atlassian-organizations-api-skill` — per-product license management, suspended-user visibility, `last-active-dates`, Org API group writes
- `jira-api-skill` — the `/issue/{key}/notify` endpoint shape
