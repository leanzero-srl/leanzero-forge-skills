#!/usr/bin/env python3
"""
link_copy.py — copy / repair issue links between migrated items with a PROVEN direction.

Field note: a copy created links with inwardIssue/outwardIssue swapped; every "A blocks B" became "B blocks A".
Per-item link COUNTS were right, so compare-by-count passed. Links are compared here as canonical TRIPLES:
    (holder of the OUTWARD wording, link type name, other end)      e.g. ("A", "Blocks", "B") = "A blocks B"
In GET /issue/X?fields=issuelinks an entry with "outwardIssue": Y means "X <outward> Y"; "inwardIssue": Y means
"Y <outward> X". How POST /issueLink maps its two parameters onto that is PROVEN, not assumed: `probe` creates one
link on two scratch items, reads both ends back, records the result, and deletes ONLY the link it created.

Modes
  probe A B [--type Blocks]       prove the POST direction on two target items you own. REFUSES if A and B already
                                  have a link of that type (POST would answer "created" for the existing link and the
                                  cleanup could delete a real one). The probe link is deleted on every exit path.
  plan  --maps 'state/maplog-*.log' [--fallback Relates]
        source triples (both ends migrated) vs target triples -> ok / inverted / inverted-symmetric / missing /
        missing-type / extra
  apply --maps ... [--fallback Relates] [--limit N] [--direction-from TYPE] [--fix-symmetric]
        create missing; for inverted: create the correct twin, read back, THEN delete the wrong one - only if the wrong
        link is attributable to US (its id is in links-changes.jsonl, or a Link entry in the changelog of either end
        was authored by OUR_ACCOUNT_IDS),
        otherwise both are kept and listed. A source type the target lacks is created as --fallback (a decision - log
        it). Every change recorded (line-flushed) in links-changes.jsonl.
        Each link type needs its OWN probe record; --direction-from TYPE explicitly reuses TYPE's probe for types
        without one (the POST mapping is a property of the endpoint, the WORDING is per type - read both before use).
Env: SRC_*/TGT_* (see atl_http.py), STATE_DIR (default ./state), WINDOW_STATE (silent_window.py),
     OUR_ACCOUNT_IDS=id1,id2 (default: the TGT account itself)
Only links whose BOTH ends are in the maps are ever touched. Never deletes a link without its correct twin present.
Symmetric types (inward wording == outward wording, e.g. Relates) read the same both ways: an "inverted" one is
reported as inverted-symmetric and only repaired with --fix-symmetric.
Python 3.8+, stdlib only; needs atl_http.py and silent_window.py.
"""
import contextlib
import glob
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from atl_http import ApiError, site_from_env  # noqa: E402
from silent_window import hold, require_silent  # noqa: E402

STATE = os.environ.get("STATE_DIR", "./state")
PROBE = os.path.join(STATE, "link-direction.json")
CHANGES = os.path.join(STATE, "links-changes.jsonl")


def project_of(key):
    return key.rsplit("-", 1)[0]


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
    """issuelinks for many keys via POST /rest/api/3/issue/bulkfetch (100 per call; read-only). bulkfetch silently
    OMITS keys it cannot return (not found, no permission) and lists retriable failures in issueErrors - both are
    fatal here: a missing item would read as 'no links' and every one of its links as missing/extra."""
    res = {}
    keys = list(keys)
    for i in range(0, len(keys), 100):
        chunk = keys[i:i + 100]
        d = site.post("/rest/api/3/issue/bulkfetch", {"issueIdsOrKeys": chunk, "fields": ["issuelinks"]})
        if d.get("issueErrors"):
            sys.exit(f"bulkfetch issueErrors on {site.base}: {d['issueErrors'][:5]} - re-run; never read as 'no links'")
        for iss in d.get("issues", []):
            res[iss["key"]] = iss["fields"].get("issuelinks") or []
        missing = [k for k in chunk if k not in res]
        if missing:
            sys.exit(f"bulkfetch on {site.base} did not return {len(missing)} keys (e.g. {missing[:5]}): not found, "
                     f"moved (answers with a new key) or not browsable - fix the map/access first")
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


def link_types(site):
    return {x["name"]: x for x in site.get("/rest/api/3/issueLinkType")["issueLinkTypes"]}


def probe_for(prb, typ, direction_from=None):
    """The recorded probe for this type, or (explicitly) the probe of --direction-from. Never a silent default."""
    if typ in prb:
        return prb[typ]
    if direction_from and direction_from in prb:
        return prb[direction_from]
    return None


def post_link(tgt, typ, holder, other, probe):
    """Create the link that renders '<holder> <outward> <other>' according to the PROVEN probe result."""
    require_silent(tgt, project_of(holder))
    if probe["inwardIssue_param_holds_outward"]:
        body = {"type": {"name": typ}, "inwardIssue": {"key": holder}, "outwardIssue": {"key": other}}
    else:
        body = {"type": {"name": typ}, "inwardIssue": {"key": other}, "outwardIssue": {"key": holder}}
    tgt.post("/rest/api/3/issueLink", body)


