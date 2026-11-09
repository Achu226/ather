import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import nodemailer from 'nodemailer';

process.env.ATHER_DATA = mkdtempSync(join(tmpdir(), 'ather-session-'));
const { openStore } = await import('../src/main/store.js');
const { createSession, daySummary } = await import('../src/main/services/session.js');
const { createSos, phoneCall, validPhone } = await import('../src/main/services/sos.js');
const { careTick, careDone, tick } = await import('../src/main/services/scheduler.js');
const { createVoiceControl, pages } = await import('../src/main/services/voicecontrol.js');
const { parseCommand } = await import('../src/renderer/shared/voicecommands.js');
const { createBlink } = await import('../src/renderer/shared/headpose.js');
const { answerIn } = await import('../src/main/services/chatbots.js');
const { allTools } = await import('../src/main/tools/index.js');
const { selectTools } = await import('../src/main/tools/select.js');

function timer() {
  const store = openStore(':memory:');
  let t = Date.parse('2026-10-30T16:00:00');
  const states = [], powered = [];
  const session = createSession({ store, power: async (a) => powered.push(a), onState: (s) => states.push(s.state), clock: () => t, countdownMs: 60_000 });
  return { store, session, states, powered, at: (min) => { t += min * 60_000; } };
}

test('work timer: goodbye with the day summary, then shutdown after the minute', async () => {
  const { store, session, states, powered, at } = timer();
  store.insert('tasks', { title: 'Report', done: 1, completed_at: new Date().toISOString(), created_at: 'x' }, 't');
  session.start(120, 'project');
  assert.equal(session.status().minutes_left, 120);
  at(119); assert.equal(await session.tick(), null);
  at(1); assert.equal(await session.tick(), 'goodbye');
  assert.ok(session.status().saying_goodbye);
  at(0.5); assert.equal(await session.tick(), null);
  at(0.5); assert.equal(await session.tick(), 'shutdown');
  assert.deepEqual(powered, ['shutdown']);
  assert.deepEqual(states, ['running', 'goodbye', 'off']);
  assert.match(daySummary(store), /You finished 1 task/);
});

test('work timer: "wait" gives 15 minutes, "cancel" means no shutdown at all', async () => {
  const { session, powered, at } = timer();
  session.start(60);
  at(60); await session.tick();
  session.extend(15);
  at(1); assert.equal(await session.tick(), null); // the goodbye minute is over, but 15 more minutes were given
  at(14); assert.equal(await session.tick(), 'goodbye');
  session.cancel();
  at(5); assert.equal(await session.tick(), null);
  assert.deepEqual(powered, []);
});

test('work timer: a PC switched on long after the timer ended is not shut down', async () => {
  const { session, powered, at } = timer();
  session.start(30);
  at(12 * 60); // overnight
  assert.equal(await session.tick(), 'expired');
  assert.deepEqual(powered, []);
  assert.throws(() => session.start(0));
});

test('voice: wait / cancel during the goodbye, magnifier, reading pages', async () => {
  assert.deepEqual(parseCommand('Wait'), { cmd: 'later' });
  assert.deepEqual(parseCommand("I'm still working"), { cmd: 'later' });
  assert.deepEqual(parseCommand('magnify'), { cmd: 'magnify', action: 'in' });
  assert.deepEqual(parseCommand('stop magnifier'), { cmd: 'magnify', action: 'off' });
  assert.deepEqual(parseCommand('zoom in'), { cmd: 'keys', keys: 'ctrl+=' }); // browser zoom is unchanged
  assert.deepEqual(parseCommand('read my document DBMS notes'), { cmd: 'readdoc', name: 'dbms notes' });
  assert.deepEqual(parseCommand('next page'), { cmd: 'page', go: 'next' });
  assert.deepEqual(parseCommand('அடுத்த பக்கம்'), { cmd: 'page', go: 'next' });
  assert.deepEqual(parseCommand('page five'), { cmd: 'page', go: 5 });
  assert.deepEqual(parseCommand('மீண்டும்'), { cmd: 'page', go: 'repeat' });

  const { session, at } = timer();
  const keys = [], activated = [];
  // After the Windows key the taskbar has the focus, like on a real PC.
  const pc = { chord: async (...k) => keys.push(k), foreground: async () => (keys.length && !activated.length ? { hwnd: 9, process: 'explorer' } : { hwnd: 5, process: 'chrome' }), activate: async (h) => activated.push(h) };
  const vc = createVoiceControl({ pc, overlay() {}, computer: { lastExternal: () => null }, bounds: () => ({}), session,
    findDoc: async () => ({ name: 'Notes', text: `${'First part. '.repeat(150)}\n\n${'Second part. '.repeat(150)}` }) });
  assert.deepEqual(await vc.run({ cmd: 'later' }), { pass: true }); // no goodbye: a normal sentence
  session.start(10); at(10); await session.tick();
  assert.match((await vc.run({ cmd: 'later' })).said, /15 more/);
  await vc.run({ cmd: 'magnify', action: 'in' });
  assert.deepEqual(keys, [[0x5b, 0xbb]]);
  assert.deepEqual(activated, [5]); // focus handed back to the user's app
  assert.match((await vc.run({ cmd: 'readdoc', name: 'notes' })).read, /^Notes\. First part[\s\S]*Page 1 of \d/);
  assert.match((await vc.run({ cmd: 'page', go: 'next' })).read, /Page 2 of/);
  assert.match((await vc.run({ cmd: 'page', go: 99 })).error, /There are \d+ pages/);
});

