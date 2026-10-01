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
   "SECRET"|"download-failed"|..., "scanned_at": "<ISO time, optional - else the scan file's mtime>", ...}
Key = (kind, space, source item, file name). Never key by (space, file): same-name files collide (~90 did).
A record of a NEW-key item without "source_item" would form a second key that nobody asks about (its hold invisible):
pass --item-map 'state/maplog-*.log' (lines "SRC-KEY TGT-KEY") so such records are keyed by their source item.

Rules
  1. HELD WINS: any non-clean record in any scan file holds the file, whatever other records say.
  2. EYE CLEAR: an entry in --eye-clear {"key": [kind, space, item, file], "clears": "<scan file name>", "why": "..."}
     overrides ONLY a "HIT" record of the scan file with EXACTLY that name (with or without ".json") - e.g. a band-pass
     false positive. It never clears SECRET / NOT CHECKABLE / download-failed, and records of other scans still hold.
  3. RELEASE: a record in a --release file with "released": true and "uploaded_sha256" overrides the held verdict for
     EXACTLY its key — it means "the TRANSFORMED bytes now on the target are clean" (scrubbed diagram, rebuilt archive),
     NOT that the source original is clean. Copy/release code must never re-upload the source original of such a key.
     A release covers only holds from scans that ran BEFORE it ("released_at" in the record, else the release file's
     mtime, vs each holding record's "scanned_at", else its scan file's mtime). A scan that runs AFTER the release and
     holds the file wins again (held wins) - release it again after looking. Mtimes reset when files are copied:
     write the timestamps into the records.
     A release record for a key with no held record is ignored (never adds a pair).

Usage
  attachment_verdicts.py merge 'package/attachments-*.json' [--release 'package/*-RELEASE*.json'] [--eye-clear eye.json]
        [--item-map 'state/maplog-*.log'] [--out verdicts.json]            -> counts + the merged verdicts
  attachment_verdicts.py disagree 'package/attachments-*.json'   -> keys whose scans disagree (clean in one, held in another)
Library:  from attachment_verdicts import verdicts;  v = verdicts(scan_glob, release_glob, eye_file, item_map_glob)
          is_clean = v.get(key, {}).get("status") == "clean"
Python 3.8+, stdlib only.
"""
import datetime
import glob
import json
import os
import sys


def _kind(path, rec):
    if rec.get("kind"):
        return rec["kind"]
    b = os.path.basename(path)
    return "jira" if "-jira-" in b else "conf" if "-conf-" in b else "?"


def _key(path, rec, rev=None):
    item = rec.get("source_item") or (rev or {}).get(rec["item"]) or rec["item"]
    return (_kind(path, rec), rec["space"], item, rec["file"])


def _when(rec, field, path):
    """Epoch seconds of a record: its ISO field if present, else the file's mtime."""
    v = rec.get(field)
    if v:
        v = str(v).strip()
        v = v[:-1] + "+00:00" if v.endswith("Z") else v
        try:
            t = datetime.datetime.fromisoformat(v)
            return (t if t.tzinfo else t.astimezone()).timestamp()
        except ValueError:
            sys.exit(f"{path}: unparseable {field} {rec.get(field)!r}")
    return os.path.getmtime(path)


def _tag(name):
    b = os.path.basename(name)
    return b[:-5] if b.endswith(".json") else b


def _reverse_map(item_map_glob):
    """target key -> source key from map logs ("SRC TGT" per line)."""
    rev = {}
    for f in sorted(glob.glob(item_map_glob)) if item_map_glob else []:
        for line in open(f):
            p = line.split()
            if len(p) == 2:
                rev[p[1]] = p[0]
    return rev


def _scan_files(scan_glob, release_glob):
    rel = set(glob.glob(release_glob)) if release_glob else set()
    return [f for f in sorted(glob.glob(scan_glob)) if f not in rel]


def verdicts(scan_glob, release_glob=None, eye_file=None, item_map_glob=None):
    """{key: {"status", "sources": [(file, status)], "why"}}"""
    rev = _reverse_map(item_map_glob)
    eye = {}
    if eye_file and os.path.exists(eye_file):
        for e in json.load(open(eye_file)):
            eye.setdefault(tuple(e["key"]), set()).add(_tag(e["clears"]))
    out, holds = {}, {}                                         # holds[key] = [(time, scan tag, status)]
    for f in _scan_files(scan_glob, release_glob):
        tag = os.path.basename(f)
        for r in json.load(open(f)):
            k = _key(f, r, rev)
            st = raw = r.get("status", "?")
            cleared = raw == "HIT" and _tag(tag) in eye.get(k, ())   # exact scan, and only a HIT
            if cleared:
                st = "clean"                                   # eye-cleared false positive of THIS scan only
            v = out.setdefault(k, {"status": "clean", "sources": [], "why": ""})
            v["sources"].append((tag, raw + (" [eye-cleared]" if cleared else "")))
            if st != "clean":                                  # HELD WINS; SECRET is never masked by a milder class
                if v["status"] != "SECRET":
                    v["status"], v["why"] = st, f"held by {tag}"
                holds.setdefault(k, []).append((_when(r, "scanned_at", f), tag, st))
    if release_glob:
        for f in sorted(glob.glob(release_glob)):
            for r in json.load(open(f)):
                k = _key(f, r, rev)
                if not (r.get("released") is True and r.get("uploaded_sha256") and k in out
                        and out[k]["status"] != "clean"):
                    continue
                at = _when(r, "released_at", f)
                later = [(tag, st) for t, tag, st in holds.get(k, []) if t >= at]
                if later:                                      # a scan AFTER the release held it again: held wins
                    out[k]["why"] = f"held by {later[0][0]} AFTER the release in {os.path.basename(f)}"
                    out[k]["sources"].append((os.path.basename(f), "released (superseded by a later hold)"))
                    continue
                out[k] = {"status": "clean", "released": True, "uploaded_sha256": r["uploaded_sha256"],
                          "how": r.get("how", ""), "sources": out[k]["sources"] + [(os.path.basename(f), "released")],
                          "why": "transformed bytes released"}
    return out


def disagreements(scan_glob, item_map_glob=None):
    rev = _reverse_map(item_map_glob)
    seen = {}
    for f in sorted(glob.glob(scan_glob)):
        for r in json.load(open(f)):
            seen.setdefault(_key(f, r, rev), set()).add((os.path.basename(f), r.get("status")))
    return {k: sorted(v) for k, v in seen.items() if len({s for _, s in v}) > 1}


def main():
    a = sys.argv[1:]
    if len(a) < 2:
        sys.exit(__doc__)

    def opt(n, d=None):
        return a[a.index(n) + 1] if n in a else d
    if a[0] == "merge":
        v = verdicts(a[1], opt("--release"), opt("--eye-clear"), opt("--item-map"))
        counts = {}
        for x in v.values():
            s = x["status"] + (" (released)" if x.get("released") else "")
            counts[s] = counts.get(s, 0) + 1
        print(json.dumps(counts, indent=1))
        if opt("--out"):
            json.dump([{"key": list(k), **x} for k, x in v.items()], open(opt("--out"), "w"), indent=1)
    elif a[0] == "disagree":
        d = disagreements(a[1], opt("--item-map"))
        for k, v in d.items():
            print(k, v)
        print(f"{len(d)} keys with disagreeing scans - held wins; find out WHY they disagree", file=sys.stderr)
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
