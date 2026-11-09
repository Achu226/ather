import { personalities, allPersonalities } from '../personality.js';
import { now } from '../store.js';
import { addFollowUp, weeklyReport } from '../services/work.js';
import { askChatbot } from '../services/chatbots.js';

const str = (description) => ({ type: 'string', description });
const obj = (properties, required = []) => ({ type: 'object', properties, required });

// ctx.services supplies: web, search, imaging, mail, face, openExternal.
export const extraTools = [
  {
    name: 'web_search',
    description: 'Search the internet for current information, news, facts, how-tos. Needs internet.',
    parameters: obj({ query: str('Search words') }, ['query']),
    run: ({ query }, { services }) => services.web.search(query),
  },
  {
    name: 'web_read',
    description: 'Read the text of a web page (from a URL the user gave or from web_search results) to answer or summarise.',
    parameters: obj({ url: str('Full http(s) URL') }, ['url']),
    run: ({ url }, { services }) => services.web.read(url),
  },
  {
    name: 'open_website',
    description: 'Open a website or a web search in the user\'s browser, e.g. "open YouTube", "search Google for flights to Goa".',
    parameters: obj({ url: str('Full https URL to open') }, ['url']),
    run: async ({ url }, { services }) => {
      if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
      await (services.pc?.openUrl ? services.pc.openUrl(url) : services.openExternal(url)); // the user's Chrome, signed in
      return { opened: url };
    },
  },
  {
    name: 'files_search',
    description: 'Find the user\'s files, photos and notes by describing them, e.g. "my beach photo", "resume", "notes about DBMS".',
    parameters: obj({ query: str('What to look for') }, ['query']),
    run: ({ query }, { services }) => services.search.query(query),
  },
  {
    name: 'open_file',
    description: 'Open a file found with files_search in its normal app.',
    parameters: obj({ path: str('Full file path') }, ['path']),
    run: async ({ path }, { services }) => ({ opened: path, error: (await services.openPath(path)) || undefined }),
  },
  {
    name: 'images_generate',
    description: 'Draw / generate new pictures from a description, on this computer. Write a rich English prompt (subject, style, lighting, colours). Use count 2-4 when the user asks for several, many, options or variations.',
    parameters: obj({
      prompt: str('Detailed English description of the picture'),
      count: { type: 'integer', description: 'How many different pictures, 1 to 4 (default 1)' },
      shape: { type: 'string', enum: ['square', 'portrait', 'landscape'] },
    }, ['prompt']),
    run: ({ prompt, count, shape }, { services }) => services.imaging.generate(prompt, { count, shape }),
  },
  {
    name: 'images_blur',
    description: 'Hide private details in a picture/screenshot: blur faces, email addresses, phone numbers and people\'s names. Needs the image path.',
    parameters: obj({ path: str('Image file path'), faces: { type: 'boolean' }, emails: { type: 'boolean' }, names: { type: 'boolean' } }, ['path']),
    run: ({ path, faces = true, emails = true, names = true }, { services }) => services.imaging.blur(path, { faces, emails, names }),
  },
  {
    name: 'images_remove_background',
    description: 'Remove the background of a picture (keep the person/object, transparent PNG). Needs the image path.',
    parameters: obj({ path: str('Image file path') }, ['path']),
    run: ({ path }, { services }) => services.imaging.removeBackground(path),
  },
  {
    name: 'images_upscale',
    description: 'Make a small or blurry picture sharper at 2x the resolution. Needs the image path.',
    parameters: obj({ path: str('Image file path') }, ['path']),
    run: ({ path }, { services }) => services.imaging.upscale(path),
  },
  {
    name: 'mail_triage',
    description: 'Check the email inbox and say which emails need the user (bills, questions, deadlines).',
    parameters: obj({}),
    run: (_, { services }) => services.mail.triage(),
  },
  {
    name: 'mail_search',
    description: 'Find emails by sender, subject, words, date or unread. Returns ids for mail_read. Empty arguments = the latest emails.',
    parameters: obj({ from: str('Sender name or address, optional'), subject: str('Words in the subject, optional'), text: str('Words in the body, optional'),
      since: str('YYYY-MM-DD, optional'), unread: { type: 'boolean', description: 'Only unread' } }),
    run: (args, { services }) => services.mail.search(args),
  },
  {
    name: 'mail_read',
    description: 'Read one whole email by its id (from mail_search/mail_triage) to summarise it or answer about it. If it asks for something by a date, offer to add it with mail_add_tasks.',
    parameters: obj({ uid: { type: 'number', description: 'Email id' } }, ['uid']),
    run: ({ uid }, { services }) => services.mail.read(uid),
  },
  {
    name: 'mail_reply',
    description: 'Reply to an email (by id; find it with mail_search first). The content is what the user said, in their words: fix only spelling and grammar, add a greeting and sign-off, add nothing else. The user sees it and must allow it before it is sent.',
    parameters: obj({ uid: { type: 'number', description: 'Email id' }, text: str('The whole reply, signed with the user\'s name if known') }, ['uid', 'text']),
    confirm: true,
    run: ({ uid, text }, { services }) => services.mail.reply(uid, text),
  },
  {
    name: 'mail_send',
    description: 'Send a new email from the user\'s connected account. The content is what the user said, in their words: fix only spelling and grammar, add a greeting and sign-off, add nothing else. If the address is not given, ask for it. The user must allow it before it is sent.',
    parameters: obj({ to: str('Email address(es), comma separated'), subject: str('Subject'), text: str('The whole email') }, ['to', 'subject', 'text']),
    confirm: true,
    run: (args, { services }) => services.mail.send(args),
  },
  {
    name: 'mail_mark_read',
    description: 'Mark emails as read.',
    parameters: obj({ uids: { type: 'array', items: { type: 'number' } } }, ['uids']),
    run: ({ uids }, { services }) => services.mail.markRead(uids),
  },
  {
    name: 'mail_promotions',
    description: 'List newsletters and ads among the recent emails (for tidying the inbox). Then offer mail_archive with their ids.',
    parameters: obj({}),
    run: async (_, { services }) => (await services.mail.promotions()).map(({ uid, from, subject }) => ({ uid, from, subject })),
  },
  {
    name: 'mail_archive',
    description: 'Move emails out of the inbox into the archive (not deleted). The user must allow it.',
    parameters: obj({ uids: { type: 'array', items: { type: 'number' } } }, ['uids']),
    confirm: true,
    run: ({ uids }, { services }) => services.mail.archive(uids),
  },
  {
    name: 'mail_add_tasks',
    description: 'Add the to-dos, deadlines and meetings found in an email to tasks, reminders or the calendar. The user must allow it.',
    parameters: obj({ items: { type: 'array', items: obj({ kind: { type: 'string', enum: ['task', 'reminder', 'event'] }, title: str('What'), when: str('Local ISO date-time, optional for tasks') }, ['kind', 'title']) } }, ['items']),
    confirm: true,
    run: ({ items }, { store }) => items.map(({ kind, title, when }) => {
      if (kind === 'event' && when) return store.insert('events', { title, start: when, created_at: now() }, `Added event "${title}"`);
      if (kind === 'reminder' && when) return store.insert('reminders', { text: title, at: when, created_at: now() }, `Set reminder "${title}"`);
      return store.insert('tasks', { title, due: when, priority: 'normal', created_at: now() }, `Added task "${title}"`);
    }),
  },
  {
    name: 'mail_follow_up',
    description: 'Use for "remind me if X doesn\'t reply (by a date)" / "follow up if no answer". Watches the inbox: tells the user when X replies, or on that date (if no reply) reminds them and adds a task. No need to read emails first.',
    parameters: obj({ from: str('Their name or email address'), subject: str('What it is about, optional'), by: str('Local ISO date-time to wait until') }, ['from', 'by']),
    run: (args, { store }) => addFollowUp(store, args),
  },
  {
    name: 'ai_ask',
    description: 'Ask ChatGPT or Claude (in the user\'s browser, their own account) and get its answer, e.g. "ask ChatGPT to write a poem", "ask Claude about my essay". site both = ask both and compare. Read the answer to the user, saying which one answered.',
    parameters: obj({ site: { type: 'string', enum: ['chatgpt', 'claude', 'both'] }, prompt: str('Exactly what to ask, in the user\'s words') }, ['site', 'prompt']),
    run: async ({ site, prompt }, { services }) => {
      const ask = (s) => askChatbot({ pc: services.pc, open: (u) => (services.pc?.openUrl ? services.pc.openUrl(u) : services.openExternal(u)), site: s, prompt });
      if (site !== 'both') return ask(site);
      return { chatgpt: await ask('chatgpt'), claude: await ask('claude'), note: 'Compare the two answers briefly for the user.' };
    },
  },
  {
    name: 'report_weekly',
    description: 'Make the weekly work report now (Word document): tasks done and open, next week\'s events, follow-ups, emails waiting, focus time. Maya also makes it every Friday evening.',
    parameters: obj({}),
    run: (_, { store, services }) => weeklyReport({ store, files: services.files }),
  },
  {
    name: 'personality_set',
    description: `Change how Maya talks. Built-in: ${Object.entries(personalities).map(([id, p]) => `${id} (${p.label})`).join(', ')}; the user may also have custom ones (pass their name).`,
    parameters: obj({ id: str('Personality id or name') }, ['id']),
    run: ({ id }, { store }) => {
      const all = allPersonalities(store.getSetting('customPersonalities', []));
      const key = all[id] ? id : Object.keys(all).find((k) => all[k].label.toLowerCase() === String(id).toLowerCase());
      if (!key) return { error: `No personality called ${id}. Options: ${Object.values(all).map((p) => p.label).join(', ')}` };
      store.setSetting('personality', key);
      return { personality: all[key].label };
    },
  },
  {
    name: 'animations_play',
    description: 'Play a face animation on Maya: happy, wave, love, think, surprised, sleepy, celebrate. Useful for agents to signal "done".',
    parameters: obj({ name: { type: 'string', enum: ['happy', 'wave', 'love', 'think', 'surprised', 'sleepy', 'celebrate'] }, message: str('Optional short text to show') }, ['name']),
    run: ({ name, message }, { services }) => { services.face.play(name, message); return { played: name }; },
  },
];
