# The traps — read before reporting anything

Every one of these was hit for real on ChatWise / ITSM-80215. Each produces a report that *looks* clean and
is wrong. A wrong security report is worse than none: it burns the credibility that every other claim in the
pack depends on.

---

## 1. ⚠️ The OSV trap — your scan and the reviewer's scan will disagree, and you'll look like a liar

**The single most important thing in this skill.**

When a vendor **abandons npm** and publishes elsewhere, the advisory data model breaks in a way that makes a
patched package look permanently vulnerable.

**The real case — SheetJS `xlsx`:**
- npm's `xlsx` is frozen at **0.18.5** (SheetJS moved to their own CDN). Maintained builds are 0.20.x.
- Two HIGH advisories: GHSA-4r6h-8v6p-xvw6 (prototype pollution, fixed **0.19.3**) and GHSA-5pgg-2g8v-p4x9
  (ReDoS, fixed **0.20.2**).
- Upgrade to 0.20.3 → **`npm audit` says clean.**
- Run **osv-scanner / Trivy / Grype / Dependabot / Snyk** → **both HIGHs still reported, on 0.20.3.**

**Why:** both GHSA records carry an affected range of `[{"introduced": "0"}]` with **no `fixed` event** —
because GitHub has no *in-ecosystem* (npm) version to name as the fix. Under strict OSV semantics that means
*affected at every version, forever*. The package can never be cleared in npm-ecosystem advisory data.

**The tell that it's the data model and not a scanner bug:** the older SheetJS Pro CVEs (2021-32012/13/14)
**do** carry `{"fixed": "0.17.0"}` and correctly match neither version. Same package, same DB — the ones with
a `fixed` event work. Also check OSV's `last_known_affected_version_range` fields (`< 0.19.3`, `< 0.20.2`):
they place 0.20.3 outside both, i.e. OSV itself knows.

**What to do:** **lead the report with it.** Explain the mechanism, cite `last_known_affected_version_range`,
cite the control case. Frame it as *"patched upstream, permanently un-clearable in npm advisory data."*
Never present a clean `npm audit` screenshot as the headline — the reviewer contradicts it in one command
and then re-reads everything you wrote with suspicion.

**Generalise:** any dep sourced outside the registry, or from a vendor who left it, will hit this.

## 2. The unvalidated zero — a scanner with no rules looks exactly like clean code

`semgrep --config=p/javascript ...` fetches rulesets from the registry. If that fetch fails, you get
**0 findings** and exit 0. Identical output to a genuinely clean scan.

**Always canary it.** Plant a file with unambiguous bugs and confirm the same invocation fires:

