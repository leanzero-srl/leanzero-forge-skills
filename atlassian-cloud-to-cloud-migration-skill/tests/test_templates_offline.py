#!/usr/bin/env python3
"""
Offline regression tests for the templates (no network). Each test pins a defect class found by review:
the silent-window gate, ordered_create resume/markers/403/upward probe/description, link_copy probe safety and
completeness, parent_or_link 400 discrimination, attachment_verdicts held-wins ordering and exact eye-clear,
atl_http retry budgets and read-only source.

    python3 tests/test_templates_offline.py -v        (Python 3.8+, stdlib only)
"""
import base64
import datetime
import hashlib
import io
import json
import os
import shutil
import sys
import tempfile
import threading
import time
import unittest
from contextlib import redirect_stdout
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
TMP = tempfile.mkdtemp(prefix="c2c-tests-")
os.environ["WINDOW_STATE"] = os.path.join(TMP, "window")
os.environ["STATE_DIR"] = os.path.join(TMP, "state")
os.environ.pop("SILENT_GATE", None)
sys.path.insert(0, os.path.join(HERE, "..", "templates"))
sys.path.insert(0, HERE)

import atl_http  # noqa: E402
import attachment_verdicts as av  # noqa: E402
import link_copy as lc  # noqa: E402
import ordered_create as oc  # noqa: E402
import parent_or_link as pol  # noqa: E402
import silent_window as sw  # noqa: E402
from fake_jira import FakeJira  # noqa: E402

SILENT = "777"


def reset_dirs():
    for d in (os.environ["WINDOW_STATE"], os.environ["STATE_DIR"]):
        shutil.rmtree(d, ignore_errors=True)
        os.makedirs(d)
    sw._last.clear()


def open_window(projects, stop=None):
    with open(sw.OPEN, "w") as fh:
        json.dump({"silent_id": SILENT, "projects": projects, "stop": stop}, fh)


def quiet(fn, *a, **kw):
    buf = io.StringIO()
    with redirect_stdout(buf):
        r = fn(*a, **kw)
    return r, buf.getvalue()


# ----------------------------------------------------------------------------------------------------- silent window
class SilentWindowGate(unittest.TestCase):
    def setUp(self):
        reset_dirs()
        self.tgt = FakeJira()
        self.tgt.scheme["TK"] = SILENT

    def test_hold_refuses_when_window_closed_and_removes_its_hold(self):
        with self.assertRaises(SystemExit) as c:
            with sw.hold("w1"):
                self.fail("must not enter")
        self.assertIn("WINDOW CLOSED", str(c.exception))
        self.assertEqual([f for f in os.listdir(sw.STATE) if f.startswith("HOLD")], [])

    def test_require_silent_checks_window_every_call_and_scheme(self):
        open_window(["TK"])
        sw.require_silent(self.tgt, "TK")                       # ok
        os.remove(sw.OPEN)
        with self.assertRaises(SystemExit):                     # cached scheme read must NOT bypass the window check
            sw.require_silent(self.tgt, "TK")
        open_window(["TK"])
        self.tgt.scheme["TK"] = "1"
        sw._last.clear()
        with self.assertRaises(SystemExit) as c:
            sw.require_silent(self.tgt, "TK")
        self.assertIn("NOT SILENT", str(c.exception))

    def test_hard_stop(self):
        past = (datetime.datetime.now() - datetime.timedelta(minutes=1)).isoformat(timespec="minutes")
        open_window(["TK"], stop=past)
        with self.assertRaises(SystemExit) as c:
            sw.require_silent(self.tgt, "TK")
        self.assertIn("HARD STOP", str(c.exception))

    def test_restore_closes_window_before_waiting_so_late_writers_refuse(self):
        open_window(["TK"])
        with open(sw.REC, "w") as fh:
            json.dump({"projects": {"TK": "1"}, "autowatch": {}, "silent_id": SILENT}, fh)
        sw.writers = lambda: {}
        early = os.path.join(sw.STATE, "HOLD-WINDOW-early")
        with open(early, "w") as fh:
            fh.write("x")                             # a writer already inside the window
        t = threading.Thread(target=lambda: quiet(sw.restore, self.tgt, 1, hold_poll=0.05))
        t.start()
        time.sleep(0.3)
        self.assertFalse(os.path.exists(sw.OPEN), "window must be closed while restore waits")
        self.assertEqual(self.tgt.scheme["TK"], SILENT, "restore must wait for the existing hold")
        with self.assertRaises(SystemExit):                     # a NEW writer arriving now refuses
            with sw.hold("late"):
                pass
        os.remove(early)
        t.join(5)
        self.assertEqual(self.tgt.scheme["TK"], "1")
        self.assertFalse(os.path.exists(sw.REC), "record archived after a clean restore")

    def test_scheme_lookup_pages(self):
        self.tgt.schemes = [{"id": i, "name": f"S{i}"} for i in range(1, 120)] + [{"id": 500, "name": sw.SILENT_NAME}]
        sid, _ = quiet(sw.create_scheme, self.tgt)
        self.assertEqual(sid, "500")
        self.assertEqual(len(self.tgt.schemes), 120, "must not create a duplicate silent scheme")


