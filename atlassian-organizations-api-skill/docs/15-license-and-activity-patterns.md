# License & Activity Patterns (per-product, per-site)

Battle-tested patterns for using the Org API to **manage product licenses by group
membership** and to **read per-site activity** — distilled from the License Leash
("axpo-license-manager") Forge app, which runs these endpoints in production against a
multi-site org. The other docs in this skill cover the resource endpoints in isolation;
this one documents the *operational cluster* you actually compose to (a) know who's
using a product on a specific site and (b) grant/revoke that product's seat without
touching anything else.

> All endpoints are under `https://api.atlassian.com/admin`. Auth is the **Admin API
> key** as a Bearer token (admin.atlassian.com → Settings → API keys; **Org Admin role
> required**; the key is **shown once** at creation). The **org id** is the UUID after
> `/o/` in the admin console URL (`admin.atlassian.com/o/<org-id>/…`) — not the site name.

---

## Why the Org API (not Confluence/Jira REST) inside scheduled triggers

This is the headline reason to reach for the Org API from a Forge app:

- A **scheduled trigger has no user context**, so `api.asUser().requestConfluence(...)`
  throws `PROXY_ERR: AUTH_TYPE_UNAVAILABLE` before returning a response.
- `api.asApp()` can fall back, but it requires every Forge scope to be granted; on a
  not-fully-upgraded install that also fails.
- The Org API sidesteps both: **bearer auth, no user context, no Forge scope upgrade.**
  License Leash tries the Org API first for every read/write and only falls back to
  Confluence REST for orgs that haven't configured a key yet.

It also sees things product REST can't: **suspended users** (the Confluence group API
silently hides them — there's no status field), accurate **per-site last-active**, and
the **complete set of license-granting groups** (including ones not following the
`confluence-users-{site}` naming convention).

---

## The endpoint cluster

| Method & path (under `…/admin`) | Purpose |
|---|---|
| `GET /v1/orgs/{orgId}/directory/users/{accountId}/last-active-dates` | Per-product last-active timestamps |
| `POST /v2/orgs/{orgId}/workspaces` | Resolve THIS site's Confluence workspace id |
| `GET /v2/orgs/{orgId}/directories` | Auto-detect the directory id (usually one) |
| `GET /v2/orgs/{orgId}/directories/-/users` | All users incl. suspended (cursor-paged) |
| `GET /v2/orgs/{orgId}/directories/{dirId}/users/{accountId}` | Single-user org status (`active`/`suspended`/`not_invited`/`deactivated`/`for_deletion`) — the **reactivation hard-gate**: a non-`active` org status blocks reactivation regardless of license tier |
| `GET /v2/orgs/{orgId}/directories/{dirId}/groups?resourceIds={siteAri}&resourceOwners=confluence` | Forward-filter for license-granting groups on this site |
| `GET /v2/.../groups/{groupId}/role-assignments` | Authoritative product access for a group |
| `POST /v2/.../groups/{groupId}/memberships` | Add user (`{accountId}`) |
| `DELETE /v2/.../groups/{groupId}/memberships/{accountId}` | Remove user |
| `POST /v2/.../groups/{groupId}/role-assignments/assign` `/revoke` | Grant/revoke a product role to a group |
| `POST /v2/.../users/{accountId}/suspend` `/restore` | EXIST — but never use for license mgmt (see below) |

> v1 group/role-assignment endpoints are **deprecated after 2026-06-30** (see
> `gotchas.md`). License Leash uses **v2 throughout** for the whole cluster — match that.

---

## Pattern 1 — License via group membership (per-product, per-site)

The core insight Atlassian's own admin product-access page relies on: **group membership
plus a group→product role-assignment is what grants a billable seat.** So:

- **Remove** a user from `confluence-users-{site}` (or any group with a Confluence
  role-assignment to this site) → they lose the **Confluence seat on THIS site only**.
  Jira and every other product, and Confluence on other sites in the org, are untouched.
- **Add** a user to that group → they regain the seat. Idempotent.

