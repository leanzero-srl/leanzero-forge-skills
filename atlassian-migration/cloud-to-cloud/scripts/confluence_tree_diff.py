#!/usr/bin/env python3
"""Confluence move gate: diff a SOURCE subtree against a TARGET subtree by title, and list every item type.

Run it twice: before the move (to show the owner everything that exists, not just the pages on an approval list)
and after (as the done check). Exit 1 while any source item has no target match and is not in --excluded.

usage: confluence_tree_diff.py --src-base https://a.atlassian.net --src-root <pageId|folderId> --src-auth ENV_EMAIL:ENV_TOKEN
                               --dst-base https://b.atlassian.net --dst-root <id> --dst-auth ENV_EMAIL:ENV_TOKEN
                               [--excluded "title 1" ...] [--excluded-ids 123 456 ...]
Matching is by normalised title (emoji/whitespace-insensitive). Types listed: page, folder, database, whiteboard,
embed (smart link). Templates and space settings are NOT in a page tree: check them separately and say so.
"""
import argparse, base64, json, os, re, sys, unicodedata, urllib.error, urllib.request


def auth(spec):
    e, t = spec.split(':')
    return 'Basic ' + base64.b64encode(f"{os.environ[e]}:{os.environ[t]}".encode()).decode()


def get(base, path, a):
    r = urllib.request.Request(base + path, headers={'Authorization': a, 'Accept': 'application/json'})
    return json.load(urllib.request.urlopen(r))


def tree(base, root, a):
    items, path = [], None
    for kind in ('pages', 'folders', 'databases', 'whiteboards', 'embeds'):
        try:
            path = f'/wiki/api/v2/{kind}/{root}/descendants?limit=250&depth=10'
            while path:
                d = get(base, path, a)
                items += d['results']
                path = d.get('_links', {}).get('next')
            break
        except urllib.error.HTTPError as e:
            if kind == 'pages' and e.code not in (404,): print(f'warning: {base} {kind}/{root}: HTTP {e.code}', file=sys.stderr)
            continue
    return items


def norm(t):
    t = ''.join(ch for ch in unicodedata.normalize('NFKC', t) if unicodedata.category(ch)[0] in 'LNPZ')
    return re.sub(r'\s+', ' ', t).strip().lower()


def main():
    ap = argparse.ArgumentParser()
    for s in ('src', 'dst'):
        ap.add_argument(f'--{s}-base', required=True); ap.add_argument(f'--{s}-root', required=True); ap.add_argument(f'--{s}-auth', required=True)
    ap.add_argument('--excluded', nargs='*', default=[], help='titles left behind on purpose')
    ap.add_argument('--excluded-ids', nargs='*', default=[], help='source ids left behind on purpose (safer than long titles)')
    a = ap.parse_args()
    src = tree(a.src_base, a.src_root, auth(a.src_auth))
    if not src:  # an empty source is a blind read, never a pass
        sys.exit('source tree came back EMPTY: wrong root id, no access or API change. Not a pass.')
    dst = tree(a.dst_base, a.dst_root, auth(a.dst_auth))
    have = {norm(x['title']) for x in dst}
    excl = {norm(x) for x in a.excluded}
    xid = set(a.excluded_ids)
    isx = lambda x: norm(x['title']) in excl or str(x['id']) in xid
    missing = [x for x in src if norm(x['title']) not in have and not isx(x)]
    print(f"source {len(src)} items by type:", json.dumps({t: sum(1 for x in src if x['type'] == t) for t in sorted({x['type'] for x in src})}))
    print(f"target {len(dst)} items")
    for x in src:
        flag = 'OK  ' if norm(x['title']) in have else ('EXCL' if isx(x) else 'MISS')
        print(f"{flag} {x['type']:10} {x['id']:>12}  {x['title'][:90]}")
    print(f"missing (not moved, not excluded): {len(missing)}")
    sys.exit(1 if missing else 0)


if __name__ == '__main__':
    main()
