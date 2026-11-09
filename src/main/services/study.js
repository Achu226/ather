// Study tools: quizzes, flashcards and summaries from a topic, a note or a file.
import { complete } from '../brain.js';
import { now } from '../store.js';

const str = { type: 'string' };
const SCHEMAS = {
  quiz: { type: 'object', required: ['title', 'questions'], properties: { title: str, questions: { type: 'array', items: {
    type: 'object', required: ['question', 'options', 'answer', 'explanation'],
    properties: { question: str, options: { type: 'array', items: str }, answer: { type: 'integer' }, explanation: str } } } } },
  flashcards: { type: 'object', required: ['title', 'cards'], properties: { title: str, cards: { type: 'array', items: {
    type: 'object', required: ['front', 'back'], properties: { front: str, back: str } } } } },
  summary: { type: 'object', required: ['title', 'summary', 'key_points'], properties: { title: str, summary: str, key_points: { type: 'array', items: str } } },
};

const ASK = {
  quiz: (n) => `Write a ${n}-question multiple-choice quiz for a college student. Each question has exactly 4 options; "answer" is the 0-based index of the correct option; "explanation" says briefly why it is right. Mix easy and hard questions.`,
  flashcards: (n) => `Write ${n} flashcards for a college student. "front" is a short question or term, "back" is a clear, short answer or definition.`,
  summary: () => 'Write a clear study summary in Markdown ("summary", with headings and bullet points) and 5 to 8 one-line "key_points" to memorise.',
};

/** Drop malformed items so the practice screen never breaks. */
export function cleanItems(kind, data) {
  if (kind === 'quiz') return (data.questions || []).filter((q) => q.question && q.options?.length >= 2 && Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length);
  if (kind === 'flashcards') return (data.cards || []).filter((c) => c.front && c.back);
  return { summary: data.summary || '', key_points: data.key_points || [] };
}

export function createStudy({ store, docs }) {
  async function create({ kind = 'quiz', topic, note_id, path, text, count = 8 }) {
    if (!SCHEMAS[kind]) throw new Error('kind must be quiz, flashcards or summary');
    let material = '';
    if (note_id) {
      const note = store.row('notes', note_id);
      if (!note) throw new Error(`No note with id ${note_id}`);
      material = `${note.title}\n${note.body}`;
      topic ||= note.title;
    }
    if (path) material = await docs.extractText(path);
    if (text) material = text;
    if (!material && !topic) throw new Error('Give a topic, a note or a file to study from.');

    const source = material ? `Use only this material:\n"""\n${material.slice(0, 12000)}\n"""` : `Topic: ${topic}`;
    const raw = await complete(`${ASK[kind](Math.min(Math.max(count, 3), 20))}\n${source}\nReply as JSON.`, { format: SCHEMAS[kind] });
    const data = JSON.parse(raw);
    const items = cleanItems(kind, data);
    if (Array.isArray(items) && !items.length) throw new Error('The AI could not make that study set. Try again or give more detail.');
    return store.insert('study_sets', { title: data.title || topic || 'Study set', kind, items: JSON.stringify(items), created_at: now() }, `Made ${kind} "${data.title}"`);
  }

  const list = () => store.all(`SELECT s.id, s.title, s.kind, s.created_at,
      (SELECT MAX(score * 100 / total) FROM study_attempts a WHERE a.set_id = s.id) AS best
    FROM study_sets s WHERE deleted = 0 ORDER BY id DESC`);
  const get = (id) => { const s = store.row('study_sets', id); return s && { ...s, items: JSON.parse(s.items) }; };
  const attempt = (setId, score, total) => store.run('INSERT INTO study_attempts (set_id, score, total, created_at) VALUES (?,?,?,?)', setId, score, total, now());

  return { create, list, get, attempt };
}
