#!/usr/bin/env python3
"""
silent_window.py — keep Jira projects SILENT (no notification e-mails) while a migration writes to them,
and put them back exactly as they were. Read-back at every step; the before-state is recorded ONCE.

Modes
  create-scheme                          find-or-create the empty scheme named $SILENT_NAME, print its id
  enter   --projects A,B [--silent-id N] record each project's current scheme (only if no record exists yet),
                                         prove the silent scheme has ZERO recipients, assign it, read back (wait up to
                                         --wait s per project), disable autowatch for every writer account, write
                                         <state>/WINDOW-OPEN. Exit 1 if any project does not read back silent.
  restore                                wait until no HOLD-WINDOW-* file and no lock-*.d dir exists, PUT every
                                         project back to its recorded scheme, read back, restore autowatch,
                                         print "recorded -> now" per project. Exit 1 if anything differs.
  status                                 print each recorded project's current scheme

Library use inside a WRITER (another script):
    from silent_window import hold, project_lock, require_silent
    with hold("links"):                       # restore waits while this file exists
        with project_lock("PROJ"):            # atomic mkdir; two writers never toggle the same project
            require_silent(tgt, "PROJ", SILENT_ID)   # re-read the scheme right before writing; raises if not silent
            tgt.put("/rest/api/3/issue/PROJ-1?notifyUsers=false", {...})

Env
  TGT_BASE, TGT_EMAIL, TGT_TOKEN       the target site + admin account (writes)
  WRITER_PREFIXES=TGT,TGT2             env prefixes of EVERY account that writes (autowatch is per user)
  SILENT_NAME="Migration - silent (load only)"
  WINDOW_STATE=./state/window          where the record, WINDOW-OPEN, HOLD and lock files live

Why each step exists (field-proven):
  * Scheme writes have been observed to apply LATE (an hour) -> read back with a wait, never trust the PUT.
  * Queued writes later created duplicate "silent" schemes and renamed a REAL scheme -> pin by id, prove it empty.
  * A crash before saving lost the originals -> the record is written per project, immediately, and never overwritten.
  * "No scheme" (404, e.g. a JSM template desk) is not documented as silent -> it is assigned the silent scheme too
    and recorded as "none" (restore leaves it silent and tells you to assign its real scheme).
  * Team-managed projects cannot be reassigned (HTTP 400) -> skipped and listed; make sure their recipients are you.
  * Autowatch: the preference body must be the BARE JSON literal true; a quoted "true" silently stores false.
Python 3.8+, stdlib only; needs atl_http.py next to it.
"""
import contextlib
import glob
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from atl_http import ApiError, site_from_env  # noqa: E402

STATE = os.environ.get("WINDOW_STATE", "./state/window")
REC = os.path.join(STATE, "window-schemes.json")
OPEN = os.path.join(STATE, "WINDOW-OPEN")
SILENT_NAME = os.environ.get("SILENT_NAME", "Migration - silent (load only)")
AW_KEY = "user.autowatch.disabled"


# ---------------------------------------------------------------------------------------------------- helpers
def scheme_of(site, key):
    """Current notification scheme id of a project as a string, or 'none' (404 = the project has no scheme)."""
    try:
        return str(site.get(f"/rest/api/3/project/{key}/notificationscheme")["id"])
    except ApiError as e:
        if e.status == 404:
            return "none"
        raise


def recipients(site, scheme_id):
    s = site.get(f"/rest/api/3/notificationscheme/{scheme_id}?expand=all")
    return s.get("name"), sum(len(ev.get("notifications", [])) for ev in s.get("notificationSchemeEvents", []))


def assign(site, key, scheme_id):
    site.put(f"/rest/api/3/project/{key}", {"notificationScheme": int(scheme_id)})


def wait_for(site, key, want, secs):
    t0 = time.time()
    while True:
        if scheme_of(site, key) == str(want):
            return True
        if time.time() - t0 > secs:
            return False
        time.sleep(5)