test('pages are cut at sentences and lose nothing', () => {
  const text = Array.from({ length: 200 }, (_, i) => `Sentence ${i}.`).join(' ');
  const p = pages(text, 300);
  assert.ok(p.length > 5 && p.every((x) => x.length <= 300));
  assert.ok(p.slice(0, -1).every((x) => x.endsWith('.')));
  assert.equal(p.join(' ').replace(/\s+/g, ' '), text);
});

test('blink to click: natural blinks ignored, half a second = click, long = right click', () => {
  const blink = createBlink();
  const run = (ms) => { blink({ eyeBlinkLeft: 0.9, eyeBlinkRight: 0.9 }, 1000); blink({ eyeBlinkLeft: 0.9, eyeBlinkRight: 0.9 }, 1000 + ms); return blink({}, 1000 + ms).click; };
  assert.equal(run(150), null);
  assert.equal(run(600), 'left');
  assert.equal(run(1800), 'right');
  assert.equal(blink({ eyeBlinkLeft: 0.9, eyeBlinkRight: 0.1 }, 0).click, null); // one eye = a wink, not a click
});

test('care reminder: spoken done is saved; no answer emails the caregiver once', async () => {
  const store = openStore(':memory:');
  store.setSetting('sos', { contacts: ['amma@example.com'], name: 'Ronald' });
  const sent = [];
  const transport = nodemailer.createTransport({ jsonTransport: true });
  const sos = createSos({ store, secrets: { get: () => null }, transport });
  const told = [];
  const past = new Date(Date.now() - 60_000);
  const at = `${past.toLocaleDateString('en-CA')}T${past.toTimeString().slice(0, 5)}`;
  const a = store.insert('reminders', { text: 'Take BP tablet', at, care: 1, created_at: 'x' }, 'r');
  const b = store.insert('reminders', { text: 'Insulin', at, care: 1, created_at: 'x' }, 'r');
  tick(store, (title, body, kind, id) => told.push([kind, id]));
  assert.deepEqual(told.map((x) => x[0]), ['care', 'care']);
  careDone(store, told[0][1]);
  const alert = async (reason) => { sent.push(reason); return sos.notify(reason); };
  assert.equal(await careTick(store, alert, 15 * 60_000, Date.now() + 16 * 60_000), 1);
  assert.match(sent[0], /Insulin/);
  assert.equal(await careTick(store, alert, 15 * 60_000, Date.now() + 30 * 60_000), 0); // only once
  assert.equal(store.getSetting('sosLog')[0].event, 'notice');
  assert.ok(a && b);
});

test('emergency call: Phone Link opens with tel: and its Call button is pressed', async () => {
  assert.ok(validPhone('+91 98765 43210') && !validPhone('javascript:alert(1)') && !validPhone('12'));
  const opened = [], pressed = [];
  const pc = { foreground: async () => ({ process: 'PhoneExperienceHost', title: 'Phone Link' }), elements: async () => [{ i: 4, name: 'Mute' }, { i: 7, name: 'Call' }], invoke: async (i) => pressed.push(i) };
  assert.deepEqual(await phoneCall({ pc, open: async (u) => opened.push(u), number: '+91 98765-43210' }), { calling: '+919876543210' });
  assert.deepEqual(opened, ['tel:+919876543210']);
  assert.deepEqual(pressed, [7]);
  assert.match((await phoneCall({ pc, open: async () => {}, number: 'x' })).error, /not a phone number/);
  const none = { ...pc, foreground: async () => ({ process: 'chrome', title: 'x' }) };
  assert.match((await phoneCall({ pc: none, open: async () => {}, number: '108', tries: 2 })).error, /Phone Link/);
});

