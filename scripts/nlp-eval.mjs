// Conversation-quality check: runs scripted chats through Maya and has the 9B model grade each answer.
// Usage: node scripts/nlp-eval.mjs [label]   → prints a table and writes docs/nlp-eval-<label>.md
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.ATHER_DATA = mkdtempSync(join(tmpdir(), 'ather-eval-'));
process.env.ATHER_MODELS = join(process.env.APPDATA, 'Ather', 'models');
const { openStore } = await import('../src/main/store.js');
const { allTools } = await import('../src/main/tools/index.js');
const { ask, complete } = await import('../src/main/brain.js');
const { webSearch, readPage } = await import('../src/main/services/web.js');

// Each case: turns sent in order; "good" tells the judge what a great answer to the LAST turn looks like.
const CASES = [
  { name: 'Greeting', turns: ['hey! how are you doing today?'], good: 'Warm, natural, short; asks back or offers help. No robotic disclaimers.' },
  { name: 'Explain simply', turns: ['explain recursion like I am 10 years old'], good: 'Simple analogy, short, friendly, maybe a tiny example.' },
  { name: 'Follow-up reference', turns: ['what are the ACID properties in DBMS?', 'explain the second one with an example'], good: 'Explains Consistency (the 2nd) with a concrete example; understands "the second one".' },
  { name: 'Follow-up pronoun', turns: ['who created Python?', 'when did he start working on it?'], good: 'Guido van Rossum; late 1989 (Christmas holidays); resolves "he".' },
  { name: 'Hinglish', turns: ['bhai mujhe kal ka exam ka bahut tension ho raha hai, kya karu?'], good: 'Replies in Hinglish, empathetic, gives practical tips. Not in pure formal English.' },
  { name: 'Tamil-English', turns: ['enaku DBMS normalization puriyala, simple ah sollu'], good: 'Replies in the same Tanglish style, explains normalization simply.' },
  { name: 'Emotional support', turns: ['I failed my exam and I feel like giving up'], good: 'Empathetic, validating, encouraging, practical next steps; not preachy, not a list dump.' },
  { name: 'Comparison table', turns: ['compare python and java for a beginner'], good: 'Clear structure, maybe a table, honest recommendation at the end.' },
  { name: 'Code help', turns: ['write a python function to check if a number is prime'], good: 'Correct efficient code in a code block, short explanation.' },
  { name: 'Debug', turns: ['my python code says IndexError: list index out of range, why?'], good: 'Explains cause, common fixes, asks for code or shows example.' },
  { name: 'Vague ask', turns: ['help me with my project'], good: 'Asks what the project is about in a friendly way, maybe offers options. Does not invent details.' },
  { name: 'Unknown fact', turns: ['what was the exact attendance at my college fest last year?'], good: 'Says it cannot know that; suggests where to find it. No made-up numbers.' },
  { name: 'Opinion', turns: ['which is better for a CSE student: web dev or AI/ML?'], good: 'Balanced, personal-feeling advice, asks about interests or gives criteria.' },
  { name: 'Maths', turns: ['solve 2x + 7 = 19 and show steps'], good: 'x = 6 with clear steps.' },
  { name: 'Writing', turns: ['write a short leave letter to my HOD for 2 days because of fever'], good: 'Proper polite letter format, concise.' },
  { name: 'Change of mind', turns: ['give me 3 tips for time management', 'make them shorter, one line each'], good: 'Same 3 tips rewritten in one line each.' },
  { name: 'Correction', turns: ['what is the capital of Australia?', 'are you sure? I thought it was Sydney'], good: 'Politely holds firm: Canberra, explains Sydney is the largest city.' },
  { name: 'Planning', turns: ['make me a study plan for the next 3 days, I have DBMS and OS exams'], good: 'Concrete day-by-day plan, balanced, includes breaks/revision.' },
  { name: 'Small talk memory', turns: ['my favourite subject is computer networks', 'suggest a mini project for me'], good: 'Suggests a networks-related project, remembers the subject.' },
  { name: 'Action vs talk', turns: ['remind me to call mom at 8pm today'], good: 'Actually sets the reminder (tool) and confirms briefly with the time.' },
  { name: 'Joke', turns: ['tell me a programming joke'], good: 'A genuinely funny short joke, natural tone.' },
  { name: 'Definition depth', turns: ['what is an API?'], good: 'Clear definition, everyday analogy, example; not too long.' },
  { name: 'Ambiguous word', turns: ['what is a python?'], good: 'Covers both the language and the snake briefly, or asks which one.' },
  { name: 'Gratitude', turns: ['thanks, that really helped!'], good: 'Short, warm reply; offers further help. No long text.' },
  { name: 'Many at once', turns: ['add a task to finish my DBMS assignment, remind me at 6pm to submit it, and make a note that chapter 4 is important'],
    good: 'Performs all three actions (task, reminder at 18:00 today, note) and confirms each briefly.' },
  { name: 'Exam countdown', turns: [`my OS exam is on ${new Date(Date.now() + 23 * 864e5).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}, how many days do I have?`],
    good: 'Saves the exam (exams_add) and says 23 days are left, with an encouraging tip.' },
  { name: 'Make a workflow', turns: ['make a workflow called morning that adds a task "review notes" and starts a 25 minute focus session'],
    good: 'Saves a routine/workflow named morning with those two steps (routines_save) and says how to start it.' },
];

