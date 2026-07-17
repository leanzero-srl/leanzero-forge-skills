#!/usr/bin/env python3
"""
Forge app security scanner — technical profile + SAST + SCA, with the traps built in.

  python3 forge_sec_scan.py /path/to/forge-app [-o OUTDIR]

Emits into OUTDIR (default <app>/.security-review/):
  SECURITY-REVIEW-<App>.md      the pack (a DRAFT — read docs/04-reporting.md before sending it)
  sast-semgrep.json             raw SAST
  sca-npm-audit-prod.json       raw SCA, shipping tree
  sca-npm-audit-all.json        raw SCA, incl. dev toolchain

What it does that a naive script doesn't (see docs/gotchas.md):
  * CANARY-VALIDATES the SAST ruleset — refuses to report a zero it cannot prove is real.
  * Splits SCA findings ours-by-choice vs inherited via @forge/@atlaskit, and reports fixAvailable
    so "that's Atlassian's problem" can't be asserted without evidence.
  * Flags PHANTOM deps (imported, undeclared — breaks the SBOM) and MUTABLE tags ("latest").
  * Extracts the manifest profile: egress, in-platform LLM, scopes, impersonation, CSP, storage.
  * Warns on the OSV trap for non-registry deps.

Requires: node/npm; semgrep (pip install semgrep) for the SAST section.
"""
import argparse, json, os, re, shutil, subprocess, sys, tempfile, datetime

def sh(cmd, cwd=None, timeout=900):
    p = subprocess.run(cmd, cwd=cwd, shell=isinstance(cmd, str), capture_output=True, text=True, timeout=timeout)
    return p.returncode, p.stdout, p.stderr

def say(m): print(m, flush=True)

# ---------------------------------------------------------------- manifest profile
def profile(app):
    path = os.path.join(app, "manifest.yml")
    if not os.path.exists(path):
        sys.exit(f"no manifest.yml in {app} — is this a Forge app?")
    raw = open(path, encoding="utf-8").read()
    p = {"raw": raw}
    p["app_id"] = (re.search(r'id:\s*(ari:cloud:ecosystem::app/[0-9a-f-]+)', raw) or [None, None])[1]
    p["runtime"] = (re.search(r'runtime:\s*\n\s*name:\s*(\S+)', raw) or [None, None])[1]
    # egress: the headline
    p["egress"] = bool(re.search(r'^\s*external:\s*$', raw, re.M) and re.search(r'^\s*fetch:\s*$', raw, re.M))
    # in-platform LLM
    p["forge_llm"] = bool(re.search(r'^\s*llm:\s*$', raw, re.M))
    # scopes + impersonation
    scopes = []
    m = re.search(r'scopes:\s*\n((?:\s+\S.*\n|\s*\n)+?)(?=^\s{0,2}\w|\Z)', raw, re.M)
    if m:
        cur = None
        for line in m.group(1).splitlines():
            s = re.match(r'\s{4,}([a-z:_.\-]+):\s*$', line) or re.match(r'\s{4,}([a-z:_.\-]+):\s*\{', line)
            if s and ":" in s.group(1):
                cur = s.group(1); scopes.append({"scope": cur, "impersonation": None})
            if cur and "allowImpersonation" in line and scopes:
                scopes[-1]["impersonation"] = "true" in line.split("allowImpersonation")[1]
    p["scopes"] = scopes
    p["csp"] = re.findall(r'(unsafe-inline|unsafe-eval)', raw)
    # modules: ONLY keys inside the top-level `modules:` block. Naively grepping 2-space keys also
    # catches app/permissions children (content, runtime, scopes) which are NOT modules.
    mods = []
    mblock = re.search(r'^modules:\s*$\n(.*?)(?=^\S|\Z)', raw, re.M | re.S)
    if mblock:
        mods = re.findall(r'^\s{2}([a-zA-Z][\w:.\-]*):\s*$', mblock.group(1), re.M)
    p["modules"] = sorted(set(mods))
    return p


COMMENTS = re.compile(r'//[^\n]*|/\*.*?\*/', re.S)
# Anchored to a real import/require statement. An unanchored `from "x"` also matches PROSE inside
# comments — a JSDoc line reading `transition from "processing" -> result` invented a phantom
# dependency called `processing` on a real app. Strip comments AND anchor.
IMPORT_RE = re.compile(
    r'''^\s*(?:import\s+(?:[\w*{},\s]+\s+from\s+)?|export\s+[\w*{},\s]+\s+from\s+)['"]([^'"]+)['"]'''
    r'''|(?:^|[\s=(,;])require\(\s*['"]([^'"]+)['"]\s*\)''',
    re.M)

