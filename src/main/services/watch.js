// Watch a website (as in OpenClaw's monitoring): Maya re-reads a page every few hours and tells the user (desktop
// notification, and Telegram when paired) when its text changes: exam results, a notice, a price.
// The first check only remembers the page; a page that cannot be opened is noted on that watch and the rest go on.

const HOUR = 3600_000;
const MAX = 20;
const lines = (text) => String(text || '').split(/\n+/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);

/** Lines on the page now that were not there before (exported for tests). */
export const newLines = (before, after) => { const old = new Set(lines(before)); return lines(after).filter((l) => !old.has(l)); };

/** read(url) → { title, text } (services/web.js readPage); notify(title, body) shows the alert. */
export function createWatches({ store, read, notify, now = () => Date.now() }) {
  const all = () => store.getSetting('webWatches', []);
  const save = (list) => store.setSetting('webWatches', list);

  async function check(w) {
    try {
      const { text } = await read(w.url, 20000);
      if (w.text !== undefined && w.text !== text) {
        const added = newLines(w.text, text).slice(0, 3).map((l) => l.slice(0, 160));
        notify(`🔔 ${w.what} changed`, `${added.length ? `New: ${added.join(' / ')}` : 'Something on the page changed.'}\n${w.url}`);
      }
      return { ...w, text, checked: now(), error: null };
    } catch (e) {
      return { ...w, checked: now(), error: e.message };
    }
  }

  return {
    list: () => all().map(({ text, ...w }) => w), // the page text stays inside
    add({ url, what, every_hours = 6 }) {
      if (!/^https?:\/\/[^\s/]+\.[^\s]+/i.test(String(url || '').trim())) throw new Error('Give the full web address, starting with http:// or https://');
      url = url.trim();
      const list = all();
      const same = list.find((w) => w.url === url);
      if (same) return same;
      if (list.length >= MAX) throw new Error(`Maya already watches ${MAX} pages; remove one first.`);
      const w = { id: String(Math.max(0, ...list.map((x) => Number(x.id) || 0)) + 1), url, what: String(what || url).slice(0, 80),
        every_hours: Math.min(168, Math.max(1, Math.round(Number(every_hours) || 6))), checked: null, error: null };
      save([...list, w]);
      return w;
    },
    remove(id) { const list = all(); save(list.filter((w) => w.id !== String(id))); return { removed: list.length - all().length }; },
    /** Checks every watch that is due; call it every few minutes. */
    async tick() {
      const list = all();
      const due = (w) => w.checked === null || now() - w.checked >= w.every_hours * HOUR;
      if (!list.some(due)) return 0;
      const next = [];
      let checked = 0;
      for (const w of list) next.push(due(w) ? (checked++, await check(w)) : w);
      // A watch removed while checking stays removed.
      const ids = new Set(all().map((w) => w.id));
      save(next.filter((w) => ids.has(w.id)));
      return checked;
    },
  };
}