```js
app.get('/x', (req,res) => {
  eval(req.query.cmd);                             // code injection
  require('child_process').exec("ls " + req.query.dir);  // command injection
  res.send("<div>" + req.query.name + "</div>");   // xss
});
const AWS_KEY = "AKIAIOSFODNN7EXAMPLE";            // secret
```
Expect ≥3 findings. If the canary is silent, **your zero is meaningless** — do not report it.
(`scripts/forge_sec_scan.py` does this automatically and refuses to report a zero it can't validate.)

**The same discipline caught a false alarm in the other direction:** `file Notfallhandbuch.pdf` reported
"8 pages" for a 132-page PDF. One tool's summary is not ground truth — cross-check with a real parser.

## 3. Is your SCA even *seeing* the dependency?

If you fix something by pinning a **URL/tarball dep** (`"xlsx": "https://cdn.sheetjs.com/..."`), the obvious
fear is that `npm audit` simply can't evaluate a non-registry dep — which would make "no longer flagged" an
artifact of *invisibility*, not a fix.

**Test it, don't assume.** Install a **known-vulnerable version from the same non-registry source** and
confirm audit flags it:

```bash
mkdir /tmp/canary && cd /tmp/canary && npm init -y
npm install https://cdn.sheetjs.com/xlsx-0.20.1/xlsx-0.20.1.tgz   # ReDoS, fixed in 0.20.2
npm audit --json | python3 -c "import sys,json; print('flagged:', 'xlsx' in json.load(sys.stdin).get('vulnerabilities',{}))"
```

**Verified result (2026-07-17):** flagged — and flagged for the **ReDoS only**, not the prototype pollution
(already cleared at 0.19.3). Per-advisory range matching, on a version npm has **never served**. npm resolves
name+version from the tarball and audits by range, ignoring origin. **So a clean audit on a CDN dep is real.**

## 4. "It's inherited from the Atlassian SDK, so it's their problem"

The most rejectable sentence you can write, and it was false on the real app.

- ChatWise: 16 prod findings. The story "1 is ours, 15 are Atlassian's" was *nearly* right — but **10 of the
  15 reported `fixAvailable: true`**, and Atlassian had **already shipped** `@forge/events` 3.0.1 for one of
  them. Every `@forge/*` package was behind latest.
- The honest split: ~5 are structurally Atlassian's (`fixAvailable: false` even on the latest SDK); the rest
  we simply hadn't attempted.

**Check `fixAvailable` on every single finding before attributing it upstream.** And never say *"we can't
force transitive versions"* without opening `package.json` — ChatWise **already had an `overrides` block**,
so the claim was falsifiable in ten seconds. The defensible version is engineering judgment: *"we could force
`@atlaskit/adf-schema` 48→56 via overrides, but that's 8 majors under a UI framework we don't control and we
won't ship an untested forced resolution into a rendering path."* That reads as rigour. "Can't" reads as a dodge.

## 5. The sandbox is a blast-radius argument, not an absolution

Forge genuinely bounds a lot: runs on Atlassian's infra (no server of yours), zero egress if no
`external.fetch`, capability capped by declared scopes, no API keys with `@forge/llm`. Use all of it — it's
a strong, true story.

**But:** a vulnerable parser still executes **inside** the sandbox, on tenant data, against user-supplied
files. Prototype pollution in `xlsx` is a real in-sandbox integrity concern with zero egress. Say plainly:
*"the platform limits the blast radius; it does not make the bug absent."*

## 6. Deploying a "fix" to an environment that runs nothing

Before claiming remediation, find where the vulnerable code actually runs:

```bash
forge install list        # ground truth: which environment/site has installations
forge environments list   # 'last deployed' timestamps ~ms apart = registration scaffolding, never a real deploy
git rev-list --count --before=<prod-deploy-date> HEAD   # 0 => production predates the code entirely
```

**The real case:** the plan said "deploy to production (last deployed 2025-10-06)". Ground truth: the **only**
install was `development` on the test tenant; production had **zero** installs, its timestamps were 2ms apart
(scaffolding), and it predated the entire git history — **the vulnerable dep had never been in production.**
Deploying there would have remediated nothing, left the actually-vulnerable app running, shipped ~9 months of
never-production-tested code into a virgin environment, and then told a security reviewer it was fixed.

Also: **don't trust the repo's own deploy script.** ChatWise's `deploy.sh` exits 1 before deploying (it greps
a version pattern from files that don't contain one). Verify, or call `forge deploy` directly.

## 7. Local `node_modules` is not the shipped artifact

`XLSX.version` in your terminal proves nothing about the deployed function. Forge bundles the app; a new
`exports` map (0.20.3 has one, 0.18.5 didn't) could fail to resolve under the bundler. `forge lint` does not
bundle.

**Close it** by exercising the real path post-deploy and asserting the version *from inside* the function.
Note: driving a Forge **Custom UI** iframe with synthetic clicks/keystrokes often fails — the host app's
global shortcuts intercept them. Budget for a manual check, and **report it as unverified** if you can't.

## 8. Vendor attestation dressed up as proof

If your evidence that a sink is fixed is the upstream CHANGELOG + version floors, that is an **attestation**.
Reasonable (the vendor is the authority on their own CVE) — but say so.

And beware the invalid PoC: an exploit attempt that **fails to fire on the known-vulnerable version** has
**zero diagnostic power**. It is a negative-control failure, not a pass. Discard it; never report it as
verification.
