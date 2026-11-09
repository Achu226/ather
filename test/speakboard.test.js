import { test } from 'node:test';
import assert from 'node:assert/strict';
import { halves, narrow, DEFAULT_PHRASES } from '../src/renderer/shared/speakboard.js';

test('the phrases split into a left and a right half (left gets the extra one)', () => {
  assert.deepEqual(halves(['a', 'b', 'c', 'd', 'e']), [['a', 'b', 'c'], ['d', 'e']]);
  assert.deepEqual(halves(['a']), [['a'], []]);
  assert.deepEqual(halves([]), [[], []]);
});

test('glancing keeps one half until a single phrase is left', () => {
  let list = ['water', 'pain', 'toilet', 'call amma', 'cold', 'thank you', 'yes'];
  list = narrow(list, 'right'); // 7 → left 4, right 3
  assert.deepEqual(list, ['cold', 'thank you', 'yes']);
  list = narrow(list, 'left');
  assert.deepEqual(list, ['cold', 'thank you']);
  list = narrow(list, 'right');
  assert.deepEqual(list, ['thank you']);
  assert.deepEqual(narrow(['only'], 'right'), ['only'], 'one phrase stays (nothing on the right)');
});

test('the starter phrases cover basic needs, in English and Tamil', () => {
  assert.ok(DEFAULT_PHRASES.length >= 8);
  assert.ok(DEFAULT_PHRASES.some((p) => /water/i.test(p)));
  assert.ok(DEFAULT_PHRASES.some((p) => /pain/i.test(p)));
  assert.ok(DEFAULT_PHRASES.some((p) => /[஀-௿]/.test(p)), 'at least one Tamil phrase');
});
