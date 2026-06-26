# Forge LLM Integration (`@forge/llm`)

Run Claude inside a Forge app with **no API key and no external egress**, so the app keeps its "Runs on Atlassian" badge. Grounded in Sentinel Vault's Semantic AI Validation feature (`src/server/infra/forge-llm.js`, `src/server/infra/json-salvage.js`, `src/server/capsules/validations/ai-worker.js`).

> **Status:** `@forge/llm` is **Preview** as of 2026-06 (can be enabled in production). Cross-reference the canonical Forge-LLM coverage in `atlassian-jira-forge-skill` and the `claude-api` skill for model ids/pricing.

## Manifest module

```yaml
modules:
  llm:
    - key: my-app-llm
      model:
        - claude          # family name; Atlassian maps it to a Forge-hosted Claude model
```

Platform-supported models are **Claude Haiku, Sonnet, and Opus**. In the manifest the value is the family name `claude`. Adding the `llm` module is a **major version bump + admin re-consent** (observed consistently across Sentinel Vault and sibling apps — treat as expected).

## Model ids in code

Use the model ids exactly (from the `claude-api` skill, authoritative):

- Claude Haiku 4.5 → `claude-haiku-4-5` (full snapshot `claude-haiku-4-5-20251001`), 200K context, $1/$5 per MTok in/out.
- Claude Sonnet 4.6 → `claude-sonnet-4-6`. Claude Opus 4.8 → `claude-opus-4-8`.

Never invent a dated alias — `claude-haiku-4-5-20251001` is the one real dated Haiku id.

## Cost clamp: restrict the model at *every* layer

Forge-LLM tokens bill to the **app vendor's** Forge bill, not the customer. Sentinel restricts to Haiku as a deliberate **cost choice** (not a platform limit) and enforces it at list, at save, AND at the chat adapter — so a stale saved config can never bill a larger model:

```javascript
// forge-llm.js
export const FORGE_LLM_DEFAULT_MODEL = "claude-haiku-4-5-20251001";
export const FORGE_LLM_FALLBACK_MODELS = ["claude-haiku-4-5-20251001"];
export const isForgeLlmModelAllowed = (id) => /haiku/i.test(String(id || ""));

export const callForgeLlmChat = async ({ model, messages, jsonMode, maxTokens = 4096 }) => {
  if (!isForgeLlmModelAllowed(model)) {
    console.warn(`[FORGE-LLM] model "${model}" not allowed — clamping to ${FORGE_LLM_DEFAULT_MODEL}`);
    model = FORGE_LLM_DEFAULT_MODEL;            // billing backstop
  }
  // ...
};
```

`list()` is also filtered to the allowed family, falling back to the documented ids if the module isn't admin-approved yet:

```javascript
export const listForgeLlmModels = async () => {
  try {
    const resp = await forgeLlmListApi();
    let ids = (Array.isArray(resp) ? resp : resp?.models || [])
      .map((m) => (typeof m === "string" ? m : m?.model)).filter(Boolean)
      .filter(isForgeLlmModelAllowed);
    return ids.length ? ids : [...FORGE_LLM_FALLBACK_MODELS];
  } catch {
    return [...FORGE_LLM_FALLBACK_MODELS];   // module not yet approved, etc.
  }
};
```

## JSON output without `response_format`

`@forge/llm`'s `chat()` has **no `response_format` param**. To get structured output, append a JSON instruction to the **system** message and recover with a tolerant parser:

```javascript
// inject once, into the system message, when jsonMode is set
if (msg.role === "system" && jsonMode && !jsonInstructionAdded) {
  out.content += "\n\nRespond with ONLY a valid JSON object. No markdown fences, " +
                 "no surrounding prose, no explanation outside the JSON.";
}
const prompt = { model, messages: outMessages, max_completion_tokens: maxTokens };
const response = await forgeLlmChatApi(prompt);
// response.choices[0].message.content (string or text-part array)
// response.usage.{input_tokens,output_tokens,total_tokens}
```

Sentinel Vault flattens any multimodal `content` array to the joined `text` parts before sending (observed: its `@forge/llm` calls are text-only). Treat this as the app's working assumption, not a documented platform guarantee — verify multimodal support against the current Forge LLMs reference if you need it.

### Tolerant JSON salvage (`json-salvage.js`)

Models still wrap JSON in prose/fences or truncate it. `parseAIJson()` is pure (Forge-free, unit-testable) and returns `null` instead of throwing:

1. strip ```` ```json ```` fences, `JSON.parse`;
2. else extract the first balanced `{…}`/`[…]` block;
3. else repair unescaped inner quotes (`repairUnescapedQuotes`) and re-close unterminated strings/brackets (`repairTruncatedJson`).

Pair it with a **fail-closed** policy: on parse failure, record an audit entry and post **no** comment — never fabricate findings (`ai-worker.js`).

## Transient-error retry

Classify and retry only transient failures with bounded backoff; a real 4xx is fatal:

```javascript
export const isTransientAIError = (status, error = "") =>
  status === 429 || status === 408 || (typeof status === "number" && status >= 500) ||
  /\b(429|rate.?limit|timed?.?out|timeout|network|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|aborted|socket hang up)\b/i.test(String(error));

for (let attempt = 1; ; attempt++) {
  try { response = await forgeLlmChatApi(prompt); break; }
  catch (err) {
    if (attempt <= 3 && isTransientAIError(err?.status, err?.message)) {
      await new Promise((r) => setTimeout(r, Math.min(2000, 400 * 2 ** (attempt - 1))));
      continue;
    }
    throw err;
  }
}
```

## Offload long calls to an async consumer

An LLM call over a non-trivial document routinely exceeds the **25s resolver budget**. Sentinel enqueues the work to a dedicated queue whose consumer function declares `timeoutSeconds: 120`:

```yaml
function:
  - key: ai-validation-fn
    handler: boot.aiValidationConsumer
    timeoutSeconds: 120
consumer:
  - key: ai-validation-queue
    queue: ai-validation-queue
    function: ai-validation-fn
```

The consumer (`ai-worker.js`) writes a status row to KVS keyed `ai-validation-status-{taskId}` (`processing` → `done`/`error`, TTL 1h) that the UI polls, accrues token usage per realm, and — crucially for a manual-trigger flow — **does not rethrow** on error, so a failed run isn't retried and double-billed. See `26-async-events-and-queues.md` for the queue mechanics.

## See also

- `atlassian-jira-forge-skill` (Forge LLM doc) and `claude-api` skill — canonical model ids, pricing, params.
- `26-async-events-and-queues.md` — the queue/consumer pattern the AI worker uses.
- `27-faas-limits-and-cost.md` — 25s resolver vs 900s consumer budgets.
