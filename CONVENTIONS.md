# Skill Conventions

This document is for skill maintainers. Every skill in this repo follows the same shape so that AI agents (Claude Code, Cline, Qwen Code) can pick the right one and load only what they need.

The conventions are derived from the [Cline skills spec](https://docs.cline.bot/features/skills) and from polishing the five skills in this repo. New skills (and edits to existing ones) should follow them.

## Directory layout

```
my-skill/
├── SKILL.md                # Required. <5k tokens. Frontmatter + instructions.
├── README.md               # Optional. For humans browsing the repo.
├── docs/                   # Detailed docs, loaded on demand.
│   ├── 01-core-concepts.md
│   ├── 24-production-patterns.md
│   ├── 26-async-events-and-queues.md   # Forge skills only
│   ├── 27-faas-limits-and-cost.md      # Forge / API skills (skill-specific limits)
│   ├── 28-...                          # skill-specific (e.g. ADF)
│   ├── 30-testing-and-tunneling.md     # or 30-testing-rest-integrations.md
│   ├── gotchas.md
│   ├── problem-patterns.md
│   └── when-to-use-which.md
├── templates/              # Copy-paste manifests / boilerplate.
└── scripts/                # CI-safe shell helpers.
    ├── preflight-check.sh
    ├── validate-manifest.sh
    ├── deploy-and-install.sh
    └── dev-setup.sh
```

## SKILL.md

### Frontmatter

```yaml
---
name: my-skill
description: One sentence. Action verbs. Trigger phrases users would say. Specific tools / file types / domains. ≤1024 chars.
---
```

`name` must match the directory name exactly (lowercase, kebab-case). `description` determines whether agents pick the skill — be specific.

### Body sections (recommended order)

1. **Title** — `# Skill Display Name`.
2. **One-line elevator pitch** under the title.
3. **`## When to Use This Skill`** with bullet "use this when" + bullet "skip this for, point to sibling skill".
4. **`## Pick a starting point`** — 3–5 bullet pointers into the skill (templates, production patterns, limits doc, etc.). This is what agents read first to decide which doc to load.
5. **`## Quick Reference`** — a small table mapping common tasks to API/module/endpoint.
6. **`## Core API`** or `## Manifest skeleton` — the smallest copy-pasteable starting code.
7. **`## Authentication — what's correct, what's wrong`** — explicit yes/no table to prevent hallucinations.
8. **`## Failure strategies`** — symptom → first-pass fix → detail-doc reference.
9. **`## Documentation map`** — table of every `docs/` file with one-line description.
10. **`## Templates`** and **`## Scripts`** — table summaries.
11. **`## Changelog`** — last 5–10 lines, dated.

### Token budget

- SKILL.md ≤ 5k tokens (~3,500 words, ~250–350 lines).
- Move detail to `docs/` and link from the map.
- Don't repeat content across SKILL.md and a `docs/` file — link instead.

### "Auth note" preamble (when refactoring)

If a doc/template still contains legacy or wrong patterns (Atlassian Connect `AP.context.getToken()`, locally-signed JWTs, `forge register`), **add a callout at the top** of that file flagging the legacy and pointing at the canonical replacement. Don't rewrite working code blocks unless you can verify the rewrite — a clear preamble + correction is more honest than a half-tested rewrite.

## docs/ — file numbering

We use loose numeric prefixes (no strict sequence; gaps are fine). Aim for these "anchor numbers" to keep files predictable across skills:

| Number | Topic |
|---|---|
| `01-core-concepts.md` | Platform overview, fundamentals |
| `02-` … `21-` | Topical guides specific to the skill |
| `24-production-patterns.md` | 10–15 production patterns from real shipping apps, each with a code excerpt and source pointer |
| `26-async-events-and-queues.md` | Long-running work, queues, retries (Forge skills) |
| `27-faas-limits-and-cost.md` *(Forge)* / `27-rate-limits-and-quotas.md` *(REST)* | Hard limits and what to do when you hit them |
| `28-` | Skill-specific reference doc (e.g. ADF format, custom field types) |
| `30-testing-and-tunneling.md` *(Forge)* / `30-testing-rest-integrations.md` *(REST)* | Testing strategy + jest/nock mocks |
| `gotchas.md` | Pitfalls and environment-specific quirks |
| `problem-patterns.md` | Common problem snippets (legacy; new content goes in 24/27/28/30) |
| `when-to-use-which.md` | Decision tree for choosing modules/endpoints |

Keep prefixes unique within a skill — `git mv 02-foo.md 14-foo.md` if you need to free up `02-`.

## templates/

- One file per module/use-case.
- YAML body for `manifest.yml`-style content.
- Inline code blocks (JS/TS/JSX) in fenced markdown sections.
- Always copy-paste-runnable: include `app.id` placeholder, `runtime.name`, all required permission scopes.
- Header comment block at the top documenting purpose + auth caveats + references.

## scripts/

- `#!/usr/bin/env bash` (not `/bin/bash`).
- `set -euo pipefail` (or `set -uo pipefail` if you need to collect multiple errors before exiting).
- **No emoji.** No ANSI color escapes. Output prefixes: `[script-name] OK:` / `[script-name] FAIL:`.
- Read all secrets from env vars; document expected vars in the header comment.
- Exit 0 on success, non-zero on failure. CI-safe.

The four standard scripts every skill ships are:

| Script | What it does |
|---|---|
| `preflight-check.sh` | Verify the env (CLI tools, auth, manifest if applicable) is ready |
| `validate-manifest.sh` | Run `forge lint` if the skill ships Forge templates |
| `deploy-and-install.sh` | `forge deploy` + `forge install --upgrade` |
| `dev-setup.sh` | Start `forge tunnel` |

REST-API skills add `test-auth.sh`, `test-api-endpoint.sh`, and skill-specific probes (e.g. `test-jql.sh`).

## Verification before committing

Run these from the repo root:

```bash
# 1) Internal links resolve
python3 -c "
import re, os, sys
broken = []
for skill in ['atlassian-jira-forge-skill', 'atlassian-confluence-forge-skill',
              'atlassian-organizations-api-skill', 'jira-api-skill', 'confluence-api-skill']:
    roots = [f'{skill}/SKILL.md']
    for d in ['docs', 'templates', 'scripts']:
        p = f'{skill}/{d}'
        if os.path.isdir(p):
            for f in os.listdir(p):
                if f.endswith(('.md', '.yml', '.sh')):
                    roots.append(f'{p}/{f}')
    for path in roots:
        with open(path) as f: text = f.read()
        for m in re.finditer(r'\[[^\]]*\]\(([^)\#]+\.(?:md|yml|sh))(?:\#[^)]*)?\)', text):
            link = m.group(1)
            if link.startswith(('http://','https://')): continue
            target = os.path.normpath(os.path.join(os.path.dirname(path), link))
            if not os.path.isfile(target): broken.append(f'{path}: {link}')
if broken: [print('BROKEN', b) for b in broken]; sys.exit(1)
print(f'OK')
"

# 2) No duplicate file-number prefixes within each skill
for skill in atlassian-*-skill *-api-skill; do
  dupes=$(ls "$skill"/docs/*.md 2>/dev/null | xargs -n1 basename | awk -F'-' '{print $1}' | sort | uniq -d)
  [[ -n "$dupes" ]] && echo "$skill: dupe prefix $dupes" && exit 1
done

# 3) Bash scripts parse
for s in */scripts/*.sh; do bash -n "$s" || exit 1; done

# 4) No `forge register` in active context (only in negation)
grep -rn 'forge register' --include='*.md' --include='*.yml' . | grep -v 'no such command' | grep -v 'There is no'

# 5) No locally-signed JWT auth examples (`jsonwebtoken.sign`)
grep -rn 'jsonwebtoken' --include='*.md' --include='*.yml' . && echo 'Possible JWT hallucination — verify' || true
```

## Anti-patterns to avoid

- **Locally-signed JWT against `client_secret`** — that's Atlassian Connect, not Forge or Cloud REST. The Cloud REST API takes API tokens (Basic) or OAuth Bearer.
- **`AP.context.getToken()`** — Atlassian Connect, not Forge. Use `requestConfluence`/`requestJira` from `@forge/bridge` or `api.asUser/asApp` from `@forge/api`.
- **`forge register`** — no such command. Use `forge install --upgrade`.
- **`import { storage } from '@forge/api'`** — legacy as of 2025-03-17. Use `import { kvs } from '@forge/kvs'`.
- **Emoji in shell scripts** — breaks on non-UTF-8 CI.
- **Vague descriptions** in YAML frontmatter — agents won't trigger the skill.
- **>5k tokens in SKILL.md** — split into `docs/`.
- **Cross-skill content duplication without a "see also" pointer** — pick one canonical home.

## Testing your description

Before merging a skill, sanity-check the `description` by reading it cold and asking: "If a user said _____ to an agent, would this description match?" Try 3–5 phrasings. If any obvious phrasing doesn't match, adjust.

## See also

- `cline-skill.md` (top of repo) — original Cline skills spec
- `README.md` (top of repo) — user-facing skill index
