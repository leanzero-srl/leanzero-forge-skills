#!/usr/bin/env python3
"""
silent_window.py — keep Jira projects SILENT (no notification e-mails) while a migration writes to them,
and put them back exactly as they were. Read-back at every step; the before-state is recorded ONCE.

Modes
  create-scheme                          find-or-create the empty scheme named $SILENT_NAME, print its id
  enter   --projects A,B [--silent-id N] [--stop HH:MM]
                                         record each project's current scheme (only if no record exists yet),
                                         prove the silent scheme has ZERO recipients, assign it, read back (wait up to
                                         --wait s per project), disable autowatch for every writer account, write
                                         <state>/WINDOW-OPEN (with the silent id, the project list and the hard stop
                                         time, local clock). Exit 1 if any project does not read back silent.
  restore                                FIRST remove WINDOW-OPEN (new writers refuse from here on), THEN wait until no
                                         HOLD-WINDOW-* file and no lock-*.d dir exists, PUT every project back to its
                                         recorded scheme, read back, restore autowatch, print "recorded -> now" per
                                         project. Exit 1 if anything differs. On a clean restore the record is archived
                                         (window-schemes.restored-<time>.json) so a later migration records afresh.
  status                                 print each recorded project's current scheme

Library use inside a WRITER (another script) - ordered_create.py, link_copy.py and parent_or_link.py do this:
    from silent_window import hold, project_lock, require_silent
    with hold("links"):                       # creates HOLD-WINDOW-links FIRST, then checks WINDOW-OPEN + stop time;
                                              # refuses (and removes its hold) if the window is closed
        with project_lock("PROJ"):            # atomic mkdir; two writers never toggle the same project
            require_silent(tgt, "PROJ")       # before EVERY write: window still open, before the hard stop, and the
                                              # project reads back on the window's silent scheme (cached <= 120 s)
            tgt.put("/rest/api/3/issue/PROJ-1?notifyUsers=false", {...})
Why the order: a writer that checked the window BEFORE creating its hold could be overtaken by a restore that saw no
holds; restore removes WINDOW-OPEN before it looks for holds, and a writer creates its hold before it looks for
WINDOW-OPEN, so one of the two always sees the other.
Opt-out for a deliberately different silence mechanism (e.g. per-project lock + swap): SILENT_GATE=off - logged loudly.

Env
  TGT_BASE, TGT_EMAIL, TGT_TOKEN       the target site + admin account (writes)
  WRITER_PREFIXES=TGT,TGT2             env prefixes of EVERY account that writes (autowatch is per user)
  SILENT_NAME="Migration - silent (load only)"
  WINDOW_STATE=./state/window          where the record, WINDOW-OPEN, HOLD and lock files live (every writer must use
                                       the SAME directory)
  SILENT_GATE=off                      writers skip the window/scheme gate (only with another proven silence method)

Why each step exists (field-proven):
  * Scheme writes have been observed to apply very LATE -> read back with a wait, never trust the PUT.
  * Queued writes later created duplicate "silent" schemes and renamed a REAL scheme -> pin by id, prove it empty.
  * A crash before saving lost the originals -> the record is written per project, immediately, and never overwritten.
  * "No scheme" (404 - seen on JSM template desks AND on classic projects created over REST from a template) is not
    documented as silent -> it gets the silent scheme too, recorded as "none". PUT {"notificationScheme": null} is
    IGNORED, so "none" can never be restored: restore leaves those projects silent and exits 3 - decide their scheme.
  * Team-managed projects cannot be reassigned (HTTP 400) -> skipped and listed; make sure their recipients are you.
  * Autowatch: the preference body must be the BARE JSON literal true; a quoted "true" silently stores false.
Python 3.8+, stdlib only; needs atl_http.py next to it.
"""
import contextlib
import datetime
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
    if not os.path.exists(REC):
        return None
    with open(REC) as fh:
        return json.load(fh)


# ------------------------------------------------------------------------------------------- writer-side API
def gate_off():
    if os.environ.get("SILENT_GATE", "").lower() == "off":
        print("WARNING: SILENT_GATE=off - writing WITHOUT the silent-window gate", file=sys.stderr, flush=True)
        return True
    return False


def window():
    """The WINDOW-OPEN record ({"silent_id", "projects", "stop"}) or None when the window is closed."""
    try:
        with open(OPEN) as fh:
            return json.load(fh)
    except FileNotFoundError:
        return None
    except ValueError:
        raise SystemExit(f"{OPEN} is not valid JSON - refusing to write")


def check_window():
    """Raise unless WINDOW-OPEN exists and its hard stop time has not passed. Returns the window record."""
    w = window()
    if not w:
        raise SystemExit(f"WINDOW CLOSED: no {OPEN} - refusing to write (run `silent_window.py enter` first)")
    if w.get("stop") and datetime.datetime.now() >= datetime.datetime.fromisoformat(w["stop"]):
        raise SystemExit(f"HARD STOP {w['stop']} passed - refusing to write")
    return w