# ----------------------------------------------------------------------------------------------------- ordered_create
class OrderedCreate(unittest.TestCase):
    def setUp(self):
        reset_dirs()
        self.src, self.tgt = FakeJira(), FakeJira()
        self.src.read_only = True
        self.tgt.scheme["TK"] = SILENT
        oc.site_from_env = lambda p: self.src if p == "SRC" else self.tgt
        oc.WRITE_KEY.update(tk=None, tgt=None)
        open_window(["TK"])

    def run_oc(self, *args):
        sys.argv = ["ordered_create.py", *args]
        return quiet(oc.main)[1]

    def test_upward_probe_finds_hidden_tail_item(self):
        for n in (1, 2, 3):
            self.src.add(f"SK-{n}")
        self.src.add("SK-6", search=False)                      # above the JQL max, invisible to JQL
        byn, hidden = oc.source_items(self.src, "SK", ["summary"], tail_probe=5)
        self.assertIn(6, byn)
        self.assertEqual(hidden, ["SK-6"])

    def test_403_on_gap_probe_aborts(self):
        self.src.add("SK-1")
        self.src.add("SK-3")
        self.src.forbidden.add("SK-2")
        with self.assertRaises(SystemExit) as c:
            oc.source_items(self.src, "SK", ["summary"], tail_probe=2)
        self.assertIn("ABORT", str(c.exception))

    def test_source_label_that_looks_like_a_marker_is_not_copied(self):
        self.src.add("SK-1", labels=["src-legacy", "keep", "fill-3"])
        out = self.run_oc("run", "SK", "TK")
        labels = self.tgt.issues["TK-1"]["fields"]["labels"]
        self.assertEqual(sorted(labels), ["keep", "migrated", "src-SK-1"], out)
        m, dup = oc.target_map(self.tgt, "TK") if not self.tgt.reindex() else (None, None)
        self.assertEqual((m, dup), ({"SK-1": "TK-1"}, []))

    def test_resume_adopts_unindexed_item_instead_of_recreating(self):
        for n in (1, 2, 3, 4):
            self.src.add(f"SK-{n}")
        self.run_oc("run", "SK", "TK", "--limit", "2")          # creates TK-1, TK-2
        self.tgt.reindex()                                      # TK-1, TK-2 now searchable (JQL-recovered on resume)
        # crash simulation: TK-3 was created but its map-log line was never written and the index has not caught up
        self.tgt.post("/rest/api/3/issue", {"fields": {"project": {"key": "TK"}, "issuetype": {"id": "1"},
                                                       "summary": "s", "labels": ["migrated", "src-SK-3"]}})
        open(os.path.join(oc.STATE, "maplog-SK-TK.log"), "w").write("SK-1 TK-1\n")    # truncated log
        out = self.run_oc("run", "SK", "TK")
        self.assertNotIn("NUMBER DRIFT", out)
        self.assertEqual(sorted(self.tgt.issues), ["TK-1", "TK-2", "TK-3", "TK-4"], out)
        self.assertIn("adopted by GET walk", out)
        log = open(os.path.join(oc.STATE, "maplog-SK-TK.log")).read()
        for pair in ("SK-1 TK-1", "SK-2 TK-2", "SK-3 TK-3", "SK-4 TK-4"):   # the log must hold EVERY pair
            self.assertIn(pair, log)

    def test_lost_create_recovered_without_drift(self):
        self.src.add("SK-1")
        self.src.add("SK-2")
        self.tgt.lose_next_create = 1
        with mock.patch.object(oc.time, "sleep", lambda s: None):
            out = self.run_oc("run", "SK", "TK")
        self.assertIn("RECOVERED lost create TK-1", out)
        self.assertEqual(sorted(self.tgt.issues), ["TK-1", "TK-2"])

    def test_gap_filler_and_number_held(self):
        self.src.add("SK-1")
        self.src.add("SK-3")
        out = self.run_oc("run", "SK", "TK")
        self.assertEqual(sorted(self.tgt.issues), ["TK-1", "TK-3"], out)

    def test_description_omitted_on_create_then_put(self):
        self.src.add("SK-1")
        self.tgt.create_screen_has_description = False
        out = self.run_oc("run", "SK", "TK")
        self.assertIn("TK-1", self.tgt.issues, out)
        posts = [c for c in self.tgt.calls if c[0] == "POST" and c[1] == "/rest/api/3/issue"]
        self.assertNotIn('"description"', posts[0][2])
        puts = [c for c in self.tgt.calls if c[0] == "PUT" and c[1].startswith("/rest/api/3/issue/TK-1")]
        self.assertTrue(puts and '"description"' in puts[0][2])

    def test_refuses_without_open_window(self):
        os.remove(sw.OPEN)
        self.src.add("SK-1")
        with self.assertRaises(SystemExit):
            self.run_oc("run", "SK", "TK")
        self.assertEqual(self.tgt.issues, {})

    def test_cross_project_parent_is_logged_not_dropped(self):
        self.src.add("SK-1", parent="OTHER-5")
        out = self.run_oc("run", "SK", "TK")
        self.assertIn("UNRESOLVED PARENTS 1", out)
        self.assertEqual(open(os.path.join(oc.STATE, "unresolved-parents-SK-TK.log")).read(), "SK-1 OTHER-5\n")
        self.src.issues["SK-1"]["fields"]["parent"] = None                # resolved later: the file must not go stale
        self.run_oc("run", "SK", "TK")
        self.assertEqual(open(os.path.join(oc.STATE, "unresolved-parents-SK-TK.log")).read(), "")

    def test_filler_type_is_level0_task_not_epic(self):
        self.tgt.types = [{"id": "2", "name": "Epic", "subtask": False, "hierarchyLevel": 1},
                          {"id": "1", "name": "Task", "subtask": False, "hierarchyLevel": 0},
                          {"id": "3", "name": "Sub-task", "subtask": True, "hierarchyLevel": -1}]
        self.assertEqual(oc.standard_type({"Epic": "2", "Task": "1", "Sub-task": "3"}, {"Sub-task"},
                                          {"Epic": 1, "Task": 0, "Sub-task": -1}, "Story"), "Task")


