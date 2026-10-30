# Track 2: quick reference (I need to... how, doc)

Moved verbatim from SKILL.md on 2026-10-30 (skills audit); lines 405-429 of the old file. Read by section; the CORE card in SKILL.md wins on conflict.
Part of Track 2 (Cloud-to-Cloud copy, `cloud-to-cloud/`). Backtick paths below are relative to the skill root (~/.claude/skills/atlassian-migration/); markdown links were re-pointed (`../`) so they resolve from references/.

### Quick Reference

| I need to… | How | Doc |
|---|---|---|
| Prove the migration identity can see everything | per project `project/search?expand=insight` count vs JQL count | 02 |
| Prove a project key is free | `GET /rest/api/3/projectvalidate/key?key=K` + positive control on a taken key | 02 |
| Silence a project during load | swap to a PROVEN-EMPTY notification scheme, read back, restore + read back | 03 |
| Stop the migration account auto-watching | `PUT /rest/api/3/mypreferences?key=user.autowatch.disabled` body **bare** `true` | 03 |
| JSM customer (portal) notifications off | **no REST** — browser, record before-state, restore exactly | 03, 07 |
| Keep `PROJ-n` numbers | sequential create, filler items for gaps (create + delete), marker label per item | 04 |
| Parent refused ("does not belong to appropriate hierarchy") | fall back to an issue link of type Parent-Child | 04, `cloud-to-cloud/templates/parent_or_link.py` |
| Copy issue links the right way round | canonical triple; prove direction on ONE known pair first | 05, `cloud-to-cloud/templates/link_copy.py` |
| Comments beyond 100 | paginate `startAt` — the API caps a page at 100 whatever `maxResults` says | 04 |
| Recreate sprints | create → start → add items (≤50/call) → close, then re-seat open sprints | 05 |
| Issues the source search cannot list | enumerate by KEY RANGE, not by JQL | 06 |
| Request type on a JSM item | `PUT /rest/api/3/issue/{k}` `{"fields":{"<requestTypeField>":"<id as string>"}}` | 07 |
| Distinct icons for issue types you created | `POST /rest/api/3/universal_avatar/type/issuetype/owner/{id}` + `PUT /issuetype/{id} {"avatarId"}` | 07, `cloud-to-cloud/templates/issuetype_avatar.py` |
| Seats per product | `GET /rest/api/3/applicationrole` (`numberOfSeats`, `userCount`) — API token, needs Administer Jira | 10 |
| Invite a person without product access | `POST /rest/api/3/user {"emailAddress":e,"products":[]}` (caller must be ORG admin) then groups | 10 |
| Inactive users to free seats | admin-hub users search (resourceIds) + per-product last-active-dates | 10 |
| Delete a Confluence attachment for good | v2 `DELETE /wiki/api/v2/attachments/{id}` (trashes it), then the same with `?purge=true`; read back | 09, 11 |
| Archive migrated pages | `POST /wiki/rest/api/content/archive {"pages":[{"id":N}]}` → long task | 11 |
| Read page restrictions (do not lose them) | `GET /wiki/rest/api/content/{id}/restriction?expand=restrictions.user,restrictions.group` | 11 |
| Rate budget | Jira: cost points per ACCOUNT per SITE per hour; 429 → sleep to `x-ratelimit-reset` | 27 |
