import { test } from 'node:test';
import assert from 'node:assert/strict';
import { customColors, sliderTrack } from '../src/renderer/shared/colors.js';

test('the default custom pill is black with white eyes and white text', () => {
  const c = customColors({});
  assert.equal(c.a, '#050505');
  assert.equal(c.eyes, '#ffffff');
  assert.equal(c.ink, '#ffffff');
});

test('a light pill flips eyes and text to dark so they stay readable', () => {
  const white = customColors({ pill: 0, shade: 1 });
  assert.equal(white.ink, '#141418');
  assert.equal(white.eyes, '#141418');
  const yellow = customColors({ pill: 0.17, shade: 0 });
  assert.equal(yellow.ink, '#141418');
});

test('the pill and eye sliders walk the colour wheel; shade darkens', () => {
  const red = customColors({ pill: 0.03 }), deepRed = customColors({ pill: 0.03, shade: 1 });
  assert.match(red.a, /^#e[0-9a-f]{5}$/); // bright red
  assert.ok(parseInt(deepRed.a.slice(1, 3), 16) < 60);
  assert.equal(customColors({ eyes: 0.5 }).eyes.length, 7);
  assert.notEqual(customColors({ eyes: 0.3 }).eyes, customColors({ eyes: 0.7 }).eyes);
  assert.match(sliderTrack((t) => customColors({ pill: t }).a, 4), /^linear-gradient\(90deg, (#[0-9a-f]{6}, ){4}#[0-9a-f]{6}\)$/);
});
