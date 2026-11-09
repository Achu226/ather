import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.ATHER_DATA = mkdtempSync(join(tmpdir(), 'ather-power-'));
const { openStore } = await import('../src/main/store.js');
const { ask, keepForHistory } = await import('../src/main/brain.js');
const { allTools } = await import('../src/main/tools/index.js');
const { createPython } = await import('../src/main/services/python.js');
const { createFiles, markdownToDocx } = await import('../src/main/services/files.js');
const { OLLAMA } = await import('../src/main/ollama.js');
const running = await fetch(`${OLLAMA}/api/version`).then((r) => r.ok, () => false);
const live = { skip: !running && 'Ollama not running', timeout: 600_000 };

const python = createPython();
const files = createFiles({ outDir: join(process.env.ATHER_DATA, 'out') });

test('python runs code, captures output and saves charts', { timeout: 300_000 }, async () => {
  const r = await python.execute('import matplotlib.pyplot as plt\nprint(sum(range(10)))\nplt.plot([1,2,3],[1,4,9])', 7);
  assert.equal(r.exit_code, 0, r.stderr);
  assert.match(r.stdout, /45/);
  assert.equal(r.images.length, 1);
  assert.ok(statSync(r.images[0]).size > 1000);
});

test('python errors are reported, not thrown', async () => {
  const r = await python.execute('raise ValueError("boom")', 7);
  assert.notEqual(r.exit_code, 0);
  assert.match(r.stderr, /ValueError: boom/);
});

test('makes a PowerPoint with the right number of slides', async () => {
  const { path, slides } = await files.presentation({ title: 'Cloud Computing', subtitle: 'Maya test',
    slides: [{ title: 'What is cloud?', bullets: ['On-demand', 'Pay as you go'] }, { title: 'Types', bullets: ['IaaS', 'PaaS', 'SaaS'], notes: 'Explain each' }] });
  assert.equal(slides, 3);
  const listing = execFileSync(join(process.env.SystemRoot, 'System32', 'tar.exe'), ['-tf', path]).toString();
  assert.equal((listing.match(/ppt\/slides\/slide\d+\.xml/g) || []).length, 3);
});

test('makes a Word document from Markdown', async () => {
  assert.equal(markdownToDocx('# Title\n\nSome **bold** text\n- one\n- two\n\n| a | b |\n|---|---|\n| 1 | 2 |').length, 5);
  const { path } = await files.document({ title: 'Report', markdown: '# Intro\nHello\n- point' });
  assert.ok(existsSync(path) && statSync(path).size > 1000);
});

test('history keeps file paths but not bulky data', () => {
  const kept = keepForHistory('python_run', { code: 'x' }, { stdout: 'a'.repeat(5000), images: ['c.png'], exit_code: 0, folder: 'D:/w' });
  assert.equal(kept.result.stdout.length, 2000);
  assert.deepEqual(kept.result.images, ['c.png']);
  assert.equal(kept.result.folder, undefined);
});

test('risky tools wait for approval; a denial is respected', live, async () => {
  const store = openStore(':memory:');
  const asked = [];
  const services = { python, confirm: async (req) => { asked.push(req.name); return false; } };
  const answer = await ask({ text: 'Use python_run to print 2**100', store, tools: allTools, services, style: 'chat', mode: 'fast' });
  assert.deepEqual(asked, ['python_run']);
  assert.ok(answer.length > 0);
});

test('code interpreter answers with real computation when approved', live, async () => {
  const store = openStore(':memory:');
  const services = { python, confirm: async () => true };
  const answer = await ask({ text: 'Use Python to compute 2 to the power 100 exactly.', store, tools: allTools, services, style: 'chat', mode: 'fast' });
  // Any number formatting is fine (1,267,… or LaTeX 1\!267\!…): compare the digits.
  assert.match(answer.replace(/[^0-9]/g, ''), /1267650600228229401496703205376/);
});

test('agent mode plans and completes a multi-step goal', live, async () => {
  const store = openStore(':memory:');
  const events = [];
  await ask({ text: 'Plan 3 study sessions for DBMS on different days this week and add each one as a task with a due time.',
    store, tools: allTools, services: {}, style: 'chat', mode: 'agent', onEvent: (e) => e.type === 'tool' && events.push(e.name) });
  assert.ok(events.includes('agent_plan'), `tools: ${events}`);
  assert.ok(store.all('SELECT * FROM tasks').length >= 3);
});
