import { classesBetween } from './student.js';
import { now } from '../store.js';
import { localIso } from '../services/calendar-feeds.js';

const str = (description) => ({ type: 'string', description });
const int = (description) => ({ type: 'integer', description });
const obj = (properties, required = []) => ({ type: 'object', properties, required });

const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time
const like = (q) => `%${(q || '').toLowerCase()}%`;

export const productivityTools = [
  // ---------- tasks ----------
  {
    name: 'tasks_create',
    description: 'Create a to-do task. Use for "add a task", "remind me to do X" without a specific alert time, "I need to...".',
    parameters: obj({ title: str('Short task title'), due: str('Due date/time as local ISO, e.g. 2026-10-29T17:00, optional'),
      priority: { type: 'string', enum: ['low', 'normal', 'high'] }, notes: str('Extra details, optional') }, ['title']),
    run: ({ title, due, priority, notes }, { store }) =>
      store.insert('tasks', { title, due, priority: priority || 'normal', notes, created_at: now() }, `Added task "${title}"`),
  },
  {
    name: 'tasks_query',
    description: 'List tasks. Filter by status (open/done/all), text search, or due today/overdue.',
    parameters: obj({ status: { type: 'string', enum: ['open', 'done', 'all'] }, search: str('Text to match, optional'),
      when: { type: 'string', enum: ['any', 'today', 'overdue', 'upcoming'] } }),
    run: ({ status = 'open', search, when = 'any' }, { store }) => {
      let sql = 'SELECT * FROM tasks WHERE deleted = 0 AND lower(title) LIKE ?';
      if (status === 'open') sql += ' AND done = 0';
      if (status === 'done') sql += ' AND done = 1';
      if (when === 'today') sql += ` AND substr(due,1,10) = '${today()}'`;
      if (when === 'overdue') sql += ` AND done = 0 AND due IS NOT NULL AND due < '${today()}'`;
      if (when === 'upcoming') sql += ` AND due >= '${today()}'`;
      return store.all(`${sql} ORDER BY done, due IS NULL, due, id LIMIT 50`, like(search));
    },
  },
  {
    name: 'tasks_update',
    description: 'Change a task: title, due date, priority or notes. Find the id with tasks_query first.',
    parameters: obj({ id: int('Task id'), title: str('New title'), due: str('New due local ISO'),
      priority: { type: 'string', enum: ['low', 'normal', 'high'] }, notes: str('New notes') }, ['id']),
    run: ({ id, ...changes }, { store }) => store.update('tasks', id, changes, `Changed task ${id}`),
  },
  {
    name: 'tasks_complete',
    description: 'Mark a task done (or not done with done=false).',
    parameters: obj({ id: int('Task id'), done: { type: 'boolean' } }, ['id']),
    run: ({ id, done = true }, { store }) =>
      store.update('tasks', id, { done: done ? 1 : 0, completed_at: done ? now() : null }, `Completed task ${id}`),
  },
  {
    name: 'tasks_delete',
    description: 'Delete a task (can be undone).',
    parameters: obj({ id: int('Task id') }, ['id']),
    run: ({ id }, { store }) => store.update('tasks', id, { deleted: 1 }, `Deleted task ${id}`),
  },

  // ---------- notes ----------
  {
    name: 'notes_create',
    description: 'Save a note. Use for "note that...", "write down...", "remember that...".',
    parameters: obj({ title: str('Short title'), body: str('The note text') }, ['title']),
    run: ({ title, body = '' }, { store }) =>
      store.insert('notes', { title, body, created_at: now(), updated_at: now() }, `Saved note "${title}"`),
  },
  {
    name: 'notes_query',
    description: 'Find notes by text, or list recent notes.',
    parameters: obj({ search: str('Words to find, optional') }),
    run: ({ search }, { store }) =>
      store.all('SELECT * FROM notes WHERE deleted = 0 AND (lower(title) LIKE ? OR lower(body) LIKE ?) ORDER BY updated_at DESC LIMIT 30',
        like(search), like(search)),
  },
  {
    name: 'notes_update',
    description: 'Change a note title or text. append=true adds text to the end instead of replacing.',
    parameters: obj({ id: int('Note id'), title: str('New title'), body: str('Text'), append: { type: 'boolean' } }, ['id']),
    run: ({ id, title, body, append }, { store }) => {
      const old = store.row('notes', id);
      const newBody = body === undefined ? undefined : append && old ? `${old.body}\n${body}` : body;
      return store.update('notes', id, { title, body: newBody, updated_at: now() }, `Changed note ${id}`);
    },
  },
  {
    name: 'notes_delete',
    description: 'Delete a note (can be undone).',
    parameters: obj({ id: int('Note id') }, ['id']),
    run: ({ id }, { store }) => store.update('notes', id, { deleted: 1 }, `Deleted note ${id}`),
  },

  // ---------- reminders ----------
  {
    name: 'reminders_create',
    description: 'Set a reminder that pops up and plays a sound at an exact time. repeat: daily, weekdays or weekly. Not for "if someone does not reply" (use mail_follow_up).',
    parameters: obj({ text: str('What to remind about'), at: str('Local ISO date-time, e.g. 2026-10-28T18:30'),
      in_days: { type: 'integer', description: 'Instead of at: this many days from today, at 9 am (e.g. 2 for "in 2 days")' },
      repeat: { type: 'string', enum: ['none', 'daily', 'weekdays', 'weekly'], description: 'Only when the user said every day / every weekday / every week; otherwise none' },
      care: { type: 'boolean', description: 'true for medicine, tablets, insulin, injections, physio, drinking water for health: Maya waits for "done" and emails a caregiver if not confirmed' } }, ['text']),
    run: ({ text, at, in_days, repeat, care }, { store }) => {
      // Days ahead are counted here: small models get date maths wrong (a refill set for the day the tablets run out).
      if (!at && Number.isInteger(in_days)) { const d = new Date(); d.setDate(d.getDate() + Math.max(0, in_days)); d.setHours(9, 0, 0, 0); at = localIso(d); }
      if (!at) throw new Error('Give the reminder a time: at or in_days.');
      return store.insert('reminders', { text, at, repeat: repeat === 'none' ? null : repeat, care: care ? 1 : 0, created_at: now() }, `Set reminder "${text}"`);
    },
  },
  {
    name: 'reminders_query',
    description: 'List upcoming (or all) reminders.',
    parameters: obj({ include_done: { type: 'boolean' } }),
    run: ({ include_done }, { store }) =>
      store.all(`SELECT * FROM reminders WHERE deleted = 0 ${include_done ? '' : 'AND done = 0'} ORDER BY at LIMIT 50`),
  },
  {
    name: 'reminders_delete',
    description: 'Cancel a reminder (can be undone).',
    parameters: obj({ id: int('Reminder id') }, ['id']),
    run: ({ id }, { store }) => store.update('reminders', id, { deleted: 1 }, `Cancelled reminder ${id}`),
  },

  // ---------- habits ----------
  {
    name: 'habits_create',
    description: 'Start tracking a habit, e.g. "drink water", "gym 3 times a week".',
    parameters: obj({ name: str('Habit name'), per_week: int('Target days per week, 1-7') }, ['name']),
    run: ({ name, per_week = 7 }, { store }) =>
      store.insert('habits', { name, per_week, created_at: now() }, `Started habit "${name}"`),
  },
  {
    name: 'habits_checkin',
    description: 'Mark a habit as done for a day (default today).',
    parameters: obj({ id: int('Habit id'), day: str('YYYY-MM-DD, optional') }, ['id']),
    run: ({ id, day = today() }, { store }) => {
      const existing = store.get('SELECT * FROM habit_checkins WHERE habit_id = ? AND day = ?', id, day);
      if (existing) return store.update('habit_checkins', existing.id, { deleted: 0 }, `Checked in habit ${id}`);
      return store.insert('habit_checkins', { habit_id: id, day }, `Checked in habit ${id}`);
    },
  },
  {
    name: 'habits_progress',
    description: 'Show habits with this week\'s check-ins, target and current streak.',
    parameters: obj({}),
    run: (_, { store }) => habitProgress(store),
  },
  {
    name: 'habits_delete',
    description: 'Stop tracking a habit (can be undone).',
    parameters: obj({ id: int('Habit id') }, ['id']),
    run: ({ id }, { store }) => store.update('habits', id, { deleted: 1 }, `Removed habit ${id}`),
  },

  // ---------- focus ----------
  {
    name: 'focus_start',
    description: 'Start a focus timer (Pomodoro). Default 25 minutes.',
    parameters: obj({ minutes: int('Length in minutes'), label: str('What you are focusing on') }),
    run: ({ minutes = 25, label = 'Focus' }, { store }) => {
      const running = activeFocus(store);
      if (running) return { error: `A focus session is already running: ${running.label}`, session: running };
      return store.insert('focus_sessions', { minutes, label, started_at: now() }, `Started ${minutes} min focus`);
    },
  },
  {
    name: 'focus_status',
    description: 'Is a focus timer running, and how much time is left?',
    parameters: obj({}),
    run: (_, { store }) => {
      const s = activeFocus(store);
      if (!s) return { running: false };
      const left = s.minutes * 60 - (Date.now() - Date.parse(s.started_at)) / 1000;
      return { running: true, label: s.label, seconds_left: Math.max(0, Math.round(left)), session: s };
    },
  },
  {
    name: 'focus_stop',
    description: 'Stop the running focus timer early.',
    parameters: obj({}),
    run: (_, { store }) => {
      const s = activeFocus(store);
      if (!s) return { running: false };
      return store.update('focus_sessions', s.id, { ended_at: now() }, 'Stopped focus');
    },
  },

  // ---------- local calendar ----------
  {
    name: 'calendar_create',
    description: 'Add an event to the calendar, e.g. "haircut Tuesday at 11".',
    parameters: obj({ title: str('Event title'), start: str('Local ISO start'), end: str('Local ISO end, optional'),
      location: str('Where, optional') }, ['title', 'start']),
    run: ({ title, start, end, location }, { store }) =>
      store.insert('events', { title, start, end, location, created_at: now() }, `Added event "${title}"`),
  },
  {
    name: 'calendar_query',
    description: 'List calendar events between two dates (includes timetable classes and connected Google/Outlook/Apple calendar feeds).',
    parameters: obj({ from: str('YYYY-MM-DD, default today'), to: str('YYYY-MM-DD, default 7 days later') }),
    run: async ({ from = today(), to }, { store, services }) => {
      const end = to || new Date(Date.parse(from) + 7 * 864e5).toLocaleDateString('en-CA');
      const local = store.all('SELECT * FROM events WHERE deleted = 0 AND substr(start,1,10) BETWEEN ? AND ? ORDER BY start',
        from, end).map((e) => ({ ...e, source: 'Maya' }));
      const feeds = services?.calendarFeeds ? await services.calendarFeeds.events(from, end) : [];
      return [...local, ...classesBetween(store, from, end), ...feeds].sort((a, b) => a.start.localeCompare(b.start));
    },
  },
  {
    name: 'calendar_delete',
    description: 'Delete an Maya calendar event (can be undone).',
    parameters: obj({ id: int('Event id') }, ['id']),
    run: ({ id }, { store }) => store.update('events', id, { deleted: 1 }, `Deleted event ${id}`),
  },

  // ---------- patterns and undo ----------
  {
    name: 'history_query',
    description: 'What Maya has noticed about the user: tasks done today/this week, when they usually get things done, focus time, habit streaks. Use for "how many tasks did I do today", "when am I most active", "what have you noticed about me".',
    parameters: obj({}),
    run: (_, { store }) => patterns(store),
  },
  {
    name: 'app_undo',
    description: 'Undo the last change Maya made.',
    parameters: obj({}),
    run: (_, { store }) => {
      const label = store.undo();
      return label ? { undone: label } : { undone: null, message: 'Nothing to undo' };
    },
  },
];

