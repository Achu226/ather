import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScanner } from '../src/main/services/scanning.js';

const items = Array.from({ length: 20 }, (_, i) => i); // 3 groups: 0-7, 8-15, 16-19

test('scanning: group, then control, then start again', () => {
  const s = createScanner(items, { size: 8 });
  assert.deepEqual(s.lit.items, [0, 1, 2, 3, 4, 5, 6, 7]);
  s.next();
  assert.deepEqual(s.lit.items, [8, 9, 10, 11, 12, 13, 14, 15]);
  assert.equal(s.press(), null); // into the second group
  assert.deepEqual(s.lit.items, [8]);
  s.next(); s.next();
  assert.equal(s.press(), 10);
  assert.deepEqual(s.lit.items, [0, 1, 2, 3, 4, 5, 6, 7]); // back to the first group for the next choice
});

test('scanning: the back step returns to the groups; few controls skip the group level', () => {
  const s = createScanner(items, { size: 8 });
  s.next(); s.next();
  s.press(); // group 16-19
  for (let k = 0; k < 4; k++) s.next();
  assert.deepEqual(s.lit, { items: [], back: true });
  assert.equal(s.press(), null);
  assert.equal(s.lit.items.length, 8);

  const small = createScanner([5, 6, 7], { size: 8 });
  assert.deepEqual(small.lit.items, [5]);
  small.next(); small.next(); small.next();
  assert.deepEqual(small.lit.items, [5]); // wraps, no back step
  small.next();
  assert.equal(small.press(), 6);
});