test('SOS alarm calls and emails together', async () => {
  const store = openStore(':memory:');
  store.setSetting('sos', { contacts: ['amma@example.com'], phones: ['+91 98765 43210'] });
  const states = [];
  const sos = createSos({ store, secrets: { get: () => null }, transport: nodemailer.createTransport({ jsonTransport: true }),
    call: async (n) => ({ calling: n }), onState: (s) => states.push(s), countdownMs: 10 });
  sos.trigger('test');
  await new Promise((r) => setTimeout(r, 100));
  const last = states.at(-1);
  assert.equal(last.calling, '+91 98765 43210');
  assert.equal(last.sent, 1);
});

test('ChatGPT / Claude: the answer is what follows the prompt, without the footer', () => {
  const page = 'New chat\nWhat is DBMS?\nChatGPT said:\nA DBMS is software that stores and manages data.\nChatGPT can make mistakes. Check important info.';
  assert.equal(answerIn(page, 'What is DBMS?', 'chatgpt'), 'A DBMS is software that stores and manages data.');
  assert.equal(answerIn('Log in', 'What is DBMS?', 'chatgpt'), '');
  // Real page text (Oct 2026): the prompt is also still in the text box below the footer.
  const real = '￼\nLog in\nYou said:\nWhat is DBMS?\nCopy\n￼\nChatGPT said:\nDatabase management system.\nChatGPT is AI and can make mistakes.\n￼\nNew chat\nWhat is DBMS?\nAdd files and more\nSend message';
  assert.equal(answerIn(real, 'What is DBMS?', 'chatgpt'), 'Database management system.');
  assert.equal(answerIn(real.replace('Database management system.\n', ''), 'What is DBMS?', 'chatgpt'), ''); // not answered yet
});

test('requests reach the new tools', () => {
  const names = (text) => selectTools(allTools, text).map((t) => t.name);
  assert.ok(names('I will work for 2 hours, then shut down the PC').includes('work_timer_start'));
  assert.ok(names('set a timer for 2 hours and shutdown after').includes('work_timer_start'));
  assert.ok(names('ask ChatGPT to write a poem about rain').includes('ai_ask'));
  assert.ok(!names('ask ChatGPT to write a poem about rain').includes('computer_start'));
  assert.ok(names('remind me to take my tablets at 9 pm every day').includes('reminders_create'));
  assert.equal(allTools.find((t) => t.name === 'work_timer_start').confirm, true);
});

// Live: the real model picks the right tool from plain words. Nothing runs: approvals are refused, services are fakes.
const { ask } = await import('../src/main/brain.js');
const { OLLAMA } = await import('../src/main/ollama.js');
const running = await fetch(`${OLLAMA}/api/version`).then((r) => r.ok, () => false);
const live = { skip: !running && 'Ollama not running', timeout: 600_000 };
const used = async (text, services = {}) => {
  const store = openStore(':memory:');
  const calls = [];
  await ask({ text, store, tools: allTools, services: { confirm: async (r) => { calls.push(r); return false; }, ...services }, style: 'chat', mode: 'fast',
    onEvent: (e) => e.type === 'tool' && calls.push({ name: e.name, args: e.args }) });
  return { calls, store };
};

test('live: "work 2 hours then shut down" asks to start the work timer', live, async () => {
  const { calls } = await used('I will work on my project for 2 hours, after that shut down the PC.');
  const c = calls.find((x) => x.name === 'work_timer_start');
  assert.ok(c, `tools: ${calls.map((x) => x.name)}`);
  assert.equal(c.args.minutes, 120);
});

test('live: a medicine reminder is a care reminder', live, async () => {
  const { store } = await used('Remind me to take my BP tablet at 9 pm every day.');
  const r = store.all('SELECT * FROM reminders');
  assert.equal(r.length, 1);
  assert.equal(r[0].care, 1);
  assert.equal(r[0].repeat, 'daily');
});

