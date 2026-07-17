---
name: forge-security-review
description: >-
  Produce a real security review pack for an Atlassian Forge app — technical profile, SAST and SCA — and
  survive an actual security reviewer reading it. Use whenever someone asks for a technical profile, SAST
  report, SCA report, dependency/vulnerability scan, SBOM, AAP/security-approval evidence, or a "is this app
  safe" assessment for ANY Forge app (ChatWise, CogniRunner, Sentinel Vault, Altomata, lz-ppm-forge,
  se-ppm-forge, or a client's). Also use before shipping a dependency/security fix in a Forge app. Holds the
  runnable scanner, the report template, and — critically — the traps that make a naive report worse than
  none (the OSV-vs-npm-audit split, unvalidated scanner zeros, and the risk classes Forge scanning
  structurally cannot see). Living skill — append what you learn.
---

# Forge app security review — run the reports, then write one that holds up

Built 2026-07-17 from the ChatWise / diconium **ITSM-80215** review, where a reviewer (Stefan Denker) asked
for a technical profile + SAST + SCA on a Forge app, and the tempting answer was "those don't apply to a
sandboxed Forge app."

> **The founding lesson: that answer was wrong, and running the reports found a live, reachable HIGH
> (prototype pollution in `xlsx`, reachable from user-supplied spreadsheets) in our own app.**
> "It's sandboxed" bounds the blast radius. It does not make a vulnerable parser absent. Never argue a
> security control away because it's inconvenient — run it, and own what it finds.

## The one-command version

```bash
python3 ~/.claude/skills/forge-security-review/scripts/forge_sec_scan.py /path/to/forge-app
# -> writes SECURITY-REVIEW-<App>.md + sast-semgrep.json + sca-npm-audit-{prod,all}.json
```

It builds the technical profile from `manifest.yml`, runs Semgrep (**canary-validated**), runs `npm audit`,
splits findings ours-vs-SDK, flags phantom deps and mutable version tags, and emits the pack. **Read what it
emits — it is a draft, not a verdict.** The judgment calls below are yours.

## Reference files (read on demand)

- **`docs/gotchas.md`** — ⚠️ **READ THIS BEFORE REPORTING ANYTHING.** The OSV-vs-npm-audit advisory
  split, unvalidated scanner zeros, URL-dep blindness, and the other ways a clean-looking report is a lie.
- **`docs/01-technical-profile.md`** — the manifest IS the security surface. What to extract and why.
- **`docs/02-sast-and-sca.md`** — how to run both properly, and how to read the output honestly.
- **`docs/03-beyond-scanners.md`** — the risk classes SAST/SCA structurally cannot see in a Forge app.
  On a real app these were **worse than the CVE**. You must find these by hand.
- **`docs/04-reporting.md`** — the pack structure, and the sentences that get a report rejected.
- **`templates/security-review-report.md`** — the fill-in report template, with the reject-traps marked
  inline at the point you'd walk into them, and a pre-send checklist.

## The method

1. **Profile from the manifest** (`docs/01-technical-profile.md`). For Forge, the manifest *is* the
   security surface: declared scopes, egress, inference, storage, CSP.
2. **SAST** — Semgrep over first-party source. **Validate the ruleset with a canary before you believe a
   zero** (`docs/gotchas.md` §2).
3. **SCA** — `npm audit --omit=dev` for the shipping tree. **Split ours-by-choice vs inherited via
   `@forge/*`/`@atlaskit/*`, and check `fixAvailable` before calling anything "the platform's problem."**
4. **Hunt what scanners can't see** (`docs/03-beyond-scanners.md`). This is where the real findings were.
5. **Locate the vuln before fixing it** — `forge install list` is ground truth for which environment actually
   runs the code. Do not assume production.
6. **Write the pack honestly** (`docs/04-reporting.md`). Lead with whatever will make the reviewer's own
   scan disagree with yours.

## Golden rules

1. **Never argue a control doesn't apply because it's inconvenient.** SAST/SCA run fine on Forge apps. The
   founding case: "SCA doesn't apply to a sandboxed app" would have collapsed the instant the reviewer ran
   `npm audit` himself — and it would have found a real bug in our own code. Run it, then explain the result.
2. **A scanner's zero is not evidence until you've proven the scanner works.** Plant a known-vulnerable
   canary and confirm it fires. A ruleset that failed to load produces the identical zero to clean code.
3. **Lead with the disagreement.** If the reviewer's scanner will contradict yours (it will — see the OSV
   trap), say so in the first paragraph. Being second to raise it looks like concealment.
4. **"Inherited from the SDK" is a claim, not a fact.** Check `fixAvailable` on every finding. On ChatWise,
   10 of 15 "Atlassian's to patch" were fixable by us. That line is the most rejectable sentence in a pack.
5. **Vendor-attested ≠ exploit-verified.** If your evidence is a CHANGELOG and a version floor, say exactly
   that. Never imply you proved it by execution. A PoC that fails to fire on the *known-vulnerable* version
   is an invalid test with zero diagnostic power — discard it, don't count it as a pass.
6. **Disclose what the scanners can't see, before the reviewer finds it.** Prompt-injection chains,
   decompression bombs, phantom deps. If they find those after reading your clean SAST, every other claim
   gets re-read with suspicion.
7. **The sandbox bounds damage; it does not remove bugs.** Zero egress + Atlassian-hosted + enforced scopes is
   a genuinely strong story — use it for *blast radius*, never as a reason to skip a scan.
8. **Find where the code actually runs before you "remediate" it.** `forge install list`. Deploying a fix to
   an environment with zero installs remediates nothing and misleads the reviewer.

## Standing directive: keep this current

Advisory databases, Forge scopes, and the SDK move. When you learn a new trap, a new risk class, or a
scanner behaviour, add it to the right reference and a dated line below. The traps file is the crown jewels —
it is what stops a confident-but-wrong report going out under someone's name.

## Changelog

- **2026-07-17** — Skill created from ChatWise / ITSM-80215. Seeded: the runnable scanner, the canary
  validation requirement, the **OSV-vs-npm-audit advisory-data-model split** (the single most important
  finding — a vendor abandoning npm makes a package "affected forever" in OSV while npm audit clears it),
  the ours-vs-SDK split discipline, phantom-dep and mutable-tag detection, and the beyond-scanners risk
  classes (prompt-injection → privileged tool-calls, decompression bombs) which on the real app were more
  severe than the CVE that triggered the review.
