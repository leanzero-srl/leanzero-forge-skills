#!/usr/bin/env python3
"""
issuetype_avatar.py — give an issue type YOU created its own icon.

Field note: every global issue type created for migrated service desks got the DEFAULT avatar, so different types
rendered the same icon in queues ("all tickets look like the same type"). The data was right; the icons were not.

  POST /rest/api/3/universal_avatar/type/issuetype/owner/{issueTypeId}?size=N   (raw image body, X-Atlassian-Token)
       -> {"id": "<avatarId>", ...}
  PUT  /rest/api/3/issuetype/{issueTypeId}   {"avatarId": <avatarId>}

Usage
  issuetype_avatar.py show   TYPE_ID                      current avatar id + how many items use the type, per project
  issuetype_avatar.py upload TYPE_ID icon.png [--size 96] [--x 0 --y 0] [--apply]   upload + assign (dry run default)
  issuetype_avatar.py set    TYPE_ID AVATAR_ID [--apply]  assign an existing (e.g. system) avatar id
Every --apply appends {type, before, uploaded, after} to STATE_DIR/issuetype-avatars.json; revert = `set TYPE OLD_ID`.

Where icons come from: classic JSM type icons are served as SVG by any JSM site at
  /servicedesk/issue-type-icons?icon=<name>
render to a square PNG (e.g. `rsvg-convert -w 96 -h 96 in.svg > out.png`, or a headless browser screenshot), then upload.
Only touch types you created; `show` lists projects using the type so you can prove nobody else depends on it.
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
    if mode == "show":
        used = {}
        for i in tgt.search_jql(f"issuetype = {tid}", ["project"]):
            p = i["fields"]["project"]["key"]
            used[p] = used.get(p, 0) + 1
        print("items using it per project:", used or "none")
        return
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