def delete_link(tgt, lid, key_for_gate):
    """DELETE a link; a 404 means it is already gone (e.g. fixed by an earlier run) = done."""
    require_silent(tgt, project_of(key_for_gate))
    try:
        tgt.delete(f"/rest/api/3/issueLink/{lid}")
        return "deleted"
    except ApiError as e:
        if e.status == 404:
            return "already-gone"
        raise


def find_id(tgt, holder, typ, other, tries=6):
    for _ in range(tries):
        tri = triples(holder, tgt.get(f"/rest/api/3/issue/{holder}?fields=issuelinks")["fields"].get("issuelinks"))
        if (holder, typ, other) in tri:
            return tri[(holder, typ, other)]
        time.sleep(2)
    return None


def links_between(tgt, a, b, typ):
    """{link_id: triple} of every link of type typ between a and b (either direction), read from a."""
    tri = triples(a, tgt.get(f"/rest/api/3/issue/{a}?fields=issuelinks")["fields"].get("issuelinks"))
    return {lid: t for t, lid in tri.items() if t[1] == typ and {t[0], t[2]} == {a, b}}


def probe(tgt, a, b, typ):
    os.makedirs(STATE, exist_ok=True)
    lt = link_types(tgt).get(typ) or sys.exit(f"link type '{typ}' does not exist on the target")
    before = links_between(tgt, a, b, typ)
    if before:
        sys.exit(f"REFUSED: {a} and {b} already have a '{typ}' link {list(before)} - POST would report 'created' for "
                 f"it and the probe could record a wrong direction and delete a real link. Pick two other items.")
    new_ids = []
    with hold(f"link-probe-{a}"):
        try:
            require_silent(tgt, project_of(a))
            tgt.post("/rest/api/3/issueLink", {"type": {"name": typ}, "inwardIssue": {"key": a},
                                                "outwardIssue": {"key": b}})
            for _ in range(6):                       # find exactly the link that did not exist before
                now = links_between(tgt, a, b, typ)
                new_ids = [lid for lid in now if lid not in before]
                if new_ids:
                    break
                time.sleep(2)
            if len(new_ids) != 1:
                sys.exit(f"probe inconclusive: new '{typ}' links between {a} and {b}: {new_ids}")
            lid = new_ids[0]
            ta = triples(a, tgt.get(f"/rest/api/3/issue/{a}?fields=issuelinks")["fields"].get("issuelinks"))
            tb = triples(b, tgt.get(f"/rest/api/3/issue/{b}?fields=issuelinks")["fields"].get("issuelinks"))
            if ta.get((a, typ, b)) == lid and tb.get((a, typ, b)) == lid:
                holds = True
            elif ta.get((b, typ, a)) == lid and tb.get((b, typ, a)) == lid:
                holds = False
            else:
                sys.exit(f"probe inconclusive: {a}={ta} {b}={tb}")
            reading = f"{a} {lt['outward']} {b}" if holds else f"{b} {lt['outward']} {a}"
            rec = json.load(open(PROBE)) if os.path.exists(PROBE) else {}
            rec.pop("_default", None)                # older files had a catch-all default: never again
            rec[typ] = {"inwardIssue_param_holds_outward": holds, "renders": reading, "inward": lt["inward"],
                        "outward": lt["outward"], "probe": f"POST inwardIssue={a} outwardIssue={b}",
                        "at": time.strftime("%Y-%m-%d %H:%M:%S")}
            json.dump(rec, open(PROBE, "w"), indent=1)
            print(f"PROBE {typ}: POST inwardIssue={a}, outwardIssue={b} renders '{reading}' "
                  f"-> inwardIssue param holds the outward wording: {holds}.")
        finally:
            for lid in new_ids:                       # every exit path: remove exactly what the probe created
                print(f"probe link {lid}: {delete_link(tgt, lid, a)}")


def plan(src, tgt, mp, fallback):
    lts = link_types(tgt)
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
    res = {"ok": [], "inverted": [], "inverted-symmetric": [], "missing": [], "missing-type": [], "extra": []}
    for (h, t, o) in want:
        if t not in lts:
            fb_have = (h, fallback, o) in have or (o, fallback, h) in have
            res["missing-type"].append({"triple": [h, t, o], "fallback": fallback, "fallback_present": fb_have})
        elif (h, t, o) in have:
            res["ok"].append([h, t, o])
        elif (o, t, h) in have:
            sym = lts[t]["inward"].strip().lower() == lts[t]["outward"].strip().lower()
            res["inverted-symmetric" if sym else "inverted"].append({"triple": [h, t, o], "wrong_id": have[(o, t, h)]})
        else:
            res["missing"].append([h, t, o])
    wanted = set(want)
    for tri, lid in have.items():
        if tri not in wanted and (tri[2], tri[1], tri[0]) not in wanted and tri[1] != fallback:
            res["extra"].append({"triple": list(tri), "id": lid})
    print({k: len(v) for k, v in res.items()})
    return res


