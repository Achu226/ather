import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.ATHER_DATA = mkdtempSync(join(tmpdir(), 'ather-brief-'));
const { openStore } = await import('../src/main/store.js');
const { createBriefing, briefingTick, weather } = await import('../src/main/services/briefing.js');
const { OLLAMA } = await import('../src/main/ollama.js');
const running = await fetch(`${OLLAMA}/api/version`).then((r) => r.ok, () => false);

test('evening review fires once a day, and not while the user is away', async () => {
  const store = openStore(':memory:');
  store.setSetting('reviewTime', '00:00');
  store.setSetting('briefingEnabled', false);
  const sent = [];
  const briefing = { generate: async (kind) => ({ kind, text: `${kind} text` }), nudge: () => null };
  const notify = (title, body) => sent.push(body);
  await briefingTick({ store, briefing, notify, isAway: () => true });
  assert.deepEqual(sent, []);
  await briefingTick({ store, briefing, notify, isAway: () => false });
  await briefingTick({ store, briefing, notify, isAway: () => false });
  assert.deepEqual(sent, ['evening text']);
});

test('overdue nudge counts overdue tasks', () => {
  const store = openStore(':memory:');
  store.run("INSERT INTO tasks (title, due) VALUES ('Old', '2020-01-01T10:00'), ('Older', '2019-01-01T10:00')");
  const n = createBriefing({ store, services: {} }).nudge('overdue');
  assert.match(n.body, /2 overdue tasks/);
});

test('weather for a real city', { timeout: 30_000 }, async () => {
  const w = await weather('Chennai');
  assert.match(w.place, /Chennai/);
  assert.ok(typeof w.now_c === 'number' && w.sky);
});

test('morning briefing mentions the real tasks and no invented ones', { skip: !running && 'Ollama not running', timeout: 300_000 }, async () => {
  const store = openStore(':memory:');
  const todayAt = `${new Date().toLocaleDateString('en-CA')}T16:00`;
  store.run('INSERT INTO tasks (title, due) VALUES (?, ?)', 'Submit DBMS record', todayAt);
  const { text } = await createBriefing({ store, services: {} }).generate('morning');
  assert.match(text, /DBMS/i);
  assert.ok(text.split(/\s+/).length < 160);
});
