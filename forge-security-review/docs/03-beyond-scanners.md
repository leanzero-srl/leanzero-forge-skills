# What SAST and SCA structurally cannot see in a Forge app

**On the real app, every finding here was more severe than the CVE that triggered the review.** Semgrep's
`p/javascript`/`p/react`/`p/nodejs`/`p/secrets` rulesets contain **no rules** for any of it, and `npm audit`
only knows about named packages. If your pack is "0 SAST findings + a clean SCA" and a reviewer finds one of
these, every other claim you made gets re-read with suspicion.

**Hunt these by hand. Disclose them before the reviewer finds them.**

---

## 1. Prompt injection → privileged tool-call (the big one for AI Forge apps)

**The precondition — check all four:**
1. Untrusted content enters the LLM context (attachment text, issue descriptions, comments, web content).
2. Write-capable tools are available **in the same turn** (`createIssue`, `updateIssueField`, `addComment`,
   `transitionIssue`, `linkIssues`).
3. Manifest grants `write:*` / `manage:*` — especially with **`allowImpersonation: true`** (acts as the user).
4. No sanitization and no confirmation/dry-run gate.

**How to check:**
```bash
grep -rn "TOOLS" src/shared/tools/index.js          # is it ONE flat array of read+write tools?
grep -rnE "sanitiz|untrusted|injection|confirm|dryRun" src/   # usually returns nothing — that's the finding
```
Look for a single `JIRA_TOOLS = [...READ_TOOLS, ...WRITE_TOOLS, ...]` handed wholesale to the model.

**The real finding (ChatWise):** untrusted attachment text (xlsx/pptx/docx/pdf) landed in the same LLM turn
as `createIssue`/`updateIssueField`/`transitionIssue`, under `write:jira-work` + `manage:jira-configuration`,
both impersonating, with zero sanitization and no confirm step. **Instructions planted in a spreadsheet cell
can drive writes to Jira as the user.** Zero egress does not help — the damage is *inside* the tenant.

**Note the irony to own:** an AI app's worst risk is usually its own tool-calling, not its dependencies.

**Mitigations to propose:** separate read-only and write tool sets by turn; require explicit user
confirmation for writes; mark file-derived content as untrusted in the prompt; drop `allowImpersonation`
where the app doesn't need to act as the user; least-privilege the scopes.

## 2. Decompression bombs on the untrusted-file path

**The pattern:** a size cap on the **download** is not a cap on the **expansion**, and truncation **after**
extraction guards nothing at parse time.

**The real finding (ChatWise):**
- `MAX_FILE_BYTES = 15MB` checked at download.
- `JSZip.loadAsync` / `XLSX.read` / `mammoth.extractRawText` each **fully expand** in a 512MB function.
- DEFLATE reaches ~1000:1. 15MB in → ~15GB attempted.
- `DEFAULT_MAX_CHARS = 100000` truncates **after** extraction completes.

Severity is bounded (self-inflicted, per-invocation, Forge kills the function, no cross-tenant impact) — but
a rigorous reviewer finds it in five minutes and asks why the library ReDoS mattered and this didn't. **We
patched a library DoS while an architectural DoS stayed open on the same input.** Say that yourself.

**Check:** where is the size checked, and does anything bound the *output* of the parser before it completes?

## 3. Phantom dependencies — imported, declared nowhere, invisible to the SBOM

**The real finding:** `extractText.js:24` did `import JSZip from "jszip"`, yet `jszip` was in **neither**
`dependencies` nor `devDependencies`. It resolved only by **hoisting** out of `mammoth`. Any SBOM or SCA
generated from `package.json` would **silently omit a library that parses untrusted ZIP/pptx**.

That is a security deliverable that is **incomplete by construction** — exactly the kind of gap that
discredits a pack.

**Check:**
```bash
grep -rhoE "^import .* from ['\"]([a-z@][^'\"]*)['\"]" src | sed -E "s/.*['\"]([^'\"]+)['\"]/\1/" \
  | grep -v "^\." | cut -d/ -f1-2 | sort -u    # every imported package
# diff that against package.json dependencies + devDependencies
```
(`scripts/forge_sec_scan.py` does this automatically.)

## 4. Mutable version tags

`"@forge/events": "latest"` — a floating tag means **every unlocked install can pull different code**.
Materially worse supply-chain hygiene than a pinned CDN tarball, and a terrible look if the reviewer spots it
while you're defending a pinned dep.

**Check:** `grep -E '": *"(latest|\*|next)"' package.json`

## 5. CSP relaxations

`unsafe-eval` / `unsafe-inline` in `permissions.content.scripts`. Matters much more when the iframe renders
untrusted attachment content and AI output. Disclose it; say honestly whether you've verified it's required.

## 6. Scope over-provisioning

Is every declared scope used? Is `allowImpersonation: true` needed on each? An unused `manage:*` is free
risk, and no scanner will ever mention it.

## 7. Reachability — the question SCA never answers

`npm audit` says a package is vulnerable. It never says whether **your code reaches the vulnerable sink**.
That's the difference between a finding and a risk.

**Do this by hand** — it converts a list into an argument:
```bash
grep -rn "from ['\"]<pkg>['\"]" src        # is it imported at all?
grep -rn "<VulnerableApi>(" src            # is the vulnerable call reached?
# then trace back: who calls it, and can user-supplied bytes get there?
```
**The real case:** `xlsx` wasn't just present — `extractText.js:138` called `XLSX.read(buffer)` on
user-supplied spreadsheets via the AI's file-read tool. **Reachable.** That's what turned "npm says HIGH" into
"fix this now." Conversely, several `undici` HTTP-smuggling advisories were **inert** because the app declares
**no egress** — worth saying, because it shows you read the findings instead of counting them.
