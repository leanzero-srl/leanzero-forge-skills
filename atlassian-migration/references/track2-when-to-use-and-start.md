# Track 2: when to use, where to start

Moved verbatim from SKILL.md on 2026-10-30 (skills audit); lines 369-404 of the old file. Read by section; the CORE card in SKILL.md wins on conflict.
Part of Track 2 (Cloud-to-Cloud copy, `cloud-to-cloud/`). Backtick paths below are relative to the skill root (~/.claude/skills/atlassian-migration/); markdown links were re-pointed (`../`) so they resolve from references/.

## Track 2 — Cloud-to-Cloud copy over REST (`cloud-to-cloud/`)

Read from the source site, write to the target site, and control every byte that lands — the runbook from a real
production move of over a dozen Jira projects (tens of thousands of work items, several JSM desks, test-management
data) and a similar number of Confluence spaces (thousands of pages, tens of thousands of attachments) into a busy
production site.

### When to Use This Skill

Use this skill when:
- The native Cloud-to-Cloud migration is **not usable**: the target site is already in production with other
  projects, you cannot get org admin on both sides, source IT will not support it, or the tool cannot do what is asked.
- **Keys and numbers must be preserved** (`PROJ-1234` stays `PROJ-1234`), or only a **subset** of projects/spaces moves.
- **Privacy filtering** is required: only a KEEP list of people may appear on the target; everyone else is anonymised.
- **Nothing pre-existing on the target may change** and **nobody may be e-mailed** during the load.
- The source will be **switched off** soon and you need a verified copy plus a local snapshot.

Skip this skill for:
- Generic migration plumbing (Plan/Sync/Audit, http client, pagination, ADF builders, multipart) →
  the Plan/Sync/Audit track above (`plan-sync-audit/`; this track links there instead of repeating it).
- Data Center → Cloud with JCMA → the Plan/Sync/Audit track above (post-JCMA docs).
- Org-level user/group/policy work beyond what a migration needs → `atlassian-organizations-api-skill`.
- Migrating Automation rules → `automation-engineer`.

### Pick a starting point

- **First time, planning the whole thing** → `cloud-to-cloud/docs/01-core-concepts.md` (phases, what a copy loses by design, red lines,
  rehearsal strategy) then `cloud-to-cloud/docs/02-preflight-and-target-config.md`.
- **Must not spam anyone** → `cloud-to-cloud/docs/03-silent-loading.md` + `cloud-to-cloud/templates/silent_window.py` (do this BEFORE the first item).
- **Keys and numbers must match** → `cloud-to-cloud/docs/04-jira-ordered-copy.md` + `cloud-to-cloud/templates/ordered_create.py`.
- **Privacy / anonymisation** → `cloud-to-cloud/docs/08-identity-and-text-privacy.md` + `cloud-to-cloud/docs/09-attachment-privacy.md` +
  `cloud-to-cloud/templates/attachment_verdicts.py` + `cloud-to-cloud/templates/att_gate.py` (every upload goes through it) +
  `cloud-to-cloud/templates/check_upload_paths.py` + `cloud-to-cloud/scripts/leak-scan.sh`.
- **Out of seats, inviting people** → `cloud-to-cloud/docs/10-users-licences-accounts.md` + `cloud-to-cloud/templates/inactive_users_report.py`.
- **Is it actually done?** → `cloud-to-cloud/docs/13-verification-and-guard-dog.md` ("a green number is not a passing test").
