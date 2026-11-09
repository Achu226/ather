import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.ATHER_DATA = mkdtempSync(join(tmpdir(), 'maya-telegram-'));
const { openStore } = await import('../src/main/store.js');
const { createTelegram, splitMessage } = await import('../src/main/services/telegram.js');

const TOKEN = '123456:FAKE-token_for-tests';
/** A fake Telegram Bot API: queued updates in, sent messages out. */
function fakeTelegram({ valid = true } = {}) {
  const t = { queue: [], sent: [], offsets: [], valid, nextId: 1 };
  t.fetch = async (url, opts = {}) => {
    const m = /\/bot([^/]+)\/(\w+)$/.exec(String(url));
    assert.ok(m, String(url));
    if (!t.valid || m[1] !== TOKEN) return { ok: false, status: 401, json: async () => ({ ok: false, description: 'Unauthorized' }) };
    const body = opts.body ? JSON.parse(opts.body) : {};
    if (m[2] === 'getMe') return { ok: true, json: async () => ({ ok: true, result: { username: 'maya_test_bot' } }) };
    if (m[2] === 'getUpdates') { t.offsets.push(body.offset); const result = t.queue.filter((u) => u.update_id >= (body.offset || 0)); t.queue = []; return { ok: true, json: async () => ({ ok: true, result }) }; }
    if (m[2] === 'sendMessage') { t.sent.push(body); return { ok: true, json: async () => ({ ok: true, result: {} }) }; }
    throw new Error(`unexpected ${m[2]}`);
  };
  t.say = (chatId, text, first_name = 'Rahul') => t.queue.push({ update_id: t.nextId++, message: { chat: { id: chatId }, from: { first_name }, text } });
  return t;
}
const fakeSecrets = () => { const m = new Map(); return { get: (k) => m.get(k) ?? null, set: (k, v) => (v ? m.set(k, v) : m.delete(k)), map: m }; };

async function setup({ answer = async (text) => `You said: ${text}` } = {}) {
  const store = openStore(':memory:');
  const secrets = fakeSecrets();
  const tg = fakeTelegram();
  const asked = [];
  const bot = createTelegram({ store, secrets, fetchFn: tg.fetch, answer: async (text, ctx) => { asked.push(text); return answer(text, ctx); } });
  await bot.setToken(TOKEN);
  return { store, secrets, tg, asked, bot };
}

test('the token is checked with Telegram and kept encrypted, never in plain settings', async () => {
  const { store, secrets, bot } = await setup();
  assert.equal(secrets.get('telegram-token'), TOKEN);
  assert.doesNotMatch(JSON.stringify(store.getSetting('telegram', {})), /FAKE-token/);
  const s = bot.status();
  assert.equal(s.bot, 'maya_test_bot');
  assert.equal(s.paired, false);
  assert.match(s.code, /^\d{6}$/);
  const bad = createTelegram({ store: openStore(':memory:'), secrets: fakeSecrets(), fetchFn: fakeTelegram({ valid: false }).fetch, answer: async () => '' });
  await assert.rejects(bad.setToken('999:wrong'), /Telegram did not accept this token/);
});

test('only the 6-digit code pairs a chat; then other chats get no answer at all', async () => {
  const { tg, asked, bot } = await setup();
  tg.say(5, 'hello');
  await bot.pollOnce();
  assert.equal(asked.length, 0, 'nothing is answered before pairing');
  assert.match(tg.sent.at(-1).text, /6-digit code/);
  tg.say(5, `/start ${bot.status().code}`);
  await bot.pollOnce();
  assert.equal(bot.status().paired, true);
  assert.equal(bot.status().chat, 'Rahul');
  assert.match(tg.sent.at(-1).text, /paired/i);
  const before = tg.sent.length;
  tg.say(9, 'what is on my calendar?', 'Stranger');
  tg.say(9, bot.status().code || '000000', 'Stranger');
  await bot.pollOnce();
  assert.equal(tg.sent.length, before, 'a stranger gets no reply');
  assert.equal(asked.length, 0);
  tg.say(5, 'what is on my calendar?');
  await bot.pollOnce();
  assert.deepEqual(asked, ['what is on my calendar?']);
  assert.equal(tg.sent.at(-1).chat_id, 5);
  assert.equal(tg.sent.at(-1).text, 'You said: what is on my calendar?');
});

