// Timetable, exam countdown, clipboard history, health breaks and live captions.
import { now } from '../store.js';

const str = (description) => ({ type: 'string', description });
const obj = (properties, required = []) => ({ type: 'object', properties, required });
export const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const dateOf = (d) => d.toLocaleDateString('en-CA');

/** Timetable classes as calendar events for every date from..to (YYYY-MM-DD, inclusive). */
export function classesBetween(store, from, to) {
  const classes = store.all('SELECT * FROM timetable WHERE deleted = 0 ORDER BY start');
  const out = [];
  for (let d = new Date(`${from}T00:00`); dateOf(d) <= to; d.setDate(d.getDate() + 1)) {
    for (const c of classes.filter((x) => x.day === DAYS[d.getDay()])) {
      out.push({ title: c.subject, start: `${dateOf(d)}T${c.start}`, end: c.end ? `${dateOf(d)}T${c.end}` : null, location: c.room, source: 'Timetable', timetable_id: c.id });
    }
  }
  return out;
}

export const daysUntil = (date, today = new Date()) => Math.round((new Date(`${date}T00:00`) - new Date(`${dateOf(today)}T00:00`)) / 864e5);

export const studentTools = [
  {
    name: 'timetable_add',
    description: 'Add weekly classes to the user\'s timetable. Also use to import a timetable from an attached photo or PDF: read it and add every class in one call.',
    parameters: obj({
      classes: { type: 'array', items: obj({ day: { type: 'string', enum: DAYS }, start: str('HH:MM 24-hour'), end: str('HH:MM 24-hour'), subject: str('Subject or class name'), room: str('Room, optional') }, ['day', 'start', 'subject']) },
    }, ['classes']),
    run: ({ classes }, { store }) => {
      const bad = classes.filter((c) => !DAYS.includes(c.day?.toLowerCase()) || !HHMM.test(c.start) || (c.end && !HHMM.test(c.end)));
      if (bad.length) return { error: `Day must be a weekday name and times HH:MM. Check: ${bad.map((c) => `${c.subject} ${c.day} ${c.start}`).join('; ')}` };
      const added = classes.map((c) => store.insert('timetable', { day: c.day.toLowerCase(), start: c.start, end: c.end || null, subject: c.subject, room: c.room || null, created_at: now() }, `Added class ${c.subject}`));
      return { added: added.length };
    },
  },
  {
    name: 'timetable_query',
    description: 'The user\'s classes for a weekday (default today), or the whole week.',
    parameters: obj({ day: { type: 'string', enum: [...DAYS, 'week'] } }),
    run: ({ day = DAYS[new Date().getDay()] }, { store }) => (day === 'week'
      ? store.all('SELECT * FROM timetable WHERE deleted = 0 ORDER BY start')
      : store.all('SELECT * FROM timetable WHERE deleted = 0 AND day = ? ORDER BY start', day)),
  },
  {
    name: 'timetable_delete',
    description: 'Remove one class from the timetable (find the id with timetable_query).',
    parameters: obj({ id: { type: 'integer' } }, ['id']),
    run: ({ id }, { store }) => store.update('timetable', id, { deleted: 1 }, `Removed class ${id}`),
  },
  {
    name: 'exams_add',
    description: 'Save an exam (or test/assignment deadline) whenever the user mentions its date, so Maya counts down to it. Returns days_left: tell the user that number (do not count days yourself).',
    parameters: obj({ subject: str('e.g. "DBMS end-sem"'), date: str('YYYY-MM-DD'), notes: str('Syllabus or room, optional') }, ['subject', 'date']),
    run: ({ subject, date, notes }, { store }) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'Date must be YYYY-MM-DD' };
      return { ...store.insert('exams', { subject, date, notes: notes || null, created_at: now() }, `Added exam ${subject}`), days_left: daysUntil(date) };
    },
  },
  {
    name: 'exams_query',
    description: 'Upcoming exams the user saved, with how many days are left. If none are saved, carry on with what the user said; do not stop to ask for dates.',
    parameters: obj({}),
    run: (_, { store }) => store.all('SELECT * FROM exams WHERE deleted = 0 AND date >= ? ORDER BY date', dateOf(new Date()))
      .map((e) => ({ ...e, days_left: daysUntil(e.date) })),
  },
  {
    name: 'exams_delete',
    description: 'Remove an exam (find the id with exams_query).',
    parameters: obj({ id: { type: 'integer' } }, ['id']),
    run: ({ id }, { store }) => store.update('exams', id, { deleted: 1 }, `Removed exam ${id}`),
  },
  {
    name: 'clipboard_history',
    description: 'Text the user copied recently (newest first). Use for "what did I copy earlier", "paste the link I copied before". Passwords are never kept.',
    parameters: obj({ limit: { type: 'integer', description: 'Default 10' } }),
    run: ({ limit = 10 }, { services }) => services.clipboard.list().slice(0, limit),
  },
  {
    name: 'health_settings',
    description: 'Turn health break reminders on or off, or change how often: drink water, 20-20-20 eye breaks, stretch/posture. Minutes 0 turns one off.',
    parameters: obj({ water_minutes: { type: 'integer' }, eyes_minutes: { type: 'integer' }, stretch_minutes: { type: 'integer' } }),
    run: (args, { store }) => {
      const next = { ...store.getSetting('health', HEALTH_DEFAULTS) };
      for (const k of ['water', 'eyes', 'stretch']) if (args[`${k}_minutes`] != null) next[k] = Math.max(0, args[`${k}_minutes`]);
      store.setSetting('health', next);
      return next;
    },
  },
  {
    name: 'head_mouse',
    description: 'Turn hands-free head mouse control on or off: the webcam follows the head to move the cursor; open mouth = click, smile = right-click. For users who cannot use a mouse.',
    parameters: obj({ on: { type: 'boolean' } }, ['on']),
    run: ({ on }, { services }) => services.headMouse.set(on),
  },
  {
    name: 'captions_toggle',
    description: 'Show or hide live captions of the computer\'s sound (videos, online classes, calls), optionally translated to English.',
    parameters: obj({ on: { type: 'boolean' }, translate: { type: 'boolean', description: 'Translate any language into English' } }, ['on']),
    run: ({ on, translate = false }, { services }) => services.captions.set(on, { translate }),
  },
];

export const HEALTH_DEFAULTS = { water: 60, eyes: 20, stretch: 45 };
