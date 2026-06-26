/*
 * Template: BYOK multi-provider AI adapter (unified OpenAI-shaped interface)
 * ----------------------------------------------------------------------------
 * One callAIChat() that normalises every provider to { ok, content, tokens }.
 * Provider selection + keys live in KVS (per-provider slots so switching
 * provider never deletes another provider's key).
 *
 * Providers: Forge-hosted Claude (@forge/llm, keyless), OpenAI, Azure,
 * OpenRouter, Anthropic, AWS Bedrock (Converse), LM Studio (self-hosted).
 *
 * Auth/caveats:
 *   - Store keys with kvs.setSecret (encrypted at rest), read with getSecret.
 *   - Each non-hosted provider host must be declared under
 *     permissions.external.fetch.backend (see docs/28-forge-remote-and-egress.md).
 *     Forge egress is HTTPS-only with a fixed PORT ALLOWLIST (80/443/8080/8443/
 *     8444/7990/8089/8090/8085/8060) — NOT "443 only". Self-hosted endpoints
 *     (LM Studio) must be exposed on a supported port over HTTPS.
 *   - Anthropic: `max_tokens` is REQUIRED and `system` is top-level.
 *   - Bedrock: do NOT encodeURIComponent the model id (ids contain ':').
 *   - Forge-hosted LLM: no response_format — enforce JSON via the system message.
 *   - Model ids: see the claude-api skill. claude-haiku-4-5 (snapshot
 *     claude-haiku-4-5-20251001), claude-sonnet-4-6, claude-opus-4-8.
 * Source: CogniRunner src/async-handler.js (callAIChatSimple)
 */
import { kvs } from '@forge/kvs';
import { fetch } from '@forge/api';
import { chat as forgeLlmChat } from '@forge/llm'; // requires the `llm` manifest module

const PROVIDERS = {
  atlassian:  { baseUrl: null },                          // Forge-hosted Claude (keyless)
  openai:     { baseUrl: 'https://api.openai.com/v1' },
  azure:      { baseUrl: null },                          // user-supplied
  openrouter: { baseUrl: 'https://openrouter.ai/api/v1' },
  anthropic:  { baseUrl: 'https://api.anthropic.com' },
  bedrock:    { baseUrl: null },                          // region-derived
  lmstudio:   { baseUrl: null },                          // user-supplied tunnel root
};

const keySlot   = (p) => `MYAPP_KEY_${p}`;
const modelSlot = (p) => `MYAPP_MODEL_${p}`;

async function getProviderConfig() {
  const provider = (await kvs.get('MYAPP_AI_PROVIDER')) || 'atlassian';
  const customUrl = await kvs.get('MYAPP_AI_BASE_URL');
  const baseUrl = customUrl || PROVIDERS[provider]?.baseUrl || PROVIDERS.openai.baseUrl;
  return { provider, baseUrl };
}

async function getApiKey(provider) {
  // Per-provider slot; migrate from a single legacy slot if present.
  return (await kvs.getSecret(keySlot(provider))) || (await kvs.getSecret('MYAPP_KEY_LEGACY'));
}

/**
 * Unified chat. Returns { ok, content, tokens } | { ok:false, status, error }.
 * @param {{ systemPrompt?: string, userMessage: string, jsonMode?: boolean }} opts
 */
