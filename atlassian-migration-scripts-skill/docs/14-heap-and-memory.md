# Heap & Memory Management for Mega-Scale Scans

Migration scripts in this skill are designed for instance-wide sweeps: hundreds of thousands of issues, comments, attachments, ADF documents, multipart bodies, retry state, plan entries. The default Node heap (~1.5–2 GB on 64-bit Node) is **not enough**. A real run that crashes 4 hours in with `JavaScript heap out of memory` has wasted time and forces a resume from the last checkpoint. The defenses below are mandatory for any sub-project that scans more than ~10k entities.

## TL;DR

1. **Self-bump the heap** at the top of every `main/*.js` — `templates/heap-bumper.js`.
2. **Never hold the full plan in memory during scan** — append hits to a JSONL stream, finalize to plan JSON at the end.
3. **Snapshot then null** — capture only what the worker needs from a page response, then let the page reference go out of scope. Set per-hit variables to `null` after appending.
4. **Stream every CSV write** with `fs.openSync` + `fs.writeSync` — never `arr.join("\n") + fs.writeFileSync`.
5. **Stream every binary** — multipart uploads with a body factory (`templates/multipart-builder.js`); downloads with `pipeline(res, fs.createWriteStream)`.

## 1. Self-bumping heap

V8 will not raise its own ceiling. Re-exec the script once at startup with `--max-old-space-size=N` (and optionally `--expose-gc`) and exit the parent. The flag `_HEAP_BUMPED=1` prevents the child from re-execing again.

```javascript
// main/<script>.js — must be the FIRST line, before any other require()
require("../src/heap-bump")({ maxOldSpaceMb: 8192 });

const fs = require("fs");
// ...rest
```

Drop `templates/heap-bumper.js` into `src/heap-bump.js` (one file per sub-project so each can tune its own ceiling without affecting siblings).

| Workload | `maxOldSpaceMb` |
|---|---|
| Plan-only / small sync (< 10k entities) | default (no bump needed) |
| Plan + sync 10k–50k entities | 4096 |
| Full-instance scan, ADF surgery, or attachment-light | **8192** (default) |
| Attachment migrations with docx/PDF rendering | 16384 |
| 32 GB workstation upper bound | 24576 |

Past 24576, **don't keep raising** — split the run by project key, by date range, or by sub-plan (see `docs/02-plan-manager.md#sub-plan-splitting`). A 32 GB heap that swaps to disk is slower than two 12 GB processes on different shards.

### Why `--expose-gc` is set defensively

The flag exposes `global.gc()` so a worker can force a GC at hit boundaries. **In practice, you almost never need it** — V8's incremental GC keeps up fine if you release references diligently (next section). Set the flag anyway so future-you doesn't have to re-exec when profiling shows GC starvation.

### Pitfall: re-exec breaks Ctrl-C signal forwarding

The parent process exits immediately after spawning the bumped child. `spawnSync` with `stdio: "inherit"` propagates SIGINT correctly on macOS/Linux, but on Windows you may need to install a SIGBREAK handler on the parent that forwards to `result.pid`. None of the scripts in this library target Windows, so this hasn't been hit in production.

## 2. JSONL hit stream (memory-bounded plan build)

The naive plan-build holds `this.plan.issues[key] = {...}` in memory for every hit, then writes the whole tree at the end. On a 200k-issue scan with 5,975 hits (real number from `recover_truncated_content`), the plan object plus the V8 internal sizing overhead is enough to OOM an 8 GB heap. **Don't accumulate.**

Pattern (lifted from `src/planManager.js` in `recover_truncated_content`):

