# Standard CLI Flag Vocabulary

A single migration sub-project usually owns three entry points (`plan.js`, `sync.js`, `audit.js`). The flags below are the shared vocabulary used across all three — same flag name means the same thing everywhere.

## Standard flags

| Flag | Type | Phase | Meaning |
|---|---|---|---|
| `--plan-only` | boolean | combined runs | Phase 1 only — discover and write the plan, then exit |
| `--execute-only` | boolean | combined runs | Phase 2 only — load a plan and process it |
| `--plan-file <path>` | path | sync / audit | Path to a saved `plan_<runId>.json`; required for `--execute-only` |
| `--dry-run` | boolean | sync | Walk the plan, log intended changes, NEVER call PUT/POST/DELETE |
| `--confirm` | boolean | sync | Operator confirms intent to mutate; required without `--dry-run` |
| `--retry-failed` | boolean | sync | Also re-attempt entries with status="failed" |
| `--seed <N>` | int | audit | RNG seed for reproducible sampling (default 42) |
| `--sample <N>` | int | audit | Sample size (default 150). Ignored if `--full` |
| `--full` | boolean | audit | Audit every matching entry (no sampling) |
| `--status <S>` | string | audit | Which plan status to audit (default "completed") |
| `--limit <N>` | int | all | Cap planned/processed entries (debugging or pilot runs) |
| `--concurrency <N>` | int | sync | Worker-pool size (default 5; use 3 for high-write-rate jobs) |
| `--space <K>` | string, repeatable | plan | Confluence space key(s) to scan |
| `--project <K>` | string, repeatable | plan | Jira project key(s) to scan |
| `--user-mapping <path>` | path | plan / sync | CSV file overriding identity-resolver outputs |
| `--group-mapping <path>` | path | plan / sync | CSV file overriding group-resolver outputs |
| `--help` / `-h` | boolean | all | Print usage and exit |

## Two-gate safety contract

```
no --confirm  AND  no --dry-run    → exit 2 (refuse to mutate)
--dry-run                          → simulate, log, never mutate (--confirm ignored)
--confirm                          → mutate
--dry-run  --confirm               → simulate (dry-run wins)
```

This contract is enforced at the very top of `sync.js`:

```javascript
if (!opts.dryRun && !opts.confirm) {
  console.error("Refusing to mutate without --confirm. Use --dry-run for a preview.");
  process.exit(2);
}
```

## Reference `parseArgs` helper

Each script template ships with its own `parseArgs` inline. The helper below is the canonical shape — copy it into `src/cliFlags.js` if you have many flags shared across entry points.

```javascript
"use strict";

/**
 * parseArgs — minimal zero-dep flag parser for migration scripts.
 *
 * Conventions:
 *   --flag                       boolean true
 *   --flag value                 next arg is the value
 *   --flag a,b,c                 comma-split into array (use spec.array)
 *   --flag value (repeated)      pushed into an array (use spec.array AND repeatable)
 *
 * Pass a spec like:
 *   { planFile: { type: "string" },
 *     dryRun:   { type: "boolean" },
 *     concurrency: { type: "int", default: 5 },
 *     spaces:   { type: "string", array: true, repeatable: true, flag: "--space" } }
 */
function parseArgs(argv, spec) {
  const out = {};
  const flagMap = {};
  for (const [key, s] of Object.entries(spec)) {
    out[key] = s.array ? [] : (s.default !== undefined ? s.default : (s.type === "boolean" ? false : null));
    const flag = s.flag || ("--" + key.replace(/([A-Z])/g, "-$1").toLowerCase());
    flagMap[flag] = { key, ...s };
  }
  flagMap["--help"] = { key: "help", type: "boolean" };
  flagMap["-h"] = { key: "help", type: "boolean" };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const meta = flagMap[a];
    if (!meta) {
      if (a.startsWith("--")) {
        console.error(`Unknown flag: ${a}`);
        out.help = true;
      }
      continue;
    }
    if (meta.type === "boolean") {
      out[meta.key] = true;
      continue;
    }
    const raw = argv[++i];
    if (raw === undefined) {
      console.error(`Flag ${a} requires a value`);
      out.help = true;
      continue;
    }
    let val = raw;
    if (meta.type === "int") val = parseInt(raw, 10) || (meta.default ?? 0);
    if (meta.array && meta.repeatable) {
      out[meta.key].push(val);
    } else if (meta.array) {
      out[meta.key].push(...String(val).split(",").map((s) => s.trim()).filter(Boolean));
    } else {
      out[meta.key] = val;
    }
  }
  return out;
}

module.exports = { parseArgs };
```
