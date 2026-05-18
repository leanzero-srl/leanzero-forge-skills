# Gotchas

Specific things that bite migration engineers. Each entry is something that has cost someone hours.

## Identity / users

- **Email is nullable.** `user.emailAddress === null` is normal for privacy-restricted users. Don't compare emails for equality without handling null.
- **Anonymized accounts** get aliases like `jirauser80900` as `displayName`. They aren't bugs; the user opted out of identity exposure.
- **`accountId` is 24 chars, with a colon.** `557058:f5fcdba9-...`. Don't truncate. Don't lowercase. Don't trim the colon.
- **Two users with the same `displayName`** is common in large tenants. Email is the only reliable disambiguator; when that's null, use the CSV override.
- **DC `username`/`userKey` don't exist in Cloud.** No `name` field in Cloud user responses. Don't reach for it.
- **`x-atlassian-force-account-id: true`** simulates the privacy-restricted world for testing. Turn it on for one staging run to see what breaks.

## Pagination

- **`startAt` returns 410 in Jira Cloud** after Aug 1, 2025. Use `POST /search/jql` + `nextPageToken`.
- **No `total` field on the new Jira pagination.** Progress bars need redesign.
- **Confluence v1 `start=N` pagination loops on large result sets.** Always follow `_links.next` and dedupe by content ID.
- **Confluence v2 uses Link header, not response body.** `Link: <url>; rel="next"` — parse it.
- **`nextPageToken` is opaque.** Don't base64-decode it; don't compare values; don't cache it between runs.

## Rate limits

- **March 2, 2026: Beta- prefix drops** on rate-limit headers, and overages return 429. Audit your scripts now.
- **Per-issue write limit (20/2s)** bites bulk comment imports — serialize per issue, parallelize across issues.
- **Bulk endpoints cost 1 point**, not 1 point per item. Use them.
- **5xx is exponential, 429 is `Retry-After`-first.** Confusing them leads to under-retrying 5xx or hammering 429.
- **Identity reads cost 2 points** (vs 1 for core reads). User-heavy plan phases burn the budget fast.

## ADF / page bodies

- **ADF `text` nodes with empty string** invalidate the document. Prune them.
- **No public ADF→text converter.** Use `?expand=renderedFields` for HTML; hand-roll or use a library for plaintext.
- **ADF version is always 1.** Don't omit the field; don't set it to 0.
- **`{ description: { add: ... } }` is not a thing.** Always `set` the whole ADF doc.
- **Storage format and ADF for the same page** are not byte-identical. Round-tripping through either loses information.
- **`updatePageStorage` returns 409** when another writer updated the page between your fetch and your PUT. Re-fetch, bump version, retry. Built into `cloud-confluence-client.js`.
- **Marks attach to `text` nodes**, not paragraph nodes. A link is `text` with a `link` mark.

## Attachments

- **`X-Atlassian-Token: no-check`** is required on every multipart attachment upload. Without it: 403 CSRF.
- **`100 MB default size limit`**, configurable up to 2 GB. Files >50 MB benefit from a longer HTTP timeout (≥5 min).
- **Match by filename + size + issue/page** when re-stitching attachment references — IDs change, this combo doesn't.
- **JCMA can pre-stage attachments** via "Migrate attachments in advance". Use it to shrink the cutover window.

## CSV / file I/O

- **UTF-8 BOM** at the start of CSVs makes Excel and Numbers open them correctly. The `csv-writer.js` template adds it by default.
- **CSV with embedded newlines** needs the value wrapped in quotes. RFC 4180. The template handles this.
- **`fs.appendFileSync` blocks the event loop.** Use it sparingly during long runs; better to keep a `WriteStream` open.
- **`logs/` files are gitignored** — don't accidentally share `logs/cache_users.json` with colleagues; it contains accountIds.

## Date math

- **Atlassian APIs return UTC offsets**, not raw timestamps. `2026-05-18T08:34:12.117+0000` is UTC; `+0200` is two hours east of UTC.
- **`Date.now()`** gives ms since epoch — monotonically increasing but jumps on system clock changes. Don't run two migrations on the same machine within the same millisecond (use a monotonic counter if you need stability).
- **JQL date filters** are in the tenant's timezone, not UTC. `due > "2026-05-01"` might miss what you expect if your tenant is set to UTC+10.

## Forge KVS

