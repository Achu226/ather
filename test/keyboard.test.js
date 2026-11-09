import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.ATHER_DATA = mkdtempSync(join(tmpdir(), 'ather-test-'));
const { openStore } = await import('../src/main/store.js');
const { createKeyboard } = await import('../src/main/services/keyboard.js');

test('suggestions: common words, then the words this user types most, Tamil too', () => {
  const kb = createKeyboard({ store: openStore(':memory:') });
  assert.deepEqual(kb.suggest('tom'), ['tomorrow']);
  assert.deepEqual(kb.suggest(''), []);
  kb.learn('Tomato'); kb.learn('tomato');
  assert.deepEqual(kb.suggest('tom'), ['tomato', 'tomorrow']);
  kb.learn('வணக்கம்');
  assert.deepEqual(kb.suggest('வண'), ['வணக்கம்']);
});

test('passwords, codes and numbers are never learned', () => {
  const store = openStore(':memory:');
  const kb = createKeyboard({ store });
  assert.equal(kb.learn('Xk9#mP2$vL'), false);
  assert.equal(kb.learn('482913'), false);
  assert.equal(kb.learn('otp123'), false);
  assert.deepEqual(store.getSetting('kbWords', {}), {});
});
