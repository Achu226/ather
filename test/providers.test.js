// Provider engine against real endpoints: Ollama's OpenAI-compatible API registered as a "custom" provider,
// plus an endpoint that is not running (LM Studio is not installed on the test PC).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.ATHER_DATA = mkdtempSync(join(tmpdir(), 'ather-prov-'));
const { openStore } = await import('../src/main/store.js');
const { createProviders } = await import('../src/main/providers.js');
const { parseProviderModel, pickModel } = await import('../src/main/models.js');
const { ask } = await import('../src/main/brain.js');
const { allTools } = await import('../src/main/tools/index.js');
const { OLLAMA } = await import('../src/main/ollama.js');
const running = await fetch(`${OLLAMA}/api/version`).then((r) => r.ok, () => false);

const fakeSecrets = () => { const m = new Map(); return { set: (k, v) => (v ? m.set(k, v) : m.delete(k)), get: (k) => m.get(k) || null, has: (k) => m.has(k) }; };

test('provider:model choices parse, hybrid sends big questions to the chosen model', async () => {
  assert.deepEqual(parseProviderModel('p:openai:gpt-4o-mini'), { provider: 'openai', model: 'gpt-4o-mini' });
  assert.equal(parseProviderModel('smart'), null);
  const c = await pickModel('auto', 'explain the difference between TCP and UDP in detail', { style: 'chat', hybrid: 'p:groq:llama-3.3-70b' });
  assert.equal(c.provider, 'groq');
  const quick = await pickModel('auto', 'add a task to study', { style: 'chat', hybrid: 'p:groq:llama-3.3-70b' });
  assert.equal(quick.provider, undefined);
});

test('a provider that is not running gives an actionable error', async () => {
  const providers = createProviders({ store: openStore(':memory:'), secrets: fakeSecrets() });
  const r = await providers.test('lmstudio');
  assert.equal(r.ok, false);
  assert.match(r.error, /LM Studio could not be reached at http:\/\/127\.0\.0\.1:1234/);
});

test('switching endpoints: a custom OpenAI-compatible provider really answers, usage is recorded',
  { skip: !running && 'Ollama not running', timeout: 300_000 }, async () => {
    const store = openStore(':memory:');
    const providers = createProviders({ store, secrets: fakeSecrets() });
    providers.save('mylocal', { preset: 'custom', name: 'My endpoint', baseUrl: `${OLLAMA}/v1`, enabled: true, local: true }, 'not-needed');
    const t = await providers.test('mylocal', 'qwen3.5:4b');
    assert.ok(t.ok, t.error);
    assert.ok((await providers.models('mylocal')).includes('qwen3.5:4b'));

    const events = [];
    const answer = await ask({ text: 'What is 7 times 6? Answer with the number only.', store, tools: allTools, services: { providers },
      style: 'chat', mode: 'p:mylocal:qwen3.5:4b', onEvent: (e) => e.type === 'model' && events.push(e.label) });
    assert.match(answer, /42/);
    assert.match(events[0], /qwen3\.5:4b · mylocal/);
    const usage = providers.usageSummary();
    assert.equal(usage[0].provider, 'mylocal');
    assert.ok(usage[0].prompt_tokens > 0);
  });

test('cloud models do not get screen, files or documents unless allowed', { skip: !running && 'Ollama not running', timeout: 300_000 }, async () => {
  const store = openStore(':memory:');
  const providers = createProviders({ store, secrets: fakeSecrets() });
  // Pretend Ollama is a cloud service to check the privacy filter.
  providers.save('fakecloud', { preset: 'custom', name: 'Fake cloud', baseUrl: `${OLLAMA}/v1`, enabled: true, local: false });
  const used = [];
  await ask({ text: "What's on my screen right now?", store, tools: allTools, style: 'chat', mode: 'p:fakecloud:qwen3.5:4b',
    services: { providers, screen: { capture: async () => { used.push('captured'); return ''; } } },
    onEvent: (e) => e.type === 'tool' && used.push(e.name) });
  assert.ok(!used.includes('screen_look') && !used.includes('captured'), `used: ${used}`);
});
