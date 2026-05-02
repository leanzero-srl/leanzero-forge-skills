# Testing REST Integrations (Jira Cloud)

How to test code that calls the Jira Cloud REST API without paying the cost of slow, rate-limited, side-effecting calls on every test run.

## Three layers

| Layer | What it tests | Speed | Reality |
|---|---|---|---|
| **Unit** with mocked HTTP | Your client logic, JQL building, ADF construction, error mapping | <100 ms | Mocked — tests pass even when Atlassian is down |
| **Contract** against fixtures | The shapes your code expects haven't drifted | <1 s | Fixtures captured from a real Atlassian site |
| **Integration** against a sandbox | Auth, scopes, end-to-end flows | seconds | Real Atlassian cloud-dev tenant; rate-limited |

Run all three. Unit tests on every commit, contract tests on every PR, integration tests in nightly CI or pre-release.

## Unit tests with `nock` (Node)

```javascript
import nock from 'nock';
import { searchAll } from '../src/jira-client';

describe('searchAll', () => {
  beforeEach(() => nock.cleanAll());

  it('paginates via nextPageToken', async () => {
    nock('https://example.atlassian.net')
      .post('/rest/api/3/search/jql')
      .reply(200, {
        issues: [{ key: 'PROJ-1' }, { key: 'PROJ-2' }],
        nextPageToken: 'page-2',
      });
    nock('https://example.atlassian.net')
      .post('/rest/api/3/search/jql')
      .reply(200, { issues: [{ key: 'PROJ-3' }], nextPageToken: null });

    const keys = [];
    for await (const i of searchAll('project = PROJ')) keys.push(i.key);
    expect(keys).toEqual(['PROJ-1', 'PROJ-2', 'PROJ-3']);
  });

  it('honors Retry-After on 429', async () => {
    nock('https://example.atlassian.net')
      .post('/rest/api/3/search/jql')
      .reply(429, { errorMessages: ['rate limited'] }, { 'Retry-After': '1' });
    nock('https://example.atlassian.net')
      .post('/rest/api/3/search/jql')
      .reply(200, { issues: [], nextPageToken: null });

    const out = [];
    for await (const i of searchAll('project = PROJ')) out.push(i);
    expect(out).toEqual([]);
  });
});
```

## Contract tests with captured fixtures

Capture real responses from a sandbox tenant once, replay them in CI:

```javascript
// tools/capture-fixtures.js — run once, by hand
import fetch from 'node-fetch';
import fs from 'fs';

const auth = Buffer.from(`${EMAIL}:${TOKEN}`).toString('base64');
const r = await fetch('https://your-sandbox.atlassian.net/rest/api/3/issue/PROJ-1', {
  headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
});
fs.writeFileSync('test/fixtures/issue-PROJ-1.json', JSON.stringify(await r.json(), null, 2));
```

Then in tests:

```javascript
import fixture from '../test/fixtures/issue-PROJ-1.json';

it('parses an issue', () => {
  const issue = parseIssue(fixture);
  expect(issue.summary).toBe('Login button broken in Safari');
});
```

Re-capture fixtures whenever the API surface changes (rare for v3) or your test tenant's data changes.

## Integration tests against a sandbox

Use a dedicated **dev tenant** (free tier is fine) with a project named `TEST` you control. Tag every issue your test creates so you can clean up:

```javascript
const RUN_ID = `it-${process.env.GITHUB_RUN_ID ?? Date.now()}`;

afterAll(async () => {
  // Delete every issue this run created
  for await (const issue of searchAll(`labels = "${RUN_ID}"`, ['key'])) {
    await callJira(`/rest/api/3/issue/${issue.key}`, { method: 'DELETE' });
  }
});

it('creates and transitions an issue', async () => {
  const created = await createIssueIdempotent(
    { projectKey: 'TEST', fields: { summary: 'IT issue', issuetype: { name: 'Task' }, labels: [RUN_ID] } },
    `${RUN_ID}-1`,
  );
  expect(created.key).toMatch(/^TEST-/);
  // ... transitions, comments ...
});
```

## Mocking auth in unit tests

Don't put real tokens in tests. Inject a tiny `getToken()` for unit tests; use the real one in integration:

```javascript
export function makeClient({ getToken, baseUrl }) {
  return {
    async call(path, init = {}) {
      const token = await getToken();
      return fetch(`${baseUrl}${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${token}`, ...init.headers },
      });
    },
  };
}

// In unit tests:
const client = makeClient({ getToken: async () => 'fake-token', baseUrl: 'https://example.atlassian.net' });
```

## Smoke tests in CI

A 30-second smoke test that the integration is alive:

```bash
# scripts/test-auth.sh — bundled with this skill
./scripts/test-auth.sh
```

This hits `/rest/api/3/myself` with your CI's auth credentials and fails the build on `401`.

## What to mock vs not

| Mock | Don't mock |
|---|---|
| HTTP responses (use `nock` / `msw`) | Time (use real `setTimeout` + Jest's fake timers when asserting backoff) |
| OAuth token fetches | JSON parsing of real fixtures |
| Webhook signatures | The actual HMAC algorithm |
| Rate-limit responses | Your retry logic itself |

## Common pitfalls

- **Tests pass locally, fail in CI**: tokens with different scopes. Use the same client_id / API token in both, or skip integration tests when env vars are missing.
- **"Issue created twice in CI"**: missing idempotency key. See `24-rest-integration-patterns.md` §3.
- **Slow test suite**: integration tests for everything. Move to contract+unit; keep integration to flagship flows.
- **Captured fixtures drift**: re-capture quarterly or when you see contract-test failures.
- **Sandbox tenant cleanup forgotten**: tag every test artifact with a run id, sweep on teardown.

## See also

- `24-rest-integration-patterns.md` — production patterns (your unit tests should cover these)
- `27-rate-limits-and-quotas.md` — rate-limit headers your tests should assert on
- https://developer.atlassian.com/cloud/jira/platform/rest/v3/ — the canonical surface
