// Which apps/sites the user spends time in (local only, app/site names, never full window titles),
// and focus blocking: distracting apps get a nudge (and are minimised) during a focus session.
const SAMPLE_SECONDS = 5;
const IDLE_AFTER = 120; // seconds without input = away, not counted

export const DEFAULT_CATEGORIES = {
  YouTube: 'distracting', Instagram: 'distracting', Netflix: 'distracting', Facebook: 'distracting', X: 'distracting', Twitter: 'distracting',
  Reddit: 'distracting', 'Prime Video': 'distracting', Hotstar: 'distracting', 'JioCinema': 'distracting', Steam: 'distracting', Twitch: 'distracting',
  'VS Code': 'productive', Word: 'productive', Excel: 'productive', PowerPoint: 'productive', 'IntelliJ IDEA': 'productive', PyCharm: 'productive',
  Maya: 'productive', OneNote: 'productive', Terminal: 'productive', GitHub: 'productive', 'Google Docs': 'productive', 'Stack Overflow': 'productive',
  'Google Classroom': 'productive', Coursera: 'productive', LeetCode: 'productive', GeeksforGeeks: 'productive',
};

export const categoryOf = (label, custom = {}) => custom[label] ?? DEFAULT_CATEGORIES[label] ?? 'neutral';

const today = () => new Date().toLocaleDateString('en-CA');

export function createActivity({ store, pc, idleSeconds, onDistracted = () => {}, onSample = () => {} }) {
  const lastNudge = new Map();

  function record({ app, label }, seconds = SAMPLE_SECONDS, at = new Date()) {
    store.run(`INSERT INTO activity (day, hour, app, label, seconds) VALUES (?,?,?,?,?)
      ON CONFLICT(day, hour, app, label) DO UPDATE SET seconds = seconds + excluded.seconds`,
    at.toLocaleDateString('en-CA'), at.getHours(), app, label, seconds);
  }

  function activeFocus() {
    const s = store.get('SELECT * FROM focus_sessions WHERE deleted = 0 AND ended_at IS NULL ORDER BY id DESC LIMIT 1');
    return s && Date.now() - Date.parse(s.started_at) < s.minutes * 60_000 ? s : null;
  }

  async function tick() {
    if (!store.getSetting('activityTracking', true) || idleSeconds() > IDLE_AFTER) return;
    const sample = await pc.foreground().catch(() => null);
    if (!sample?.process || sample.process === 'LockApp') return;
    onSample(sample);
    record(sample);
    const focus = activeFocus();
    if (focus && categoryOf(sample.label, store.getSetting('appCategories', {})) === 'distracting') {
      if (Date.now() - (lastNudge.get(sample.label) || 0) < 60_000) return;
      lastNudge.set(sample.label, Date.now());
      onDistracted(sample, focus);
    }
  }

  /** Minutes per app/site for a day, with productive / distracting totals. */
  function summary(day = today()) {
    const custom = store.getSetting('appCategories', {});
    const rows = store.all('SELECT label, app, SUM(seconds) AS s FROM activity WHERE day = ? GROUP BY label ORDER BY s DESC', day);
    const items = rows.map((r) => ({ label: r.label, app: r.app, minutes: Math.round(r.s / 60), category: categoryOf(r.label, custom) }));
    const total = (c) => items.filter((i) => !c || i.category === c).reduce((n, i) => n + i.minutes, 0);
    const byHour = Array(24).fill(0);
    for (const r of store.all('SELECT hour, SUM(seconds) AS s FROM activity WHERE day = ? GROUP BY hour', day)) byHour[r.hour] = Math.round(r.s / 60);
    return { day, total_minutes: total(), productive_minutes: total('productive'), distracting_minutes: total('distracting'), apps: items.slice(0, 15), minutes_by_hour: byHour };
  }

  /** Last 7 days: productive vs distracting minutes per day. */
  function week() {
    return [...Array(7)].map((_, i) => {
      const day = new Date(Date.now() - (6 - i) * 864e5).toLocaleDateString('en-CA');
      const s = summary(day);
      return { day, productive: s.productive_minutes, distracting: s.distracting_minutes, total: s.total_minutes };
    });
  }

  let timer = null;
  return {
    record, summary, week, tick,
    start() { timer ??= setInterval(() => tick().catch(() => {}), SAMPLE_SECONDS * 1000); },
    stop() { clearInterval(timer); timer = null; },
  };
}
