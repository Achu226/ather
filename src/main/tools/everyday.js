// Everyday voice actions (as on heynixi.app): point at things on screen, write at the cursor, teleprompter,
// timers, named lists, Windows dark mode and playing music. ctx.services provides the PC, windows and AI.
import { now } from '../store.js';
import { matchApp } from '../services/pc.js';
import { INTERPRETER_LANGUAGES } from '../services/interpreter.js';
import { KINDS, findAccessible } from '../services/places.js';

const str = (description) => ({ type: 'string', description });
const obj = (properties, required = []) => ({ type: 'object', properties, required });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SELF = /^(Ather|Maya|electron)$/i;

/** Brings back the app the user was working in (asking Maya can put Maya in front). */
async function userApp(services) {
  const fg = await services.pc.foreground();
  const last = services.computer?.lastExternal?.();
  if (SELF.test(fg.process) && last) { await services.pc.activate(last.hwnd); await sleep(350); return last; }
  return fg;
}

/** "top left", "bottom right", "middle"… for a point on the screen. Exported for tests. */
export function whereOnScreen({ x, y }, b) {
  const col = ['left', 'middle', 'right'][Math.min(2, Math.floor(((x - b.x) / b.width) * 3))];
  const row = ['top', 'middle', 'bottom'][Math.min(2, Math.floor(((y - b.y) / b.height) * 3))];
  return row === 'middle' && col === 'middle' ? 'in the middle' : row === 'middle' ? `on the ${col}` : col === 'middle' ? `at the ${row}` : `at the ${row} ${col}`;
}

/** First YouTube video id in a search results page. Exported for tests. */
export const firstVideoId = (html) => /"videoId":"([\w-]{11})"/.exec(html)?.[1] ?? null;

