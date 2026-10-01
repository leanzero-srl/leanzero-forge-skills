#!/usr/bin/env python3
"""Every SKILL.md must start with valid YAML front matter carrying name + description.
An unquoted description containing ': ' broke the cloud-to-cloud skill on GitHub (2026-10-01)."""
import glob, re, sys, yaml
bad = 0
for f in sorted(glob.glob("*/SKILL.md")):
    s = open(f, encoding="utf-8").read()
    m = re.match(r"---\n(.*?)\n---\n", s, re.S)
    try:
        d = yaml.safe_load(m.group(1)) if m else None
        assert d and d.get("name") and d.get("description"), "missing name/description"
        print(f"ok   {f}")
    except Exception as e:
        bad += 1; print(f"FAIL {f}: {str(e).splitlines()[0][:120]}")
sys.exit(1 if bad else 0)