Contrast with **account suspend** (`.../users/{accountId}/suspend`), which removes access
to **all products on all sites globally** — the wrong tool for per-product license work.
License Leash ships `suspendUser`/`restoreUser` but **never calls them** from any license
path. The rule: **free a seat by group removal, never by suspend.**

```javascript
// POST .../groups/{groupId}/memberships  body { accountId }
// 204/200 = added. 409 "already in group" = treat as SUCCESS (idempotent).
// 409 without "already" = user limit reached / real conflict → surface it.
if (res.status === 409) {
  const body = await res.text().catch(() => '');
  if (/already/i.test(body)) return { success: true, status: 409, message: 'already in group' };
  return { success: false, status: 409, message: 'user limit reached: ' + body };
}

// DELETE .../groups/{groupId}/memberships/{accountId}
// 204/200 = removed. 404 = already removed → treat as SUCCESS.
if ([200, 204, 404].includes(res.status)) return { success: true };
```

### Guard: never free a seat through an IdP-managed group

A group managed by an external IdP (SCIM / Entra) has **read-only membership** — a removal
would be reverted by the next sync. The Org Admin API `MultiDirectoryGroup` schema exposes
this; treat the group as external if **any** of these say so:

```javascript
const external =
     g.managementAccess?.modifiable === false   // authoritative gate
  || g.managedBy === 'external'                  // corroborates
  || g.externalSynced === true;                  // corroborates
// modifiable === false is the one to trust; absent fields default to writable.
```

---

## Pattern 2 — Resolve THIS site's Confluence workspace (multi-site scoping)

In a multi-site org, last-active and role-assignment data span every Confluence
instance. To attribute activity/licenses to **one** site you need that site's
**workspace id**, resolved against the Org API (never trust a raw `cloudId` as a
workspace id without seeing it in the workspace list).

```javascript
// POST /v2/orgs/{orgId}/workspaces  (cursor-paged; body {} per page)
// Match a Confluence workspace by cloudId hint OR hostUrl containing the site name.
// The product discriminator has appeared as attributes.typeKey, attributes.type,
// or the top-level type across tenants — accept any.
const typeStr = String(attrs.typeKey || attrs.type || ws.type || '').toLowerCase();
if (!typeStr.includes('confluence')) continue;
const matchesCloudId = cloudIdHint && ws.id === cloudIdHint;
const matchesHost = siteName && attrs.hostUrl
  && attrs.hostUrl.toLowerCase().includes(siteName.toLowerCase());
if (matchesCloudId || matchesHost) { /* cache ws.id, done */ }
```

**Cache it** (`app_config.org_confluence_workspace_id`) — it's stable per install.
**Fail closed** if it can't be resolved: do NOT run an unscoped cross-site query that
would count activity on another Confluence as if it were this one.

---

## Pattern 3 — Per-site last-active (the 24h / "2s view" caveats)

```javascript
// GET /v1/orgs/{orgId}/directory/users/{accountId}/last-active-dates
// Response: data.product_access[] of { id, key, last_active, last_active_timestamp }
//   id  = full site ARI  ari:cloud:confluence::site/{cloudId}
//   key = 'confluence' | 'jira' | ...
const entries = (result.data?.product_access || [])
  .filter(p => p.key === 'confluence')
  .filter(p => !workspaceId || resourceMatchesSite(p.id, workspaceId)) // pin to THIS site
  .sort((a, b) => (b.last_active_timestamp || b.last_active || '')
                  .localeCompare(a.last_active_timestamp || a.last_active || ''));
const newest = entries[0];
// prefer the timestamp; the date-only form needs a synthetic T00:00:00Z
return newest?.last_active_timestamp
  || (newest?.last_active ? `${newest.last_active}T00:00:00Z` : null);
```

Empirical caveats observed in production (2026-06):

- **"Active" = the user viewed the product for 2+ seconds.** Pure read activity counts —
  this is the signal product-content APIs (CQL edit/comment history) can't see.
- **Delayed up to ~24h.** Don't treat last-active as real-time (matches the documented
  audit-event delay in `gotchas.md`).
