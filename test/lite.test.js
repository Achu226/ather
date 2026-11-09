import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setLite, liteSwap, pickModel, LITE } from '../src/main/models.js';

test('Lite swaps every local Qwen model for the 2B, and leaves cloud models alone', async () => {
  setLite(false);
  assert.equal(liteSwap('ather-smart'), 'ather-smart');
  setLite(true);
  try {
    assert.equal(liteSwap('ather-brain'), LITE.model);
    assert.equal(liteSwap('ather-smart'), LITE.model);
    assert.equal(liteSwap('qwen2.5-coder:7b'), LITE.model);
    assert.equal(liteSwap('nomic-embed-text'), 'nomic-embed-text');
    const fast = await pickModel('fast', 'add a task');
    assert.equal(fast.model, LITE.model);
    assert.match(fast.label, /Lite \(Qwen 3\.5 2B\)/);
    const cloud = await pickModel('p:openai:gpt-4o-mini', 'hi');
    assert.equal(cloud.model, 'gpt-4o-mini');
  } finally {
    setLite(false);
  }
});