export async function callAIChat({ systemPrompt = '', userMessage, jsonMode = false }) {
  const { provider, baseUrl } = await getProviderConfig();
  const model = (await kvs.get(modelSlot(provider))) || 'claude';
  const apiKey = provider === 'atlassian' ? null : await getApiKey(provider);
  if (!apiKey && provider !== 'atlassian' && provider !== 'lmstudio') {
    return { ok: false, status: 401, error: 'No API key configured for ' + provider };
  }

  const jsonNudge = '\n\nRespond with ONLY a valid JSON object. No markdown fences, no prose.';
  const sys = jsonMode ? systemPrompt + jsonNudge : systemPrompt;

  // --- Forge-hosted Claude --------------------------------------------------
  if (provider === 'atlassian') {
    try {
      const messages = [];
      if (sys) messages.push({ role: 'system', content: sys });
      messages.push({ role: 'user', content: userMessage });
      const res = await forgeLlmChat({ model, messages, max_completion_tokens: 4096 });
      let content = res?.choices?.[0]?.message?.content;
      if (Array.isArray(content)) content = content.filter((p) => p?.type === 'text').map((p) => p.text || '').join('');
      const tokens = res?.usage?.total_tokens || (res?.usage?.input_tokens || 0) + (res?.usage?.output_tokens || 0);
      return { ok: true, content, tokens };
    } catch (err) {
      return { ok: false, status: err?.status || 500, error: String(err?.message || err).slice(0, 300) };
    }
  }

  // --- Anthropic (Messages API) --------------------------------------------
  if (provider === 'anthropic') {
    const res = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: 4096, system: systemPrompt, // max_tokens REQUIRED
                             messages: [{ role: 'user', content: userMessage }] }),
    });
    if (!res.ok) return { ok: false, status: res.status, error: await res.text().catch(() => '') };
    const data = await res.json();
    const content = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    return { ok: true, content, tokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0) };
  }

  // --- AWS Bedrock (Converse) ----------------------------------------------
  if (provider === 'bedrock') {
    const body = { messages: [{ role: 'user', content: [{ text: userMessage }] }], inferenceConfig: { maxTokens: 4096 } };
    if (sys) body.system = [{ text: sys }];
    // Literal model id in the path — encodeURIComponent breaks ids containing ':' (…-v1:0).
    const res = await fetch(`${baseUrl}/model/${model}/converse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { ok: false, status: res.status, error: await res.text().catch(() => '') };
    const data = await res.json();
    const content = (data.output?.message?.content || []).filter((b) => typeof b.text === 'string').map((b) => b.text).join('');
    return { ok: true, content, tokens: (data.usage?.inputTokens || 0) + (data.usage?.outputTokens || 0) };
  }

  // --- LM Studio (self-hosted native endpoint) -----------------------------
  if (provider === 'lmstudio') {
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    const res = await fetch(`${baseUrl}/api/v1/chat`, {
      method: 'POST', headers,
      body: JSON.stringify({ model, input: userMessage, store: false, reasoning: 'off',
                             ...(sys ? { system_prompt: sys } : {}) }),
    });
    if (!res.ok) return { ok: false, status: res.status, error: await res.text().catch(() => '') };
    const data = await res.json();
    const blocks = Array.isArray(data.output) ? data.output : [];
    const content = blocks.filter((b) => b?.type === 'message' && typeof b.content === 'string').map((b) => b.content).join('');
    const stats = data.stats || {};
    return { ok: true, content, tokens: (stats.input_tokens || 0) + (stats.total_output_tokens || stats.output_tokens || 0) };
  }

  // --- OpenAI-compatible (OpenAI / Azure / OpenRouter) ----------------------
  const headers = { 'Content-Type': 'application/json' };
  if (provider === 'azure') headers['api-key'] = apiKey;
  else headers.Authorization = `Bearer ${apiKey}`;
  if (provider === 'openrouter') { headers['HTTP-Referer'] = 'https://example.com'; headers['X-Title'] = 'MyApp'; }

  const reqBody = {
    model,
    messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }],
  };
  // response_format works on OpenAI/Azure; skip OpenRouter (many upstream models reject it).
  if (jsonMode && (provider === 'openai' || provider === 'azure')) {
    reqBody.response_format = { type: 'json_object' };
  }
  const res = await fetch(`${baseUrl}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(reqBody) });
  if (!res.ok) return { ok: false, status: res.status, error: await res.text().catch(() => '') };
  const data = await res.json();
  const msg = data.choices?.[0]?.message;
  // Reasoning models (Qwen3 / DeepSeek-R1) sometimes leave content empty and fill reasoning_content.
  let content = msg?.content;
  if ((!content || !content.trim()) && typeof msg?.reasoning_content === 'string') content = msg.reasoning_content;
  return { ok: true, content, tokens: data.usage?.total_tokens };
}