- **Rate limit ~200 req/min/org** (observed; not officially published — verify against
  current docs). See pacing below.
- ARIs vs bare cloudId: `product_access[].id` is the full ARI; the cloudId you hold is the
  bare UUID. Match with `resourceId === cloudId || resourceId.endsWith('/' + cloudId)`.

### When last-active is empty — anchor, don't stamp "now"

A genuinely-never-active user returns no `product_access` entry. If you stamp such a user
with `now()`, they become un-revokable forever. Instead fall back to the org join date:

```javascript
// GET /v2/orgs/{orgId}/directories/{dirId}/users/{accountId} → data.data?.addedToOrg
// Use addedToOrg as the last-resort activity anchor for users with no other signal.
```

A **swallowed 429** is indistinguishable from "no data" and causes the same false
"inactive" stamp — so retry the 429 (below) rather than letting it fall through to the
anchor.

---

## Pattern 4 — Forward-filter for license-granting groups (avoid the 10k-group scan)

Don't page all org groups looking for the ones that grant a seat on your site. Ask the
directory for **only** the groups with a role-assignment to your site's ARI — the same
forward lookup the admin product-access page uses:

```
GET /v2/orgs/{orgId}/directories/{dirId}/groups
      ?resourceIds=ari:cloud:confluence::site/{cloudId}
      &resourceOwners=confluence
```

`searchTerm=` is the other cheap filter (matches the group `name` field) — use it to find
a just-created group by name instead of paging the directory.

Then read the group's **authoritative product access**:

```
GET /v2/.../groups/{groupId}/role-assignments
  → data[] of { resourceOwner, resourceId, roles }
```