export const everydayTools = [
  {
    name: 'watch_add',
    description: 'Watch a web page and tell the user (desktop notification and Telegram) when it changes: exam results, a notice, a price. '
      + 'Needs the full address. The first check only remembers the page. Pages with clocks or ads may change every time; say so if it alerts too often.',
    parameters: obj({ url: str('Full address, starting with https://'), what: str('Short name, e.g. "Exam results"'),
      every_hours: { type: 'integer', description: 'How often to check, in hours (default 6)' } }, ['url', 'what']),
    run: ({ url, what, every_hours }, { services }) => ({ watching: services.watch.add({ url, what, every_hours }), note: 'First check within 10 minutes.' }),
  },
  {
    name: 'watch_list',
    description: 'The web pages Maya is watching for changes, with when each was last checked.',
    parameters: obj({}),
    run: (_, { services }) => services.watch.list(),
  },
  {
    name: 'watch_remove',
    description: 'Stop watching a web page. which: its id, address or name.',
    parameters: obj({ which: str('Id, address or name of the watch') }, ['which']),
    run: ({ which }, { services }) => {
      const q = String(which).toLowerCase();
      const w = services.watch.list().find((x) => x.id === String(which) || x.url.toLowerCase() === q || x.what.toLowerCase().includes(q) || q.includes(x.what.toLowerCase()));
      if (!w) return { error: `No watched page matches "${which}".`, watching: services.watch.list().map((x) => x.what) };
      services.watch.remove(w.id);
      return { stopped: w.what };
    },
  },
  {
    name: 'places_accessible',
    description: 'Find wheelchair-accessible places near a town or area (hospital, pharmacy, accessible toilets, restaurant…) from OpenStreetMap. '
      + 'Accessible ones come first. Read out the top 3 with distance and access; say "unknown" places should be called first.',
    parameters: obj({
      kind: { type: 'string', enum: Object.keys(KINDS), description: 'Kind of place' },
      near: str('Town, city or area. Leave empty for the user\'s saved city.'),
      radius_km: { type: 'number', description: 'Search radius in km (default 3, at most 10)' },
    }, ['kind']),
    run: async ({ kind, near, radius_km }, { store, services }) => {
      const where = String(near || '').trim() || store.getSetting('city', '');
      if (!where) return { ask_user: 'Ask the user which town or area to search near (they can also save their city in Settings).' };
      return findAccessible({ kind, near: where, radiusKm: radius_km }, { fetchFn: services?.fetch || fetch });
    },
  },
  {
    name: 'screen_point',
    description: 'Show the user where something is in the window they are using: "where is the Save button?", "where do I click to attach?". Draws an arrow at it on screen.',
    parameters: obj({ target: str('What to find, e.g. "Save", "attach", "search box"') }, ['target']),
    run: async ({ target }, { services }) => {
      const app = await userApp(services);
      const elements = await services.pc.elements();
      const name = matchApp(target, elements.map((e) => e.name).filter(Boolean));
      const hit = name && elements.find((e) => e.name === name);
      if (!hit) return { found: false, window: app.title, note: 'It is not a named control here. Use screen_look to see the screen and describe where it is.' };
      services.point({ x: hit.x, y: hit.y, w: hit.w, h: hit.h, label: hit.name });
      return { found: true, name: hit.name, kind: hit.type, where: whereOnScreen(hit, services.screen.bounds()), shown: 'An arrow points at it for 6 seconds.' };
    },
  },
  {
    name: 'write_here',
    description: 'Write something (a reply, email, note, post, message) and type it where the user\'s cursor is, in the app they are working in. Use for "write a reply saying…", "write a thank-you note to Sam". Not for sending, and not when an email address is given (that is mail_send).',
    parameters: obj({ instruction: str('What to write, with any details the user gave') }, ['instruction']),
    run: async ({ instruction }, { store, services }) => {
      // "In your own voice": the user's recent messages show how they write.
      const samples = store.all("SELECT content FROM messages WHERE role = 'user' AND length(content) BETWEEN 25 AND 400 ORDER BY id DESC LIMIT 8").map((m) => `- ${m.content}`).join('\n');
      const prefs = store.all("SELECT fact FROM memories WHERE deleted = 0 AND category = 'preference'").map((m) => m.fact).join('; ');
      const text = (await services.complete(`Write this for the user: ${instruction}\n\nWrite it as the user, in their own simple, natural style${samples ? `. How they write:\n${samples}` : ''}${prefs ? `\nTheir preferences: ${prefs}` : ''}\n\nReply with only the text to type: no title, no quotes, no notes.`)).trim();
      const app = await userApp(services);
      await services.pasteText(text);
      return { typed: true, into: app.title || app.app, text };
    },
  },
  {
    name: 'camera_look',
    description: 'Look through the webcam and describe what is in front of the user: "what\'s in front of me?", "what am I holding?", "what colour is this shirt?", "is the light on?". For people who cannot see well.',
    parameters: obj({ question: str('What the user wants to know, optional') }),
    run: async ({ question }, { services }) => ({
      photo: 'taken just now with the webcam (not saved)',
      how: `Describe it simply and briefly, most important thing first${question ? `, answering: ${question}` : ''}. Say if the picture is too dark or blurry.`,
      attachImage: await services.camera(),
    }),
  },
  {
    name: 'camera_read',
    description: 'Read printed text the user holds up to the webcam: a letter, notice, bill, book page, medicine label, card. Read the text to them.',
    parameters: obj({}),
    run: async (_, { services }) => {
      const photo = await services.camera();
      const text = (await services.ocr(photo)).replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
      // Too little text found: the AI looks at the photo instead (handwriting, curved labels).
      if (text.split(/\s+/).length < 4) return { text: '', note: 'Little printed text found; read what you can see in the photo, or ask the user to hold it closer and steady.', attachImage: photo };
      return { text: text.slice(0, 4000), how: 'Read this text to the user as it is (fix obvious OCR mistakes only). Medicine labels: read name, dose and warnings first.' };
    },
  },
  {
    name: 'interpreter',
    description: 'Start (or stop) interpreter mode: the user and another person talk, and Maya says each sentence aloud in the other language (English ↔ Tamil, Hindi…). "be my interpreter in Tamil", "translate my conversation with him".',
    parameters: obj({ on: { type: 'boolean' }, language: { type: 'string', enum: Object.keys(INTERPRETER_LANGUAGES), description: 'The other language (besides English)' } }, ['on']),
    run: ({ on, language = 'ta' }, { services }) => {
      services.interpreter(on ? language : null);
      return on ? { on: true, language: INTERPRETER_LANGUAGES[language], how: 'Started. Each person just talks; say "stop" to end.' } : { on: false };
    },
  },
  {
    name: 'teleprompter',
    description: 'Start (or stop) a teleprompter that scrolls with the user\'s voice while they read a script aloud. Uses the copied text unless a script is given.',
    parameters: obj({ on: { type: 'boolean', description: 'false to close it' }, script: str('Script text (optional; default: the clipboard)') }),
    run: async ({ on = true, script }, { services }) => services.prompter.set(on, script),
  },
  {
    name: 'timer_set',
    description: 'Start a countdown timer, e.g. "set a timer for 10 minutes", "timer 30 seconds for the pasta". It rings and speaks when done.',
    parameters: obj({ minutes: { type: 'number', description: 'Length in minutes (0.5 = 30 seconds)' }, label: str('What it is for, optional') }, ['minutes']),
    run: ({ minutes, label }, { services }) => services.timers.start(minutes, label),
  },
  {
    name: 'timer_status',
    description: 'Running timers and how much time is left. Also "cancel the timer" via timer_cancel.',
    parameters: obj({}),
    run: (_, { services }) => services.timers.list(),
  },
  {
    name: 'timer_cancel',
    description: 'Cancel a running timer (the newest one if no id is given).',
    parameters: obj({ id: { type: 'integer' } }),
    run: ({ id }, { services }) => services.timers.cancel(id),
  },
  {
    name: 'list_add',
    description: 'Add items to one of the user\'s lists, e.g. "add milk and eggs to my shopping list", "add mangoes to the list". Lists are made as needed.',
    parameters: obj({ list: str('List name, default "shopping"'), items: { type: 'array', items: { type: 'string' } } }, ['items']),
    run: ({ list = 'shopping', items }, { store }) => {
      const name = list.trim().toLowerCase().replace(/\s+list$/, '') || 'shopping';
      for (const item of items) store.insert('lists', { list: name, item: item.trim(), done: 0, created_at: now() }, `Added ${item} to ${name}`);
      return { list: name, added: items, total: store.get('SELECT COUNT(*) AS n FROM lists WHERE deleted = 0 AND done = 0 AND list = ?', name).n };
    },
  },
  {
    name: 'list_query',
    description: 'Read one of the user\'s lists ("what is on my shopping list?"), or all list names.',
    parameters: obj({ list: str('List name; empty = all lists') }),
    run: ({ list }, { store }) => (list
      ? store.all('SELECT id, item FROM lists WHERE deleted = 0 AND done = 0 AND list = ? ORDER BY id', list.trim().toLowerCase().replace(/\s+list$/, ''))
      : store.all('SELECT list, COUNT(*) AS items FROM lists WHERE deleted = 0 AND done = 0 GROUP BY list')),
  },
  {
    name: 'list_remove',
    description: 'Tick off / remove items from a list ("I bought the milk", "clear my shopping list").',
    parameters: obj({ list: str('List name'), items: { type: 'array', items: { type: 'string' }, description: 'Items to remove; empty = the whole list' } }, ['list']),
    run: ({ list, items = [] }, { store }) => {
      const name = list.trim().toLowerCase().replace(/\s+list$/, '');
      const rows = store.all('SELECT id, item FROM lists WHERE deleted = 0 AND done = 0 AND list = ?', name)
        .filter((r) => !items.length || items.some((i) => r.item.toLowerCase().includes(i.toLowerCase()) || i.toLowerCase().includes(r.item.toLowerCase())));
      for (const r of rows) store.update('lists', r.id, { done: 1 }, `Removed ${r.item} from ${name}`);
      return { list: name, removed: rows.map((r) => r.item) };
    },
  },
  {
    name: 'pc_dark_mode',
    description: 'Turn Windows dark mode on or off (apps and the taskbar).',
    parameters: obj({ on: { type: 'boolean' } }, ['on']),
    run: async ({ on }, { services }) => { await services.pc.darkMode(on); return { dark_mode: on }; },
  },
  {
    name: 'music_play',
    description: 'Play a song, artist or video: "play Billie Jean", "play lo-fi on YouTube", "play Arijit Singh on Spotify". YouTube starts playing by itself; Spotify opens the search for it.',
    parameters: obj({ query: str('What to play'), app: { type: 'string', enum: ['youtube', 'spotify'], description: 'Default youtube unless the user says Spotify' } }, ['query']),
    run: async ({ query, app = 'youtube' }, { services }) => {
      if (app === 'spotify') {
        await services.openExternal(`spotify:search:${encodeURIComponent(query)}`);
        return { opened: 'Spotify', searched: query, note: 'Spotify shows the results; the user (or computer_click) picks the song.' };
      }
      // Open the first result straight away, so it plays without another click.
      const html = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, { headers: { 'Accept-Language': 'en' } }).then((r) => r.text()).catch(() => '');
      const id = firstVideoId(html);
      const url = id ? `https://www.youtube.com/watch?v=${id}` : `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
      await services.openExternal(url);
      return { playing: !!id, url };
    },
  },
];