- **`kvs.query` and `list-keys` are eventually consistent.** Use `kvs.get` for read-then-write workflows.
- **Key length is 255 bytes.** Hash long keys; don't truncate (you'll collide).
- **Value depth is ~10 levels.** Flatten deeply nested objects.
- **`appSystemToken: true` plus scopes** is non-negotiable for remote access. Missing either → 401.
- **The system token has a 55+ minute validity.** Don't cache it — Atlassian rotates it per-invocation.

## CLI flag handling

- **`--limit 0` means "no limit"** in this skill's vocabulary. Don't accidentally pass `--limit 0` thinking it means "zero entries".
- **`--dry-run` and `--confirm` are not mutually exclusive.** Dry-run wins (safer default).
- **`--retry-failed` only applies in `--execute-only` mode.** It's a no-op in a fresh plan run.
- **`--space` is repeatable** but `--space DOCS,KB` (comma-separated) also works. Mix freely.

## Cookies, agents, and sessions

- **Don't reuse a single `https.Agent` between DC and Cloud clients.** Cookies aren't host-portable.
- **The default Node agent pool maxSockets is `Infinity`.** A migration script with high concurrency can open thousands of sockets — cap if you see file-descriptor errors.
- **`keepAlive: true`** speeds up tight loops but can hold sockets open past process exit. The templates use the default (`keepAlive: false`).

## Forge tunnel / local dev

- **The Forge tunnel doesn't pick up manifest changes** automatically. Stop, `forge install --upgrade`, restart.
- **A locally-tunneled function still uses real Cloud KVS** — don't experiment with `kvs.set("test", ...)` against a production environment.

## Plan files

- **`plan_<runId>.json.tmp`** lingering after a crash is safe to delete. The next save will recreate it.
- **Two scripts editing the same plan** corrupt it. PlanManager is not multi-process safe.
- **Loading a plan from a different runId** is fine — just pass `--plan-file <path>`.
- **Hand-editing a plan JSON** is allowed but discouraged. Use `patchEntry` programmatically when possible.

## Atlassian Connect (legacy)

- **`AP.context.getToken()`** is Connect, not Forge, not Cloud REST. Don't copy it from old docs.
- **Locally-signed JWT** against a shared secret is also Connect. Don't.
- **Connect is being phased out.** New work targets Forge or external REST clients with API tokens.

## JQL / AQL gotchas (post-JCMA)

- **`Customer Request Type` was renamed `Request Type`.** JCMA does this on every JSM project. Sanitize the JQL or the filter parser rejects it.
- **`not in (Foo, Bar)` fails on Cloud.** Cloud's parser requires `NOT IN ("Foo", "Bar")` — uppercase operator AND quoted bare strings. The `jqlSanitizer` template handles both.
- **`standardIssueTypes` without parens fails.** DC accepted it as a function reference; Cloud requires `standardIssueTypes()`. Other paren-less names that need fixing: `subTaskIssueTypes`, `votedIssues`, `watchedIssues`, `issueHistory`.
- **Year-quarter labels collide with placeholder syntax.** Values like `2019Q4`, `2020Q1` *will* break a naive `Q(\d+)` placeholder regex if you use control-char placeholders without proper delimiters. Use SOH/STX (`\x01` / `\x02`) — they cannot legally appear in user-authored JQL.
- **AQL inside `aqlFunction("...")` is a different language.** Don't rewrite numeric IDs inside it with the JQL rewriter — handle AQL bodies separately with `rewriteAqlFunctionBodies`.
- **Filter references to deleted entities** can't be auto-rewritten. Surface in the failed CSV; don't fail the whole run.
- **`cf[N]` and `customfield_N` are interchangeable** in DC-authored JQL. Sanitize both in one pass; the destination accepts either.

## Storage format & ADF gotchas

- **Storage format `<root>` wrappers.** When parsing Confluence storage with fast-xml-parser, wrap in a fake `<root>` element first — naked XHTML fragments aren't valid XML. Strip the `<root>` wrapper on serialize.
- **`preserveOrder: true` is non-negotiable** for fast-xml-parser when rewriting storage XHTML. Without it, attribute order changes between input and output, breaking byte equality of unchanged regions.
- **ADF `text` nodes with empty string** invalidate the document. Always call `adf.prune(doc)` before serializing.
- **ADF marks attach to text, not paragraphs.** `{type: "link", attrs: {href}}` goes inside `marks[]` on a `text` node — not on the containing paragraph.
- **`@_ac:macro-id` vs `ac:macro-id`** depends on fast-xml-parser's `attributeNamePrefix`. The conventions in our `storage-format-parser.js` template use `@_` — match that or override.
- **Confluence storage attribute order is significant for some macros.** Many vendor macros assume parameters appear in a specific order. Don't sort.
- **ADF `version: 1`** at the root is mandatory. Omitting it silently breaks the document.

