// Work timer: "work for 2 hours, then shut down". When time is up Maya sums up the day, says goodbye,
// counts down a minute (cancel by voice or button) and shuts the PC down. Setting the timer is the approval.

// Times are stored as UTC ISO strings: "today" starts at local midnight, in UTC.
const today = () => new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
const hm = (min) => (min >= 60 ? `${Math.floor(min / 60)} hour${min >= 120 ? 's' : ''}${min % 60 ? ` ${min % 60} minutes` : ''}` : `${min} minutes`);

/** One spoken paragraph about today: computer time, tasks, focus, emails (exported for tests and the briefing). */
export function daySummary(store, activity) {
  const a = activity?.summary();
  const done = store.get("SELECT COUNT(*) AS n FROM tasks WHERE deleted = 0 AND done = 1 AND completed_at >= ?", today()).n;
  const open = store.get('SELECT COUNT(*) AS n FROM tasks WHERE deleted = 0 AND done = 0').n;
  const focus = store.get('SELECT COALESCE(SUM(minutes), 0) AS m FROM focus_sessions WHERE deleted = 0 AND completed = 1 AND started_at >= ?', today()).m;
  const mail = store.getSetting('mailTriage', null)?.needs_you?.length || 0;
  const parts = [];
  if (a?.total_minutes) {
    const top = a.apps.filter((x) => x.minutes >= 5).slice(0, 3).map((x) => x.label);
    parts.push(`Today you worked ${hm(a.productive_minutes)}${a.distracting_minutes ? ` and spent ${hm(a.distracting_minutes)} on distractions` : ''}${top.length ? `, mostly in ${top.join(', ')}` : ''}.`);
  }
  parts.push(`You finished ${done} task${done === 1 ? '' : 's'}${open ? ` and ${open} ${open === 1 ? 'is' : 'are'} still open` : ''}.`);
  if (focus) parts.push(`${hm(focus)} of focus time.`);
  if (mail) parts.push(`${mail} email${mail === 1 ? '' : 's'} still need${mail === 1 ? 's' : ''} you.`);
  return parts.join(' ');
}

/**
 * onState({ state: 'running' | 'goodbye' | 'off', ends, task, summary, title, seconds }) drives the notch.
 * power(action) shuts the PC down (tests pass a fake). clock() is Date.now (tests pass a fake).
 */
export function createSession({ store, activity, power, onState = () => {}, clock = Date.now, countdownMs = 60_000 }) {
  let goodbye = null; // { at } while counting down to shutdown
  const saved = () => store.getSetting('workSession', null);
  const title = () => store.getSetting('userTitle', 'boss');
  const off = () => { store.setSetting('workSession', null); goodbye = null; onState({ state: 'off' }); };

  return {
    status() {
      const s = saved();
      if (!s) return { running: false };
      return { running: true, task: s.task, ends: new Date(s.ends).toISOString(), minutes_left: Math.max(0, Math.round((s.ends - clock()) / 60_000)), shutdown: s.shutdown, saying_goodbye: !!goodbye };
    },
    start(minutes, task = 'work', shutdown = true) {
      if (!(minutes > 0 && minutes <= 12 * 60)) throw new Error('A work timer is 1 minute to 12 hours.');
      const s = { ends: clock() + minutes * 60_000, task, shutdown };
      store.setSetting('workSession', s);
      goodbye = null;
      onState({ state: 'running', ...this.status() });
      return { ...this.status(), note: shutdown ? 'The PC shuts down when it ends, after a 1 minute warning.' : 'Maya will tell you when it ends.' };
    },
    /** "I'm still working": more time, the shutdown stays planned. */
    extend(minutes = 15) {
      const s = saved();
      if (!s) return { running: false };
      store.setSetting('workSession', { ...s, ends: Math.max(s.ends, clock()) + minutes * 60_000 });
      goodbye = null;
      onState({ state: 'running', ...this.status() });
      return this.status();
    },
    cancel() { const was = !!saved(); off(); return { cancelled: was }; },
    /** Every few seconds from main: time up → goodbye; goodbye over → shut down. */
    async tick() {
      const s = saved();
      if (!s || clock() < s.ends) return null;
      // Ended long ago (the PC was off or asleep): never shut down a PC the user has just switched on.
      if (!goodbye && clock() - s.ends > 10 * 60_000) { off(); return 'expired'; }
      if (!s.shutdown) { onState({ state: 'done', task: s.task, summary: daySummary(store, activity), title: title() }); off(); return 'done'; }
      if (!goodbye) {
        goodbye = { at: clock() + countdownMs };
        onState({ state: 'goodbye', task: s.task, summary: daySummary(store, activity), title: title(), seconds: Math.round(countdownMs / 1000) });
        return 'goodbye';
      }
      if (clock() < goodbye.at) return null;
      off();
      await power('shutdown');
      return 'shutdown';
    },
  };
}
