import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.ATHER_DATA = mkdtempSync(join(tmpdir(), 'maya-learn-'));
const { openStore } = await import('../src/main/store.js');
const { fixHeard, learnWord, wordFixes, saveFeedback } = await import('../src/main/services/learning.js');
const { parseCommand } = await import('../src/renderer/shared/voicecommands.js');
const { allTools } = await import('../src/main/tools/index.js');
const { selectTools } = await import('../src/main/tools/select.js');

test('a word the user fixed is learned and fixed next time, whole words only', () => {
  const store = openStore(':memory:');
  assert.deepEqual(wordFixes('send it to gautam today', 'send it to Gowtham today'), [['gautam', 'Gowtham']]);
  assert.deepEqual(wordFixes('hi', 'hello there'), []); // a rewrite, not a mishearing
  assert.deepEqual(wordFixes('a b c d', 'w x y z'), []);
  learnWord(store, 'gautam', 'Gowtham');
  learnWord(store, 'mya', 'Maya');
  assert.equal(fixHeard(store, 'Hey mya, email Gautam.'), 'Hey Maya, email Gowtham.');
  assert.equal(fixHeard(store, 'myanmar'), 'myanmar');
  assert.equal(learnWord(store, '', 'x').learned, false);
});

test('a 👎 with a note becomes a preference; 👍 only counts', () => {
  const store = openStore(':memory:');
  saveFeedback(store, { question: 'weather?', good: true });
  saveFeedback(store, { question: 'summarise my mail', good: false, note: 'shorter, only the important ones' });
  assert.deepEqual(store.getSetting('feedback'), { good: 1, bad: 1 });
  const m = store.all("SELECT * FROM memories WHERE category = 'preference'");
  assert.equal(m.length, 1);
  assert.match(m[0].fact, /shorter, only the important ones/);
});

test('voice: good answer / bad answer, English and Tamil', () => {
  assert.deepEqual(parseCommand('Good answer'), { cmd: 'feedback', good: true });
  assert.deepEqual(parseCommand("That's wrong"), { cmd: 'feedback', good: false });
  assert.deepEqual(parseCommand('தப்பு'), { cmd: 'feedback', good: false });
  assert.equal(parseCommand('good answers need sources, explain why'), null);
});

test('"you keep hearing my when I say Maya" reaches learn_word', () => {
  assert.ok(selectTools(allTools, 'You keep hearing my when I say Maya').some((t) => t.name === 'learn_word'));
});

test('preferences go last, as rules to always follow; other facts stay a list', async () => {
  const { systemPrompt } = await import('../src/main/personality.js');
  const p = systemPrompt('normal', { memories: ['(fact) Studies CSE', '(preference) How the user wants answers: one short sentence'] });
  assert.match(p, /What you remember about the user:\n- \(fact\) Studies CSE/);
  assert.match(p, /ALWAYS follow these in this answer[^:\n]*:\n- How the user wants answers: one short sentence$/);
});

// Live: a 👎 note changes the very next answer.
const { ask } = await import('../src/main/brain.js');
const { OLLAMA } = await import('../src/main/ollama.js');
const running = await fetch(`${OLLAMA}/api/version`).then((r) => r.ok, () => false);
test('live: after "answer in one short sentence", answers are short', { skip: !running && 'Ollama not running', timeout: 300_000 }, async () => {
  const store = openStore(':memory:');
  saveFeedback(store, { question: 'explain things', good: false, note: 'Answer in one short sentence only.' });
  const answer = await ask({ text: 'What is photosynthesis?', store, tools: allTools, services: {}, style: 'short', mode: 'auto' });
  assert.ok(answer.split(/[.!?](\s|$)/).filter((s) => s && s.trim().length > 2).length <= 2, answer);
});

test('never forget: lasting facts from a conversation are kept, repeats and secrets are not', async () => {
  const { reflect, knownFact } = await import('../src/main/services/learning.js');
  assert.ok(knownFact('Has a brother named Rahul', ['User has a brother named Rahul who lives in Chennai']));
  assert.ok(!knownFact('Exam on 14 December', ['Has a brother named Rahul']));
  const store = openStore(':memory:');
  store.insert('memories', { fact: 'Has a brother named Rahul', category: 'fact', created_at: 'x' }, 'm');
  const fake = async () => JSON.stringify({ facts: ['Has a brother named Rahul', 'Has a DBMS exam on 14 December', 'password is hunter2!Xy9'] });
  const kept = await reflect(store, 'My brother Rahul will help me revise for the DBMS exam on 14 December', 'Great!', fake);
  assert.deepEqual(kept, ['Has a DBMS exam on 14 December']);
  assert.deepEqual(await reflect(store, 'hi', 'Hello!', fake), []); // small talk: nothing to think about
});

test('live: Maya remembers what you mention in passing', { skip: !running && 'Ollama not running', timeout: 300_000 }, async () => {
  const { reflect } = await import('../src/main/services/learning.js');
  const { complete } = await import('../src/main/brain.js');
  const store = openStore(':memory:');
  const kept = await reflect(store, 'Can you remind me tomorrow? My sister Priya is getting married on 20 December in Madurai.', 'Congratulations! I will remind you.', complete);
  assert.ok(kept.some((f) => /priya/i.test(f) && /(marri|wedding)/i.test(f)), JSON.stringify(kept));
});

test('a brain that is not downloaded gives a clear message, not a 404 dump', async () => {
  const { modelError } = await import('../src/main/brain.js');
  const e = modelError(404, '{"error":{"message":"model \'ather-brain\' not found"}}', 'ather-brain');
  assert.match(e.message, /not downloaded yet.*Settings → AI models/);
  assert.match(modelError(500, 'boom').message, /did not answer \(500\): boom/);
});