## Backup & rollback gotchas

- **Confluence rollback via `?status=historical&version=N` is v1-API only.** v2 doesn't expose historical body fetches in a single call. Use v1 for rollback even if the rest of your code targets v2.
- **`currentVersion > recordedVersion`** at rollback time means a third party edited the page after your sync. **Refuse to clobber** — surface to the operator.
- **Per-entity Jira backups are not atomic** — between snapshot and mutation, automation rules can fire. The "pre-state" you saved may not match what's there a moment later. Re-snapshot inside the worker if a mutation is sensitive.
- **`backups/<runId>/` can balloon.** A 150k-issue plan with full-fields snapshots is gigabytes. Either select specific fields (`fields=summary,description,customfield_X`) or drop snapshots after a clean audit.

## Identity resolution edge cases

- **`x-atlassian-force-account-id: true`** simulates the privacy-restricted world. Run with this header for one staging run before doing the real one.
- **Anonymized accounts can't be looked up by email** — their email is `null`. Display-name search still works.
- **Display names are not unique.** Two users with the same display name → `multiMatch: true`. Use the CSV override file.
- **Group lookup endpoints differ.** Jira: `GET /rest/api/3/group?groupname=X`. Confluence: `GET /rest/api/group/picker?query=X` (the legacy `by-name` endpoint was removed and returns 410).

## Instance fingerprinting

- **Always stamp the instance signature** at plan creation time. Re-using a plan against the wrong tenant is one of the worst migration accidents.
- **Empty `sourceBaseUrl`** is valid (Cloud→Cloud, no DC) — the fingerprint matches on whatever URLs are present.
- **`--allow-instance-mismatch` should require operator confirmation.** Don't make it the default. Logging "DANGEROUS" in the warning isn't enough; consider an interactive prompt for the manual override.

## Cloud catalog gotchas

- **The catalog cache is per-machine.** Two operators running on different machines have different caches. If a custom field is added between their runs, only one will see it. Have a `--refresh-catalog` flag.
- **Group lookups are paginated.** The first `/rest/api/3/groups/picker?query=` call returns up to 200; you may need multiple calls (paginate by first character) to get all of them on tenants with >200 groups.
- **Status names can collide across workflows.** "Done" exists in many workflows but may have different IDs in each. The catalog returns the first match — use `statusId` from the issue you're updating, not the catalog, if precision matters.

## Owner-swap gotchas

- **`ownerSwap` is NOT self-safe** — the bare swap+restore primitive doesn't guarantee anything. Use `withOwnerSwap` (the wrapper template) which puts swap/mutate/restore inside try/finally.
- **Orphaned swaps must be logged.** If the restore fails (network blip, 5xx, race), you've left the entity owned by the wrong person. Always write the orphan to `logs/orphan_owner_swaps.csv` so it surfaces for manual cleanup — never swallow the error.
- **Dashboard owner-swap requires a full PUT body.** Unlike filter, there's no dedicated `/dashboard/{id}/owner` endpoint. You have to GET the existing dashboard, send all fields back unchanged except `owner` — and ANY changes a third party made between your GET and PUT get clobbered.
- **Test that you have site-admin before relying on owner-swap.** Without site-admin, even owner-swap fails — there's no "operate as another user" privilege in Cloud comparable to DC's `SUDO`.

## Asset / CMDB / Insight gotchas

- **ARI shape:** `ari:cloud:cmdb::object/<workspaceId>/<objectId>`. The double-colon (`cmdb::object`) is intentional — an empty `cloudId` segment is the canonical form. Some older docs show `ari:cloud:cmdb:<workspaceId>:object/<id>` — that's the older 4-segment form and Cloud's parser accepts both but emits the new form.
- **Multiple Cloud objects can share a name.** Asset names are not unique within a workspace. If you rewrite a bare-name JQL value, you might match multiple objects on Cloud where DC matched one. The `asset-field-rewriter.js` template only rewrites tokens with EXPLICIT identification (key, objectId, ARI) — never bare names — to avoid this.
- **`Key` vs `Name`:** in AQL, `Key = "CI-21171"` is the object key; `Name = "Native Makers"` is the display name. These are different fields. Don't confuse the JCMA-renamed asset name with the asset key.
- **Workspace ID changes between tenants.** If you copy filter JQL from one Cloud site to another, ARI workspaceIds inside `aqlFunction("...")` need rewriting too.
- **20-asset cap per ticket field.** Jira Cloud enforces a maximum of 20 asset references per custom field per issue. If a DC issue had 50 assets in one field, you have to drop / split / pick the top 20.

