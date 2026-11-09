// Integration test against the real local Ollama + qwen3.5:4b. Skipped when Ollama is not running.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.ATHER_DATA = mkdtempSync(join(tmpdir(), 'ather-brain-'));
const { openStore } = await import('../src/main/store.js');
const { productivityTools } = await import('../src/main/tools/productivity.js');
const { ask } = await import('../src/main/brain.js');
const { OLLAMA } = await import('../src/main/ollama.js');

const running = await fetch(`${OLLAMA}/api/version`).then((r) => r.ok, () => false);
const has9b = running && (await fetch(`${OLLAMA}/api/tags`).then((r) => r.json()).then((d) => d.models.some((m) => /^ather-smart/.test(m.name)), () => false));

/** The model ask() ends up using for this sentence (its last "model" event; stopped before the model runs). */
async function modelFor(text) {
  const { allTools } = await import('../src/main/tools/index.js');
  const stop = new AbortController();
  let key = null;
  await ask({ text, store: openStore(':memory:'), tools: allTools, services: {}, signal: stop.signal,
    onEvent: (e) => { if (e.type === 'model') { key = e.key; stop.abort(); } } }).catch(() => {});
  return key;
}

test('mouse-and-keyboard jobs get the 9B brain; plain questions stay fast', { skip: !has9b && 'ather-smart (9B) not installed' }, async () => {
  assert.equal(await modelFor('Open the Calculator app and use the mouse and keyboard in it to work out 12 times 7'), 'smart');
  assert.equal(await modelFor('click the save button'), 'smart');
  assert.equal(await modelFor('set volume to 30'), 'fast');
});

test('brain turns a sentence into a task and answers', { skip: !running && 'Ollama not running', timeout: 300_000 }, async () => {
  const store = openStore(':memory:');
  const events = [];
  const answer = await ask({ text: 'Add a task to study DBMS tomorrow at 5pm', store, tools: productivityTools, onEvent: (e) => events.push(e) });

  const tasks = store.all('SELECT * FROM tasks');
  assert.equal(tasks.length, 1);
  assert.match(tasks[0].title, /DBMS/i);
  const tomorrow = new Date(Date.now() + 864e5).toLocaleDateString('en-CA');
  assert.equal(tasks[0].due.slice(0, 10), tomorrow);
  assert.ok(events.some((e) => e.type === 'tool' && e.name === 'tasks_create'));
  assert.ok(answer.length > 0);
});

test('an answer may not claim typing or clicking that no tool did', async () => {
  const { unbackedClaim } = await import('../src/main/brain.js');
  const opened = [{ name: 'pc_open_app', result: { opened: 'Chrome' } }];
  assert.equal(unbackedClaim('I\'ve opened Google Chrome and typed "what\'s up" into the search bar.', opened), 'typed it');
  assert.equal(unbackedClaim('I\'ve opened Chrome and typed it.', [...opened, { name: 'computer_type', result: { done: 'ok' } }]), null);
  assert.equal(unbackedClaim('These are the data types you typed earlier.', opened), null);
  assert.equal(unbackedClaim('I clicked Send.', [{ name: 'computer_click', result: { error: 'not found' } }]), 'clicked or pressed it');
});

test('a looping answer keeps one copy of each repeated paragraph', async () => {
  const { dropRepeats } = await import('../src/main/brain.js');
  const p = 'நீங்கள் தேர்வில் எளிமையாகப் பார்க்க வேண்டியது: ஒரே தரவுகளை ஒரே பெட்டியில் வைத்திருக்க வேண்டும்.';
  assert.equal(dropRepeats(`Intro line.\n\n${p}\n\n${p}\n\n${p}\n\nOk.\n\nOk.`), `Intro line.\n\n${p}\n\nOk.\n\nOk.`);
  assert.equal(dropRepeats('No repeats here.'), 'No repeats here.');
});

test('the prompt spells out the next dates so "tomorrow" is copied, not computed', async () => {
  const { calendarWeek } = await import('../src/main/personality.js');
  const week = calendarWeek(new Date(2026, 10, 1, 23, 30)); // Sunday night
  assert.match(week, /^today = Sun 2026-11-01, tomorrow = Mon 2026-11-02, day after tomorrow = Tue 2026-11-03, Wed 2026-11-04/);
  assert.equal(week.split(', ').length, 8);
});

test('a list sent as JSON text is unpacked before the tool runs', async () => {
  const { unpackArgs } = await import('../src/main/brain.js');
  const schema = { properties: { title: { type: 'string' }, slides: { type: 'array' }, args: { type: 'object' } } };
  const got = unpackArgs({ title: '[not a list]', slides: '[{"title":"What is cloud?","bullets":["a","b"]}]', args: '{"x":1}' }, schema);
  assert.deepEqual(got, { title: '[not a list]', slides: [{ title: 'What is cloud?', bullets: ['a', 'b'] }], args: { x: 1 } });
  assert.deepEqual(unpackArgs({ slides: 'oops, plain text' }, schema), { slides: 'oops, plain text' });
  assert.deepEqual(unpackArgs({ slides: '{"a":1}' }, schema), { slides: '{"a":1}' }); // not an array: left alone
});

test('an answer that ends "let me try again" gets that round', async () => {
  const { promisedRetry } = await import('../src/main/brain.js');
  assert.ok(promisedRetry('I apologize for the technical issue. Let me try again with the correct format:'));
  assert.ok(promisedRetry("Sorry, that didn't work. I'll fix it now."));
  assert.ok(!promisedRetry('Done! Let me know if you need anything else.'));
  assert.ok(!promisedRetry("I've made your presentation. I'll be here if you want changes."));
});

test('"I\'m calling Amma now" must be backed by a real call', async () => {
  const { unbackedClaim } = await import('../src/main/brain.js');
  assert.equal(unbackedClaim("I'm initiating the call to Amma now.", []), 'called them');
  assert.equal(unbackedClaim("I'm calling Amma now.", [{ name: 'call_contact', result: { calling: 'Lakshmi' } }]), null);
});

test('a promise to act with nothing done is caught; the same action written differently counts once', async () => {
  const { promisedAction, callKey } = await import('../src/main/brain.js');
  assert.ok(promisedAction("I'll open WhatsApp with a message to Amma for you to send."));
  assert.ok(promisedAction("Sure! I'll set a timer for 10 minutes."));
  assert.ok(!promisedAction("You have 3 tasks. I'll be here if you need me."));
  assert.equal(callKey('whatsapp_message', { who: 'Amma', message: 'I reached home safely' }), callKey('whatsapp_message', { who: 'amma', message: 'I reached home safely.' }));
  assert.notEqual(callKey('tasks_create', { title: 'Revise OS' }), callKey('tasks_create', { title: 'Revise DBMS' }));
});