# ----------------------------------------------------------------------------------------------------- link_copy
class LinkCopy(unittest.TestCase):
    def setUp(self):
        reset_dirs()
        self.tgt = FakeJira()
        self.tgt.scheme["TK"] = SILENT
        for n in (1, 2, 3):
            self.tgt.add(f"TK-{n}")
        open_window(["TK"])

    def test_probe_refuses_existing_link_and_keeps_it(self):
        self.tgt.links["55"] = ("TK-2", "Blocks", "TK-1")      # a REAL link between the two
        with self.assertRaises(SystemExit) as c:
            lc.probe(self.tgt, "TK-1", "TK-2", "Blocks")
        self.assertIn("REFUSED", str(c.exception))
        self.assertIn("55", self.tgt.links)

    def test_probe_records_direction_and_deletes_only_its_link(self):
        self.tgt.links["55"] = ("TK-1", "Relates", "TK-3")     # unrelated link must survive
        quiet(lc.probe, self.tgt, "TK-1", "TK-2", "Blocks")
        rec = json.load(open(lc.PROBE))
        self.assertTrue(rec["Blocks"]["inwardIssue_param_holds_outward"])
        self.assertNotIn("_default", rec)
        self.assertEqual(list(self.tgt.links), ["55"])

    def test_probe_inconclusive_still_deletes_probe_link(self):
        orig = lc.triples
        lc.triples = lambda key, links: {} if key == "TK-2" else orig(key, links)   # B never shows it
        try:
            with self.assertRaises(SystemExit):
                quiet(lc.probe, self.tgt, "TK-1", "TK-2", "Blocks")
        finally:
            lc.triples = orig
        self.assertEqual(self.tgt.links, {})

    def test_bulkfetch_missing_key_is_fatal(self):
        with self.assertRaises(SystemExit):
            lc.bulk_links(self.tgt, ["TK-1", "TK-99"])

    def test_delete_404_is_done(self):
        self.assertEqual(lc.delete_link(self.tgt, "999", "TK-1"), "already-gone")

    def test_apply_needs_probe_per_type(self):
        src = FakeJira()
        src.read_only = True
        for n in (1, 2):
            src.add(f"SK-{n}")
        src.links["7"] = ("SK-1", "Blocks", "SK-2")
        with open(lc.PROBE, "w") as fh:
            json.dump({"Relates": {"inwardIssue_param_holds_outward": True}}, fh)
        mp = {"SK-1": "TK-1", "SK-2": "TK-2"}
        with self.assertRaises(SystemExit) as c:
            quiet(lc.apply, src, self.tgt, mp, "Relates", 10, None, False)
        self.assertIn("no probe", str(c.exception))
        quiet(lc.apply, src, self.tgt, mp, "Relates", 10, "Relates", False)    # explicit reuse
        self.assertIn(("TK-1", "Blocks", "TK-2"), self.tgt.links.values())

    def test_inverted_unattributed_link_is_kept(self):
        src = FakeJira()
        src.read_only = True
        for n in (1, 2):
            src.add(f"SK-{n}")
        src.links["7"] = ("SK-1", "Blocks", "SK-2")
        self.tgt.links["300"] = ("TK-2", "Blocks", "TK-1")      # inverted, created by a PERSON (no changelog by us)
        with open(lc.PROBE, "w") as fh:
            json.dump({"Blocks": {"inwardIssue_param_holds_outward": True}}, fh)
        _, out = quiet(lc.apply, src, self.tgt, {"SK-1": "TK-1", "SK-2": "TK-2"}, "Relates", 10, None, False)
        self.assertIn("300", self.tgt.links)
        self.assertIn("NOT attributable", out)

    def test_inverted_by_a_person_after_our_correct_link_is_kept(self):
        src = FakeJira()
        src.read_only = True
        for n in (1, 2):
            src.add(f"SK-{n}")
        src.links["7"] = ("SK-1", "Blocks", "SK-2")
        quiet(lc.probe, self.tgt, "TK-1", "TK-3", "Blocks")
        self.tgt.post("/rest/api/3/issueLink", {"type": {"name": "Blocks"}, "inwardIssue": {"key": "TK-1"},
                                                 "outwardIssue": {"key": "TK-2"}})            # OUR correct link
        lid = next(k for k, v in self.tgt.links.items() if v == ("TK-1", "Blocks", "TK-2"))
        del self.tgt.links[lid]                                                             # later removed
        self.tgt.me = "acc-person"                                                          # a PERSON inverts it
        self.tgt.post("/rest/api/3/issueLink", {"type": {"name": "Blocks"}, "inwardIssue": {"key": "TK-2"},
                                                 "outwardIssue": {"key": "TK-1"}})
        self.tgt.me = "acc-me"
        _, out = quiet(lc.apply, src, self.tgt, {"SK-1": "TK-1", "SK-2": "TK-2"}, "Relates", 10, None, False)
        self.assertIn(("TK-2", "Blocks", "TK-1"), self.tgt.links.values())
        self.assertIn("NOT attributable", out)

    def test_symmetric_inversion_not_churned(self):
        src = FakeJira()
        src.read_only = True
        for n in (1, 2):
            src.add(f"SK-{n}")
        src.links["7"] = ("SK-1", "Relates", "SK-2")
        self.tgt.links["301"] = ("TK-2", "Relates", "TK-1")
        res, _ = quiet(lc.plan, src, self.tgt, {"SK-1": "TK-1", "SK-2": "TK-2"}, "Relates")
        self.assertEqual(len(res["inverted"]), 0)
        self.assertEqual(len(res["inverted-symmetric"]), 1)