## Preflight gotchas

- **Preflight is read-only — but the comparator can be expensive.** A naive comparator that re-fetches every field of every entry hits rate limits fast. Cache the source side; only fetch what the comparator needs.
- **Drift threshold is a heuristic.** 10% might be wildly too high for security-sensitive migrations and wildly too low for cosmetic field renames. Tune per migration.
- **Negative-cache poisoning.** If a temporary network failure during preflight returns "fetch-error" for many entries, they look like drift. Distinguish `fetch-error` from `drift` in the bucket counts so the operator can re-run preflight without re-planning.

## Stable cursor sorting

- **`updated DESC` is the most common pagination bug.** It feels natural ("newest first") but every save shifts the order. Use `key ASC`, `id ASC`, or `created ASC` instead.
- **Stable sort isn't the same as deterministic.** You can sort by `key ASC` and still see different results across runs if issues were added or deleted between runs. Stable cursors just mean *within a single run*, the cursor advances cleanly.
- **JQL's `ORDER BY ASC` is the default direction.** You can omit `ASC` for brevity; `DESC` must be explicit.

## Workflow migration

- **Status names are not unique across workflows.** Two workflows can both have "Done"; their IDs differ. Build the status remap per-workflow, not per-tenant.
- **Read-only properties on statuses:** `name`, `issueEditable`, `statusCategory` are not accepted on the create/update payloads. Strip them before sending.
- **ScriptRunner workflow rules don't migrate.** Cloud has no ScriptRunner-on-Cloud unless the customer pays for the Connect app, and even then the rule shapes differ. Drop ScriptRunner conditions/validators/post-functions with an audit trail.
- **JMWE prefix double-encoding:** JCMA sometimes emits `jmwe-cloud:jmwe-cloud:<rule>` for JMWE rule keys. Strip the duplicated prefix before sending or Cloud rejects the rule.
- **System post-functions** (UpdateIssueStatusFunction, FireIssueEventFunction, etc.) are Cloud-managed — don't include them in your `postFunctions[]` payload; Cloud adds them automatically.
- **Workflow transitions must reference statuses by `id`, not name.** The bulk update API will accept names but silently lose information; use IDs.

## Cloud-to-Cloud config differences

- **"Customer Request Type" → "Request Type"** on every Cloud JSM project — see jqlSanitizer's default rename. Be aware this rename happened both on the source AND destination if both are Cloud.
- **Issue-type hierarchy level differs across plans.** Free tier doesn't have epics; Premium does. A source with epics may need its issue-type scheme adjusted on the destination.
- **Priority schemes are tenant-scoped.** A "P1" priority on tenant A is a different entity from "P1" on tenant B even with identical names. Build a remap, even for trivial-looking cases.
- **Link types use both `inward` and `outward` labels.** Compare both — a `blocks`/`is blocked by` pair can have either side renamed independently.

## Excel report writer

- **Sheet names ≤ 31 chars, no `:\\/?*[]`.** Sanitize before adding. The `excel-report-writer.js` template does this automatically.
- **`exceljs` isn't zero-dep.** The skill's other templates use no runtime deps; this is the one place we break that rule. Use CSVs unless operators specifically need Excel formatting.
- **Auto-width is approximate.** ExcelJS doesn't measure actual rendered text width; it estimates from char count. Cap at 60 chars to avoid runaway columns.
- **Status fills need full ARGB hex codes** (`FFC6EFCE`, not `C6EFCE`). The template prepends the alpha automatically.

## Stratified sampling

- **Stratifying by bucket biases the audit toward over-represented categories** when buckets are very uneven. Either normalize (cap N per bucket) or accept the bias — never claim a stratified sample is "representative" without saying *of what*.
- **Mulberry32 seed reproducibility holds across machines** as long as no in-process state changes the seed. Don't call `mulberry32(Date.now())` — that's not seeded.

## Discovery dump

- **Discovery dumps can leak content.** Raw storage XHTML and macro JSON can contain user-identifiable information. Treat the dump directory like `logs/` — gitignored, not shared in tickets.

## See also

- [`27-rate-limits-and-quotas.md`](27-rate-limits-and-quotas.md) — full rate-limit semantics
- [`04-pagination.md`](04-pagination.md) — the pagination footguns
- [`05-identity-resolution.md`](05-identity-resolution.md) — identity footguns
- [`28-adf-and-attachments.md`](28-adf-and-attachments.md) — ADF and attachment footguns
