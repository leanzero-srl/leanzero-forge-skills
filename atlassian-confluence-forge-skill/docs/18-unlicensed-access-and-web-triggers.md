# Unlicensed Access & HMAC Web Triggers

How to build a self-service page reachable by users who do **not** hold a Confluence license, and how to send them a one-click email link that performs a privileged action securely. Grounded in License Leash (`manifest.yml`, `src/services/auth-service.ts`, `src/handlers/web-reactivation.ts`, `src/services/reactivation-eligibility.ts`, `src/services/deactivation-service.ts`, `src/services/email-service.ts`).

## `unlicensedAccess` on Confluence modules

`confluence:globalPage` and `confluence:pageBanner` support `unlicensedAccess`, which exposes the module to users without a product license. Valid values:

| Value | Who | `context.accountId` |
|---|---|---|
| `unlicensed` | **Guest Users** (e.g. members of `confluence-guests-{site}`) | populated (a guest identity) |
| `anonymous` | Anyone not logged in | **null / `'unidentified'`** |

> `customer` is the **JSM** value (`jiraServiceManagement` modules), not Confluence — don't mix them up.

License Leash exposes a reactivation page to both: email recipients who follow a deep link while logged out (`anonymous`) and guests browsing in-product (`unlicensed`):

```yaml
confluence:globalPage:
  - key: reactivation-page-confluence
    resource: reactivationPage
    resolver: { function: reactivationResolver }
    route: reactivate-confluence-access
    title: Reactivate Confluence Access
    unlicensedAccess:
      - anonymous
      - unlicensed

confluence:pageBanner:
  - key: reactivation-banner
    resource: reactivationBanner
    resolver: { function: reactivationResolver }
    unlicensedAccess:
      - unlicensed            # the banner only fires for in-product guests
```

In the resolver, treat `accountId` as possibly absent under `anonymous` and gate on it:

```typescript
export function isAuthenticated(accountId?: string | null): boolean {
  return !!accountId && accountId !== 'unidentified';   // 'unidentified' = anonymous context
}
```

See https://developer.atlassian.com/platform/forge/access-to-forge-apps-for-unlicensed-users/#confluence-forge-modules.