# ----------------------------------------------------------------------------------------------------- parent_or_link
class ParentOrLink(unittest.TestCase):
    def setUp(self):
        reset_dirs()
        self.src, self.tgt = FakeJira(), FakeJira()
        self.src.read_only = True
        self.tgt.scheme["TK"] = SILENT
        pol.site_from_env = lambda p: self.src if p == "SRC" else self.tgt
        open_window(["TK"])
        self.src.add("SK-1", itype="Epic")
        self.src.add("SK-2", parent="SK-1")
        self.src.add("SK-3", parent="SK-1")
        for n in (1, 2, 3):
            self.tgt.add(f"TK-{n}")
        with open(os.path.join(oc.STATE, "maplog-SK-TK.log"), "w") as fh:
            fh.write("SK-1 TK-1\nSK-2 TK-2\nSK-3 TK-3\n")
        with open(lc.PROBE, "w") as fh:
            json.dump({"Parent-Child": {"inwardIssue_param_holds_outward": True}}, fh)

    def test_only_a_parent_refusal_becomes_a_link(self):
        self.tgt.parent_refusal = {"TK-2", "TK-3"}
        self.tgt.other_400 = {"TK-3": {"customfield_10001": "Team is required."}}
        sys.argv = ["parent_or_link.py", "--maps", os.path.join(oc.STATE, "maplog-*.log"), "--apply"]
        _, out = quiet(pol.main)
        self.assertEqual(list(self.tgt.links.values()), [("TK-1", "Parent-Child", "TK-2")], out)
        self.assertIn("not a hierarchy refusal", out)

    def test_dry_run_leaves_no_hold(self):
        sys.argv = ["parent_or_link.py", "--maps", os.path.join(oc.STATE, "maplog-*.log")]
        os.remove(sw.OPEN)                                       # a dry run must work with the window closed
        _, out = quiet(pol.main)
        self.assertIn("DRY RUN", out)
        self.assertEqual([f for f in os.listdir(sw.STATE) if f.startswith("HOLD")], [])