@contextlib.contextmanager
def hold(name, check=True):
    """Tell 'restore' to wait while this writer runs. The hold file is created BEFORE the window is checked."""
    os.makedirs(STATE, exist_ok=True)
    p = os.path.join(STATE, f"HOLD-WINDOW-{name}")
    with open(p, "w") as fh:
        fh.write(f"{os.getpid()} {time.strftime('%Y-%m-%d %H:%M:%S')}\n")
    try:
        if check and not gate_off():
            check_window()
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


def require_silent(site, key, silent_id=None, cache_s=120):
    """Call before EVERY write. Raise unless the window is open, the hard stop has not passed (both re-checked on every
    call - a file stat) and the project reads back on the silent scheme (the scheme read is cached for cache_s)."""
    if gate_off():
        return
    w = check_window()
    sid = str(silent_id or w.get("silent_id"))
    now = time.time()
    if key in _last and _last[key][1] == sid and now - _last[key][0] < cache_s:
        return
    cur = scheme_of(site, key)
    if cur != sid:
        raise SystemExit(f"NOT SILENT: {key} is on scheme {cur}, expected {sid} - refusing to write")
    _last[key] = (now, sid)


# --------------------------------------------------------------------------------------------------- modes
def all_schemes(tgt):
    """Every notification scheme, paged (the endpoint defaults to 50 per page; an unpaged lookup missed the silent
    scheme on a big site and would have created a duplicate)."""
    out, start = [], 0
    while True:
        d = tgt.get(f"/rest/api/3/notificationscheme?startAt={start}&maxResults=50")
        vals = d.get("values", [])
        out += vals
        if d.get("isLast", True) or not vals:
            return out
        start += len(vals)


def create_scheme(tgt):
    found = [s for s in all_schemes(tgt) if s.get("name") == SILENT_NAME]
    if len(found) > 1:
        sys.exit(f"REFUSED: {len(found)} schemes named '{SILENT_NAME}' ({[s['id'] for s in found]}) - pin one with "
                 f"--silent-id and delete your duplicates")
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


def stop_time(hhmm):
    """'HH:MM' local -> ISO local datetime of its next occurrence (None if not given)."""
    if not hhmm:
        return None
    h, m = (int(x) for x in hhmm.split(":"))
    now = datetime.datetime.now()
    at = now.replace(hour=h, minute=m, second=0, microsecond=0)
    if at <= now:
        at += datetime.timedelta(days=1)
    return at.isoformat(timespec="minutes")


def enter(tgt, projects, silent_id, wait_s, stop=None):
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
    open(OPEN, "w").write(json.dumps({"at": time.strftime("%Y-%m-%d %H:%M:%S"), "silent_id": str(silent_id),
                                      "projects": sorted(set(projects) - set(skipped)), "stop": stop}) + "\n")
    print("ALL SILENT - WINDOW-OPEN written", f"(hard stop {stop})" if stop else "(no hard stop)",
          "| skipped (team-managed):" if skipped else "", *skipped)


def restore(tgt, wait_s, hold_poll=30):
    rec = load_rec()
    if not rec:
        sys.exit("no record - nothing to restore")
    # close the window FIRST: a writer creates its hold before it checks WINDOW-OPEN, so after this line every new
    # writer refuses, and every writer that got past its check already has a hold file that we wait for below
    with contextlib.suppress(FileNotFoundError):
        os.remove(OPEN)
    while True:
        holds = glob.glob(os.path.join(STATE, "HOLD-WINDOW-*")) + glob.glob(os.path.join(STATE, "lock-*.d"))
        if not holds:
            break
        print(time.strftime("%H:%M:%S"), "window CLOSED, restore waiting for:", [os.path.basename(h) for h in holds])
        time.sleep(hold_poll)
    left_silent = []
    for k, v in rec["projects"].items():
        if v == "none":
            # PUT {"notificationScheme": null} is IGNORED (verified): a project cannot be put back to "no scheme".
            left_silent.append(k)
            print(f"{k}: had NO scheme before - cannot be restored to 'none' over REST; left SILENT. "
                  f"Assign the scheme agreed with the owner deliberately.")
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
    if left_silent:
        print(f"RESTORED except {left_silent}: they had no scheme and stay on the silent scheme (decide their scheme)")
        sys.exit(3)
    done = REC.replace(".json", f".restored-{time.strftime('%Y%m%d-%H%M%S')}.json")
    os.rename(REC, done)                                   # a LATER migration must record its own before-state
    print(f"ALL RESTORED = recorded before-state (record archived to {os.path.basename(done)})")


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
        enter(tgt, projects, sid, wait_s, stop_time(opt("--stop")))
    elif mode == "restore":
        restore(tgt, wait_s)
    elif mode == "status":
        rec = load_rec() or {"projects": {}}
        for k, v in rec["projects"].items():
            print(f"{k:12} recorded {v:>8} now {scheme_of(tgt, k)}")
        print(f"WINDOW-OPEN {window()}" if os.path.exists(OPEN) else "window closed",
              [os.path.basename(h) for h in glob.glob(os.path.join(STATE, "HOLD-WINDOW-*"))])
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
