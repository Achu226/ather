// Countdown timers ("set a timer for 10 minutes"). notify() rings and speaks when one ends; onChange(list) keeps the
// timer badge on Maya's pill up to date.
// shortcut: timers live in memory, so restarting Maya forgets them; use reminders for anything longer than a few hours.

const fmt = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
/** "10 minutes", "30 seconds", "1 hour 30 minutes". Exported for tests. */
export const spoken = (minutes) => {
  const s = Math.round(minutes * 60), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return [h && `${h} hour${h > 1 ? 's' : ''}`, m && `${m} minute${m > 1 ? 's' : ''}`, sec && `${sec} second${sec > 1 ? 's' : ''}`].filter(Boolean).join(' ') || '0 seconds';
};

export function createTimers({ notify, onChange = () => {}, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout }) {
  const timers = new Map();
  let next = 1;
  const list = () => [...timers.values()].map(({ id, label, ends }) => ({ id, label, ends, left: fmt(ends - now()) }));
  return {
    start(minutes, label = '') {
      if (!(minutes > 0) || minutes > 24 * 60) return { error: 'A timer can run from a few seconds up to 24 hours.' };
      const id = next++;
      const ends = now() + minutes * 60_000;
      const handle = setTimer(() => {
        timers.delete(id);
        notify('Timer done', `${label ? `${label}: ` : ''}your ${spoken(minutes)} timer is up.`, 'timer');
        onChange(list());
      }, minutes * 60_000);
      timers.set(id, { id, label, ends, handle });
      onChange(list());
      return { id, label, minutes, ends_at: new Date(ends).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: minutes < 1 ? '2-digit' : undefined }) };
    },
    cancel(id) {
      const t = id ? timers.get(id) : [...timers.values()].at(-1);
      if (!t) return { error: 'No timer is running.' };
      clearTimer(t.handle);
      timers.delete(t.id);
      onChange(list());
      return { cancelled: t.id, label: t.label };
    },
    list,
  };
}
