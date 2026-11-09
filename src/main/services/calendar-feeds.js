// Read-only Google / Outlook / Apple calendars through their private iCal (.ics) links.
import ical from 'node-ical';

export const localIso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

export function createCalendarFeeds({ store }) {
  let cache = { at: 0, key: '', items: [] };

  async function load() {
    const feeds = store.getSetting('calendarFeeds', []);
    const key = JSON.stringify(feeds);
    if (cache.key === key && Date.now() - cache.at < 10 * 60_000) return cache.items;
    const items = [];
    for (const feed of feeds) {
      try {
        const data = await ical.async.fromURL(feed.url.replace(/^webcal:/i, 'https:'));
        for (const ev of Object.values(data)) if (ev.type === 'VEVENT') items.push({ ev, source: feed.name || 'Calendar' });
      } catch { /* one broken feed should not hide the others */ }
    }
    cache = { at: Date.now(), key, items };
    return items;
  }

  /** Events between two YYYY-MM-DD dates, recurring ones expanded. */
  async function events(from, to) {
    const start = new Date(`${from}T00:00`), end = new Date(`${to}T23:59`);
    const out = [];
    for (const { ev, source } of await load()) {
      const length = ev.end ? ev.end - ev.start : 0;
      const starts = ev.rrule ? ev.rrule.between(start, end, true) : [ev.start];
      for (const s of starts) {
        if (s < start || s > end) continue;
        out.push({ title: ev.summary || '(busy)', start: localIso(s), end: length ? localIso(new Date(s.getTime() + length)) : null,
          location: ev.location || null, source });
      }
    }
    return out;
  }

  return { events, refresh: () => { cache.at = 0; } };
}
