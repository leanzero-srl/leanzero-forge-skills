#!/usr/bin/env python3
"""
check_upload_paths.py — fail the build while any script uploads attachment bytes without calling the privacy gate.

    check_upload_paths.py <scripts-dir> [--gate-regex 'att_gate\\.(gate|ok)\\('] [--exempt file=reason ...] [--json]

Finds attachment WRITE calls (reads, downloads, listings and deletes are ignored):
  Confluence  PUT/POST .../child/attachment            create / create-or-update
              POST .../child/attachment/{id}/data      new version
  Jira        POST /rest/api/3/issue/{key}/attachments
  curl -F / multipart uploads to either endpoint
and exits 1 when a file has one but no call of the gate outside comments and docstrings. The check is PER FILE,
not per call: keep one upload helper per script and gate it.

Field note: the rule "do not reuse these upload scripts until the screenshot check is wired in" lived in a status note;
two later uploads went out through exactly such scripts (a restore that re-published a private key, a blurred document
checked with the lens that had missed the name). A rule in prose is not a gate. Run this in preflight and in your test
suite as a RATCHET: record today's offenders, fail on any NEW one, delete a line when a script is fixed.

Exempt only uploads that write back bytes ALREADY on the same target object (e.g. re-uploading an image's own current
bytes to rebuild a Confluence draft), with the reason, here on the command line or in your test - never in the script.
"""
import json
import os
import re
import sys

WRITE = [
    (re.compile(r"child/attachment.*?/data"), "POST .../child/attachment/{id}/data"),
    (re.compile(r"child/attachment\b(?!/download)"), "PUT/POST .../child/attachment"),
    (re.compile(r"/issue/.*?/attachments\b"), "POST /rest/api/3/issue/{key}/attachments"),
]
METHOD = re.compile(r"""["'](PUT|POST)["']|method\s*=\s*["'](PUT|POST)|-X\s*(PUT|POST)|["']-F["']|\s-F\s|multipart/form-data|\.upload\(|\.(?:post|put)\s*\(|\bfiles\s*=|FormData|--form\b|\s-F\S""")
READ = re.compile(r"/download|\?limit=|\?filename=|status=trashed|expand=|[\"']DELETE[\"']")


def _nocomment(l):
    """code part of a line: a gate call in a trailing '# TODO att_gate.ok(...)' comment is not a gate"""
    return re.split(r"\s#(?![^\"']*[\"'][^\"']*$)|\s//", l, maxsplit=1)[0]


def scan(path, gate_rx):
    src = open(path, encoding="utf-8", errors="ignore").read()
    lines = src.splitlines()
    doc = set()
    for m in re.finditer(r'"""[\s\S]*?"""|\'\'\'[\s\S]*?\'\'\'', src):
        a = src[:m.start()].count("\n") + 1
        doc |= set(range(a, a + m.group(0).count("\n") + 1))
    code = [(i, l) for i, l in enumerate(lines, 1) if not l.lstrip().startswith(("#", "//")) and i not in doc]
    ups = []
    for i, l in code:
        for rx, what in WRITE:
            if not rx.search(l) or READ.search(l):
                continue
            win = " ".join(x for j, x in code if i - 3 <= j <= i + 3)
            if METHOD.search(l) or METHOD.search(win):
                ups.append({"line": i, "call": what})
                break
    gated = [i for i, l in code if gate_rx.search(_nocomment(l)) and not l.lstrip().startswith("def ")]
    return ups, gated


def main(argv):
    if not argv or argv[0].startswith("-"):
        raise SystemExit(__doc__)
    root = argv[0]
    gate_rx = re.compile(argv[argv.index("--gate-regex") + 1] if "--gate-regex" in argv else r"att_gate\.(gate|ok)\(")
    exempt = dict(a.split("=", 1) for a in argv[argv.index("--exempt") + 1:] if "=" in a) if "--exempt" in argv else {}
    rows = []
    for dp, dn, fns in os.walk(root):
        dn[:] = [d for d in dn if d not in ("__pycache__", "tests", "node_modules", ".git")]
        for f in sorted(fns):
            if not f.endswith((".py", ".sh", ".mjs", ".js")) or f == os.path.basename(__file__):
                continue
            ups, gated = scan(os.path.join(dp, f), gate_rx)
            if ups:
                st = "EXEMPT" if f in exempt else ("GATED" if gated else "OFFENDER")
                rows.append({"file": os.path.relpath(os.path.join(dp, f), root), "status": st, "uploads": ups, "why": exempt.get(f, "")})
    off = [r["file"] for r in rows if r["status"] == "OFFENDER"]
    if "--json" in argv:
        print(json.dumps({"rows": rows, "offenders": off}, indent=1))
    else:
        for r in rows:
            print(f"{r['status']:9} {r['file']}  lines {[u['line'] for u in r['uploads']][:5]}" + (f"  - {r['why']}" if r["why"] else ""))
        print(f"\n{len(off)} OFFENDER(S)" if off else "\nOK: every upload path calls the gate")
    return 1 if off else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
