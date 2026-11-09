import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.ATHER_DATA = mkdtempSync(join(tmpdir(), 'maya-monitor-'));
const { openStore } = await import('../src/main/store.js');
const { describe, logWork, workToday } = await import('../src/main/services/worklog.js');
const { workMood } = await import('../src/renderer/shared/work.js');
const { allTools } = await import('../src/main/tools/index.js');
const { selectTools } = await import('../src/main/tools/select.js');

test('actions read as plain words, failures say so', () => {
  assert.equal(describe('fs_write', { path: 'C:/p/app.js' }, { ok: true }), 'Wrote app.js');
  assert.equal(describe('mail_send', { to: 'rahul@example.com' }, {}), 'Sent an email to rahul@example.com');
  assert.match(describe('run_command', { command: 'npm test' }, { exit_code: 1, error: 'tests failed' }), /^Ran “npm test” \(exit 1\) — failed: tests failed/);
  assert.equal(describe('pc_power', { action: 'shutdown' }, { denied: true }), 'Asked to shutdown the PC — you said no');
  assert.equal(describe('some_new_tool', { topic: 'x' }), 'some new tool: x');
});

test('today\'s work: newest first, totals, what is happening now', () => {
  const store = openStore(':memory:');
  logWork(store, { name: 'web_search', args: { query: 'solar' }, result: {}, ms: 1200 });
  logWork(store, { source: 'builder', name: 'run_command', args: { command: 'npm run build' }, result: { error: 'boom' }, ms: 60_000 });
  const w = workToday(store);
  assert.equal(w.actions, 2);
  assert.equal(w.failed, 1);
  assert.equal(w.minutes, 1);
  assert.match(w.items[0].detail, /npm run build/);
  assert.match(w.now, /npm run build/);
});

test('the face matches the work', () => {
  assert.equal(workMood('fs_write'), 'typing');
  assert.equal(workMood('run_command'), 'building');
  assert.equal(workMood('web_search'), 'searching');
  assert.equal(workMood('qa_check_site'), 'checking');
  assert.equal(workMood('tasks_create'), 'working');
});

test('"what are you doing?" reaches the monitor', () => {
  assert.ok(selectTools(allTools, 'What are you doing?').some((t) => t.name === 'monitor_status'));
  assert.ok(selectTools(allTools, 'what did you do today').some((t) => t.name === 'monitor_status'));
});

test('the Ollama address works however OLLAMA_HOST is written', async () => {
  const { ollamaUrl } = await import('../src/main/ollama.js');
  assert.equal(ollamaUrl(''), 'http://127.0.0.1:11434');
  assert.equal(ollamaUrl('0.0.0.0:11434'), 'http://127.0.0.1:11434');
  assert.equal(ollamaUrl('0.0.0.0'), 'http://127.0.0.1');
  assert.equal(ollamaUrl('http://192.168.1.5:11434/'), 'http://192.168.1.5:11434');
  assert.equal(ollamaUrl('[::]:11434'), 'http://127.0.0.1:11434');
});

test('a tool call written as text is still done; ordinary JSON is not a call', async () => {
  const { toolCallsInText } = await import('../src/main/brain.js');
  const tools = [{ name: 'fs_write' }, { name: 'run_command' }];
  const text = 'Step 1:\n```json\n{"name": "fs_write", "arguments": {"path": "C:\\p\\index.html", "content": "<p>{hi}</p>"}}\n```\nthen {"name":"run_command","arguments":{"command":"npm test"}}';
  const calls = toolCallsInText(text, tools);
  assert.deepEqual(calls.map((c) => c.function.name), ['fs_write', 'run_command']);
  assert.equal(JSON.parse(calls[0].function.arguments).content, '<p>{hi}</p>');
  assert.equal(JSON.parse(calls[0].function.arguments).path, 'C:\\p\\index.html'); // lone backslashes repaired
  assert.deepEqual(toolCallsInText('Use {"name": "rm_rf", "arguments": {}} or {"a": 1}', tools), []);
});

