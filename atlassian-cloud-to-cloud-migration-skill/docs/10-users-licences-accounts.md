# Users, licences and accounts

The people who move need accounts on the target to be reporter/assignee of "their" items and to log in. Inviting them
touches identity (managed vs external accounts), licences (seats per product) and group rules — all owned by the target
org admin. Ask first; then do it cleanly and record everything.

## 1. Map source people to target accounts

- Input: the KEEP list with e-mail addresses the movers will use on the target (provided by the source owner).
- Search the target per person: exact e-mail (`GET /rest/api/3/user/search?query=<email>`), name, and known address
  variants (a contractor-suffixed variant, other domains). Accept a single hidden-e-mail result only after a name
  check where EVERY target name token matches the source name. Field note: a looser check matched a mover to a DIFFERENT person
  on the target who shared the first name and a similar surname — tightened after that.
- Remember the traps from doc 06: deactivated accounts are hidden from user search; a fresh invite is not searchable for
  a while (keep a forced-mappings file); e-mails are hidden for most accounts.
- Output: `movers-accounts.json` = source accountId → target accountId + per-project "assignable" flag
  (`GET /rest/api/3/user/assignable/search?project=K&accountId=X`, non-empty = assignable). Write it atomically
  (tmp + rename; a running post step may read it) and rebuild it right before the reporter/assignee step —
  assignability changes during the day as admins grant roles.
- Accounts are not people: one person can hold several accounts (and the same person can exist under two domains).
  Report people, not accounts, and pick the account on the target organisation's domain.

## 2. Invite people who have no account

```http
POST /rest/api/3/user
{"emailAddress": "first.last@example.com", "products": []}
```

