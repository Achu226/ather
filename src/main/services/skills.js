// Skills: named recipes Maya follows ("when I say goodnight, turn on dark mode and read tomorrow's tasks").
// A dozen come built in; the user teaches more by voice or on the Skills page. The best match for a request
// adds its steps to the instructions and its tools to the ones offered.
import { now } from '../store.js';
import { looksLikePassword } from './clipboard.js';

export const BUILTIN = [
  ['Research report', 'research a topic and write a report or essay about it', 'Search the web (web_search, web_read) for 3-5 good sources. Write a clear report with headings, an introduction, main points and a conclusion, and list the sources at the end. Save it with files_make_document and tell the user where it is.', '^(web_|files_make_document)'],
  ['Study notes and quiz', 'make study notes, revision notes or a quiz from a PDF, chapter or topic', 'Read the material (the attached document, or files_search + open the file). Write short notes with the key points and definitions, then make a 10-question quiz with study_create (kind quiz). Offer to make flashcards too.', '^(study_|files_search|files_make_document)'],
  ['Job application', 'apply for a job: write a CV / resume and a cover letter', 'Ask only for what you do not know (name, skills, the job). Use what you remember about the user. Write a one-page CV and a short cover letter tailored to the job; save both with files_make_document.', '^files_make_document$'],
  ['Monthly budget', 'make a budget, track spending or plan monthly expenses', 'Collect income and expenses (ask once if missing). Use python_run to build an Excel sheet with categories, totals and a pie chart, and say how much is left to save.', '^python_'],
  ['Trip plan', 'plan a trip, holiday, travel or visit somewhere', 'Search the web for travel options, weather and places. Write a day-by-day plan with times, costs and accessible options (lifts, ramps, rest stops). Offer to add it to the calendar.', '^(web_|calendar_create)'],
  ['Meeting notes', 'write minutes or notes of a meeting, class, call or lecture recording', 'Use the transcript (the attached document, or the Lectures page recording the user names). Write: summary, decisions, action items with owners and dates. Offer to add the action items as tasks.', '^(tasks_create|files_make_document)$'],
  ['Presentation maker', 'make slides, a PPT or a presentation about something', 'Research if needed, then make 6-10 slides with short bullets and speaker notes using files_make_presentation.', '^(web_|files_make_presentation)'],
  ['Plan my day by energy', 'plan my day, organise today, what should I do today', 'Look at today\'s tasks, events, reminders and classes. Put hard work when the user usually gets most done (history_query), add breaks every hour and meals. Write the plan with times; offer to add it as reminders.', '^(tasks_query|calendar_query|reminders_query|history_query|reminders_create)$'],
  ['Inbox clean-up', 'clean my inbox, tidy email, deal with my mails', 'Use mail_triage to find what needs the user and read those out briefly. Find newsletters with mail_promotions and offer to archive them with mail_archive (the user approves).', '^mail_'],
  ['My morning', 'good morning, start my day, morning routine', 'Give the briefing (briefing_now), then read today\'s first task and any medicine reminder. Ask if they want music or the news.', '^(briefing_now|tasks_query|reminders_query)$'],
  ['Care day', 'plan care, medicine, water, physio or exercise breaks for today', 'Ask which medicines and times if not known. Set care reminders (reminders_create with care true), water every 2 hours and gentle stretch breaks, and read the schedule back.', '^reminders_create$'],
  ['Download from a chat', 'download or save a video, photo or file from a WhatsApp chat to my desktop or a folder', 'whatsapp_open_chat with the number, contact or "me". Then computer_start and computer_look. Click the newest video (or photo) in the chat to open it, then click its Download button (the arrow at the top), then press Escape. Call downloads_latest with kind video (or image) and wait 60 to get the saved file, then fs_move it into the "desktop" folder that downloads_latest returns. Tell the user the file name and where it is.', '^(whatsapp_open_chat|computer_|downloads_latest|fs_move)$'],
  ['Read and reply to chats', 'read my new WhatsApp messages, who messaged me, reply on WhatsApp', 'To read: pc_open_app WhatsApp (or whatsapp_open_chat for one person), then computer_start and computer_look. Read the unread chats (names with a green number) and their newest messages aloud, briefly. To reply: whatsapp_open_chat with that person, computer_type the reply in the message box in exactly the user\'s words, read it back and ask "Shall I send it?". Press Enter (computer_keys enter) only after the user says yes or send.', '^(whatsapp_|pc_open_app|computer_)'],
  ['Phone by voice', 'read my phone notifications, my text messages or SMS, send a text from my phone, check missed calls', 'pc_open_app Phone Link, then computer_start and computer_look. For notifications or messages, read the newest ones aloud. To send a text: open Messages, pick or search the contact, computer_type the message in the user\'s words, read it back, and send only after the user says yes. To call someone use call_contact.', '^(pc_open_app|computer_|call_contact)$'],
  ['YouTube by voice', 'open YouTube, scroll YouTube, play the first video, play or pause a video on YouTube', 'If the user names a song or video, music_play plays it straight away. Otherwise: open_website https://www.youtube.com, then computer_start and computer_look. "Scroll" = computer_scroll down (then look again). "Play the first video" = computer_click the first video thumbnail or title (top-left of the grid, not an ad or a Short), then computer_look to check it plays. "Pause" / "play" = computer_keys k; "full screen" = computer_keys f; "next video" = computer_keys shift+n. Say what you are doing as you go.', '^(open_website|computer_|music_play)'],
  ['Explain my screen', 'explain my screen simply, what is on my screen, I do not understand this window', 'Look at the screen with screen_look. Explain in three short, simple sentences what this window is and the one thing the user most likely wants to do next, and offer to do it for them.', '^(screen_look|computer_)'],
  ['Build me an app', 'build, make or code a website, app, game or program', 'Plan the files, write them with fs_write, run them (run_command), check with qa_check_site, fix errors until it works, then open it for the user (open_file / open_website) and explain how to use it in two lines.', '^(fs_|run_command|qa_|git_|open_)'],
];

