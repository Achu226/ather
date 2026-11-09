import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.ATHER_DATA = mkdtempSync(join(tmpdir(), 'ather-test-'));
const { openStore } = await import('../src/main/store.js');
const { allTools } = await import('../src/main/tools/index.js');
const { daysUntil, DAYS } = await import('../src/main/tools/student.js');
const { createClipboardHistory, looksLikePassword } = await import('../src/main/services/clipboard.js');
const { createHealth } = await import('../src/main/services/health.js');
const { tick } = await import('../src/main/services/scheduler.js');
const { localIso } = await import('../src/main/services/calendar-feeds.js');

const runner = (store, services = {}) => (name, args = {}) => allTools.find((t) => t.name === name).run(args, { store, services });

test('timetable classes appear in the calendar on their weekdays', async () => {
  const store = openStore(':memory:');
  const run = runner(store);
  assert.ok(run('timetable_add', { classes: [{ day: 'Funday', start: '9', subject: 'X' }] }).error);
  assert.equal(run('timetable_add', { classes: [
    { day: 'monday', start: '09:00', end: '09:50', subject: 'DBMS', room: 'A-204' },
    { day: 'wednesday', start: '11:00', subject: 'OS' },
  ] }).added, 2);
  // 2026-10-26 is a Monday.
  const week = await run('calendar_query', { from: '2026-10-26', to: '2026-11-01' });
  assert.deepEqual(week.map((e) => `${e.start} ${e.title}`), ['2026-10-26T09:00 DBMS', '2026-10-28T11:00 OS']);
  assert.equal(week[0].location, 'A-204');
  assert.equal(run('timetable_query', { day: 'monday' }).length, 1);
});

test('exams count down in whole days', () => {
  const store = openStore(':memory:');
  const run = runner(store);
  assert.equal(daysUntil('2026-11-10', new Date(2026, 9, 28, 23, 30)), 13);
  const later = new Date(Date.now() + 5 * 864e5).toLocaleDateString('en-CA');
  run('exams_add', { subject: 'DBMS', date: later });
  run('exams_add', { subject: 'Old', date: '2020-01-01' });
  assert.ok(run('exams_add', { subject: 'Bad', date: '14 Dec' }).error);
  const [e, ...rest] = run('exams_query');
  assert.equal(rest.length, 0);
  assert.equal(e.days_left, 5);
});

test('a class is announced 10 minutes before it starts, once', () => {
  const store = openStore(':memory:');
  const soon = new Date(Date.now() + 10 * 60_000);
  runner(store)('timetable_add', { classes: [{ day: DAYS[soon.getDay()], start: localIso(soon).slice(11, 16), subject: 'Maths', room: 'B1' }] });
  const said = [];
  tick(store, (title, body) => said.push(`${title}: ${body}`));
  tick(store, (title, body) => said.push(`${title}: ${body}`));
  assert.deepEqual(said, ['Class in 10 minutes: Maths in B1']);
});

test('clipboard history skips passwords and private copies', async () => {
  let text = '', formats = [];
  const clipboard = { readText: async () => text, has: async (f) => formats.includes(f) };
  const h = createClipboardHistory({ clipboard });
  for (const t of ['https://example.com/notes', 'Tr0ub4dor&3x!', 'my password is cat123', 'normal sentence here', 'https://example.com/notes']) { text = t; await h.check(); }
  formats = ['ExcludeClipboardContentFromMonitorProcessing']; text = 'from a password manager'; await h.check();
  assert.deepEqual(h.list().map((i) => i.text), ['https://example.com/notes', 'normal sentence here']);
  assert.ok(looksLikePassword('Xk9#mP2$vL'));
  assert.ok(!looksLikePassword('hello-world'));
});

test('health breaks count only active minutes and respect quiet time', () => {
  const store = openStore(':memory:');
  store.setSetting('health', { water: 3, eyes: 0, stretch: 0 });
  let idle = 0, quiet = false;
  const said = [];
  const h = createHealth({ store, idleSeconds: () => idle, notify: (t) => said.push(t), quiet: () => quiet });
  h.tick(); idle = 600; h.tick(); h.tick(); idle = 0; h.tick();
  assert.deepEqual(said, []);
  h.tick();
  assert.deepEqual(said, ['Water break 💧']);
  quiet = true; h.tick(); h.tick(); h.tick();
  assert.equal(said.length, 1);
});

test('health_settings changes intervals', () => {
  const store = openStore(':memory:');
  assert.deepEqual(runner(store)('health_settings', { water_minutes: 0, eyes_minutes: 30 }), { water: 0, eyes: 30, stretch: 45 });
});
