# Testing Migration Scripts

Migration scripts run a handful of times against production and then die. The cost-benefit of conventional unit testing is poor — by the time you've achieved meaningful coverage, the script has already finished its job. What matters is:

1. **The plan phase is correct** (the CSV preview catches bugs before mutation).
2. **The retry logic doesn't double-mutate** (no silent duplication).
3. **Re-running is safe** (re-runs converge, don't diverge).

This doc shows the lightweight test patterns that actually catch bugs at this scale.

## The minimum: a dry-run end-to-end

Every script template supports `--dry-run`. Use it. The flow:

```bash
# Build a plan against staging
node main/plan.js --space STAGING --limit 200

# Dry-run the sync — every PUT is logged but not sent
node main/sync.js --plan-file logs/plan_*.json --dry-run

# Inspect the logs/sync_*.log and logs/failed_*.csv
```

This catches:

- Auth misconfiguration (the client's `testConnection` runs).
- Plan-schema bugs (entries without expected fields explode loudly).
- Pagination bugs (you'd see "0 entries processed" or a wildly wrong count).
- Identity resolution failures (logged as `multiMatch` or `miss`).

Run dry-run against staging, fix any issues, then dry-run against production before doing a real run. The same plan flows through both.

## `nock` fixtures for unit tests

When a domain processor (e.g. macro rewriting, ADF surgery) gets complex enough to deserve isolated tests, record real Cloud responses with [`nock`](https://github.com/nock/nock) and replay them:

```javascript
// tests/macro-rewrite.test.js
const nock = require("nock");
const CloudConfluenceClient = require("../src/cloudConfluenceClient");

beforeEach(() => {
  nock("https://your-site.atlassian.net")
    .get("/wiki/rest/api/content/12345?expand=body.storage,version,space")
    .reply(200, require("./fixtures/page-12345.json"));
});

test("rewrite deck → tab-group", async () => {
  const cf = new CloudConfluenceClient("https://your-site.atlassian.net/wiki", "x@y.z", "tkn");
  const result = await cf.getPageStorage("12345");
  expect(result.body.storage.value).toMatch(/ac:name="deck"/);
});
```

Capture fixtures by hand the first time:

```javascript
// Run once with a real token, save the response, replace token in fixture.
const real = await cf.getPageStorage("12345");
fs.writeFileSync("tests/fixtures/page-12345.json", JSON.stringify(real, null, 2));
```

The fixtures live in `tests/fixtures/` and are checked in. They don't go stale until Atlassian changes the response shape — when that happens, regenerate.

## Replaying a saved plan

Saved plans are excellent end-to-end test fixtures. To replay one for testing:

```javascript
// tests/sync-pipeline.test.js
test("processes pending entries from real plan", async () => {
  // Mock the API
  nock("https://your-site.atlassian.net")
    .put(/\/rest\/api\/3\/issue\/.*/)
    .reply(204);

  // Use a real plan from a past run, in DRY-RUN mode
  const { runSync } = require("../src/syncPipeline");
  const result = await runSync({
    planFile: "tests/fixtures/plan_1700000000000.json",
    dryRun: true,
    confirm: false,
  });

  expect(result.processed).toBe(50);
  expect(result.failed).toBe(0);
});
```

## Idempotency assertion

The most valuable single test: running the sync twice produces the same result.

```javascript
test("sync is idempotent", async () => {
  const planFile = "tests/fixtures/plan-X.json";
  await runSync({ planFile, confirm: true });
  const stats1 = pm.getPlanSummary();
  await runSync({ planFile, confirm: true });   // second run
  const stats2 = pm.getPlanSummary();
  expect(stats2.completed).toBe(stats1.completed);
  expect(stats2.failed).toBe(stats1.failed);
});
```

Mock the API to track call counts. Idempotency means the second run should produce zero additional API writes (the first run completed everything; the second sees all `completed` and short-circuits).

## Seed-locked audit reproducibility

The audit script's seeded RNG is deterministic. Pin a seed in tests:

```javascript
test("audit picks the same sample for seed=42", () => {
  const sample = seededSample(pool, 10, 42);
  expect(sample.map((e) => e[0])).toEqual([
    "ABC-1", "ABC-7", "ABC-3", "ABC-19", ...
  ]);
});
```

This catches accidental changes to the RNG implementation.

## What NOT to test

- **HTTP retry timing.** Don't unit-test that the delay is exactly 5s × 2^n. The retry logic is shared across all clients and is small enough to read. If it breaks, every script catches it; specific tests aren't worth maintaining.
- **CSV escaping.** RFC 4180 isn't ambiguous. The `csv-writer.js` template is short enough to inspect.
- **PlanManager file I/O.** Test the API contracts (`addEntry`, `getEntriesToProcess`), not the disk layout.

## CI integration

A minimal CI for a migration script:

```yaml
# .github/workflows/test.yml
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22' }
      - run: npm ci
      - run: npm test                         # unit tests against nock fixtures
      - run: node -e "require('./src/planManager.js')"
      - run: bash scripts/lint-plan-file.sh tests/fixtures/plan_*.json
```

No credentials needed; everything runs against fixtures.

## Smoke-testing a brand-new sub-project

Before your first real run:

```bash
./scripts/preflight-check.sh
./scripts/test-auth.sh

# Build a plan against ONE entity (lowest-risk)
node main/plan.js --space TESTSPACE --limit 1

# Dry-run the sync
node main/sync.js --plan-file logs/plan_*.json --dry-run

# Audit the dry-run (should report 0 entries — dry-run skipped everything)
node main/audit.js --plan-file logs/plan_*.json
```

If any of the four commands above fails, fix it before scaling up. The cost of "one-entity smoke test" is approximately zero.

## See also

- [`01-core-concepts.md`](01-core-concepts.md) — the safety gates that make testing cheap
- [`02-plan-manager.md`](02-plan-manager.md) — what to inspect in a saved plan
- [`07-audit-and-sampling.md`](07-audit-and-sampling.md) — the audit phase is itself a test