function activeFocus(store) {
  const s = store.get('SELECT * FROM focus_sessions WHERE deleted = 0 AND ended_at IS NULL ORDER BY id DESC LIMIT 1');
  if (s && Date.now() - Date.parse(s.started_at) > s.minutes * 60_000) {
    store.run('UPDATE focus_sessions SET ended_at = ?, completed = 1 WHERE id = ?', now(), s.id);
    return null;
  }
  return s;
}

export function habitProgress(store) {
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7)); // Monday
  const from = weekStart.toLocaleDateString('en-CA');
  return store.all('SELECT * FROM habits WHERE deleted = 0 ORDER BY id').map((h) => {
    const days = new Set(store.all('SELECT day FROM habit_checkins WHERE habit_id = ? AND deleted = 0', h.id).map((r) => r.day));
    let streak = 0;
    for (const d = new Date(); days.has(d.toLocaleDateString('en-CA')); d.setDate(d.getDate() - 1)) streak++;
    const thisWeek = [...days].filter((d) => d >= from).length;
    const last7 = [...Array(7)].map((_, i) => days.has(new Date(Date.now() - (6 - i) * 864e5).toLocaleDateString('en-CA')));
    return { ...h, this_week: thisWeek, done_today: days.has(today()), streak, last7 };
  });
}

