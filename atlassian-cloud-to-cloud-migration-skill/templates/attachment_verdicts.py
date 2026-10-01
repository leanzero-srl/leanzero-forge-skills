#!/usr/bin/env python3
"""
attachment_verdicts.py — ONE verdict per attachment across every privacy scan you ran. HELD WINS.

Over a migration you accumulate several scan files per project/space: the first content scan, a light-on-dark OCR
pass, a status-bar band pass, a name-shape pass, eye reviews, scans of late items. They disagree. Every consumer of
"is this file clean?" (copy, release, purge, compare, report) must ask THIS module, never read one scan file directly.
Field note: a re-pointing step that read only the first scan would have uploaded files a later pass had held.

Record format (each scan file is a JSON list):
  {"kind": "jira"|"conf" (or derived from the file name), "space": "PROJ|SPACE", "item": "<target or source key/page>",
   "source_item": "<source key, when 'item' is a NEW key>", "file": "<name>", "status": "clean"|"HIT"|"NOT CHECKABLE"|
   "SECRET"|"download-failed"|..., ...}
Key = (kind, space, source item, file name). Never key by (space, file): same-name files collide (~90 did).

Rules
  1. HELD WINS: any non-clean record in any scan file holds the file, whatever other records say.
  2. EYE CLEAR: an entry in --eye-clear {"key": [kind, space, item, file], "clears": "<scan tag>", "why": "..."}
     overrides ONLY the records of scan files whose name contains that tag (e.g. a band-pass false positive). Records of
     other scans still hold.
  3. RELEASE: a record in a --release file with "released": true and "uploaded_sha256" overrides the held verdict for
     EXACTLY its key — it means "the TRANSFORMED bytes now on the target are clean" (scrubbed diagram, rebuilt archive),
     NOT that the source original is clean. Copy/release code must never re-upload the source original of such a key.
     A release record for a key with no held record is ignored (never adds a pair).

Usage
  attachment_verdicts.py merge 'package/attachments-*.json' [--release 'package/*-RELEASE*.json'] [--eye-clear eye.json]
        [--out verdicts.json]            -> counts + the merged verdicts
  attachment_verdicts.py disagree 'package/attachments-*.json'   -> keys whose scans disagree (clean in one, held in another)
Library:  from attachment_verdicts import verdicts;  v = verdicts(scan_glob, release_glob, eye_file)
          is_clean = v.get(key, {}).get("status") == "clean"
Python 3.8+, stdlib only.
"""
import glob
import json
import os
import sys


def _kind(path, rec):
    if rec.get("kind"):
        return rec["kind"]
    b = os.path.basename(path)
    return "jira" if "-jira-" in b else "conf" if "-conf-" in b else "?"


def _key(path, rec):
    return (_kind(path, rec), rec["space"], rec.get("source_item") or rec["item"], rec["file"])


def _scan_files(scan_glob, release_glob):
    rel = set(glob.glob(release_glob)) if release_glob else set()
    return [f for f in sorted(glob.glob(scan_glob)) if f not in rel]


def verdicts(scan_glob, release_glob=None, eye_file=None):
    """{key: {"status", "sources": [(file, status)], "why"}}"""
    eye = {}
    if eye_file and os.path.exists(eye_file):
        for e in json.load(open(eye_file)):
            eye.setdefault(tuple(e["key"]), set()).add(e["clears"])
    out = {}
    for f in _scan_files(scan_glob, release_glob):
        tag = os.path.basename(f)
        for r in json.load(open(f)):
            k = _key(f, r)
            st = raw = r.get("status", "?")
            cleared = st != "clean" and any(t in tag for t in eye.get(k, ()))
            if cleared:
                st = "clean"                                   # eye-cleared false positive of THIS scan only
            v = out.setdefault(k, {"status": "clean", "sources": [], "why": ""})
            v["sources"].append((tag, raw + (" [eye-cleared]" if cleared else "")))
            if st != "clean":
                v["status"], v["why"] = st, f"held by {tag}"   # HELD WINS
    if release_glob:
        for f in sorted(glob.glob(release_glob)):
            for r in json.load(open(f)):
                k = _key(f, r)
                if r.get("released") is True and r.get("uploaded_sha256") and k in out and out[k]["status"] != "clean":
                    out[k] = {"status": "clean", "released": True, "uploaded_sha256": r["uploaded_sha256"],
                              "how": r.get("how", ""), "sources": out[k]["sources"] + [(os.path.basename(f), "released")],
                              "why": "transformed bytes released"}
    return out


def disagreements(scan_glob):
    seen = {}
    for f in sorted(glob.glob(scan_glob)):
        for r in json.load(open(f)):
            seen.setdefault(_key(f, r), set()).add((os.path.basename(f), r.get("status")))
    return {k: sorted(v) for k, v in seen.items() if len({s for _, s in v}) > 1}


def main():
    a = sys.argv[1:]
    if len(a) < 2:
        sys.exit(__doc__)

    def opt(n, d=None):
        return a[a.index(n) + 1] if n in a else d
    if a[0] == "merge":
        v = verdicts(a[1], opt("--release"), opt("--eye-clear"))
        counts = {}
        for x in v.values():
            s = x["status"] + (" (released)" if x.get("released") else "")
            counts[s] = counts.get(s, 0) + 1
        print(json.dumps(counts, indent=1))
        if opt("--out"):
            json.dump([{"key": list(k), **x} for k, x in v.items()], open(opt("--out"), "w"), indent=1)
    elif a[0] == "disagree":
        d = disagreements(a[1])
        for k, v in d.items():
            print(k, v)
        print(f"{len(d)} keys with disagreeing scans - held wins; find out WHY they disagree", file=sys.stderr)
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
