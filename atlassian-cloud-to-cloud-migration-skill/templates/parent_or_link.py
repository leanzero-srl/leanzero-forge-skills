#!/usr/bin/env python3
"""
parent_or_link.py — restore source parent relations on migrated items: set the parent, and where the target hierarchy
refuses it, keep the relation visible as an issue link of an EXISTING parent/child link type.

Why: two source hierarchy levels can map to the same target level (e.g. source Theme and Epic both -> target
Epic, with nothing above Epic). The late-parent PUT then fails
    400 {"errors": {"parent": "Given parent work item does not belong to appropriate hierarchy."}}
and, unless something catches it, the relation is lost silently. This pass:
  1. for every migrated item whose SOURCE parent is not its TARGET parent (sub-tasks excluded: bulk-move them, docs/04)
  2. PUT fields.parent (notifyUsers=false) - covers transient late-parent failures
  3. ONLY on a 400 whose error KEY is "parent" (a hierarchy refusal): create a link of --link-type (default
     "Parent-Child") that reads "<PARENT> is parent of <CHILD>". Any other 400 (a required field, a validator, a
     screen) is recorded and NOT turned into a link - it is a different problem.
     The link type must exist on the target (it is NOT a Jira default type - many sites have one, check). Its wording
     decides which end holds the "parent" phrase: the side whose wording contains "parent of" (outward or inward) is
     detected, or set with --parent-holds outward|inward. The POST direction comes from the PROBE recorded by
     link_copy.py for THIS type (or --direction-from <probed type>, deliberately):
         python3 link_copy.py probe ITEM_A ITEM_B --type Parent-Child
  4. idempotent: an existing link of that type between the two (in the right direction) is kept; nothing else touched
No config is created. Dry run by default. Every write goes through the silent window (silent_window.py).

Usage: parent_or_link.py --maps 'state/maplog-*.log' [--link-type Parent-Child] [--parent-holds outward|inward]
                         [--direction-from TYPE] [--apply]
Env: SRC_*/TGT_* (atl_http.py), STATE_DIR (default ./state), WINDOW_STATE (silent_window.py)
Python 3.8+, stdlib only; needs atl_http.py, link_copy.py and silent_window.py.
"""
import collections
import contextlib
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from atl_http import ApiError, site_from_env  # noqa: E402
from link_copy import PROBE, STATE, find_id, link_types, load_maps, post_link, probe_for, triples  # noqa: E402
from silent_window import hold, require_silent  # noqa: E402


def fields_for(site, keys, fields):
    out, keys = {}, list(keys)
    for i in range(0, len(keys), 100):
        chunk = keys[i:i + 100]
        d = site.post("/rest/api/3/issue/bulkfetch", {"issueIdsOrKeys": chunk, "fields": fields})
        if d.get("issueErrors"):
            sys.exit(f"bulkfetch issueErrors on {site.base}: {d['issueErrors'][:5]}")
        for iss in d.get("issues", []):
            out[iss["key"]] = iss["fields"]
        missing = [k for k in chunk if k not in out]
        if missing:
            sys.exit(f"bulkfetch on {site.base} did not return {len(missing)} keys (e.g. {missing[:5]})")
    return out


def parent_side(lt, forced=None):
    """'outward' if the type's OUTWARD wording is the parent's ("is parent of"), 'inward' if the inward one is."""
    if forced:
        return forced
    out_p, in_p = "parent of" in lt["outward"].lower(), "parent of" in lt["inward"].lower()
    if out_p != in_p:
        return "outward" if out_p else "inward"
    sys.exit(f"cannot tell which end of '{lt['name']}' ({lt['outward']} / {lt['inward']}) is the parent - "
             f"pass --parent-holds outward|inward")


def is_parent_refusal(body):
    try:
        return "parent" in (json.loads(body).get("errors") or {})
    except ValueError:
        return False


def main():
    a = sys.argv[1:]

    def opt(n, d=None):
        return a[a.index(n) + 1] if n in a else d
    apply_ = "--apply" in a
    ltype = opt("--link-type", "Parent-Child")
    src, tgt = site_from_env("SRC"), site_from_env("TGT")
    mp = load_maps(opt("--maps", f"{STATE}/maplog-*.log"))
    lt = link_types(tgt).get(ltype)
    if not lt:
        sys.exit(f"link type '{ltype}' does not exist on the target - no config is created here; ask the owner")
    side = parent_side(lt, opt("--parent-holds"))
    prb = json.load(open(PROBE)) if os.path.exists(PROBE) else {}
    probe = probe_for(prb, ltype, opt("--direction-from"))
    if apply_ and not probe:
        sys.exit(f"REFUSED: prove the direction first: link_copy.py probe <A> <B> --type {ltype} "
                 f"(or --direction-from <probed type>)")

    def want_triple(parent, child):          # canonical triple = (holder of the OUTWARD wording, type, other)
        return (parent, ltype, child) if side == "outward" else (child, ltype, parent)

    s = fields_for(src, mp.keys(), ["parent", "issuetype"])
    t = fields_for(tgt, mp.values(), ["parent", "issuelinks"])
    n = collections.Counter()
    rec = open(os.path.join(STATE, "parent-or-link-changes.jsonl"), "a", buffering=1) if apply_ else None
    with (hold("parent_or_link") if apply_ else contextlib.nullcontext()):
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
            holder, _, other = want_triple(parent, child)
            if (holder, ltype, other) in triples(child, tf.get("issuelinks")):
                n["already linked"] += 1
                continue
            if not apply_:
                n["would fix"] += 1
                print(f"would fix {child}: source parent {p} -> target parent {parent}")
                continue
            try:
                require_silent(tgt, child.rsplit("-", 1)[0])
                tgt.put(f"/rest/api/3/issue/{child}?notifyUsers=false", {"fields": {"parent": {"key": parent}}})
                n["parent set"] += 1
                rec.write(json.dumps({"child": child, "parent": parent, "action": "parent-set"}) + "\n")
                continue
            except ApiError as e:
                if e.status != 400 or not is_parent_refusal(e.body):
                    n[f"error {e.status} (not a hierarchy refusal - no link)"] += 1
                    print(child, e)
                    rec.write(json.dumps({"child": child, "parent": parent, "action": "error",
                                          "status": e.status, "body": e.body[:300]}) + "\n")
                    continue
                reason = e.body[:160]
            post_link(tgt, ltype, holder, other, probe)
            lid = find_id(tgt, holder, ltype, other)
            n["linked" if lid else "link NOT read back"] += 1
            rec.write(json.dumps({"child": child, "parent": parent, "action": "link", "type": ltype, "id": lid,
                                  "triple": [holder, ltype, other], "parent_refused": reason}) + "\n")
    print(("APPLIED" if apply_ else "DRY RUN"), dict(n))


if __name__ == "__main__":
    main()