```javascript
class PlanManager {
  openHitsJsonl(runId) {
    this.hitsJsonlPath = path.join(this.planDir, `hits_${runId}.jsonl`);
    this.hitsJsonlFd = fs.openSync(this.hitsJsonlPath, "a");
  }

  appendHit(key, entry) {
    // One JSON object per line. Append-only. The hit becomes unreachable
    // as soon as the caller's local refs drop.
    fs.writeSync(this.hitsJsonlFd, JSON.stringify({ key, ...entry }) + "\n");
  }

  async finalizePlanFromJsonl(runId) {
    // Two-pass streamed read: pass 1 computes stats, pass 2 writes plan.json.
    // Neither pass holds the full set in memory.
    const planFile = path.join(this.planDir, `plan_${runId}.json`);
    const readline = require("readline");

    // pass 1 — stats
    let total = 0;
    const counts = { pending: 0, completed: 0, failed: 0, skipped: 0 };
    const rl1 = readline.createInterface({ input: fs.createReadStream(this.hitsJsonlPath) });
    for await (const line of rl1) {
      if (!line.trim()) continue;
      try {
        const e = JSON.parse(line);
        total++;
        if (counts[e.status] !== undefined) counts[e.status]++;
      } catch { /* skip */ }
    }

    // pass 2 — write plan JSON line-by-line, never building it in memory
    const fd = fs.openSync(planFile, "w");
    fs.writeSync(fd, `{\n"version":"1.0","stats":${JSON.stringify({ total, ...counts })},\n"issues":{\n`);
    const rl2 = readline.createInterface({ input: fs.createReadStream(this.hitsJsonlPath) });
    let written = 0;
    for await (const line of rl2) {
      if (!line.trim()) continue;
      let e;
      try { e = JSON.parse(line); } catch { continue; }
      const key = e.key; delete e.key;
      const sep = written === 0 ? "" : ",\n";
      fs.writeSync(fd, `${sep}${JSON.stringify(key)}:${JSON.stringify(e)}`);
      written++;
    }
    fs.writeSync(fd, "\n}\n}");
    fs.closeSync(fd);
    return { planFile, total, ...counts };
  }
}
```

The CSV summary uses the same two-pass JSONL → CSV pattern. Both files end up complete and correct without ever buffering the full set.

### When you can skip JSONL

For a sync sub-project that finds < 20k hits and writes < 100 KB per entry, the in-memory plan is fine. Switch to JSONL when:

- Your hit count is > 50k, OR
- Per-entry payload includes large strings (ADF JSON, rendered HTML, embedded base64), OR
- You've seen `Allocation failed` once.

## 3. Snapshot-then-null (per-hit memory release)

A common leak: the scan loop holds a reference to the current Jira API response page (which contains 100 issues' full payload including descriptions and comments), and dispatches a worker that closes over the whole page. While the worker runs, the page can't be GC'd — and pages pile up if the worker pool is slower than pagination.

Wrong:
```javascript
for await (const issue of dcClient.iterateProjectIssues(projectKey)) {
  spawn(async () => {
    // `issue` is captured — V8 keeps the entire 100-issue page alive
    // until the last worker completes
    await processHit(issue);
  });
}
```

Right — snapshot only what the worker needs, immediately:
```javascript
for await (const issue of dcClient.iterateProjectIssues(projectKey)) {
  const ctx = {
    dcKey: issue.key,
    descOver: isOverCap(issue.fields?.description),
    dcDescription: issue.fields?.description,
    inlineComments: issue.fields?.comment?.comments || [],
    totalCmts: issue.fields?.comment?.total,
  };
  // `issue` falls out of scope at end-of-block; the rest of the page
  // becomes eligible for GC as soon as the iterator yields the next one.

  await awaitSlot();
  spawn(() => processHit(ctx));
}
```

And inside the worker, null out the heavy refs after the JSONL append:
```javascript
async function processHit(ctx) {
  let dcRendered = await dcClient.getIssueWithRenderedBodies(ctx.dcKey);
  let docxComments = mergeRendered(ctx.inlineComments, dcRendered.comments);
  // ... build docx, upload, append plan entry ...

  planManager.appendHit(ctx.cloudKey, { ... });

  // Explicit release for V8 — the function is async and may sit on the
  // event loop after the await; locals stay alive until the next tick
  // unless we drop them.
  dcRendered = null;
  docxComments = null;
}
```

The `= null` is not superstition — V8's escape analysis can pin a closure variable for the full lifetime of an `async` function if any inner promise references it. Nulling forces unreachability at a known point.

## 4. Streaming CSV writers

Building the CSV in memory (`rows.map(toLine).join("\n")`) on a 100k-row summary is a 50–200 MB allocation that dies on the V8 string size limit (~500 MB) before it dies on the heap limit. Always stream:

```javascript
function writeStreamedCsv(path, header, rowsSource) {
  const fd = fs.openSync(path, "w");
  try {
    fs.writeSync(fd, header + "\n");
    for (const row of rowsSource()) {
      fs.writeSync(fd, row + "\n");
    }
  } finally {
    fs.closeSync(fd);
  }
}
```

`rowsSource()` is a generator that yields formatted rows. For CSV-from-JSONL, the generator wraps a `readline.createInterface` — same two-pass pattern as plan finalization. See `recover_truncated_content/src/recoveryProcessor.js#_writeTruncationSummaryFromJsonl`.

## 5. Streaming binaries

Already documented in `docs/28-adf-and-attachments.md` and `templates/multipart-builder.js`. The two rules:

- **Upload**: body factory pattern returns a fresh `Readable` for every retry. Never `Buffer.concat([head, fileContents, tail])` — that buffers the file in RAM and cannot be retried.
- **Download**: `pipeline(res, fs.createWriteStream(tmpPath))`. Never accumulate chunks in an array and `Buffer.concat` at the end.

A single 50 MB attachment processed naively is 50 MB resident; 4 concurrent attachments is 200 MB; 10 concurrent on a 16 GB heap with multipart + ADF + plan + caches is enough to OOM. Stream both directions.

## 6. Append-only checkpoint instead of in-memory Set

Project completion records — used to skip already-processed projects on resume — are also a memory trap if accumulated as objects. The right shape is a JSONL "checkpoint" file:

```javascript
// During scan:
appendCheckpoint(logDir, { projectKey, scanned, hits, status, completedAt });

// On resume:
const { doneKeys } = loadCheckpoint(logDir); // Set<string> of project keys
if (doneKeys.has(projectKey)) continue;
```

The Set holds project KEYS only (small strings), not the per-project hit list. See `recover_truncated_content/src/projectIterator.js`.

## 7. When `global.gc()` is justified

Rare. The two cases:

1. **A long-running scan with periodic peaks** — e.g. after each project, you've just released a few hundred MB of per-project state. Calling `global.gc()` once between projects forces a full major GC immediately rather than waiting for V8 to notice. Reduces peak RSS by 20–30%.
2. **You're inside a hot loop that V8's heuristics misread as "still hot"** — V8 backs off GC frequency when it sees rapid allocation cycles. If your worker rate is fast enough to keep the new-space full, manual `gc()` every N hits lets old-space pressure drop.

Both require `--expose-gc` (set by `templates/heap-bumper.js`). Diagnose with `--trace-gc` first — most "I need to call gc()" intuitions are wrong and the actual fix is a leaked reference somewhere.

```javascript
// Between projects, after the in-flight workers have drained
if (typeof global.gc === "function") {
  global.gc();
  this.log(`  RSS after gc: ${(process.memoryUsage().rss / 1024 / 1024).toFixed(0)} MB`);
}
```

## 8. Monitoring memory in the log

The progress contract (`docs/13-running-and-monitoring.md`) lets an agent observe the run from outside. Add a memory line to your periodic progress log so the agent can flag a leak early:

```javascript
if (scanned % 1000 === 0) {
  const m = process.memoryUsage();
  this.log(
    `  [${projectKey}] scanned=${scanned} heap=${(m.heapUsed/1024/1024).toFixed(0)}MB rss=${(m.rss/1024/1024).toFixed(0)}MB`,
  );
}
```

If `heapUsed` grows monotonically across N progress lines and the workload per line is constant, there's a leak — usually a captured reference or an unbounded cache. See section 3.

## 9. The OOM postmortem

If a script does crash with OOM, these are the lines to grep before re-running:

```bash
# In logs/<script>_<ts>.log
grep -E "RSS after gc|heap=|scanned=" logs/last.log | tail -50
# Look for monotonic heap growth without a corresponding scanned-rate slowdown.

# In the system journal (macOS)
log show --predicate 'process == "node"' --last 1h | grep -i memory

# Check if --max-old-space-size actually applied
node -e 'console.log(v8.getHeapStatistics().heap_size_limit / 1024 / 1024 + " MB")'
# Should match `maxOldSpaceMb` from heap-bumper. If it doesn't, the
# re-exec failed or you set the flag in the wrong place.
```

If the bump didn't apply: heap-bumper.js must be the FIRST require() in `main/*.js`, before `dotenv`, before any other module. The check `process.execArgv.some(...)` looks at execArgv only at startup; any later child or worker_thread inherits but doesn't re-check.

## See also

- [`02-plan-manager.md`](02-plan-manager.md) — `_streamWritePlan`, sub-plan splitting
- [`08-concurrency-and-pool.md`](08-concurrency-and-pool.md) — worker count interacts with memory pressure
- [`13-running-and-monitoring.md`](13-running-and-monitoring.md) — log contract; how an agent reads memory progress lines
- [`24-production-patterns.md`](24-production-patterns.md) — patterns 19 (sub-plan split), 31 (streaming multipart), 32 (streaming download)
- [`28-adf-and-attachments.md`](28-adf-and-attachments.md) — streaming attachment pipeline
- [`templates/heap-bumper.js`](../templates/heap-bumper.js)
- [`templates/multipart-builder.js`](../templates/multipart-builder.js)
