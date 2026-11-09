import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.ATHER_DATA = mkdtempSync(join(tmpdir(), 'ather-test-'));
const { openStore } = await import('../src/main/store.js');
const { allTools } = await import('../src/main/tools/index.js');
const { createWorkflows } = await import('../src/main/services/workflows.js');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const save = (store, name, steps) => store.run('INSERT INTO routines (name, steps) VALUES (?, ?)', name.toLowerCase(), JSON.stringify(steps));

function setup(extra = []) {
  const store = openStore(':memory:');
  const states = [];
  const wf = createWorkflows({ store, tools: () => [...allTools, ...extra], ctx: { store, services: {} }, onChange: (r) => states.push(r.status) });
  return { store, wf, states };
}

test('a 3-step workflow runs real tools and its run can be inspected', async () => {
  const { store, wf } = setup();
  save(store, 'Exam prep', [
    { tool: 'tasks_create', args: { title: 'Revise DBMS unit 3' } },
    { tool: 'notes_create', args: { title: 'DBMS plan', body: 'Normalization, then transactions' } },
    { tool: 'focus_start', args: { minutes: 25, label: 'DBMS' } },
  ]);
  const run = await wf.start('exam prep').done;
  assert.equal(run.status, 'completed');
  assert.deepEqual(run.steps.map((s) => s.status), ['completed', 'completed', 'completed']);
  const saved = wf.get(run.id);
  assert.equal(saved.status, 'completed');
  assert.equal(saved.steps[0].result.title, 'Revise DBMS unit 3');
  assert.equal(store.get('SELECT title FROM tasks').title, 'Revise DBMS unit 3');
  assert.equal(wf.runs()[0].id, run.id);
});

test('cancelling a running workflow stops it at once; pause and resume work', async () => {
  const slow = { name: 'test_wait', description: '', parameters: {}, run: () => sleep(300).then(() => ({ ok: true })) };
  const { store, wf } = setup([slow]);
  save(store, 'Slow', [{ tool: 'test_wait' }, { tool: 'test_wait' }, { tool: 'test_wait' }]);

  const a = wf.start('slow');
  await sleep(50);
  wf.cancel(a.run.id);
  const cancelled = await a.done;
  assert.equal(cancelled.status, 'cancelled');
  assert.deepEqual(cancelled.steps.map((s) => s.status), ['cancelled', 'cancelled', 'cancelled']);

  const b = wf.start('slow');
  await sleep(50);
  wf.pause(b.run.id);
  await sleep(400); // first step finishes, then the run waits
  assert.equal(wf.get(b.run.id).status, 'paused');
  assert.equal(wf.get(b.run.id).steps[1].status, 'waiting');
  wf.resume(b.run.id);
  assert.equal((await b.done).status, 'completed');
});

test('a failed step stops the run and retry continues from it', async () => {
  let fail = true;
  const flaky = { name: 'test_flaky', description: '', parameters: {}, run: async () => (fail ? { error: 'network down' } : { ok: 1 }) };
  const { store, wf } = setup([flaky]);
  save(store, 'Flaky', [{ tool: 'tasks_create', args: { title: 'A' } }, { tool: 'test_flaky' }, { tool: 'tasks_create', args: { title: 'B' } }]);
  const run = await wf.start('flaky').done;
  assert.equal(run.status, 'failed');
  assert.equal(run.steps[1].error, 'network down');
  assert.equal(run.steps[2].status, 'cancelled');
  fail = false;
  const again = await wf.retry(run.id).done;
  assert.equal(again.status, 'completed');
  assert.equal(store.all('SELECT * FROM tasks').length, 2); // step 1 not repeated
});

test('a step needing approval waits, and a refusal cancels the run', async () => {
  const store = openStore(':memory:');
  const asked = [];
  const wf = createWorkflows({ store, tools: () => allTools, ctx: { store, services: {} }, confirm: async (req) => { asked.push(req.name); return false; } });
  save(store, 'Shut', [{ tool: 'tasks_create', args: { title: 'x' } }, { tool: 'pc_power', args: { action: 'shutdown' } }]);
  const run = await wf.start('shut').done;
  assert.deepEqual(asked, ['pc_power']);
  assert.equal(run.status, 'cancelled');
  assert.equal(run.steps[1].error, 'Not approved');
});

test('scheduled routines start once a day', async () => {
  const { store, wf } = setup();
  save(store, 'Morning', [{ tool: 'tasks_create', args: { title: 'Plan day' } }]);
  store.run("UPDATE routines SET schedule = '08:00'");
  wf.tick(new Date(2026, 9, 28, 7, 59));
  assert.equal(wf.runs().length, 0);
  wf.tick(new Date(2026, 9, 28, 8, 0));
  wf.tick(new Date(2026, 9, 28, 9, 0));
  await sleep(50);
  assert.equal(wf.runs().length, 1);
  assert.equal(wf.runs()[0].trigger, 'schedule');
});
