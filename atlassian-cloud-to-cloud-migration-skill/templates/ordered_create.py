#!/usr/bin/env python3
"""
ordered_create.py — copy one Jira project to a NEW target project keeping every issue NUMBER (PROJ-n -> PROJ-n).

Jira gives the next number to whatever is created next and NEVER reuses a number. So: create strictly in source
number order, and consume every gap with a throwaway "filler" item (created, then deleted).

This template is the skeleton that held under production load. It copies summary, type, description (+ an origin
note), labels, due date and parents; plug your own field mapping, scrubbing and post-work into build_fields() /
post_work(). Everything else here is the part that is easy to get wrong:

  * enumerate the source by JQL AND probe every gap number by key (search-hidden items exist: readable by key,
    never returned by JQL) — a hidden item treated as a gap burns its number forever
  * marker labels on every item ("migrated", "src-<SRC KEY>") and filler ("fill-<n>") = resume key + ownership
  * filler number logged BEFORE its create (a crash between log and create is healed by the lower-slot rule)
  * NO blind retry of POST /issue: after a lost response, GET the expected key and check for our marker label
  * insist on the number: lower than wanted = our own stray (delete + retry); higher = NUMBER DRIFT -> stop loudly
  * sub-task whose parent has a HIGHER number -> created as a standard type with an "Original parent" note
    (bulk-move it back afterwards, see docs/04); other children of higher-numbered parents get a late-parent pass
  * description PUT after create for types whose create screen lacks the system Description (Jira would store the
    screen's template default instead)

Usage
  ordered_create.py plan SRC_KEY TGT_KEY            read-only: counts, gaps, hidden items, where a resume would start
  ordered_create.py run  SRC_KEY TGT_KEY [--limit N]
Env: SRC_BASE/SRC_EMAIL/SRC_TOKEN (read), TGT_BASE/TGT_EMAIL/TGT_TOKEN (write; admin), STATE_DIR (default ./state),
     TYPE_MAP='{"Epic":"Feature"}' (source type name -> target type name), READ_ONLY_SITES=<SRC_BASE>
The target project must be NEW (no items) or contain only items this script created (resume).
Python 3.8+, stdlib only; needs atl_http.py next to it.
"""
import json
import os
import sys
import threading
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from atl_http import ApiError, site_from_env  # noqa: E402

STATE = os.environ.get("STATE_DIR", "./state")
RUN_LABEL = "migrated"
LOCK = threading.Lock()


def num(key):
    return int(key.rsplit("-", 1)[1])


# ------------------------------------------------------------------------------------------- source enumeration
def source_items(src, sk, fields):
    """{number: issue} from JQL, PLUS every gap number that answers by key (search-hidden items)."""
    byn = {num(i["key"]): i for i in src.search_jql(f"project = {sk} ORDER BY key", fields)}
    if not byn:
        sys.exit(f"source {sk}: JQL returned nothing - cannot prove anything about this project")
    hidden = []
    for n in range(1, max(byn) + 1):
        if n in byn:
            continue
        try:
            i = src.get(f"/rest/api/3/issue/{sk}-{n}?fields={','.join(fields)}")
            if i.get("key") == f"{sk}-{n}":           # a moved item answers with its NEW key - not ours
                byn[n] = i
                hidden.append(i["key"])
        except ApiError as e:
            if e.status not in (404, 403):
                raise
    return byn, hidden


# ------------------------------------------------------------------------------------------- target state
def target_map(tgt, tk):
    """Rebuild source->target from the target's own marker labels. Detect duplicates (lost creates)."""
    m, dup = {}, []
    for i in tgt.search_jql(f'project = {tk} AND labels = "{RUN_LABEL}"', ["labels"]):
        for lab in i["fields"].get("labels") or []:
            if lab.startswith("src-"):
                s = lab[4:]
                if s in m and m[s] != i["key"]:
                    dup.append((s, m[s], i["key"]))
                m.setdefault(s, i["key"])
    return m, dup


def is_ours(tgt, key, marker):
    try:
        i = tgt.get(f"/rest/api/3/issue/{key}?fields=labels")
    except ApiError:
        return False
    return marker in (i["fields"].get("labels") or [])


def post_issue(tgt, fields, tk, n):
    """POST /issue without a blind retry. After a lost response, check whether PROJ-n is ours first."""
    marker = next(lab for lab in fields["labels"] if lab.startswith(("src-", "fill-")))
    for attempt in range(30):
        try:
            return tgt.post("/rest/api/3/issue", {"fields": fields})["key"]
        except ApiError as e:
            if 0 < e.status < 500:
                raise
            # the response was lost: the item may exist. A brand-new item can 404 for ~30 s, so look several times
            # before concluding it was not created (a premature re-post = a duplicate that steals the next number)
            for _ in range(7):
                time.sleep(5)
                if is_ours(tgt, f"{tk}-{n}", marker):
                    print(f"RECOVERED lost create {tk}-{n}", flush=True)
                    return f"{tk}-{n}"
            time.sleep(min(2 ** attempt, 60))
    raise SystemExit("gave up POST /issue")


