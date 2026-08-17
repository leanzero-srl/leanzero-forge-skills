# Forge AI & LLM Integration

Two ways to add an LLM to a Forge app, and the cost/safety scaffolding both need:

1. **Forge-hosted LLMs** (`@forge/llm`) — Claude served inside Atlassian, no key, no egress, keeps the **"Runs on Atlassian"** badge.
2. **BYOK** — your code calls OpenAI / Anthropic / Azure / OpenRouter / AWS Bedrock / self-hosted, which needs an egress declaration and the user's own key.

Grounded in **lz-ppm-forge** (`src/resolvers/ai-resolvers.js` — cost guards), **CogniRunner** (`src/async-handler.js` — BYOK adapter, `manifest.yml` — `llm` module), and the `claude-api` skill (model ids).

## `@forge/llm` — the hosted path

> **Preview** as of 2026-06. Can be enabled in production. Supports **Claude Haiku, Sonnet, and Opus** at the platform level. No external egress, so the app keeps the **"Runs on Atlassian"** badge.

```yaml
# manifest.yml — adding this module is a MAJOR version bump + admin re-consent
modules:
  llm:
    - key: cogni-llm
      model:
        - claude          # family name; Atlassian maps it to a Forge-hosted Claude model
```

```javascript
import { chat, list } from '@forge/llm';

// chat() is OpenAI-chat-completions-shaped. There is no response_format in Preview —
// enforce JSON via a system message and parse tolerantly.
const sys = jsonMode
  ? systemPrompt + '\n\nRespond with ONLY a valid JSON object. No markdown fences, no prose.'
  : systemPrompt;
const res = await chat({
  model: 'claude',                       // or a snapshot id; the family name is safest
  messages: [
    ...(sys ? [{ role: 'system', content: sys }] : []),
    { role: 'user', content: userMessage },
  ],
  max_completion_tokens: 4096,
});
let content = res?.choices?.[0]?.message?.content;
if (Array.isArray(content))              // some responses come back as content parts
  content = content.filter((p) => p?.type === 'text').map((p) => p.text || '').join('');
const tokens = res?.usage?.total_tokens
  || (res?.usage?.input_tokens || 0) + (res?.usage?.output_tokens || 0);
```

Notes from production (CogniRunner `async-handler.js` `callAIChatSimple`, `atlassian` branch):
- **Adding the `llm` module is a major version upgrade** — existing installs must approve the update. Observed consistently across CogniRunner, lz-ppm, and Sentinel Vault; treat it as expected behaviour.
- **All token usage is billed to the app vendor's Forge bill** — there is no free quota. Cost-guard it (below).
- Errors surface as `ForgeLlmAPIError` with top-level `.status` / `.message` (no `.context`).
- Apps that restrict to Haiku (lz-ppm, Sentinel Vault) do so as a **cost choice**, not a platform limit.

### Model ids (use these verbatim — from the `claude-api` skill)

| Family | Bare alias | Snapshot | Context | Price (in/out per MTok) |
|---|---|---|---|---|
| Claude Haiku 4.5 | `claude-haiku-4-5` | `claude-haiku-4-5-20251001` | 200K | $1 / $5 |
| Claude Sonnet 4.6 | `claude-sonnet-4-6` | — | 200K | — |
| Claude Opus 4.8 | `claude-opus-4-8` | — | 200K | — |

In a `llm` manifest module the value is the **family name** `claude`. Never invent a dated suffix for a bare alias — `claude-haiku-4-5-20251001` is the one real dated Haiku id. See the `claude-api` skill for the current pricing/limits.

## Three-layer cost guard (advisory AI)

lz-ppm's optional AI plan review is **OFF by default** and **advisory-only** (never mutates the schedule). Every paid call goes through three guards, enforced *before any spend* (`src/resolvers/ai-resolvers.js`):

**Layer 1 — admin kill-switch + caps.** Config in KVS (`cfg:ai`), default `enabled:false`, plus soft monthly/daily review caps:

```javascript
const cfg = await getCfg();              // { enabled:false, monthlyCap:500, dailyCap:100 }
if (!cfg.enabled) return { enabled: false };
// ... cap check BEFORE the LLM call:
if (cfg.monthlyCap > 0 && monthMeter.reviews >= cfg.monthlyCap)
  return { enabled: true, capReached: true, scope: 'month' };
```

**Layer 2 — result cache, TTL-bounded, keyed by content hash + plan + account.** An unchanged re-review is a free hit (no LLM, no meter):

