// Accessibility features end to end, acting only in its own test window: the Accessibility page and large mode,
// the on-screen keyboard, switch scanning, read-aloud, and the SOS countdown / cancel / alarm.
// Usage: npm run build:ui && node scripts/a11y-e2e.mjs   (needs Chrome; close the installed Maya first)
import { _electron as electron } from 'playwright';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createPc } from '../src/main/services/pc.js';

const shots = join('docs', 'screenshots');
const dir = join(tmpdir(), 'ather-a11y-test');
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'page.html'), `<!doctype html><html><head><meta charset="utf-8"><title>Maya a11y test</title>
<style>body{font:20px Segoe UI;margin:0;display:grid;place-items:center;height:100vh}input{font:inherit;width:520px;padding:12px}button{font:inherit;padding:10px 20px;margin:10px}</style></head>
<body><main><p>Welcome to the Maya accessibility test page. This sentence should be read aloud.</p>
<form onsubmit="document.title='Searched: '+q.value;return false"><div><input id="q" aria-label="Search box" placeholder="Search"></div>
<div style="text-align:center"><button>Search</button></div></form></main></body></html>`);

const app = await electron.launch({ args: ['.'], env: { ...process.env, ATHER_DATA: mkdtempSync(join(tmpdir(), 'ather-a11y-')), ATHER_MODELS: join(process.env.APPDATA, 'Ather', 'models') } });
const page = async (name, tries = 60) => { for (let i = 0; i < tries; i++) { const w = app.windows().find((x) => !x.isClosed() && x.url().includes(`${name}.html`)); if (w) return w; await new Promise((r) => setTimeout(r, 250)); } throw new Error(`${name} window did not open`); };
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`); };
const shot = async (file) => {
  const png = await app.evaluate(async ({ desktopCapturer, screen }) => (await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: screen.getPrimaryDisplay().size }))[0].thumbnail.toPNG().toString('base64'));
  writeFileSync(join(shots, file), Buffer.from(png, 'base64'));
};
let scale = 1; // the screen's scale factor (e.g. 1.25 at 125%), read from Electron once the app is up
const pc = createPc({ shell: {}, scale: () => scale });
try {
  const main = await page('app');
  scale = await app.evaluate(({ screen }) => screen.getPrimaryDisplay().scaleFactor);
  await main.waitForSelector("text=Hi, I'm Maya!");
  if (await main.$('text=Start using Maya')) await main.click('text=Start using Maya');

  // Accessibility page + large mode.
  await main.click('nav >> text=Accessibility');
  await main.waitForSelector('h1:has-text("Accessibility")');
  await main.check('text=Large and high contrast');
  await main.waitForTimeout(400);
  check('large mode switches on', (await main.evaluate(() => document.documentElement.dataset.a11y)) === 'large');
  await main.screenshot({ path: join(shots, '51-accessibility-large.png') });
  await main.uncheck('text=Large and high contrast');

  // The test page, in its own Chrome profile; everything below acts only while it is in front.
  spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [`--user-data-dir=${join(dir, 'profile')}`, '--no-first-run', '--start-maximized',
    `file:///${join(dir, 'page.html').replace(/\\/g, '/')}`], { detached: true, stdio: 'ignore' }).unref();
  let hwnd = 0;
  for (let i = 0; i < 30 && !hwnd; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    hwnd = Number(execFileSync('powershell.exe', ['-NoProfile', '-Command',
      "(Get-Process chrome | Where-Object { $_.MainWindowTitle -like 'Maya a11y test*' } | Select-Object -First 1).MainWindowHandle"]).toString().trim());
  }
  await new Promise((r) => setTimeout(r, 3000)); // the PC helper's first look
  if (!hwnd) throw new Error('Test page window not found; stopping before acting.');
  const front = async () => {
    await pc.activate(hwnd);
    await new Promise((r) => setTimeout(r, 400));
    const fg = await pc.foreground();
    if (fg.hwnd !== hwnd) throw new Error(`Another window took the front (${fg.process}: ${fg.title}); stopping.`);
  };
  const title = async () => (await pc.foreground()).title;
  const cmd = (c) => main.evaluate((x) => window.ather.voiceCommand(x), c);

  // Read aloud: the page's text comes back to be spoken.
  await front();
  const read = await cmd({ cmd: 'read' });
  check('read the screen', /read aloud/.test(read.read || ''), JSON.stringify(read).slice(0, 120));

  // Switch scanning: wait for the search box's group to light up, press; wait for the box itself, press.
  await front();
  await cmd({ cmd: 'scan', on: true });
  const overlay = await page('overlay');
  const litBox = () => overlay.evaluate(() => !!document.querySelector('.box.lit[data-name="Search box"]'));
  const waitLit = async (single) => {
    for (let i = 0; i < 80; i++) {
      const n = await overlay.evaluate(() => document.querySelectorAll('.box.lit').length);
      if (await litBox() && (!single || n === 1)) return true;
      await new Promise((r) => setTimeout(r, 150));
    }
    return false;
  };
  await shot('52-scanning.png');
  const group = await waitLit(false);
  await front(); await cmd({ cmd: 'switch' });
  const single = group && await waitLit(true);
  await front(); await cmd({ cmd: 'switch' });
  await cmd({ cmd: 'scan', on: false });
  await front();
  await cmd({ cmd: 'type', text: 'scan works' });
  await cmd({ cmd: 'keys', keys: 'enter' });
  await new Promise((r) => setTimeout(r, 800));
  check('switch scanning picks the search box', group && single && (await title()).startsWith('Searched: scan works'), await title());

  // On-screen keyboard: click its keys; they reach the focused page.
  await cmd({ cmd: 'keyboard', on: true });
  const kb = await page('keyboard');
  await front();
  await pc.keys('^a');
  // Real mouse clicks on the keys, like a head-mouse or dwell click: the keyboard window must not steal the focus.
  const kbBounds = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('keyboard.html')).getBounds());
  const press = async (label) => {
    const box = await kb.locator(`button[aria-label="${label}"]`).boundingBox();
    await pc.click(kbBounds.x + box.x + box.width / 2, kbBounds.y + box.y + box.height / 2);
    await new Promise((r) => setTimeout(r, 250));
  };
  await front();
  for (const k of ['h', 'e', 'l', 'l', 'o']) await press(k);
  await shot('53-keyboard.png');
  await press('⏎');
  await new Promise((r) => setTimeout(r, 800));
  check('on-screen keyboard types into the app', (await title()).startsWith('Searched: hello'), await title());
  await cmd({ cmd: 'keyboard', on: false });

  // SOS: countdown, cancelled by voice; then a real alarm, stopped by the "help is here" button.
  await cmd({ cmd: 'sos' });
  const sos = await page('sos');
  await sos.waitForSelector('[role=timer]');
  await shot('54-sos-countdown.png');
  await cmd({ cmd: 'cancel' });
  await new Promise((r) => setTimeout(r, 800));
  check('SOS countdown cancels by voice', !app.windows().some((w) => w.url().includes('sos.html') && !w.isClosed()));
  await main.evaluate(() => window.ather.sosTrigger('test of the alarm'));
  const sos2 = await page('sos');
  await sos2.waitForSelector('text=I NEED HELP', { timeout: 20000 });
  await sos2.waitForSelector('text=/No caregiver|emailed|not connected/', { timeout: 15000 });
  await shot('55-sos-alarm.png');
  const info = await sos2.textContent('.info:last-of-type');
  await sos2.click('text=Help is here');
  await new Promise((r) => setTimeout(r, 800));
  check('SOS alarm shows the sign, says why no email went out, and stops', !app.windows().some((w) => w.url().includes('sos.html') && !w.isClosed()), info);
} catch (e) {
  check('run', false, e.message);
} finally {
  pc.stop();
  await app.close();
  // Close the test page's Chrome (its own profile only), so it never sits in front of the next test or the user.
  try { execFileSync('powershell.exe', ['-NoProfile', '-Command', `Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.CommandLine -like '*${join(dir, 'profile')}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`]); } catch { /* already closed */ }
}
const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} accessibility checks passed.`);
process.exit(failed ? 1 : 0);
