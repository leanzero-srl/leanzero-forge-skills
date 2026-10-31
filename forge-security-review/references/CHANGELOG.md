# forge-security-review changelog

- **2026-10-31** blubber audit: dated history moved here from SKILL.md; the "keep this current" directive cut (one home: ~/.claude/CLAUDE.md "Skills are the memory").

**2026-10-11 — lz-ppm full verification.** Gates were green but three were partly blind: a crashing local Semgrep rule dropped two whole files, trufflehog had no detector for the dev HARNESS_SECRET committed in a doc (stale, proven dead), and a raw NUL in source hid a file from grep. Manual review (2 parallel agents, each claim re-verified) found real authz/integrity bugs no scanner sees: a legacy Apply completion that read stranger issues AS THE APP via verification diffs, an AI review with no server-side prompt bound (site-wide cap burn), an unbounded presence value, a portfolio id addressing the registry key. Traps in `docs/gotchas.md` §10.

**2026-09-26 — became CI gates.** lz-ppm-forge `security/` turns this method into `npm run test:security` (SAST+canary, SCA npm+OSV tiered by bundle source maps, trufflehog history scan, FSRT with coverage canary, manifest allow-list, authz suites, AI-prompt inventory) with SLA-dated baselines; the standard is leanzero-forge-app-baseline `references/security-gates.md`. New traps in `docs/gotchas.md` §9 (FSRT blind to register*(resolver); Semgrep silent timeouts; CRA audit ≠ shipped set; gitleaks noise).

**2026-07-29 — rebuilt around what a real review actually missed.** ChatWise (ITSM-80215): a
competent engineer with SonarQube + BlackDuck filed 7 findings; verification conceded 2, RAISED 2
severities, refuted 1, and added 3 he never saw, including the worst defect in the app. Added
`scripts/forge_authz_scan.py` and `docs/05-authorization-and-llm-agents.md` for the classes SAST
cannot see (app-scoped KVS, zero-entropy ids, every prompt builder, unguarded write tools, the
zero-egress fallacy). Two bugs found while testing the new scanner and fixed before shipping it: it
walked nested git worktrees (doubling every count) and its ownership regex was case-sensitive, so
`userAccountId !==` — idiomatic Forge casing — read as UNGUARDED on correctly-guarded code. Verified
red on the pre-fix tree (it finds the Blocker at `IssuePanelApp.js:297`) and green on the fixed one.

- **2026-07-17** — Skill created from ChatWise / ITSM-80215. Seeded: the runnable scanner, the canary
  validation requirement, the **OSV-vs-npm-audit advisory-data-model split** (the single most important
  finding — a vendor abandoning npm makes a package "affected forever" in OSV while npm audit clears it),
  the ours-vs-SDK split discipline, phantom-dep and mutable-tag detection, and the beyond-scanners risk
  classes (prompt-injection → privileged tool-calls, decompression bombs) which on the real app were more
  severe than the CVE that triggered the review.
