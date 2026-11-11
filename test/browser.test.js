import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import electronPath from 'electron';
import { needsApproval, webUrl } from '../src/main/services/browser.js';
import { browserTools } from '../src/main/tools/browser.js';
import { selectTools } from '../src/main/tools/select.js';
import { allTools } from '../src/main/tools/index.js';

test('clicks that send, buy, post or delete need the user\'s OK; ordinary links do not', () => {
  for (const label of ['Send', 'Place order', 'Buy now', 'Delete account', 'Post', 'Submit application', 'Pay ₹499']) assert.ok(needsApproval({ label }), label);
  assert.ok(needsApproval({ label: 'Go', type: 'submit' }));
  for (const label of ['Inbox', 'Attendance', 'Next page', 'Search results', 'Sender details']) assert.equal(needsApproval({ label }), false, label);
  assert.equal(needsApproval(undefined), false);
});

test('only web addresses open: no file:, javascript: or browser-internal pages', () => {
  assert.equal(webUrl('gmail.com'), 'https://gmail.com/');
  assert.equal(webUrl('http://127.0.0.1:8080/x'), 'http://127.0.0.1:8080/x');
  for (const bad of ['file:///C:/Windows/win.ini', 'javascript:alert(1)', 'chrome://settings']) assert.throws(() => webUrl(bad), /Only http/);
});

test('a risky click waits for the user, and a "no" stops it', async () => {
  const click = browserTools.find((t) => t.name === 'browser_click');
  const clicked = [];
  const browser = { item: (n) => ({ n, label: n === 1 ? 'Send' : 'Inbox' }), read: async () => ({ url: 'https://mail.example.com/x' }), click: async (n) => clicked.push(n) };
  const asked = [];
  const services = { browser, confirm: async (r) => { asked.push(r); return false; } };
  assert.equal((await click.run({ number: 1 }, { services })).denied, true);
  assert.deepEqual(asked, [{ name: 'browser_click', args: { label: 'Send', site: 'mail.example.com' } }]);
  await click.run({ number: 2 }, { services });
  assert.deepEqual(clicked, [2]); // a plain link needs no question
  assert.match((await click.run({ number: 9 }, { services: { browser: { item: () => undefined } } })).error, /no element 9/i);
});

test('website jobs get the browser tools', () => {
  const names = (text) => selectTools(allTools, text).map((t) => t.name);
  for (const text of ['open my college portal and check attendance', 'log in to irctc.co.in', 'fill the online form on the website', 'check flipkart.com for headphones', 'use your browser to read my gmail'])
    assert.ok(names(text).includes('browser_open'), text);
  assert.ok(!names('what is an API?').includes('browser_open'));
});

test('live: Maya\'s browser reads, types (never passwords), clicks and goes back', { timeout: 90_000 }, () => {
  const script = fileURLToPath(new URL('./fixtures/browser-live.mjs', import.meta.url));
  const r = spawnSync(electronPath, [script], { encoding: 'utf8', timeout: 80_000, env: { ...process.env, ELECTRON_ENABLE_LOGGING: '' } });
  const out = (r.stdout || '') + (r.stderr || '');
  const line = out.split('\n').find((l) => l.startsWith('RESULT '));
  assert.ok(line, out.slice(-2000));
  const res = JSON.parse(line.slice(7));
  assert.equal(res.title, 'Maya test page');
  assert.ok(res.elements.includes('field: Name') && res.elements.includes('(password)'), res.elements);
  assert.match(res.passwordError, /never types passwords/);
  assert.equal(res.typed, 'Asha');
  assert.match(res.afterClick, /Page two/);
  assert.match(res.afterBack, /Maya test page/);
});
