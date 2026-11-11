// Computer control: Maya works in other apps through Windows UI Automation (named buttons and fields),
// after the user allows it once per task. Esc stops it. ctx.services.computer holds the session and log.
const str = (description) => ({ type: 'string', description });
const int = (description) => ({ type: 'integer', description });
const obj = (properties, required = []) => ({ type: 'object', properties, required });

const SESSION_MS = 10 * 60_000;
const SPECIAL = { enter: '{ENTER}', tab: '{TAB}', esc: '{ESC}', escape: '{ESC}', backspace: '{BACKSPACE}', delete: '{DELETE}', up: '{UP}', down: '{DOWN}',
  left: '{LEFT}', right: '{RIGHT}', home: '{HOME}', end: '{END}', pageup: '{PGUP}', pagedown: '{PGDN}', space: ' ', f5: '{F5}', f4: '{F4}', f2: '{F2}' };

/** "ctrl+s" → "^s", "alt+f4" → "%{F4}", "enter" → "{ENTER}" (SendKeys syntax). Exported for tests. */
export function toSendKeys(combo) {
  return String(combo).split(/\s+/).map((part) => {
    const keys = part.toLowerCase().split('+');
    const key = keys.pop();
    const mods = keys.map((m) => ({ ctrl: '^', control: '^', alt: '%', shift: '+', win: '^{ESC}' }[m] || '')).join('');
    const k = SPECIAL[key] || (/^f\d{1,2}$/.test(key) ? `{${key.toUpperCase()}}` : key.length === 1 ? key.replace(/[+^%~(){}[\]]/g, '{$&}') : `{${key.toUpperCase()}}`);
    return mods + k;
  }).join('');
}

// A lettered grid over the screen, so Maya (or a user speaking) can point anywhere: "D7".
const COLS = 16, ROWS = 10;
/** "D7" → centre of that grid cell in screen coordinates, or null. Exported for tests. */
export function cellCenter(cell, { x = 0, y = 0, width, height }) {
  const m = /^([A-P])\s*(10|[1-9])$/i.exec(String(cell).trim());
  if (!m) return null;
  const col = m[1].toUpperCase().charCodeAt(0) - 65, row = Number(m[2]) - 1;
  return { x: Math.round(x + ((col + 0.5) * width) / COLS), y: Math.round(y + ((row + 0.5) * height) / ROWS) };
}

/** Screenshot with the grid and every control's number drawn on it, scaled for the model. */
export async function annotate(dataUrl, elements, bounds) {
  const { default: sharp } = await import('sharp');
  const img = Buffer.from(dataUrl.split(',')[1], 'base64');
  const { width: W, height: H } = await sharp(img).metadata();
  const sx = W / bounds.width, sy = H / bounds.height;
  const esc = (s) => String(s).replace(/[<&>]/g, (c) => ({ '<': '&lt;', '&': '&amp;', '>': '&gt;' })[c]);
  let svg = '';
  for (let c = 0; c < COLS; c++) {
    const x = (c * W) / COLS;
    svg += `<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="#00b7ff" stroke-opacity=".35"/><text x="${x + 4}" y="14" font-size="13" font-family="Arial" font-weight="700" fill="#00b7ff">${String.fromCharCode(65 + c)}</text>`;
  }
  for (let r = 0; r < ROWS; r++) {
    const y = (r * H) / ROWS;
    svg += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="#00b7ff" stroke-opacity=".35"/><text x="3" y="${y + 28}" font-size="13" font-family="Arial" font-weight="700" fill="#00b7ff">${r + 1}</text>`;
  }
  for (const e of elements.slice(0, 120)) {
    const x = (e.x - (e.w || 0) / 2 - bounds.x) * sx, y = (e.y - (e.h || 0) / 2 - bounds.y) * sy;
    if (x < 0 || y < 0 || x > W || y > H) continue;
    const label = esc(e.i), w = 8 + label.length * 8;
    svg += `<rect x="${x}" y="${y}" width="${(e.w || 0) * sx}" height="${(e.h || 0) * sy}" fill="none" stroke="#ffcc00" stroke-opacity=".8"/><rect x="${x}" y="${y}" width="${w}" height="16" fill="#ffcc00"/><text x="${x + 4}" y="${y + 12}" font-size="12" font-family="Arial" font-weight="700" fill="#000">${label}</text>`;
  }
  // Two steps: sharp would otherwise resize before compositing, and the full-size overlay would not fit.
  const marked = await sharp(img).composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${svg}</svg>`) }]).png().toBuffer();
  const out = await sharp(marked).resize({ width: Math.min(W, 1280) }).jpeg({ quality: 70 }).toBuffer();
  return `data:image/jpeg;base64,${out.toString('base64')}`;
}

