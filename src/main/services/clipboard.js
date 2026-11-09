// Recent copied text, kept in memory only (never written to disk). Passwords and anything a password
// manager marks as private are skipped. Electron 45's clipboard is async, so reads are awaited.
import { SECRET } from '../tools/assistant.js';

// Windows formats password managers set so clipboard history tools ignore the copy.
const PRIVATE_FORMATS = ['ExcludeClipboardContentFromMonitorProcessing'];
/** One "word" of 8-64 chars mixing 3+ of upper/lower/digit/symbol looks like a password. */
export const looksLikePassword = (t) => !/\s/.test(t) && t.length >= 8 && t.length <= 64 && !/^https?:/.test(t)
  && [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(t)).length >= 3;

export function createClipboardHistory({ clipboard, max = 40, every = 1000, enabled = () => true }) {
  let items = [];
  let last = null;
  let timer = null;
  const isPrivate = async () => (await Promise.all(PRIVATE_FORMATS.map((f) => clipboard.has(f)))).some(Boolean);

  async function check() {
    if (!enabled()) { items = []; return; }
    const text = await clipboard.readText();
    if (!text || text === last) return;
    last = text;
    if (await isPrivate() || SECRET.test(text) || looksLikePassword(text.trim()) || text.length > 20_000) return;
    items = [{ text, at: new Date().toISOString() }, ...items.filter((i) => i.text !== text)].slice(0, max);
  }

  return {
    check,
    start() { timer ??= setInterval(() => check().catch(() => {}), every); },
    stop() { clearInterval(timer); timer = null; },
    list: () => items,
    clear() { items = []; return true; },
  };
}
