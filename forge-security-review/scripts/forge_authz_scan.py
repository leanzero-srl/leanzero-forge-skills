#!/usr/bin/env python3
"""
Forge authorization + LLM-agent scanner — the classes a SAST tool does NOT find.

  python3 forge_authz_scan.py /path/to/forge-app

WHY THIS EXISTS. On ChatWise (ITSM-80215, 29 Jul 2026) a competent security engineer using
SonarQube and BlackDuck reported one Blocker and one High. An independent read of the code found
the worst defect in the app was NOT in his list, and that one of his Mediums was actually a
Blocker. None of what he missed is findable by a scanner that looks for injection sinks and CVEs,
because none of it is a bad API call — it is a MISSING CHECK, and absence has no signature.

The five classes below are what that review actually turned on. Each is reported with the evidence
to check by hand: this script raises questions, it does not pronounce verdicts.

  1. UNAUTHORIZED STORAGE ACCESS. Forge KVS/storage under `storage:app` is APP-scoped, not
     user-scoped. Any id a caller can name is a row they can read or write unless the resolver
     checks ownership itself. The platform will not do it for you.
  2. GUESSABLE RESOURCE IDS. An id derived from something public (an issue key, a project key)
     has no entropy. Combined with (1) that is a plain IDOR over a printed identifier.
  3. UNTRUSTED TEXT REACHING A SYSTEM PROMPT. Jira content, uploaded files and anything else a
     third party can write, interpolated into role:"system". Find EVERY builder, not the first.
  4. WRITE TOOLS IN AN AGENT LOOP. LLM tool-calling that can create/update/transition/comment,
     with no confirmation and no budget. This is what turns (3) from an annoyance into a Blocker.
  5. THE ZERO-EGRESS FALLACY. "No external.fetch so it cannot exfiltrate" is FALSE when the app
     can search Jira and write to Jira: the sink is Jira itself.
"""
import argparse, os, re, sys, json

SKIP_DIR = {"node_modules", ".git", "dist", "build", ".security-review", "coverage"}

# A hit inside a test is not a code path — the app cannot reach it. Left in, the scanner cited its
# OWN security tests as evidence that the app writes to Jira, which reads as noise and teaches the
# reader to skim the evidence. Tests are excluded from evidence; use --include-tests to see them.
TEST_RE = re.compile(r"(^|/)(test|tests|__tests__|spec|e2e)(/|$)|\.(test|spec)\.[cm]?[jt]sx?$")


def is_test(path: str) -> bool:
    return bool(TEST_RE.search(str(path).replace("\\", "/")))


INCLUDE_TESTS = "--include-tests" in sys.argv
SKIP_FILE = re.compile(r"\.(bundle|min)\.js$|\.map$")

def sources(app):
    for root, dirs, files in os.walk(app):
        # Skip nested checkouts and git worktrees. Scanning one produces a doubled report and
        # findings against paths the reviewer does not have — caught when a temporary worktree
        # made every count exactly twice.
        dirs[:] = [
            d for d in dirs
            if d not in SKIP_DIR and not os.path.exists(os.path.join(root, d, ".git"))
        ]
        for f in files:
            if not f.endswith((".js", ".jsx", ".ts", ".tsx", ".mjs")) or SKIP_FILE.search(f):
                continue
            full = os.path.join(root, f)
            if not INCLUDE_TESTS and is_test(os.path.relpath(full, app)):
                continue
            yield full


def resolver_bodies(text):
    """Yield (name, line, body) for each resolver.define(...) in a file.

    Brace-matched from the definition to its close, so a gate in one resolver cannot be credited to
    the next one. Strings and template literals are tracked well enough that a brace inside a
    message does not end the body early; comments are not stripped, which is deliberate — a regex
    that looks like code is required to clear the check anyway.
    """
    for m in re.finditer(r"""resolver\.define\(\s*["'`]([^"'`]+)["'`]""", text):
        name = m.group(1)
        ln = text[: m.start()].count("\n") + 1
        # Start AFTER the arrow. The first "{" following resolver.define(...) is usually the
        # DESTRUCTURING pattern — async ({ payload, context }) => { ... } — so brace-matching from
        # there captures "{ payload, context }" as the whole body. Every gate then reads as absent,
        # which is a false CLEAN on the argument list of the very resolver being checked.
        nxt = text.find("resolver.define(", m.end())
        arrow = text.find("=>", m.end())
        if arrow == -1 or (nxt != -1 and arrow > nxt):
            continue  # not an inline handler (e.g. a named function reference) — cannot judge here
        i = text.find("{", arrow)
        if i == -1 or (nxt != -1 and i > nxt):
            continue
        depth, j, quote = 0, i, None
        while j < len(text):
            c = text[j]
            if quote:
                if c == "\\":
                    j += 2
                    continue
                if c == quote:
                    quote = None
            elif c in "\"'`":
                quote = c
            elif c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
                if depth == 0:
                    break
            j += 1
        yield name, ln, text[i : j + 1]


