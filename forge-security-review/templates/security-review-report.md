# Security review — <App name> (Forge)

> **Fill-in template.** Structure per `docs/04-reporting.md`. Every `<…>` is a blank; every ⚠ is a place a
> naive answer gets the pack rejected. Delete a section only if you can say *why* it doesn't apply — never
> because it's inconvenient. Read `docs/gotchas.md` before you write a word of this.

| | |
|---|---|
| App | `<app name>` (`ari:cloud:ecosystem::app/<app-id>`) |
| Version reviewed | `<version>` |
| Environment(s) | `<development / staging / production — from `forge install list`, not assumption>` |
| Reviewed by | `<name>` |
| Date | `<YYYY-MM-DD>` |
| Scan commands | Appendix A |

---

## 1. Read this first — where your scan and ours will disagree

⚠ **If the reviewer's own scanner will contradict this report, say so HERE, in paragraph one, with the
mechanism.** Being second to raise it reads as concealment. If nothing will disagree, say that explicitly and
move on — don't delete the section silently.

> Template (the OSV split — `docs/gotchas.md` §1):
>
> `<package>` is pinned to `<fixed version>`, which `npm audit` reports clean. An OSV-based scanner
> (Trivy, Grype, Dependabot, Snyk) **will still flag `<GHSA-xxxx>` on this exact version, permanently.**
> That is a data-model artefact, not a live bug: the vendor `<publishes outside npm / abandoned the registry
> at `<frozen version>`>`, so the GHSA range is `[{introduced: 0}]` with **no `fixed` event** — GitHub has no
> in-ecosystem version to name as the fix, so every version matches forever. Evidence it's the data model and
> not our pin: `<older CVEs from the same vendor DO carry {fixed: X} and match neither version>`, and OSV's own
> `last_known_affected_version_range` is `< <v>`, placing `<fixed version>` outside it.

## 2. Technical profile

Manifest-derived — for Forge, the manifest **is** the security surface (`docs/01-technical-profile.md`).
Egress first, because it's the strongest claim you have.

| Property | Value | Note |
|---|---|---|
| Egress (`permissions.external.fetch`) | `<absent = zero egress / list every domain>` | ⚠ Absent is a strong claim — verify, don't assume |
| Hosting | Atlassian-hosted (FaaS) — no infrastructure of ours | |
| Inference | `<@forge/llm in-platform (no API key, no third-party AI vendor) / vendor + endpoint>` | |
| Storage | `<KVS / entity store / none>` — tenant-scoped | |
| Scopes | `<list>` | ⚠ Call out every **write** and `allowImpersonation` yourself |
| CSP (`content.scripts` / `styles`) | `<declarations>` | ⚠ Disclose `unsafe-eval` / `unsafe-inline` here |
| Modules | `<list>` | |
| Runtime | `<nodejs version>` | |
| Runs on Atlassian | `<eligible / not — and why>` | |

## 3. SAST

**Tool:** `<semgrep X.Y.Z>` · **Rulesets:** `<p/javascript p/react p/nodejs p/secrets>` · **Scope:** first-party
source only (`node_modules`, bundles, and build output excluded).

**Result:** `<N findings — severity breakdown>`

⚠ **Canary validation (mandatory — a zero is not evidence until the scanner is proven to work).** A run whose
ruleset failed to load returns `0 findings` and exit 0, *identical to clean code*.

> Planted `<eval() of user input, a hardcoded AWS key>` in a scratch file; the ruleset fired `<N>` findings on
> them and returned to zero once removed. The zero above is therefore a real zero.

**Honest scope of the claim:** `<what SAST covered and what it structurally did not — see §5>`

## 4. SCA

**Tool:** `npm audit` · **Trees:** `--omit=dev` (what actually ships) **and** full (for completeness).

| | Prod tree | Full tree |
|---|---|---|
| Critical / High / Moderate / Low | `<c/h/m/l>` | `<c/h/m/l>` |

### Ours-by-choice vs inherited via `@forge/*` / `@atlaskit/*`

| Package | Advisory | Sev | Path | `fixAvailable` | Reachable? | Owner |
|---|---|---|---|---|---|---|
| `<pkg>` | `<GHSA>` | `<sev>` | `<direct / via @atlaskit/x>` | `<true/false>` | `<sink at file:line / not reached>` | `<us / SDK>` |

