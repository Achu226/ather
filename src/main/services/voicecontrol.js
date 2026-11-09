// Runs direct commands for people who can only speak or press one switch: number labels or a grid over the screen,
// clicking, scrolling, keys and typing, switch scanning, reading aloud, the on-screen keyboard and the SOS alarm,
// always in the app the user is working in (never in Maya itself).
import { cellCenter, toSendKeys } from '../tools/computer.js';
import { createScanner } from './scanning.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// UI Automation control types, as a person would say them.
const KINDS = { Button: 'button', Hyperlink: 'link', Edit: 'text box', Text: 'text', CheckBox: 'tick box', RadioButton: 'option', ComboBox: 'drop-down list',
  MenuItem: 'menu item', ListItem: 'list item', TabItem: 'tab', Image: 'picture', Slider: 'slider', Document: 'page', TreeItem: 'item', DataItem: 'cell' };
const REPEATABLE =new Set(['scroll', 'keys', 'click', 'cell', 'drag', 'magnify', 'page', 'minimize']);
const READ_LIMIT = 1500; // about a minute of speech; "read" again continues later
// Windows Magnifier keys (virtual-key codes): Win + Plus / Minus / Esc, Ctrl + Alt + L / F / D for the view.
const MAGNIFIER = { in: [0x5b, 0xbb], out: [0x5b, 0xbd], off: [0x5b, 0x1b], lens: [0x11, 0x12, 0x4c], full: [0x11, 0x12, 0x46], docked: [0x11, 0x12, 0x44] };

/** A document split into spoken pages of about a minute each, cut at a paragraph or sentence (exported for tests). */
export function pages(text, size = READ_LIMIT) {
  const clean = String(text).replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  const out = [];
  for (let at = 0; at < clean.length;) {
    const part = clean.slice(at, at + size);
    const cut = at + size < clean.length ? Math.max(part.lastIndexOf('\n'), part.lastIndexOf('. '), size / 2) + 1 : part.length;
    out.push(part.slice(0, cut).trim());
    at += cut;
  }
  return out.filter(Boolean);
}

/**
 * overlay(data|null) draws numbers, the grid or the scan highlight; bounds() is the main screen in DIP.
 * keyboard(on) shows the on-screen keyboard; sos is services.sos; scanMs() is the scanning speed;
 * onScan(on) lets main grab/release the switch key.
 */
/** "my address" / "my home address" → the saved snippet text, or null (exported for tests). */
export function snippetFor(all, said) {
  const m = /^(?:my|our)\s+(.+?)[.!]?$/i.exec(String(said).trim());
  if (!m) return null;
  const want = m[1].toLowerCase();
  const key = Object.keys(all).find((k) => k.toLowerCase() === want) || Object.keys(all).find((k) => want.includes(k.toLowerCase()));
  return key ? all[key] : null;
}