def get_autowatch(site):
    try:
        v = site.get(f"/rest/api/3/mypreferences?key={AW_KEY}")
        return str(v).strip().strip('"').lower() if v is not None else None
    except ApiError as e:
        if e.status == 404:
            return None
        raise


def set_autowatch(site, value):
    """value: 'true' | 'false' | None (None = delete the preference = product default)."""
    if value is None:
        site.delete(f"/rest/api/3/mypreferences?key={AW_KEY}")
        return
    # BARE literal. json.dumps("true") would send "\"true\"" and Jira would store false.
    site.request("PUT", f"/rest/api/3/mypreferences?key={AW_KEY}", raw=value.encode(),
                 headers={"Content-Type": "application/json"})


def writers():
    return {p: site_from_env(p) for p in os.environ.get("WRITER_PREFIXES", "TGT").split(",") if p.strip()}


def load_rec():
    return json.load(open(REC)) if os.path.exists(REC) else None


# ------------------------------------------------------------------------------------------- writer-side API
@contextlib.contextmanager
def hold(name):
    """Tell 'restore' to wait while this writer runs."""
    os.makedirs(STATE, exist_ok=True)
    p = os.path.join(STATE, f"HOLD-WINDOW-{name}")
    open(p, "w").write(f"{os.getpid()} {time.strftime('%Y-%m-%d %H:%M:%S')}\n")
    try:
        yield
    finally:
        with contextlib.suppress(FileNotFoundError):
            os.remove(p)


@contextlib.contextmanager
def project_lock(key, poll=10, timeout=3600):
    """Atomic per-project lock across processes and languages (mkdir succeeds for exactly one caller)."""
    os.makedirs(STATE, exist_ok=True)
    d = os.path.join(STATE, f"lock-{key}.d")
    t0 = time.time()
    while True:
        try:
            os.mkdir(d)
            break
        except FileExistsError:
            if time.time() - t0 > timeout:
                raise SystemExit(f"lock {d} held for > {timeout}s - investigate (stale lock?)")
            time.sleep(poll)
    try:
        open(os.path.join(d, "owner"), "w").write(f"{os.getpid()}\n")
        yield
    finally:
        with contextlib.suppress(FileNotFoundError):
            os.remove(os.path.join(d, "owner"))
        with contextlib.suppress(OSError):
            os.rmdir(d)


_last = {}


def require_silent(site, key, silent_id, cache_s=120):
    """Raise unless the project reads back on the silent scheme (cached for cache_s seconds)."""
    now = time.time()
    if key in _last and now - _last[key] < cache_s:
        return
    cur = scheme_of(site, key)
    if cur != str(silent_id):
        raise SystemExit(f"NOT SILENT: {key} is on scheme {cur}, expected {silent_id} - refusing to write")
    _last[key] = now


# --------------------------------------------------------------------------------------------------- modes
def create_scheme(tgt):
    found = [s for s in tgt.get("/rest/api/3/notificationscheme?maxResults=200").get("values", [])
             if s.get("name") == SILENT_NAME]
    if found:
        sid = found[0]["id"]
    else:
        sid = tgt.post("/rest/api/3/notificationscheme",
                       {"name": SILENT_NAME, "description": "Empty: no notifications while migrated content is loaded."})["id"]
    name, n = recipients(tgt, sid)
    print(f"silent scheme {sid} '{name}' recipients={n}")
    if n:
        sys.exit(f"REFUSED: scheme {sid} has {n} recipients")
    return str(sid)


