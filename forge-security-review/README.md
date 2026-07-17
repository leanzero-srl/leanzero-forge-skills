# forge-security-review

Produce a **real** security review pack for an Atlassian Forge app — technical profile, SAST and SCA — that
survives an actual security reviewer reading it.

## Why this exists

A reviewer asked for a technical profile, SAST and SCA reports on a Forge app. The tempting answer was
*"those don't apply to a sandboxed Forge app."*

**That answer was wrong.** Running the reports found a live, reachable HIGH — prototype pollution in `xlsx`,
reachable from user-supplied spreadsheets through the app's AI file-read tool. Had we argued the control
away, the reviewer would have run `npm audit` himself in thirty seconds and found a real bug in our own app.

The sandbox bounds the **blast radius**. It does not make a vulnerable parser absent.

## Use it

```bash
python3 scripts/forge_sec_scan.py /path/to/forge-app
# -> SECURITY-REVIEW-<App>.md + sast-semgrep.json + sca-npm-audit-{prod,all}.json
```
Requires `node`/`npm`, and `semgrep` (`pip install semgrep`) for the SAST section.

The script builds the profile from `manifest.yml`, runs canary-validated Semgrep, runs `npm audit`, splits
findings ours-vs-SDK with `fixAvailable`, and flags phantom deps, mutable tags and non-registry sources.
**Its output is a draft, not a verdict** — the judgment calls are documented in `docs/`.

## What makes this different from "run npm audit"

- **`docs/gotchas.md` — read first.** The traps that make a clean-looking report a lie:
  - **The OSV trap.** When a vendor abandons npm, OSV-based scanners (Trivy/Grype/Dependabot/Snyk) flag the
    package **forever** — even on a patched version — while `npm audit` reports clean. Your scan and the
    reviewer's *will* disagree. Lead with it or look like you're hiding something.
  - **The unvalidated zero.** A Semgrep run whose ruleset failed to load returns `0 findings` and exit 0 —
    identical to clean code. Canary it or don't report it.
  - **"That's Atlassian's to patch."** Usually false. Check `fixAvailable` first.
- **`docs/03-beyond-scanners.md`** — the risk classes SAST/SCA structurally cannot see. On the app this was
  built from, **every one of them was more severe than the CVE that triggered the review**: prompt injection
  into privileged tool-calls, decompression bombs, phantom dependencies.
- **`docs/04-reporting.md`** — the exact sentences that get a pack rejected, and what to write instead.

## Contents

| File | What |
|---|---|
| `SKILL.md` | The method and the golden rules |
| `docs/gotchas.md` | ⚠️ The traps. Read before reporting anything. |
| `docs/01-technical-profile.md` | The manifest *is* the security surface: egress, LLM, scopes, CSP |
| `docs/02-sast-and-sca.md` | Running both properly, and reading them honestly |
| `docs/03-beyond-scanners.md` | What the scanners can't see — find it by hand |
| `docs/04-reporting.md` | Writing a pack that holds up; confidentiality rules |
| `templates/security-review-report.md` | Fill-in report template, with the reject-traps marked inline |
| `scripts/forge_sec_scan.py` | The scanner |

## The framing that works

> We closed the one finding a scanner could see. Here is what the scanners structurally cannot see, which we
> found ourselves, and here is the plan.

"This resolves the security review" does not.
