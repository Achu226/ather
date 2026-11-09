import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNoiseSwitch, SENSITIVITY } from '../src/renderer/shared/noiseswitch.js';

/** Feeds levels (one every 20 ms) and returns the times it fired. */
function run(detect, levels, start = 0) {
  const fired = [];
  levels.forEach((l, i) => { const t = start + i * 20; if (detect(l, t)) fired.push(t); });
  return fired;
}
const quiet = (ms) => Array(ms / 20).fill(0.01);
const loud = (ms, level = 0.4) => Array(ms / 20).fill(level);

test('a short pop after a quiet moment presses the switch once', () => {
  const fired = run(createNoiseSwitch(), [...quiet(400), ...loud(60), ...quiet(200)]);
  assert.equal(fired.length, 1);
});

test('speech, a long noise or a pop in the middle of talking do not press it', () => {
  assert.deepEqual(run(createNoiseSwitch(), [...quiet(400), ...loud(600, 0.3), ...quiet(200)]), [], 'talking (long)');
  assert.deepEqual(run(createNoiseSwitch(), [...quiet(400), ...loud(400, 0.1), ...loud(60), ...quiet(200)]), [], 'a burst right after other sound');
  assert.deepEqual(run(createNoiseSwitch(), [...quiet(400), ...loud(60, 0.08), ...quiet(200)]), [], 'too soft');
});

test('two pops close together count once; after a pause the next counts', () => {
  const pops = [...quiet(400), ...loud(60), ...quiet(300), ...loud(60), ...quiet(300), ...quiet(400), ...loud(60), ...quiet(200)];
  assert.equal(run(createNoiseSwitch({ gapMs: 600 }), pops).length, 2);
});

test('sensitivity changes how loud a pop must be', () => {
  const soft = [...quiet(400), ...loud(60, 0.15), ...quiet(200)];
  assert.equal(run(createNoiseSwitch(SENSITIVITY.high), soft).length, 1);
  assert.equal(run(createNoiseSwitch(SENSITIVITY.normal), soft).length, 0);
  assert.ok(SENSITIVITY.low.threshold > SENSITIVITY.normal.threshold);
});