test('fs_edit replaces one exact piece of a file, with Windows line endings too', async () => {
  const { writeFileSync, readFileSync, mkdtempSync } = await import('node:fs');
  const dir = mkdtempSync(join(tmpdir(), 'maya-edit-'));
  const store = openStore(':memory:');
  store.setSetting('approvedFolders', [dir]);
  const edit = allTools.find((t) => t.name === 'fs_edit');
  assert.equal(edit.confirm, true);
  const f = join(dir, 'calc.js');
  writeFileSync(f, 'export function add(a, b) {\r\n  return a - b;\r\n}\r\n');
  assert.ok((await edit.run({ path: f, find: 'return a - b;', replace: 'return a + b;' }, { store })).edited);
  assert.match(readFileSync(f, 'utf8'), /return a \+ b;\r\n/);
  assert.ok((await edit.run({ path: f, find: '{\n  return a + b;', replace: '{\n  return b + a;' }, { store })).edited); // \n written, \r\n in the file
  assert.match(readFileSync(f, 'utf8'), /\{\r\n  return b \+ a;/);
  assert.match((await edit.run({ path: f, find: 'nothing like this', replace: 'x' }, { store })).error, /not in the file/);
  writeFileSync(f, 'x = 1\nx = 1\n');
  assert.match((await edit.run({ path: f, find: 'x = 1', replace: 'y' }, { store })).error, /appears 2 times/);
  await assert.rejects(async () => edit.run({ path: join(tmpdir(), 'outside.js'), find: 'a', replace: 'b' }, { store }));
});

test('fs_edit: a whole corrected file in "replace" becomes the file, not a duplicate', async () => {
  const { writeFileSync, readFileSync, mkdtempSync } = await import('node:fs');
  const dir = mkdtempSync(join(tmpdir(), 'maya-edit2-'));
  const store = openStore(':memory:');
  store.setSetting('approvedFolders', [dir]);
  const edit = allTools.find((t) => t.name === 'fs_edit');
  const f = join(dir, 'calc.js');
  const orig = 'export function add(a, b) {\n  return a - b;\n}\n\nexport function multiply(a, b) {\n  return a * b;\n}\n';
  writeFileSync(f, orig);
  await edit.run({ path: f, find: 'export function add(a, b) {', replace: orig.replace('a - b', 'a + b') }, { store });
  assert.equal(readFileSync(f, 'utf8'), orig.replace('a - b', 'a + b'));
  await edit.run({ path: f, find: '  return a * b;\n}', replace: '  return a * b;\n}\n\nexport function sub(a, b) {\n  return a - b;\n}' }, { store }); // a real insertion stays one
  assert.match(readFileSync(f, 'utf8'), /multiply[\s\S]*export function sub/);
  assert.equal(readFileSync(f, 'utf8').split('export function add').length, 2);
});

test('WhatsApp video to Desktop: newest download found (waits for one in progress), moved into the folder', async () => {
  const { writeFileSync, mkdtempSync, mkdirSync, renameSync, utimesSync, existsSync } = await import('node:fs');
  const { latestDownload } = await import('../src/main/tools/dev.js');
  const { userFolder } = await import('../src/main/services/mcp-presets.js');
  const home = mkdtempSync(join(tmpdir(), 'maya-home-'));
  mkdirSync(join(home, 'OneDrive', 'Desktop'), { recursive: true });
  assert.equal(userFolder('Desktop', home), join(home, 'OneDrive', 'Desktop')); // OneDrive PCs
  mkdirSync(join(home, 'Downloads'));
  assert.equal(userFolder('Downloads', home), join(home, 'Downloads'));
  const dl = join(home, 'Downloads');
  writeFileSync(join(dl, 'old.mp4'), 'x');
  utimesSync(join(dl, 'old.mp4'), new Date(Date.now() - 3600e3), new Date(Date.now() - 3600e3));
  writeFileSync(join(dl, 'notes.pdf'), 'x');
  const since = Date.now() - 1000;
  writeFileSync(join(dl, 'WhatsApp Video.mp4.crdownload'), 'x');
  setTimeout(() => renameSync(join(dl, 'WhatsApp Video.mp4.crdownload'), join(dl, 'WhatsApp Video.mp4')), 1500);
  const got = await latestDownload({ kind: 'video', since, wait: 10, dir: dl });
  assert.equal(got.name, 'WhatsApp Video.mp4');
  assert.match((await latestDownload({ kind: 'image', since, dir: dl })).error, /No image/);
  const store = openStore(':memory:');
  store.setSetting('approvedFolders', [home]);
  const move = allTools.find((t) => t.name === 'fs_move');
  const r = await move.run({ from: got.path, to: join(home, 'OneDrive', 'Desktop') }, { store });
  assert.equal(r.to, join(home, 'OneDrive', 'Desktop', 'WhatsApp Video.mp4'));
  assert.ok(existsSync(r.to));
});

test('"open my WhatsApp chat and download the video to desktop" picks the skill and the tools', async () => {
  const { matchSkill } = await import('../src/main/services/skills.js');
  const store = openStore(':memory:');
  assert.equal(matchSkill(store, 'Open my WhatsApp chat 8940186660 and download the video to the desktop')?.name, 'Download from a chat');
  const wa = allTools.find((t) => t.name === 'whatsapp_open_chat');
  const opened = [];
  const r = await wa.run({ who: '89401 86660' }, { store, services: { pc: { openUrl: async (u) => opened.push(u) } } });
  assert.deepEqual(opened, ['https://web.whatsapp.com/send?phone=918940186660']);
  assert.equal(r.phone, '+918940186660');
  assert.match((await wa.run({ who: '894018360' }, { store, services: { pc: { openUrl: async () => {} } } })).error, /too short/);
  assert.match((await wa.run({ who: 'me' }, { store, services: {} })).error, /your own number/);
});