test('live: "ask ChatGPT" uses ai_ask with the question', live, async () => {
  const asked = [];
  const { calls } = await used('Ask ChatGPT what the capital of Tamil Nadu is.', { pc: {}, openExternal: async (u) => asked.push(u) });
  const c = calls.find((x) => x.name === 'ai_ask');
  assert.ok(c, `tools: ${calls.map((x) => x.name)}`);
  assert.equal(c.args.site, 'chatgpt');
  assert.match(c.args.prompt, /capital of Tamil Nadu/i);
});

test('"work … for 2 hours, after that shut down" offers the work timer, not a bare shutdown', () => {
  const names = selectTools(allTools, 'I will work on my project for 2 hours, after that shut down the PC.').map((t) => t.name);
  assert.ok(names.includes('work_timer_start'));
});

test('"I can\'t control your PC" is caught; normal answers are not', async () => {
  const { wrongRefusal } = await import('../src/main/brain.js');
  assert.ok(wrongRefusal("I can't turn off your computer directly. I don't have access to control your hardware or operating system."));
  assert.ok(wrongRefusal('I am unable to send emails for you.'));
  assert.ok(!wrongRefusal('Chennai is the capital of Tamil Nadu.'));
  assert.ok(!wrongRefusal("I can't find any tasks due today."));
  assert.ok(selectTools(allTools, 'Turn off the PC now.').some((t) => t.name === 'pc_power'));
});

test('live: "Turn off the PC now" asks to shut down (refused here)', live, async () => {
  const { calls } = await used('Turn off the PC now.');
  assert.ok(calls.some((c) => c.name === 'pc_power' && c.args.action === 'shutdown'), `tools: ${calls.map((x) => x.name)}`);
});

test('live: an email is sent with the user\'s own words, after approval (refused here)', live, async () => {
  const { calls } = await used('Send an email to gowtham@example.com saying I will submit the project report on Monday, subject Project report.', { mail: {} });
  const c = calls.find((x) => x.name === 'mail_send');
  assert.ok(c, `tools: ${calls.map((x) => x.name)}`);
  assert.equal(c.args.to, 'gowtham@example.com');
  assert.match(c.args.text, /submit the project report on Monday/i);
});

test('live: no keyword matched, the refusal is caught and the tools are used', live, async () => {
  const { calls } = await used('Write to rahul@example.com that I will be 10 minutes late for the meeting.', { mail: {} });
  assert.ok(calls.some((c) => c.name === 'mail_send'), `tools: ${calls.map((x) => x.name)}`);
});

test('voice: drag between numbers or cells, and "again" repeats the last action', async () => {
  assert.deepEqual(parseCommand('Drag 3 to 7'), { cmd: 'drag', from: 3, to: 7 });
  assert.deepEqual(parseCommand('drag three onto seven'), { cmd: 'drag', from: 3, to: 7 });
  assert.deepEqual(parseCommand('drag D4 to F6'), { cmd: 'drag', fromCell: 'D4', toCell: 'F6' });
  assert.deepEqual(parseCommand('Again'), { cmd: 'again' });
  assert.equal(parseCommand('move my notes to the trash'), null);
  const drags = [], scrolls = [];
  const pc = { drag: async (...p) => drags.push(p), scroll: async (n) => scrolls.push(n), foreground: async () => ({ process: 'chrome' }), elements: async () => [] };
  const vc = createVoiceControl({ pc, overlay() {}, computer: { lastExternal: () => null }, bounds: () => ({ x: 0, y: 0, width: 1600, height: 1000 }) });
  assert.match((await vc.run({ cmd: 'again' })).error, /nothing to repeat/);
  await vc.run({ cmd: 'drag', fromCell: 'A1', toCell: 'B2' });
  assert.deepEqual(drags, [[50, 50, 150, 150]]);
  await vc.run({ cmd: 'scroll', direction: 'down', amount: 5 });
  await vc.run({ cmd: 'again' });
  assert.deepEqual(scrolls, [-600, -600]);
});

