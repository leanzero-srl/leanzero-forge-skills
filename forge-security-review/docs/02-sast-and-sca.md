# Running SAST and SCA on a Forge app

`scripts/forge_sec_scan.py` automates all of this. Read this to understand what it does and to run it by
hand when you need to.

---

## SAST — Semgrep

```bash
pip install semgrep     # PEP 668: use a venv if the system python refuses
semgrep scan --config=p/javascript --config=p/react --config=p/nodejs --config=p/secrets \
  --exclude=node_modules --exclude='*.bundle.js' --exclude=dist --exclude=build \
  --json --quiet src manifest.yml -o sast-semgrep.json
```

**Scope deliberately:** first-party source only. `node_modules` is SCA's job, and webpack bundles are
generated output that will drown you in noise from vendored code.

**Then canary it — non-negotiable** (`docs/gotchas.md` §2). The rulesets are fetched from the registry; a
failed fetch yields `0 findings` and exit 0, identical to clean code. Plant a file with `eval(req.query.x)`,
`exec("ls "+input)`, reflected XSS and a hardcoded AWS key, rerun the *same* invocation, expect ≥3 hits.
No canary → no reportable zero.

**Read the output honestly.** "0 findings" means *no injection/XSS/secret patterns in our own source*. It
does **not** mean secure. Those rulesets have no rules for prompt injection, AI tool-calling, Forge scope
over-provisioning or decompression bombs — see `docs/03-beyond-scanners.md`. Say the scope out loud in the report;
a reviewer who thinks you're claiming more than you are will discount everything.

**Expect a genuine zero on a small Forge app** — and understand why: no SQL layer (KVS), no server you
operate, no inbound endpoints, and usually no egress. The classic SAST sinks have nowhere to land. That is a
real and reportable observation, not a get-out.

## SCA — npm audit

```bash
npm audit --omit=dev --json > sca-npm-audit-prod.json   # the SHIPPING tree — lead with this
npm audit --json          > sca-npm-audit-all.json      # incl. build toolchain
```

**Report the prod tree as the headline.** Dev-only findings (webpack, babel, eslint) don't ship to the Forge
runtime; conflating them inflates the number and invites a reviewer to discount the whole report.

### The three questions to ask of every finding

**1. Is it ours, or the SDK's?**
Split direct third-party deps from anything arriving via `@forge/*` / `@atlaskit/*` and their transitives.
Real numbers from ChatWise: 16 prod findings, **1 ours** (`xlsx`), **15 inherited**. That split is the story.

**2. Is `fixAvailable` true?** — **the trap.** "Inherited = Atlassian's problem" is false until checked.
10 of those 15 were fixable; Atlassian had already shipped `@forge/events` 3.0.1. Say the honest split:
*N are structurally theirs (`fixAvailable: false` even on latest SDK); M we haven't attempted yet.*
(`docs/gotchas.md` §4)

**3. Is it reachable?** SCA never answers this, and it's the difference between a finding and a risk.
```bash
grep -rn "from ['\"]<pkg>['\"]" src      # imported at all?
grep -rn "<VulnerableApi>(" src          # vulnerable call reached?
```
`xlsx` was reachable — `XLSX.read(buffer)` on user-supplied spreadsheets via the AI file tool. That turned
"npm says HIGH" into "fix it now". Several `undici` HTTP-smuggling advisories were **inert** because the app
declares no egress — worth saying, because it shows you read the findings rather than counted them.

### Before you report a clean SCA
- **Non-registry dep?** → `docs/gotchas.md` §1. OSV-based scanners will disagree with you. **Lead with it.**
- **Fixed by pinning a URL?** → prove audit isn't blind to URL deps (`docs/gotchas.md` §3).
- **`fixAvailable: false` + reachable + no upstream fix?** → that's a real decision (replace the lib, drop
  the feature, or accept with documented mitigation), not a footnote.

## Fixing a dep with no npm fix

When the registry is abandoned (SheetJS is the canonical case), the maintained build may live on the
vendor's CDN:
```bash
npm install --save https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
```
This is **SheetJS's own documented install path** — their docs call the CDN "the authoritative source" and
the stuck registry "a known registry bug". Quote that in the report; "unvetted third-party sourcing" is the
objection you must pre-empt.

**Verify the trade-off honestly:**
- Integrity **is** pinned — the lockfile carries a sha512 and npm enforces it (tamper it → `npm ci` fails
  `EINTEGRITY`). A swapped tarball breaks the build; it cannot silently poison it.
- The cost is **availability**, not tampering: `npm ci` now needs egress to that CDN, so a registry-only
  allowlist (Artifactory/Nexus) breaks clean-room rebuilds. Vendoring the tarball is the vendor's own advice.
- A URL pin has **no semver range** → Dependabot/`npm update` can never bump it. State the manual watch plan.
- Residual: the lock hash is trust-on-first-use — it pins tamper-detection forward but couldn't detect a CDN
  already compromised at install time.

**Check the "safer" alternative before accepting it.** Swapping to a registry-published lib sounds safer;
measure it. `exceljs` was ~19 months stale, pulled **97** transitive deps against `xlsx@0.20.3`'s **zero**,
carried its own advisory, and would have forced a source rewrite mid-review — a net regression bought to
satisfy a checkbox.

## Always test the fix against the REAL function

Not a replica, not a round-trip through the same library. Import the app's actual extraction/parse function,
feed it a genuine artifact, and assert the content survives:

```js
import { extractTextFromAttachment } from "./src/shared/files/extractText.js";
const res = await extractTextFromAttachment({ buffer, filename: "t.xlsx", mimeType: "" });
// assert res.ok AND that specific cells actually came through
```
A version bump that "installs fine" and silently changes parser output is the regression you'll be blamed
for. And note: **local `node_modules` is not the shipped artifact** (`docs/gotchas.md` §7).
