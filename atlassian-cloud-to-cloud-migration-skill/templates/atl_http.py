#!/usr/bin/env python3
"""
atl_http.py — minimal, dependency-free client for Atlassian Cloud REST (Jira, Confluence, JSM).

Purpose: the one retry policy every migration script should share.
  * 429 (any method): the request was REJECTED, never processed -> always safe to resend. Waits Retry-After or
    x-ratelimit-reset (Jira's hourly cost budget answers with the top of the next hour, format YYYY-MM-DDTHH:MMZ).
  * 5xx / network error: retried ONLY for GET. A POST/PUT/DELETE that got a 5xx or timed out may have been APPLIED
    (a "lost create" makes a duplicate item that steals the next issue number). Those are raised to the caller, who
    must check the target state before trying again (see ordered_create.py).
  * Anything else (400, 401, 403, 404, 409) is raised immediately as ApiError with the response body.

Auth: Basic base64(email:api_token) — an ordinary Atlassian API token of an admin account.
Usage:
    from atl_http import Site
    tgt = Site("https://target.atlassian.net", os.environ["TGT_EMAIL"], os.environ["TGT_TOKEN"])
    me = tgt.get("/rest/api/3/myself")
    tgt.put("/rest/api/3/issue/PROJ-1?notifyUsers=false", {"fields": {"summary": "x"}})
    for issue in tgt.search_jql("project = PROJ ORDER BY key", ["summary"]): ...

Refuses writes to a site listed in READ_ONLY_SITES (comma-separated env var) — put your SOURCE there.
Python 3.8+, standard library only.
"""
import base64
import datetime
import json
import os
import time
import urllib.error
import urllib.request


class ApiError(Exception):
    def __init__(self, status, method, path, body):
        super().__init__(f"{status} {method} {path} {body[:500]}")
        self.status, self.method, self.path, self.body = status, method, path, body


def _wait_seconds(err, attempt):
    """Seconds to sleep after a 429: x-ratelimit-reset > Retry-After > exponential backoff."""
    hdr = err.headers or {}
    reset = hdr.get("x-ratelimit-reset")
    if reset:
        try:
            at = datetime.datetime.strptime(reset, "%Y-%m-%dT%H:%MZ").replace(tzinfo=datetime.timezone.utc)
            return max(5.0, min((at - datetime.datetime.now(datetime.timezone.utc)).total_seconds() + 5, 3700))
        except ValueError:
            pass
    ra = hdr.get("Retry-After")
    if ra:
        try:
            return max(1.0, min(float(ra), 3700))
        except ValueError:
            pass
    return min(2 ** attempt, 60)


class Site:
    def __init__(self, base, email, token, timeout=90, max_tries=40, log=print):
        self.base = base.rstrip("/")
        self.auth = "Basic " + base64.b64encode(f"{email}:{token}".encode()).decode()
        self.timeout, self.max_tries, self.log = timeout, max_tries, log
        ro = [s.strip().rstrip("/") for s in os.environ.get("READ_ONLY_SITES", "").split(",") if s.strip()]
        self.read_only = self.base in ro

    # -- core -------------------------------------------------------------------------------------------------
    def request(self, method, path, body=None, raw=None, headers=None, expect_json=True):
        method = method.upper()
        if self.read_only and method != "GET" and not _is_read_post(method, path):
            raise SystemExit(f"REFUSED: {method} {path} on read-only site {self.base}")
        url = path if path.startswith("http") else self.base + path
        data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
        h = {"Authorization": self.auth, "Accept": "application/json"}
        if raw is None:
            h["Content-Type"] = "application/json"
        h.update(headers or {})
        for attempt in range(self.max_tries):
            req = urllib.request.Request(url, data=data, method=method, headers=h)
            try:
                with urllib.request.urlopen(req, timeout=self.timeout) as r:
                    payload = r.read()
                if not expect_json:
                    return payload
                return json.loads(payload) if payload and payload[:1] in b"{[" else (payload.decode() if payload else None)
            except urllib.error.HTTPError as e:
                if e.code == 429:
                    w = _wait_seconds(e, attempt)
                    self.log(f"429 {method} {path} - waiting {int(w)} s")
                    time.sleep(w)
                    continue
                if e.code >= 500 and method == "GET" and attempt < 8:
                    time.sleep(min(2 ** attempt, 60))
                    continue
                raise ApiError(e.code, method, path, e.read().decode("utf-8", "replace"))
            except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
                if method == "GET" and attempt < 8:
                    time.sleep(min(2 ** attempt, 60))
                    continue
                # a write whose response was lost: the caller must check the target before retrying
                raise ApiError(0, method, path, f"no response ({e}) - state UNKNOWN, check before retrying")
        raise ApiError(429, method, path, "gave up after repeated 429")

    def get(self, path, **kw):
        return self.request("GET", path, **kw)

    def post(self, path, body=None, **kw):
        return self.request("POST", path, body, **kw)

    def put(self, path, body=None, **kw):
        return self.request("PUT", path, body, **kw)

    def delete(self, path, **kw):
        return self.request("DELETE", path, **kw)

    # -- helpers ----------------------------------------------------------------------------------------------
    def search_jql(self, jql, fields, page=100):
        """POST /rest/api/3/search/jql, paged by nextPageToken (startAt is not accepted there)."""
        token = None
        while True:
            body = {"jql": jql, "maxResults": page, "fields": fields}
            if token:
                body["nextPageToken"] = token
            d = self.post("/rest/api/3/search/jql", body)
            for issue in d.get("issues", []):
                yield issue
            token = d.get("nextPageToken")
            if d.get("isLast") or not token:
                return

    def count(self, jql):
        return self.post("/rest/api/3/search/approximate-count", {"jql": jql})["count"]

    def all_comments(self, key):
        """Every comment of an issue. The API caps a page at 100 whatever maxResults says."""
        out, start = [], 0
        while True:
            d = self.get(f"/rest/api/3/issue/{key}/comment?startAt={start}&maxResults=100&orderBy=created")
            cs = d.get("comments", [])
            out += cs
            if not cs or start + len(cs) >= d.get("total", 0):
                return out
            start += len(cs)


def _is_read_post(method, path):
    """POSTs that only read (allowed on a read-only source)."""
    return method == "POST" and any(path.startswith(p) for p in (
        "/rest/api/3/search/jql", "/rest/api/3/search/approximate-count", "/rest/api/3/issue/bulkfetch",
        "/rest/api/3/jql/parse", "/rest/api/3/changelog/bulkfetch"))


def site_from_env(prefix):
    """SRC_BASE/SRC_EMAIL/SRC_TOKEN or TGT_BASE/TGT_EMAIL/TGT_TOKEN."""
    return Site(os.environ[f"{prefix}_BASE"], os.environ[f"{prefix}_EMAIL"], os.environ[f"{prefix}_TOKEN"])