Membership ≠ product access. A group grants a **billable seat** on your site when it has a
Confluence role-assignment to your ARI whose role is **anything except `guest` and
`user-access-admin`** (those appear on the product-access page but don't consume a license):

```javascript
function grantsLicense(a) {                 // a.roles: string[]
  if (!a.roles?.length) return true;        // unknown → don't silently drop
  return a.roles.some(r => {
    const role = String(r).toLowerCase();
    if (role.includes('guest')) return false;
    if (role.replace(/[_\s]/g, '-').includes('user-access-admin')) return false;
    return true;
  });
}
// Product/site ADMIN (exempt from a leash) = same exclusions, but role contains 'admin'.
// This THIS-SITE role signal beats trusting membership in a group merely NAMED "site-admins"
// (often IdP/bulk-populated with non-admins).
```

---

## Pattern 5 — App Access Funnel: create a managed group + assign the seat role

The one thing **only** the Org API can do: assign a **product role** to a group so
membership grants a license. (Confluence REST can create a group but cannot assign product
access.) The funnel pattern: create/adopt a managed group, then assign it the Confluence
"User" seat role.

```javascript
// 1) POST /v2/.../directories/{dirId}/groups  body { name, description }
//    201 created. 409 = name exists → fall back to adoption.
//    NOTE: this endpoint does NOT return the new group id.

// 2) Resolve the id by name (the directory lags a create by ~1-2s — read-after-write):
//    GET /v2/.../groups?searchTerm={name}, retry a few rounds, match g.name === name exactly.

// 3) POST /v2/.../groups/{groupId}/role-assignments/assign  body { resourceId, roleId }
//    roleId 'atlassian/user' grants a billable seat.
//    resourceId form is AMBIGUOUS in the docs (bare workspace id vs site ARI vs which ARI
//    namespace). Pass a CANDIDATE LIST and try each, logging exact status/body:
for (const resourceId of candidates) {
  const res = await orgFetch(`/v2/.../groups/${groupId}/role-assignments/assign`,
                             'POST', { resourceId, roleId: 'atlassian/user' });
  if (res.status >= 200 && res.status < 300) return { ok: true, resourceIdUsed: resourceId };
  // 400 "Invalid request body" / 404 "Unknown Resource" = WRONG FORM → try next candidate.
  // Any OTHER status (esp. 409 "Product License Limit Exceeded") means the resource+role
  // were ACCEPTED and you hit a real conflict — STOP and surface THAT, not a later
  // wrong-form 400 that would mask it.
  if (res.status !== 400 && res.status !== 404) break;
}
```

Parse Org API errors from `{"errors":[{"title":"…","detail":"…"}]}`:

```javascript
function parseOrgError(body) {
  try { const e = JSON.parse(body)?.errors?.[0];
        if (e) return [e.title, e.detail].filter(Boolean).join(' — '); }
  catch { /* not JSON */ }
  return (body || '').slice(0, 200);
}
```

---

## Pattern 6 — Credential storage & env-var precedence

Forge storage is **siloed per product**, so the Confluence install and the Jira install of
the same app have separate empty databases. Resolve credentials env-var-first so one
`forge variables set` shares a single key across both:

```javascript
// getCredentials(): env vars OVERRIDE per-install app_config.
apiKey = process.env.ORG_API_KEY  || await getConfigValue('org_api_key');
orgId  = process.env.ORG_ID       || await getConfigValue('org_id');
// also: process.env.ORG_DIRECTORY_ID || getConfigValue('org_directory_id')
```

- Store per-install values in your config table (`app_config.org_api_key` / `org_id` /
  `org_directory_id` / `org_confluence_workspace_id`). **Never log the key**; redact it in
  any audit trail; mask it in the UI after save.
- The Org API only activates when **both** org id and key are present — degrade to the
  no-key path otherwise.

### Warm-isolate cache invalidation

Module-scope caches (`cachedApiKey`, `cachedOrgId`, `cachedDirectoryId`,
`cachedConfluenceWorkspaceId`) survive across invocations because **Forge reuses warm
isolates** — so an admin rotating the key in Settings would keep hitting the stale value.
Expose a `resetOrgApiCache()` and call it right after persisting any org credential.

---

## Pattern 7 — Rate-limit pacing & 429 handling

```javascript
// orgFetch: retry 429 with LINEAR backoff (not immediate null). A swallowed 429
// reads as "no data" to callers and causes false "inactive" stamps.
const MAX_429_RETRIES = 2;
for (let attempt = 0; ; attempt++) {
  const res = await api.fetch(url, opts);
  if (res.status !== 429) return res;
  if (attempt >= MAX_429_RETRIES) return null;            // give up → caller decides
  await new Promise(r => setTimeout(r, 5000 * (attempt + 1)));
}
```

- `getAllOrgUsers` sleeps **300ms between cursor pages** (the `/directories/-/users` walk).
- A daily activity sync uses **bounded concurrency** + an **incremental skip**: don't
  re-query a user whose last-active was refreshed within ~20h. Keeps a full-org refresh
  under the ~200/min ceiling.
- `orgFetch` returning `null` on exhausted 429 lets the caller (e.g. a self-enqueuing
  lookup loop) decide whether to retry, instead of throwing mid-budget.

---

## Graceful degradation summary

| Capability | With Org API key | Without (CQL / Confluence REST only) |
|---|---|---|
| Activity signal | per-site last-active incl. **views** (2s) | content history only (edits/comments/creates) |
| Suspended users | visible (`status` field) | **hidden** (group API omits them) |
| License-group detection | complete (forward-filter + role-assignments) | naming-convention guess only |
| Scope | this-site, multi-site safe | this-site REST |
| Auth in scheduled triggers | bearer, no user context | needs `asApp()` + all scopes granted |

The app **degrades, it doesn't break** — every Org API call returns `null`/empty on a
missing key and the caller falls through to the product-REST path.

---

## See also

- `09-workspaces.md` — the `POST /workspaces` search shape used in Pattern 2.
- `04-groups.md` / `03-users.md` — the underlying group/user endpoints.
- `gotchas.md` — suspend-is-global, last-active 24h delay, v1 deprecation, base-URL trap.
- `templates/last-active-and-membership.js` — copy-pasteable implementation of Patterns
  1, 3 and 7.
- Cross-skill: **atlassian-confluence-forge-skill** (license-via-group-membership from the
  Forge side), **confluence-api-skill** (Confluence group REST endpoints and their
  suspended-user blind spot).
