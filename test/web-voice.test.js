// Web search through the brain + Windows voice fallback. Needs Ollama and internet.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.ATHER_DATA = mkdtempSync(join(tmpdir(), 'ather-web-'));
const { openStore } = await import('../src/main/store.js');
const { allTools } = await import('../src/main/tools/index.js');
const { ask } = await import('../src/main/brain.js');
const { OLLAMA } = await import('../src/main/ollama.js');
const { webSearch, readPage } = await import('../src/main/services/web.js');
const { sapiSpeak } = await import('../src/main/services/sapi.js');
const running = await fetch(`${OLLAMA}/api/version`).then((r) => r.ok, () => false);

test('brain searches the web for current facts', { skip: !running && 'Ollama not running', timeout: 300_000 }, async () => {
  const store = openStore(':memory:');
  const used = [];
  const answer = await ask({
    text: 'Search the web: what is the latest stable version of Node.js?', store, tools: allTools,
    services: { web: { search: webSearch, read: readPage } }, onEvent: (e) => e.type === 'tool' && used.push(e.name),
  });
  assert.ok(used.includes('web_search'), `tools used: ${used}`);
  assert.match(answer, /\d+/);
  assert.match(answer.trim(), /[.!?)]$/, 'answer should not be cut off mid-sentence');
});

test('Windows voice speaks text', { timeout: 60_000 }, async () => {
  const { samples, sampleRate } = await sapiSpeak('Hello from Maya', 'en');
  assert.ok(samples.length > sampleRate * 0.5);
});
