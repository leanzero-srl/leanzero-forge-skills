# Track 2: authentication and failure strategies

Moved verbatim from SKILL.md on 2026-10-30 (skills audit); lines 468-497 of the old file. Read by section; the CORE card in SKILL.md wins on conflict.
Part of Track 2 (Cloud-to-Cloud copy, `cloud-to-cloud/`). Backtick paths below are relative to the skill root (~/.claude/skills/atlassian-migration/); markdown links were re-pointed (`../`) so they resolve from references/.

### Authentication — what's correct, what's wrong

| Pattern | Use? |
|---|---|
| Site REST (`/rest/api/3`, `/wiki/api/v2`, `/rest/servicedeskapi`) with Basic `email:api_token` of an admin account | **Yes** — every copy/verify script |
| Two admin migration accounts with disjoint project lists | **Yes, when the target owner provides them** — each had its own observed budget; never create accounts just to multiply limits |
| `notifyUsers=false` on issue edits and worklogs | **Yes, with Administer Jira or Administer Projects** — otherwise it is ignored; comment create, transitions, attachments, links have no such flag |
| Admin hub APIs (`admin.atlassian.com/gateway/api/admin/...`) with a user API token | **No** — 401; use the logged-in browser session, or an org API key on `api.atlassian.com/admin` (see `atlassian-organizations-api-skill`) |
| JSM customer notifications, account claiming over REST | **No public endpoint** — browser automation, read back, screenshot |
| JSM queue create/edit/delete/reorder, queue Board views, board columns, quick filters, swimlanes | **No PUBLIC documented API**; internal endpoints work with an API token ([`31-boards-and-queues.md`](../../jira-api-skill/docs/31-boards-and-queues.md)), unsupported by Atlassian, may change — back up, write, read back |
| Setting comment `author`/`created` or issue `created` | **No** — 201 and silently ignored / 400; keep original author+date as TEXT |
| Test-management app API keys | Per USER **and** per SITE; generated in the app UI on the target |

### Failure strategies

| Symptom | First-pass fix | Detail |
|---|---|---|
| `NUMBER DRIFT: wanted PROJ-n, got PROJ-n+1` | a lost create was re-posted (duplicate); the template stops, reuse the spare by hand | 04 |
| Description on created items = a template text | create screen lacks system Description; PUT description right after create | 04 |
| `Field Team is required` though createmeta says optional | workflow validator; send a default (plain id string), never on sub-tasks | 02, 04 |
| Every sub-task became a Task | the "inherits team from parent" error contains "parent" → your fallback dropped the parent | 04 |
| Links read backwards on the target | `inwardIssue`/`outwardIssue` swapped; repair against the source by canonical triple | 05 |
| `400 does not belong to appropriate hierarchy` | level mismatch; Parent-Child link instead | 04 |
| Items lost their sprint | sprint's origin board no longer resolves on source; recreate from the item side | 05 |
| All desk tickets look the same type | new global issue types share the default avatar; upload icons | 07 |
| `LicenceExceededException` on group add | seat cap; measure, then free seats (approved) | 10 |
| Images vanished after someone opened a page editor | 0-byte attachment versions; re-upload good bytes as a new version | 11 |
| Count check passes but items are missing | the count used the same blind index as the copy; count by key range | 06 |
| Queue "All open" full of closed tickets | done items without resolution; set resolution silently | 07 |