const store = openStore(':memory:');
const services = { web: { search: webSearch, read: readPage } };
const SCHEMA = { type: 'object', required: ['natural', 'helpful', 'accurate', 'context', 'comment'],
  properties: { natural: { type: 'integer' }, helpful: { type: 'integer' }, accurate: { type: 'integer' }, context: { type: 'integer' }, comment: { type: 'string' } } };

const rows = [];
for (const c of CASES) {
  const cid = Number(store.run("INSERT INTO conversations (title) VALUES ('eval')").lastInsertRowid);
  let answer = '';
  const actions = [];
  const started = Date.now();
  for (const turn of c.turns) {
    answer = await ask({ text: turn, store, tools: allTools, services, conversationId: cid, style: 'chat', mode: 'auto',
      onEvent: (e) => e.type === 'tool' && actions.push(`${e.name}(${JSON.stringify(e.args)})`) });
  }
  const seconds = Math.round((Date.now() - started) / 1000);
  const transcript = c.turns.map((t, i) => `User: ${t}${i < c.turns.length - 1 ? '\n(Assistant answered.)' : ''}`).join('\n');
  const grade = JSON.parse(await complete(
    `You are a strict judge of AI assistant quality, comparing against the best assistants (Gemini, ChatGPT).\nToday is ${new Date().toDateString()}. The assistant runs on the user's computer and can really perform actions through tools.\n${transcript}\n\nActions the assistant actually performed: ${actions.join('; ') || 'none'}\n\nAssistant's final answer:\n"""${answer}"""\n\nWhat a great answer looks like: ${c.good}\nScore 1-5 each: natural (human, warm, right tone and language), helpful, accurate, context (understood the conversation and request). Add a one-sentence comment. Reply as JSON.`,
    { model: 'ather-smart', format: SCHEMA }));
  const avg = (grade.natural + grade.helpful + grade.accurate + grade.context) / 4;
  rows.push({ name: c.name, ...grade, avg, seconds, answer });
  console.log(`${avg.toFixed(2)}  ${c.name.padEnd(20)} ${seconds}s  ${grade.comment}`);
}

const mean = (k) => (rows.reduce((s, r) => s + r[k], 0) / rows.length).toFixed(2);
const label = process.argv[2] || 'latest';
const md = [`# NLP evaluation (${label})`, '', `Run: ${new Date().toLocaleString()} · ${rows.length} conversations · judge: Qwen 3.5 9B`, '',
  `**Average: ${mean('avg')} / 5** — natural ${mean('natural')}, helpful ${mean('helpful')}, accurate ${mean('accurate')}, context ${mean('context')}`, '',
  '| Case | Natural | Helpful | Accurate | Context | Avg | Time | Judge comment |', '|---|---|---|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.name} | ${r.natural} | ${r.helpful} | ${r.accurate} | ${r.context} | ${r.avg.toFixed(2)} | ${r.seconds}s | ${r.comment.replace(/\|/g, '/')} |`),
  '', '## Answers', ...rows.map((r) => `### ${r.name}\n${r.answer}\n`)].join('\n');
mkdirSync('docs', { recursive: true });
writeFileSync(join('docs', `nlp-eval-${label}.md`), md);
console.log(`\nAVERAGE ${mean('avg')} → docs/nlp-eval-${label}.md`);
process.exit(0);
