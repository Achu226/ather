// Lecture recorder: live transcript in 30-second pieces, then study notes written by the smart model.
import { complete } from '../brain.js';
import { MODES } from '../models.js';
import { hasModel } from '../ollama.js';
import { now } from '../store.js';

const PART = 18000; // characters per notes pass; long lectures are summarised part by part first

const NOTES_PROMPT = `Turn this lecture transcript into clear study notes in Markdown:
## Summary (3-5 sentences)
## Key points (bullets)
## Important terms (term: short definition)
## Questions to revise (3-5)
Only use what the lecture says. The transcript comes from speech recognition, so fix obvious mis-heard words.`;

export function createLectures({ store }) {
  const model = async () => ((await hasModel(MODES.smart.model).catch(() => false)) ? MODES.smart.model : MODES.fast.model);

  const start = (title, source) => Number(store.run('INSERT INTO lectures (title, source, started_at) VALUES (?,?,?)',
    title || `Lecture ${new Date().toLocaleString()}`, source, now()).lastInsertRowid);

  function append(id, text) {
    if (!text?.trim()) return;
    store.run("UPDATE lectures SET transcript = trim(transcript || ' ' || ?) WHERE id = ?", text.trim(), id);
  }

  /** Write notes (part by part for long lectures), save them on the lecture and as a note. */
  async function finish(id, minutes) {
    const lecture = store.get('SELECT * FROM lectures WHERE id = ?', id);
    if (!lecture) throw new Error('Lecture not found');
    store.run('UPDATE lectures SET minutes = ? WHERE id = ?', minutes, id);
    if (lecture.transcript.split(/\s+/).length < 20) {
      store.run('UPDATE lectures SET notes = ? WHERE id = ?', '_Too little speech was recorded to write notes._', id);
      return store.get('SELECT * FROM lectures WHERE id = ?', id);
    }
    const m = await model();
    let text = lecture.transcript;
    if (text.length > PART) {
      const parts = [];
      for (let i = 0; i < text.length; i += PART) parts.push(await complete(`Summarise this part of a lecture in detailed bullet points, keeping every fact, term and example:\n\n${text.slice(i, i + PART)}`, { model: m }));
      text = parts.join('\n\n');
    }
    const notes = (await complete(`${NOTES_PROMPT}\n\nLecture: ${lecture.title}\n\n${text}`, { model: m })).trim();
    store.run('UPDATE lectures SET notes = ? WHERE id = ?', notes, id);
    store.run('INSERT INTO notes (title, body, created_at, updated_at) VALUES (?,?,?,?)', `Lecture notes: ${lecture.title}`, notes, now(), now());
    return store.get('SELECT * FROM lectures WHERE id = ?', id);
  }

  return {
    start, append, finish,
    list: () => store.all('SELECT id, title, source, started_at, minutes, length(transcript) AS chars, notes IS NOT NULL AS has_notes FROM lectures WHERE deleted = 0 ORDER BY id DESC'),
    get: (id) => store.get('SELECT * FROM lectures WHERE id = ?', id),
    remove: (id) => store.run('UPDATE lectures SET deleted = 1 WHERE id = ?', id),
  };
}
