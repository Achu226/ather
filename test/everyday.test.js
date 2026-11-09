import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.ATHER_DATA = mkdtempSync(join(tmpdir(), 'maya-test-'));
const { openStore } = await import('../src/main/store.js');
const { everydayTools, whereOnScreen, firstVideoId } = await import('../src/main/tools/everyday.js');
const { createTimers, spoken } = await import('../src/main/services/timers.js');

const run = (store, name, args, services = {}) => everydayTools.find((t) => t.name === name).run(args, { store, services });

test('timers ring once at the end and can be cancelled', () => {
  let clock = 0;
  const pending = [], said = [], badges = [];
  const timers = createTimers({ notify: (title, body) => said.push(body), onChange: (l) => badges.push(l.length), now: () => clock,
    setTimer: (fn, ms) => { pending.push({ fn, at: clock + ms }); return pending.length - 1; }, clearTimer: (i) => { pending[i].fn = () => {}; } });
  assert.ok(timers.start(0).error);
  const a = timers.start(10, 'pasta');
  timers.start(0.5);
  clock = 15_000;
  assert.equal(timers.list().find((t) => t.id === a.id).left, '9:45');
  assert.deepEqual(timers.cancel(), { cancelled: 2, label: '' });
  pending.forEach((p) => p.fn());
  assert.deepEqual(said, ['pasta: your 10 minutes timer is up.']);
  assert.deepEqual(badges, [1, 2, 1, 0]);
  assert.equal(spoken(1.5), '1 minute 30 seconds');
  assert.equal(spoken(90), '1 hour 30 minutes');
});

test('lists: add, read, tick off', () => {
  const store = openStore(':memory:');
  assert.equal(run(store, 'list_add', { list: 'Shopping list', items: ['milk', 'eggs', 'bread'] }).total, 3);
  run(store, 'list_add', { items: ['mangoes'] });
  assert.deepEqual(run(store, 'list_query', { list: 'shopping' }).map((r) => r.item), ['milk', 'eggs', 'bread', 'mangoes']);
  assert.deepEqual(run(store, 'list_remove', { list: 'shopping', items: ['Milk'] }).removed, ['milk']);
  assert.deepEqual(run(store, 'list_query', {}).map((r) => ({ ...r })), [{ list: 'shopping', items: 3 }]);
  run(store, 'list_remove', { list: 'shopping' });
  assert.deepEqual(run(store, 'list_query', { list: 'shopping' }), []);
});

test('pointing: finds a control by name and says where it is', async () => {
  const pointed = [];
  const services = {
    pc: { foreground: async () => ({ process: 'notepad', title: 'Notes' }), elements: async () => [
      { i: 1, name: 'File', type: 'MenuItem', x: 20, y: 40, w: 30, h: 20 },
      { i: 2, name: 'Save as', type: 'Button', x: 1400, y: 60, w: 60, h: 24 }] },
    point: (at) => pointed.push(at.label), screen: { bounds: () => ({ x: 0, y: 0, width: 1536, height: 960 }) },
  };
  const r = await run(null, 'screen_point', { target: 'save' }, services);
  assert.deepEqual([r.found, r.name, r.where], [true, 'Save as', 'at the top right']);
  assert.deepEqual(pointed, ['Save as']);
  assert.equal((await run(null, 'screen_point', { target: 'attach file' }, services)).found, false);
  assert.equal(whereOnScreen({ x: 768, y: 480 }, { x: 0, y: 0, width: 1536, height: 960 }), 'in the middle');
});

test('music: the first YouTube result is opened so it plays', () => {
  assert.equal(firstVideoId('..."videoId":"Zi_XLOBDo_Y","thumbnail"...'), 'Zi_XLOBDo_Y');
  assert.equal(firstVideoId('no results'), null);
});
