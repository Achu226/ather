import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.ATHER_DATA = mkdtempSync(join(tmpdir(), 'maya-skills-'));
const { openStore } = await import('../src/main/store.js');
const { matchSkill, saveSkill, BUILTIN } = await import('../src/main/services/skills.js');
const { allTools } = await import('../src/main/tools/index.js');
const { selectTools } = await import('../src/main/tools/select.js');

test('built-in skills only name tools that exist', () => {
  const names = allTools.map((t) => t.name);
  const params = new Set(allTools.flatMap((t) => Object.keys(t.parameters?.properties || {}))); // e.g. in_days
  for (const [skill, , steps, tools] of BUILTIN) {
    assert.ok(names.some((n) => new RegExp(tools).test(n)), `${skill}: ${tools}`);
    for (const used of steps.match(/\b[a-z]+_[a-z_]+\b/g) || []) assert.ok(names.includes(used) || params.has(used), `${skill} mentions ${used}`);
  }
});

test('the right skill is picked, and ordinary questions get none', () => {
  const store = openStore(':memory:');
  assert.equal(matchSkill(store, 'Can you research solar energy and write a report on it?')?.name, 'Research report');
  assert.equal(matchSkill(store, 'make me a presentation about cloud computing')?.name, 'Presentation maker');
  assert.equal(matchSkill(store, 'plan a trip to Ooty for my family')?.name, 'Trip plan');
  assert.equal(matchSkill(store, 'build a calculator website')?.name, 'Build me an app');
  assert.equal(matchSkill(store, 'make me an app for my shop')?.name, 'Build me an app');
  // "the Calculator app" names an app that exists: opening or using it is not building one.
  for (const t of ['Open the Calculator app and use the mouse and keyboard in it to work out 12 times 7', 'type hello in the Notes app', 'launch the camera app'])
    assert.notEqual(matchSkill(store, t)?.name, 'Build me an app', t);
  assert.equal(matchSkill(store, 'what is the capital of France?'), null);
  assert.equal(matchSkill(store, 'hi'), null);
});

test('a taught skill is used when its name is said; it can be switched off', () => {
  const store = openStore(':memory:');
  saveSkill(store, { name: 'Goodnight', when: 'when I go to sleep', steps: 'Turn on dark mode. Read tomorrow\'s tasks.' });
  assert.equal(matchSkill(store, 'goodnight Maya')?.name, 'Goodnight');
  assert.throws(() => saveSkill(store, { name: 'x', when: '', steps: 'y' }));
  assert.throws(() => saveSkill(store, { name: 'x', when: 'y', steps: 'z', tools: '(' }));
  store.run('UPDATE skills SET enabled = 0 WHERE name = ?', 'Goodnight');
  assert.equal(matchSkill(store, 'goodnight Maya'), null);
});

test('"teach yourself" reaches the skill tools', () => {
  const names = selectTools(allTools, 'Teach yourself: when I say goodnight, turn on dark mode').map((t) => t.name);
  assert.ok(names.includes('skills_save'));
});

test('the accessibility skills are found from everyday words', () => {
  const store = openStore(':memory:');
  const cases = {
    'Caregiver SOS': ['I need help, call my caregiver', 'I fell down, get help'],
    'Refill medicines': ['my BP tablets are running out', 'remind me to refill my medicine'],
    'Read it to me': ['read this page to me slowly', 'read what is on my screen aloud'],
    'Fill a form for me': ['fill this form for me', 'help me fill in the form on the screen'],
    'Tired or in pain': ["I'm tired today and my hands hurt", 'I have low energy, please make things easier'],
  };
  for (const [skill, phrases] of Object.entries(cases)) for (const p of phrases) assert.equal(matchSkill(store, p)?.name, skill, p);
  // One shared word must not pull these in: a plain call, a medicine reminder, a mood, dark mode, homework help.
  for (const p of ['call Amma', 'remind me to take my medicine at 8pm', "I'm feeling happy", 'turn on dark mode', 'help me with my homework'])
    assert.ok(!Object.keys(cases).includes(matchSkill(store, p)?.name), `${p} → ${matchSkill(store, p)?.name}`);
});

test('the form skill never types secrets itself', () => {
  const form = BUILTIN.find(([name]) => name === 'Fill a form for me');
  assert.match(form[2], /never type passwords, card numbers, OTPs/i);
  assert.match(form[2], /read .*back.*before/i);
});

test('everyday sentences do not trigger a skill', () => {
  const store = openStore(':memory:');
  for (const t of ['how are you today?', 'tell me a joke', 'what time is it in London', 'open WhatsApp', 'set a timer for 10 minutes', 'turn off the PC'])
    assert.equal(matchSkill(store, t)?.name, undefined, t);
});
