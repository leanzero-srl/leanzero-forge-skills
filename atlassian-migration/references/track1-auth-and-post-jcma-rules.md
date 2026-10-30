# Track 1: authentication and the five rules of post-JCMA work

Moved verbatim from SKILL.md on 2026-10-30 (skills audit); lines 201-221 of the old file. Read by section; the CORE card in SKILL.md wins on conflict.
Part of Track 1 (Plan/Sync/Audit, `plan-sync-audit/`). Backtick paths below are relative to the skill root (~/.claude/skills/atlassian-migration/); markdown links were re-pointed (`../`) so they resolve from references/.

### Authentication — what's correct, what's wrong

| Pattern | Use? |
|---|---|
| Cloud: `Authorization: Basic <base64(email:api_token)>` | **Yes** — the canonical way for external Node scripts. Create an API token at id.atlassian.com/manage-profile/security/api-tokens. |
| DC: `Authorization: Basic <base64(username:password)>` | **Yes** — for older Server/DC instances. |
| DC: `Authorization: Bearer <PAT>` | **Yes** — Personal Access Token, preferred on DC 8.14+. |
| Forge KVS remote: forward `x-forge-oauth-system` header from Atlassian → `Authorization: Bearer <token>` on `api.atlassian.com/forge/storage/kvs/v1/...` | **Yes** — see `plan-sync-audit/docs/29-forge-kvs-remote-mending.md`. |
| `Authorization: JWT <token>` from a locally-signed `jsonwebtoken.sign(...)` against a shared secret | **No** — that's Atlassian Connect, not Cloud REST. Connect is end-of-life. |
| `AP.context.getToken()` from `@atlassian/connect-express` | **No** — Connect-only. Not for migration scripts. |
| Putting `client_secret` directly in a URL query string | **No** — OAuth 2.0 (3LO) is for user-consent apps, not unattended migrations. |
| Reusing the same `https.Agent` across DC and Cloud clients | **No** — keep one client instance per host; cookies/session do not cross. |

### The five rules of post-JCMA work

1. **Every numeric ID changes.** `issueId`, `projectId`, `commentId`, `fieldId`, attachment `id` — all freshly minted in Cloud. Only `issueKey` (when project keys don't collide) and `spaceKey` mostly survive. Always build and persist a mapping table at plan time.
2. **`accountId` is the only stable user identifier.** Email may be `null` for privacy-restricted users. Resolve email→`accountId` once at plan time, cache to disk, never compare emails in production code.
3. **Custom field IDs are never portable.** A source `customfield_10042` becomes a destination `customfield_10318` (or anything). Match by display-name + type at planning; persist `{sourceFieldId: destFieldId}` map.
4. **ADF: `set` the whole document, never `add`.** Jira v3 returns/accepts descriptions and comment bodies as ADF JSON. There is no public ADF↔text converter. Build the full ADF tree and PUT/POST it whole.
5. **Attachments need `X-Atlassian-Token: no-check`.** Multipart upload to `POST /rest/api/3/issue/{issueIdOrKey}/attachments` is rejected by CSRF without this header. JCMA can pre-stage attachments via "Migrate attachments in advance" to shrink the cutover window.
