import { app, globalShortcut, Notification, shell, session, desktopCapturer, screen, powerMonitor, clipboard } from 'electron';
import { createPc } from './services/pc.js';
import { createActivity } from './services/activity.js';
import { createBriefing, briefingTick } from './services/briefing.js';
import { createLectures } from './services/lectures.js';
import sharp from 'sharp';
import { writeFileSync, rmSync } from 'node:fs';
import { createLock } from './security.js';
import { createUpdater } from './updater.js';
import { autoBackup } from './backup.js';
import { createDocs, extractText } from './services/docs.js';
import { createStudy } from './services/study.js';
import { copySelection, pasteText } from './dictation.js';
import { createTimers } from './services/timers.js';
import { MODES, LITE, setLite, isLite } from './models.js';
import { createTheme } from './theme.js';
import { createProviders } from './providers.js';
import { createMcpClient } from './services/mcp-client.js';
import { createComputerSession } from './tools/computer.js';
import { MCP_PRESETS, resolveEnv } from './services/mcp-presets.js';
import { createPython } from './services/python.js';
import { createFiles } from './services/files.js';
import { requestApproval } from './approvals.js';
import { BrowserWindow } from 'electron';
import { join, basename } from 'node:path';

/** HTML → PDF bytes with a hidden window (no scripts). */
async function printPdf(html) {
  const win = new BrowserWindow({ show: false, webPreferences: { javascript: false } });
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    return await win.webContents.printToPDF({ pageSize: 'A4', printBackground: true });
  } finally {
    win.destroy();
  }
}
import { fileURLToPath } from 'node:url';
import { openStore, now } from './store.js';
import { createTelegram } from './services/telegram.js';
import { createMl } from './ml/client.js';
import { createSecrets } from './secrets.js';
import { createWindows } from './windows.js';
import { registerIpc } from './ipc.js';
import { allTools } from './tools/index.js';
import { ensureOllama, ensureBrainModel, hasModel, pullModel } from './ollama.js';
import { systemCheck } from './services/syscheck.js';
import os from 'node:os';
import { BRAIN_MODEL, BASE_MODEL, complete, ask } from './brain.js';
import { hfModels, hfInstalled } from './ml/catalog.js';
import { webSearch, readPage } from './services/web.js';
import { createSearch } from './services/search.js';
import { createImaging } from './services/imaging.js';
import { createMail } from './services/mail.js';
import { createCalendarFeeds } from './services/calendar-feeds.js';
import { startScheduler, careTick } from './services/scheduler.js';
import { checkFollowUps, weeklyTick } from './services/work.js';
import { createWorkflows } from './services/workflows.js';
import { createClipboardHistory } from './services/clipboard.js';
import { createHealth } from './services/health.js';
import { createQa } from './services/qa.js';
import { createVoiceControl } from './services/voicecontrol.js';
import { createKeyboard } from './services/keyboard.js';
import { createSos, phoneCall } from './services/sos.js';
import { createSession, daySummary } from './services/session.js';
import { startMcp, MCP_PORT } from './services/mcp.js';
import { dataDir } from './paths.js';
import { createHoldKeys } from './services/holdkeys.js';

const icon = fileURLToPath(new URL('../../assets/icon.png', import.meta.url));

// The app is now called Maya, but Electron's own data (and the single-instance lock) stay in the old Ather
// folder, so updated copies keep everything. Tests with ATHER_DATA get their own folder and lock.
app.setPath('userData', dataDir);
if (!app.requestSingleInstanceLock()) app.quit();
app.setAppUserModelId('com.ather.assistant');

