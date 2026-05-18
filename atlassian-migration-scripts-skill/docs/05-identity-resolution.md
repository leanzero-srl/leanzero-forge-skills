# Identity Resolution

The hardest part of any Atlassian migration is mapping users and groups from the source identity model to Cloud's. This doc covers the `IdentityResolver` template and the rules around `accountId` / `groupId`.

## The core rule: `accountId` only

Cloud's REST API removed `username` and `userKey` in 2019 (GDPR-driven). The only stable user identifier in Cloud is **`accountId`** — a 24-char hex string like `557058:f5fcdba9-...`.

```
GOOD:  { reporter: { accountId: "557058:f5..." } }
BAD:   { reporter: { name: "alice" } }              ← throws 400 / silently drops field
BAD:   { reporter: { emailAddress: "alice@..." } }  ← throws 400 / silently drops field
```

Anywhere you'd write a username in DC, you must look up an `accountId` for Cloud. The resolver class does this once per user, caches the result to disk, and reuses it across runs.

## Email is nullable

Atlassian's per-user privacy controls let users hide their email address from the REST API. When that's enabled:

- `GET /rest/api/3/user?accountId=X` returns `{ emailAddress: null, ... }`.
- `GET /rest/api/3/user/search?query=alice@example.com` returns `[]` (no email index).
- The user still exists, still has an `accountId`, and still appears in issue assignments — they just don't surface by email.

Anonymized users get display-name aliases like `jirauser80900`. They cannot be looked up by email at all.

Implication for migration: **email is a hint, not an identifier**. Always fall back to display name when email lookup fails, and accept that display-name lookups can be ambiguous.

## The `IdentityResolver` API

```javascript
const IdentityResolver = require("../src/identityResolver");

const resolver = new IdentityResolver(cloudClient, {
  cacheDir: "logs",
  userMappingCsv: "users.csv",        // optional manual override
  groupMappingCsv: "groups.csv",      // optional manual override
});

const u = await resolver.resolveUser({
  email: "alice@example.com",
  displayName: "Alice Smith",
});
// → { accountId: "557058:f5...", source: "email" }    cache HIT
// → { accountId: "557058:f5...", source: "displayName" }    fallback
// → { accountId: null, source: "displayName", multiMatch: true }    ambiguous
// → { accountId: null, source: "miss" }    not found

const g = await resolver.resolveGroup("confluence-users");
// → { groupId: "920aafff-3b25-...", source: "cache" }
// → { groupId: null, source: "miss" }
```

The `source` field tells you where the answer came from. Useful for:

- Auditing: how many of your resolutions used the manual override vs the cache vs a fresh API call?
- Debugging: a `multiMatch=true` result means displayName collisions; add a CSV override row to disambiguate.

## Resolution priority

1. **CSV override** — manual mapping file you hand to the resolver.
2. **On-disk cache** — `logs/cache_users.json`, `logs/cache_groups.json`.
3. **Email search** — `GET /rest/api/3/user/search?query=<email>`.
4. **Display-name search** — same endpoint; only accepts exact (case-insensitive) match.

Step 1 wins because operators sometimes know things the API doesn't (former employee who was off-boarded but whose data still needs to migrate; a privacy-restricted account whose email is masked).

## CSV override format

```csv
source,dest
alice@example.com,557058:f5fcdba9-...
"Alice Smith",557058:f5fcdba9-...
alice,557058:f5fcdba9-...
```

Header is required. The first column (whatever it's named) is the source key — match against the lowercased value of `email`, then `displayName`. The second column is the `accountId`.

You can name the columns whatever you want (`email`/`accountid`/`name`/`groupid` are accepted as synonyms for the canonical `source`/`dest`).

## Cache files

`logs/cache_users.json` is a plain `{ key: accountId }` JSON object. It's auto-saved after every successful resolution. To force a re-lookup, delete the file (or the specific key) and re-run.

Don't check in the cache — it leaks accountIds (which are stable per-user identifiers and considered PII under some privacy regimes). The cache is per-machine, gitignored, and rebuildable.

## Discover-then-resolve at plan time

Build the resolver once during the plan phase and resolve everything ahead of the sync phase:

```javascript
// In plan.js
const usersToResolve = new Set();
for (const sourceUser of discoveredUsers) usersToResolve.add(sourceUser.email);

const resolutionMap = {};
for (const email of usersToResolve) {
  const r = await resolver.resolveUser({ email });
  resolutionMap[email] = r.accountId;
}
fs.writeFileSync("mappings/users.json", JSON.stringify(resolutionMap, null, 2));
```

Then in `sync.js`, read `mappings/users.json` and use it directly — no live resolution needed during the mutating phase. This means:

- The sync phase has no surprise latency from user lookups.
- A user who is suddenly hidden between plan and sync doesn't cause a mid-sync failure.
- The mapping file is reviewable. An operator can check it into git and assign blame at audit time.

## Handling `multiMatch`

When two Cloud users share a display name (e.g. two "Alex Chen"s), display-name resolution returns `{ accountId: null, multiMatch: true }`. You can't disambiguate from the API alone. Options:

1. **Add a CSV override row** mapping the source identity to a specific accountId. The operator picks based on email, hire date, or team.
2. **Skip in the plan** with an explicit reason in the CSV (`reason: "display name ambiguous"`) and surface it in the failed-entries report.
3. **Use email exclusively** for the ambiguous set — even if email lookup failed elsewhere, force the email branch for these specific names.

Don't guess.

## `x-atlassian-force-account-id` for tests

You can simulate "all users have anonymized accountIds" by sending this header on every request:

```javascript
options.headers["x-atlassian-force-account-id"] = "true";
```

The API responds with anonymized identifiers everywhere, even for users whose privacy settings would otherwise expose them. Useful for testing the displayName-fallback path against a production tenant — turn it on in a `--dev` flag for one run, see what breaks.

## See also

- [`post-jcma-id-mapping.md`](post-jcma-id-mapping.md) — wider treatment of every ID that changes
- [`gotchas.md`](gotchas.md) — privacy-mode and anonymization edge cases
- [`24-production-patterns.md`](24-production-patterns.md) — pattern 7 (displayName disambiguation)
