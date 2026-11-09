import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import nodemailer from 'nodemailer';

process.env.ATHER_DATA = mkdtempSync(join(tmpdir(), 'ather-test-'));
const { openStore } = await import('../src/main/store.js');
const { createSos, sosEmail, medicalLines } = await import('../src/main/services/sos.js');
const { allTools } = await import('../src/main/tools/index.js');
const { selectTools } = await import('../src/main/tools/select.js');

const setup = (sos = {}) => {
  const store = openStore(':memory:');
  store.setSetting('sos', { contacts: ['amma@example.com', 'friend@example.com'], name: 'Ronald', note: 'Insulin is in the fridge', ...sos });
  const states = [], sent = [];
  const transport = nodemailer.createTransport({ jsonTransport: true });
  const real = transport.sendMail.bind(transport);
  transport.sendMail = async (m) => { sent.push(m); return real(m); };
  return { store, states, sent, sos: createSos({ store, secrets: { get: () => null }, transport, countdownMs: 50, onState: (s) => states.push(s.state) }) };
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('SOS: countdown, then alarm and an email to every caregiver', async () => {
  const { sos, states, sent, store } = setup();
  assert.deepEqual(sos.trigger('said "help me"'), { countdown: 0 });
  assert.equal(sos.pending, true);
  await wait(600);
  assert.deepEqual(states, ['countdown', 'alarm', 'alarm']);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'amma@example.com, friend@example.com');
  assert.match(sent[0].subject, /SOS: Ronald needs help/);
  assert.match(sent[0].text, /Insulin is in the fridge/);
  assert.equal(store.getSetting('sosLog')[0].sent, 2);
});

test('Medical ID: only filled-in fields, in a fixed order', () => {
  assert.deepEqual(medicalLines({ allergies: 'Penicillin', blood: 'O+', doctor: '', conditions: '  ' }), ['Blood group: O+', 'Allergies: Penicillin']);
  assert.deepEqual(medicalLines(undefined), []);
  const mail = sosEmail({ name: 'Ronald', note: '', reason: 'x', at: new Date(), medical: { blood: 'O+', medicines: 'Insulin 10 units at 8 am' } });
  assert.match(mail.text, /Medical ID:\n- Blood group: O\+\n- Medicines: Insulin 10 units at 8 am/);
  assert.doesNotMatch(sosEmail({ name: 'R', note: '', reason: 'x', at: new Date() }).text, /Medical ID/);
});

test('SOS: the help sign and the email carry the Medical ID', async () => {
  const store = openStore(':memory:');
  store.setSetting('sos', { contacts: ['amma@example.com'], name: 'Ronald', medical: { blood: 'B-', allergies: 'Peanuts' } });
  const shown = [], sent = [];
  const transport = { sendMail: async (m) => { sent.push(m); } };
  const sos = createSos({ store, secrets: { get: () => null }, transport, countdownMs: 20, onState: (s) => shown.push(s) });
  sos.trigger('test');
  await wait(400);
  assert.equal(shown.at(-1).state, 'alarm');
  assert.deepEqual(shown.at(-1).medical, ['Blood group: B-', 'Allergies: Peanuts']);
  assert.match(sent[0].text, /Allergies: Peanuts/);
});

test('Medical ID by voice: saves what was said, keeps the rest and the other SOS settings', async () => {
  const tool = allTools.find((t) => t.name === 'medical_id');
  assert.ok(tool, 'medical_id is registered');
  const store = openStore(':memory:');
  store.setSetting('sos', { contacts: ['amma@example.com'], name: 'Ronald' });
  const empty = await tool.run({}, { store });
  assert.match(empty.note, /nothing saved yet/i);
  await tool.run({ blood: 'O+', allergies: 'Penicillin' }, { store });
  const r = await tool.run({ medicines: 'Metformin 500 mg twice a day' }, { store });
  assert.deepEqual(r.medical, ['Blood group: O+', 'Allergies: Penicillin', 'Medicines: Metformin 500 mg twice a day']);
  assert.deepEqual(store.getSetting('sos').contacts, ['amma@example.com'], 'other SOS settings are kept');
  const cleared = await tool.run({ allergies: 'none' }, { store });
  assert.ok(cleared.medical.includes('Allergies: none'), 'saying "none" is kept: it tells a doctor something');
  for (const t of ['my blood group is O positive', 'what are my allergies?', 'show my medical ID'])
    assert.ok(selectTools(allTools, t).some((x) => x.name === 'medical_id'), t);
});

test('SOS: cancelling during the countdown sends nothing', async () => {
  const { sos, states, sent } = setup();
  sos.trigger();
  assert.equal(sos.cancel(), true);
  await wait(120);
  assert.deepEqual(states, ['countdown', 'cancelled']);
  assert.equal(sent.length, 0);
  assert.equal(sos.cancel(), false);
});

test('SOS: no caregiver saved still raises the alarm and says why no email went out', async () => {
  const { sos, states } = setup({ contacts: [] });
  sos.trigger();
  await wait(600);
  assert.deepEqual(states, ['countdown', 'alarm', 'alarm']);
  assert.match(sosEmail({ name: '', note: '', reason: 'x', at: new Date() }).subject, /Your contact needs help/);
});

test('check-in only after a long silence inside the chosen hours', () => {
  const { sos } = setup({ checkin: { on: true, hours: 2, from: '08:00', to: '22:00' } });
  assert.equal(sos.checkIn(3600, new Date(2026, 9, 29, 10, 0)), false); // only one hour quiet
  assert.equal(sos.checkIn(3 * 3600, new Date(2026, 9, 29, 23, 30)), false); // night: let them sleep
  assert.equal(sos.checkIn(3 * 3600, new Date(2026, 9, 29, 10, 0)), true);
  assert.equal(sos.pending, true);
  sos.cancel();
});
