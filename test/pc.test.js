import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchApp, describeWindow, createPc, faceAction } from '../src/main/services/pc.js';

test('a face gesture action becomes the right click, scroll or key', async () => {
  const done = [];
  const pc = { clickHere: async (b) => done.push(`click ${b}`), scroll: async (n) => done.push(`scroll ${n}`), keys: async (k) => done.push(`keys ${k}`) };
  for (const a of ['click', 'right', 'double', 'scrollUp', 'scrollDown', 'enter', 'escape', 'tab']) await faceAction(pc, a);
  assert.deepEqual(done, ['click left', 'click right', 'click left', 'click left', 'scroll 360', 'scroll -360', 'keys {ENTER}', 'keys {ESC}', 'keys {TAB}']);
  await assert.rejects(faceAction(pc, 'format c:'), /Unknown face action/);
});

test('finds the right Start Menu app from a spoken name', () => {
  const names = ['Visual Studio Code', 'Google Chrome', 'Uninstall Google Chrome', 'Microsoft Edge', 'Word', 'Spotify', 'Python 3.14 (64-bit)'];
  assert.equal(matchApp('chrome', names), 'Google Chrome');
  assert.equal(matchApp('vs code', names), 'Visual Studio Code');
  assert.equal(matchApp('visual studio code', names), 'Visual Studio Code');
  assert.equal(matchApp('spotify', names), 'Spotify');
  assert.equal(matchApp('photoshop', names), null);
});

test('labels browser windows by site', () => {
  assert.deepEqual(describeWindow('chrome', 'DBMS lecture 5 - YouTube - Google Chrome'), { app: 'Chrome', label: 'YouTube' });
  assert.deepEqual(describeWindow('msedge', '(3) Instagram - Personal - Microsoft Edge'), { app: 'Edge', label: 'Instagram' });
  assert.deepEqual(describeWindow('Code', 'main.js - ather - Visual Studio Code'), { app: 'VS Code', label: 'VS Code' });
});

test('helper reads the active window and the volume without changing it', { timeout: 60_000 }, async () => {
  const pc = createPc({ shell: {} });
  try {
    const fg = await pc.foreground();
    assert.equal(typeof fg.process, 'string');
    const vol = await pc.volume();
    assert.ok(vol >= 0 && vol <= 100, `volume ${vol}`);
    assert.ok(Object.keys(pc.shortcuts()).length > 10);
  } finally {
    pc.stop();
  }
});
