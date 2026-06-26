/**
 * last-active-and-membership.js
 *
 * Org API patterns for per-site activity reads + per-product license writes via
 * group membership. Distilled from the License Leash Forge app's
 * src/services/org-api-service.ts (runs in production against a multi-site org).
 *
 * Auth: Admin API key as a Bearer token (admin.atlassian.com -> Settings -> API
 *   keys; Org Admin role; shown once). The org id is the UUID after /o/ in the
 *   admin console URL. From a Forge app, declare the host under
 *   permissions.external.fetch.backend: [api.atlassian.com] and use api.fetch.
 *   Do NOT use requestJira/requestConfluence -- api.atlassian.com/admin is not a
 *   product surface and those proxies will not reach it.
 *
 * What this shows (see docs/15-license-and-activity-patterns.md):
 *   - 429 retry with linear backoff (a swallowed 429 reads as "no data").
 *   - Per-site last-active scoped by workspace ARI (multi-site safe).
 *   - Idempotent membership add (409 "already") / remove (404 "already gone").
 *   - "Free a seat by GROUP REMOVAL, never by account suspend" (suspend is global).
 *
 * References:
 *   https://developer.atlassian.com/cloud/admin/organization/rest/
 */

import api from '@forge/api';

const ORG_API_BASE = 'https://api.atlassian.com/admin';

// Resolve credentials env-var-first so one `forge variables set` shares a single
// key across the (per-product-siloed) Confluence and Jira installs of one app.
async function getCredentials() {
  const apiKey = process.env.ORG_API_KEY; // or fall back to your config store
  const orgId = process.env.ORG_ID;
  if (!apiKey || !orgId) return null;
  return { apiKey, orgId };
}

// Single fetch helper with bounded 429 retry. Returns the Response, or null on a
// missing key / exhausted retries so callers can degrade instead of throwing.
async function orgFetch(path, method = 'GET', body) {
  const creds = await getCredentials();
  if (!creds) return null;

  const opts = {
    method,
    headers: {
      Authorization: `Bearer ${creds.apiKey}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
  };
  if (body) opts.body = JSON.stringify(body);

  const MAX_429_RETRIES = 2;
  for (let attempt = 0; ; attempt++) {
    const res = await api.fetch(`${ORG_API_BASE}${path}`, opts);
    if (res.status !== 429) return res;
    if (attempt >= MAX_429_RETRIES) {
      console.warn(`Org API 429 on ${method} ${path} after ${attempt + 1} tries -- giving up.`);
      return null;
    }
    await new Promise((r) => setTimeout(r, 5000 * (attempt + 1))); // linear backoff
  }
}

// Match a product_access[].id (full ARI) or role-assignment resourceId to the bare
// cloudId we hold: exact, or ARI suffix `/{cloudId}`.
function resourceMatchesSite(resourceId, cloudId) {
  if (!resourceId || !cloudId) return false;
  return resourceId === cloudId || resourceId.endsWith(`/${cloudId}`);
}

/**
 * Per-site last Confluence activity for a user (newest timestamp), or null.
 * Pass the resolved workspace cloudId to pin to THIS site; activity on another
 * Confluence in the org is then ignored. "Active" = viewed 2+s; delayed ~24h;
 * rate limit ~200 req/min/org (observed in production 2026-06).
 */
export async function getConfluenceLastActive(accountId, workspaceCloudId) {
  const creds = await getCredentials();
  if (!creds) return null;

  const res = await orgFetch(
    `/v1/orgs/${creds.orgId}/directory/users/${accountId}/last-active-dates`
  );
  if (!res?.ok) return null;

  const result = await res.json();
  const entries = (result.data?.product_access || [])
    .filter((p) => p.key === 'confluence')
    .filter((p) => !workspaceCloudId || resourceMatchesSite(p.id, workspaceCloudId))
    .sort((a, b) =>
      (b.last_active_timestamp || b.last_active || '').localeCompare(
        a.last_active_timestamp || a.last_active || ''
      )
    );

  const newest = entries[0];
  if (!newest) return null;
  return (
    newest.last_active_timestamp ||
    (newest.last_active ? `${newest.last_active}T00:00:00Z` : null)
  );
}

/**
 * Add a user to a license-granting group (grant/reactivate a per-product, per-site
 * seat). Idempotent: 409 "already in group" is success; 409 without "already" is a
 * real conflict (user/license limit). directoryId: auto-detect via
 * GET /v2/orgs/{orgId}/directories and cache it.
 */
export async function addUserToGroup(directoryId, groupId, accountId) {
  const creds = await getCredentials();
  if (!creds) return { success: false, status: 0, message: 'Org API not configured' };

  const res = await orgFetch(
    `/v2/orgs/${creds.orgId}/directories/${directoryId}/groups/${groupId}/memberships`,
    'POST',
    { accountId }
  );
  if (!res) return { success: false, status: 429, message: 'Org API rate limited' };

  if (res.status === 200 || res.status === 204) {
    return { success: true, status: res.status, message: 'Added' };
  }
  if (res.status === 409) {
    const body = await res.text().catch(() => '');
    if (/already/i.test(body)) return { success: true, status: 409, message: 'Already in group' };
    return { success: false, status: 409, message: `User/license limit: ${body}` };
  }
  const body = await res.text().catch(() => '');
  return { success: false, status: res.status, message: body || `HTTP ${res.status}` };
}

/**
 * Remove a user from a license-granting group (revoke a per-product, per-site
 * seat -- Jira and other products, and other sites, are untouched). Idempotent:
 * 404 = already removed = success.
 *
 * Do NOT use POST .../users/{accountId}/suspend for this: suspend removes access
 * to ALL products on ALL sites globally -- the wrong tool for license management.
 *
 * Guard: never remove from an IdP-managed (SCIM/Entra) group -- the next sync
 * reverts it. Treat as external when managementAccess.modifiable === false (or
 * managedBy === 'external' / externalSynced === true).
 */
export async function removeUserFromGroup(directoryId, groupId, accountId) {
  const creds = await getCredentials();
  if (!creds) return { success: false, status: 0, message: 'Org API not configured' };

  const res = await orgFetch(
    `/v2/orgs/${creds.orgId}/directories/${directoryId}/groups/${groupId}/memberships/${accountId}`,
    'DELETE'
  );
  if (!res) return { success: false, status: 429, message: 'Org API rate limited' };

  if ([200, 204, 404].includes(res.status)) {
    return { success: true, status: res.status, message: 'Removed' };
  }
  const body = await res.text().catch(() => '');
  return { success: false, status: res.status, message: body || `HTTP ${res.status}` };
}

/**
 * Walk all org users incl. suspended (the Confluence group API hides them).
 * Cursor-paged with a 300ms sleep between pages to stay under the rate limit.
 */
export async function getAllOrgUsers() {
  const creds = await getCredentials();
  if (!creds) return [];

  const users = [];
  let cursor;
  while (true) {
    const path = cursor
      ? `/v2/orgs/${creds.orgId}/directories/-/users?cursor=${cursor}`
      : `/v2/orgs/${creds.orgId}/directories/-/users`;
    const res = await orgFetch(path);
    if (!res?.ok) break;

    const data = await res.json();
    for (const u of data.data || []) {
      if (u.accountType !== 'atlassian') continue; // skip customer/app accounts
      users.push(u); // { accountId, name, email, status, addedToOrg, ... }
    }

    const next = data.links?.next;
    if (!next) break;
    cursor = new URL(next, 'https://api.atlassian.com').searchParams.get('cursor') || undefined;
    if (!cursor) break;
    await new Promise((r) => setTimeout(r, 300));
  }
  return users;
}
