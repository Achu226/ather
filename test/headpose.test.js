import { test } from 'node:test';
import assert from 'node:assert/strict';
import { headDirection, createPointer, createGestures, createDwell } from '../src/renderer/shared/headpose.js';

/** A fake face: eyes at y 0.4, forehead 0.2, chin 0.8, nose shifted by (dx, dy). */
const face = (dx = 0, dy = 0) => {
  const lm = Array.from({ length: 300 }, () => ({ x: 0.5, y: 0.5 }));
  lm[33] = { x: 0.45, y: 0.4 }; lm[263] = { x: 0.55, y: 0.4 }; lm[10] = { x: 0.5, y: 0.2 }; lm[152] = { x: 0.5, y: 0.8 };
  lm[1] = { x: 0.5 + dx, y: 0.5 + dy };
  return lm;
};

test('head direction is measured from between the eyes', () => {
  const d = headDirection(face(0.01, 0));
  assert.ok(Math.abs(d.x - 0.1) < 1e-9);
  assert.ok(Math.abs(d.y - 0.1 / 0.6) < 1e-9);
});

test('pointer calibrates to the centre, then follows the head (mirrored)', () => {
  const p = createPointer({ calibrate: 3, smooth: 1 });
  for (let i = 0; i < 3; i++) p.update(headDirection(face()));
  assert.equal(p.calibrating, false);
  assert.deepEqual(p.update(headDirection(face())), { x: 0.5, y: 0.5 });
  const right = p.update(headDirection(face(-0.005, 0))); // nose moves left in the picture = user turned right
  assert.ok(right.x > 0.6, `x ${right.x}`);
  const down = p.update(headDirection(face(0, 0.03)));
  assert.ok(down.y > 0.6 && down.y <= 1);
  assert.equal(p.update(headDirection(face(0.5, 0))).x, 0); // clamped to the screen
});

test('open mouth clicks once per opening; smile right-clicks; mouth opening freezes the cursor', () => {
  const g = createGestures({ hold: 100, cooldown: 0 });
  assert.deepEqual(g({ jawOpen: 0.6 }, 0), { click: null, freeze: true });
  assert.equal(g({ jawOpen: 0.6 }, 150).click, 'left');
  assert.equal(g({ jawOpen: 0.6 }, 300).click, null); // still open: no repeat
  g({ jawOpen: 0 }, 400);
  g({ jawOpen: 0.6 }, 500);
  assert.equal(g({ jawOpen: 0.6 }, 650).click, 'left');
  g({ mouthSmileLeft: 0.8, mouthSmileRight: 0.8 }, 700);
  assert.equal(g({ mouthSmileLeft: 0.8, mouthSmileRight: 0.8 }, 900).click, 'right');
  assert.equal(g({ jawOpen: 0.05 }, 1000).freeze, false);
});

test('dwell: holding still clicks once, moving away arms it again', () => {
  const d = createDwell({ ms: 1000, radius: 0.02 });
  const at = { x: 0.5, y: 0.5 }, near = { x: 0.505, y: 0.5 }, far = { x: 0.6, y: 0.5 };
  assert.deepEqual(d(at, 0), { progress: 0, click: false });
  assert.equal(d(near, 500).progress, 0.5); // small wobble does not restart the timer
  assert.deepEqual(d(at, 1000), { progress: 1, click: true });
  assert.equal(d(at, 3000).click, false); // still there: no second click
  d(far, 3100);
  assert.equal(d(far, 4100).click, true);
});
