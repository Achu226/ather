import { test } from 'node:test';
import assert from 'node:assert/strict';
import { brainAddresses, probeOllama } from '../src/main/services/brainserver.js';
import { setOllamaHost, isLocalOllama, ensureOllama } from '../src/main/ollama.js';
import * as ollama from '../src/main/ollama.js';

test('brain addresses: Tailscale first, then home network; loopback and link-local left out', () => {
  const list = brainAddresses({
    lo: [{ family: 'IPv4', address: '127.0.0.1', internal: true }],
    wifi: [{ family: 'IPv4', address: '192.168.1.20', internal: false }, { family: 'IPv6', address: 'fe80::1', internal: false }],
    tail: [{ family: 'IPv4', address: '100.101.102.103', internal: false }],
    apipa: [{ family: 'IPv4', address: '169.254.3.4', internal: false }],
    cgnatOutside: [{ family: 'IPv4', address: '100.200.1.1', internal: false }],
  });
  assert.deepEqual(list, [
    { address: '100.101.102.103:11434', kind: 'tailscale' },
    { address: '192.168.1.20:11434', kind: 'home' },
    { address: '100.200.1.1:11434', kind: 'home' },
  ]);
});

test('probe: an Ollama answers with its version and models; bad input and silence give a plain error', async () => {
  const fake = async (url) => ({ ok: true, status: 200, json: async () => (url.endsWith('/api/version') ? { version: '0.12.0' } : { models: [{ name: 'qwen3.5:9b' }] }) });
  assert.deepEqual(await probeOllama('100.1.2.3:11434', fake), { ok: true, url: 'http://100.1.2.3:11434', version: '0.12.0', models: ['qwen3.5:9b'] });
  assert.equal((await probeOllama('http://x/../../etc', fake)).ok, false);
  const notOllama = await probeOllama('100.1.2.3:80', async () => ({ ok: false, status: 404 }));
  assert.match(notOllama.error, /not like Ollama/);
  const silent = await probeOllama('100.1.2.3', async () => { throw Object.assign(new Error('t'), { name: 'TimeoutError' }); });
  assert.match(silent.error, /PC on/);
});

test('the brain can move to another PC and back; Maya never starts Ollama for a remote one', { timeout: 10_000 }, async () => {
  try {
    assert.equal(setOllamaHost('192.0.2.1:11434'), 'http://192.0.2.1:11434'); // TEST-NET: never answers
    assert.equal(ollama.OLLAMA, 'http://192.0.2.1:11434'); // importers see the new address (live binding)
    assert.equal(isLocalOllama(), false);
    assert.equal(await ensureOllama(), false); // gives up after one probe instead of spawning a local server
  } finally {
    setOllamaHost('');
  }
  assert.equal(isLocalOllama(), true);
});
