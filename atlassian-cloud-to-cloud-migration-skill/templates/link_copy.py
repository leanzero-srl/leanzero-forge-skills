#!/usr/bin/env python3
"""
link_copy.py — copy / repair issue links between migrated items with a PROVEN direction.

Field note: a copy created links with inwardIssue/outwardIssue swapped; every "A blocks B" became "B blocks A".
Per-item link COUNTS were right, so compare-by-count passed. Links are compared here as canonical TRIPLES:
    (holder of the OUTWARD wording, link type name, other end)      e.g. ("A", "Blocks", "B") = "A blocks B"
In GET /issue/X?fields=issuelinks an entry with "outwardIssue": Y means "X <outward> Y"; "inwardIssue": Y means
"Y <outward> X". How POST /issueLink maps its two parameters onto that is PROVEN, not assumed: `probe` creates one
link on two scratch items, reads both ends back, records the result, and deletes the probe link. `apply` refuses to
run without a recorded probe.

Modes
  probe A B [--type Blocks]       prove the POST direction on two target items you own (link is deleted afterwards)
  plan  --maps 'state/maplog-*.log' [--fallback Relates]
        source triples (both ends migrated) vs target triples -> ok / inverted / missing / missing-type / extra
  apply --maps ... [--fallback Relates] [--limit N]
        create missing (and inverted: create the correct twin, read back, THEN delete the wrong one); a source type the
        target lacks is created as --fallback (a decision - log it). Every change recorded in links-changes.jsonl.
Env: SRC_*/TGT_* (see atl_http.py), STATE_DIR (default ./state), READ_ONLY_SITES=<SRC_BASE>
Only links whose BOTH ends are in the maps are ever touched. Never deletes a link without its correct twin present.
Python 3.8+, stdlib only; needs atl_http.py.
"""
import glob
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from atl_http import ApiError, site_from_env  # noqa: E402

STATE = os.environ.get("STATE_DIR", "./state")
PROBE = os.path.join(STATE, "link-direction.json")
CHANGES = os.path.join(STATE, "links-changes.jsonl")


def triples(key, links):
    """{(holder_of_outward, type, other): link_id} for the links of one issue."""
    out = {}
    for lk in links or []:
        t = lk["type"]["name"]
        if "outwardIssue" in lk:
            out[(key, t, lk["outwardIssue"]["key"])] = lk["id"]
        elif "inwardIssue" in lk:
            out[(lk["inwardIssue"]["key"], t, key)] = lk["id"]
    return out


def bulk_links(site, keys):
    """issuelinks for many keys via POST /rest/api/3/issue/bulkfetch (100 per call; read-only)."""
    res = {}
    keys = list(keys)
    for i in range(0, len(keys), 100):
        d = site.post("/rest/api/3/issue/bulkfetch", {"issueIdsOrKeys": keys[i:i + 100], "fields": ["issuelinks"]})
        for iss in d.get("issues", []):
            res[iss["key"]] = iss["fields"].get("issuelinks") or []
    return res


def load_maps(pattern):
    m = {}
    for f in sorted(glob.glob(pattern)):
        for line in open(f):
            p = line.split()
            if len(p) == 2:
                m[p[0]] = p[1]
    if not m:
        sys.exit(f"no map lines found in {pattern}")
    return m


def post_link(tgt, typ, holder, other, probe):
    """Create the link that renders '<holder> <outward> <other>' according to the PROVEN probe result."""
    if probe["inwardIssue_param_holds_outward"]:
        body = {"type": {"name": typ}, "inwardIssue": {"key": holder}, "outwardIssue": {"key": other}}
    else:
        body = {"type": {"name": typ}, "inwardIssue": {"key": other}, "outwardIssue": {"key": holder}}
    tgt.post("/rest/api/3/issueLink", body)


def find_id(tgt, holder, typ, other, tries=6):
    for _ in range(tries):
        tri = triples(holder, tgt.get(f"/rest/api/3/issue/{holder}?fields=issuelinks")["fields"].get("issuelinks"))
        if (holder, typ, other) in tri:
            return tri[(holder, typ, other)]
        time.sleep(2)
    return None