app.whenReady().then(async () => {
  const store = openStore();
  const ml = createMl();
  const secrets = createSecrets(store);
  const quit = () => { app.isQuitting = true; app.quit(); };
  // Tray actions that need services (made below) look them up when clicked.
  const windows = createWindows({ onQuit: quit, onTray: (what) => what === 'prompter' && services.prompter.set(true) });

  const services = {
    web: { search: webSearch, read: readPage },
    search: createSearch({ store, ml }),
    imaging: createImaging({ ml }),
    mail: createMail({ store, secrets }),
    calendarFeeds: createCalendarFeeds({ store }),
    face: { play: (name, message) => { windows.expand(false); windows.toNotch('face:play', { name, message }); } },
    openExternal: (url) => shell.openExternal(url),
    openPath: (path) => shell.openPath(path),
    screen: {
      /** Main screen in DIP (the coordinates the PC helper and UI Automation use). */
      bounds: () => screen.getPrimaryDisplay().bounds,
      /** Screenshot of the main screen as a JPEG data URL, with Maya's own window hidden. */
      async capture() {
        const { size } = screen.getPrimaryDisplay();
        const width = Math.min(1600, size.width);
        windows.notch?.setOpacity(0);
        try {
          await new Promise((r) => setTimeout(r, 120));
          const [source] = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width, height: Math.round((width * size.height) / size.width) } });
          return `data:image/jpeg;base64,${source.thumbnail.toJPEG(80).toString('base64')}`;
        } finally {
          windows.notch?.setOpacity(1);
        }
      },
    },
  };
  services.providers = createProviders({ store, secrets });
  services.trash = (p) => shell.trashItem(p);
  services.mcpClient = createMcpClient({ store, presets: MCP_PRESETS, resolveEnv });
  services.docs = createDocs({ store });
  services.study = createStudy({ store, docs: services.docs });
  services.python = createPython();
  services.pc = createPc({ shell, scale: () => screen.getPrimaryDisplay().scaleFactor, chromeChoice: () => store.getSetting('chromeProfile', null) });
  services.computer = createComputerSession();
  // While Maya controls the PC: a banner in the notch, and Esc takes control back at once.
  services.onComputerStart = (task) => {
    globalShortcut.register('Escape', () => { services.computer.stop('stopped with Esc'); services.onComputerStop(); });
    windows.toNotch('computer', { active: true, task });
  };
  services.onComputerStop = () => { globalShortcut.unregister('Escape'); windows.toNotch('computer', { active: false }); };
  services.activity = createActivity({
    store, pc: services.pc, idleSeconds: () => powerMonitor.getSystemIdleTime(),
    onSample: (sample) => services.computer.noteForeground(sample),
    onDistracted: async (sample, focus) => {
      windows.expand(false);
      windows.toNotch('notify', { title: 'Focus', body: `${sample.label} can wait. Back to ${focus.label} 💪`, kind: 'focus' });
      // Browsers are only minimised (closing would lose every tab); other apps follow the user's setting.
      const action = store.getSetting('focusAction', 'minimize');
      if (action === 'close' && sample.app === sample.label) services.pc.closeApp(sample.process).catch(() => {});
      else if (action !== 'nudge') services.pc.minimizeForeground().catch(() => {});
    },
  });
  services.activity.start();
  services.briefing = createBriefing({ store, services });
  services.lectures = createLectures({ store });
  services.workflows = createWorkflows({
    store,
    tools: () => [...allTools, ...services.mcpClient.tools()],
    // A getter so steps see services added later (and the approval prompt).
    ctx: { store, get services() { return { ...services, confirm: services.workflowConfirm }; } },
    confirm: (req) => services.workflowConfirm(req),
    onChange: (run) => windows.broadcast('workflow:run', run),
  });
  services.workflowConfirm = (req) => { windows.expand(true); return requestApproval(windows.notch.webContents, req); };
  setInterval(() => services.workflows.tick(), 30_000);
  services.qa = createQa({ BrowserWindow });
  services.lastVoice = Date.now(); // updated whenever the user speaks to Maya
  services.clipboard = createClipboardHistory({ clipboard, enabled: () => store.getSetting('clipboardHistory', true) });
  services.clipboard.start();
  // Accessibility (Accessibility page): dwell click, switch scanning, keyboard.
  const a11y = () => ({ dwell: 0, switchKey: 'F9', scanMs: 1200, keyboardLayout: 'en', keyboardSize: 1, ...store.getSetting('a11y', {}) });
  services.keyboard = createKeyboard({ store });
  services.sos = createSos({ store, secrets, onState: (s) => {
    windows.sos(s.state === 'cancelled' || s.state === 'off' ? null : s);
    windows.toNotch('sos', s);
  }, call: (number) => phoneCall({ pc: services.pc, open: (url) => shell.openExternal(url), number }) });
  // Maya from the phone (Telegram): its own conversation, so the chat shows up on the PC too.
  const phoneConversation = () => {
    const id = store.getSetting('phoneConversation');
    if (id && store.get('SELECT id FROM conversations WHERE id = ?', id)) return id;
    const fresh = Number(store.run('INSERT INTO conversations (title, created_at, updated_at) VALUES (?,?,?)', 'From my phone (Telegram)', now(), now()).lastInsertRowid);
    store.setSetting('phoneConversation', fresh);
    return fresh;
  };
  services.telegram = createTelegram({
    store, secrets, onChange: () => windows.broadcast('data:changed'),
    answer: async (text, { confirm }) => {
      const reply = await ask({ text, store, tools: [...allTools, ...services.mcpClient.tools()], services: { ...services, confirm }, conversationId: phoneConversation(), style: 'short' });
      windows.broadcast('data:changed');
      return reply;
    },
  });
  services.telegram.start();
  // Work timer: goodbye, a minute to say "wait", then a normal shutdown (apps can still ask to save).
  // ATHER_NO_SHUTDOWN: the live tests run the whole goodbye without ever switching the PC off.
  services.session = createSession({ store, activity: services.activity,
    power: (a) => (process.env.ATHER_NO_SHUTDOWN ? (console.log(`[test] would ${a} now`), Promise.resolve()) : services.pc.power(a, 0)), onState: (s) => { windows.expand(false); windows.toNotch('session', s); } });
  setInterval(() => services.session.tick().catch(() => {}), 5_000);
  services.voiceControl = createVoiceControl({
    pc: services.pc, overlay: (d) => windows.overlay(d), computer: services.computer, bounds: () => screen.getPrimaryDisplay().bounds,
    keyboard: (on) => windows.keyboard(on ? { layout: a11y().keyboardLayout, size: a11y().keyboardSize } : null),
    sos: services.sos, session: services.session, snippets: () => store.getSetting('snippets', {}), scanMs: () => a11y().scanMs,
    // "Read my document DBMS notes": the best smart-search match that is a document.
    findDoc: async (name) => {
      const hit = (await services.search.query(name)).find((r) => /\.(pdf|docx|txt|md)$/i.test(r.path));
      return hit && { name: basename(hit.path).replace(/\.\w+$/, ''), text: await extractText(hit.path) };
    },
    // While scanning, one key anywhere is the switch (F9 by default); it is released when scanning stops.
    onScan: (on) => {
      const key = a11y().switchKey;
      if (on && !globalShortcut.isRegistered(key)) globalShortcut.register(key, () => services.voiceControl.press().catch(() => {}));
      if (!on && globalShortcut.isRegistered(key)) globalShortcut.unregister(key);
    },
  });
  services.headMouse = {
    set(on) { windows.headMouse(on ? { speed: store.getSetting('headMouseSpeed', 1), dwell: a11y().dwell, blink: a11y().blink } : null); return { on }; },
    get on() { return windows.headMouseOpen; },
  };
  services.complete = (prompt) => complete(prompt);
  // Lite brain: chosen by the user, or on first start when there is no 4 GB graphics card or under 10 GB RAM.
  // start.bat installs only the 2B on Lite laptops. If Maya's own check disagrees (other graphics cards report memory
  // differently), it would ask for a brain that is not there: use the one that is really installed.
  const onlySmallBrain = async () => !(await hasModel(BASE_MODEL).catch(() => true)) && await hasModel(LITE.base).catch(() => false);
  let lite = store.getSetting('liteBrain', null);
  if (lite === null) {
    const gpu = (await systemCheck()).checks.find((c) => c.name === 'Graphics card');
    lite = !gpu?.ok || os.totalmem() < 10e9 || await onlySmallBrain();
    store.setSetting('liteBrain', lite);
  }
  setLite(lite);
  /** Switch Lite on/off; the 2B is downloaded the first time it is needed. */
  services.useLite = async (on) => {
    setLite(on);
    if (!on || await hasModel(LITE.base) || await pullModel(LITE.base).then(() => true, () => false)) await ensureBrainModel(LITE.model, LITE.base);
  };
  // Camera eyes: a webcam photo only when asked; OCR reads printed text from it.
  services.camera = () => windows.cameraFrame();
  services.phoneCall = (number) => phoneCall({ pc: services.pc, open: (url) => shell.openExternal(url), number });
  services.ocr = async (image) => (await ml.call('ocr', image)).text || '';
  services.interpreter = (lang) => { if (lang) windows.expand(false); windows.toNotch('interpreter', lang); };
  services.pasteText = pasteText;
  // "Where is the Save button?": an arrow on screen for a few seconds.
  let pointTimer;
  services.point = (at) => {
    clearTimeout(pointTimer);
    windows.overlay({ kind: 'point', bounds: screen.getPrimaryDisplay().bounds, at });
    pointTimer = setTimeout(() => windows.overlay(null), 6000);
  };
  services.timers = createTimers({
    notify: (title, body, kind) => notify(title, body, kind), // defined further down; timers only fire later
    onChange: (list) => windows.toNotch('timers', list),
  });
  // Esc closes the teleprompter (only while it is open; computer control uses Esc too).
  const closePrompter = () => { windows.prompter(null); if (!services.computer.active) globalShortcut.unregister('Escape'); };
  services.prompter = {
    async set(on, script) {
      if (!on) { closePrompter(); return { on: false }; }
      const text = (script || await clipboard.readText()).trim();
      if (!text) return { error: 'Copy your script first (select it and press Ctrl+C), then say "start teleprompter".' };
      windows.prompter(text);
      if (!globalShortcut.isRegistered('Escape')) globalShortcut.register('Escape', closePrompter);
      return { on: true, words: text.split(/\s+/).length, how: 'It scrolls as you read aloud and waits when you pause. Esc closes it.' };
    },
  };
  services.captions = {
    set(on, { translate = false } = {}) { windows.captions(on ? { translate } : null); return { on, translate }; },
    get on() { return windows.captionsOpen; },
  };
  services.files = createFiles({ outDir: join(app.getPath('documents'), 'Maya'), imaging: services.imaging, printPdf });

  let mcpServer = null;
  let lockRef = null; // set once the PIN lock exists; agents are refused while Maya is locked
  const mcp = {
    url: `http://127.0.0.1:${MCP_PORT}/mcp`,
    set(on) {
      // Agents' risky calls are approved by the user in the notch.
      const confirm = (req) => { windows.expand(true); return requestApproval(windows.notch.webContents, req); };
      if (on && !mcpServer) mcpServer = startMcp({ tools: allTools, ctx: { store, services: { ...services, confirm }, isLocked: () => lockRef?.locked }, onCall: () => windows.broadcast('data:changed') });
      if (!on && mcpServer) { mcpServer.close(); mcpServer = null; }
    },
  };
  mcp.set(store.getSetting('mcpEnabled', false));

  const theme = createTheme({ store, windows });
  const lock = createLock({ store, onChange: (locked) => windows.broadcast('lock:changed', locked) });
  lockRef = lock;
  powerMonitor.on('lock-screen', () => lock.lock());
  setInterval(() => lock.checkIdle(powerMonitor.getSystemIdleTime()), 30_000);
  const updater = createUpdater({
    onStatus: (s) => {
      windows.broadcast('update:status', s);
      if (s.state === 'ready') windows.toNotch('notify', { title: 'Update ready', body: `Maya ${s.available} is downloaded. It installs when you restart Maya.`, kind: 'update' });
    },
  });
  if (app.isPackaged) {
    setTimeout(() => updater.check(), 30_000);
    setInterval(() => updater.check(), 6 * 3600_000);
  }
  try { autoBackup(store, join(app.getPath('documents'), 'Maya', 'Backups')); } catch { /* a failed backup must not stop Maya */ }
  // Settings changed by voice ("make the text bigger") take effect in every window at once.
  services.setSetting = (key, value) => { store.setSetting(key, value); if (key === 'theme') theme.apply(); windows.broadcast('settings:changed', key, value); };
  registerIpc({ store, ml, services, secrets, windows, mcp, theme, lock, updater });

  // Microphone for voice input, and computer sound for lectures/captions; nothing else is granted.
  const allowed = new Set(['media', 'display-capture']);
  session.defaultSession.setPermissionRequestHandler((_, permission, cb) => cb(allowed.has(permission)));
  session.defaultSession.setPermissionCheckHandler((_, permission) => allowed.has(permission));
  // "Computer audio" for online lectures: getDisplayMedia gets the screen plus Windows loopback sound (video is discarded).
  session.defaultSession.setDisplayMediaRequestHandler((_, callback) => {
    desktopCapturer.getSources({ types: ['screen'] }).then(([screenSource]) => callback({ video: screenSource, audio: 'loopback' }));
  });

  windows.create();
  theme.apply();
  services.mcpClient.startAll().then(() => windows.broadcast('data:changed'));

  if (!globalShortcut.register('Control+Space', windows.toggle)) globalShortcut.register('Control+Shift+A', windows.toggle);
  let dictating = false;
  // Hold Right Ctrl = command, hold Right Alt = dictate (Settings can turn it off). The face shows without taking
  // focus, so dictated text lands in the app the user is typing in.
  const ptt = (phase) => (mode) => { if (phase === 'start') windows.expand(false); windows.toNotch('ptt', { mode, phase }); };
  services.holdKeys = createHoldKeys({ onStart: ptt('start'), onEnd: ptt('end'), onCancel: ptt('cancel') });
  if (store.getSetting('holdToTalk', true)) services.holdKeys.start();
  globalShortcut.register('Control+Shift+Space', () => {
    dictating = !dictating;
    windows.toNotch(dictating ? 'dictate:start' : 'dictate:stop');
  });
  // Snip part of the screen and ask about it.
  let snipping = false;
  globalShortcut.register('Control+Shift+S', async () => {
    if (snipping) return;
    snipping = true;
    try {
      const display = screen.getPrimaryDisplay();
      const scale = display.scaleFactor;
      windows.notch?.setOpacity(0);
      await new Promise((r) => setTimeout(r, 120));
      const [source] = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: Math.round(display.size.width * scale), height: Math.round(display.size.height * scale) } });
      windows.notch?.setOpacity(1);
      const shot = source.thumbnail.toPNG();
      const rect = await windows.snip(`data:image/png;base64,${shot.toString('base64')}`);
      if (!rect) return;
      const crop = await sharp(shot).extract({ left: Math.round(rect.x * scale), top: Math.round(rect.y * scale), width: Math.max(1, Math.round(rect.width * scale)), height: Math.max(1, Math.round(rect.height * scale)) }).png().toBuffer();
      windows.expand(true);
      windows.toNotch('attach', `data:image/png;base64,${crop.toString('base64')}`);
    } finally {
      windows.notch?.setOpacity(1);
      snipping = false;
    }
  });

  // Explain / summarise / translate whatever text is selected in any app.
  // Clipboard history: pick something copied earlier and paste it.
  globalShortcut.register('Control+Shift+V', () => {
    windows.expand(true);
    windows.toNotch('clipboard', lock.locked ? [] : services.clipboard.list());
  });
  globalShortcut.register('Control+Alt+C', () => services.captions.set(!services.captions.on));
  globalShortcut.register('Control+Alt+H', () => services.headMouse.set(!services.headMouse.on));

  globalShortcut.register('Control+Shift+E', async () => {
    const text = await copySelection();
    windows.expand(true);
    windows.toNotch('selection', text);
  });

  const notify = (title, body, kind, id) => {
    new Notification({ title, body, icon }).show();
    windows.expand(false);
    windows.toNotch('notify', { title, body, kind, id });
    windows.broadcast('data:changed');
    // Reminders, medicine and classes also reach the phone (Telegram, when paired): the user may be away from the PC.
    if (kind === 'reminder' || kind === 'care') services.telegram.notify(`⏰ ${title}: ${body}`);
  };
  startScheduler(store, notify);
  setInterval(() => careTick(store, (reason) => services.sos.notify(reason)).then((n) => n && windows.broadcast('data:changed')).catch(() => {}), 60_000);
  // The evening "I'm okay" email to caregivers, when switched on (Accessibility page).
  setInterval(() => services.sos.dailyTick({
    summary: () => daySummary(store, services.activity),
    care: () => store.all("SELECT * FROM reminders WHERE deleted = 0 AND care = 1 AND (fired_at >= ? OR at LIKE ?)", new Date(new Date().setHours(0, 0, 0, 0)).toISOString(), `${new Date().toLocaleDateString('en-CA')}%`),
  }).catch(() => {}), 5 * 60_000);
  // Health breaks stay quiet during a focus session; they come after it.
  const health = createHealth({ store, idleSeconds: () => powerMonitor.getSystemIdleTime(), notify,
    quiet: () => !!store.get('SELECT 1 FROM focus_sessions WHERE deleted = 0 AND ended_at IS NULL') });
  setInterval(() => health.tick(), 60_000);
  // The face's eyes follow the mouse (or the head mouse) while the face is open.
  let lastLook = { x: 0, y: 0 };
  setInterval(() => {
    if (!windows.expanded || !windows.notch || windows.notch.isDestroyed()) return;
    const c = screen.getCursorScreenPoint(), b = windows.notch.getBounds();
    const clamp = (v) => Math.max(-1, Math.min(1, Math.round(v * 10) / 10));
    const look = { x: clamp((c.x - (b.x + b.width / 2)) / 500), y: clamp((c.y - (b.y + 70)) / 350) };
    if (look.x !== lastLook.x || look.y !== lastLook.y) { lastLook = look; windows.toNotch('look', look); }
  }, 100);
  // "Are you okay?" check-in: quiet means no keyboard/mouse and nothing said to Maya (voice-only users never type),
  // and, if allowed, nobody seen by the webcam (someone reading quietly is not "inactive").
  let lastSeen = Date.now();
  setInterval(() => services.sos.checkIn(Math.min(powerMonitor.getSystemIdleTime(), (Date.now() - services.lastVoice) / 1000, (Date.now() - lastSeen) / 1000)), 60_000);
  setInterval(async () => {
    const { checkin } = services.sos.settings();
    const hhmm = new Date().toTimeString().slice(0, 5);
    if (!checkin?.on || !checkin.camera || hhmm < checkin.from || hhmm > checkin.to) return;
    const file = join(os.tmpdir(), `maya-presence-${Date.now()}.jpg`);
    try {
      // The photo is only looked at for a face, on this PC, and deleted straight away.
      writeFileSync(file, Buffer.from((await services.camera()).split(',')[1], 'base64'));
      if ((await ml.call('faces', file)).length) lastSeen = Date.now();
    } catch { /* no camera: fall back to keyboard, mouse and voice */ } finally { rmSync(file, { force: true }); }
  }, 10 * 60_000);
  const isAway = () => powerMonitor.getSystemIdleTime() > 300;
  setInterval(() => briefingTick({ store, briefing: services.briefing, notify, isAway }).catch(() => {}), 60_000);
  // Email follow-ups every 30 minutes; the weekly report on Friday evening.
  setInterval(() => checkFollowUps({ store, mail: services.mail, notify }).catch(() => {}), 30 * 60_000);
  setInterval(() => weeklyTick({ store, files: services.files, notify }).catch(() => {}), 10 * 60_000);

  ensureOllama().then(async (up) => {
    if (!up) return;
    if (!isLite() && await onlySmallBrain()) store.setSetting('liteBrain', true);
    await services.useLite(store.getSetting('liteBrain', isLite()));
    await ensureBrainModel(BRAIN_MODEL, BASE_MODEL);
    await ensureBrainModel(MODES.smart.model, MODES.smart.base);
  });
  // First run: open the setup screen until the speech models are on disk.
  if (!Object.keys(hfModels).every(hfInstalled) || !store.getSetting('setupDone', false)) windows.openApp('setup');

  app.on('second-instance', () => windows.openApp('home'));
  app.on('before-quit', () => { app.isQuitting = true; ml.stop(); services.pc.stop(); services.holdKeys?.stop(); services.mcpClient.stopAll(); globalShortcut.unregisterAll(); });
});

// Maya lives in the tray: closing windows does not quit.
app.on('window-all-closed', () => {});