export function createVoiceControl({ pc, overlay, computer, bounds, keyboard = () => {}, sos = null, session = null, findDoc = null, snippets = () => ({}), scanMs = () => 1200, onScan = () => {} }) {
  let mode = null; // 'numbers' | 'grid' | 'scan' | null
  let elements = [];
  let scanner = null, scanTimer = null;
  let reading = { text: '', at: 0 };
  let book = null; // { name, pages, i } while reading a document page by page
  let last = null; // the last repeatable command, for "again"
  const page = () => ({ read: `${book.pages[book.i]} … Page ${book.i + 1} of ${book.pages.length}.${book.i + 1 < book.pages.length ? ' Say "next page".' : ' That is the end.'}` });

  // The face window takes the focus while listening: hand it back to the app the user was in.
  async function toApp() {
    const fg = await pc.foreground();
    const last = computer.lastExternal();
    if (/^(Ather|Maya|electron)$/i.test(fg.process) && last) { await pc.activate(last.hwnd); await sleep(300); }
  }
  const draw = (extra = {}) => overlay({ kind: 'numbers', bounds: bounds(), items: elements.map(({ i, x, y, w, h, name }) => ({ i, x, y, w, h, name })), ...extra });
  async function showNumbers() {
    await toApp();
    elements = await pc.elements();
    draw();
    return elements.length ? `${elements.length} numbers` : 'No numbers here. Say "show grid" instead.';
  }
  // Numbers follow the screen: after an action they are drawn again for what is there now.
  const refresh = async () => { if (mode === 'numbers') { await sleep(700); await showNumbers(); } };

  // ---- switch scanning: controls light up in turn; one press picks ----
  const drawScan = () => { const { items, back } = scanner.lit; draw({ lit: items.map((e) => e.i), back }); };
  async function startScan() {
    await toApp();
    elements = await pc.elements();
    if (!elements.length) return { error: 'Nothing to scan in this window.' };
    scanner = createScanner(elements);
    mode = 'scan';
    clearInterval(scanTimer);
    scanTimer = setInterval(() => { scanner.next(); drawScan(); }, scanMs());
    drawScan();
    onScan(true);
    return { said: 'Scanning. Press your switch when the right box lights up.' };
  }
  function stopScan() {
    clearInterval(scanTimer);
    scanner = null;
    if (mode === 'scan') { mode = null; overlay(null); }
    onScan(false);
  }

  const api = {
    get mode() { return mode; },
    /** The switch (key, "select", or mouth-open in head mouse) was pressed while scanning. */
    async press() {
      if (!scanner) return { error: 'Say "start scanning" first.' };
      const chosen = scanner.press();
      if (!chosen) { drawScan(); return { said: 'Ok' }; }
      await toApp();
      await pc.invoke(chosen.i);
      await sleep(700);
      await startScan(); // the screen may have changed: scan what is there now
      return { said: `Picked ${chosen.name || chosen.i}` };
    },
    async run(c) {
      // "Again": the last action once more (scroll, keys, click, drag, page…).
      if (c.cmd === 'again') {
        if (!last) return { error: 'There is nothing to repeat yet.' };
        c = last;
      } else if (REPEATABLE.has(c.cmd)) last = c;
      switch (c.cmd) {
        case 'numbers': stopScan(); mode = 'numbers'; return { said: await showNumbers() };
        case 'whatis': {
          const e = await pc.atPointer();
          if (!e.name && !e.value) return { read: `That is ${KINDS[e.kind] ? `a ${KINDS[e.kind]}` : 'an empty part of the screen'} with no label.` };
          return { read: [`${KINDS[e.kind] ? `${KINDS[e.kind][0].toUpperCase()}${KINDS[e.kind].slice(1)}` : 'It says'}: ${e.name}`, e.value?.trim() && e.value.trim() !== e.name ? `It contains: ${e.value.trim().slice(0, 300)}` : '', e.hint].filter(Boolean).join('. ') };
        }
        case 'drag': {
          // Between two numbered controls, or two grid cells.
          const at = (n, cell) => (cell ? cellCenter(cell, bounds()) : elements.find((e) => e.i === n));
          const a = at(c.from, c.fromCell), b = at(c.to, c.toCell);
          if (!a || !b) return { error: c.fromCell ? 'Grid cells go from A1 to P10.' : 'Say "show numbers" first, then "drag 3 to 7".' };
          await toApp();
          await pc.drag(a.x, a.y, b.x, b.y);
          await refresh();
          return { said: 'Dragged' };
        }
        case 'grid': stopScan(); mode = 'grid'; overlay({ kind: 'grid', bounds: bounds() }); return { said: 'Grid' };
        case 'hide': stopScan(); mode = null; overlay(null); return { said: 'Hidden' };
        case 'click': {
          const el = elements.find((e) => e.i === c.n);
          if (!el) return { error: mode === 'numbers' ? `There is no number ${c.n}.` : 'Say "show numbers" first.' };
          await toApp();
          if (c.right || c.double) { await pc.click(el.x, el.y, c.right ? 'right' : 'left'); if (c.double) await pc.click(el.x, el.y); } else await pc.invoke(c.n);
          await refresh();
          return { said: `Clicked ${c.n}` };
        }
        case 'cell': {
          const p = cellCenter(c.cell, bounds());
          if (!p) return { error: 'Grid cells go from A1 to P10.' };
          await toApp();
          await pc.click(p.x, p.y, c.right ? 'right' : 'left');
          if (c.double) await pc.click(p.x, p.y);
          return { said: `Clicked ${c.cell}` };
        }
        case 'scroll': await toApp(); await pc.scroll((c.direction === 'up' ? 120 : -120) * (c.amount || 5)); await refresh(); return { said: `Scrolled ${c.direction}` };
        case 'keys': await toApp(); await pc.keys(toSendKeys(c.keys)); await refresh(); return { said: c.keys };
        case 'type': {
          // "Type my address": a saved snippet instead of the words themselves.
          const saved = snippetFor(snippets(), c.text);
          await toApp();
          await pc.type(saved ?? c.text);
          return { said: saved ? 'Typed it' : 'Typed' };
        }
        case 'minimize': await toApp(); await pc.minimizeForeground(); await refresh(); return { said: 'Minimised' };
        case 'scan': return c.on ? startScan() : (stopScan(), { said: 'Scanning stopped' });
        case 'switch': return api.press();
        case 'keyboard': keyboard(c.on); return { said: c.on ? 'Keyboard open' : 'Keyboard closed' };
        case 'read': {
          // "Read" again on the same window continues where the last part stopped.
          await toApp();
          const text = String(await pc.readText()).replace(/\s+\n/g, '\n').trim();
          if (!text) return { error: 'I cannot find any text to read in this window.' };
          if (text !== reading.text) reading = { text, at: 0 };
          const part = reading.text.slice(reading.at, reading.at + READ_LIMIT);
          const cut = part.length === READ_LIMIT ? Math.max(part.lastIndexOf('. '), part.lastIndexOf('\n'), 200) + 1 : part.length;
          reading.at += cut;
          const more = reading.at < reading.text.length;
          return { read: part.slice(0, cut).trim() + (more ? ' … Say "read" to continue.' : '') };
        }
        case 'sos': return sos ? { said: 'Getting help', ...sos.trigger('asked for help by voice') } : { error: 'Emergency help is not set up.' };
        // "cancel" / "I'm okay" only matters while an alarm is counting down; otherwise it is a normal sentence.
        case 'cancel':
          if (sos?.pending) { sos.cancel(); return { said: 'Cancelled. I am glad you are okay.' }; }
          if (session?.status().saying_goodbye) { session.cancel(); return { said: 'Okay, I will not shut down. The work timer is off.' }; }
          return { pass: true };
        case 'later': return session?.status().saying_goodbye ? (session.extend(15), { said: 'Okay, 15 more minutes.' }) : { pass: true };
        case 'magnify': {
          // Releasing the Windows key leaves the taskbar focused: give the focus back to the user's app.
          await toApp();
          const before = await pc.foreground();
          await pc.chord(...MAGNIFIER[c.action]);
          await sleep(500);
          if ((await pc.foreground()).hwnd !== before.hwnd) await pc.activate(before.hwnd);
          return { said: { in: 'Magnifying', out: 'Less', off: 'Magnifier off' }[c.action] || 'Ok' };
        }
        case 'readdoc': {
          const doc = await findDoc?.(c.name);
          if (!doc?.text?.trim()) return { error: `I could not find a document called ${c.name} with text in it.` };
          book = { name: doc.name, pages: pages(doc.text), i: 0 };
          return { read: `${doc.name}. ${page().read}` };
        }
        case 'page': {
          if (!book) return { error: 'Say "read my document" and its name first.' };
          if (c.go === 'stop') { book = null; return { said: 'Stopped reading.' }; }
          const i = c.go === 'next' ? book.i + 1 : c.go === 'previous' ? book.i - 1 : c.go === 'repeat' ? book.i : c.go - 1;
          if (i < 0 || i >= book.pages.length) return { error: `There are ${book.pages.length} pages.` };
          book.i = i;
          return page();
        }
        default: return { error: `Unknown command ${c.cmd}` };
      }
    },
  };
  return api;
}
