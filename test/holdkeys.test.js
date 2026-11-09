import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHoldMachine } from '../src/main/services/holdkeys.js';

/** A machine with a fake clock: run() fires the pending hold timers. */
function setup() {
  const events = [], timers = [];
  const feed = createHoldMachine({
    onStart: (m) => events.push(`start ${m}`), onEnd: (m) => events.push(`end ${m}`), onCancel: (m) => events.push(`cancel ${m}`),
    setTimer: (fn) => { timers.push(fn); return timers.length; }, clearTimer: (id) => { timers[id - 1] = () => {}; },
  });
  return { events, feed, run: () => timers.splice(0).forEach((fn) => fn()) };
}

test('holding Right Ctrl starts a command, letting go ends it', () => {
  const { events, feed, run } = setup();
  feed({ ctrl: true, alt: false, other: false });
  run();
  feed({ ctrl: false, alt: false, other: false });
  assert.deepEqual(events, ['start command', 'end command']);
});

test('Right Alt dictates; a quick tap does nothing', () => {
  const { events, feed, run } = setup();
  feed({ ctrl: false, alt: true, other: false });
  feed({ ctrl: false, alt: false, other: false }); // released before the hold time
  run();
  assert.deepEqual(events, []);
  feed({ ctrl: false, alt: true, other: false });
  run();
  feed({ ctrl: false, alt: false, other: false });
  assert.deepEqual(events, ['start dictate', 'end dictate']);
});

test('Right Ctrl + another key is a shortcut, not talking', () => {
  const { events, feed, run } = setup();
  feed({ ctrl: true, alt: false, other: false });
  feed({ ctrl: true, alt: false, other: true }); // Ctrl+C before the hold time
  run();
  feed({ ctrl: false, alt: false, other: false });
  assert.deepEqual(events, []);
  feed({ ctrl: true, alt: false, other: false });
  run();
  feed({ ctrl: true, alt: false, other: true }); // a key after talking started: cancel, nothing is sent
  feed({ ctrl: false, alt: false, other: false });
  assert.deepEqual(events, ['start command', 'cancel command']);
});