test('live: after "open WhatsApp", a RAM question never closes apps', live, async () => {
  const store = openStore(':memory:');
  const { id } = store.get("INSERT INTO conversations (title, created_at) VALUES ('t', 'x') RETURNING id");
  store.run("INSERT INTO messages (conversation_id, role, content, created_at) VALUES (?, 'user', 'Open WhatsApp', 'x'), (?, 'assistant', 'I opened WhatsApp.', 'x')", id, id);
  const asked = [];
  await ask({ text: 'How much battery and RAM is my laptop using?', store, conversationId: id, tools: allTools, style: 'short', mode: 'auto',
    services: { confirm: async (r) => { asked.push(r.name); return false; } } });
  assert.deepEqual(asked.filter((n) => /close|power/.test(n)), []);
});

test('voice: "what is this?" says what is under the pointer', async () => {
  assert.deepEqual(parseCommand('What is this?'), { cmd: 'whatis' });
  assert.deepEqual(parseCommand('இது என்ன'), { cmd: 'whatis' });
  const at = { kind: 'Button', name: 'Send', value: '', hint: 'Sends your message' };
  const vc = createVoiceControl({ pc: { atPointer: async () => at }, overlay() {}, computer: {}, bounds: () => ({}) });
  assert.equal((await vc.run({ cmd: 'whatis' })).read, 'Button: Send. Sends your message');
  Object.assign(at, { kind: 'Edit', name: 'Search', value: 'weather in Chennai', hint: '' });
  assert.equal((await vc.run({ cmd: 'whatis' })).read, 'Text box: Search. It contains: weather in Chennai');
  Object.assign(at, { kind: 'Pane', name: '', value: '' });
  assert.match((await vc.run({ cmd: 'whatis' })).read, /empty part of the screen/);
});

test('SOS: location only when allowed; the daily "I\'m okay" email once a day after its time', async () => {
  const { sosEmail, dailyEmail } = await import('../src/main/services/sos.js');
  assert.match(sosEmail({ name: 'Ronald', reason: 'help', at: new Date(), location: 'Chennai — map: https://maps.google.com/?q=13,80' }).text, /Approximate location .*Chennai/);
  const store = openStore(':memory:');
  store.setSetting('sos', { contacts: ['amma@example.com'], name: 'Ronald', shareLocation: true });
  const sent = [];
  const transport = { sendMail: async (m) => { sent.push(m); return {}; } };
  let located = 0;
  const sos = createSos({ store, secrets: { get: () => null }, transport, locate: async () => { located++; return 'Chennai'; }, countdownMs: 5 });
  sos.trigger('test');
  await new Promise((r) => setTimeout(r, 80));
  assert.match(sent[0].text, /Chennai/);
  await sos.test();
  assert.equal(located, 1); // a test email never looks up the location
  const tick = (at) => sos.dailyTick({ summary: () => 'You finished 2 tasks.', care: () => [{ text: 'BP tablet', confirmed_at: 'x' }, { text: 'Insulin', fired_at: 'x' }], at });
  assert.equal(await tick(new Date('2026-11-04T21:00')), null); // switched off
  store.setSetting('sos', { ...store.getSetting('sos'), daily: { on: true, time: '20:00' } });
  assert.equal(await tick(new Date('2026-11-04T19:00')), null); // too early
  assert.equal((await tick(new Date('2026-11-04T20:05'))).sent, 1);
  assert.equal(await tick(new Date('2026-11-04T22:00')), null); // once a day
  const mail = sent.at(-1);
  assert.match(mail.subject, /^Daily update: Ronald/);
  assert.match(mail.text, /BP tablet: taken ✓/);
  assert.match(mail.text, /Insulin: NOT confirmed/);
  assert.match(dailyEmail({ name: '', at: new Date(), summary: '', care: [] }).text, /No medicine reminders/);
});

test('nod = yes, shake = no; steering the pointer is neither', async () => {
  const { createHeadGesture } = await import('../src/renderer/shared/headpose.js');
  const run = (pts) => { const g = createHeadGesture(); let out = null; pts.forEach((p, i) => { out = g(p, i * 80) || out; }); return out; };
  const wave = (k, n) => Array.from({ length: n }, (_, i) => ({ x: 0, y: 0, [k]: [0, 0.09, 0, -0.09][i % 4] }));
  assert.equal(run(wave('y', 14)), 'yes');
  assert.equal(run(wave('x', 14)), 'no');
  assert.equal(run(Array.from({ length: 20 }, (_, i) => ({ x: i * 0.01, y: 0 }))), null); // a slow turn to move the pointer
  assert.equal(run(Array.from({ length: 20 }, () => ({ x: 0.001, y: -0.001 }))), null); // holding still
});