- `products: []` creates the account without granting any product; Atlassian sends an invitation e-mail (intended —
  the only mail of the whole migration that was supposed to go out, and only after the org admin's yes).
- Needs Administer Jira AND the caller must be an **organization admin** (spec) — a site admin who is not org admin
  cannot invite this way.
- Re-search right before each invite; never invite someone who already has an account.
- An address whose account exists WITHOUT Jira access (deactivated, or active on Confluence only) returns **400 with
  the existing user** — do not reactivate or grant on your own; that is the org admin's call. An address whose account
  already HAS Jira access returns **201 and creates nothing**: a 201 is not proof of a new invite.
- Then grant access via GROUPS only (the target admin's rule, and the right one):
  ```http
  POST /rest/api/3/group/user?groupId=<id>     {"accountId": "<id>"}
  DELETE /rest/api/3/group/user?groupId=<id>&accountId=<id>        # revert
  ```
  product-access groups (Jira, Confluence) + a `migration-movers` group that holds the project role.
- Project roles via the group, never individual actors:
  `POST /rest/api/3/project/{key}/role/{roleId} {"group":["migration-movers"]}` (or `groupId`). Field note: individual
  role actors were added first, then the admin asked for groups only; the individual adds were removed after each
  person was proven assignable via the group (check `GET /rest/api/3/user/assignable/search?project=KEY&accountId=`
  before and after).
- Desk agents need a JSM licence to be assignee on desk items; a role alone gives 400 "cannot be assigned".

Before giving reviewers or movers a product-access group: every pre-existing project whose permission scheme grants
Browse to "any licensed user" becomes visible to them (and a team-managed project's simplified scheme may do the same
for YOUR project). List the Browse holders across `GET /rest/api/3/permissionscheme?expand=permissions` first. Check
access from their seat per project with `GET /rest/api/3/user/permission/search?permissions=BROWSE_PROJECTS&projectKey=X&accountId=<id>`
(one call per person: without `accountId` it only walks the site's first 1,000 users)
(filter `accountType=atlassian`, `active`), and Confluence separately — Confluence users can EDIT by site default, so
"view-only" reviewers edited migrated pages until it was set explicitly. A new user's space permission may show only
after a delay or a first login.

Write the approval file BEFORE the act: licences granted to reviewers before the owner's OK had to be recorded as a
retroactive approval, which a reviewer flagged.

## 3. Managed accounts: claiming specific accounts (browser)

The target org required movers' accounts to be **managed** by the org (its verified domain), not external. Claiming is
in admin.atlassian.com → Domains → `<domain>` → Claim accounts. The wizard's DEFAULTS are both org-wide:

- step 1: **"Claim all N accounts"** is pre-selected (N was tens of thousands)
- a later step: **"Automatically claim"** new accounts (marked Recommended) is pre-selected

Pressing Next through it would claim the whole domain and change the org's claim policy. Field note: the first dry run
of the automation proved that a label-based guard had missed the second default — labels are not bound to the inputs;
the review page said "Automatically claim accounts". Guards that held:
- select radios by their VALUE (`custom` vs `all`, `manual` vs `auto`), re-read both radios, abort unless
  custom=checked and all=unchecked
- the review page text must say "Claim specific accounts" AND "Manually claim", else abort
- dry-run mode walks every step, screenshots, and CLOSES before submit
- claim ONE account first, verify it shows "Managed account" on its user page, then the rest
- read the domain row before/after: managed count must rise by exactly your number; claim setting unchanged

Side effect to tell people: claimed accounts fall under the org's authentication policy (e.g. SSO enforced) at their
next login.

Revert: Domains → Unclaim accounts with the same CSV — only with the org admin's agreement.

## 4. Seats: measure, don't guess

```http
GET /rest/api/3/applicationrole        # per product: key, numberOfSeats, userCount, groups[]
```

Works with the API token of an account with Administer Jira (no admin hub). "Does person X hold a seat for product P?" = intersect
`GET /rest/api/3/user/groups?accountId=` with that role's `groups[]`.

- `userCount` drifts daily without anyone migrating; quote it with the date.
- `/applicationrole` covers Jira products; Confluence seat totals are not exposed there. The only measurement that was
  certain was the real operation: a group add that fails with `400 LicenceExceededException: Licence exceeded for:
  ari:cloud:confluence::site/…`. (A GraphQL `license { userLimit licenseConsumingUserCount }` query was reported to work
  on another engagement; not verified here.)
- "We ran out of licences" was relayed from someone else, then measured: Jira Software still had free seats. Measure
  a constraint before relaying it.
- Confluence seats are separate from Jira seats. A group add to a Confluence product group returned
  **`400 LicenceExceededException`** for several movers while their Jira access was fine — the seat cap was reached and
  was not visible from the Jira side. Measure before promising access.
- A seat count derived from project-role membership over-counts: JSM customers sit in a role and need no licence. Drop
  `accountType == customer`, people whose only role is the customer role, the app role, inactive accounts.

## 5. Freeing seats by suspending long-inactive users (only on the owner's instruction)

Field note: the target org admin asked for long-inactive users to be suspended and recorded for a later restore. How
it was done:

**Read (admin hub session APIs — a user API token gets 401 on these):**

```js
// inside a logged-in admin.atlassian.com page (fetch with credentials: "include")
POST https://admin.atlassian.com/gateway/api/admin/v2/orgs/{orgId}/directories/-/users/search
     {"limit":100, "accountStatus":["active"], "membershipStatus":["active"],
      "resourceIds":["ari:cloud:confluence::site/<cloudId>"], "expand":["platformRoles"], "cursor": "<links.next>"}
  -> data[]: accountId, name, email, claimStatus, addedToOrg, status, membershipStatus, platformRoles
GET  https://admin.atlassian.com/gateway/api/admin/v1/orgs/{orgId}/directory/users/{accountId}/last-active-dates
  -> data.product_access[]: {id: <site ARI>, key: "confluence"|"jira-software"|..., last_active, last_active_timestamp}
```

The same family is available with an org API key (Bearer) on `https://api.atlassian.com/admin/...` — see
`atlassian-organizations-api-skill/docs/15-license-and-activity-patterns.md`.

**Select** (`templates/inactive_users_report.py` does this from the saved JSON, read-only):
- last activity in ANY product (not just the one you need a seat for) older than the agreed threshold
- EXCLUDE anyone added to the org in the last 90 days — new accounts (your movers!) show as never active
- EXCLUDE everyone on the KEEP/movers/tester lists and the migration accounts
- EXCLUDE org/site admins — the users search returns `platformRoles` ONLY with `"expand":["platformRoles"]` in the
  body; without it every admin looks like an ordinary candidate (the report refuses such input)
- a last-active call that failed (429, error) is UNKNOWN, never "never active" — the capture snippet records the error
  and the report lists those as `unknown`
- flag "never active" accounts that have been in the org for months separately (and obviously
  wrong addresses, e.g. a misspelled domain, which are safe candidates)
- show the list to the person who authorised it, or apply exactly their stated rule

**Suspend** (the org-level action):

```http
POST https://admin.atlassian.com/gateway/api/admin/v2/orgs/{orgId}/directories/{directoryId}/users/{accountId}/suspend   -> 204
POST .../users/{accountId}/restore                                                                                     # revert
```

- A guessed public path (`…/v1/…/suspend-access`) answered 404; the working call was captured from the admin UI's own
  network traffic during a read-only recon.
- Re-read each user afterwards: `membershipStatus` must be `suspended`. One account returned 403 (it had access on a
  second site of the org) and was left alone.
- **The UI menu item "Suspend access" fires immediately with NO confirmation dialog.** Field note: a "dry run" that
  clicked the menu item to look at the expected confirmation dialog suspended the user. He was on the approved list, so
  no harm — but a dry run must never click an action item; capture the endpoint once from the network tab and drive it
  explicitly.
- Record every suspension (accountId, e-mail, last activity, before/after status, time) for the restore.

**Prefer the narrower lever.** Suspension removes the person's access to ALL products on ALL sites of the org. Removing
the person from the one product-access group (e.g. the Confluence group of this site) frees exactly that seat — provided
no OTHER group of theirs grants the same product (check their groups first) — and touches nothing else — that is the right default for licence work (see the organizations skill). Suspend only when the
owner asks for suspension specifically, as here.

Then add the blocked movers to the product group again and read back 200/204 for each.

## 6. Setting movers as reporter/assignee on migrated items

After accounts exist:
- iterate the run's map logs (not a JQL search of the source, doc 06); for items whose source reporter/assignee is a
  mover with a target account, set reporter (and assignee where the mover is assignable in that project)
- `PUT /rest/api/3/issue/{k}?notifyUsers=false`, only while the project is on the silent scheme (read back) — the gate
  in code refuses otherwise; team-managed projects (cannot be silenced) skipped and listed
- record `(key, field, before, after)` for every change; before-values were measured in the dry run (every assignee to
  change was empty, every reporter was the migration account)
- resume-safe with care: a resume file that skipped every item whose REPORTER was already set also skipped its
  ASSIGNEE — use an explicit `--assignee-only` / `--only <ids>` mode for later passes
- `reporter` needs the `MODIFY_REPORTER` permission (admins have it)

## 7. Org admin API on a target org that has not moved to centralized user management

The org-scoped user and directory endpoints (e.g. `POST /admin/v1/orgs/{orgId}/users/search`, `/directory/*`) answer
`ADMIN-400-4` "Organization: <id> is not with the new user management experience" on orgs still on the original user
management; no API reports which experience an org is on (admin.atlassian.com → the org → Directory tab does). Check
before you design the user phase. A malformed orgId fails differently (404 route mismatch, ADMIN-400-1, ADMIN-403-3) —
use that to tell "my path is wrong" from "the org is in the wrong state".

## 8. Practical identity notes

- Know which account every step uses: the second migration account was SUSPENDED on the source mid-run by the client
  (401 / "Current user not permitted to use Confluence"), and every step that read the source with it failed quietly
  (a verify step left a 0-byte log after 15 minutes). Read the source with an account you just proved active.
- Before handing temporary source site admin back, prove the copy reads the source through the read-only schemes and
  not through site admin: repeat a read with a non-admin account (all worklogs of a test issue still visible).

- `GET /rest/api/3/myself` shares the account's rate budget and 429s during the load; for a "who am I" check in a
  browser script `GET /gateway/api/me` still answers.
- Admin user pages can take >20 s to render and have no `<main>` landmark — wait on a text marker ("Managed account" /
  "External user"), not a landmark.
- Assert the identity at the start of every browser script (the profile may be logged into a different account).
