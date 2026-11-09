import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import nodemailer from 'nodemailer';

process.env.ATHER_DATA = mkdtempSync(join(tmpdir(), 'ather-mail-'));
const { openStore } = await import('../src/main/store.js');
const { createMail, criteria, smtpHost } = await import('../src/main/services/mail.js');
const { addFollowUp, checkFollowUps, weeklyMarkdown, weeklyTick } = await import('../src/main/services/work.js');
const { createFiles } = await import('../src/main/services/files.js');
const { allTools } = await import('../src/main/tools/index.js');
const { selectTools } = await import('../src/main/tools/select.js');

const raw = (uid, from, subject, body, extra = '') => Buffer.from(
  `From: ${from}\r\nTo: me@example.com\r\nSubject: ${subject}\r\nMessage-ID: <m${uid}@example.com>\r\nDate: Mon, 26 Oct 2026 10:00:00 +0530\r\n${extra}\r\n${body}\r\n`);
const box = [
  { uid: 11, flags: new Set(['\\Seen']), source: raw(11, 'Rahul <rahul@example.com>', 'Project report', 'Please send the report by Friday.') },
  { uid: 12, flags: new Set(), source: raw(12, 'Deals <news@shop.com>', '50% off', 'Big sale', 'List-Unsubscribe: <mailto:u@shop.com>\r\n') },
];

/** A fake IMAP server: records what was asked of it. */
function fakeImap(calls) {
  return () => ({
    mailbox: { exists: box.length },
    connect: async () => {}, logout: async () => {},
    getMailboxLock: async () => ({ release() {} }),
    async *fetch(range) { calls.push(['fetch', range]); for (const m of box) if (String(range).includes(':*') || String(range).split(',').includes(String(m.uid))) yield m; },
    search: async (c) => { calls.push(['search', c]); return box.filter((m) => !c.from || m.source.toString().includes(c.from)).map((m) => m.uid); },
    fetchOne: async (uid) => box.find((m) => String(m.uid) === uid),
    messageFlagsAdd: async (uids, flags) => calls.push(['flags', uids, flags]),
    messageMove: async (uids, dest) => calls.push(['move', uids, dest]),
    list: async () => [{ path: 'INBOX' }, { path: '[Gmail]/All Mail', specialUse: '\\All' }],
  });
}

function setup() {
  const store = openStore(':memory:');
  store.setSetting('mail', { host: 'imap.gmail.com', user: 'me@example.com' });
  const calls = [];
  const transport = nodemailer.createTransport({ jsonTransport: true });
  const mail = createMail({ store, secrets: { get: () => 'app-pass' }, imap: fakeImap(calls), transport });
  return { store, calls, mail };
}

test('search criteria and SMTP host', () => {
  assert.deepEqual(criteria({}), { all: true });
  assert.deepEqual(criteria({ from: 'Rahul', unread: true }), { from: 'Rahul', seen: false });
  assert.equal(smtpHost('imap.gmail.com'), 'smtp.gmail.com');
  assert.equal(smtpHost('imap.zoho.com'), 'smtp.zoho.com');
});

test('reads, searches and spots newsletters', async () => {
  const { mail } = setup();
  const found = await mail.search({ from: 'rahul' });
  assert.deepEqual(found.map((m) => m.subject), ['Project report']);
  const one = await mail.read(11);
  assert.match(one.text, /report by Friday/);
  assert.equal(one.message_id, '<m11@example.com>');
  assert.deepEqual((await mail.promotions()).map((m) => m.uid), [12]);
});

test('reply threads to the original; archive moves, never deletes', async () => {
  const { mail, calls } = setup();
  const sent = await mail.reply(11, 'Sending it today.');
  assert.equal(sent.subject, 'Re: Project report');
  assert.match(sent.to, /rahul@example.com/);
  await mail.archive([12]);
  assert.deepEqual(calls.at(-1), ['move', '12', '[Gmail]/All Mail']);
  await mail.markRead([11, 12]);
  assert.deepEqual(calls.at(-1), ['flags', '11,12', ['\\Seen']]);
});

test('not connected: a clear message', async () => {
  const store = openStore(':memory:');
  const mail = createMail({ store, secrets: { get: () => null } });
  await assert.rejects(mail.search({}), /not connected/);
});

test('sending, archiving and adding tasks from mail all need approval', () => {
  for (const name of ['mail_send', 'mail_reply', 'mail_archive', 'mail_add_tasks']) assert.equal(allTools.find((t) => t.name === name).confirm, true, name);
  for (const name of ['mail_search', 'mail_read', 'mail_promotions']) assert.ok(!allTools.find((t) => t.name === name).confirm, name);
});

