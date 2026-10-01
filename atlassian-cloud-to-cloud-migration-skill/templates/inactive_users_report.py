#!/usr/bin/env python3
"""
inactive_users_report.py — READ-ONLY. Rank candidates for freeing licence seats from admin-hub user data.
It never suspends or removes anyone: it prints a CSV for the person who must approve the action.

Input: a JSON list of users, each with per-product last-active dates. Capture it from a logged-in
admin.atlassian.com tab (a user API token gets 401 on these endpoints) — paste in the browser console:

    const O = "<orgId>", SITE_ARI = "ari:cloud:confluence::site/<cloudId>";   // the product/site you need seats on
    const f = async (u, m, b) => (await fetch(u, {method: m || "GET", credentials: "include",
        headers: {Accept: "application/json", "Content-Type": "application/json"}, body: b && JSON.stringify(b)})).json();
    let users = [], cursor = null;
    do { const r = await f(`/gateway/api/admin/v2/orgs/${O}/directories/-/users/search`, "POST",
           {limit: 100, accountStatus: ["active"], membershipStatus: ["active"], resourceIds: [SITE_ARI], ...(cursor ? {cursor} : {})});
         users.push(...r.data); cursor = r.links && r.links.next; } while (cursor);
    for (const u of users) { const r = await f(`/gateway/api/admin/v1/orgs/${O}/directory/users/${u.accountId}/last-active-dates`);
         u.product_access = (r.data && r.data.product_access) || []; await new Promise(z => setTimeout(z, 150)); }
    copy(JSON.stringify(users));    // paste into users.json

(With an org API key the same data is under https://api.atlassian.com/admin/... — see atlassian-organizations-api-skill.)

Usage
  inactive_users_report.py users.json [--days 90] [--added-within 90] [--exclude keep.txt] [--today YYYY-MM-DD]
    --days N          inactive = no activity in ANY product for N days (activity in another product still counts)
    --added-within N  exclude accounts added to the org in the last N days (new accounts show "never active")
    --exclude FILE    accountIds or e-mails, one per line: KEEP list, movers, testers, the migration accounts
Output (stdout, CSV): verdict, last_active_any, days_inactive, added_to_org, email, name, accountId, reason
  verdict = candidate | never-active-old | excluded | active
Before acting: show the list to the approver; prefer removing the person from the ONE product-access group (frees
that seat only) over suspending (removes access to every product on every site of the org). Record every action.
Python 3.8+, stdlib only.
"""
import csv
import datetime as dt
import json
import sys


def parse_day(s):
    if not s:
        return None
    try:
        return dt.date.fromisoformat(str(s)[:10])
    except ValueError:
        return None


def product_access(u):
    for k in ("product_access", "pa"):
        if isinstance(u.get(k), list):
            return u[k]
    la = u.get("last_active") or {}
    return ((la.get("data") or {}).get("product_access")) or []


def main():
    a = sys.argv[1:]
    if not a:
        sys.exit(__doc__)

    def opt(n, d=None):
        return a[a.index(n) + 1] if n in a else d
    users = json.load(open(a[0]))
    days, added_within = int(opt("--days", "90")), int(opt("--added-within", "90"))
    today = parse_day(opt("--today")) or dt.date.today()
    excl = set()
    if opt("--exclude"):
        excl = {line.strip().lower() for line in open(opt("--exclude")) if line.strip()}
    w = csv.writer(sys.stdout)
    w.writerow(["verdict", "last_active_any", "days_inactive", "added_to_org", "email", "name", "accountId", "reason"])
    rows = []
    for u in users:
        acc, email = u.get("accountId", ""), (u.get("email") or "")
        last = max(filter(None, (parse_day(p.get("last_active")) for p in product_access(u))), default=None)
        added = parse_day(u.get("addedToOrg"))
        roles = " ".join(str(r) for r in (u.get("platformRoles") or u.get("roles") or []))
        idle = (today - last).days if last else None
        if acc.lower() in excl or email.lower() in excl:
            verdict, reason = "excluded", "on the exclude list (KEEP / movers / testers / migration accounts)"
        elif "admin" in roles.lower():
            verdict, reason = "excluded", f"admin role ({roles})"
        elif added and (today - added).days < added_within:
            verdict, reason = "excluded", f"added to org {(today - added).days} d ago - new accounts read as never active"
        elif last is None:
            verdict, reason = "never-active-old", "no activity recorded in any product; in org since " + str(added)
        elif idle >= days:
            verdict, reason = "candidate", f"no activity in any product for {idle} days"
        else:
            verdict, reason = "active", ""
        rows.append((verdict, str(last or ""), "" if idle is None else idle, str(added or ""), email,
                     u.get("name", ""), acc, reason))
    order = {"candidate": 0, "never-active-old": 1, "excluded": 2, "active": 3}
    for r in sorted(rows, key=lambda r: (order[r[0]], -(r[2] if isinstance(r[2], int) else 10 ** 6))):
        w.writerow(r)
    counts = {k: sum(1 for r in rows if r[0] == k) for k in order}
    print(f"# {len(rows)} users: {counts} (threshold {days} d, today {today})", file=sys.stderr)


if __name__ == "__main__":
    main()