def enter(tgt, projects, silent_id, wait_s):
    os.makedirs(STATE, exist_ok=True)
    name, n = recipients(tgt, silent_id)
    if n:
        sys.exit(f"REFUSED: scheme {silent_id} '{name}' has {n} recipients - not silent")
    print(f"scheme {silent_id} '{name}' proven empty")
    rec = load_rec() or {"at": time.strftime("%Y-%m-%d %H:%M:%S"), "silent_id": str(silent_id),
                         "projects": {}, "autowatch": {}}
    skipped = []
    for k in projects:
        proj = tgt.get(f"/rest/api/3/project/{k}")
        if proj.get("style") == "next-gen":
            skipped.append(k)
            print(f"{k}: team-managed - its scheme cannot be reassigned over REST; SKIPPED (check its recipients)")
            continue
        if k not in rec["projects"]:                       # recorded ONCE: a second enter keeps the true before-state
            rec["projects"][k] = scheme_of(tgt, k)
            json.dump(rec, open(REC, "w"), indent=1)       # saved per project - a crash must not lose originals
        if scheme_of(tgt, k) != str(silent_id):
            assign(tgt, k, silent_id)
    bad = [k for k in projects if k not in skipped and not wait_for(tgt, k, silent_id, wait_s)]
    for prefix, site in writers().items():
        if prefix not in rec["autowatch"]:
            rec["autowatch"][prefix] = get_autowatch(site)
            json.dump(rec, open(REC, "w"), indent=1)
        set_autowatch(site, "true")
        print(f"autowatch.disabled [{prefix}] -> {get_autowatch(site)}")
    for k in projects:
        print(f"{k:12} recorded {rec['projects'].get(k, '-'):>8} -> now {scheme_of(tgt, k)}")
    if bad:
        print("NOT SILENT:", bad)
        sys.exit(1)
    open(OPEN, "w").write(json.dumps({"at": time.strftime("%Y-%m-%d %H:%M:%S"), "silent_id": str(silent_id)}) + "\n")
    print("ALL SILENT - WINDOW-OPEN written", "| skipped (team-managed):" if skipped else "", *skipped)


def restore(tgt, wait_s, hold_poll=30):
    rec = load_rec()
    if not rec:
        sys.exit("no record - nothing to restore")
    while True:
        holds = glob.glob(os.path.join(STATE, "HOLD-WINDOW-*")) + glob.glob(os.path.join(STATE, "lock-*.d"))
        if not holds:
            break
        print(time.strftime("%H:%M:%S"), "restore waiting for:", [os.path.basename(h) for h in holds])
        time.sleep(hold_poll)
    with contextlib.suppress(FileNotFoundError):
        os.remove(OPEN)                                    # new writers refuse from here on
    for k, v in rec["projects"].items():
        if v == "none":
            print(f"{k}: had NO scheme before - left on the silent scheme; assign its real scheme deliberately")
            continue
        if scheme_of(tgt, k) != v:
            assign(tgt, k, v)
    bad = [k for k, v in rec["projects"].items() if v != "none" and not wait_for(tgt, k, v, wait_s)]
    for prefix, site in writers().items():
        if prefix in rec["autowatch"]:
            set_autowatch(site, rec["autowatch"][prefix])
            print(f"autowatch.disabled [{prefix}] restored -> {get_autowatch(site)}")
    for k, v in rec["projects"].items():
        print(f"{k:12} recorded {v:>8} now {scheme_of(tgt, k)}")
    if bad:
        print("NOT RESTORED:", bad)
        sys.exit(1)
    print("ALL RESTORED = recorded before-state")


def main():
    a = sys.argv[1:]
    if not a:
        sys.exit(__doc__)
    mode = a[0]

    def opt(n, d=None):
        return a[a.index(n) + 1] if n in a else d
    tgt = site_from_env("TGT")
    wait_s = int(opt("--wait", "240"))
    if mode == "create-scheme":
        create_scheme(tgt)
    elif mode == "enter":
        projects = [p for p in (opt("--projects") or "").split(",") if p]
        if not projects:
            sys.exit("--projects A,B required")
        sid = opt("--silent-id") or create_scheme(tgt)
        enter(tgt, projects, sid, wait_s)
    elif mode == "restore":
        restore(tgt, wait_s)
    elif mode == "status":
        rec = load_rec() or {"projects": {}}
        for k, v in rec["projects"].items():
            print(f"{k:12} recorded {v:>8} now {scheme_of(tgt, k)}")
        print("WINDOW-OPEN" if os.path.exists(OPEN) else "window closed",
              [os.path.basename(h) for h in glob.glob(os.path.join(STATE, "HOLD-WINDOW-*"))])
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
