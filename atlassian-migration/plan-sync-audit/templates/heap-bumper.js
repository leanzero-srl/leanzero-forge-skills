"use strict";

/**
 * Heap self-bump for long-running migration scripts.
 *
 * Default V8 heap (~1.5–2 GB on 64-bit Node) is enough for tens of
 * thousands of small entities but crashes on real instance-wide scans:
 * 100k+ issues, comment payloads, ADF docs, multipart bodies, retry
 * state. The OOM looks like:
 *
 *     <--- Last few GCs --->
 *     [ ... ] Mark-sweep ... allocation failure
 *     FATAL ERROR: CALL_AND_RETRY_LAST Allocation failed - JavaScript heap out of memory
 *
 * Bumping the heap from CLI (`node --max-old-space-size=8192 ...`) is
 * easy to forget — and a user who runs `npm start` without it loses
 * hours of progress. This module re-execs the script once at startup
 * with `--max-old-space-size=N` and `--expose-gc` set, then exits the
 * parent. Subsequent re-exec attempts no-op via the `_HEAP_BUMPED` env
 * flag.
 *
 * Usage — paste at the TOP of `main/<script>.js`, before any other
 * require() that could allocate:
 *
 *   require("../src/heap-bump")({ maxOldSpaceMb: 8192 });
 *   // ...rest of imports
 *
 * Tuning:
 *   - 4096   small to medium scans (< 50k entities)
 *   - 8192   default for full-instance scans
 *   - 16384  attachment migrations with large docx/PDF rendering
 *   - 24576  the upper bound for a 32 GB workstation; past this, split
 *            the run by project or by sub-plan (`docs/02-plan-manager.md`).
 *
 * The `--expose-gc` flag is set defensively so that hit-workers CAN call
 * `global.gc()` if profiling shows V8 is too lazy. In practice, diligent
 * `ref = null` after each hit is enough — the per-hit refs become
 * unreachable and V8 reclaims them on the next minor GC.
 */

function heapBump(opts = {}) {
  const maxOldSpaceMb = opts.maxOldSpaceMb || 8192;
  const exposeGc = opts.exposeGc !== false;
  const flagName = opts.flagName || "_HEAP_BUMPED";

  // Already bumped — caller invoked us inside the re-exec'd child
  if (process.env[flagName]) return;

  // User passed --max-old-space-size on the CLI already — respect it
  if (process.execArgv.some((a) => a.startsWith("--max-old-space-size"))) return;

  const { spawnSync } = require("child_process");
  const flags = [`--max-old-space-size=${maxOldSpaceMb}`];
  if (exposeGc) flags.push("--expose-gc");

  const args = [...flags, ...process.argv.slice(1)];
  const result = spawnSync(process.execPath, args, {
    stdio: "inherit",
    env: { ...process.env, [flagName]: "1" },
  });
  process.exit(result.status == null ? 1 : result.status);
}

module.exports = heapBump;
