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
  for (const [skill, , steps, tools] of BUILTIN) {
    assert.ok(names.some((n) => new RegExp(tools).test(n)), `${skill}: ${tools}`);
    for (const used of steps.match(/\b[a-z]+_[a-z_]+\b/g) || []) assert.ok(names.includes(used), `${skill} mentions ${used}`);
  }
});

test('the right skill is picked, and ordinary questions get none', () => {
  const store = openStore(':memory:');
  assert.equal(matchSkill(store, 'Can you research solar energy and write a report on it?')?.name, 'Research report');
  assert.equal(matchSkill(store, 'make me a presentation about cloud computing')?.name, 'Presentation maker');
  assert.equal(matchSkill(store, 'plan a trip to Ooty for my family')?.name, 'Trip plan');
  assert.equal(matchSkill(store, 'build a calculator website')?.name, 'Build me an app');
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

test('everyday sentences do not trigger a skill', () => {
  const store = openStore(':memory:');
  for (const t of ['how are you today?', 'tell me a joke', 'what time is it in London', 'open WhatsApp', 'set a timer for 10 minutes', 'turn off the PC'])
    assert.equal(matchSkill(store, t)?.name, undefined, t);
});
