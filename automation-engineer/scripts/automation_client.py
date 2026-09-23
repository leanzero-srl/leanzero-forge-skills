#!/usr/bin/env python3
"""automation_client.py — generic client for the real Jira/Confluence Automation REST API.

Host is api.atlassian.com/automation/public/{product}/{cloudid}/rest/v1/... — NOT the site's own
/rest/api/3/... domain. See ../docs/01-core-concepts.md and ../docs/gotchas.md for why the common
"automation has no REST API" belief is wrong, and for the ways a copied rule silently breaks on a
new tenant (scope ARIs, cf[NNNNN] field ids inside JQL, Assets object ARIs inside JQL, raw
project/issuetype ids inside jira.issue.create actions).

No credentials are hardcoded here — every client engagement passes its own email/token/cloudId.
"""
import argparse
import base64
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
import uuid as uuid_module


def uuid7():
    """Automation rule uuids must be v7 (undocumented outside the Postman collection's endpoint
    description: 'If providing a UUID for your new rule, it must be unique and V7'). This
    environment's Python predates uuid.uuid7, so build it by hand: 48-bit ms timestamp + version
    (0111) + 12 bits random + variant (10) + 62 bits random."""
    ts_ms = int(time.time() * 1000)
    b = bytearray(ts_ms.to_bytes(6, "big") + os.urandom(10))
    b[6] = (b[6] & 0x0F) | 0x70
    b[8] = (b[8] & 0x3F) | 0x80
    return str(uuid_module.UUID(bytes=bytes(b)))