const controlList = (elements) => elements.map((e) => `${e.i} ${e.type}${e.password ? ' (password)' : ''}: ${e.name}`).join('\n');

/** After an action: wait for the screen to settle, then report what the window shows now (Maya "looks back"). */
async function lookAgain(pc) {
  await new Promise((r) => setTimeout(r, 300));
  const fg = await pc.foreground();
  const elements = await pc.elements();
  return { window_now: fg.title, controls_now: controlList(elements).slice(0, 2500) || 'No named controls; use computer_look for a picture.' };
}

export function createComputerSession() {
  const s = { until: 0, task: '', target: null, lastExternal: null, log: [] };
  return {
    get active() { return Date.now() < s.until; },
    start(task) {
      s.until = Date.now() + SESSION_MS; s.task = task; s.target ??= s.lastExternal;
      s.log.unshift({ at: new Date().toISOString(), action: 'start', detail: task });
    },
    stop(reason = 'stopped') { if (Date.now() < s.until) s.log.unshift({ at: new Date().toISOString(), action: reason, detail: s.task }); s.until = 0; s.target = null; },
    noteForeground(fg) { if (fg?.hwnd && !/^(Ather|Maya|electron)$/i.test(fg.process)) s.lastExternal = fg; },
    lastExternal: () => s.lastExternal,
    /** The window this task works in: the app Maya opened, or the one the user was in when they asked. */
    get target() { return s.target; },
    setTarget(fg) { if (fg?.hwnd && !/^(Ather|Maya|electron)$/i.test(fg.process)) s.target = fg; },
    record(action, detail) { s.log.unshift({ at: new Date().toISOString(), action, detail: String(detail).slice(0, 160) }); s.log.length = Math.min(s.log.length, 200); },
    log: () => s.log,
  };
}

/**
 * Throws unless the user allowed control for this task, and brings the task's app back to the front first:
 * an approval card or another app taking focus must never make Maya act in the wrong window.
 * A dialog of the same app (Save as…, a pop-up) is followed instead.
 */
async function ready({ services }) {
  const c = services.computer;
  // computer_start shows the permission card itself (click or spoken "yes"), so asking in text first only adds a step.
  if (!c?.active) throw new Error('Computer control is not on. Call computer_start right now: it asks the user for permission itself. Do not ask in text first.');
  let fg = await services.pc.foreground();
  const target = c.target || c.lastExternal();
  if (target && fg.process !== target.process) {
    await services.pc.activate(target.hwnd);
    await new Promise((r) => setTimeout(r, 400));
    fg = await services.pc.foreground();
    if (fg.process !== target.process) throw new Error(`Could not bring ${target.app || target.process} back to the front. Use computer_open to open it again.`);
  }
  c.setTarget(fg);
  return services.pc;
}

