// PC control, routines and activity. ctx.services supplies pc and activity.
import { MEDIA_KEYS, SETTINGS_PAGES } from '../services/pc.js';
import { now } from '../store.js';

const str = (description) => ({ type: 'string', description });
const int = (description) => ({ type: 'integer', description });
const obj = (properties, required = []) => ({ type: 'object', properties, required });

export const pcTools = [
  {
    name: 'pc_open_app',
    description: 'Open an app by name, e.g. "WhatsApp", "VS Code", "Chrome", "Spotify", "Calculator". Searches the Start menu and Store apps; if the app is not installed it searches for it in Chrome. Always tell the user what happened (tell_user).',
    parameters: obj({ name: str('App name') }, ['name']),
    run: ({ name }, { services }) => services.pc.openApp(name),
  },
  {
    name: 'system_status',
    description: 'How the computer is doing right now: CPU and GPU load, RAM, disk space, battery, temperature and the apps using the most memory. Use for "why is my PC slow", "battery level", "how much storage is left".',
    parameters: obj({}),
    run: async () => (await import('../services/sysmon.js')).systemStatus(),
  },
  {
    name: 'pc_media',
    description: 'Control music/video playback and sound: play/pause, next, previous, stop, mute, volume up/down a step.',
    parameters: obj({ action: { type: 'string', enum: Object.keys(MEDIA_KEYS) } }, ['action']),
    run: async ({ action }, { services }) => { await services.pc.key(action); return { done: action }; },
  },
  {
    name: 'pc_volume',
    description: 'Set the computer volume to a level 0-100, or read it (no level). "Volume 30", "mute" = 0.',
    parameters: obj({ level: int('0 to 100') }),
    run: async ({ level }, { services }) => ({ volume: await services.pc.volume(level) }),
  },
  {
    name: 'pc_brightness',
    description: 'Set the laptop screen brightness 0-100, or read it (no level).',
    parameters: obj({ level: int('0 to 100') }),
    run: async ({ level }, { services }) => ({ brightness: await services.pc.brightness(level) }),
  },
  {
    name: 'pc_lock',
    description: 'Lock the computer (Windows lock screen).',
    parameters: obj({}),
    run: async (_, { services }) => { await services.pc.lock(); return { locked: true }; },
  },
  {
    name: 'pc_settings_page',
    description: 'Open a Windows Settings page.',
    parameters: obj({ page: { type: 'string', enum: Object.keys(SETTINGS_PAGES) } }, ['page']),
    run: async ({ page }, { services }) => { await services.pc.startUri(SETTINGS_PAGES[page]); return { opened: page }; },
  },
  {
    name: 'pc_power',
    description: 'Shut down, restart or sleep the computer (optionally after some minutes), or cancel a planned shutdown. The user approves first. For "I\'ll work 2 hours, then shut down" use work_timer_start instead (it says goodbye and lets them say wait).',
    confirm: true,
    parameters: obj({ action: { type: 'string', enum: ['shutdown', 'restart', 'sleep', 'cancel'] }, minutes: int('Delay in minutes, default 0') }, ['action']),
    run: ({ action, minutes }, { services }) => services.pc.power(action, minutes),
  },
  {
    name: 'work_timer_start',
    description: 'Start a work timer, e.g. "I will work for 2 hours, then shut down the PC". When it ends Maya sums up the day, says goodbye, gives 1 minute to say "wait", then shuts down. shutdown false = only tell the user. The user approves first.',
    confirm: true,
    parameters: obj({ minutes: int('Length in minutes (2 hours = 120)'), task: str('What they are working on, optional'), shutdown: { type: 'boolean', description: 'Shut the PC down at the end (default true)' } }, ['minutes']),
    run: ({ minutes, task, shutdown = true }, { services }) => services.session.start(minutes, task || 'work', shutdown),
  },
  {
    name: 'work_timer_status',
    description: 'Is a work timer running, when does it end, will the PC shut down?',
    parameters: obj({}),
    run: (_, { services }) => services.session.status(),
  },
  {
    name: 'work_timer_cancel',
    description: 'Stop the work timer, so the PC will not shut down. "Give me 15 more minutes" = work_timer_more.',
    parameters: obj({}),
    run: (_, { services }) => services.session.cancel(),
  },
  {
    name: 'work_timer_more',
    description: 'Add minutes to the running work timer.',
    parameters: obj({ minutes: int('Minutes to add, default 15') }),
    run: ({ minutes = 15 }, { services }) => services.session.extend(minutes),
  },
  {
    name: 'pc_close_app',
    description: 'Close a running app by its program name, e.g. "chrome", "spotify", only when the user asks to close it. Never on your own to free memory. The user approves first.',
    confirm: true,
    parameters: obj({ name: str('Program name without .exe') }, ['name']),
    run: ({ name }, { services }) => services.pc.closeApp(name),
  },
  {
    name: 'routines_save',
    description: 'Save a routine: a named list of actions run together, e.g. "study mode" = open VS Code + start 50 min focus + open a lo-fi music website. Each step is a tool name with its arguments. With time ("every morning at 8" = "08:00") it also runs by itself every day; to have things read out, use briefing_now as a step.',
    parameters: obj({
      name: str('Routine name, e.g. "study mode"'),
      steps: { type: 'array', items: obj({ tool: str('Tool name, e.g. pc_open_app'), args: { type: 'object', description: 'Arguments for that tool' } }, ['tool']) },
      time: str('Run every day at this time, 24-hour HH:MM, optional'),
    }, ['name', 'steps']),
    run: async ({ name, steps, time }, { store }) => {
      const { allTools } = await import('./index.js');
      const unknown = steps.filter((s) => !allTools.some((t) => t.name === s.tool) || s.tool.startsWith('routines_'));
      if (unknown.length) return { error: `Unknown or not allowed step tools: ${unknown.map((s) => s.tool).join(', ')}` };
      if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return { error: 'time must be 24-hour HH:MM, e.g. 08:00' };
      const key = name.trim().toLowerCase();
      const schedule = time || '';
      const existing = store.get('SELECT id FROM routines WHERE name = ?', key);
      if (existing) return store.update('routines', existing.id, { steps: JSON.stringify(steps), deleted: 0, ...(time ? { schedule } : {}) }, `Updated routine ${key}`);
      return store.insert('routines', { name: key, steps: JSON.stringify(steps), schedule, created_at: now() }, `Saved routine ${key}${time ? `, every day at ${time}` : ''}`);
    },
  },
  {
    name: 'routines_run',
    description: 'Run a saved routine (workflow) by name, e.g. "start study mode". Each step runs in order and shows live in Workflows.',
    parameters: obj({ name: str('Routine name') }, ['name']),
    run: async ({ name }, ctx) => {
      const { allTools } = await import('./index.js');
      const { createWorkflows } = await import('../services/workflows.js');
      const workflows = ctx.services?.workflows ?? createWorkflows({ store: ctx.store, tools: () => allTools, ctx, confirm: ctx.services?.confirm });
      let started;
      try { started = workflows.start(name); } catch (e) { return { error: e.message }; }
      const run = await started.done;
      return { routine: run.routine, run_id: run.id, status: run.status, steps: run.steps.map(({ tool, status, result, error }) => ({ tool, status, result, error })) };
    },
  },
  {
    name: 'routines_history',
    description: 'Recent workflow/routine runs with the state of each step (completed, failed, cancelled...).',
    parameters: obj({ limit: { type: 'integer', description: 'Default 10' } }),
    run: ({ limit = 10 }, { services }) => services.workflows.runs(limit).map(({ id, routine, status, trigger, started_at, steps }) =>
      ({ id, routine, status, trigger, started_at, steps: steps.map((s) => `${s.tool}: ${s.status}${s.error ? ` (${s.error})` : ''}`) })),
  },
  {
    name: 'routines_control',
    description: 'Pause, resume, cancel or retry a workflow run (find run ids with routines_history).',
    parameters: obj({ run_id: { type: 'integer' }, action: { type: 'string', enum: ['pause', 'resume', 'cancel', 'retry'] } }, ['run_id', 'action']),
    run: ({ run_id, action }, { services }) => {
      const r = services.workflows[action](run_id);
      return r.run ? { run_id, status: 'running again' } : { run_id, status: r.status };
    },
  },
  {
    name: 'routines_schedule',
    description: 'Run a saved routine automatically every day at a time, e.g. "08:00". Empty time removes the schedule. The user approves first.',
    confirm: true,
    parameters: obj({ name: str('Routine name'), time: str('HH:MM 24-hour, or "" to stop') }, ['name', 'time']),
    run: ({ name, time }, { store }) => {
      if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return { error: 'Time must be HH:MM, e.g. 08:00' };
      const r = store.get('SELECT id FROM routines WHERE deleted = 0 AND name = ?', name.trim().toLowerCase());
      return r ? store.update('routines', r.id, { schedule: time, last_scheduled: null }, time ? `Scheduled ${name} daily at ${time}` : `Unscheduled ${name}`) : { error: `No routine called "${name}"` };
    },
  },
  {
    name: 'routines_list',
    description: 'List saved routines and their steps.',
    parameters: obj({}),
    run: (_, { store }) => store.all('SELECT id, name, steps, schedule FROM routines WHERE deleted = 0').map((r) => ({ ...r, steps: JSON.parse(r.steps) })),
  },
  {
    name: 'briefing_now',
    description: 'Give the daily briefing now: weather, today\'s classes/events, tasks, reminders, emails (morning), or a review of the day (evening). Read the returned text to the user.',
    parameters: obj({ kind: { type: 'string', enum: ['morning', 'evening'] } }),
    run: ({ kind = new Date().getHours() < 16 ? 'morning' : 'evening' }, { services }) => services.briefing.generate(kind),
  },
  {
    name: 'routines_delete',
    description: 'Delete a saved routine by name (can be undone).',
    parameters: obj({ name: str('Routine name') }, ['name']),
    run: ({ name }, { store }) => {
      const r = store.get('SELECT id FROM routines WHERE deleted = 0 AND name = ?', name.trim().toLowerCase());
      return r ? store.update('routines', r.id, { deleted: 1 }, `Deleted routine ${name}`) : { error: `No routine called "${name}"` };
    },
  },
  {
    name: 'activity_query',
    description: 'How the user spent time on the computer: minutes per app/website, productive vs distracting, for a day (default today) or the week. Use for "how much time did I spend on YouTube", "was I productive today".',
    parameters: obj({ day: str('YYYY-MM-DD, default today'), week: { type: 'boolean', description: 'Last 7 days instead' } }),
    run: ({ day, week }, { services }) => (week ? services.activity.week() : services.activity.summary(day)),
  },
];