# ---------------------------------------------------------------- deps
def deps(app):
    pj = json.load(open(os.path.join(app, "package.json"), encoding="utf-8"))
    d, dev = pj.get("dependencies", {}), pj.get("devDependencies", {})
    # phantom deps: imported in src/ but declared nowhere
    imported = set()
    for root, dirs, files in os.walk(os.path.join(app, "src")):
        dirs[:] = [x for x in dirs if x != "node_modules"]
        for f in files:
            if not f.endswith((".js", ".jsx", ".ts", ".tsx")) or f.endswith(".bundle.js"):
                continue
            try:
                t = open(os.path.join(root, f), encoding="utf-8", errors="ignore").read()
            except Exception:
                continue
            t = COMMENTS.sub("", t)          # prose in comments must never look like an import
            for m in IMPORT_RE.finditer(t):
                mod = m.group(1) or m.group(2)
                if not mod or mod.startswith(".") or mod.startswith("node:"):
                    continue
                parts = mod.split("/")
                imported.add("/".join(parts[:2]) if mod.startswith("@") else parts[0])
    declared = set(d) | set(dev)
    phantom = sorted(x for x in imported - declared if not x.startswith("node:"))
    mutable = {k: v for k, v in {**d, **dev}.items() if v in ("latest", "*", "next")}
    nonregistry = {k: v for k, v in d.items() if v.startswith(("http://", "https://", "git+", "file:"))}
    return pj, d, dev, phantom, mutable, nonregistry

# ---------------------------------------------------------------- SCA
def sca(app, out):
    res = {}
    for label, args in [("prod", ["--omit=dev"]), ("all", [])]:
        rc, so, se = sh(["npm", "audit", "--json"] + args, cwd=app)
        try:
            data = json.loads(so)
        except Exception:
            say(f"  ! npm audit --json ({label}) unreadable"); data = {}
        json.dump(data, open(os.path.join(out, f"sca-npm-audit-{label}.json"), "w"), indent=1)
        res[label] = data
    return res

def split_sca(data, direct):
    """ours-by-choice vs inherited via the Atlassian SDK. NEVER assert 'Atlassian's problem'
    without fixAvailable — see docs/gotchas.md §4."""
    ours, sdk = [], []
    for name, v in (data.get("vulnerabilities") or {}).items():
        row = {"pkg": name, "severity": v.get("severity"), "fixAvailable": v.get("fixAvailable"),
               "direct": name in direct,
               "titles": [x.get("title") for x in v.get("via", []) if isinstance(x, dict)]}
        (ours if row["direct"] and not name.startswith(("@forge", "@atlaskit")) else sdk).append(row)
    return ours, sdk

# ---------------------------------------------------------------- SAST (canary-validated)
CANARY = '''const express=require('express');const app=express();
app.get('/x',(req,res)=>{ eval(req.query.cmd);
  require('child_process').exec("ls "+req.query.dir);
  res.send("<div>"+req.query.name+"</div>"); });
const AWS_KEY="AKIAIOSFODNN7EXAMPLE";
'''
CONFIGS = ["--config=p/javascript", "--config=p/react", "--config=p/nodejs", "--config=p/secrets"]

def semgrep_bin():
    for c in ("semgrep", os.path.expanduser("~/.local/bin/semgrep")):
        if shutil.which(c) or os.path.exists(c):
            return c
    return None

def sast(app, out):
    sg = semgrep_bin()
    if not sg:
        say("  ! semgrep not installed (pip install semgrep) — SAST SKIPPED")
        return None
    tgt = [d for d in ("src", "manifest.yml") if os.path.exists(os.path.join(app, d))]
    rc, so, se = sh([sg, "scan", *CONFIGS, "--exclude=node_modules", "--exclude=*.bundle.js",
                     "--exclude=dist", "--exclude=build", "--json", "--quiet",
                     "-o", os.path.join(out, "sast-semgrep.json"), *tgt], cwd=app)
    try:
        d = json.load(open(os.path.join(out, "sast-semgrep.json")))
    except Exception:
        say("  ! semgrep produced no readable output"); return None
    findings, scanned = len(d.get("results", [])), len(d.get("paths", {}).get("scanned", []))

    # THE TRAP: a ruleset that failed to load yields the same zero as clean code. Prove it fires.
    canary_ok = None
    if findings == 0:
        with tempfile.TemporaryDirectory() as td:
            open(os.path.join(td, "bad.js"), "w").write(CANARY)
            rc2, so2, _ = sh([sg, "scan", *CONFIGS, "--json", "--quiet", td])
            try:
                canary_ok = len(json.loads(so2).get("results", [])) >= 3
            except Exception:
                canary_ok = False
    return {"findings": findings, "scanned": scanned, "errors": d.get("errors", []),
            "canary_validated": canary_ok, "results": d.get("results", [])}