class AutomationClient:
    def __init__(self, email, token, cloudid, product="jira", site_gateway=None):
        """site_gateway: optional 'https://yoursite.atlassian.net' to use the site-specific
        entry point instead of api.atlassian.com (functionally identical for API-token auth;
        the site-specific one also accepts a live browser session, which this client doesn't use)."""
        self._auth = base64.b64encode(f"{email}:{token}".encode()).decode()
        if site_gateway:
            self.base = f"{site_gateway.rstrip('/')}/gateway/api/automation/public/{product}/{cloudid}/rest/v1"
        else:
            self.base = f"https://api.atlassian.com/automation/public/{product}/{cloudid}/rest/v1"

    def _call(self, method, path, body=None, query=None):
        url = self.base + path
        if query:
            qs = "&".join(f"{k}={v}" for k, v in query.items() if v is not None)
            if qs:
                url += ("&" if "?" in url else "?") + qs
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(url, data=data, method=method, headers={
            "Authorization": f"Basic {self._auth}", "Content-Type": "application/json",
            "Accept": "application/json"})
        try:
            resp = urllib.request.urlopen(req)
            raw = resp.read()
            return resp.status, (json.loads(raw) if raw else None)
        except urllib.error.HTTPError as e:
            raw = e.read().decode()
            try:
                return e.code, json.loads(raw)
            except json.JSONDecodeError:
                return e.code, raw

    # ---- rules ----

    def list_rules(self, scope_ari=None, trigger=None, state=None, author=None, limit=50):
        """Paginated GET/POST /rule/summary. Filters (scope/trigger/state/author) use the POST
        search form since GET /rule/summary takes no filter params."""
        out, cursor = [], None
        while True:
            if any([scope_ari, trigger, state, author]):
                body = {"limit": limit}
                if scope_ari:
                    body["scope"] = scope_ari
                if trigger:
                    body["trigger"] = trigger
                if state:
                    body["state"] = state
                if author:
                    body["author"] = author
                if cursor:
                    body["cursor"] = cursor
                st, resp = self._call("POST", "/rule/summary", body=body)
            else:
                st, resp = self._call("GET", "/rule/summary", query={"limit": limit, "cursor": cursor})
            if st != 200:
                raise RuntimeError(f"list_rules failed: {st} {resp}")
            out.extend(resp.get("data", []))
            nxt = (resp.get("links") or {}).get("next")
            if not nxt:
                break
            m = re.search(r"cursor=([^&]+)", nxt)
            cursor = m.group(1) if m else None
            if not cursor:
                break
        return out

    def get_rule(self, rule_uuid):
        st, resp = self._call("GET", f"/rule/{rule_uuid}")
        if st != 200:
            raise RuntimeError(f"get_rule {rule_uuid} failed: {st} {resp}")
        return resp["rule"]

    def create_rule(self, rule_payload, target_author_account_id=None):
        """rule_payload: the inner 'rule' object - pass it EXACTLY as GET returned it (component
        ids, parentId/conditionParentId, created/updated all included; the docs' 'same structure
        as the get a rule by UUID response' is literally true, see docs/gotchas.md's three-rules
        section for the full story of how many wrong guesses it took to find that out). This
        method enforces the two easy-to-forget rules for you:

        1. `uuid` is always overwritten with a fresh v7 UUID (reusing the source's own uuid fails
           loud - "already exists" - but a stale one left over from a previous attempt fails with
           the SAME generic error as everything else, so never trust a caller-supplied one here).
        2. `authorAccountId` must be present and valid on the TARGET tenant. Pass
           `target_author_account_id` explicitly (accountIds are org-shared - the source rule's
           own author or the calling user's own id both usually work); omitting both raises here,
           loudly, INSTEAD of letting the API's generic 'could not be parsed' hide it again.

        Always create DISABLED first (rewrite state to ENABLED via set_state after you've read
        the created rule back and confirmed it matches)."""
        rule_payload = json.loads(json.dumps(rule_payload))  # don't mutate the caller's dict
        rule_payload["uuid"] = uuid7()
        author = target_author_account_id or rule_payload.get("authorAccountId")
        if not author:
            raise ValueError(
                "create_rule: no authorAccountId available (pass target_author_account_id= "
                "explicitly, or ensure rule_payload already carries one valid on the TARGET "
                "tenant). Omitting this silently produces the API's generic "
                "'could not be parsed' 400 with no indication this was the cause - see docs/gotchas.md.")
        rule_payload["authorAccountId"] = author
        st, resp = self._call("POST", "/rule", body={"rule": rule_payload})
        if st not in (200, 201):
            raise RuntimeError(f"create_rule failed: {st} {resp}")
        return resp  # {"ruleUuid": "..."}

    def update_rule(self, rule_uuid, rule_payload):
        st, resp = self._call("PUT", f"/rule/{rule_uuid}", body={"rule": rule_payload})
        if st != 200:
            raise RuntimeError(f"update_rule {rule_uuid} failed: {st} {resp}")
        return resp

    def set_state(self, rule_uuid, enabled):
        st, resp = self._call("PUT", f"/rule/{rule_uuid}/state",
                               body={"value": "ENABLED" if enabled else "DISABLED"})
        if st != 200:
            raise RuntimeError(f"set_state {rule_uuid} failed: {st} {resp}")
        return resp

    def set_scope(self, rule_uuid, scope_aris):
        st, resp = self._call("PUT", f"/rule/{rule_uuid}/rule-scope",
                               body={"ruleScopeARIs": scope_aris})
        if st != 200:
            raise RuntimeError(f"set_scope {rule_uuid} failed: {st} {resp}")
        return resp

    def delete_rule(self, rule_uuid):
        st, resp = self._call("DELETE", f"/rule/{rule_uuid}")
        if st not in (200, 204):
            raise RuntimeError(f"delete_rule {rule_uuid} failed: {st} {resp}")
        return True

    # ---- manual rules / templates (rarely needed for a migration) ----

    def search_manual_rules(self, cursor=None, limit=50):
        st, resp = self._call("GET", "/rule/manual/search", query={"cursor": cursor, "limit": limit})
        if st != 200:
            raise RuntimeError(f"search_manual_rules failed: {st} {resp}")
        return resp

    def invoke_manual_rule(self, rule_id, object_aris, user_inputs=None):
        st, resp = self._call("POST", f"/rule/manual/{rule_id}/invocation",
                               body={"objects": object_aris, "userInputs": user_inputs or {}})
        if st != 200:
            raise RuntimeError(f"invoke_manual_rule {rule_id} failed: {st} {resp}")
        return resp

    # ---- the migration helpers ----

    CF_RE = re.compile(r"cf\[(\d+)\]")
    ARI_RE = re.compile(r"ari:cloud:[a-zA-Z0-9_-]*:[^\"'\s]*")

    @classmethod
    def find_cf_and_ari_references(cls, rule_json):
        """Walks the whole rule dict/list tree, returns every cf[NNNNN] and ARI string found in
        any string value — trap #2 and #3 from the skill doc. Does not touch ruleScopeARIs or the
        trigger's own eventFilters (those are structural fields, handled separately) — this is
        specifically for references HIDDEN inside free-text like JQL."""
        found = {"cf_ids": set(), "aris": set()}

        def walk(node, in_structural_field=False):
            if isinstance(node, dict):
                for k, v in node.items():
                    walk(v, in_structural_field=(k in ("ruleScopeARIs", "eventFilters")))
            elif isinstance(node, list):
                for v in node:
                    walk(v, in_structural_field=in_structural_field)
            elif isinstance(node, str) and not in_structural_field:
                found["cf_ids"].update(cls.CF_RE.findall(node))
                found["aris"].update(cls.ARI_RE.findall(node))

        walk(rule_json)
        return {"cf_ids": sorted(found["cf_ids"]), "aris": sorted(found["aris"])}

    @staticmethod
    def diff_rules(a, b, ignore_keys=("id", "parentId", "conditionParentId")):
        """Structural diff of two rule payloads, ignoring the UUID-valued keys that are always
        freshly minted on create (so a correctly-migrated rule will never match byte-for-byte on
        those). Returns a list of (path, a_value, b_value) mismatches."""
        mismatches = []

        def walk(pa, pb, path):
            if isinstance(pa, dict) and isinstance(pb, dict):
                keys = (set(pa) | set(pb)) - set(ignore_keys)
                for k in sorted(keys):
                    walk(pa.get(k), pb.get(k), f"{path}.{k}")
            elif isinstance(pa, list) and isinstance(pb, list):
                if len(pa) != len(pb):
                    mismatches.append((path + "[len]", len(pa), len(pb)))
                for i, (xa, xb) in enumerate(zip(pa, pb)):
                    walk(xa, xb, f"{path}[{i}]")
            elif pa != pb:
                mismatches.append((path, pa, pb))

        walk(a, b, "$")
        return mismatches


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["list", "get", "scan", "create", "diff"])
    ap.add_argument("--email", required=True)
    ap.add_argument("--token", required=True)
    ap.add_argument("--cloudid", required=True)
    ap.add_argument("--product", default="jira")
    ap.add_argument("--scope-ari")
    ap.add_argument("--uuid")
    ap.add_argument("--file", help="rule JSON file, for create/diff")
    ap.add_argument("--file2", help="second rule JSON file, for diff")
    ap.add_argument("--disabled", action="store_true", help="create: force state=DISABLED regardless of the file")
    ap.add_argument("--author", help="create: accountId valid on the TARGET tenant (required unless the file's own authorAccountId is already valid there)")
    args = ap.parse_args()

    client = AutomationClient(args.email, args.token, args.cloudid, product=args.product)

    if args.cmd == "list":
        rules = client.list_rules(scope_ari=args.scope_ari)
        print(f"{len(rules)} rule(s)")
        for r in rules:
            print(f"  {r['uuid']}  {r['state']:8s}  {r['name']}")

    elif args.cmd == "get":
        rule = client.get_rule(args.uuid)
        print(json.dumps(rule, indent=2))

    elif args.cmd == "scan":
        rule = client.get_rule(args.uuid)
        refs = AutomationClient.find_cf_and_ari_references(rule)
        print(f"cf[] field ids found (need remapping to target's own field ids): {refs['cf_ids']}")
        print(f"ARI references found in free text (need remapping to target tenant): {refs['aris']}")

    elif args.cmd == "create":
        payload = json.load(open(args.file))
        rule = payload.get("rule", payload)
        if args.disabled:
            rule["state"] = "DISABLED"
        result = client.create_rule(rule, target_author_account_id=args.author)
        print(f"created: {result}")

    elif args.cmd == "diff":
        a = json.load(open(args.file))
        b = json.load(open(args.file2))
        a = a.get("rule", a)
        b = b.get("rule", b)
        mismatches = AutomationClient.diff_rules(a, b)
        if not mismatches:
            print("structurally identical (ignoring component ids)")
        else:
            for path, va, vb in mismatches:
                print(f"  {path}: {va!r} != {vb!r}")


if __name__ == "__main__":
    main()