def probe(tgt, a, b, typ):
    os.makedirs(STATE, exist_ok=True)
    tgt.post("/rest/api/3/issueLink", {"type": {"name": typ}, "inwardIssue": {"key": a}, "outwardIssue": {"key": b}})
    time.sleep(2)
    ta = triples(a, tgt.get(f"/rest/api/3/issue/{a}?fields=issuelinks")["fields"].get("issuelinks"))
    tb = triples(b, tgt.get(f"/rest/api/3/issue/{b}?fields=issuelinks")["fields"].get("issuelinks"))
    lt = next(x for x in tgt.get("/rest/api/3/issueLinkType")["issueLinkTypes"] if x["name"] == typ)
    if (a, typ, b) in ta and (a, typ, b) in tb:
        holds, lid = True, ta[(a, typ, b)]
    elif (b, typ, a) in ta and (b, typ, a) in tb:
        holds, lid = False, ta[(b, typ, a)]
    else:
        sys.exit(f"probe inconclusive: {a}={ta} {b}={tb}")
    reading = f"{a} {lt['outward']} {b}" if holds else f"{b} {lt['outward']} {a}"
    rec = json.load(open(PROBE)) if os.path.exists(PROBE) else {}
    rec[typ] = {"inwardIssue_param_holds_outward": holds, "renders": reading,
                "probe": f"POST inwardIssue={a} outwardIssue={b}", "at": time.strftime("%Y-%m-%d %H:%M:%S")}
    rec["_default"] = rec[typ]
    json.dump(rec, open(PROBE, "w"), indent=1)
    tgt.delete(f"/rest/api/3/issueLink/{lid}")
    print(f"PROBE {typ}: POST inwardIssue={a}, outwardIssue={b} renders '{reading}' "
          f"-> inwardIssue param holds the outward wording: {holds}. Probe link {lid} deleted.")


def plan(src, tgt, mp, fallback):
    tgt_types = {x["name"] for x in tgt.get("/rest/api/3/issueLinkType")["issueLinkTypes"]}
    s_links = bulk_links(src, mp.keys())
    want = {}
    for k, links in s_links.items():
        for (h, t, o) in triples(k, links):
            if h in mp and o in mp:
                want[(mp[h], t, mp[o])] = (h, t, o)
    t_links = bulk_links(tgt, set(mp.values()))
    have = {}
    for k, links in t_links.items():
        have.update(triples(k, links))
    res = {"ok": [], "inverted": [], "missing": [], "missing-type": [], "extra": []}
    for (h, t, o) in want:
        if t not in tgt_types:
            fb_have = (h, fallback, o) in have or (o, fallback, h) in have
            res["missing-type"].append({"triple": [h, t, o], "fallback": fallback, "fallback_present": fb_have})
        elif (h, t, o) in have:
            res["ok"].append([h, t, o])
        elif (o, t, h) in have:
            res["inverted"].append({"triple": [h, t, o], "wrong_id": have[(o, t, h)]})
        else:
            res["missing"].append([h, t, o])
    wanted = set(want)
    for tri, lid in have.items():
        if tri not in wanted and (tri[2], tri[1], tri[0]) not in wanted and tri[1] != fallback:
            res["extra"].append({"triple": list(tri), "id": lid})
    print({k: len(v) for k, v in res.items()})
    return res


def apply(src, tgt, mp, fallback, limit):
    if not os.path.exists(PROBE):
        sys.exit("REFUSED: run `probe` first - the POST direction must be proven on this site")
    prb = json.load(open(PROBE))
    res = plan(src, tgt, mp, fallback)
    log = open(CHANGES, "a")
    n = 0
    for row in res["missing"]:
        if n >= limit:
            break
        h, t, o = row
        post_link(tgt, t, h, o, prb.get(t, prb["_default"]))
        lid = find_id(tgt, h, t, o)
        log.write(json.dumps({"action": "create", "triple": row, "id": lid}) + "\n")
        n += 1
    for row in res["inverted"]:
        if n >= limit:
            break
        h, t, o = row["triple"]
        post_link(tgt, t, h, o, prb.get(t, prb["_default"]))
        lid = find_id(tgt, h, t, o)
        if not lid:
            print("correct twin not readable - wrong link KEPT", row)
            continue
        tgt.delete(f"/rest/api/3/issueLink/{row['wrong_id']}")
        log.write(json.dumps({"action": "fix-direction", "triple": row["triple"], "new_id": lid,
                              "deleted_id": row["wrong_id"]}) + "\n")
        n += 1
    for row in res["missing-type"]:
        if n >= limit or not fallback or row["fallback_present"]:
            continue
        h, t, o = row["triple"]
        post_link(tgt, fallback, h, o, prb.get(fallback, prb["_default"]))
        lid = find_id(tgt, h, fallback, o)
        log.write(json.dumps({"action": "create-fallback", "source_type": t, "triple": [h, fallback, o],
                              "id": lid, "decision": f"missing link type {t} -> {fallback}"}) + "\n")
        n += 1
    print(f"applied {n} changes; record: {CHANGES}. Re-run `plan`: inverted and missing must be 0.")


def main():
    a = sys.argv[1:]
    if not a:
        sys.exit(__doc__)

    def opt(name, d=None):
        return a[a.index(name) + 1] if name in a else d
    tgt = site_from_env("TGT")
    if a[0] == "probe":
        probe(tgt, a[1], a[2], opt("--type", "Blocks"))
        return
    src = site_from_env("SRC")
    mp = load_maps(opt("--maps", f"{STATE}/maplog-*.log"))
    fb = opt("--fallback", "Relates")
    if a[0] == "plan":
        os.makedirs(STATE, exist_ok=True)
        json.dump(plan(src, tgt, mp, fb), open(os.path.join(STATE, "links-plan.json"), "w"), indent=1)
    elif a[0] == "apply":
        apply(src, tgt, mp, fb, int(opt("--limit", str(10 ** 9))))
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