export function patterns(store) {
  const done = store.all('SELECT completed_at FROM tasks WHERE done = 1 AND deleted = 0 AND completed_at IS NOT NULL');
  const byHour = Array(24).fill(0);
  for (const t of done) byHour[new Date(t.completed_at).getHours()]++;
  const best = byHour.indexOf(Math.max(...byHour));
  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
  const focus = store.get('SELECT COALESCE(SUM(minutes),0) AS m, COUNT(*) AS n FROM focus_sessions WHERE completed = 1 AND started_at >= ?', weekAgo);
  return {
    tasks_done_today: done.filter((t) => new Date(t.completed_at).toLocaleDateString('en-CA') === today()).length,
    tasks_done_this_week: done.filter((t) => t.completed_at >= weekAgo).length,
    tasks_open: store.get('SELECT COUNT(*) AS n FROM tasks WHERE done = 0 AND deleted = 0').n,
    most_productive_hours: done.length >= 3 ? `${best}:00 to ${best + 2}:00` : 'not enough history yet',
    tasks_done_by_hour: byHour,
    focus_minutes_this_week: focus.m,
    focus_sessions_this_week: focus.n,
    habits: habitProgress(store).map((h) => ({ name: h.name, streak: h.streak, this_week: h.this_week, target: h.per_week })),
    computer_time_today: store.all('SELECT label, ROUND(SUM(seconds) / 60.0) AS minutes FROM activity WHERE day = ? GROUP BY label ORDER BY minutes DESC LIMIT 5', today()),
  };
}
