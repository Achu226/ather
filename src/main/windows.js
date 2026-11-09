import { BrowserWindow, Tray, Menu, screen, nativeImage, app, ipcMain } from 'electron';
import { fileURLToPath } from 'node:url';

const root = (p) => fileURLToPath(new URL(`../../${p}`, import.meta.url));
const preload = root('src/preload/preload.cjs');
const page = (name) => root(`dist/renderer/${name}.html`);

const NOTCH_W = 480;
const NOTCH_H = 560;
const HOVER_BAND = 4; // px at the very top of the screen that opens the face
const LEAVE_DELAY = 1200;

export function createWindows({ onQuit, onTray }) {
  let notch, appWin, tray;
  let expanded = false;
  let busy = false; // renderer says: typing, thinking, listening or speaking
  let contentHeight = 120;
  let outsideSince = 0;
  let icon = root('assets/icon.png');
  let dark = false;

  const display = () => screen.getPrimaryDisplay();
  const send = (win, channel, ...args) => win && !win.isDestroyed() && win.webContents.send(channel, ...args);

  function createNotch() {
    const { bounds } = display();
    notch = new BrowserWindow({
      width: NOTCH_W, height: NOTCH_H, x: Math.round(bounds.x + bounds.width / 2 - NOTCH_W / 2), y: bounds.y,
      transparent: true, frame: false, resizable: false, movable: false, skipTaskbar: true, hasShadow: false,
      alwaysOnTop: true, fullscreenable: false, show: false, backgroundColor: '#00000000',
      webPreferences: { preload, contextIsolation: true, sandbox: false, backgroundThrottling: false },
    });
    notch.setAlwaysOnTop(true, 'screen-saver');
    notch.setVisibleOnAllWorkspaces(true);
    notch.setIgnoreMouseEvents(true, { forward: true });
    notch.loadFile(page('notch'));
    notch.once('ready-to-show', () => notch.showInactive());
    setInterval(watchPointer, 100);
  }

  function watchPointer() {
    if (!notch || notch.isDestroyed()) return;
    const p = screen.getCursorScreenPoint();
    const b = notch.getBounds();
    const center = b.x + b.width / 2;
    if (!expanded) {
      if (p.y <= display().bounds.y + HOVER_BAND && Math.abs(p.x - center) < 220) expand(false);
      return;
    }
    const inside = p.x >= b.x - 20 && p.x <= b.x + b.width + 20 && p.y <= b.y + contentHeight + 30;
    if (inside || busy || notch.isFocused()) { outsideSince = 0; return; }
    outsideSince ||= Date.now();
    if (Date.now() - outsideSince > LEAVE_DELAY) collapse();
  }

  function expand(focus) {
    expanded = true;
    outsideSince = 0;
    notch.setIgnoreMouseEvents(false);
    if (!notch.isVisible()) notch.showInactive();
    if (focus) { notch.focus(); notch.webContents.focus(); }
    send(notch, 'notch:expand', { focus });
  }

  function collapse() {
    expanded = false;
    notch.setIgnoreMouseEvents(true, { forward: true });
    if (notch.isFocused()) notch.blur();
    send(notch, 'notch:collapse');
  }

  function openApp(section = 'home') {
    if (!appWin || appWin.isDestroyed()) {
      appWin = new BrowserWindow({
        width: 1180, height: 760, minWidth: 900, minHeight: 600, show: false, title: 'Maya', backgroundColor: dark ? '#0b0b0d' : '#f6f4fb',
        icon, autoHideMenuBar: true,
        webPreferences: { preload, contextIsolation: true, sandbox: false },
      });
      appWin.loadFile(page('app'), { hash: section });
      appWin.once('ready-to-show', () => appWin.show());
      appWin.on('close', (e) => { if (!app.isQuitting) { e.preventDefault(); appWin.hide(); } });
    } else {
      send(appWin, 'app:section', section);
      appWin.show();
      appWin.focus();
    }
  }

  function createTray() {
    tray = new Tray(nativeImage.createFromPath(icon).resize({ width: 16, height: 16 }));
    tray.setToolTip('Maya');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Ask Maya   (Ctrl+Space)', click: () => expand(true) },
      { label: 'Open Maya', click: () => openApp('home') },
      { label: 'Teleprompter (copy your script first)', click: () => onTray?.('prompter') },
      { label: 'Settings', click: () => openApp('settings') },
      { type: 'separator' },
      { label: 'Quit', click: onQuit },
    ]));
    tray.on('click', () => openApp('home'));
  }

  /** Fullscreen overlay showing a frozen screenshot; resolves with the dragged rectangle (CSS px) or null. */
  function snip(imageUrl) {
    const { bounds } = display();
    const win = new BrowserWindow({
      ...bounds, frame: false, resizable: false, movable: false, skipTaskbar: true, alwaysOnTop: true, show: false, fullscreenable: false,
      backgroundColor: '#000000', webPreferences: { preload, contextIsolation: true, sandbox: false },
    });
    win.setAlwaysOnTop(true, 'screen-saver');
    win.loadFile(page('snip'));
    win.webContents.once('did-finish-load', () => { win.webContents.send('snip:image', imageUrl); win.show(); win.focus(); });
    return new Promise((resolve) => {
      const done = (_, rect) => { cleanup(); resolve(rect || null); };
      const cleanup = () => { ipcMain.removeListener('snip:done', done); if (!win.isDestroyed()) win.close(); };
      ipcMain.on('snip:done', done);
      win.on('closed', () => { ipcMain.removeListener('snip:done', done); resolve(null); });
    });
  }

  /** Live captions bar at the bottom of the screen; opts null closes it. */
  let captionsWin = null;
  function captions(opts) {
    if (captionsWin && !captionsWin.isDestroyed()) captionsWin.close();
    captionsWin = null;
    if (!opts) return;
    const { workArea } = display();
    const width = Math.min(900, workArea.width - 40), height = 130;
    captionsWin = new BrowserWindow({
      width, height, x: Math.round(workArea.x + (workArea.width - width) / 2), y: workArea.y + workArea.height - height - 24,
      transparent: true, frame: false, resizable: true, skipTaskbar: true, alwaysOnTop: true, focusable: false, hasShadow: false,
      backgroundColor: '#00000000', webPreferences: { preload, contextIsolation: true, sandbox: false },
    });
    captionsWin.setAlwaysOnTop(true, 'screen-saver');
    captionsWin.loadFile(page('captions'), { query: { translate: opts.translate ? '1' : '0' } });
    captionsWin.on('closed', () => { captionsWin = null; });
  }

  /** One webcam photo as a JPEG data URL, from a hidden page that closes right after. */
  async function cameraFrame() {
    const win = new BrowserWindow({ show: false, width: 320, height: 240, webPreferences: { preload, contextIsolation: true, sandbox: false, backgroundThrottling: false } });
    try {
      await win.loadFile(page('camera'));
      return await win.webContents.executeJavaScript('window.grab()');
    } finally {
      win.destroy();
    }
  }

  /** Teleprompter near the top of the screen (under the webcam, where the eyes should be); script null closes it. */
  let prompterWin = null;
  function prompter(script) {
    if (prompterWin && !prompterWin.isDestroyed()) prompterWin.close();
    prompterWin = null;
    if (script == null) return;
    const { workArea } = display();
    const width = Math.min(1000, workArea.width - 40), height = 300;
    prompterWin = new BrowserWindow({
      width, height, x: Math.round(workArea.x + (workArea.width - width) / 2), y: workArea.y + 70,
      transparent: true, frame: false, resizable: true, skipTaskbar: true, alwaysOnTop: true, focusable: false, hasShadow: false,
      backgroundColor: '#00000000', webPreferences: { preload, contextIsolation: true, sandbox: false, backgroundThrottling: false },
    });
    prompterWin.setAlwaysOnTop(true, 'screen-saver');
    prompterWin.loadFile(page('prompter'));
    prompterWin.webContents.once('did-finish-load', () => send(prompterWin, 'prompter:script', script));
    prompterWin.on('closed', () => { prompterWin = null; });
  }

  /** Small camera window in the bottom-right corner for the head mouse; opts null closes it. */
  let headWin = null;
  function headMouse(opts) {
    if (headWin && !headWin.isDestroyed()) headWin.close();
    headWin = null;
    if (!opts) return;
    const { workArea } = display();
    const width = 300, height = 225;
    headWin = new BrowserWindow({
      width, height, x: workArea.x + workArea.width - width - 16, y: workArea.y + workArea.height - height - 16,
      transparent: true, frame: false, resizable: false, skipTaskbar: true, alwaysOnTop: true, focusable: false, hasShadow: false,
      backgroundColor: '#00000000', webPreferences: { preload, contextIsolation: true, sandbox: false, backgroundThrottling: false },
    });
    headWin.setAlwaysOnTop(true, 'screen-saver');
    headWin.loadFile(page('headmouse'), { query: { speed: String(opts.speed || 1), dwell: String(opts.dwell || 0), blink: opts.blink ? '1' : '0' } });
    headWin.on('closed', () => { headWin = null; });
  }

  /** On-screen keyboard along the bottom of the screen; it never takes the focus, so keys go to the user's app. */
  let kbWin = null;
  function keyboard(opts) {
    if (kbWin && !kbWin.isDestroyed()) kbWin.close();
    kbWin = null;
    if (!opts) return;
    const { workArea } = display();
    const width = Math.min(1100, workArea.width - 40), height = Math.round(Math.min(360, workArea.height * 0.4) * (opts.size || 1));
    kbWin = new BrowserWindow({
      width, height, x: Math.round(workArea.x + (workArea.width - width) / 2), y: workArea.y + workArea.height - height - 8,
      transparent: true, frame: false, resizable: true, skipTaskbar: true, alwaysOnTop: true, focusable: false, hasShadow: false,
      backgroundColor: '#00000000', webPreferences: { preload, contextIsolation: true, sandbox: false },
    });
    kbWin.setAlwaysOnTop(true, 'screen-saver');
    kbWin.loadFile(page('keyboard'), { query: { layout: opts.layout || 'en' } });
    kbWin.on('closed', () => { kbWin = null; });
  }

  /** Full-screen SOS sign with the alarm, for people nearby; data null closes it. */
  let sosWin = null;
  function sos(data) {
    if (!data) { if (sosWin && !sosWin.isDestroyed()) sosWin.close(); sosWin = null; return; }
    if (!sosWin || sosWin.isDestroyed()) {
      sosWin = new BrowserWindow({ ...display().bounds, frame: false, resizable: false, skipTaskbar: false, alwaysOnTop: true, show: false,
        backgroundColor: '#b00020', title: 'Maya SOS', webPreferences: { preload, contextIsolation: true, sandbox: false, backgroundThrottling: false } });
      sosWin.setAlwaysOnTop(true, 'screen-saver');
      sosWin.loadFile(page('sos'));
      sosWin.on('closed', () => { sosWin = null; });
    }
    const show = () => { send(sosWin, 'sos', data); sosWin.show(); };
    if (sosWin.webContents.isLoading()) sosWin.webContents.once('did-finish-load', show); else show();
  }

  /** Click-through layer over the main screen with voice-control numbers or the grid; data null hides it. */
  let overlayWin = null;
  // Two things can be on the layer: voice-control numbers/grid, and the dwell-click ring at the cursor.
  let overlayData = null, ringData = null;
  const overlayWindow = () => {
    if (!overlayWin || overlayWin.isDestroyed()) {
      overlayWin = new BrowserWindow({
        ...display().bounds, transparent: true, frame: false, resizable: false, movable: false, skipTaskbar: true, alwaysOnTop: true,
        focusable: false, hasShadow: false, show: false, backgroundColor: '#00000000', webPreferences: { preload, contextIsolation: true, sandbox: false },
      });
      overlayWin.setIgnoreMouseEvents(true);
      overlayWin.setAlwaysOnTop(true, 'screen-saver');
      overlayWin.loadFile(page('overlay'));
      overlayWin.on('closed', () => { overlayWin = null; });
    }
    return overlayWin;
  };
  const paintOverlay = () => {
    if (!overlayData && !ringData) { if (overlayWin && !overlayWin.isDestroyed()) overlayWin.hide(); return; }
    const win = overlayWindow();
    const show = () => { send(win, 'overlay', overlayData); send(win, 'overlay:ring', ringData); win.showInactive(); };
    if (win.webContents.isLoading()) win.webContents.once('did-finish-load', show); else show();
  };
  function overlay(data) { overlayData = data; paintOverlay(); }
  function ring(data) { ringData = data; paintOverlay(); }

  return {
    create() { createNotch(); createTray(); },
    headMouse,
    overlay,
    ring,
    keyboard,
    sos,
    get keyboardOpen() { return !!kbWin; },
    get headMouseOpen() { return !!headWin; },
    snip,
    captions,
    get captionsOpen() { return !!captionsWin; },
    prompter,
    get prompterOpen() { return !!prompterWin; },
    cameraFrame,
    get notch() { return notch; },
    get appWin() { return appWin; },
    toggle: () => (expanded ? collapse() : expand(true)),
    get expanded() { return expanded; },
    /** Switch tray, taskbar and window icons (black face in dark theme). */
    setIcon(path, isDark) {
      icon = path;
      dark = isDark;
      tray?.setImage(nativeImage.createFromPath(path).resize({ width: 16, height: 16 }));
      if (appWin && !appWin.isDestroyed()) { appWin.setIcon(path); appWin.setBackgroundColor(isDark ? '#0b0b0d' : '#f6f4fb'); }
    },
    expand, collapse, openApp,
    setBusy: (b) => { busy = b; },
    setContentHeight: (h) => { contentHeight = Math.min(NOTCH_H, h); },
    toNotch: (channel, ...args) => send(notch, channel, ...args),
    toApp: (channel, ...args) => send(appWin, channel, ...args),
    broadcast: (channel, ...args) => { send(notch, channel, ...args); send(appWin, channel, ...args); },
  };
}
