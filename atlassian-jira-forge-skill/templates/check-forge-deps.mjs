#!/usr/bin/env node
/**
 * DEPENDENCY INTEGRITY — run this as the FIRST line of your deploy script.
 *
 * `forge deploy` bundles whatever is in node_modules. If anything has replaced
 * an @forge package with a local test double — an agent running app modules
 * under plain node, a half-finished offline harness, an `npm link` — that
 * double is what SHIPS, and every other check passes: lint (valid JS), webpack
 * (bundles it happily), `forge lint` (reads the manifest, not the dependency
 * tree), and the unit suite (which stubs those packages itself and never loads
 * the real ones, so a green suite is evidence about the stubs).
 *
 * Observed 26 Aug 2026 on a production Forge app: a stubbed @forge/kvs turned
 * storage into an in-memory Map that EVERY FUNCTION HAD ITS OWN COPY OF — a
 * resolver wrote a key and the async consumer read undefined for minutes, every
 * prefix query returned zero results, batchGet did not exist, and @forge/llm
 * threw on every call. It was diagnosed as an Atlassian incident for two hours.
 * The tell was `"version": "0.0.0"` in the package's own package.json.
 *
 * Copy to scripts/check-forge-deps.mjs, add the packages your app cannot live
 * without, and call it before `forge deploy`.
 *
 *     echo "🔒 Checking dependency integrity..."
 *     node scripts/check-forge-deps.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const lock = JSON.parse(readFileSync(join(ROOT, "package-lock.json"), "utf8"));

/** The packages whose stubbing is silent and catastrophic. */
const CRITICAL = [
  "@forge/api",
  "@forge/kvs",
  "@forge/llm",
  "@forge/events",
  "@forge/resolver",
  "@forge/bridge",
];

const STUB_MARKERS = [/stubbed out/i, /replaced in this harness/i, /fake (kvs|llm|api)/i];

const problems = [];
for (const name of CRITICAL) {
  const dir = join(ROOT, "node_modules", name);
  if (!existsSync(dir)) {
    problems.push(`${name} is not installed`);
    continue;
  }
  const expected = lock.packages?.[`node_modules/${name}`]?.version;
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  } catch {
    problems.push(`${name} has no readable package.json`);
    continue;
  }
  if (expected && pkg.version !== expected) {
    problems.push(`${name} is ${pkg.version}, the lock file says ${expected}`);
  }
  // A stub is small, so its entry point is the cheapest place to look.
  const entry = pkg.main ? join(dir, pkg.main) : join(dir, "index.js");
  if (existsSync(entry)) {
    const src = readFileSync(entry, "utf8").slice(0, 4000);
    for (const re of STUB_MARKERS) {
      if (re.test(src)) problems.push(`${name}'s entry point looks like a STUB (matched ${re})`);
    }
  }
}

if (problems.length > 0) {
  console.error("\n❌ DEPENDENCY INTEGRITY CHECK FAILED — nothing was deployed.\n");
  for (const p of problems) console.error(`   - ${p}`);
  console.error(
    "\n   Something replaced a package in node_modules. Run `npm ci` and try again.\n" +
      "   Deploying a stubbed @forge package ships an app whose storage is an\n" +
      "   in-memory Map and whose model calls throw.\n",
  );
  process.exit(1);
}
console.log(`✅ dependency integrity: ${CRITICAL.length} critical packages match the lock file`);