test('mail requests get mail tools, not screen control', () => {
  const names = (text) => selectTools(allTools, text).map((t) => t.name);
  for (const text of ['reply to Rahul\'s email', 'send an email to my guide', 'remind me if Rahul doesn\'t reply by Friday', 'clean up the newsletters']) {
    assert.ok(names(text).some((n) => n.startsWith('mail_')), text);
    assert.ok(!names(text).includes('computer_start'), text);
  }
  assert.ok(names('make my weekly report').includes('report_weekly'));
});

test('follow-up: a reply closes it; no reply by the date adds a task', async () => {
  const { store, mail } = setup();
  const told = [];
  const notify = (title, body) => told.push(title);
  addFollowUp(store, { from: 'rahul', subject: 'report', by: '2026-10-30T17:00' });
  addFollowUp(store, { from: 'priya', by: '2026-10-30T17:00' });
  assert.throws(() => addFollowUp(store, { from: 'x', by: 'someday' }));
  await checkFollowUps({ store, mail, notify, at: new Date('2026-10-29T10:00') });
  assert.deepEqual(told, ['They replied']); // priya: not yet due
  await checkFollowUps({ store, mail, notify, at: new Date('2026-10-31T10:00') });
  assert.deepEqual(told, ['They replied', 'No reply yet']);
  assert.equal(store.all('SELECT * FROM tasks WHERE title LIKE ?', 'Follow up with priya%').length, 1);
  assert.ok(store.getSetting('followups').every((f) => f.done));
});

test('weekly report: done and open work, once per Friday evening', async () => {
  const { store } = setup();
  store.insert('tasks', { title: 'Finish DBMS notes', done: 1, completed_at: '2026-10-28T12:00:00', created_at: '2026-10-27' }, 't');
  store.insert('tasks', { title: 'Submit project', due: '2026-10-27T10:00', created_at: '2026-10-26' }, 't');
  const md = weeklyMarkdown(store, new Date('2026-10-30T18:00'));
  assert.match(md, /## Done \(1\)\n\n- Finish DBMS notes/);
  assert.match(md, /Submit project \(due 2026-10-27, overdue\)/);
  const files = createFiles({ outDir: join(process.env.ATHER_DATA, 'out') });
  const told = [];
  const notify = (title) => told.push(title);
  assert.equal(await weeklyTick({ store, files, notify, at: new Date('2026-10-29T18:00') }), null); // Thursday
  const path = await weeklyTick({ store, files, notify, at: new Date('2026-10-30T17:30') });
  assert.ok(existsSync(path));
  assert.equal(await weeklyTick({ store, files, notify, at: new Date('2026-10-30T19:00') }), null); // already made
  store.setSetting('weeklyReport', false);
  store.setSetting('weeklyReportLast', null);
  assert.equal(await weeklyTick({ store, files, notify, at: new Date('2026-10-30T19:00') }), null);
  assert.deepEqual(told, ['Weekly report ready']);
});

// Live: the real model, with the fake mailbox. Nothing is sent: the reply's approval is refused.
const { ask } = await import('../src/main/brain.js');
const { OLLAMA } = await import('../src/main/ollama.js');
const running = await fetch(`${OLLAMA}/api/version`).then((r) => r.ok, () => false);
const live = { skip: !running && 'Ollama not running', timeout: 600_000 };

test('by voice or text: a follow-up is set from plain words', live, async () => {
  const { store, mail } = setup();
  const used = [];
  await ask({ text: 'Remind me if Rahul doesn\'t reply to my email by Friday.', store, tools: allTools, services: { mail }, style: 'chat', mode: 'fast',
    onEvent: (e) => e.type === 'tool' && used.push(e.name) });
  assert.ok(used.includes('mail_follow_up'), `tools: ${used}`);
  assert.match(store.getSetting('followups', [])[0]?.from || '', /rahul/i);
});

test('a reply is written, then waits for approval', live, async () => {
  const { store, mail } = setup();
  const asked = [];
  const services = { mail, confirm: async (req) => { asked.push(req); return false; } };
  await ask({ text: 'Reply to Rahul\'s email about the project report: tell him I will send it today.', store, tools: allTools, services, style: 'chat', mode: 'fast' });
  const reply = asked.find((r) => r.name === 'mail_reply');
  assert.ok(reply, `asked: ${asked.map((r) => r.name)}`);
  assert.equal(reply.args.uid, 11);
  assert.match(reply.args.text, /today/i);
});