# ---------------------------------------------------------------- report
def report(app, out, p, pj, direct, phantom, mutable, nonregistry, s, sc):
    name = pj.get("name", os.path.basename(app.rstrip("/")))
    today = datetime.date.today().isoformat()
    prod = sc.get("prod", {}).get("metadata", {}).get("vulnerabilities", {})
    alld = sc.get("all", {}).get("metadata", {}).get("vulnerabilities", {})
    ours, sdk = split_sca(sc.get("prod", {}), direct)
    L = []
    A = L.append
    A(f"# Security review pack — {name} (Atlassian Forge app)\n")
    A(f"| | |\n|---|---|\n| **App ID** | `{p['app_id']}` |\n| **Runtime** | `{p['runtime']}` (Atlassian-hosted FaaS) |\n| **Generated** | {today} |\n")
    A("\n> DRAFT generated by the `forge-security-review` skill. Read `docs/04-reporting.md` and\n> `docs/gotchas.md` before sending. The judgment calls are yours.\n")

    A("\n## 1. Technical profile\n")
    A(f"- **Egress:** {'DECLARED — list every host and justify it' if p['egress'] else '**NONE** — no `external.fetch`; the app cannot call any external host. No data leaves the Atlassian tenant.'}")
    A(f"- **Inference:** {'`@forge/llm` — Atlassian in-platform model. No API key, no third-party AI vendor receives content.' if p['forge_llm'] else 'no in-platform LLM module declared'}")
    A(f"- **Hosting:** Atlassian FaaS. No server, VM, container, endpoint or database of ours in the request path; no inbound attack surface of ours.")
    A(f"- **Modules:** {', '.join(p['modules']) or 'n/a'}")
    if p["scopes"]:
        A("\n| Scope | Impersonation |\n|---|---|")
        for s_ in p["scopes"]:
            A(f"| `{s_['scope']}` | {s_['impersonation']} |")
        imp = [x['scope'] for x in p['scopes'] if x['impersonation'] and (x['scope'].startswith(('write','manage')))]
        if imp:
            A(f"\n⚠️ **Impersonating write/manage scopes:** {', '.join('`'+i+'`' for i in imp)} — the app acts AS the user. "
              "If untrusted content also reaches the LLM/tool layer, see `docs/03-beyond-scanners.md` §1 (prompt injection → privileged write).")
    if p["csp"]:
        A(f"\n⚠️ **CSP relaxations declared:** {', '.join(sorted(set(p['csp'])))} — disclose proactively; a reviewer will find them.")

    A("\n## 2. SAST\n")
    if not s:
        A("_semgrep unavailable — SAST not run._")
    else:
        A(f"| Tool | Semgrep, rulesets p/javascript p/react p/nodejs p/secrets |\n|---|---|\n| Files scanned | **{s['scanned']}** (first-party; node_modules/bundles excluded) |\n| Errors | {s['errors'] or 'none'} |\n| **Findings** | **{s['findings']}** |")
        if s["findings"] == 0:
            A(f"\n**Ruleset canary-validated:** {'YES — a planted-vulnerable file produced ≥3 findings, so this zero is real.' if s['canary_validated'] else '**NO — DO NOT REPORT THIS ZERO.** The ruleset could not be proven live; a scanner with no rules yields the identical result to clean code.'}")
        else:
            for r in s["results"][:15]:
                A(f"- `{r['extra']['severity']}` {r['check_id'].split('.')[-1]} — {r['path']}:{r['start']['line']}")
        A("\n**Scope of this claim:** no injection/XSS/secret *patterns* in first-party source. These rulesets have "
          "**no rules** for prompt injection, AI tool-calling, Forge scope over-provisioning or decompression bombs "
          "(see `docs/03-beyond-scanners.md`). The canary proves the runner works, not that the rules cover this app's risks.")

    A("\n## 3. SCA\n")
    A(f"- **Shipping (prod) tree:** total **{prod.get('total',0)}** — critical {prod.get('critical',0)}, high **{prod.get('high',0)}**, moderate {prod.get('moderate',0)}, low {prod.get('low',0)}")
    A(f"- **Incl. dev toolchain:** total {alld.get('total',0)} — high {alld.get('high',0)}, moderate {alld.get('moderate',0)}, low {alld.get('low',0)}")
    if ours:
        A("\n### Ours by choice (we picked these — our problem)\n\n| Package | Severity | fixAvailable | Advisories |\n|---|---|---|---|")
        for r in ours:
            A(f"| `{r['pkg']}` | {r['severity']} | {r['fixAvailable']} | {'; '.join(t for t in r['titles'] if t) or '—'} |")
        A("\n**Check reachability by hand for each** (`docs/03-beyond-scanners.md` §7) — 'present' is a finding, 'reachable' is a risk.")
    else:
        A("\n_No findings in directly-chosen third-party deps._")
    if sdk:
        fixable = [r for r in sdk if r["fixAvailable"] not in (False, None)]
        A(f"\n### Arriving via the Atlassian SDK (`@forge/*`, `@atlaskit/*`) or transitives — {len(sdk)}\n")
        A(f"⚠️ **{len(fixable)} of these report `fixAvailable` — they are NOT automatically 'Atlassian's to patch'.** "
          "Do not write that sentence without checking each one (`docs/gotchas.md` §4).\n")
        A("| Package | Severity | fixAvailable |\n|---|---|---|")
        for r in sdk:
            A(f"| `{r['pkg']}` | {r['severity']} | {r['fixAvailable']} |")

    A("\n## 4. Supply-chain hygiene\n")
    if phantom:
        A(f"- 🔴 **Phantom deps (imported, declared nowhere — your SBOM is incomplete by construction):** {', '.join('`'+x+'`' for x in phantom)}")
    if mutable:
        A(f"- 🔴 **Mutable version tags:** {', '.join(f'`{k}: {v}`' for k,v in mutable.items())} — every unlocked install may pull different code.")
    if nonregistry:
        A(f"- ⚠️ **Non-registry deps:** {', '.join(f'`{k}`' for k in nonregistry)} — integrity IS pinned in the lockfile and npm enforces it, "
          "but **OSV-based scanners may flag these forever** if the vendor abandoned the registry. **See `docs/gotchas.md` §1 and lead the report with it.**")
    if not (phantom or mutable or nonregistry):
        A("- No phantom deps, mutable tags or non-registry sources found.")

    A("\n## 5. What the scanners could NOT see — fill this in by hand\n")
    A("Do not send the pack without working `docs/03-beyond-scanners.md`. On the app this skill was built from, "
      "**every finding here was more severe than the CVE that triggered the review**:\n")
    A("- [ ] Prompt injection → privileged tool-call (untrusted content + write scopes + impersonation, one turn)\n"
      "- [ ] Decompression bombs (download cap ≠ expansion cap; truncation after parse guards nothing)\n"
      "- [ ] Reachability of each SCA finding\n"
      "- [ ] Scope over-provisioning / unnecessary impersonation\n"
      "- [ ] Other untrusted-input parsers not named by a scanner\n")
    A("\n## 6. Before you claim remediation\n")
    A("`forge install list` — find which environment actually runs the code. Deploying a fix to an environment "
      "with zero installs remediates nothing and misleads the reviewer (`docs/gotchas.md` §6).\n")
    path = os.path.join(out, f"SECURITY-REVIEW-{name}.md")
    open(path, "w", encoding="utf-8").write("\n".join(L) + "\n")
    return path

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("app"); ap.add_argument("-o", "--out", default=None)
    a = ap.parse_args()
    app = os.path.abspath(a.app)
    out = a.out or os.path.join(app, ".security-review")
    os.makedirs(out, exist_ok=True)
    say(f"[1/4] manifest profile …");  p = profile(app)
    say(f"[2/4] dependencies …");      pj, d, dev, phantom, mutable, nonreg = deps(app)
    say(f"[3/4] SCA (npm audit) …");   sc = sca(app, out)
    say(f"[4/4] SAST (semgrep + canary) …"); s = sast(app, out)
    path = report(app, out, p, pj, d, phantom, mutable, nonreg, s, sc)
    say(f"\n  pack: {path}")
    if s and s["findings"] == 0 and not s["canary_validated"]:
        say("  !! SAST zero is NOT canary-validated — do not report it.")
    if nonreg:
        say("  !! non-registry deps present — read docs/gotchas.md §1 (OSV) BEFORE reporting a clean SCA.")

if __name__ == "__main__":
    main()
