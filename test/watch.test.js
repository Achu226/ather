import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.ATHER_DATA = mkdtempSync(join(tmpdir(), 'maya-watch-'));
const { openStore } = await import('../src/main/store.js');
const { createWatches, newLines } = await import('../src/main/services/watch.js');
const { allTools } = await import('../src/main/tools/index.js');
const { selectTools } = await import('../src/main/tools/select.js');

const HOUR = 3600_000;
function setup(pages) {
  const store = openStore(':memory:');
  const alerts = [];
  let clock = 0;
  const read = async (url) => { const p = pages[url]; if (p instanceof Error) throw p; return { title: 'Page', url, text: p() }; };
  const w = createWatches({ store, read, notify: (title, body) => alerts.push({ title, body }), now: () => clock });
  return { store, alerts, w, tick: async (hours) => { clock += hours * HOUR; return w.tick(); } };
}

test('the first check only remembers the page; a change later is reported with the new lines', async () => {
  let text = 'Results\nSemester 5 results: not yet published\nContact office';
  const { w, alerts, tick } = setup({ 'https://coe.example.edu/results': () => text });
  const added = w.add({ url: 'https://coe.example.edu/results', what: 'Exam results', every_hours: 6 });
  assert.equal(added.what, 'Exam results');
  await tick(0);
  assert.equal(alerts.length, 0, 'first look: nothing to compare with');
  await tick(6);
  assert.equal(alerts.length, 0, 'unchanged');
  text = 'Results\nSemester 5 results: published, download PDF\nContact office';
  await tick(3);
  assert.equal(alerts.length, 0, 'not due yet (every 6 hours)');
  await tick(3);
  assert.equal(alerts.length, 1);
  assert.match(alerts[0].title, /Exam results/);
  assert.match(alerts[0].body, /Semester 5 results: published, download PDF/);
  assert.match(alerts[0].body, /https:\/\/coe\.example\.edu\/results/);
  await tick(6);
  assert.equal(alerts.length, 1, 'the same change is reported once');
});

test('a page that cannot be opened is noted without stopping the others', async () => {
  let a = 'price 1000';
  const { w, alerts, tick } = setup({ 'https://shop.example.com/a': () => a, 'https://down.example.com/': new Error('Could not open the page (503)') });
  w.add({ url: 'https://down.example.com/', what: 'Down site' });
  w.add({ url: 'https://shop.example.com/a', what: 'Wheelchair price' });
  await tick(0);
  a = 'price 899';
  await tick(6);
  assert.equal(alerts.length, 1);
  assert.match(alerts[0].body, /price 899/);
  assert.match(w.list().find((x) => x.what === 'Down site').error, /503/);
});

test('adding checks the address, the limits and duplicates; watches can be removed', () => {
  const { w } = setup({});
  assert.throws(() => w.add({ url: 'file:///C:/secret.txt', what: 'x' }), /http/);
  assert.throws(() => w.add({ url: 'not a url', what: 'x' }), /http/);
  const one = w.add({ url: 'https://a.example.com/', what: 'A', every_hours: 0.01 });
  assert.equal(one.every_hours, 1, 'at most once an hour');
  assert.equal(w.add({ url: 'https://a.example.com/', what: 'A again' }).id, one.id, 'same page: same watch');
  for (let i = 0; i < 19; i++) w.add({ url: `https://s${i}.example.com/`, what: `S${i}` });
  assert.throws(() => w.add({ url: 'https://one-too-many.example.com/', what: 'x' }), /20/);
  w.remove(one.id);
  assert.equal(w.list().length, 19);
});

test('new lines are the ones that were not on the page before', () => {
  assert.deepEqual(newLines('a\nb\nc', 'a\nb2\nc\nd'), ['b2', 'd']);
  assert.deepEqual(newLines('same', 'same'), []);
});

test('voice tools exist and "tell me when this page changes" reaches them', async () => {
  for (const n of ['watch_add', 'watch_list', 'watch_remove']) assert.ok(allTools.find((t) => t.name === n), n);
  const names = (t) => selectTools(allTools, t).map((x) => x.name);
  for (const t of ['tell me when https://coe.example.edu/results changes', 'watch this website for the exam notice', 'keep an eye on the price on this page', 'stop watching the results page'])
    assert.ok(names(t).includes('watch_add') || names(t).includes('watch_remove'), t);
  assert.ok(!names('what is an API?').includes('watch_add'));
});
