#!/usr/bin/env python3
"""
ordered_create.py — copy one Jira project to a NEW target project keeping every issue NUMBER (PROJ-n -> PROJ-n).

Jira gives the next number to whatever is created next and NEVER reuses a number. So: create strictly in source
number order, and consume every gap with a throwaway "filler" item (created, then deleted).

This template is the skeleton that held under production load. It copies summary, type, description (+ an origin
note), labels, due date and parents; plug your own field mapping, scrubbing and post-work into build_fields() /
post_work(). Everything else here is the part that is easy to get wrong:

  * enumerate the source by JQL AND probe every gap number by key, AND probe UPWARD past the highest JQL-visible number
    until TAIL_PROBE consecutive 404s (search-hidden items exist: readable by key, never returned by JQL) — a hidden
    item treated as a gap burns its number forever. A 403 on a probe ABORTS (it is not a gap). The total is
    cross-checked against the project's insight.totalIssueCount.
  * marker labels on every item ("migrated", "src-<SRC KEY>") and filler ("fill-<n>") = resume key + ownership.
    Source labels that start with "src-"/"fill-" are NOT copied (they would be mistaken for markers) - listed instead.
  * filler number logged BEFORE its create (a crash between log and create is healed by the lower-slot rule)
  * NO blind retry of POST /issue: after a lost response, GET the expected key and check for OUR marker label
  * resume = map log ∪ marker-label JQL, then GET forward BY KEY past the last known number (the search index lags a
    crash by seconds to minutes; a just-created item that only a GET can see is adopted, never re-created)
  * insist on the number: lower than wanted = our own stray (delete + retry); higher = NUMBER DRIFT -> stop loudly
  * sub-task whose parent has a HIGHER number -> created as a standard type with an "Original parent" note
    (bulk-move it back afterwards, see docs/04); other children of higher-numbered parents get a late-parent pass;
    parents outside the map (other projects) are written to unresolved-parents-*.log for parent_or_link.py
  * description NOT sent on create for types whose create screen lacks the system Description (Jira either refuses
    it or keeps the screen's template text) - it is PUT right after create instead
  * every write runs inside the silent window (silent_window.py: hold + require_silent before each write)
  * duplicates found on resume (two items with the same marker = a lost create re-posted) STOP the run; resolve them
    by hand (docs/04: reuse the spare for the source item with that number, or delete it)

Usage
  ordered_create.py plan SRC_KEY TGT_KEY            read-only: counts, gaps, hidden items, where a resume would start
  ordered_create.py run  SRC_KEY TGT_KEY [--limit N] [--accept-count-mismatch]
Env: SRC_BASE/SRC_EMAIL/SRC_TOKEN (read; always read-only), TGT_BASE/TGT_EMAIL/TGT_TOKEN (write; admin),
     STATE_DIR (default ./state), WINDOW_STATE (silent_window.py), TYPE_MAP='{"Defect":"Bug"}' (source type name ->
     target type name), FILLER_TYPE (default "Task", else the first level-0 standard type), TAIL_PROBE (default 50)
The target project must be NEW (no items) or contain only items this script created (resume).
Python 3.8+, stdlib only; needs atl_http.py and silent_window.py next to it.
"""
import contextlib
import json
import os
import re
import sys
import threading
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from atl_http import ApiError, site_from_env  # noqa: E402
from silent_window import hold, require_silent  # noqa: E402

STATE = os.environ.get("STATE_DIR", "./state")
RUN_LABEL = "migrated"
MARKER_RE = re.compile(r"^(src-[A-Z][A-Z0-9_]*-\d+|fill-\d+)$")
LOCK = threading.Lock()
WRITE_KEY = {"tk": None, "tgt": None}        # set in run mode: every write re-checks the silent window first


def num(key):
    return int(key.rsplit("-", 1)[1])


def guard():
    """Before every write: window open, before the hard stop, project on the silent scheme."""
    if WRITE_KEY["tk"]:
        require_silent(WRITE_KEY["tgt"], WRITE_KEY["tk"])


# ------------------------------------------------------------------------------------------- source enumeration
def probe_key(src, key, fields):
    """GET one key on the source: the issue if it is THIS key, None for 404 or an item moved away (answers with its
    new key). 403/401 abort: 'cannot see' is not 'does not exist' - treating it as a gap would burn the number."""
    try:
        i = src.get(f"/rest/api/3/issue/{key}?fields={','.join(fields)}")
    except ApiError as e:
        if e.status == 404:
            return None
        raise SystemExit(f"ABORT: GET {key} -> {e.status}. Not a gap - fix access (Browse) before copying.")
    return i if i.get("key") == key else None


