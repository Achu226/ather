import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.ATHER_DATA = mkdtempSync(join(tmpdir(), 'ather-act-'));
const { openStore, now } = await import('../src/main/store.js');
const { createActivity, categoryOf } = await import('../src/main/services/activity.js');
const { allTools } = await import('../src/main/tools/index.js');

test('activity adds up time per site and splits productive vs distracting', () => {
  const store = openStore(':memory:');
  const act = createActivity({ store, pc: {}, idleSeconds: () => 0 });
  for (let i = 0; i < 12; i++) act.record({ app: 'Chrome', label: 'YouTube' }); // 60 s
  for (let i = 0; i < 24; i++) act.record({ app: 'VS Code', label: 'VS Code' }); // 120 s
  const s = act.summary();
  assert.equal(s.total_minutes, 3);
  assert.equal(s.productive_minutes, 2);
  assert.equal(s.distracting_minutes, 1);
  assert.equal(s.apps[0].label, 'VS Code');
  assert.equal(act.week().length, 7);
});

test('user categories override the defaults', () => {
  assert.equal(categoryOf('YouTube'), 'distracting');
  assert.equal(categoryOf('YouTube', { YouTube: 'productive' }), 'productive');
  assert.equal(categoryOf('Some App'), 'neutral');
});

test('focus session + distracting app triggers one nudge per minute', async () => {
  const store = openStore(':memory:');
  store.run("INSERT INTO focus_sessions (label, minutes, started_at) VALUES ('Maths', 25, ?)", now());
  const nudges = [];
  const pc = { foreground: async () => ({ process: 'chrome', title: 'x', app: 'Chrome', label: 'Instagram' }) };
  const act = createActivity({ store, pc, idleSeconds: () => 0, onDistracted: (s, f) => nudges.push(`${s.label}/${f.label}`) });
  await act.tick();
  await act.tick();
  assert.deepEqual(nudges, ['Instagram/Maths']);
});

test('idle time is not counted', async () => {
  const store = openStore(':memory:');
  const pc = { foreground: async () => ({ process: 'Code', title: '', app: 'VS Code', label: 'VS Code' }) };
  await createActivity({ store, pc, idleSeconds: () => 600 }).tick();
  assert.equal(store.get('SELECT COUNT(*) AS n FROM activity').n, 0);
});

test('routines save, run their steps in order, and refuse unknown tools', async () => {
  const store = openStore(':memory:');
  const run = (name, args) => allTools.find((t) => t.name === name).run(args, { store, services: {} });
  assert.ok((await run('routines_save', { name: 'Bad', steps: [{ tool: 'rm_rf' }] })).error);
  await run('routines_save', { name: 'Study Mode', steps: [
    { tool: 'tasks_create', args: { title: 'Revise OS' } },
    { tool: 'focus_start', args: { minutes: 50, label: 'OS' } },
  ] });
  const r = await run('routines_run', { name: 'study mode' });
  assert.deepEqual(r.steps.map((s) => s.tool), ['tasks_create', 'focus_start']);
  assert.equal(store.get('SELECT title FROM tasks').title, 'Revise OS');
  assert.equal(store.get('SELECT minutes FROM focus_sessions').minutes, 50);
});
