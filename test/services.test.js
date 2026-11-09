import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.ATHER_DATA = mkdtempSync(join(tmpdir(), 'ather-svc-'));
const { openStore } = await import('../src/main/store.js');
const { tick, nextRepeat } = await import('../src/main/services/scheduler.js');
const { localIso } = await import('../src/main/services/calendar-feeds.js');
const { scriptLanguage, readWav } = await import('../src/main/services/sapi.js');
const { allTools } = await import('../src/main/tools/index.js');

test('tool names are unique and valid for the OpenAI tool format', () => {
  const names = allTools.map((t) => t.name);
  assert.equal(new Set(names).size, names.length);
  for (const n of names) assert.match(n, /^[a-z_]+$/);
  for (const t of allTools) assert.equal(t.parameters.type, 'object');
});

test('every tool a screen reloads with is read-only (no "data changed" loop)', async () => {
  // Mirrors READ_ONLY_TOOL in src/main/ipc.js (that module needs Electron, so it is not imported here).
  const READ_ONLY_TOOL = /_(query|status|progress|list|files|history)$|^(web_|files_search|mail_(triage|search|read|promotions)|open_)/;
  const readByScreens = ['memory_list', 'routines_list', 'tasks_query', 'notes_query', 'habits_progress', 'focus_status', 'calendar_query', 'activity_query', 'history_query', 'reminders_query', 'timetable_query', 'exams_query', 'clipboard_history', 'system_status'];
  for (const name of readByScreens) assert.ok(READ_ONLY_TOOL.test(name), name);
  assert.ok(!READ_ONLY_TOOL.test('tasks_create'));
  assert.ok(READ_ONLY_TOOL.test('mail_read') && !READ_ONLY_TOOL.test('mail_add_tasks'));
  const src = (await import('node:fs')).readFileSync(new URL('../src/main/ipc.js', import.meta.url), 'utf8');
  assert.ok(src.includes(READ_ONLY_TOOL.source.replace(/\\/g, '\\')), 'ipc.js pattern changed: update this test');
});

test('due reminder fires once; repeating reminder moves to the next weekday', () => {
  const store = openStore(':memory:');
  const past = localIso(new Date(Date.now() - 60_000));
  store.run("INSERT INTO reminders (text, at) VALUES ('Drink water', ?)", past);
  store.run("INSERT INTO reminders (text, at, repeat) VALUES ('Standup', ?, 'weekdays')", past);
  const fired = [];
  tick(store, (title, body) => fired.push(body));
  tick(store, (title, body) => fired.push(body));
  assert.deepEqual(fired, ['Drink water', 'Standup']);
  const standup = store.get("SELECT * FROM reminders WHERE text = 'Standup'");
  assert.ok(standup.at > past);
  assert.notEqual(new Date(standup.at).getDay(), 0);
  assert.notEqual(new Date(standup.at).getDay(), 6);
});

test('weekday repeat skips the weekend', () => {
  assert.equal(nextRepeat('2026-10-30T09:00', 'weekdays'), '2026-11-02T09:00'); // Friday → Monday
  assert.equal(nextRepeat('2026-10-30T09:00', 'weekly'), '2026-11-06T09:00');
});

test('finished focus session notifies and completes', () => {
  const store = openStore(':memory:');
  store.run("INSERT INTO focus_sessions (label, minutes, started_at) VALUES ('Maths', 1, ?)", new Date(Date.now() - 120_000).toISOString());
  const fired = [];
  tick(store, (title) => fired.push(title));
  assert.deepEqual(fired, ['Focus done']);
  assert.equal(store.get('SELECT completed FROM focus_sessions').completed, 1);
});

test('script language detection', () => {
  assert.equal(scriptLanguage('नमस्ते दोस्त'), 'hi');
  assert.equal(scriptLanguage('Привет'), 'ru');
  assert.equal(scriptLanguage('Hello there'), null);
});

test('readWav decodes 16-bit PCM', () => {
  const data = Buffer.alloc(4); data.writeInt16LE(16384, 0); data.writeInt16LE(-32768, 2);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.write('WAVE', 8); header.write('fmt ', 12); header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(22050, 24);
  header.write('data', 36); header.writeUInt32LE(4, 40);
  const { samples, sampleRate } = readWav(Buffer.concat([header, data]));
  assert.equal(sampleRate, 22050);
  assert.deepEqual(Array.from(samples), [0.5, -1]);
});

test('the Electron main files parse (they need Electron, so other tests never load them)', async () => {
  const { execFileSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  for (const f of ['main.js', 'ipc.js', 'windows.js']) execFileSync(process.execPath, ['--check', fileURLToPath(new URL(`../src/main/${f}`, import.meta.url))]);
});
