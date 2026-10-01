"""
fake_jira.py — a tiny in-memory stand-in for the Jira Cloud REST calls the templates make, for OFFLINE tests.

It models only what the templates rely on: issue numbering that never reuses a number, a search index that can MISS
items (search-hidden, index lag), 403/404 by key, labels, parents with a hierarchy refusal, issue links whose POST
maps inwardIssue -> holder of the OUTWARD wording (as observed live), duplicate-link POSTs that answer "created" and
do nothing, link changelog entries, bulkfetch that silently omits unknown keys, notification schemes per project.
Python 3.8+, stdlib only.
"""
import json
import re
import urllib.parse

from atl_http import ApiError


class FakeJira:
    def __init__(self, base="https://fake.example.net", me="acc-me"):
        self.base, self.me, self.read_only = base, me, False
        self.issues = {}               # key -> {"key", "fields": {...}}
        self.counter = {}              # project -> last number used
        self.hidden = set()            # keys JQL never returns (search-hidden)
        self.lagging = set()           # keys JQL does not return YET (index lag after create; reindex() clears)
        self.forbidden = set()         # keys that answer 403
        self.types = [{"id": "1", "name": "Task", "subtask": False, "hierarchyLevel": 0},
                      {"id": "2", "name": "Epic", "subtask": False, "hierarchyLevel": 1},
                      {"id": "3", "name": "Sub-task", "subtask": True, "hierarchyLevel": -1}]
        self.create_screen_has_description = True
        self.link_types = [{"id": "10", "name": "Blocks", "inward": "is blocked by", "outward": "blocks"},
                           {"id": "11", "name": "Relates", "inward": "relates to", "outward": "relates to"},
                           {"id": "12", "name": "Parent-Child", "inward": "is child of", "outward": "is parent of"}]
        self.links = {}                # id -> (holder_of_outward, type_name, other)
        self.changelog = {}            # key -> [history]
        self.next_link = 100
        self.scheme = {}               # project -> scheme id ("none" = 404)
        self.schemes = [{"id": 1, "name": "Default"}]
        self.parent_refusal = set()    # child keys whose parent PUT is refused with errors.parent
        self.other_400 = {}            # child key -> errors dict for a non-parent 400
        self.lose_next_create = 0      # N: the next N creates succeed but the response is "lost"
        self.calls = []

    # ---------------------------------------------------------------------------------------- helpers
    def add(self, key, labels=(), parent=None, itype="Task", summary="s", search=True, created="2020-01-01"):
        p, n = key.rsplit("-", 1)
        self.counter[p] = max(self.counter.get(p, 0), int(n))
        t = next(x for x in self.types if x["name"] == itype)
        self.issues[key] = {"key": key, "fields": {
            "summary": summary, "labels": list(labels), "issuetype": dict(t), "status": {"name": "Open"},
            "parent": {"key": parent} if parent else None, "created": created + "T00:00:00.000+0000",
            "resolutiondate": None, "duedate": None, "description": None, "project": {"key": p}}}
        if not search:
            self.hidden.add(key)
        return key

    def _issue(self, key):
        if key in self.forbidden:
            raise ApiError(403, "GET", key, '{"errorMessages":["no permission"]}')
        if key not in self.issues:
            raise ApiError(404, "GET", key, '{"errorMessages":["Issue does not exist"]}')
        return self.issues[key]

    def _issuelinks(self, key):
        out = []
        for lid, (h, t, o) in self.links.items():
            lt = next(x for x in self.link_types if x["name"] == t)
            typ = {"name": t, "inward": lt["inward"], "outward": lt["outward"]}
            if h == key:
                out.append({"id": lid, "type": typ, "outwardIssue": {"key": o}})
            if o == key:
                out.append({"id": lid, "type": typ, "inwardIssue": {"key": h}})
        return out

    def _view(self, key, fields=None):
        i = self._issue(key)
        f = dict(i["fields"])
        f["issuelinks"] = self._issuelinks(key)
        return {"key": key, "fields": f}

    # ---------------------------------------------------------------------------------------- HTTP surface
    def request(self, method, path, body=None, raw=None, headers=None, expect_json=True):
        return {"GET": self.get, "POST": self.post, "PUT": self.put, "DELETE": self.delete}[method.upper()](path, body)

    def get(self, path, body=None, **kw):
        self.calls.append(("GET", path))
        u = urllib.parse.urlparse(path)
        q = dict(urllib.parse.parse_qsl(u.query))
        p = u.path
        if p == "/rest/api/3/myself":
            return {"accountId": self.me}
        m = re.fullmatch(r"/rest/api/3/issue/([A-Z0-9_]+-\d+)", p)
        if m:
            return self._view(m.group(1))
        m = re.fullmatch(r"/rest/api/3/issue/([A-Z0-9_]+-\d+)/changelog", p)
        if m:
            self._issue(m.group(1))
            return {"values": self.changelog.get(m.group(1), []), "isLast": True}
        m = re.fullmatch(r"/rest/api/3/project/([A-Z0-9_]+)", p)
        if m:
            return {"key": m.group(1), "style": "classic", "issueTypes": self.types}
        m = re.fullmatch(r"/rest/api/3/project/([A-Z0-9_]+)/notificationscheme", p)
        if m:
            sid = self.scheme.get(m.group(1), "none")
            if sid == "none":
                raise ApiError(404, "GET", p, "no scheme")
            return {"id": int(sid)}
        if p == "/rest/api/3/project/search":
            k = q.get("keys")
            n = sum(1 for x in self.issues if x.startswith(k + "-"))
            return {"values": [{"key": k, "insight": {"totalIssueCount": n}}]}
        if p.startswith("/rest/api/3/issue/createmeta/"):
            f = [{"fieldId": "summary"}] + ([{"fieldId": "description"}] if self.create_screen_has_description else [])
            return {"fields": f}
        if p == "/rest/api/3/issueLinkType":
            return {"issueLinkTypes": self.link_types}
        if p == "/rest/api/3/notificationscheme":
            start, size = int(q.get("startAt", 0)), int(q.get("maxResults", 50))
            page = self.schemes[start:start + size]
            return {"values": page, "isLast": start + size >= len(self.schemes)}
        m = re.fullmatch(r"/rest/api/3/notificationscheme/(\d+)", p)
        if m:
            s = next(x for x in self.schemes if str(x["id"]) == m.group(1))
            return {"name": s["name"], "notificationSchemeEvents": s.get("events", [])}
        raise AssertionError(f"fake GET not modelled: {path}")

    def post(self, path, body=None, **kw):
        self.calls.append(("POST", path, json.dumps(body, sort_keys=True)))
        if self.read_only and not path.startswith(("/rest/api/3/search", "/rest/api/3/issue/bulkfetch")):
            raise SystemExit(f"REFUSED: POST {path} on read-only fake")
        if path == "/rest/api/3/issue":
            f = body["fields"]
            p = f["project"]["key"]
            if "description" in f and not self.create_screen_has_description:     # validation: no number consumed
                raise ApiError(400, "POST", path, '{"errors":{"description":"Field \'description\' cannot be set. '
                                                  'It is not on the appropriate screen, or unknown."}}')
            self.counter[p] = self.counter.get(p, 0) + 1
            key = f"{p}-{self.counter[p]}"
            t = next(x for x in self.types if x["id"] == f["issuetype"]["id"])
            self.issues[key] = {"key": key, "fields": {
                "summary": f.get("summary"), "labels": list(f.get("labels", [])), "issuetype": dict(t),
                "status": {"name": "Open"}, "parent": f.get("parent"), "created": "2026-01-01T00:00:00.000+0000",
                "resolutiondate": None, "duedate": None, "description": f.get("description"), "project": {"key": p}}}
            self.lagging.add(key)                     # brand-new items are not searchable yet (index lag)
            if self.lose_next_create:
                self.lose_next_create -= 1
                raise ApiError(0, "POST", path, "no response (timeout) - state UNKNOWN")
            return {"key": key}
        if path == "/rest/api/3/issueLink":
            typ = body["type"]["name"]
            h, o = body["inwardIssue"]["key"], body["outwardIssue"]["key"]      # inwardIssue holds the OUTWARD wording
            if any(v == (h, typ, o) for v in self.links.values()):
                return None                                                      # duplicate: "created", nothing done
            self.next_link += 1
            lid = str(self.next_link)
            self.links[lid] = (h, typ, o)
            lt = next(x for x in self.link_types if x["name"] == typ)
            self.changelog.setdefault(h, []).append({"author": {"accountId": self.me}, "items": [
                {"field": "Link", "toString": f"This issue {lt['outward']} {o}"}]})
            self.changelog.setdefault(o, []).append({"author": {"accountId": self.me}, "items": [
                {"field": "Link", "toString": f"This issue {lt['inward']} {h}"}]})
            return None
        if path == "/rest/api/3/issue/bulkfetch":
            out = [self._view(k) for k in body["issueIdsOrKeys"] if k in self.issues and k not in self.forbidden]
            return {"issues": out, "issueErrors": []}
        if path == "/rest/api/3/notificationscheme":
            sid = max(x["id"] for x in self.schemes) + 1
            self.schemes.append({"id": sid, "name": body["name"]})
            return {"id": str(sid)}
        raise AssertionError(f"fake POST not modelled: {path}")

    def put(self, path, body=None, **kw):
        self.calls.append(("PUT", path, json.dumps(body, sort_keys=True)))
        u = urllib.parse.urlparse(path)
        m = re.fullmatch(r"/rest/api/3/issue/([A-Z0-9_]+-\d+)", u.path)
        if m:
            k = m.group(1)
            i = self._issue(k)
            f = body["fields"]
            if "parent" in f:
                if k in self.other_400:
                    raise ApiError(400, "PUT", path, json.dumps({"errorMessages": [], "errors": self.other_400[k]}))
                if k in self.parent_refusal:
                    raise ApiError(400, "PUT", path, '{"errorMessages":[],"errors":{"parent":"Given parent work item '
                                                     'does not belong to appropriate hierarchy."}}')
            i["fields"].update(f)
            return None
        m = re.fullmatch(r"/rest/api/3/project/([A-Z0-9_]+)", u.path)
        if m:
            self.scheme[m.group(1)] = str(body["notificationScheme"])
            return None
        raise AssertionError(f"fake PUT not modelled: {path}")

    def delete(self, path, body=None, **kw):
        self.calls.append(("DELETE", path))
        m = re.fullmatch(r"/rest/api/3/issue/([A-Z0-9_]+-\d+)", path)
        if m:
            self._issue(m.group(1))
            del self.issues[m.group(1)]
            return None
        m = re.fullmatch(r"/rest/api/3/issueLink/(\d+)", path)
        if m:
            if m.group(1) not in self.links:
                raise ApiError(404, "DELETE", path, "no link")
            del self.links[m.group(1)]
            return None
        raise AssertionError(f"fake DELETE not modelled: {path}")

    def search_jql(self, jql, fields, page=100):
        m = re.match(r"project = ([A-Z0-9_]+)", jql)
        proj = m.group(1)
        keys = sorted((k for k in self.issues if k.startswith(proj + "-") and k not in self.hidden | self.lagging),
                      key=lambda k: int(k.rsplit("-", 1)[1]))
        for k in keys:
            labs = self.issues[k]["fields"]["labels"]
            if 'labels = "migrated"' in jql and "migrated" not in labs:
                continue
            if 'labels != "migrated"' in jql and "migrated" in labs:
                continue
            yield self._view(k)

    def reindex(self):
        self.lagging.clear()
