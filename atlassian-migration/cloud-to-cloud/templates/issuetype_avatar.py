#!/usr/bin/env python3
"""
issuetype_avatar.py — give an issue type YOU created its own icon.

Field note: every global issue type created for migrated service desks got the DEFAULT avatar, so different types
rendered the same icon in queues ("all tickets look like the same type"). The data was right; the icons were not.

  POST /rest/api/3/universal_avatar/type/issuetype/owner/{issueTypeId}?size=N   (raw image body, X-Atlassian-Token)
       -> {"id": "<avatarId>", ...}
  PUT  /rest/api/3/issuetype/{issueTypeId}   {"avatarId": <avatarId>}

Usage
  issuetype_avatar.py show   TYPE_ID                      current avatar id + every project whose issue type SCHEME
                                                          holds the type (proven from the scheme side, not by JQL)
  issuetype_avatar.py upload TYPE_ID icon.png [--size 96] [--x 0 --y 0] --own P1,P2 [--apply]   upload + assign
  issuetype_avatar.py set    TYPE_ID AVATAR_ID --own P1,P2 [--apply]                      assign an existing avatar id
  --apply refuses unless every project whose scheme holds the type is in --own (your migrated projects): an avatar is
  GLOBAL to the type, so changing it changes the icon for every project that uses the type.
Every --apply appends {type, before, uploaded, after} to STATE_DIR/issuetype-avatars.json; revert = `set TYPE OLD_ID`.

Where icons come from: classic JSM type icons are served as SVG by any JSM site at
  /servicedesk/issue-type-icons?icon=<name>
(16 px SVGs) - render at the target size in a headless browser (<img style="width:96px;height:96px"> + element
screenshot, transparent background) and LOOK at the PNG; a thumbnailer that keeps 16 px gives a speck on a big canvas.
Only touch types you created. A JQL count ("issuetype = X AND project not in (...)" = 0) is blind to projects your
account cannot browse; the scheme side (issuetypescheme/mapping + issuetypescheme/project per project, Administer
Jira) is not.
Env: TGT_BASE/TGT_EMAIL/TGT_TOKEN, STATE_DIR (default ./state). Python 3.8+, stdlib only; needs atl_http.py.
"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from atl_http import site_from_env  # noqa: E402

STATE = os.environ.get("STATE_DIR", "./state")
REC = os.path.join(STATE, "issuetype-avatars.json")


def current(tgt, tid):
    return tgt.get(f"/rest/api/3/issuetype/{tid}")


def paged(tgt, path):
    start = 0
    while True:
        d = tgt.get(f"{path}{'&' if '?' in path else '?'}startAt={start}&maxResults=50")
        vals = d.get("values", [])
        yield from vals
        if d.get("isLast", True) or not vals:
            return
        start += len(vals)


def projects_using(tgt, tid):
    """Keys of every classic project whose issue type scheme contains the type, asked from each PROJECT's side
    (issuetypescheme/project?projectId=...), so no scheme's own project list is trusted. On a test site the scheme-side
    `expand=projects` agreed for every non-default scheme; the DEFAULT scheme (which every new global type joins)
    listed 0 projects there and no project used it, so that case is unmeasured - this route does not depend on it."""
    schemes = {m["issueTypeSchemeId"] for m in paged(tgt, "/rest/api/3/issuetypescheme/mapping")
               if str(m["issueTypeId"]) == str(tid)}
    projects = {str(p["id"]): p["key"] for p in paged(tgt, "/rest/api/3/project/search")}
    ids, keys = sorted(projects), set()
    for i in range(0, len(ids), 50):
        q = "&".join(f"projectId={x}" for x in ids[i:i + 50])
        for row in paged(tgt, f"/rest/api/3/issuetypescheme/project?{q}"):
            if str(row["issueTypeScheme"]["id"]) in schemes:
                keys |= {projects.get(str(x), str(x)) for x in row.get("projectIds", [])}
    return sorted(schemes), sorted(keys)


def record(row):
    os.makedirs(STATE, exist_ok=True)
    rows = json.load(open(REC)) if os.path.exists(REC) else []
    rows.append(row)
    json.dump(rows, open(REC, "w"), indent=1)


def main():
    a = sys.argv[1:]
    if len(a) < 2:
        sys.exit(__doc__)

    def opt(n, d=None):
        return a[a.index(n) + 1] if n in a else d
    mode, tid, apply_ = a[0], a[1], "--apply" in a
    tgt = site_from_env("TGT")
    it = current(tgt, tid)
    print(f"type {tid} '{it['name']}' avatarId={it.get('avatarId')} scope={it.get('scope', 'global')}")
    if (it.get("scope") or {}).get("type") == "PROJECT":
        sys.exit("team-managed (project-scoped) type: PUT /issuetype answers 400 'not a global issue type' - change "
                 "its icon in that project's settings")
    schemes, projects = projects_using(tgt, tid)
    print(f"schemes holding it: {schemes or 'none'}; projects: {projects or 'none'}")
    if mode == "show":
        return
    own = {k for k in (opt("--own") or "").split(",") if k}
    if apply_ and not (own and set(projects) <= own):
        sys.exit(f"REFUSED: the type is in the schemes of {sorted(set(projects) - own) or projects} beyond --own "
                 f"{sorted(own)} - its avatar is global; ask the config owner")
    if mode == "upload":
        data = open(a[2], "rb").read()
        if data[:8] != b"\x89PNG\r\n\x1a\n":
            sys.exit("expected a PNG file")
        size = opt("--size", "96")
        q = f"size={size}" + (f"&x={opt('--x')}" if opt("--x") else "") + (f"&y={opt('--y')}" if opt("--y") else "")
        if not apply_:
            print(f"[dry] would upload {len(data)} bytes as avatar of type {tid} ({q}) and assign it")
            return
        av = tgt.request("POST", f"/rest/api/3/universal_avatar/type/issuetype/owner/{tid}?{q}", raw=data,
                         headers={"Content-Type": "image/png", "X-Atlassian-Token": "no-check"})
        new_id = av["id"]
    elif mode == "set":
        new_id = a[2]
        if not apply_:
            print(f"[dry] would set avatarId {new_id} on type {tid}")
            return
    else:
        sys.exit(__doc__)
    before = it.get("avatarId")
    tgt.put(f"/rest/api/3/issuetype/{tid}", {"avatarId": int(new_id)})
    after = current(tgt, tid).get("avatarId")
    record({"at": time.strftime("%Y-%m-%d %H:%M:%S"), "type": tid, "name": it["name"], "before": before,
            "uploaded": new_id if mode == "upload" else None, "after": after})
    print(f"type {tid}: avatar {before} -> {after}" + ("" if str(after) == str(new_id) else "  MISMATCH - check"))


if __name__ == "__main__":
    main()
