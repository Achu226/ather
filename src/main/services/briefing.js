// Morning briefing, evening review and gentle nudges.
import { complete } from '../brain.js';
import { patterns } from '../tools/productivity.js';
import { localIso } from './calendar-feeds.js';

const WMO = { 0: 'clear sky', 1: 'mostly clear', 2: 'partly cloudy', 3: 'cloudy', 45: 'foggy', 48: 'foggy', 51: 'light drizzle', 53: 'drizzle', 55: 'heavy drizzle',
  61: 'light rain', 63: 'rain', 65: 'heavy rain', 71: 'light snow', 73: 'snow', 75: 'heavy snow', 80: 'rain showers', 81: 'rain showers', 82: 'heavy showers', 95: 'thunderstorms', 96: 'thunderstorms with hail', 99: 'thunderstorms with hail' };

/** Today's weather for a city from Open-Meteo (free, no key). */
export async function weather(city) {
  const geo = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=1&name=${encodeURIComponent(city)}`)).json();
  const place = geo.results?.[0];
  if (!place) throw new Error(`Couldn't find the city "${city}"`);
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&timezone=auto`
    + '&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&forecast_days=1';
  const w = await (await fetch(url)).json();
  return {
    place: `${place.name}${place.admin1 ? `, ${place.admin1}` : ''}`,
    now_c: Math.round(w.current.temperature_2m),
    high_c: Math.round(w.daily.temperature_2m_max[0]),
    low_c: Math.round(w.daily.temperature_2m_min[0]),
    rain_chance: w.daily.precipitation_probability_max[0],
    sky: WMO[w.daily.weather_code[0]] ?? 'mixed',
  };
}

const today = () => new Date().toLocaleDateString('en-CA');

export function createBriefing({ store, services }) {
  async function gather(kind) {
    const run = (name, args = {}) => import('../tools/index.js').then(({ allTools }) => allTools.find((t) => t.name === name).run(args, { store, services }));
    const data = {
      today: new Date().toDateString(),
      tasks_due_today: (await run('tasks_query', { when: 'today' })).map((t) => ({ title: t.title, due: t.due })),
      overdue_tasks: (await run('tasks_query', { when: 'overdue' })).map((t) => t.title),
      events_today: (await run('calendar_query', { from: today(), to: today() }).catch(() => [])).map((e) => `${e.start.slice(11) || 'all day'} ${e.title}`),
      exams_soon: (await run('exams_query', {})).filter((e) => e.days_left <= 14).map((e) => `${e.subject} in ${e.days_left} days`),
      reminders: (await run('reminders_query', {})).filter((r) => r.at.startsWith(today())).map((r) => `${r.at.slice(11)} ${r.text}`),
      progress: patterns(store),
    };
    const city = store.getSetting('city', '');
    if (city) data.weather = await weather(city).catch(() => null);
    if (kind === 'morning' && services.mail && store.getSetting('mail')) data.emails_need_you = await services.mail.triage().then((m) => m.mails.filter((x) => x.needs_you).map((x) => x.subject)).catch(() => undefined);
    if (kind === 'evening' && services.activity) data.computer_time = services.activity.summary();
    return data;
  }

  /** kind: morning (plan the day) or evening (review the day). Returns the text, also saved for the Home screen. */
  async function generate(kind = 'morning') {
    const data = await gather(kind);
    const ask = kind === 'morning'
      ? 'Write a friendly spoken morning briefing (60 to 110 words): greet, weather in one line if given, what is on today (classes, events, due tasks, reminders, important emails), any exam coming up soon, and one practical tip for the day. No lists, no markdown, natural sentences.'
      : 'Write a friendly spoken end-of-day review (60 to 110 words): what got done today (tasks, focus, habits), honest note on computer time if given, what is still open, and one encouraging suggestion for tomorrow. No lists, no markdown.';
    const text = (await complete(`${ask}\nUse only these facts, never invent any:\n${JSON.stringify(data)}`)).trim();
    store.setSetting('lastBriefing', { kind, text, at: localIso(new Date()) });
    return { kind, text };
  }

  // Nudges once per day each; returns { title, body } or null.
  function nudge(kind) {
    if (kind === 'overdue') {
      const n = store.get("SELECT COUNT(*) AS n FROM tasks WHERE deleted = 0 AND done = 0 AND due IS NOT NULL AND due < ?", today()).n;
      return n ? { title: 'Overdue tasks', body: `You have ${n} overdue task${n > 1 ? 's' : ''}. Want to pick one and finish it now?` } : null;
    }
    if (kind === 'habits') {
      const left = patterns(store).habits.filter((h) => h.this_week < h.target);
      const notToday = store.all("SELECT h.name FROM habits h WHERE h.deleted = 0 AND NOT EXISTS (SELECT 1 FROM habit_checkins c WHERE c.habit_id = h.id AND c.day = ? AND c.deleted = 0)", today());
      return notToday.length && left.length ? { title: 'Habits', body: `Still to do today: ${notToday.map((h) => h.name).join(', ')}.` } : null;
    }
    if (kind === 'distracted' && services.activity) {
      const m = services.activity.summary().distracting_minutes;
      return m >= 60 ? { title: 'Screen time', body: `You've spent ${m} minutes on distracting apps today. Maybe take a real break, or start a focus session?` } : null;
    }
    return null;
  }

  return { gather, generate, nudge };
}

/** Called every minute: fires the briefing, review and nudges at their times, once a day each. */
export async function briefingTick({ store, briefing, notify, isAway }) {
  if (isAway()) return; // wait until the user is back at the computer
  const now = new Date();
  const hhmm = now.toTimeString().slice(0, 5);
  const done = store.getSetting('briefingsDone', {});
  const day = today();
  const due = (key, time, on = true) => on && hhmm >= time && done[key] !== day;
  const mark = (key) => { done[key] = day; store.setSetting('briefingsDone', done); };

  if (due('morning', store.getSetting('briefingTime', '08:00'), store.getSetting('briefingEnabled', true)) && hhmm < '12:00') {
    mark('morning');
    const { text } = await briefing.generate('morning');
    notify('Good morning ☀️', text, 'briefing');
    return;
  }
  if (due('evening', store.getSetting('reviewTime', '21:00'), store.getSetting('eveningReview', true))) {
    mark('evening');
    const { text } = await briefing.generate('evening');
    notify('Your day 🌙', text, 'briefing');
    return;
  }
  if (!store.getSetting('nudges', true)) return;
  for (const [key, time] of [['overdue', '17:00'], ['habits', '20:00'], ['distracted', '00:00']]) {
    if (!due(key, time)) continue;
    const n = briefing.nudge(key);
    if (n) { mark(key); notify(n.title, n.body, 'nudge'); return; }
    if (key !== 'distracted') mark(key); // nothing to say today; the screen-time check keeps watching
  }
}