def source_items(src, sk, fields, tail_probe):
    """{number: issue} from JQL, PLUS every gap number and every number ABOVE the JQL max that answers by key."""
    byn = {num(i["key"]): i for i in src.search_jql(f"project = {sk} ORDER BY key", fields)}
    if not byn:
        sys.exit(f"source {sk}: JQL returned nothing - cannot prove anything about this project")
    top = max(byn)
    if not probe_key(src, f"{sk}-{top}", ["summary"]):           # positive control: the GET route sees this project
        sys.exit(f"positive control failed: {sk}-{top} is in JQL but not readable by key - probes cannot be trusted")
    hidden = []
    for n in range(1, top):
        if n not in byn:
            i = probe_key(src, f"{sk}-{n}", fields)
            if i:
                byn[n] = i
                hidden.append(i["key"])
    misses, n = 0, top + 1                                       # search-hidden items ABOVE the highest listed number
    while misses < tail_probe:
        i = probe_key(src, f"{sk}-{n}", fields)
        if i:
            byn[n] = i
            hidden.append(i["key"])
            misses = 0
        else:
            misses += 1
        n += 1
    return byn, hidden


def insight_total(src, sk):
    d = src.get(f"/rest/api/3/project/search?keys={sk}&expand=insight")
    vals = [v for v in d.get("values", []) if v.get("key") == sk]
    return (vals[0].get("insight") or {}).get("totalIssueCount") if vals else None


# ------------------------------------------------------------------------------------------- target state
def target_map(tgt, tk):
    """Rebuild source->target from the target's own marker labels. Detect duplicates (lost creates)."""
    m, dup = {}, []
    for i in tgt.search_jql(f'project = {tk} AND labels = "{RUN_LABEL}"', ["labels"]):
        for lab in i["fields"].get("labels") or []:
            if MARKER_RE.match(lab) and lab.startswith("src-"):
                s = lab[4:]
                if s in m and m[s] != i["key"]:
                    dup.append((s, m[s], i["key"]))
                m.setdefault(s, i["key"])
    return m, dup


def read_maplog(path):
    m = {}
    if os.path.exists(path):
        for line in open(path):
            p = line.split()
            if len(p) == 2:
                m[p[0]] = p[1]
    return m


def walk_forward(tgt, tk, start, misses_allowed=2):
    """GET tk-start, tk-start+1 ... by KEY until misses_allowed consecutive 404s. Returns [(n, labels | None)] for
    numbers that exist (None = exists but moved away/unreadable). The search index can lag a crash; a GET cannot."""
    found, misses, n = [], 0, start
    while misses < misses_allowed:
        try:
            i = tgt.get(f"/rest/api/3/issue/{tk}-{n}?fields=labels")
            found.append((n, (i["fields"].get("labels") or []) if i.get("key") == f"{tk}-{n}" else None))
            misses = 0
        except ApiError as e:
            if e.status != 404:
                raise
            misses += 1
        n += 1
    return found


def is_ours(tgt, key, marker):
    try:
        i = tgt.get(f"/rest/api/3/issue/{key}?fields=labels")
    except ApiError as e:
        if e.status == 404:
            return False
        raise
    return i.get("key") == key and marker in (i["fields"].get("labels") or [])


def post_issue(tgt, fields, tk, n, marker, omit_desc=False):
    """POST /issue without a blind retry. After a lost response, check whether PROJ-n carries OUR marker first."""
    body = {k: v for k, v in fields.items() if not (omit_desc and k == "description")}
    for attempt in range(30):
        guard()
        try:
            return tgt.post("/rest/api/3/issue", {"fields": body})["key"]
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


def create_at(tgt, tk, n, fields, marker, omit_desc=False):
    while True:
        k = post_issue(tgt, fields, tk, n, marker, omit_desc)
        got = num(k)
        if got == n:
            return k
        if got < n:                         # a slot freed by an earlier crash: our own fresh item, remove + retry
            guard()
            tgt.delete(f"/rest/api/3/issue/{k}")
            continue
        raise SystemExit(f"NUMBER DRIFT: wanted {tk}-{n}, got {k} - stop and investigate (do not continue)")


def create_with_fallbacks(tgt, tk, n, fields, marker, omit_desc):
    """create_at + the refusals seen in the field. Match on the ERROR KEY, never on a word in the prose: the message
    for Team on a sub-task ("... inherits the team assignment from its parent") contains "parent", and a fallback that
    matched the word dropped the parent of EVERY sub-task. Returns (key, refused_parent_source_key_or_None)."""
    refused = None
    for _ in range(4):
        try:
            return create_at(tgt, tk, n, fields, marker, omit_desc), refused
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
            guard()
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


def standard_type(types, subtypes, levels, prefer="Task"):
    """A level-0 standard type: the preferred name if present, never an Epic-level or sub-task type."""
    if prefer in types and prefer not in subtypes and levels.get(prefer, 0) == 0:
        return prefer
    return next((t for t in types if t not in subtypes and levels.get(t, 0) == 0), None) or \
        next(t for t in types if t not in subtypes)


