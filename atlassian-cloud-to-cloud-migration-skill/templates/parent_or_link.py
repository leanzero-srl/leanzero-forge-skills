#!/usr/bin/env python3
"""
parent_or_link.py — restore source parent relations on migrated items: set the parent, and where the target hierarchy
refuses it, keep the relation visible as an issue link of an EXISTING parent/child link type.

Why: two source hierarchy levels can map to the same target level (e.g. source Initiative and Epic both -> target
Feature, with nothing above Feature). The late-parent PUT then fails
    400 "Given parent work item does not belong to appropriate hierarchy"
and, unless something catches it, the relation is lost silently. This pass:
  1. for every migrated item whose SOURCE parent is not its TARGET parent (sub-tasks excluded: bulk-move them, docs/04)
  2. PUT fields.parent (notifyUsers=false) - covers transient late-parent failures
  3. on 400: create a link of --link-type (default "Parent-Child") so that it reads "<PARENT> <outward> <CHILD>"
     (e.g. "PROJ-10 is parent of PROJ-12"), direction taken from the PROBE recorded by link_copy.py:
         python3 link_copy.py probe PARENTKEY CHILDKEY --type Parent-Child
  4. idempotent: an existing link of that type between the two is kept; nothing else is touched
The link type must already exist on the target (no config is created). Dry run by default.

Usage: parent_or_link.py --maps 'state/maplog-*.log' [--link-type Parent-Child] [--apply]
Env: SRC_*/TGT_* (atl_http.py), STATE_DIR (default ./state), READ_ONLY_SITES=<SRC_BASE>
Python 3.8+, stdlib only; needs atl_http.py and link_copy.py.
"""
import collections
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from atl_http import ApiError, site_from_env  # noqa: E402
from link_copy import PROBE, STATE, find_id, load_maps, post_link, triples  # noqa: E402


def fields_for(site, keys, fields):
    out, keys = {}, list(keys)
    for i in range(0, len(keys), 100):
        d = site.post("/rest/api/3/issue/bulkfetch", {"issueIdsOrKeys": keys[i:i + 100], "fields": fields})
        for iss in d.get("issues", []):
            out[iss["key"]] = iss["fields"]
    return out


def main():
    a = sys.argv[1:]

    def opt(n, d=None):
        return a[a.index(n) + 1] if n in a else d
    apply_ = "--apply" in a
    ltype = opt("--link-type", "Parent-Child")
    src, tgt = site_from_env("SRC"), site_from_env("TGT")
    mp = load_maps(opt("--maps", f"{STATE}/maplog-*.log"))
    if ltype not in {x["name"] for x in tgt.get("/rest/api/3/issueLinkType")["issueLinkTypes"]}:
        sys.exit(f"link type '{ltype}' does not exist on the target - no config is created here; ask the owner")
    prb = json.load(open(PROBE)) if os.path.exists(PROBE) else {}
    probe = prb.get(ltype) or prb.get("_default")
    if apply_ and not probe:
        sys.exit(f"REFUSED: prove the direction first: link_copy.py probe <PARENT> <CHILD> --type {ltype}")

    s = fields_for(src, mp.keys(), ["parent", "issuetype"])
    t = fields_for(tgt, mp.values(), ["parent", "issuelinks"])
    n = collections.Counter()
    rec = open(os.path.join(STATE, "parent-or-link-changes.jsonl"), "a") if apply_ else None
    for sk, sf in sorted(s.items()):
        p = (sf.get("parent") or {}).get("key")
        if not p:
            continue
        child, parent = mp.get(sk), mp.get(p)
        if not child or not parent:
            n["parent not migrated"] += 1
            continue
        tf = t.get(child) or {}
        if (tf.get("parent") or {}).get("key") == parent:
            n["ok"] += 1
            continue
        if sf["issuetype"].get("subtask"):
            n["sub-task without its parent (use the bulk move, docs/04)"] += 1
            continue
        if (parent, ltype, child) in triples(child, tf.get("issuelinks")):
            n["already linked"] += 1
            continue
        if not apply_:
            n["would fix"] += 1
            print(f"would fix {child}: source parent {p} -> target parent {parent}")
            continue
        try:
            tgt.put(f"/rest/api/3/issue/{child}?notifyUsers=false", {"fields": {"parent": {"key": parent}}})
            n["parent set"] += 1
            rec.write(json.dumps({"child": child, "parent": parent, "action": "parent-set"}) + "\n")
            continue
        except ApiError as e:
            if e.status != 400:
                n[f"error {e.status}"] += 1
                print(child, e)
                continue
            reason = e.body[:160]
        post_link(tgt, ltype, parent, child, probe)
        lid = find_id(tgt, parent, ltype, child)
        n["linked" if lid else "link NOT read back"] += 1
        rec.write(json.dumps({"child": child, "parent": parent, "action": "link", "type": ltype, "id": lid,
                              "parent_refused": reason}) + "\n")
    print(("APPLIED" if apply_ else "DRY RUN"), dict(n))


if __name__ == "__main__":
    main()