### Keep login without a seat: guest groups
To let a deactivated user still reach an in-product reactivation surface, make them a Confluence **Guest** by adding them to the native `confluence-guests-{site}` group (after removing them from `confluence-users-{site}`). admin.atlassian.com only reads their App Access role as "Guest" when they hold guest membership **without** the product group. (License Leash dropped an earlier auto-provisioned landing-space approach — guest groups can't receive space-level permissions, and several v1 space-permission writes silently no-op on v2 tenants.) Group writes go through Org API with a Confluence-REST fallback — cross-reference `atlassian-organizations-api-skill` and `confluence-api-skill` for the license-via-group-membership mechanics.

## HMAC-signed capability tokens for web triggers

A web trigger is a public HTTPS endpoint. To let an email link perform a privileged action without an Atlassian login, embed a **signed, expiring capability token** and verify it constant-time.

```typescript
// auth-service.ts
import crypto from 'crypto';
const EXPIRY_HOURS = 168;   // 7 days

export function generateReactivationToken(accountId: string, secret: string, expiryHours = EXPIRY_HOURS): string {
  const expiry = Date.now() + expiryHours * 3600 * 1000;
  const payload = `${accountId}:${expiry}`;
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return Buffer.from(`${payload}:${signature}`).toString('base64url');   // url-safe wrapper
}

export function verifyReactivationToken(token: string, secret: string) {
  try {
    const decoded = Buffer.from(token, 'base64url').toString();
    const parts = decoded.split(':');
    if (parts.length < 3) return { valid: false, reason: 'Malformed token' };

    // Parse from the RIGHT: legacy account ids (557058:uuid) contain colons.
    const signature = parts[parts.length - 1];
    const expiryStr = parts[parts.length - 2];
    const accountId = parts.slice(0, parts.length - 2).join(':');   // rejoin any colons
    const expiry = parseInt(expiryStr, 10);
    if (!accountId)        return { valid: false, reason: 'Malformed token' };
    if (isNaN(expiry))     return { valid: false, reason: 'Invalid expiry' };
    if (Date.now() > expiry) return { valid: false, reason: 'Token expired' };

    const expected = crypto.createHmac('sha256', secret).update(`${accountId}:${expiryStr}`).digest('hex');
    const a = Buffer.from(signature, 'hex'), b = Buffer.from(expected, 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { valid: false, reason: 'Invalid signature' };
    return { valid: true, accountId };
  } catch {
    return { valid: false, reason: 'Token decode failed' };
  }
}
```

Critical details:
- **256-bit secret** (`crypto.randomBytes(32).toString('hex')`), generated once and stored in the app's config store (License Leash keeps it in the `app_config` SQL table via `ensureHmacSecret()`). Rotating it invalidates every outstanding link.
- **Parse the accountId from the right**, not `split(':').length === 3` — Atlassian account ids of the legacy `557058:uuid` form contain colons; a naive split rejects every one of them.
- **`crypto.timingSafeEqual`** on equal-length buffers — never `===` on the signature (timing oracle). Check length first; `timingSafeEqual` throws on a length mismatch.
- The web handler returns a **generic "Invalid Link"** page for every failure class so the response can't be used as an oracle.

### Resolve the web-trigger URL at runtime — never hardcode it

The public URL varies per environment and is only known after deploy. Get it with `webTrigger.getUrl(key)`:

```typescript
import { webTrigger } from '@forge/api';
const baseUrl = await webTrigger.getUrl('reactivation-webtrigger');   // manifest webtrigger key
const url = `${baseUrl}?token=${generateReactivationToken(accountId, hmacSecret)}`;
```

### Web-trigger handler shape

```typescript
export const handler = async (request: ForgeWebTriggerRequest): Promise<ForgeWebTriggerResponse> => {
  await ensureMigrations();
  const token = request.queryParameters?.token?.[0];   // query params are string[] arrays
  if (!token)  return html(400, 'Missing Token', 'No reactivation token provided.');
  const secret = await getConfigValue(CONFIG_KEYS.HMAC_SECRET);
  const v = verifyReactivationToken(token, secret);
  if (!v.valid || !v.accountId) return html(403, 'Invalid Link', 'This link is invalid or has expired.');
  // ... re-check eligibility (below) before acting ...
  return html(200, 'Access Reactivated', result.message);
};
```

## Authenticity ≠ authorization: re-evaluate eligibility

A valid token proves *you issued it*; it does **not** prove the action is still allowed (the user may have been suspended at the org level since the email went out). Re-run a **tiered eligibility engine** before acting (`reactivation-eligibility.ts`):

1. **Auth gate** — anonymous/unidentified → reject.
2. **Org hard precondition** — if Org API is configured and reports `suspended`/`deactivated`/`for_deletion`, reject (org state wins over everything).
3. **App-deactivation tier** — our own append-only audit shows an unmatched DEACTIVATED (no later REACTIVATED) → eligible. This runs **before** the "already active" short-circuit because the Confluence group-members REST read is eventually consistent and can lag our own writes (see `24-production-patterns.md` Pattern 15).
4. **Already-active short-circuit** — local activity shows current access → "already active".
5. **Org-API history tier** — Org API confirms prior Confluence activity on **this** site (scoped by `cloudId`; **fail closed** if the workspace can't be resolved, so activity on a different Confluence in the same org doesn't qualify).
6. **Fail closed** — no evidence → reject with a contact-admin message.

`cloudId` is **null in web-trigger context**, so Tier 5 can't resolve the workspace from an email link — but Tier 3 (app-initiated deactivation) covers every legitimate email recipient by construction.

## Email without a third-party provider

Forge has no native email API. If Jira is installed on the same site, route mail through Jira's notification engine: `POST /rest/api/3/issue/{issueKey}/notify` (a `204` means sent). See `24-production-patterns.md` Pattern 14 for the full helper.

```typescript
const r = await api.asApp().requestJira(route`/rest/api/3/issue/${issueKey}/notify`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ subject, htmlBody, textBody, to: { users: [{ accountId }] } }),
});
return r.status === 204;
```

This requires the app to also be installed on Jira and the `write:jira-work` scope, plus a persisted dummy issue key.

## Scope note

`read:email-address:confluence` requires `asApp()` — the calling user's context may lack permission to read other users' email addresses.

## See also

- `24-production-patterns.md` — Pattern 9 (HMAC web trigger), Pattern 13 (Org API), Pattern 14 (Jira-notify email), Pattern 15 (trust local audit).
- `17-forge-sql.md` — the `app_config` table holding the HMAC secret.
- `atlassian-organizations-api-skill` / `confluence-api-skill` — license-via-group-membership, guest groups.
- `12-permissions-scopes.md` — scopes for the REST calls above.
