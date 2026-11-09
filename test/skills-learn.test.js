import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.ATHER_DATA = mkdtempSync(join(tmpdir(), 'maya-learn-'));
const { openStore } = await import('../src/main/store.js');
const { learnSkill, jobSteps, saveSkill } = await import('../src/main/services/skills.js');

const ok = (name, args = {}) => ({ name, args, result: {} });
// Not covered by a built-in skill ("Download from a chat" is WhatsApp), so only learning can handle it.
const QUESTION = 'grab the clip Ravi sent me in Telegram and put it in Videos';
const JOB = [
  ok('agent_plan', { steps: ['open chat', 'download', 'move'] }),
  ok('whatsapp_open_chat', { who: 'Ravi' }),
  ok('computer_start', { task: 'save the video' }),
  ok('computer_look'),
  ok('computer_click', { element: 12 }),
  ok('downloads_latest', { kind: 'video' }),
  ok('fs_move', { from: 'C:/Users/x/Downloads/v.mp4', to: 'desktop' }),
];
const WRITTEN = { name: 'Save a chat video', when: 'save or download a video from a WhatsApp chat to the desktop', steps: '1. Open the chat the user names.\n2. Download the newest video.\n3. Move it to the desktop.' };
// A stand-in for the local model: records the prompt and answers with fixed JSON.
const model = (reply = WRITTEN) => {
  const fake = async (prompt, opts) => { fake.prompt = prompt; fake.opts = opts; return typeof reply === 'string' ? reply : JSON.stringify(reply); };
  return fake;
};

test('job steps leave out planning, failed and refused calls', () => {
  const steps = jobSteps([...JOB, { name: 'fs_move', args: {}, result: { error: 'busy' } }, { name: 'mail_send', args: {}, result: { denied: true } }]);
  assert.deepEqual(steps.map((s) => s.name), ['whatsapp_open_chat', 'computer_start', 'computer_look', 'computer_click', 'downloads_latest', 'fs_move']);
});

test('a finished multi-step job becomes a skill offer, with only the tools it used', async () => {
  const store = openStore(':memory:');
  assert.equal((await import('../src/main/services/skills.js')).matchSkill(store, QUESTION), null, 'no skill fits this request yet');
  const complete = model({ ...WRITTEN, tools: '.*' });
  const skill = await learnSkill(store, QUESTION, JOB, complete);
  assert.equal(skill.name, 'Save a chat video');
  assert.equal(skill.when, WRITTEN.when);
  assert.match(skill.steps, /^1\. Open the chat/);
  assert.equal(skill.tools, '^(whatsapp_open_chat|computer_start|computer_look|computer_click|downloads_latest|fs_move)$');
  assert.match(complete.prompt, /computer_click/);
  assert.ok(complete.opts?.format, 'asks the model for JSON');
  assert.equal(store.get('SELECT COUNT(*) AS n FROM skills WHERE name = ?', skill.name).n, 0, 'nothing is saved before the user agrees');
});

test('no offer for short, failed, refused or already-known jobs', async () => {
  const store = openStore(':memory:');
  const never = model();
  const cases = {
    'only lookups': [ok('web_search'), ok('web_read'), ok('web_read'), ok('files_make_document')],
    'one tool repeated': [ok('computer_click'), ok('computer_click'), ok('computer_click')],
    'refused step': [...JOB, { name: 'computer_keys', args: {}, result: { denied: true } }],
    'last step failed': [...JOB, { name: 'fs_move', args: {}, result: { error: 'File not found' } }],
  };
  for (const [why, log] of Object.entries(cases)) assert.equal(await learnSkill(store, QUESTION, log, never), null, why);
  assert.equal(await learnSkill(store, 'make me a presentation about cloud computing with nice slides', JOB, never), null, 'a skill already fits');
  assert.equal(await learnSkill(store, 'save it', JOB, never), null, 'too short to name a job');
  assert.equal(never.prompt, undefined, 'the model is not even asked');
});

test('a bad or duplicate answer from the model is dropped', async () => {
  const store = openStore(':memory:');
  assert.equal(await learnSkill(store, QUESTION, JOB, model('not json')), null);
  assert.equal(await learnSkill(store, QUESTION, JOB, model({ name: '', when: 'x', steps: 'y' })), null);
  saveSkill(store, { name: 'save a chat video', when: 'old', steps: 'old steps' });
  assert.equal(await learnSkill(store, QUESTION, JOB, model()), null, 'same name as a saved skill');
});

test('secrets in the request or the steps are never learned', async () => {
  const store = openStore(':memory:');
  assert.equal(await learnSkill(store, 'log in to my bank with password Xk9#mP2qL7 and pay the bill', JOB, model()), null);
  assert.equal(await learnSkill(store, QUESTION, JOB, model({ ...WRITTEN, steps: 'Type the OTP 482913 then press enter' })), null);
});