def create_at(tgt, tk, n, fields):
    while True:
        k = post_issue(tgt, fields, tk, n)
        got = num(k)
        if got == n:
            return k
        if got < n:                         # a slot freed by an earlier crash: our own fresh item, remove + retry
            tgt.delete(f"/rest/api/3/issue/{k}")
            continue
        raise SystemExit(f"NUMBER DRIFT: wanted {tk}-{n}, got {k} - stop and investigate (do not continue)")


def create_with_fallbacks(tgt, tk, n, fields):
    """create_at + the refusals seen in the field. Match on the ERROR KEY, never on a word in the prose: the message
    for Team on a sub-task ("... inherits the team assignment from its parent") contains "parent", and a fallback that
    matched the word dropped the parent of EVERY sub-task. Returns (key, refused_parent_source_key_or_None)."""
    refused = None
    for _ in range(4):
        try:
            return create_at(tgt, tk, n, fields), refused
        except ApiError as e:
            if e.status != 400:
                raise
            try:
                errs = json.loads(e.body).get("errors", {})
            except ValueError:
                raise e
            if "parent" in errs and "parent" in fields:     # e.g. "does not belong to appropriate hierarchy"
                tgt_parent = fields.pop("parent")["key"]
                src_parent = next((s for s, t in _MP.items() if t == tgt_parent), tgt_parent)
                fields["description"]["content"].append(text_para(f"Original parent: {src_parent} ({errs['parent']})."))
                refused = src_parent
                continue
            gone = [f for f in ("assignee", "reporter") if f in errs and f in fields]
            if gone:                                         # person not assignable on the target: keep the name as text
                for f in gone:
                    fields.pop(f)
                fields["description"]["content"].append(text_para("Original " + ", ".join(gone) + " not assignable."))
                continue
            raise
    raise SystemExit(f"create {tk}-{n}: too many refusals")


_MP = {}


def delete_quiet(tgt, key):
    for attempt in range(8):
        try:
            tgt.delete(f"/rest/api/3/issue/{key}")
            return
        except ApiError as e:
            if e.status == 404:
                return
            time.sleep(2 ** attempt)
    print(f"FILLER NOT DELETED {key}", flush=True)


# ------------------------------------------------------------------------------------------- field building
def text_para(t):
    return {"type": "paragraph", "content": [{"type": "text", "text": t}]}


def transform_adf(adf):
    """Plug your scrubber here (mentions -> text, names -> placeholder, media remap ...). Identity by default."""
    return adf


def build_fields(f, sk_key, tk, types, subtypes, mp, type_map):
    src_type = f["issuetype"]["name"]
    tn = type_map.get(src_type, src_type)
    if tn not in types:
        tn = next((t for t in types if t not in subtypes), None) if not f["issuetype"].get("subtask") else \
             next((t for t in types if t in subtypes), None)
    notes = []
    fields = {"project": {"key": tk}, "issuetype": {"id": types[tn]}, "summary": (f.get("summary") or "")[:255],
              "labels": [lab for lab in (f.get("labels") or []) if " " not in lab] + [RUN_LABEL, f"src-{sk_key}"]}
    if f.get("duedate"):
        fields["duedate"] = f["duedate"]
    par = (f.get("parent") or {}).get("key")
    late = None
    if par and par in mp:
        fields["parent"] = {"key": mp[par]}
    elif par and tn in subtypes:
        # a sub-task cannot wait for a higher-numbered parent: standard type now, bulk-move back later (docs/04)
        std = next(t for t in types if t not in subtypes)
        fields["issuetype"] = {"id": types[std]}
        notes.append(f"Original parent: {par} (was a sub-task of it).")
    elif par:
        late = par                                           # set in the late-parent pass
    desc = transform_adf(f.get("description")) or {"type": "doc", "version": 1, "content": []}
    desc = {"type": "doc", "version": 1, "content": list(desc.get("content", []))}
    origin = f"Migrated from {sk_key} (type {src_type}, status {f['status']['name']}), created {f['created'][:10]}"
    if f.get("resolutiondate"):
        origin += f", resolved {f['resolutiondate'][:10]}"
    desc["content"] += [text_para(origin + ".")] + [text_para(x) for x in notes]
    fields["description"] = desc
    return fields, late


def post_work(tgt, src_key, new_key, f, desc_needs_put, fields):
    """Plug comments (paged!), attachments, worklogs, remote links, status walk here. Must be idempotent."""
    if desc_needs_put:
        tgt.put(f"/rest/api/3/issue/{new_key}?notifyUsers=false", {"fields": {"description": fields["description"]}})