# ----------------------------------------------------------------------------------------------------- verdicts
class AttachmentVerdicts(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.mkdtemp(dir=TMP)

    def w(self, name, recs, mtime=None):
        p = os.path.join(self.d, name)
        json.dump(recs, open(p, "w"))
        if mtime:
            os.utime(p, (mtime, mtime))
        return p

    def rec(self, st, **kw):
        r = {"kind": "conf", "space": "SP", "item": "100", "file": "a.png", "status": st}
        r.update(kw)
        return r

    def test_release_does_not_override_a_later_hold(self):
        self.w("attachments-conf-SP.json", [self.rec("HIT", scanned_at="2026-01-01T10:00:00Z")])
        self.w("band-conf-SP.json", [self.rec("HIT", scanned_at="2026-01-03T10:00:00Z")])    # AFTER the release
        self.w("x-RELEASE.json", [self.rec("clean", released=True, uploaded_sha256="ab",
                                           released_at="2026-01-02T10:00:00Z")])
        v = av.verdicts(os.path.join(self.d, "*.json"), os.path.join(self.d, "*-RELEASE*.json"))
        self.assertEqual(list(v.values())[0]["status"], "HIT")

    def test_release_overrides_earlier_holds(self):
        self.w("attachments-conf-SP.json", [self.rec("HIT", scanned_at="2026-01-01T10:00:00Z")])
        self.w("x-RELEASE.json", [self.rec("clean", released=True, uploaded_sha256="ab",
                                           released_at="2026-01-02T10:00:00Z")])
        v = av.verdicts(os.path.join(self.d, "*.json"), os.path.join(self.d, "*-RELEASE*.json"))
        self.assertEqual(list(v.values())[0]["status"], "clean")

    def test_eye_clear_is_exact_and_hit_only(self):
        self.w("attachments-conf-SP.json", [self.rec("SECRET")])
        self.w("band-conf-SP.json", [self.rec("HIT")])
        eye = os.path.join(self.d, "eye.txt")
        key = ["conf", "SP", "100", "a.png"]
        json.dump([{"key": key, "clears": "conf"}, {"key": key, "clears": "attachments-conf-SP.json"}], open(eye, "w"))
        v = av.verdicts(os.path.join(self.d, "*-SP.json"), None, eye)
        self.assertEqual(list(v.values())[0]["status"], "SECRET", "substring tag / SECRET must never clear, and the "
                                                                  "most severe hold class is kept for the report")
        json.dump([{"key": key, "clears": "band-conf-SP"}], open(eye, "w"))
        os.remove(os.path.join(self.d, "attachments-conf-SP.json"))
        v = av.verdicts(os.path.join(self.d, "*-SP.json"), None, eye)
        self.assertEqual(list(v.values())[0]["status"], "clean")

    def test_new_key_records_fold_onto_source_key_with_item_map(self):
        self.w("attachments-jira-P.json", [{"kind": "jira", "space": "P", "item": "P-1", "file": "f", "status": "clean"}])
        self.w("late-jira-P.json", [{"kind": "jira", "space": "P", "item": "Q-9", "file": "f", "status": "HIT"}])
        mp = os.path.join(self.d, "maplog-x.log")
        open(mp, "w").write("P-1 Q-9\n")
        v = av.verdicts(os.path.join(self.d, "*-P.json"), None, None, mp)
        self.assertEqual(v[("jira", "P", "P-1", "f")]["status"], "HIT")


# ----------------------------------------------------------------------------------------------------- atl_http
class AtlHttp(unittest.TestCase):
    def test_reset_header_with_and_without_seconds(self):
        for v in ("2030-01-01T10:00Z", "2030-01-01T10:00:00Z", "2030-01-01T10:00:00+00:00"):
            self.assertIsNotNone(atl_http._parse_reset(v), v)
        self.assertIsNone(atl_http._parse_reset("garbage"))

    def test_src_is_always_read_only(self):
        os.environ.update(SRC_BASE="https://a.example.net", SRC_EMAIL="e", SRC_TOKEN="t", READ_ONLY_SITES="")
        s = atl_http.site_from_env("SRC")
        with self.assertRaises(SystemExit):
            s.request("PUT", "/rest/api/3/issue/X-1", {})

    def test_incomplete_read_is_retried_for_get_and_429_budget_separate(self):
        import http.client
        import urllib.error
        import urllib.request
        seq = [urllib.error.HTTPError("u", 429, "x", {}, None)] * 9 + [http.client.IncompleteRead(b"")] + ["ok"]

        class R:
            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

            def read(self):
                return b'{"ok": 1}'

        def fake_open(req, timeout=0):
            x = seq.pop(0)
            if isinstance(x, BaseException):
                raise x
            return R()
        orig, osl = urllib.request.urlopen, atl_http.time.sleep
        urllib.request.urlopen, atl_http.time.sleep = fake_open, lambda s: None
        try:
            s = atl_http.Site("https://a.example.net", "e", "t", log=lambda *a: None)
            self.assertEqual(s.get("/x"), {"ok": 1})
        finally:
            urllib.request.urlopen, atl_http.time.sleep = orig, osl


class AttGate(unittest.TestCase):
    """templates/att_gate.py without OCR tools: the image OCR step is stubbed, everything else runs for real."""
    def setUp(self):
        import att_gate
        self.G = att_gate
        self.names = lambda t: [w for w in ("Jane Roe", "Roe, Jane") if w in t]
        self.ctx = {"names": self.names, "first_names": {"Jane", "Ola"}}

    def _zip(self, entries):
        import zipfile
        b = io.BytesIO()
        with zipfile.ZipFile(b, "w") as z:
            for n, d in entries:
                z.writestr(n, d)
        return b.getvalue()

    def test_no_list_lens_is_never_clean(self):
        self.assertEqual(self.G.gate("a.txt", b"hello", {})["status"], "HELD_UNREADABLE")

    def test_text_hit_and_clean(self):
        self.assertEqual(self.G.gate("a.txt", b"owner: Jane Roe", self.ctx)["status"], "HIT")
        self.assertEqual(self.G.gate("a.txt", b"nothing to see", self.ctx)["status"], "clean")

    def test_nested_archive_member_and_file_name(self):
        inner = self._zip([("notes/b.txt", b"by Jane Roe")])
        v = self.G.gate("outer.zip", self._zip([("inner.zip", inner)]), self.ctx)
        self.assertEqual(v["status"], "HIT")
        self.assertTrue(any("inner.zip!notes/b.txt" in f["where"] for f in v["findings"]))
        self.assertEqual(self.G.gate("for Jane Roe.txt", b"x", self.ctx)["status"], "HIT")

    def test_depth_limit_fails_closed(self):
        z = self._zip([("a.txt", b"hello")])
        for i in range(8):
            z = self._zip([(f"l{i}.zip", z)])
        self.assertEqual(self.G.gate("deep.zip", z, self.ctx)["status"], "HELD_UNREADABLE")

    def test_secrets(self):
        self.assertEqual(self.G.gate("t.zip", self._zip([("app/.env", b"X=1")]), self.ctx)["status"], "SECRET")
        marker = b'if (l.startsWith("-----BEGIN PRIVATE KEY-----")) parse();'
        self.assertNotEqual(self.G.gate("P.java", marker, self.ctx)["status"], "SECRET")
        key = b"-----BEGIN PRIVATE KEY-----\n" + b"\n".join(base64.b64encode(os.urandom(48)) for _ in range(5)) + b"\n-----END PRIVATE KEY-----"
        self.assertEqual(self.G.gate("k.txt", key, self.ctx)["status"], "SECRET")

    def test_media_and_random_blob_unreadable(self):
        self.assertEqual(self.G.gate("clip", b"\x00\x00\x00\x18ftypmp42" + os.urandom(100), self.ctx)["status"], "HELD_UNREADABLE")
        self.assertEqual(self.G.gate("blob.dat", os.urandom(100000), self.ctx)["status"], "HELD_UNREADABLE")

    def test_datauri_and_office_images_are_ocrd(self):
        with mock.patch.object(self.G, "_ocr", return_value="Signed in as Roe, Jane"):
            png = base64.b64encode(b"\x89PNG\r\n\x1a\nfake")
            v = self.G.gate("d.drawio", b'<mxfile><mxCell style="image=data:image/png;base64,' + png * 4 + b';"/></mxfile>', self.ctx)
            self.assertEqual(v["status"], "HIT")
            self.assertTrue(any("datauri" in f["where"] for f in v["findings"]))
            docx = self._zip([("word/document.xml", b"<w:t>Manual</w:t>"), ("word/media/image1.png", b"\x89PNG fake")])
            v = self.G.gate("m.docx", docx, self.ctx)
            self.assertEqual(v["status"], "HIT")
            self.assertTrue(any("word/media/image1.png" in f["where"] for f in v["findings"]))

    def test_ocr_failure_fails_closed(self):
        with mock.patch.object(self.G, "_ocr", side_effect=RuntimeError("tesseract not installed")):
            v = self.G.gate("shot.png", b"\x89PNG fake", self.ctx)
        self.assertEqual(v["status"], "HELD_UNREADABLE")

    def test_eml_attachment(self):
        from email.message import EmailMessage
        m = EmailMessage()
        m["Subject"] = "x"
        m.set_content("see attached")
        m.add_attachment(b"author: Jane Roe", maintype="text", subtype="plain", filename="n.txt")
        self.assertEqual(self.G.gate("m.eml", bytes(m), self.ctx)["status"], "HIT")

    def test_allowlist_data(self):
        d = tempfile.mkdtemp(dir=TMP)
        json.dump([{"token": "Jane Roe", "scope": "ocr", "reason": "test"}], open(os.path.join(d, "noise_tokens.json"), "w"))
        json.dump([{"phrase": "Jane Roe and contributors", "reason": "OSS credit"}], open(os.path.join(d, "oss_credits.json"), "w"))
        json.dump([{"regex": r"(^|[!/])BOOT-INF/lib/[^!/]+\.jar!", "reason": "dependency"}], open(os.path.join(d, "oss_paths.json"), "w"))
        ctx = dict(self.ctx, data_dir=d)
        self.assertEqual(self.G.gate("a.txt", b"Jane Roe", ctx)["status"], "HIT")          # scope ocr does not cover text
        self.assertEqual(self.G.gate("L.txt", b"(c) Jane Roe and contributors", ctx)["status"], "clean")
        jar = self._zip([("BOOT-INF/lib/dep.jar", self._zip([("META-INF/LICENSE", b"Copyright Jane Roe")]))])
        self.assertEqual(self.G.gate("app.jar", jar, ctx)["status"], "clean")
        self.assertEqual(self.G.gate("own.zip", self._zip([("LICENSE", b"Copyright Jane Roe")]), ctx)["status"], "HIT")
        b = b"plain"
        json.dump([{"sha256": hashlib.sha256(b).hexdigest(), "verdict": "hold", "reason": "t"}], open(os.path.join(d, "eye_verdicts.json"), "w"))
        self.assertEqual(self.G.gate("p.txt", b, ctx)["status"], "HIT")


class CheckUploadPaths(unittest.TestCase):
    def test_offender_gated_read(self):
        import check_upload_paths as C
        d = tempfile.mkdtemp(dir=TMP)
        up = 'r = call(f"/wiki/rest/api/content/{pid}/child/attachment", body, "PUT")\n'
        open(os.path.join(d, "a.py"), "w").write(up)
        open(os.path.join(d, "b.py"), "w").write("import att_gate\nif not att_gate.ok(fn, data): raise SystemExit\n" + up)
        open(os.path.join(d, "c.py"), "w").write('x = call(f"/wiki/rest/api/content/{pid}/child/attachment?limit=200")\n')
        open(os.path.join(d, "d.py"), "w").write('r = post(f"/rest/api/3/issue/{k}/attachments", data=b, method="POST")\n')
        with redirect_stdout(io.StringIO()) as out:
            rc = C.main([d, "--json"])
        res = json.loads(out.getvalue())
        self.assertEqual(rc, 1)
        self.assertEqual(sorted(res["offenders"]), ["a.py", "d.py"])
        self.assertEqual({r["file"]: r["status"] for r in res["rows"]}["b.py"], "GATED")


if __name__ == "__main__":
    try:
        unittest.main()
    finally:
        shutil.rmtree(TMP, ignore_errors=True)
