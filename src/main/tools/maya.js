// Teaching Maya: skills it can learn, what it is doing (the work monitor), and changing how it looks and behaves.
import { saveSkill, seedSkills } from '../services/skills.js';
import { learnWord } from '../services/learning.js';
import { workToday } from '../services/worklog.js';
import { chromeProfiles } from '../services/pc.js';
import { looksLikePassword } from '../services/clipboard.js';

const str = (description) => ({ type: 'string', description });
const obj = (properties, required = []) => ({ type: 'object', properties, required });

// Pages that can be hidden from the sidebar (Home, Chat, Accessibility, My Maya and Settings always stay).
export const HIDEABLE = ['tasks', 'notes', 'habits', 'focus', 'study', 'workflows', 'activity', 'calendar', 'inbox', 'search', 'images', 'models', 'mcp', 'skills', 'monitor', 'connections', 'brain'];
const SIZES = { normal: 1, large: 1.15, larger: 1.3 };
const set = (ctx, key, value) => (ctx.services?.setSetting ? ctx.services.setSetting(key, value) : ctx.store.setSetting(key, value));

/** Safe, validated changes to how Maya looks (exported for tests). */
export function uiSet(ctx, { theme, text_size, accent, density, hide_page, show_page, large_mode }) {
  const ui = { ...ctx.store.getSetting('ui', {}) };
  const done = [];
  if (theme) { if (!['light', 'dark', 'system'].includes(theme)) throw new Error('theme is light, dark or system'); set(ctx, 'theme', theme); done.push(`theme ${theme}`); }
  if (text_size) { if (!SIZES[text_size]) throw new Error('text_size is normal, large or larger'); ui.fontScale = SIZES[text_size]; done.push(`text ${text_size}`); }
  if (accent) { if (!/^#[0-9a-f]{6}$/i.test(accent)) throw new Error('accent is a colour like #12b886'); ui.accent = accent; done.push(`colour ${accent}`); }
  if (density) { if (!['comfortable', 'compact'].includes(density)) throw new Error('density is comfortable or compact'); ui.density = density; done.push(density); }
  const page = (p) => { const k = String(p).toLowerCase().replace(/^the\s+|\s+page$/g, '').replace('smart search', 'search').replace('image tools', 'images').replace('work monitor', 'monitor'); if (!HIDEABLE.includes(k)) throw new Error(`${p} cannot be hidden. Pages: ${HIDEABLE.join(', ')}`); return k; };
  if (hide_page) { ui.hidePages = [...new Set([...(ui.hidePages || []), page(hide_page)])]; done.push(`hid ${hide_page}`); }
  if (show_page) { ui.hidePages = (ui.hidePages || []).filter((p) => p !== page(show_page)); done.push(`showing ${show_page}`); }
  if (large_mode !== undefined) { set(ctx, 'a11yLarge', !!large_mode); done.push(`large mode ${large_mode ? 'on' : 'off'}`); }
  set(ctx, 'ui', ui);
  return { changed: done };
}

/** Safe, validated changes to Maya itself (exported for tests). */
export function personaSet(ctx, { name, call_me, add_rule, goals, speed, slower, faster, voice_engine, chrome_profile }, profiles = chromeProfiles()) {
  const a = { ...ctx.store.getSetting('agent', {}) };
  const done = [];
  if (name) { const n = name.trim(); if (!/^[\p{L} '-]{2,20}$/u.test(n)) throw new Error('A name is 2 to 20 letters.'); a.name = n; done.push(`name ${n}; say "Hey ${n}" to wake me`); }
  if (call_me) { set(ctx, 'userTitle', call_me.trim().slice(0, 30)); done.push(`calling you ${call_me}`); }
  if (add_rule) { a.rules = [a.rules, `- ${add_rule.trim().slice(0, 200)}`].filter(Boolean).join('\n').slice(-1000); done.push(`rule: ${add_rule}`); }
  if (goals) { a.goals = goals.trim().slice(0, 600); done.push('goals saved'); }
  let s = Number(speed) || a.speed || 1;
  if (slower) s -= 0.1;
  if (faster) s += 0.1;
  if (speed || slower || faster) { a.speed = Math.round(Math.min(1.3, Math.max(0.7, s)) * 10) / 10; done.push(`speaking speed ${a.speed}`); }
  if (voice_engine) { if (!['local', 'openai'].includes(voice_engine)) throw new Error('voice_engine is local or openai'); set(ctx, 'voiceEngine', voice_engine); done.push(`voice: ${voice_engine}`); }
  if (chrome_profile) {
    const want = chrome_profile.toLowerCase().replace(/\b(my|the|chrome|profile)\b/g, '').trim();
    const p = profiles.find((x) => [x.name, x.account, x.dir].some((n) => n && n.toLowerCase().includes(want)));
    if (!p) throw new Error(`No Chrome profile called ${chrome_profile}. Profiles: ${profiles.map((x) => x.name).join(', ')}`);
    set(ctx, 'chromeProfile', p.dir);
    done.push(`Chrome profile ${p.name}`);
  }
  set(ctx, 'agent', a);
  return { changed: done };
}

export const mayaTools = [
  {
    name: 'snippets_save',
    description: 'Save a piece of text the user often types, under a short name: "save my address as 12 Gandhi Street, Chennai". Later "type my address" types it anywhere. Never passwords or card numbers.',
    parameters: obj({ name: str('Short name, e.g. "address", "email", "bank IFSC"'), text: str('The exact text to type') }, ['name', 'text']),
    run: ({ name, text }, ctx) => {
      const n = String(name).toLowerCase().replace(/^my\s+/, '').trim();
      if (!n || !text?.trim()) return { error: 'A snippet needs a name and its text.' };
      if (/\b(password|passcode|pin|otp|cvv|card number)\b/i.test(`${n} ${text}`) || String(text).split(/\s+/).some(looksLikePassword)) return { error: 'Maya does not keep passwords, PINs or card numbers.' };
      set(ctx, 'snippets', { ...ctx.store.getSetting('snippets', {}), [n]: String(text).trim().slice(0, 1000) });
      return { saved: n, say_to_use: `type my ${n}` };
    },
  },
  {
    name: 'ui_set',
    description: 'Change how Maya\'s screens look: theme (light/dark/system), text_size (normal/large/larger), accent colour (#hex), density (comfortable/compact), hide_page / show_page (e.g. "study"), large_mode (big buttons, high contrast). E.g. "make the text bigger", "use dark theme", "hide the Study page".',
    parameters: obj({ theme: { type: 'string', enum: ['light', 'dark', 'system'] }, text_size: { type: 'string', enum: ['normal', 'large', 'larger'] }, accent: str('Colour like #12b886'),
      density: { type: 'string', enum: ['comfortable', 'compact'] }, hide_page: str('Page to hide'), show_page: str('Page to show again'), large_mode: { type: 'boolean' } }),
    run: (args, ctx) => uiSet(ctx, args),
  },
  {
    name: 'persona_set',
    description: 'You CAN change yourself with this, so never say you cannot. Change Maya itself: its name (the wake word follows), what to call the user, a rule to always follow ("always answer in Tamil"), the user\'s goals, speaking speed (speed 0.7-1.3, or slower/faster), voice_engine (local = free voices on this PC, openai = ChatGPT\'s voices with the user\'s key).',
    parameters: obj({ name: str('New name'), call_me: str('What to call the user'), add_rule: str('A rule'), goals: str('The user\'s goals'), speed: { type: 'number' },
      slower: { type: 'boolean' }, faster: { type: 'boolean' }, voice_engine: { type: 'string', enum: ['local', 'openai'] }, chrome_profile: str('Which Chrome profile to open websites in, e.g. "Work"') }),
    run: (args, ctx) => personaSet(ctx, args),
  },
  {
    name: 'monitor_status',
    description: 'What Maya is doing right now and what it did today (every action, failures, time spent). Use for "what are you doing?", "what did you do today?", "did that work?". Answer in a few spoken sentences.',
    parameters: obj({}),
    run: (_, { store }) => { const w = workToday(store, 15); return { ...w, items: w.items.map((i) => `${i.at.slice(11, 16)} ${i.detail}${i.status === 'done' ? '' : ` (${i.status})`}`) }; },
  },
  {
    name: 'learn_word',
    description: 'Learn a word Maya keeps mishearing, e.g. "you hear my when I say Maya" or "it is spelled Gowtham, not Gautam". From now on that word is fixed in everything the user says.',
    parameters: obj({ heard: str('What Maya wrongly heard or wrote'), meant: str('What the user really says / the right spelling') }, ['heard', 'meant']),
    run: ({ heard, meant }, { store }) => learnWord(store, heard, meant),
  },
  {
    name: 'skills_list',
    description: 'List the skills Maya knows (built-in and taught by the user).',
    parameters: obj({}),
    run: (_, { store }) => { seedSkills(store); return store.all('SELECT name, "when", enabled, builtin, uses FROM skills ORDER BY builtin, name'); },
  },
  {
    name: 'skills_save',
    description: 'Learn a new skill the user teaches, e.g. "teach yourself: when I say goodnight, turn on dark mode and tell me tomorrow\'s tasks". name = the short trigger ("Goodnight"), when = when to use it, steps = exactly what to do, in order.',
    parameters: obj({ name: str('Short name, also the words that start it'), when: str('When to use it'), steps: str('What to do, step by step, naming tools where you know them') }, ['name', 'when', 'steps']),
    run: (args, { store }) => saveSkill(store, args),
  },
  {
    name: 'skills_switch',
    description: 'Turn a skill on or off.',
    parameters: obj({ name: str('Skill name'), on: { type: 'boolean' } }, ['name', 'on']),
    run: ({ name, on }, { store }) => {
      const s = store.get('SELECT id, name FROM skills WHERE lower(name) = lower(?)', name);
      if (!s) return { error: `No skill called ${name}.` };
      store.run('UPDATE skills SET enabled = ? WHERE id = ?', on ? 1 : 0, s.id);
      return { skill: s.name, on };
    },
  },
  {
    name: 'skills_forget',
    description: 'Stop using a skill: the user\'s own skills are deleted, built-in ones are switched off.',
    parameters: obj({ name: str('Skill name') }, ['name']),
    run: ({ name }, { store }) => {
      const s = store.get('SELECT * FROM skills WHERE lower(name) = lower(?)', name);
      if (!s) return { error: `No skill called ${name}.` };
      if (s.builtin) store.run('UPDATE skills SET enabled = 0 WHERE id = ?', s.id);
      else store.run('DELETE FROM skills WHERE id = ?', s.id);
      return { forgot: s.name };
    },
  },
];
