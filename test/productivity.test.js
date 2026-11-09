import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.ATHER_DATA = mkdtempSync(join(tmpdir(), 'ather-test-'));
const { openStore } = await import('../src/main/store.js');
const { productivityTools } = await import('../src/main/tools/productivity.js');

const store = openStore(':memory:');
const call = (name, args = {}) => productivityTools.find((t) => t.name === name).run(args, { store });

test('a reminder can be set some days ahead without date maths (9 am that day)', () => {
  const day = new Date();
  day.setDate(day.getDate() + 2);
  const ymd = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
  const r = call('reminders_create', { text: 'Refill BP tablets', in_days: 2, care: true });
  assert.equal(r.at, `${ymd}T09:00`);
  assert.equal(call('reminders_create', { text: 'exact', at: '2026-12-01T18:30', in_days: 5 }).at, '2026-12-01T18:30', 'an exact time wins');
  assert.throws(() => call('reminders_create', { text: 'when?' }), /at or in_days/);
});

test('task lifecycle with undo', () => {
  const t = call('tasks_create', { title: 'Study DBMS', due: '2026-10-29T17:00' });
  assert.equal(t.title, 'Study DBMS');
  assert.equal(call('tasks_query').length, 1);

  call('tasks_complete', { id: t.id });
  assert.equal(call('tasks_query', { status: 'done' }).length, 1);
  assert.equal(call('history_query').tasks_done_today, 1);

  assert.equal(call('app_undo').undone, `Completed task ${t.id}`);
  assert.equal(call('tasks_query').length, 1);

  call('tasks_delete', { id: t.id });
  assert.equal(call('tasks_query').length, 0);
  call('app_undo');
  assert.equal(call('tasks_query').length, 1);
});

test('notes append and search', () => {
  const n = call('notes_create', { title: 'Shopping', body: 'milk' });
  call('notes_update', { id: n.id, body: 'eggs', append: true });
  assert.equal(call('notes_query', { search: 'eggs' })[0].body, 'milk\neggs');
});

test('habit check-in builds a streak', () => {
  const h = call('habits_create', { name: 'Drink water' });
  const yesterday = new Date(Date.now() - 864e5).toLocaleDateString('en-CA');
  call('habits_checkin', { id: h.id, day: yesterday });
  call('habits_checkin', { id: h.id });
  call('habits_checkin', { id: h.id }); // second check-in the same day is not double counted
  const p = call('habits_progress').find((x) => x.id === h.id);
  assert.equal(p.streak, 2);
  assert.equal(p.done_today, true);
});

test('only one focus session at a time', () => {
  call('focus_start', { minutes: 25, label: 'Maths' });
  assert.ok(call('focus_start', { minutes: 10 }).error);
  assert.equal(call('focus_status').running, true);
  call('focus_stop');
  assert.equal(call('focus_status').running, false);
});

test('calendar query merges feeds and sorts', async () => {
  call('calendar_create', { title: 'Haircut', start: '2026-11-03T11:00' });
  const services = { calendarFeeds: { events: async () => [{ title: 'Exam', start: '2026-11-02T09:00', source: 'Google' }] } };
  const tool = productivityTools.find((t) => t.name === 'calendar_query');
  const events = await tool.run({ from: '2026-11-01', to: '2026-11-05' }, { store, services });
  assert.deepEqual(events.map((e) => e.title), ['Exam', 'Haircut']);
});

test('store rejects unknown tables', () => {
  assert.throws(() => store.row('settings; DROP TABLE tasks', 1), /Unknown table/);
});