const seeded = new WeakSet();
/** Seeds the built-in skills once per store (a user's changes to them are kept). */
export function seedSkills(store) {
  if (seeded.has(store)) return;
  seeded.add(store);
  for (const [name, when, steps, tools] of BUILTIN) {
    store.run('INSERT OR IGNORE INTO skills (name, "when", steps, tools, builtin, created_at) VALUES (?,?,?,?,1,?)', name, when, steps, tools, now());
  }
}

const STOP = new Set('a an the and or to for of in on my me i you it is are be do make with about from this that please can could would will some'.split(' '));
const words = (s) => String(s).toLowerCase().match(/[\p{L}\p{N}]+/gu)?.filter((w) => w.length > 2 && !STOP.has(w)) || [];
const stem = (w) => w.replace(/(ing|ies|es|ed|s)$/, '');

/**
 * The enabled skill that fits this request best, or null. The skill's name said aloud wins outright
 * ("goodnight"); otherwise at least two meaningful words must match its name or description.
 */
export function matchSkill(store, text) {
  seedSkills(store);
  const t = String(text).toLowerCase();
  const asked = new Set(words(t).map(stem));
  let best = null, bestScore = 0;
  for (const s of store.all('SELECT * FROM skills WHERE enabled = 1')) {
    if (t.includes(s.name.toLowerCase())) return s;
    // Words of the skill's name count double: "presentation" alone should find the Presentation maker.
    const named = new Set(words(s.name).map(stem));
    const score = [...new Set([...named, ...words(s.when).map(stem)])].filter((w) => asked.has(w)).reduce((n, w) => n + (named.has(w) ? 2 : 1), 0);
    if (score > bestScore) { best = s; bestScore = score; }
  }
  return bestScore >= 2 ? best : null;
}

export function saveSkill(store, { name, when, steps, tools = '' }) {
  if (!name?.trim() || !when?.trim() || !steps?.trim()) throw new Error('A skill needs a name, when to use it, and its steps.');
  if (tools) new RegExp(tools); // throws on a broken pattern before it is saved
  const row = store.get('SELECT id FROM skills WHERE name = ?', name.trim());
  if (row) store.run('UPDATE skills SET "when" = ?, steps = ?, tools = ?, enabled = 1 WHERE id = ?', when.trim(), steps.trim(), tools, row.id);
  else store.run('INSERT INTO skills (name, "when", steps, tools, created_at) VALUES (?,?,?,?,?)', name.trim(), when.trim(), steps.trim(), tools, now());
  return { saved: name.trim() };
}

const LOOKUP = /^(agent_|time_|web_)|_(query|status|progress|list|search|read|look)$/;
const secret = (s) => /\b(password|passcode|pin|otp|cvv|card number)\b/i.test(s) || String(s).split(/\s+/).some(looksLikePassword);

/** The calls of a finished job that worked: planning, failed and refused calls left out. Exported for tests. */
export const jobSteps = (toolLog) => toolLog.filter((t) => !t.name.startsWith('agent_') && !t.result?.error && !t.result?.denied);

/**
 * Hermes-style learning: a multi-step job that just worked, which no skill covered, is written up by the local
 * model as a skill the user can keep. Returns the offer (not saved) or null. Its tools are the ones the job
 * really used, never what the model writes, so a learned skill cannot reach anything new.
 */
export async function learnSkill(store, question, toolLog, complete) {
  const last = toolLog.at(-1)?.result;
  if (String(question).trim().split(/\s+/).length < 4 || secret(question) || last?.error || toolLog.some((t) => t.result?.denied)) return null;
  const steps = jobSteps(toolLog);
  const names = [...new Set(steps.map((t) => t.name))];
  if (steps.filter((t) => !LOOKUP.test(t.name)).length < 3 || names.length < 2 || matchSkill(store, question)) return null;
  const done = steps.map((t, i) => `${i + 1}. ${t.name} ${JSON.stringify(t.args).slice(0, 200)}`).join('\n');
  const raw = await complete(`The user asked their assistant Maya: "${String(question).slice(0, 500)}"\nMaya did it with these tool calls:\n${done}\n\n`
    + 'Write this as a reusable skill so Maya can do the same kind of job again. name: 2 to 5 words. when: the kinds of requests it is for, in plain words. '
    + 'steps: short numbered steps naming the tools to call. Keep it general: write "the contact the user names", "the file the user names", never the actual names, numbers, messages or paths. Reply as JSON.',
  { format: { type: 'object', required: ['name', 'when', 'steps'], properties: { name: { type: 'string' }, when: { type: 'string' }, steps: { type: 'string' } } } });
  let skill;
  try { skill = JSON.parse(raw); } catch { return null; }
  const name = String(skill.name || '').trim(), when = String(skill.when || '').trim(), how = String(skill.steps || '').trim();
  if (!name || name.length > 40 || !when || when.length > 300 || !how || how.length > 2000 || secret(how)) return null;
  if (store.get('SELECT id FROM skills WHERE lower(name) = lower(?)', name)) return null;
  return { name, when, steps: how, tools: `^(${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})$` };
}
