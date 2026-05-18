# LeanZero Atlassian Skills

A collection of **AI agent skills** for working with the Atlassian Cloud platform. Skills are modular instruction sets that AI assistants (Claude Code, Cline, Qwen Code, etc.) can load on demand for specialized tasks. Compatible with the [Cline skills spec](https://docs.cline.bot/features/skills) and Anthropic's Claude Skills.

## What is a skill?

A skill is a directory containing a `SKILL.md` file with YAML frontmatter (name + description) plus optional `docs/`, `templates/`, and `scripts/` subfolders. Agents read the description, decide whether to load the skill, and only then read its body and supporting files. This keeps context small until the work actually starts.

## Available skills

This repo ships **six skills**. Pick the one that matches your task — they don't overlap when used correctly.

| Skill | Use when… | Don't use when… |
|---|---|---|
| **[atlassian-jira-forge-skill](atlassian-jira-forge-skill/)** | Building a Forge app that extends **Jira Cloud** — workflow validators/conditions/post-functions, custom UIs, async events, scheduled triggers, KVS storage. | Calling Jira from an external service over HTTPS → `jira-api-skill`. |
| **[atlassian-confluence-forge-skill](atlassian-confluence-forge-skill/)** | Building a Forge app that extends **Confluence Cloud** — page banners, content actions, macros, content properties, scheduled triggers, ADF. | Calling Confluence from an external service → `confluence-api-skill`. |
| **[atlassian-organizations-api-skill](atlassian-organizations-api-skill/)** | Cross-product **org admin** operations — managing users, groups, directories, domains, audit events, policies, workspaces. Uses `api.atlassian.com/admin/`. | Working with Jira issues or Confluence content — those have their own skills. |
| **[jira-api-skill](jira-api-skill/)** | Calling the **Jira Cloud REST API v3** from an **external app** (Node/Python service, CI job, bot). API token + OAuth flows, JQL search, ADF construction. | Building a Forge app → `atlassian-jira-forge-skill`. |
| **[confluence-api-skill](confluence-api-skill/)** | Calling the **Confluence Cloud REST API v2** from an **external app**. Pages, blogposts, attachments, content properties, ADF/storage formats. | Building a Forge app → `atlassian-confluence-forge-skill`. |
| **[atlassian-migration-scripts-skill](atlassian-migration-scripts-skill/)** | Writing Node.js **migration scripts** — Data Center → Cloud or Cloud ↔ Cloud — using a Plan/Sync/Audit triad, native-https clients, CSV outputs, and Forge KVS remote app-data mending. | One-off curls or building a long-running service — those don't need the resumable/auditable scaffolding. |

## Quick decision flow

```
Are you writing a migration / bulk data-fix script?
├── Yes → atlassian-migration-scripts-skill
└── No, continue:

Are you writing code that runs *inside* Atlassian (as a Forge function)?
├── Yes — Jira?         → atlassian-jira-forge-skill
├── Yes — Confluence?   → atlassian-confluence-forge-skill
└── No (external HTTP client):
    ├── Talking to Jira?           → jira-api-skill
    ├── Talking to Confluence?     → confluence-api-skill
    └── Talking to org admin APIs? → atlassian-organizations-api-skill
```

If you're doing more than one of these in one project, install all the relevant skills — agents only load what each task triggers.

## Installation

Skills are discovered automatically by Cline / Claude Code from these paths:

- **Project-scoped** (recommended for teams): `.cline/skills/`, `.clinerules/skills/`, or `.claude/skills/`
- **Globally-available** (your personal collection): `~/.cline/skills/` or `~/.claude/skills/`

To install all six skills globally, run:

```bash
./scripts/install-skills.sh
```

This symlinks each skill into both `~/.cline/skills/` and `~/.claude/skills/`. See the script for flags (`--project`, `--cline-only`, `--claude-only`, `--dry-run`).

To install manually:

```bash
mkdir -p ~/.claude/skills ~/.cline/skills
for s in atlassian-jira-forge-skill atlassian-confluence-forge-skill \
         atlassian-organizations-api-skill jira-api-skill confluence-api-skill \
         atlassian-migration-scripts-skill; do
  ln -sf "$(pwd)/$s" "$HOME/.claude/skills/$s"
  ln -sf "$(pwd)/$s" "$HOME/.cline/skills/$s"
done
```

## Repository layout

```
skill-jira-forge/                          # repo root
├── README.md                              # this file
├── CONVENTIONS.md                         # how each skill is structured (for maintainers)
├── cline-skill.md                         # original Cline skills spec (reference)
├── scripts/
│   └── install-skills.sh                  # symlinks skills into ~/.{claude,cline}/skills
├── atlassian-jira-forge-skill/            # ──┐
├── atlassian-confluence-forge-skill/      #   │
├── atlassian-organizations-api-skill/     #   │  the six skills
├── jira-api-skill/                        #   │
├── confluence-api-skill/                  #   │
├── atlassian-migration-scripts-skill/     # ──┘
└── docs/                                  # repo-level documentation (not skill content)
```

Every skill follows the same internal layout — see [`CONVENTIONS.md`](CONVENTIONS.md).

## Production references

The skills are not theoretical. The "production patterns" docs in each skill (`docs/24-production-patterns.md`) are lifted from real shipping Atlassian apps:

- **PPM Pro** — sharded plan storage, drafts/locks for multi-user concurrency, exponential backoff with jitter, chunked write-back.
- **CogniRunner** — capability-token web triggers, multi-provider AI key storage, fail-open workflow validators, async-queue offload for >25s work.
- **Sentinel Vault** — capsule-style resolver registration, KVS prefix indexing, ADF tree surgery, three-level Confluence authorization, native @mention notifications.
- **License Leash** (Axpo License Manager) — HMAC-signed self-service web triggers, dual-strategy `asUser` → `asApp` REST fallback, Forge SQL config, Atlassian Admin API integration.

## Contributing

1. Read [`CONVENTIONS.md`](CONVENTIONS.md).
2. Run the verification block at the bottom of `CONVENTIONS.md` before committing.
3. Front-matter every doc with a `description` if you add new ones.
4. Don't commit secrets — keep all auth in env vars.

## License

See `LICENSE` (or contact LeanZero).