def created_by_us(tgt, holder, other, typ_words, ours):
    """True if a changelog 'Link' entry on either end that names the other end was authored by one of OUR accounts.
    Unknown (no such entry readable) = False: never delete a link a person may have created."""
    for key, peer in ((holder, other), (other, holder)):
        start = 0
        while True:
            d = tgt.get(f"/rest/api/3/issue/{key}/changelog?startAt={start}&maxResults=100")
            for h in d.get("values", []):
                if (h.get("author") or {}).get("accountId") not in ours:
                    continue
                for it in h.get("items", []):
                    txt = f"{it.get('toString') or ''}"
                    if it.get("field") == "Link" and peer in txt and any(w in txt for w in typ_words):
                        return True
            vals = d.get("values", [])
            if d.get("isLast", True) or not vals:
                break
            start += len(vals)
    return False


def apply(src, tgt, mp, fallback, limit, direction_from, fix_symmetric):
    if not os.path.exists(PROBE):
        sys.exit("REFUSED: run `probe` first - the POST direction must be proven on this site")
    prb = json.load(open(PROBE))
    res = plan(src, tgt, mp, fallback)
    lts = link_types(tgt)
    used = {r[1] for r in res["missing"]} | {r["triple"][1] for r in res["inverted"]}
    if fix_symmetric:
        used |= {r["triple"][1] for r in res["inverted-symmetric"]}
    if any(not r["fallback_present"] for r in res["missing-type"]) and fallback:
        used.add(fallback)
    unproven = sorted(t for t in used if not probe_for(prb, t, direction_from))
    if unproven:
        sys.exit(f"REFUSED: no probe for link types {unproven}. Run `probe A B --type <T>` for each, or pass "
                 f"--direction-from <probed type> to reuse one deliberately.")
    ours = {x for x in os.environ.get("OUR_ACCOUNT_IDS", "").split(",") if x} or {tgt.get("/rest/api/3/myself")["accountId"]}
    os.makedirs(STATE, exist_ok=True)
    our_ids = set()                                   # link ids this tool created earlier are ours by record
    if os.path.exists(CHANGES):
        for line in open(CHANGES):
            with contextlib.suppress(ValueError):
                r = json.loads(line)
                our_ids |= {str(r.get(k)) for k in ("id", "new_id") if r.get(k)}
    log = open(CHANGES, "a", buffering=1)            # line-buffered: a kill loses at most the line being written
    n = 0
    kept = []
    with hold("link_copy"):
        for row in res["missing"]:
            if n >= limit:
                break
            h, t, o = row
            post_link(tgt, t, h, o, probe_for(prb, t, direction_from))
            lid = find_id(tgt, h, t, o)
            log.write(json.dumps({"action": "create", "triple": row, "id": lid}) + "\n")
            n += 1
        inverted = res["inverted"] + (res["inverted-symmetric"] if fix_symmetric else [])
        for row in inverted:
            if n >= limit:
                break
            h, t, o = row["triple"]
            words = [lts[t]["inward"], lts[t]["outward"]]
            if str(row["wrong_id"]) not in our_ids and not created_by_us(tgt, o, h, words, ours):
                kept.append(row)
                continue
            post_link(tgt, t, h, o, probe_for(prb, t, direction_from))
            lid = find_id(tgt, h, t, o)
            if not lid:
                print("correct twin not readable - wrong link KEPT", row)
                continue
            outcome = delete_link(tgt, row["wrong_id"], h)
            log.write(json.dumps({"action": "fix-direction", "triple": row["triple"], "new_id": lid,
                                  "deleted_id": row["wrong_id"], "delete": outcome}) + "\n")
            n += 1
        for row in res["missing-type"]:
            if n >= limit or not fallback or row["fallback_present"]:
                continue
            h, t, o = row["triple"]
            post_link(tgt, fallback, h, o, probe_for(prb, fallback, direction_from))
            lid = find_id(tgt, h, fallback, o)
            log.write(json.dumps({"action": "create-fallback", "source_type": t, "triple": [h, fallback, o],
                                  "id": lid, "decision": f"missing link type {t} -> {fallback}"}) + "\n")
            n += 1
    log.close()
    if kept:
        print(f"{len(kept)} inverted links NOT attributable to {sorted(ours)} - kept, review by hand:",
              [r["triple"] for r in kept][:20])
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
        apply(src, tgt, mp, fb, int(opt("--limit", str(10 ** 9))), opt("--direction-from"), "--fix-symmetric" in a)
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