⚠ **"The rest are inherited from the SDK, so they're Atlassian's to patch" is a claim, not a fact — and it is
usually false.** Check `fixAvailable` on **every** row before you write it. On the founding case 10 of 15
so-labelled findings came back `fixAvailable: true`. Write instead:

> `<X>` are structurally theirs (`fixAvailable: false` on the latest SDK); `<Y>` we have not attempted yet, and
> here is why: `<reason>`.

**Reachability of the ones that matter:** `<trace the vuln to a sink — file:line — or state plainly that you
did not trace it>`

## 5. What the scanners could not see

⚠ **The section that earns trust.** A pack containing only good news reads as marketing. Disclose these
*before* the reviewer finds them — after they find one behind a clean SAST, every other claim gets re-read with
suspicion. On the founding app, the findings here were **more severe than the CVE that triggered the review**,
and no scanner has a rule for any of them (`docs/03-beyond-scanners.md`).

| Risk | Present? | Detail |
|---|---|---|
| Prompt injection → privileged tool-calls | `<y/n>` | `<untrusted text (attachments, issue fields) in the same LLM turn as write-scoped tools / allowImpersonation>` |
| Decompression bomb | `<y/n>` | `<a download cap bounds bytes fetched, NOT bytes expanded; check whether truncation happens after parsing>` |
| Phantom dependencies | `<y/n>` | `<imported, undeclared, resolved via hoisting — breaks the SBOM>` |
| Mutable version tags | `<y/n>` | `<"latest" / ranges that move under you>` |
| CSP weakenings | `<y/n>` | `<unsafe-eval / unsafe-inline>` |
| Unreviewed parsers on the untrusted path | `<y/n>` | `<parser + entry point>` |

## 6. Risk assessment — what the platform bounds, and what it does not

**Genuinely bounded by Forge:** `<zero egress (no external.fetch) so data cannot leave the tenant; runs on
Atlassian's infrastructure, not ours; scopes enforced at runtime; in-platform inference — no API key, no
third-party AI vendor>`.

**NOT bounded — state this plainly:** the sandbox bounds the **blast radius**; it does not make a vulnerable
parser absent. `<A vulnerable parser still executes in-sandbox on tenant data. Prompt injection into
write-scoped tool-calls operates entirely within granted permissions — which is exactly why scopes don't stop
it.>`

⚠ Never write "it's sandboxed, so SAST/SCA don't apply." It collapses the moment they run `npm audit`
themselves — and on the founding case that would have surfaced a live, reachable HIGH in our own code.

## 7. Remediation

| # | Item | Action | Owner | Status |
|---|---|---|---|---|
| 1 | `<finding>` | `<action>` | `<owner>` | `<done / planned / accepted risk + rationale>` |

**Evidence standard —** ⚠ vendor-attested ≠ exploit-verified. If the evidence is a CHANGELOG plus a version
floor, write exactly that: *"Vendor-patched per the upstream changelog and the version floors. Not
exploit-verified."* A PoC that fails to fire on the **known-vulnerable** version is an invalid test with zero
diagnostic power — discard it, never count it as a pass.

**Where it was fixed —** ⚠ `forge install list` is ground truth. Deploying to an environment with zero installs
remediates nothing: `<the sink existed in <env> on <tenant> and was remediated there; <production never carried
it / production carried it and was remediated on <date>>`.

## 8. Appendix A — reproduce it

```bash
python3 ~/.claude/skills/forge-security-review/scripts/forge_sec_scan.py <path>
# or, by hand:
semgrep --config p/javascript --config p/react --config p/nodejs --config p/secrets \
        --exclude node_modules --exclude build --json -o sast-semgrep.json <src>
npm audit --omit=dev --json > sca-npm-audit-prod.json
npm audit --json > sca-npm-audit-all.json
forge install list
```

---

### Before you send it

- [ ] §1 leads with whatever will make their scan disagree with yours.
- [ ] Every SAST zero is canary-backed.
- [ ] Every "theirs to patch" row has `fixAvailable` actually checked.
- [ ] §5 is non-empty, or you can say why.
- [ ] No claim of verification you didn't perform; "not verified" said out loud where true.
- [ ] **No private key, token, or secret attached.** Ticket attachments are agent-wide, reporter-visible and
      persist in backups and search. Credentials go through a secrets manager only.
- [ ] No confidential *product* of the app attached (report metrics as evidence, not the document).
- [ ] Framing is *"we closed what a scanner could see; here is what it structurally cannot, which we found
      ourselves, and here is the plan"* — **not** "this resolves the security review."