def build_fields(f, sk_key, tk, types, subtypes, levels, mp, type_map, std):
    src_type = f["issuetype"]["name"]
    tn = type_map.get(src_type, src_type)
    if tn not in types:
        tn = std if not f["issuetype"].get("subtask") else next((t for t in types if t in subtypes), std)
    notes = []
    src_labels = f.get("labels") or []
    dropped = [lab for lab in src_labels if " " in lab or lab.startswith(("src-", "fill-"))]
    fields = {"project": {"key": tk}, "issuetype": {"id": types[tn]}, "summary": (f.get("summary") or "")[:255],
              "labels": [lab for lab in src_labels if lab not in dropped and lab != RUN_LABEL] + [RUN_LABEL,
                                                                                                 f"src-{sk_key}"]}
    if dropped:
        notes.append("Source labels not copied: " + ", ".join(dropped) + ".")
    if f.get("duedate"):
        fields["duedate"] = f["duedate"]
    par = (f.get("parent") or {}).get("key")
    late = None
    if par and par in mp:
        fields["parent"] = {"key": mp[par]}
    elif par and tn in subtypes:
        # a sub-task cannot wait for a higher-numbered parent: standard type now, bulk-move back later (docs/04)
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
    """Plug comments (paged!), attachments, worklogs, remote links, status walk here. Must be idempotent.
    Call guard() before every write you add."""
    if desc_needs_put:
        guard()
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
    up_f = f"{STATE}/unresolved-parents-{sk}-{tk}.log"

    fields_wanted = ["summary", "description", "issuetype", "status", "labels", "parent", "created",
                     "resolutiondate", "duedate"]
    byn, hidden = source_items(src, sk, fields_wanted, int(os.environ.get("TAIL_PROBE", "50")))
    total = insight_total(src, sk)
    proj = tgt.get(f"/rest/api/3/project/{tk}?expand=issueTypes")
    types = {t["name"]: t["id"] for t in proj["issueTypes"]}
    subtypes = {t["name"] for t in proj["issueTypes"] if t.get("subtask")}
    levels = {t["name"]: t.get("hierarchyLevel", 0) for t in proj["issueTypes"]}
    std = standard_type(types, subtypes, levels, os.environ.get("FILLER_TYPE", "Task"))

    # resume state = marker labels (JQL) ∪ map log ∪ a GET-forward walk past the last known number
    mp, dup = target_map(tgt, tk)
    logged = read_maplog(ml_f)
    for s, t in logged.items():
        if s in mp and mp[s] != t:
            dup.append((s, mp[s], t))
        mp.setdefault(s, t)
    fills = [int(x) for x in open(fl_f).read().split()] if os.path.exists(fl_f) else []
    stray_fillers, foreign = [], 0
    for i in tgt.search_jql(f'project = {tk} AND (labels is EMPTY OR labels != "{RUN_LABEL}")', ["labels"]):
        if any(lab.startswith("fill-") for lab in i["fields"].get("labels") or []):
            stray_fillers.append(i["key"])            # ours: a filler whose delete failed earlier
        else:
            foreign += 1
    last = max([num(v) for v in mp.values()] + fills + [0])
    adopted = []
    for n, labs in walk_forward(tgt, tk, last + 1):
        mark = [lab for lab in (labs or []) if MARKER_RE.match(lab)]
        if labs is None or not mark:
            foreign += 1
            print(f"{tk}-{n}: exists, not ours (no marker) - beyond the last known number", flush=True)
        elif mark[0].startswith("fill-"):
            stray_fillers.append(f"{tk}-{n}")
            fills.append(n)
        else:
            s = mark[0][4:]
            if s in mp and mp[s] != f"{tk}-{n}":
                dup.append((s, mp[s], f"{tk}-{n}"))
            else:
                mp[s] = f"{tk}-{n}"
                adopted.append(s)
        last = max(last, n)
    # the map log must end up holding EVERY mapped pair (later passes read only the logs): JQL-recovered and
    # GET-adopted pairs a crash kept out of the log are written back in run mode
    missing_in_log = sorted((s for s in mp if s not in logged), key=num)
    _MP.clear()
    _MP.update(mp)
    mapped_nums = {num(k) for k in mp}                  # source numbers that already have a target
    lost = [f"{sk}-{n}" for n in sorted(byn) if n <= last and n not in mapped_nums]
    print(f"source {sk}: {len(byn)} items, max {sk}-{max(byn)}, gaps {max(byn) - len(byn)}, "
          f"search-hidden (readable by key, not by JQL): {hidden or 'none'}; insight.totalIssueCount={total}")
    print(f"target {tk}: {len(mp)} mapped ({len(adopted)} adopted by GET walk, {len(missing_in_log)} missing from the "
          f"map log), {len(fills)} fillers logged, "
          f"{len(stray_fillers)} undeleted fillers, foreign items {foreign}, resume at {last + 1}")
    count_bad = total is not None and total > len(byn)
    if count_bad:
        print(f"COUNT MISMATCH: insight says {total} items, enumeration found {len(byn)} - items hidden beyond "
              f"TAIL_PROBE or unreadable; raise TAIL_PROBE / fix Browse before copying")
    if dup:
        print("DUPLICATES (lost creates) - resolve before running (docs/04):", dup)
    if lost:
        print(f"NUMBER LOST - source items at or below the resume point with no target: {lost}")
    if mode == "plan":
        return
    if foreign:
        sys.exit(f"REFUSED: {tk} has {foreign} items this script did not create")
    if dup:
        sys.exit("REFUSED: duplicates present")
    if count_bad and "--accept-count-mismatch" not in a:
        sys.exit("REFUSED: count mismatch (see above); --accept-count-mismatch only after you have explained it")

    WRITE_KEY.update(tk=tk, tgt=tgt)
    with hold(f"ordered_create-{tk}"):
        if missing_in_log:
            with LOCK, open(ml_f, "a") as fh:
                fh.write("".join(f"{s} {mp[s]}\n" for s in missing_in_log))
        for k in stray_fillers:
            delete_quiet(tgt, k)

        # types whose CREATE screen lacks the system Description: omit it on create, PUT it right after
        desc_on_create = {}
        for name, tid in types.items():
            try:
                fl = tgt.get(f"/rest/api/3/issue/createmeta/{tk}/issuetypes/{tid}?maxResults=200").get("fields", [])
                desc_on_create[tid] = "description" in {x.get("fieldId") for x in fl}
            except ApiError:
                desc_on_create[tid] = False
        print("types without Description on create:", sorted(n for n, i in types.items() if not desc_on_create[i]))

        late, done = [], 0
        for n in range(last + 1, max(byn) + 1):
            if done >= limit:
                break
            if n in byn:
                i = byn[n]
                f = i["fields"]
                fields, lp = build_fields(f, i["key"], tk, types, subtypes, levels, mp, type_map, std)
                omit = not desc_on_create.get(fields["issuetype"]["id"], True)
                new, refused = create_with_fallbacks(tgt, tk, n, fields, f"src-{i['key']}", omit)
                if refused:
                    lp = refused                              # parent_or_link.py turns it into a link if it stays refused
                with LOCK, open(ml_f, "a") as fh:
                    fh.write(f"{i['key']} {new}\n")
                mp[i["key"]] = _MP[i["key"]] = new
                if lp:
                    late.append((i["key"], lp))
                post_work(tgt, i["key"], new, f, omit, fields)
                done += 1
            else:
                with open(fl_f, "a") as fh:                    # BEFORE the create
                    fh.write(f"{n}\n")
                k = create_at(tgt, tk, n, {"project": {"key": tk}, "issuetype": {"id": types[std]},
                                           "summary": "filler", "labels": [f"fill-{n}"]}, f"fill-{n}")
                delete_quiet(tgt, k)
            if n % 50 == 0:
                print(f" .. {tk}-{n}", flush=True)
        # late parents, recomputed from the SOURCE so a resumed run does not forget earlier ones: every non-sub-task
        # whose parent has a higher number OR lives in another project
        for n, i in sorted(byn.items()):
            p = (i["fields"].get("parent") or {}).get("key")
            if p and not i["fields"]["issuetype"].get("subtask") and (not p.startswith(sk + "-") or num(p) > n):
                if (i["key"], p) not in late:
                    late.append((i["key"], p))
        unresolved = []
        for k, p in late:
            if k not in mp:
                continue
            if p not in mp:
                unresolved.append(f"{k} {p}")                  # cross-project / not migrated (yet): never silent
                continue
            try:
                guard()
                tgt.put(f"/rest/api/3/issue/{mp[k]}?notifyUsers=false", {"fields": {"parent": {"key": mp[p]}}})
            except ApiError as e:
                print(f"late parent fail {k} -> {p}: {e.status} (hierarchy? use parent_or_link.py)", flush=True)
        with open(up_f, "w") as fh:                            # rewritten every run: never a stale list
            fh.write("".join(x + "\n" for x in unresolved))
        if unresolved:
            print(f"UNRESOLVED PARENTS {len(unresolved)} (parent not in this map) -> {up_f}; run parent_or_link.py "
                  f"with ALL map logs after every project is loaded", flush=True)
    print(f"done: mapped {len(mp)}, late parents {len(late)}, unresolved parents {len(unresolved)}, "
          f"created this run {done}")


if __name__ == "__main__":
    with contextlib.suppress(BrokenPipeError):
        main()
