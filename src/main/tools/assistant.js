import { now } from '../store.js';

const str = (description) => ({ type: 'string', description });

// Passwords, PINs, OTPs, API keys/tokens and card numbers must never be stored.
export const SECRET = /\b(password|passwd|pwd|passcode|pin|otp|cvv|api[ -]?key|secret|token)\b.{0,12}(is|:|=)|\b(sk-|ghp_|gho_|github_pat_|xox[bp]-|AKIA)[A-Za-z0-9_-]{8,}|\b(?:\d[ -]?){13,19}\b/i;
const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
/** Share of the shorter fact's words that also appear in the other (0..1). */
const overlap = (a, b) => {
  const wa = new Set(a.split(' ').filter((w) => w.length > 2)), wb = new Set(b.split(' ').filter((w) => w.length > 2));
  const small = wa.size < wb.size ? wa : wb, big = small === wa ? wb : wa;
  return small.size ? [...small].filter((w) => big.has(w)).length / small.size : 0;
};
const obj = (properties, required = []) => ({ type: 'object', properties, required });

// Memory, screen and study tools. ctx.services supplies screen and study.
export const assistantTools = [
  {
    name: 'memory_save',
    description: 'Remember a lasting fact for future chats: a user preference ("likes short answers"), a project detail ("Maya uses Electron"), or a fact ("exam on 14 Dec"). One short fact per call. Never passwords, keys or codes. Not for changing Maya itself (its name, voice, speaking speed, rules) or the screens: use persona_set / ui_set, which really change them.',
    parameters: obj({ fact: str('The fact in third person, e.g. "Studies CSE at VIT, 3rd year"'), category: { type: 'string', enum: ['preference', 'project', 'fact'] } }, ['fact']),
    run: ({ fact, category = 'fact' }, { store }) => {
      if (SECRET.test(fact)) return { refused: 'That looks like a password, key or code. Maya never stores secrets.' };
      const norm = normalize(fact);
      const existing = store.all('SELECT id, fact FROM memories WHERE deleted = 0');
      const same = existing.find((m) => normalize(m.fact) === norm || normalize(m.fact).includes(norm));
      if (same) return { already_known: same.fact };
      // A newer version of an old fact ("exam on 14 Dec" → "exam on 16 Dec") updates it instead of piling up.
      const older = existing.find((m) => overlap(normalize(m.fact), norm) >= 0.6);
      if (older) return store.update('memories', older.id, { fact, category, updated_at: now() }, `Updated memory "${fact}"`);
      return store.insert('memories', { fact, category, created_at: now(), updated_at: now() }, `Remembered "${fact}"`);
    },
  },
  {
    name: 'memory_list',
    description: 'List what Maya remembers about the user, by category.',
    parameters: obj({}),
    run: (_, { store }) => store.all('SELECT id, fact, category, updated_at FROM memories WHERE deleted = 0 ORDER BY category, id'),
  },
  {
    name: 'memory_update',
    description: 'Correct a remembered fact (find its id with memory_list).',
    parameters: obj({ id: { type: 'integer' }, fact: str('Corrected fact'), category: { type: 'string', enum: ['preference', 'project', 'fact'] } }, ['id', 'fact']),
    run: ({ id, fact, category }, { store }) => {
      if (SECRET.test(fact)) return { refused: 'Maya never stores secrets.' };
      return store.update('memories', id, { fact, category, updated_at: now() }, `Updated memory ${id}`);
    },
  },
  {
    name: 'memory_forget',
    description: 'Forget a remembered fact (find its id with memory_list).',
    parameters: obj({ id: { type: 'integer' } }, ['id']),
    run: ({ id }, { store }) => store.update('memories', id, { deleted: 1 }, `Forgot memory ${id}`),
  },
  {
    name: 'screen_look',
    description: 'Take a screenshot of the user\'s screen and look at it. Use for "what\'s on my screen", "explain this error on my screen", "help me with what I\'m looking at".',
    parameters: obj({}),
    run: async (_, { services }) => ({ captured: true, attachImage: await services.screen.capture() }),
  },
  {
    name: 'study_create',
    description: 'Make a study set: a multiple-choice quiz, flashcards or a summary, from a topic or from one of the user\'s notes. It appears in the Study section.',
    parameters: obj({ kind: { type: 'string', enum: ['quiz', 'flashcards', 'summary'] }, topic: str('Topic, e.g. "DBMS normalization"'),
      note_id: { type: 'integer', description: 'Use this note as the material (find it with notes_query)' }, count: { type: 'integer', description: 'Number of questions or cards, default 8' } }, ['kind']),
    run: async (args, { services }) => {
      const set = await services.study.create(args);
      return { id: set.id, title: set.title, kind: set.kind, items: JSON.parse(set.items).length ?? 1 };
    },
  },
  {
    name: 'study_list',
    description: 'List the user\'s study sets (quizzes, flashcards, summaries) with best quiz scores.',
    parameters: obj({}),
    run: (_, { services }) => services.study.list(),
  },
];