test('anything that needs approval is refused from the phone', async () => {
  const { tg, bot } = await setup({ answer: async (text, { confirm }) => ((await confirm({ name: 'computer_start', args: {} })) ? 'done' : 'I could not do that.') });
  tg.say(5, bot.status().code);
  await bot.pollOnce();
  tg.say(5, 'open notepad and type hello');
  await bot.pollOnce();
  assert.match(tg.sent.at(-1).text, /I could not do that\./);
  assert.match(tg.sent.at(-1).text, /approve .* on the PC/i);
});

test('reminders reach the paired phone, and nothing is sent before pairing', async () => {
  const { tg, bot } = await setup();
  await bot.notify('⏰ Medicine time: BP tablet');
  assert.equal(tg.sent.length, 0, 'not paired yet: nobody to send to');
  tg.say(5, bot.status().code);
  await bot.pollOnce();
  await bot.notify('⏰ Medicine time: BP tablet');
  assert.deepEqual(tg.sent.at(-1), { chat_id: 5, text: '⏰ Medicine time: BP tablet' });
  tg.valid = false;
  await bot.notify('offline reminder'); // must never throw into the reminder timer
});

test('caregivers join with a one-time code, get alerts only, and can be removed', async () => {
  const { tg, asked, bot } = await setup();
  tg.say(5, bot.status().code); // the owner
  await bot.pollOnce();
  const code = bot.status().caregiverCode;
  assert.match(code, /^\d{6}$/);
  assert.notEqual(code, bot.status().code);
  tg.say(7, `/start ${code}`, 'Priya');
  await bot.pollOnce();
  assert.deepEqual(bot.status().caregivers, [{ id: 7, name: 'Priya' }]);
  assert.match(tg.sent.find((m) => m.chat_id === 7).text, /emergency alerts/i);
  assert.match(tg.sent.find((m) => m.chat_id === 5 && /Priya/.test(m.text)).text, /joined as a caregiver/, 'the owner is told who joined');
  assert.notEqual(bot.status().caregiverCode, code, 'a used code is replaced');
  const before = tg.sent.length;
  tg.say(8, code, 'Stranger'); // the old code no longer works, and strangers get nothing
  await bot.pollOnce();
  assert.equal(tg.sent.length, before);
  assert.equal(bot.status().caregivers.length, 1);
  tg.say(7, 'how is she doing?', 'Priya'); // a caregiver never reaches the AI or the user's data
  await bot.pollOnce();
  assert.equal(asked.length, 0);
  assert.match(tg.sent.at(-1).text, /only sends alerts/i);
  assert.equal(await bot.alertCaregivers('SOS: Ronald needs help'), 1);
  assert.deepEqual(tg.sent.at(-1), { chat_id: 7, text: 'SOS: Ronald needs help' });
  bot.removeCaregiver(7);
  assert.deepEqual(bot.status().caregivers, []);
  assert.equal(await bot.alertCaregivers('nobody'), 0);
});

test('each message is handled once, long answers are split, and a revoked token stops polling', async () => {
  const { tg, asked, bot, secrets } = await setup({ answer: async () => 'x'.repeat(9000) });
  tg.say(5, bot.status().code);
  await bot.pollOnce();
  tg.say(5, 'tell me a long story');
  await bot.pollOnce();
  await bot.pollOnce();
  assert.equal(asked.length, 1);
  assert.ok(tg.offsets.at(-1) > 1, 'the next poll asks only for newer messages');
  const parts = tg.sent.filter((m) => /^x+$/.test(m.text));
  assert.equal(parts.length, 3);
  assert.ok(parts.every((p) => p.text.length <= 4096));
  assert.deepEqual(splitMessage('a'.repeat(10)), ['a'.repeat(10)]);
  tg.valid = false;
  await bot.pollOnce();
  assert.match(bot.status().error, /token/i);
  bot.forget();
  assert.equal(secrets.get('telegram-token'), null);
  assert.equal(bot.status().configured, false);
});
