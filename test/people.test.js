import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.ATHER_DATA = mkdtempSync(join(tmpdir(), 'maya-test-'));
const { openStore } = await import('../src/main/store.js');
const peopleToolsModule = await import('../src/main/tools/people.js');
const { peopleTools, intlNumber } = peopleToolsModule;
const { selectTools } = await import('../src/main/tools/select.js');
const { allTools } = await import('../src/main/tools/index.js');

const run = (store, name, args, services = {}) => peopleTools.find((t) => t.name === name).run(args, { store, services });

test('phone numbers get the country code for WhatsApp', () => {
  assert.equal(intlNumber('98400 12345'), '919840012345');
  assert.equal(intlNumber('09840012345'), '919840012345');
  assert.equal(intlNumber('+44 7700 900123'), '447700900123');
  assert.equal(intlNumber('0044 7700 900123'), '447700900123');
});

test('contacts by name or relation; WhatsApp opens with the message, never sends', async () => {
  const store = openStore(':memory:');
  run(store, 'contacts_add', { name: 'Lakshmi', phone: '98400 12345', relation: 'Amma' });
  run(store, 'contacts_add', { name: 'Rahul Kumar', phone: '+91 99999 11111' });
  assert.ok(run(store, 'contacts_add', { name: 'X', phone: '12' }).error);
  run(store, 'contacts_add', { name: 'rahul kumar', phone: '+91 88888 22222' }); // same name: updated, not doubled
  assert.equal(run(store, 'contacts_query', {}).length, 2);
  const opened = [];
  const services = { openExternal: async (u) => opened.push(u), pc: { storeApps: async () => ({}) } };
  const r = await run(store, 'whatsapp_message', { who: 'amma', message: 'I reached home' }, services);
  assert.deepEqual([r.to, r.sent, opened[0]], ['Lakshmi', false, 'https://web.whatsapp.com/send?phone=919840012345&text=I%20reached%20home']);
  await run(store, 'whatsapp_message', { who: 'Rahul', message: 'ok' }, { ...services, pc: { storeApps: async () => ({ WhatsApp: 'id' }) } });
  assert.equal(opened[1], 'whatsapp://send?phone=918888822222&text=ok');
  assert.match((await run(store, 'whatsapp_message', { who: 'Priya', message: 'hi' }, services)).error, /No contact called "Priya"/);
});

test('calling asks first and dials the saved number', async () => {
  const store = openStore(':memory:');
  run(store, 'contacts_add', { name: 'Dr. Meena', phone: '044 2345 6789', relation: 'doctor' });
  assert.ok(peopleTools.find((t) => t.name === 'call_contact').confirm);
  const dialed = [];
  const r = await run(store, 'call_contact', { who: 'my doctor' }, { phoneCall: async (n) => { dialed.push(n); return { calling: n }; } });
  assert.deepEqual([r.calling, dialed[0]], ['Dr. Meena', '044 2345 6789']);
});

test('diary keeps entries with moods and counts them', () => {
  const store = openStore(':memory:');
  run(store, 'diary_add', { text: 'Physio went well today', mood: 'happy' });
  run(store, 'diary_add', { text: 'Back pain at night', mood: 'in pain' });
  run(store, 'diary_add', { text: 'Called my friend', mood: 'made-up' });
  const week = run(store, 'diary_query', {});
  assert.equal(week.entries.length, 3);
  assert.deepEqual({ ...week.moods }, { happy: 1, 'in pain': 1 });
});

test('requests reach the people tools', () => {
  const names = (q) => selectTools(allTools, q).map((t) => t.name);
  assert.ok(names('send a WhatsApp to Amma saying I reached').includes('whatsapp_message'));
  assert.ok(names('call my doctor').includes('call_contact'));
  assert.ok(names('dear diary, today was a good day').includes('diary_add'));
  assert.ok(names('how was my week?').includes('diary_query'));
});

test('contacts are found however a small model writes the name', () => {
  const store = openStore(':memory:');
  run(store, 'contacts_add', { name: 'Lakshmi', phone: '98400 12345', relation: 'amma' });
  run(store, 'contacts_add', { name: 'Rahul Kumar', phone: '99999 11111' });
  const { findContact } = peopleToolsModule;
  for (const who of ['Lakshmi (amma)', 'my amma', 'Amma', 'lakshmi', '"Lakshmi"']) assert.equal(findContact(store, who)?.name, 'Lakshmi', who);
  assert.equal(findContact(store, 'rahul')?.name, 'Rahul Kumar');
  assert.equal(findContact(store, 'priya'), null);
});
