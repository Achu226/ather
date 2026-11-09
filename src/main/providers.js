// Every place a model can run: local (Ollama, LM Studio) or cloud (any OpenAI-compatible API).
// All speak the OpenAI chat-completions protocol, so one client serves them all.
import { OLLAMA } from './ollama.js';
import { now } from './store.js';

export const PROVIDER_PRESETS = {
  ollama: { name: 'Ollama', baseUrl: `${OLLAMA}/v1`, local: true, keyless: true },
  lmstudio: { name: 'LM Studio', baseUrl: 'http://127.0.0.1:1234/v1', local: true, keyless: true },
  openai: { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', local: false },
  groq: { name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', local: false },
  openrouter: { name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', local: false },
  gemini: { name: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', local: false },
  anthropic: { name: 'Anthropic Claude', baseUrl: 'https://api.anthropic.com/v1', local: false },
  custom: { name: 'Custom (OpenAI-compatible)', baseUrl: '', local: false },
};

const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);

export function createProviders({ store, secrets }) {
  /** Saved providers merged with the presets; Ollama is always present. */
  function list() {
    const saved = store.getSetting('providers', {});
    return Object.entries({ ollama: {}, lmstudio: {}, ...saved }).map(([id, cfg]) => {
      const preset = PROVIDER_PRESETS[cfg.preset || id] || PROVIDER_PRESETS.custom;
      return {
        id, preset: cfg.preset || id, name: cfg.name || preset.name, baseUrl: (cfg.baseUrl || preset.baseUrl).replace(/\/+$/, ''),
        local: cfg.local ?? preset.local, keyless: !!preset.keyless, enabled: cfg.enabled ?? id === 'ollama',
        timeoutMs: cfg.timeoutMs || 120_000, hasKey: secrets.has(`provider:${id}`), lastTest: cfg.lastTest || null,
      };
    });
  }
  const get = (id) => list().find((p) => p.id === id);

  function save(id, patch, apiKey) {
    const saved = store.getSetting('providers', {});
    saved[id] = { ...(saved[id] || {}), ...patch };
    store.setSetting('providers', saved);
    if (apiKey !== undefined) secrets.set(`provider:${id}`, apiKey || null);
    return get(id);
  }
  function remove(id) {
    if (id === 'ollama') throw new Error('Ollama cannot be removed');
    const saved = store.getSetting('providers', {});
    delete saved[id];
    store.setSetting('providers', saved);
    secrets.set(`provider:${id}`, null);
  }

  function headers(p) {
    const h = { 'Content-Type': 'application/json' };
    const key = secrets.get(`provider:${p.id}`);
    if (key) h.Authorization = `Bearer ${key}`;
    if (p.preset === 'anthropic' && key) { h['x-api-key'] = key; h['anthropic-version'] = '2023-06-01'; }
    if (p.preset === 'openrouter') { h['HTTP-Referer'] = 'https://github.com/Achu226/ather'; h['X-Title'] = 'Maya'; }
    return h;
  }

  /** fetch with the provider's timeout, the caller's cancel signal, and one retry on rate limits / server errors. */
  async function request(p, path, body, signal) {
    for (let attempt = 0; ; attempt++) {
      const timeout = AbortSignal.timeout(p.timeoutMs);
      const res = await fetch(`${p.baseUrl}${path}`, {
        method: body ? 'POST' : 'GET', headers: headers(p), body: body ? JSON.stringify(body) : undefined,
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      }).catch((e) => {
        if (signal?.aborted) throw e;
        throw new Error(`${p.name} could not be reached at ${p.baseUrl} (${e.name === 'TimeoutError' ? 'timed out' : e.cause?.code || e.message}).`);
      });
      if (res.ok || attempt >= 1 || !RETRYABLE.has(res.status)) return res;
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }

  async function models(id) {
    const p = get(id);
    const res = await request(p, '/models');
    if (!res.ok) throw new Error(`${p.name}: ${res.status} ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    return (data.data || data.models || []).map((m) => m.id || m.name).filter(Boolean).sort();
  }

  /** Connection test: list models, then a one-word chat with the first (or given) model. Saves the result. */
  async function test(id, model) {
    const p = get(id);
    const started = Date.now();
    let result;
    try {
      const names = await models(id);
      const pick = model || names.find((n) => !/embed/i.test(n)) || names[0];
      if (!pick) throw new Error('No models are available on this provider yet.');
      const res = await request(p, '/chat/completions', { model: pick, messages: [{ role: 'user', content: 'Reply with the word OK.' }], max_tokens: 8 });
      if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
      const reply = (await res.json()).choices?.[0]?.message?.content || '';
      result = { ok: true, models: names.length, model: pick, reply: reply.trim().slice(0, 40), ms: Date.now() - started };
    } catch (e) {
      result = { ok: false, error: e.message, ms: Date.now() - started };
    }
    save(id, { lastTest: { ...result, at: now() } });
    return result;
  }

  function recordUsage(providerId, model, usage) {
    if (!usage) return;
    store.run('INSERT INTO usage (provider, model, prompt_tokens, completion_tokens, at) VALUES (?,?,?,?,?)',
      providerId, model, usage.prompt_tokens || 0, usage.completion_tokens || 0, now());
  }
  const usageSummary = () => store.all(`SELECT provider, model, COUNT(*) AS requests, SUM(prompt_tokens) AS prompt_tokens,
    SUM(completion_tokens) AS completion_tokens, MAX(at) AS last FROM usage GROUP BY provider, model ORDER BY last DESC`);

  return { list, get, save, remove, models, test, request, recordUsage, usageSummary };
}
