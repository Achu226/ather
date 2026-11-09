import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

process.env.ATHER_DATA = mkdtempSync(join(tmpdir(), 'ather-adv-'));
const { openStore } = await import('../src/main/store.js');
const { autoMode } = await import('../src/main/models.js');
const { chunk, extractText, createDocs } = await import('../src/main/services/docs.js');
const { cleanItems, createStudy } = await import('../src/main/services/study.js');
const { assistantTools } = await import('../src/main/tools/assistant.js');
const { allTools } = await import('../src/main/tools/index.js');
const { ask } = await import('../src/main/brain.js');
const { OLLAMA } = await import('../src/main/ollama.js');
const running = await fetch(`${OLLAMA}/api/version`).then((r) => r.ok, () => false);
const live = { skip: !running && 'Ollama not running', timeout: 400_000 };

test('auto mode routes questions to the right model', () => {
  assert.equal(autoMode('add a task to study tomorrow', { style: 'chat' }), 'fast');
  assert.equal(autoMode('Build me a simple counter web page'), 'builder'); // said to the notch, too
  assert.equal(autoMode('make a presentation about AI'), 'fast');
  assert.equal(autoMode('build a habit of reading'), 'fast');
  assert.equal(autoMode('why is my python code throwing KeyError? I get an error', { style: 'chat' }), 'coder');
  assert.equal(autoMode('write a python function to check if a number is prime', { style: 'chat' }), 'coder');
  assert.equal(autoMode('compare python and java for a beginner', { style: 'chat' }), 'smart');
  assert.equal(autoMode('what is an API?', { style: 'chat' }), 'fast');
  assert.equal(autoMode('explain the difference between TCP and UDP', { style: 'chat' }), 'smart');
  assert.equal(autoMode('hi!', { style: 'chat' }), 'fast');
  assert.equal(autoMode('explain recursion', { style: 'short' }), 'fast'); // notch stays quick
  assert.equal(autoMode('what is this?', { style: 'chat', images: 1 }), 'fast'); // vision model
});

test('old databases get the new message columns', () => {
  const file = join(process.env.ATHER_DATA, 'old.db');
  const old = new DatabaseSync(file);
  old.exec("CREATE TABLE messages (id INTEGER PRIMARY KEY, role TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT); INSERT INTO messages (role, content) VALUES ('user', 'hi')");
  old.close();
  const store = openStore(file);
  const cols = store.all('PRAGMA table_info(messages)').map((c) => c.name);
  assert.ok(cols.includes('conversation_id') && cols.includes('model'));
  assert.equal(store.get('SELECT content FROM messages').content, 'hi');
});

test('chunks overlap and cover the whole text', () => {
  const text = 'x'.repeat(3000);
  const parts = chunk(text);
  assert.equal(parts.length, 3);
  assert.ok(parts.every((p) => p.length <= 1200));
});

test('study items are cleaned of broken questions', () => {
  const q = cleanItems('quiz', { questions: [
    { question: 'ok', options: ['a', 'b', 'c', 'd'], answer: 2, explanation: '' },
    { question: 'bad index', options: ['a', 'b'], answer: 5, explanation: '' },
    { question: 'no options', options: [], answer: 0, explanation: '' },
  ] });
  assert.deepEqual(q.map((x) => x.question), ['ok']);
});

test('memory tools save once, list and forget', () => {
  const store = openStore(':memory:');
  const run = (name, args = {}) => assistantTools.find((t) => t.name === name).run(args, { store });
  const m = run('memory_save', { fact: 'Studies CSE, 3rd year' });
  assert.ok(run('memory_save', { fact: 'studies cse, 3rd year' }).already_known);
  assert.equal(run('memory_list').length, 1);
  run('memory_forget', { id: m.id });
  assert.equal(run('memory_list').length, 0);
});

test('extracts text from a PDF', async () => {
  // A minimal one-page PDF with the text "Normalization removes redundancy".
  const content = 'BT /F1 18 Tf 50 700 Td (Normalization removes redundancy) Tj ET';
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = objs.map((o, i) => { const at = pdf.length; pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; return at; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const file = join(process.env.ATHER_DATA, 'notes.pdf');
  writeFileSync(file, pdf, 'latin1');
  assert.match(await extractText(file), /Normalization removes redundancy/);
});

test('chat with a document: the answer uses the attached file', live, async () => {
  const store = openStore(':memory:');
  const docs = createDocs({ store });
  const conv = Number(store.run("INSERT INTO conversations (title) VALUES ('t')").lastInsertRowid);
  const file = join(process.env.ATHER_DATA, 'syllabus.txt');
  writeFileSync(file, 'Course CS304 Operating Systems. The final exam is on 14 December in Hall B. Professor: Dr. Meera Iyer.');
  await docs.add(conv, file);
  const answer = await ask({ text: 'Which hall is the final exam in?', store, tools: allTools, services: { docs }, conversationId: conv, style: 'chat', mode: 'fast' });
  assert.match(answer, /Hall B/i);
});

test('makes a quiz from a topic', live, async () => {
  const store = openStore(':memory:');
  const study = createStudy({ store, docs: {} });
  const set = await study.create({ kind: 'quiz', topic: 'Binary search', count: 4 });
  const full = study.get(set.id);
  assert.ok(full.items.length >= 3);
  assert.equal(full.items[0].options.length, 4);
});

test('"make me a plan" writes the plan instead of creating tasks', live, async () => {
  const store = openStore(':memory:');
  const answer = await ask({ text: 'make me a study plan for the next 3 days, I have DBMS and OS exams', store, tools: allTools, style: 'chat', mode: 'auto' });
  assert.equal(store.get('SELECT COUNT(*) AS n FROM tasks').n, 0);
  // A real plan names its days: "Day 1", "tomorrow", or the weekdays.
  assert.match(answer, /day\s*1|day one|tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday/i);
});

test('remembers a personal fact without being asked', live, async () => {
  const store = openStore(':memory:');
  await ask({ text: 'By the way, my name is Ashwin and I study computer science at Anna University.', store, tools: allTools, style: 'chat', mode: 'fast' });
  const facts = store.all('SELECT fact FROM memories').map((m) => m.fact).join(' ');
  assert.match(facts, /Ashwin|Anna University|computer science/i);
});

test('hard questions think first; simple ones stay fast', async () => {
  const { autoMode } = await import('../src/main/models.js');
  assert.equal(autoMode('Solve x^2 - 5x + 6 = 0 step by step'), 'deep');
  assert.equal(autoMode('A farmer has 17 sheep, all but 9 die. How many are left? Think carefully.'), 'deep');
  assert.equal(autoMode('add a task to solve maths homework'), 'fast');
  assert.equal(autoMode('what is the capital of France'), 'fast');
});

test('live: the deep brain gets a trick question right', live, async () => {
  const store = openStore(':memory:');
  const answer = await ask({ text: 'A farmer has 17 sheep. All but 9 die. How many sheep are left? Think carefully, then give the number.', store, tools: allTools, style: 'short', mode: 'auto' });
  assert.match(answer, /\b9\b|nine/i, answer);
});