# ------------------------------------------------------------------------------------------- main loop
def main():
    a = sys.argv[1:]
    if len(a) < 3 or a[0] not in ("plan", "run"):
        sys.exit(__doc__)
    mode, sk, tk = a[0], a[1], a[2]
    limit = int(a[a.index("--limit") + 1]) if "--limit" in a else 10 ** 9
    src, tgt = site_from_env("SRC"), site_from_env("TGT")
    type_map = json.loads(os.environ.get("TYPE_MAP", "{}"))
    os.makedirs(STATE, exist_ok=True)
    ml_f, fl_f = f"{STATE}/maplog-{sk}-{tk}.log", f"{STATE}/fillers-{sk}-{tk}.log"

    fields_wanted = ["summary", "description", "issuetype", "status", "labels", "parent", "created",
                     "resolutiondate", "duedate"]
    byn, hidden = source_items(src, sk, fields_wanted)
    proj = tgt.get(f"/rest/api/3/project/{tk}?expand=issueTypes")
    types = {t["name"]: t["id"] for t in proj["issueTypes"]}
    subtypes = {t["name"] for t in proj["issueTypes"] if t.get("subtask")}
    mp, dup = target_map(tgt, tk)
    _MP.clear()
    _MP.update(mp)
    fills = [int(x) for x in open(fl_f).read().split()] if os.path.exists(fl_f) else []
    stray_fillers, foreign = [], 0
    for i in tgt.search_jql(f'project = {tk} AND (labels is EMPTY OR labels != "{RUN_LABEL}")', ["labels"]):
        if any(lab.startswith("fill-") for lab in i["fields"].get("labels") or []):
            stray_fillers.append(i["key"])            # ours: a filler whose delete failed earlier
        else:
            foreign += 1
    last = max([num(v) for v in mp.values()] + fills + [0])
    print(f"source {sk}: {len(byn)} items, max {sk}-{max(byn)}, gaps {max(byn) - len(byn)}, "
          f"search-hidden (readable by key, not by JQL): {hidden or 'none'}")
    print(f"target {tk}: {len(mp)} mapped, {len(fills)} fillers logged, {len(stray_fillers)} undeleted fillers, "
          f"foreign items {foreign}, resume at {last + 1}")
    if dup:
        print("DUPLICATES (lost creates) - resolve before running:", dup)
    if mode == "plan":
        return
    if foreign:
        sys.exit(f"REFUSED: {tk} has {foreign} items this script did not create")
    if dup:
        sys.exit("REFUSED: duplicates present")
    for k in stray_fillers:
        delete_quiet(tgt, k)

    # types whose CREATE screen lacks the system Description store the screen template instead -> PUT after create
    desc_on_create = {}
    for name, tid in types.items():
        try:
            fl = tgt.get(f"/rest/api/3/issue/createmeta/{tk}/issuetypes/{tid}?maxResults=200").get("fields", [])
            desc_on_create[tid] = "description" in {x.get("fieldId") for x in fl}
        except ApiError:
            desc_on_create[tid] = False
    print("types without Description on create:", sorted(n for n, i in types.items() if not desc_on_create[i]))

    filler_type = next(t for t in types if t not in subtypes)
    late, done = [], 0
    for n in range(last + 1, max(byn) + 1):
        if done >= limit:
            break
        if n in byn:
            i = byn[n]
            f = i["fields"]
            fields, lp = build_fields(f, i["key"], tk, types, subtypes, mp, type_map)
            new, refused = create_with_fallbacks(tgt, tk, n, fields)
            if refused:
                lp = refused                                  # parent_or_link.py turns it into a link if it stays refused
            with LOCK:
                open(ml_f, "a").write(f"{i['key']} {new}\n")
            mp[i["key"]] = _MP[i["key"]] = new
            if lp:
                late.append((i["key"], lp))
            post_work(tgt, i["key"], new, f, not desc_on_create.get(fields["issuetype"]["id"], True), fields)
            done += 1
        else:
            open(fl_f, "a").write(f"{n}\n")                 # BEFORE the create
            k = create_at(tgt, tk, n, {"project": {"key": tk}, "issuetype": {"id": types[filler_type]},
                                        "summary": "filler", "labels": [f"fill-{n}"]})
            delete_quiet(tgt, k)
        if n % 50 == 0:
            print(f" .. {tk}-{n}", flush=True)
    # late parents, recomputed from the SOURCE so a resumed run does not forget earlier ones
    for n, i in sorted(byn.items()):
        p = (i["fields"].get("parent") or {}).get("key")
        if p and p.startswith(sk + "-") and num(p) > n and not i["fields"]["issuetype"].get("subtask"):
            if (i["key"], p) not in late:
                late.append((i["key"], p))
    for k, p in late:
        if k in mp and p in mp:
            try:
                tgt.put(f"/rest/api/3/issue/{mp[k]}?notifyUsers=false", {"fields": {"parent": {"key": mp[p]}}})
            except ApiError as e:
                print(f"late parent fail {k} -> {p}: {e.status} (hierarchy? use parent_or_link.py)", flush=True)
    print(f"done: mapped {len(mp)}, late parents {len(late)}, created this run {done}")


if __name__ == "__main__":
    main()