```javascript
const cacheKey = `cfg:ai:cache:${planId}:${accountId}:${hashSummary(summary)}`;
// hashSummary = pure-JS FNV-1a of JSON.stringify(summary) + length (no crypto import)
const cached = await kvs.get(cacheKey);
if (cached?.result && Date.now() - cached.at < CACHE_TTL_MS) // 10 min
  return { enabled: true, cached: true, ...cached.result };
```

**Cache ONLY complete, clean results** — never an error or a truncated answer, or a cut-off review freezes and gets re-served as authoritative:

```javascript
if (!result.error && !result.parseError && !result.incomplete)
  await kvs.set(cacheKey, { result, at: Date.now() });
```

**Layer 3 — token metering, best-effort.** Count only **billable round-trips** (`usage` present == the LLM was called and charged, even on a parse failure). Cached / cap / empty paths never reach the meter. A meter write must **never fail the review**:

```javascript
if (result.usage) {
  try {
    monthMeter.reviews += 1;
    monthMeter.inputTokens  += result.usage.input_tokens  || 0;
    monthMeter.outputTokens += result.usage.output_tokens || 0;
    await kvs.set(monthKey, monthMeter);
  } catch { /* meter is best-effort; never fail the review on a meter write */ }
}
```

Usage is exposed read-only to the admin UI (`getAiConfig` returns `monthlyRemaining` / `dailyRemaining`). See `templates/forge-llm-cost-guard.js` for the full guarded wrapper.

## BYOK multi-provider adapter

CogniRunner ships a unified, OpenAI-shaped `callAIChat` that translates per provider. Provider selection and keys live in KVS:

| Key | Meaning |
|---|---|
| `COGNIRUNNER_AI_PROVIDER` | active provider (`atlassian` is the keyless default) |
| `COGNIRUNNER_KEY_<provider>` | per-provider API key (use `setSecret`) |
| `COGNIRUNNER_MODEL_<provider>` | per-provider model id |
| `COGNIRUNNER_AI_BASE_URL` | user base URL (Azure / LM Studio / custom) |

Per-provider slots mean switching provider **doesn't delete** the other's key — switching back is instant. A legacy single-key slot is migrated on read.

### Per-provider request translation

All providers normalise to `{ ok, content, tokens }`. The differences that matter (CogniRunner `async-handler.js:223-378`):

| Provider | Endpoint / call | Auth header | Body shape notes |
|---|---|---|---|
| **Forge LLM** (`atlassian`) | `@forge/llm` `chat()` | none | OpenAI-shaped; JSON via system msg; keyless |
| **OpenAI** | `POST {base}/chat/completions` | `Authorization: Bearer` | `response_format` JSON works |
| **Azure** | `POST {base}/chat/completions` | `api-key` | deployment-name as model; user base URL |
| **OpenRouter** | `POST {base}/chat/completions` | `Authorization: Bearer` | add `HTTP-Referer` + `X-Title`; skip `response_format` (many upstream models reject it) |
| **Anthropic** | `POST {base}/v1/messages` | `x-api-key` + `anthropic-version: 2023-06-01` | top-level `system`; **`max_tokens` REQUIRED**; reply in `content[].text` |
| **AWS Bedrock** | `POST {base}/model/{model}/converse` | `Authorization: Bearer` | Converse API; `inferenceConfig.maxTokens`; region-derived URL; **don't `encodeURIComponent` the model id** (ids contain `:`, e.g. `…-v1:0`); cross-region inference-profile ids (e.g. `eu.anthropic.claude-sonnet-4-6`) |
| **LM Studio** | `POST {base}/api/v1/chat` (native) | optional `Bearer` | self-hosted tunnel; `reasoning:"off"` (learn + persist models that 400 on it); fall back to `reasoning_content` when `content` is empty |

Anthropic, condensed:

```javascript
const r = await fetch(`${baseUrl}/v1/messages`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
  body: JSON.stringify({ model, max_tokens: 4096, system: systemPrompt,    // max_tokens REQUIRED
                         messages: [{ role: 'user', content: userMessage }] }),
});
const data = await r.json();
const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
```

Bedrock model fallback id observed in production: `eu.anthropic.claude-sonnet-4-6` (an EU cross-region inference profile; admins pick the actual model). See `templates/byok-provider-adapter.js` for the full adapter and `28-forge-remote-and-egress.md` for the egress declarations each provider needs.

