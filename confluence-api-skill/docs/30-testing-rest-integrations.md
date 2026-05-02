# Testing REST Integrations (Confluence Cloud)

How to test code that calls the Confluence Cloud REST API without paying the cost of slow, rate-limited, side-effecting calls on every test run.

## Three layers

| Layer | What it tests | Speed | Reality |
|---|---|---|---|
| **Unit** with mocked HTTP | Your client logic, CQL building, ADF construction, error mapping | <100 ms | Mocked — tests pass even when Atlassian is down |
| **Contract** against fixtures | The shapes your code expects haven't drifted | <1 s | Fixtures captured from a real Atlassian site |
| **Integration** against a sandbox | Auth, scopes, end-to-end flows | seconds | Real Atlassian cloud-dev tenant; rate-limited |

Run all three. Unit tests on every commit, contract tests on every PR, integration tests in nightly CI or pre-release.

## Unit tests with `nock` (Node)

```javascript
import nock from 'nock';
import { listAll, updatePageBody } from '../src/confluence-client';

beforeEach(() => nock.cleanAll());

it('paginates via _links.next', async () => {
  nock('https://example.atlassian.net')
    .get('/wiki/api/v2/spaces/SP1/pages?limit=100')
    .reply(200, {
      results: [{ id: '1' }, { id: '2' }],
      _links: { next: '/wiki/api/v2/spaces/SP1/pages?limit=100&cursor=PAGE2' },
    });
  nock('https://example.atlassian.net')
    .get('/wiki/api/v2/spaces/SP1/pages?limit=100&cursor=PAGE2')
    .reply(200, { results: [{ id: '3' }], _links: {} });

  const ids = [];
  for await (const p of listAll('/wiki/api/v2/spaces/SP1/pages?limit=100')) ids.push(p.id);
  expect(ids).toEqual(['1', '2', '3']);
});

it('bumps version.number on update', async () => {
  nock('https://example.atlassian.net')
    .get('/wiki/api/v2/pages/PAGE1?body-format=atlas_doc_format')
    .reply(200, { id: 'PAGE1', title: 'T', spaceId: 'SP1', status: 'current', version: { number: 7 } });

  let putBody;
  nock('https://example.atlassian.net')
    .put('/wiki/api/v2/pages/PAGE1', (body) => { putBody = body; return true; })
    .reply(200, {});

  await updatePageBody('PAGE1', { type: 'doc', version: 1, content: [] });
  expect(putBody.version.number).toBe(8);
});
```

## Contract tests with captured fixtures

Capture once from a sandbox; replay in CI:

```javascript
// tools/capture-fixtures.js — run by hand
import fetch from 'node-fetch';
import fs from 'fs';

const auth = Buffer.from(`${EMAIL}:${TOKEN}`).toString('base64');
const r = await fetch(
  'https://your-sandbox.atlassian.net/wiki/api/v2/pages/123456?body-format=atlas_doc_format',
  { headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' } },
);
fs.writeFileSync('test/fixtures/page-123456.json', JSON.stringify(await r.json(), null, 2));
```

Then in tests:

```javascript
import fixture from '../test/fixtures/page-123456.json';

it('parses an ADF page body', () => {
  const adf = JSON.parse(fixture.body.atlas_doc_format.value);
  expect(adf.type).toBe('doc');
  expect(adf.version).toBe(1);
});
```

## Integration tests against a sandbox

Use a dedicated **dev tenant** with a `TEST` space you control. Tag every artifact your test creates with a run id, then sweep on teardown:

```javascript
const RUN_ID = `it-${process.env.GITHUB_RUN_ID ?? Date.now()}`;
const created = [];

afterAll(async () => {
  // Trash every page this run created (newest first to avoid hierarchy issues)
  for (const id of created.reverse()) {
    await fetch(`${BASE}/wiki/api/v2/pages/${id}`, { method: 'DELETE', headers: authHeader });
  }
});

it('creates a page with idempotency', async () => {
  const r = await createPageIdempotent(
    { spaceId: 'TEST', title: `IT page ${RUN_ID}`, body: { type: 'doc', version: 1, content: [] } },
    `${RUN_ID}-1`,
  );
  created.push(r.id);
  expect(r.dedup).toBe(false);

  const r2 = await createPageIdempotent(
    { spaceId: 'TEST', title: `IT page ${RUN_ID}`, body: { type: 'doc', version: 1, content: [] } },
    `${RUN_ID}-1`,
  );
  expect(r2.dedup).toBe(true);
  expect(r2.id).toBe(r.id);
});
```

## Mocking auth

Don't put real tokens in tests. Inject a tiny `getToken()` for unit tests:

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
const client = makeClient({
  getToken: async () => 'fake-token',
  baseUrl: 'https://example.atlassian.net',
});
```

## ADF round-trip tests

If you build ADF, snapshot it:

```javascript
import { paragraph, heading, doc } from '../src/adf';

it('builds the expected ADF for a release-notes page', () => {
  const ast = doc(heading(2, /*text*/ 'Highlights'), paragraph('Shipped X.'));
  expect(ast).toMatchSnapshot();
});
```

Snapshots catch unintentional changes to your ADF construction without requiring you to assert every node by hand.

## Smoke tests in CI

A 30-second smoke test that the integration is alive:

```bash
# scripts/test-auth.sh — bundled with this skill
./scripts/test-auth.sh
```

This hits `/wiki/api/v2/spaces?limit=1` with your CI's auth credentials and fails the build on `401`.

## What to mock vs not

| Mock | Don't mock |
|---|---|
| HTTP responses (use `nock` / `msw`) | Time (use real `setTimeout` + Jest fake timers when asserting backoff) |
| OAuth token fetches | JSON parsing of real fixtures |
| Webhook signatures | The actual HMAC algorithm |
| Rate-limit responses | Your retry logic itself |

## Common pitfalls

- **Tests pass locally, fail in CI**: tokens with different scopes. Use the same client_id / API token in both, or skip integration tests when env vars are missing.
- **"Page created twice in CI"**: missing idempotency key. See `24-rest-integration-patterns.md` §3.
- **Slow test suite**: integration tests for everything. Move to contract+unit; keep integration to flagship flows.
- **Captured fixtures drift**: re-capture quarterly or when contract tests fail.
- **Sandbox tenant cleanup forgotten**: tag every artifact with a run id, sweep on teardown.

## See also

- `24-rest-integration-patterns.md` — production patterns (your unit tests should cover these)
- `27-rate-limits-and-quotas.md` — rate-limit headers your tests should assert on
- https://developer.atlassian.com/cloud/confluence/rest/v2/ — the canonical surface