export const computerTools = [
  {
    name: 'computer_start',
    description: 'Ask to control the mouse and keyboard to do a task in other apps (e.g. "open WhatsApp and message Rahul", "fill this form"). The user approves once; control ends after 10 minutes, when done, or when they press Esc. Never use it for payments, passwords or posting publicly without asking.',
    confirm: true,
    parameters: obj({ task: str('What you are going to do, in one sentence') }, ['task']),
    run: ({ task }, { services }) => {
      services.computer.start(task);
      services.onComputerStart?.(task);
      return { allowed: true, minutes: 10, how: 'Work like a careful person. computer_look shows a screenshot with numbered controls and a lettered grid. '
        + 'Act with computer_click / computer_type / computer_keys; each one looks again and tells you what the window shows now. '
        + 'If a step did not work, try another way (another control, a grid cell, a keyboard shortcut, computer_open), up to 3 tries, '
        + 'then tell the user what blocked you. The user asked for this to happen on the screen: do not answer with web_search instead. '
        + 'Grid cells go from A1 to P10. Never delete, clear or replace text or files that were already there unless the user asked. '
        + 'Call computer_done at the end.' };
    },
  },
  {
    name: 'computer_look',
    description: 'See the active window: a screenshot (yellow numbers mark controls, a blue lettered grid covers the screen) plus the numbered list of buttons, fields and links. Use the numbers, or a grid cell like "D7", with computer_click and computer_type.',
    parameters: obj({}),
    run: async (_, ctx) => {
      const pc = await ready(ctx);
      const fg = await pc.foreground();
      const elements = await pc.elements();
      ctx.services.computer.record('look', `${fg.title} (${elements.length} controls)`);
      const shot = ctx.services.screen?.capture ? await ctx.services.screen.capture() : null;
      const bounds = ctx.services.screen?.bounds?.();
      return {
        window: fg.title, app: fg.app,
        controls: controlList(elements) || 'No named controls in this app: use the picture and click grid cells, or keyboard shortcuts.',
        ...(shot && bounds ? { attachImage: await annotate(shot, elements, bounds) } : {}),
      };
    },
  },
  {
    name: 'computer_click',
    description: 'Click a control by its number from computer_look (best), or a grid cell from the picture (e.g. "D7"). Afterwards you get what the window shows now.',
    parameters: obj({ element: int('Control number from computer_look'), cell: str('Grid cell, e.g. "D7", when the thing has no number'),
      right: { type: 'boolean', description: 'Right-click' }, double: { type: 'boolean', description: 'Double-click' } }),
    run: async ({ element, cell, right, double }, ctx) => {
      const pc = await ready(ctx);
      let r;
      if (element !== undefined && element !== null) r = await pc.invoke(element);
      else {
        const p = cell && ctx.services.screen?.bounds ? cellCenter(cell, ctx.services.screen.bounds()) : null;
        if (!p) return { error: 'Give a control number, or a grid cell from A1 to P10.' };
        r = await pc.click(p.x, p.y, right ? 'right' : 'left');
        if (double) r = await pc.click(p.x, p.y, 'left');
      }
      ctx.services.computer.record('click', element ?? `cell ${cell}`);
      return { done: r, ...(await lookAgain(pc)) };
    },
  },
  {
    name: 'computer_type',
    description: 'Type text like a person (any language, e.g. Tamil): into a field by its number, or, without a number, wherever the cursor is (click the field first). Never types into password fields. Afterwards you get what the window shows now.',
    parameters: obj({ element: int('Field number from computer_look (optional)'), text: str('Text to type'), enter: { type: 'boolean', description: 'Press Enter after typing (send/search)' } }, ['text']),
    run: async ({ element, text, enter }, ctx) => {
      const pc = await ready(ctx);
      const r = element !== undefined && element !== null ? await pc.setText(element, text) : await pc.type(text);
      if (enter) await pc.keys('{ENTER}');
      ctx.services.computer.record('type', `${text.length} characters${element !== undefined ? ` into control ${element}` : ''}${enter ? ' + Enter' : ''}`);
      return { done: r, ...(await lookAgain(pc)) };
    },
  },
  {
    name: 'computer_keys',
    description: 'Press keys in the active app, e.g. "enter", "ctrl+s", "ctrl+f", "alt+tab", "tab tab enter". Afterwards you get what the window shows now.',
    parameters: obj({ keys: str('Keys separated by spaces; combine with +') }, ['keys']),
    run: async ({ keys }, ctx) => {
      const pc = await ready(ctx);
      await pc.keys(toSendKeys(keys));
      ctx.services.computer.record('keys', keys);
      return { pressed: keys, ...(await lookAgain(pc)) };
    },
  },
  {
    name: 'computer_scroll',
    description: 'Scroll the active window up or down.',
    parameters: obj({ direction: { type: 'string', enum: ['up', 'down'] }, amount: int('Notches, default 5') }, ['direction']),
    run: async ({ direction, amount = 5 }, ctx) => { const pc = await ready(ctx); await pc.scroll((direction === 'up' ? 120 : -120) * amount); ctx.services.computer.record('scroll', direction); return { scrolled: direction }; },
  },
  {
    name: 'computer_open',
    description: 'Open an app and make it the active window for computer control.',
    parameters: obj({ app: str('App name') }, ['app']),
    run: async ({ app }, ctx) => {
      // Opening an app needs no permission (same as pc_open_app); only acting inside it does.
      const before = await ctx.services.pc.foreground().catch(() => null);
      const r = await ctx.services.pc.openApp(app);
      // Wait until the new window is in front (up to 4 s) instead of a fixed 2.5 s.
      let fg = before;
      for (let t = 0; t < 4000 && (!fg || fg.hwnd === before?.hwnd); t += 250) {
        await new Promise((res) => setTimeout(res, 250));
        fg = await ctx.services.pc.foreground().catch(() => fg);
      }
      await new Promise((res) => setTimeout(res, 300)); // let it draw its controls
      fg = await ctx.services.pc.foreground();
      ctx.services.computer.noteForeground(fg);
      ctx.services.computer.setTarget(fg);
      ctx.services.computer.record('open', app);
      return { ...r, active_window: fg.title };
    },
  },
  {
    name: 'computer_done',
    description: 'Finish computer control and give the mouse and keyboard back to the user.',
    parameters: obj({ summary: str('What was done') }),
    run: ({ summary = 'done' }, { services }) => { services.computer.record('done', summary); services.computer.stop('done'); services.onComputerStop?.(); return { ended: true }; },
  },
];
