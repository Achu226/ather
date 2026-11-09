// Voice-only control, end to end, with no keyboard or mouse: spoken commands (Kokoro's voice → Whisper → command parser)
// drive a test page in Chrome. Safety: it acts only while its own test window is in front, never in the user's windows.
// Usage: npm run build:ui && node scripts/voice-e2e.mjs   (needs Chrome; close the installed Maya first)
import { _electron as electron } from 'playwright';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { parseCommand } from '../src/renderer/shared/voicecommands.js';
import { createPc } from '../src/main/services/pc.js';

const shots = join('docs', 'screenshots');
const dir = join(tmpdir(), 'ather-voice-test');
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'page.html'), `<!doctype html><html><head><meta charset="utf-8"><title>Maya voice test</title>
<style>body{font:20px Segoe UI;margin:0;display:grid;place-items:center;height:100vh}input{font:inherit;width:520px;padding:12px}button{font:inherit;padding:10px 20px;margin:10px}</style></head>
<body><form onsubmit="document.title='Searched: '+q.value;return false"><div><input id="q" aria-label="Search box" placeholder="Search"></div>
<div style="text-align:center"><button>Search</button><button type="button" onclick="document.title='Clicked: Lucky'">Lucky</button></div></form></body></html>`);

const app = await electron.launch({ args: ['.'], env: { ...process.env, ATHER_DATA: mkdtempSync(join(tmpdir(), 'ather-vc-')), ATHER_MODELS: join(process.env.APPDATA, 'Ather', 'models') } });
const page = async (name) => { for (let i = 0; i < 60; i++) { const w = app.windows().find((x) => !x.isClosed() && x.url().includes(`${name}.html`)); if (w) return w; await new Promise((r) => setTimeout(r, 250)); } throw new Error(name); };
const screenshot = async (file) => {
  const png = await app.evaluate(async ({ desktopCapturer, screen }) => {
    const [s] = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: screen.getPrimaryDisplay().size });
    return s.thumbnail.toPNG().toString('base64');
  });
  writeFileSync(join(shots, file), Buffer.from(png, 'base64'));
};
const pc = createPc({ shell: {} });
let ok = false;
try {
  const notch = await page('notch');
  spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [`--user-data-dir=${join(dir, 'profile')}`, '--no-first-run', '--start-maximized',
    `file:///${join(dir, 'page.html').replace(/\\/g, '/')}`], { detached: true, stdio: 'ignore' }).unref();
  await new Promise((r) => setTimeout(r, 14000)); // Chrome and the PC helper start; the activity sampler notes Chrome
  const hwnd = Number(execFileSync('powershell.exe', ['-NoProfile', '-Command',
    "(Get-Process chrome | Where-Object { $_.MainWindowTitle -like 'Maya voice test*' } | Select-Object -First 1).MainWindowHandle"]).toString().trim());
  if (!hwnd) throw new Error('Test page window not found; stopping before acting.');
  const front = async () => {
    await pc.activate(hwnd);
    await new Promise((r) => setTimeout(r, 400));
    const fg = await pc.foreground();
    if (fg.hwnd !== hwnd || !/Maya voice test|Searched/.test(fg.title)) throw new Error(`Another window took the front (${fg.process}: ${fg.title}); stopping.`);
  };
  const hear = (sentence) => notch.evaluate(async (s) => {
    const a = await window.ather.speak(s);
    const out = new Float32Array(Math.floor((a.samples.length * 16000) / a.sampleRate));
    for (let i = 0; i < out.length; i++) out[i] = a.samples[Math.floor((i * a.sampleRate) / 16000)];
    return window.ather.transcribe(out);
  }, sentence);
  const say = async (spoken) => {
    await front();
    const heard = await hear(spoken);
    await front();
    const c = parseCommand(heard);
    const r = c ? await notch.evaluate((cmd) => window.ather.voiceCommand(cmd), c) : { error: 'not a command' };
    console.log(`said "${spoken}" → heard "${heard}" → ${JSON.stringify(r)}`);
    if (r.error) throw new Error(r.error);
  };
  await say('Show grid.');
  await new Promise((r) => setTimeout(r, 800));
  await screenshot('48-voice-grid.png');
  await say('Show numbers.');
  await new Promise((r) => setTimeout(r, 800));
  await screenshot('47-voice-numbers.png');
  // Read the search box's number off the overlay, as a person reads it off the screen.
  const n = await (await page('overlay')).evaluate(() => document.querySelector('.box[data-name="Search box"]')?.nextElementSibling?.textContent);
  await say(`Click ${n}.`);
  await say('Type weather in Chennai.');
  await say('Press enter.');
  await new Promise((r) => setTimeout(r, 2000));
  const title = (await pc.foreground()).title;
  ok = title.startsWith('Searched: weather in Chennai');
  console.log(`${ok ? 'PASS' : 'FAIL'} voice-only search: the page shows "${title}"`);
  await say('Hide numbers.');
} catch (e) {
  console.log('FAIL', e.message);
} finally {
  pc.stop();
  await app.close();
  // Close the test page's Chrome (its own profile only), so it never sits in front of the next test or the user.
  try { execFileSync('powershell.exe', ['-NoProfile', '-Command', `Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.CommandLine -like '*${join(dir, 'profile')}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`]); } catch { /* already closed */ }
}
process.exit(ok ? 0 : 1);