## Hosted vs BYOK — how to choose

| | Forge-hosted (`@forge/llm`) | BYOK |
|---|---|---|
| Egress declaration | none | required (`permissions.external.fetch.*`) |
| "Runs on Atlassian" badge | **kept** | lost |
| Models | Claude (Haiku/Sonnet/Opus) | any provider/model |
| Billing | app vendor's Forge bill | user's own key |
| Setup for the user | zero (keyless) | paste a key |
| Manifest cost | major bump + re-consent to add the module | major bump + re-consent on egress category change |

CogniRunner makes Forge-hosted the **no-key factory default** and lets power users switch to BYOK for a specific model/provider.

## Async-PF idempotency for AI work

Forge async events are **at-least-once** — a successful invocation can be redelivered. Claim the execution atomically *before* doing side-effectful AI work, so a redelivery skips instead of double-posting:

```javascript
// CogniRunner async-handler.js — executeQueuedPostFunction
await kvs.set(`pf_exec:${taskId}`, { issueKey, claimedAt: new Date().toISOString() }, {
  keyPolicy: 'FAIL_IF_EXISTS',                 // atomic conditional write
  ttl: { value: 6, unit: 'HOURS' },
});
// on KEY_ALREADY_EXISTS (or 409 / "already exists") → return { deduped: true }
```

Claim-**first** means a crash mid-execution is *not* retried with side effects intact — for fail-open automations, duplicates are the worse failure. See `26-async-events-and-queues.md` for the queue mechanics and `30-testing-and-tunneling.md` for the per-provider barrage test.

## See also

- `25-workflow-modules-deep-dive.md` — agentic validation / semantic PFs that consume this layer
- `28-forge-remote-and-egress.md` — BYOK egress allowlists (HTTPS + port allowlist)
- `26-async-events-and-queues.md` — running >25 s LLM calls off a queue
- `claude-api` skill — model ids, pricing, params, streaming, tool use
- https://developer.atlassian.com/platform/forge/manifest-reference/modules/llm/


## `@forge/llm` facts you cannot infer (measured, 2026)

### It is TEXT-ONLY
`type ContentPart = TextPart` in **both** 0.6.7 and 1.0.4. There is no image
part, so a picture can never reach the model as a picture — this single fact
determines every "can it read screenshots" answer. If you need image content,
something else has to turn it into text; doing that **in the browser** avoids
the 500 KB invoke limit entirely (see `23-custom-ui-advanced.md`).

### Output ceiling is NOT 32k — it is the model's own
Probed against the gateway: every served model accepts
`max_completion_tokens` up to **128,000**. A lower cap in your code is
self-imposed. Verify per tier rather than assuming; it is one call.

### `list()` returns `{model, status}` and nothing else
No context window, no output limit, no pricing. Budgeting is entirely app-side,
so you need your own table — and it must be refreshed by probing, not by recall.
A stale model id fails as a **silent downgrade**, not an error.

### `finish_reason: "length"` is the ONLY truncation signal
Nothing surfaces it by default. Read `choices[].finish_reason` and propagate it,
or a reply cut mid-JSON is indistinguishable from a model that answered badly.

Real case: a wizard called `chat()` without `maxTokens`, so the client's own
4096 default applied; the JSON payload was cut mid-array, a tolerant parser
still accepted the fragment, and the user saw *"No ticket data in creation
payload"* — an error message about a completely different thing. The reported
symptom was "it fails past 7.5k context", which was the token chip in the UI
showing input+output. It was an OUTPUT cut all along.

### There is a per-tenant, per-model TOKEN QUOTA
```
429 Forge LLM token usage limit exceeded. This tenant (ari:cloud:jira:…) has
reached its limit of 50000 tokens for model anthropic.claude-sonnet-4-5-…
```
Undocumented as far as I can find, and it is **per model** — so a heavy test run
can exhaust one tier while others still answer. Budget your live testing, and
treat a 429 here as a quota problem rather than a rate-limit blip.

### Tool calling is OpenAI-shaped
`{type: "function", function: {name, description, parameters}}`, and results go
back as `role: "tool"` messages carrying `tool_call_id`.

**Tool results are untrusted input.** If you carefully fence issue text and
uploaded documents in the system prompt but push tool results back as a bare
`JSON.stringify`, you have fenced nothing — the model reaches the same content
by calling a tool, and on a global-page surface that is the *only* path it
takes. Envelope them and state the rule once in the system prompt.