def rel(app, p):
    return os.path.relpath(p, app)

def scan(app):
    findings = []
    resolvers, storage_calls, prompt_builders = [], [], []
    write_tools, agent_loops, search_calls = [], [], []
    as_user = []

    for path in sources(app):
        try:
            text = open(path, encoding="utf-8", errors="replace").read()
        except OSError:
            continue
        lines = text.split("\n")
        for i, ln in enumerate(lines, 1):
            loc = f"{rel(app, path)}:{i}"
            if re.search(r"resolver\.define\(", ln):
                name = (re.search(r'resolver\.define\(\s*["\'](\w+)', ln) or [None, "?"])[1]
                resolvers.append((loc, name, ln.strip()))
            if re.search(r"\b(kvs|storage)\.(get|set|delete|query)\b", ln):
                storage_calls.append((loc, ln.strip()))
            if re.search(r'role:\s*["\']system["\']|systemPrompt|buildSystemPrompt|SYSTEM_PROMPT', ln):
                prompt_builders.append((loc, ln.strip()))
            if re.search(r"\b(createIssue|updateIssue|addComment|transitionIssue|linkIssues|deleteIssue|addWatcher|createEpic)\b", ln):
                write_tools.append((loc, ln.strip()))
            if re.search(r"toolChoice|tool_calls|toolCalls|runAgent|maxIterations", ln):
                agent_loops.append((loc, ln.strip()))
            if re.search(r"\b(searchIssues|/rest/api/\d/search|jql)\b", ln, re.I):
                search_calls.append((loc, ln.strip()))
            if re.search(r"asUser\(|allowImpersonation", ln):
                as_user.append((loc, ln.strip()))

    # ---- 1 + 2: storage keyed on a caller-supplied id, with no visible ownership check
    # CASE-INSENSITIVE on purpose. The first version of this regex was case-sensitive and missed
    # `job.userAccountId !== context?.accountId` — idiomatic Forge camelCase — so it reported a
    # file that WAS correctly guarded. A check that cries wolf on healthy code gets switched off
    # and is worse than no check, so this one is deliberately generous: it is a filter for "worth
    # reading by hand", never a verdict.
    # Two kinds of control count as "this file thought about who is calling":
    #   OWNERSHIP — the row belongs to a user and the caller is compared to it.
    #   ADMIN GATE — the row is shared BY DESIGN (global settings, shared personas) and the control
    #     is who may write it. Per-user keying would break those features, so an admin gate is the
    #     correct answer, not a lesser one. The first version of this regex knew only about
    #     ownership and so kept flagging correctly-gated files (found 30 Jul on ChatWise).
    # Word-only terms like "ownership" are deliberately NOT here: a file was clearing this check
    # purely because a COMMENT contained the word, which is a false negative in the dangerous
    # direction. Every alternative below has to look like code.
    ownership = re.compile(
        r"isJiraAdmin\s*\(|isAdmin\s*\(|requireAdmin|adminOnly\s*\(|"
        r"mypermissions|ADMINISTER|hasPermission|"
        r"authorize\w*\s*\(|assertOwner|checkOwner|belongsTo\s*\(|"
        r"accountId\s*(!==|===|!=|==)|"
        r"(!==|===|!=|==)\s*[\w.?]*accountId",
        re.IGNORECASE,
    )
    # PER RESOLVER, not per file. The first version asked "does this FILE contain a check?", so a
    # single gate anywhere cleared every resolver beside it — enhancedPersona.routes.js has 11
    # resolvers and apiKey.routes.js has 13, and one gate marked all of them safe. A reviewer then
    # quite reasonably read a clean report as resolver-level closure, which it never was. The unit
    # of authorization is the resolver body, so that is the unit of the finding.
    unguarded = []
    for path in sources(app):
        try:
            text = open(path, encoding="utf-8", errors="replace").read()
        except OSError:
            continue
        for name, ln, body in resolver_bodies(text):
            if not re.search(r"\b(kvs|storage)\.(get|set|delete)\b", body):
                continue
            if ownership.search(body):
                continue
            writes = bool(re.search(r"\b(kvs|storage)\.(set|delete)\b", body))
            unguarded.append(
                f"{rel(app, path)}:{ln}  {name}()  [{'WRITE' if writes else 'read'}]"
            )

    if unguarded:
        w = sum(1 for u in unguarded if "[WRITE]" in u)
        findings.append((
            "HIGH",
            f"{len(unguarded)} resolver(s) touch storage with no authorization in the resolver "
            f"body ({w} mutate)",
            "Forge KVS under storage:app is APP-scoped. A resolver that keys off a caller-supplied "
            "id and never compares it to context.accountId lets any user address any row. Judged per "
            "resolver: a gate in a SIBLING resolver in the same file protects nothing. Note also that "
            "jira:adminPage gates the UI module, not resolver invocation — if the same registration "
            "function is also imported by a user-facing resolver, every function in it is reachable "
            "by any licensed user.",
            unguarded))

    # deterministic ids built from public values
    det = []
    for path in sources(app):
        try:
            text = open(path, encoding="utf-8", errors="replace").read()
        except OSError:
            continue
        for m in re.finditer(r"`([a-zA-Z0-9_-]*\$\{\s*(issueKey|projectKey|issueId|key)\s*\}[^`]*)`", text):
            ln = text[:m.start()].count("\n") + 1
            det.append(f"{rel(app, path)}:{ln}  `{m.group(1)}`")
    if det:
        findings.append((
            "HIGH", "Resource id derived from a PUBLIC value (zero entropy)",
            "An id built from an issue or project key is printed on every issue. Combined with "
            "app-scoped storage this is an IDOR over an identifier the attacker already has. Key "
            "per user instead, so there is no check to forget.",
            det))

    # ---- 3: untrusted text into the system prompt
    if prompt_builders:
        findings.append((
            "REVIEW", f"{len(prompt_builders)} system-prompt site(s) — check EVERY one",
            "Find every builder, not the first. On ChatWise there were three and the review found "
            "one; the two missed were the wizard prompt (which auto-created issues) and uploaded "
            "file text introduced as trusted. For each: does third-party-writable content reach it, "
            "and is that content fenced as data the model must not obey?",
            [f"{l}  {s[:100]}" for l, s in prompt_builders[:25]]))

    # ---- 4: write tools in an agent loop
    if write_tools and agent_loops:
        findings.append((
            "BLOCKER-CANDIDATE", "LLM tool loop can WRITE to Jira",
            "This is what turns prompt injection from a nuisance into a Blocker: injected text "
            "reaching an unconfirmed write executes under the victim's identity and is "
            "non-repudiable against them. Check for a default-deny gate, an explicit opt-in, a "
            "per-run budget, and whether EVERY write path goes through it — a path that bypasses "
            "the agent loop bypasses the guard too.",
            [f"loop:  {l}  {s[:80]}" for l, s in agent_loops[:6]] +
            [f"write: {l}  {s[:80]}" for l, s in write_tools[:12]]))

    # ---- 5: the zero-egress fallacy
    manifest = os.path.join(app, "manifest.yml")
    egress = False
    if os.path.exists(manifest):
        mtext = open(manifest, encoding="utf-8").read()
        egress = bool(re.search(r"external:\s*\n\s*fetch:", mtext))
    if not egress and search_calls and write_tools:
        findings.append((
            "HIGH", "No egress, but search+write means exfiltration is still possible",
            "Do NOT accept 'no external.fetch so it cannot exfiltrate'. Search-then-comment moves "
            "content the attacker cannot read onto an issue they can. The sink is Jira itself. "
            "Egress posture is not a mitigation for this.",
            [f"search: {l}" for l, _ in search_calls[:5]] + [f"write:  {l}" for l, _ in write_tools[:5]]))

    if as_user:
        findings.append((
            "CONTEXT", "Actions execute as the end user (asUser / impersonation)",
            "Not a defect by itself, but it sets the blast radius: anything the model is talked "
            "into doing lands under a real person's name in the audit log. State this explicitly "
            "in the report — it is the difference between an app bug and an attributed action.",
            [f"{l}  {s[:80]}" for l, s in as_user[:8]]))

    return findings

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("app")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    if not os.path.exists(os.path.join(a.app, "manifest.yml")):
        sys.exit(f"no manifest.yml in {a.app} — is this a Forge app?")
    f = scan(a.app)
    if a.json:
        print(json.dumps([{"severity": s, "title": t, "why": w, "evidence": e} for s, t, w, e in f], indent=2))
        return
    print("=" * 78)
    print("Forge authorization + LLM-agent scan")
    print("These are QUESTIONS with evidence attached, not verdicts. A missing check has no")
    print("signature — every item below has to be confirmed by reading the code.")
    print("=" * 78)
    if not f:
        print("\nNothing matched. That is NOT a clean bill of health: this scanner finds shapes,")
        print("and the defect class it targets is an ABSENCE. Read the resolvers by hand.")
        return
    for sev, title, why, ev in f:
        print(f"\n[{sev}] {title}")
        print(f"  {why}")
        for e in ev[:20]:
            print(f"    {e}")
        if len(ev) > 20:
            print(f"    ... and {len(ev)-20} more")
    print("\n" + "=" * 78)
    print("Reminder: on the review this was built from, the WORST defect in the app was not in")
    print("the reviewer's list, and one of his Mediums was really a Blocker. Grade independently.")

if __name__ == "__main__":
    main()
