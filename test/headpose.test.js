import { test } from 'node:test';
import assert from 'node:assert/strict';
import { headDirection, createPointer, createGestures, createDwell, createGlance, createFaceActions, FACE_GESTURES } from '../src/renderer/shared/headpose.js';

/** A fake face: eyes at y 0.4, forehead 0.2, chin 0.8, nose shifted by (dx, dy). */
const face = (dx = 0, dy = 0) => {
  const lm = Array.from({ length: 300 }, () => ({ x: 0.5, y: 0.5 }));
  lm[33] = { x: 0.45, y: 0.4 }; lm[263] = { x: 0.55, y: 0.4 }; lm[10] = { x: 0.5, y: 0.2 }; lm[152] = { x: 0.5, y: 0.8 };
  lm[1] = { x: 0.5 + dx, y: 0.5 + dy };
  return lm;
};

test('glance: a held turn left or right fires once, small or quick moves do not, and it re-arms at the centre', () => {
  const g = createGlance({ calibrate: 3, hold: 300 });
  let t = 0;
  const at = (dx, ms = 50) => { t += ms; return g(headDirection(face(dx)), t); };
  for (let i = 0; i < 3; i++) assert.equal(at(0), null, 'calibrating');
  assert.equal(at(-0.003), null, 'a small move is not a glance');
  assert.equal(at(-0.012), null, 'just started turning');
  assert.equal(at(0), null, 'a quick twitch back');
  assert.equal(at(-0.012), null);
  assert.equal(at(-0.012, 200), null);
  assert.equal(at(-0.012, 200), 'right', 'held for 300 ms: the user turned right (mirrored camera)');
  assert.equal(at(-0.012, 400), null, 'fires once, not again while still turned');
  assert.equal(at(0.012, 400), null, 'must come back to the centre first');
  assert.equal(at(0), null);
  assert.equal(at(0.012), null);
  assert.equal(at(0.012, 400), 'left');
});

test('face gestures: only the ones the user chose act, once per hold, with a pause between', () => {
  assert.deepEqual(FACE_GESTURES.map(([k]) => k), ['browUp', 'mouthLeft', 'mouthRight', 'pucker']);
  const act = createFaceActions({ map: { browUp: 'scrollUp', pucker: 'enter', mouthLeft: 'none' }, hold: 200, cooldown: 500 });
  const brows = { browInnerUp: 0.8 }, pucker = { mouthPucker: 0.8, jawOpen: 0.05 }, left = { mouthLeft: 0.9 };
  assert.equal(act(brows, 0), null, 'just started');
  assert.equal(act(brows, 250), 'scrollUp', 'held long enough');
  assert.equal(act(brows, 600), null, 'once per raise, not repeating');
  assert.equal(act({}, 650), null);
  assert.equal(act(left, 700), null);
  assert.equal(act(left, 1000), null, 'mouth left is set to "none"');
  assert.equal(act(pucker, 1100), null);
  assert.equal(act(pucker, 1400), 'enter');
  assert.equal(act({}, 1450), null);
  assert.equal(act(brows, 1500), null);
  assert.equal(act(brows, 1750), null, 'held, but only 350 ms since the last action (Enter at 1400)');
  assert.equal(act(brows, 1950), 'scrollUp', '550 ms after the last action');
  assert.equal(act({ mouthPucker: 0.8, jawOpen: 0.5 }, 3000), null, 'an open mouth (a click) is not a pucker');
  assert.equal(createFaceActions({ map: {} })({ browInnerUp: 1 }, 5000), null, 'nothing chosen: nothing happens');
});

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

test('pointer follows a big head turn within 2 frames but holds still through head tremor', () => {
  const p = createPointer({ calibrate: 3 });
  for (let i = 0; i < 3; i++) p.update({ x: 0, y: 0 });
  // A turn whose target is x = 0.5 - 0.1 * 3.2 = 0.18.
  p.update({ x: 0.1, y: 0 });
  const x2 = p.update({ x: 0.1, y: 0 }).x;
  assert.ok((0.5 - x2) / (0.5 - 0.18) > 0.9, `2 frames reached ${x2}`);
  // Tremor: ±0.001 around still (about ±6 px of target on a 1920 px screen); seeded, no randomness.
  const q = createPointer({ calibrate: 1 });
  q.update({ x: 0, y: 0 });
  const xs = [];
  for (let i = 0; i < 60; i++) xs.push(q.update({ x: i % 2 ? 0.001 : -0.001, y: 0 }).x);
  const spread = (Math.max(...xs.slice(10)) - Math.min(...xs.slice(10))) * 1920;
  assert.ok(spread < 3, `cursor shook ${spread.toFixed(1)} px`);
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
