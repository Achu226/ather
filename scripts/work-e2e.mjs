// 1.6 features end to end, with the real app but a throwaway data folder. The PC is never shut down
// (ATHER_NO_SHUTDOWN), and ChatGPT is asked in a separate test Chrome profile, never in the user's browser.
// Usage: npm run build:ui && node scripts/work-e2e.mjs   (close the installed Maya first)
import { _electron as electron } from 'playwright';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createPc } from '../src/main/services/pc.js';
import { askChatbot } from '../src/main/services/chatbots.js';

const shots = join('docs', 'screenshots');
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const logs = [];
const app = await electron.launch({ args: ['.'], env: { ...process.env, ATHER_NO_SHUTDOWN: '1', ATHER_DATA: mkdtempSync(join(tmpdir(), 'ather-work-')), ATHER_MODELS: join(process.env.APPDATA, 'Ather', 'models') } });
app.process().stdout.on('data', (d) => logs.push(String(d)));
const page = async (name) => { for (let i = 0; i < 240; i++) { const w = app.windows().find((x) => !x.isClosed() && x.url().includes(`${name}.html`)); if (w) return w; await sleep(250); } throw new Error(`${name} window did not open`); };
const scale = () => 1;
const pc = createPc({ shell: {}, scale });
try {
  const main = await page('app');
  await main.waitForSelector("text=Hi, I'm Maya!");
  if (await main.$('text=Start using Maya')) await main.click('text=Start using Maya');
  const notch = await page('notch');

  // Work timer over → goodbye card; "I'm still working" gives 15 minutes.
  const soon = () => main.evaluate(() => window.ather.setSetting('workSession', { ends: Date.now() + 3000, task: 'project', shutdown: true }));
  await soon();
  await notch.waitForSelector('text=Shutting down in a minute', { timeout: 20_000 });
  await notch.screenshot({ path: join(shots, '57-goodbye.png'), omitBackground: true });
  await notch.click("text=I'm still working");
  await sleep(500);
  const status = await main.evaluate(() => window.ather.tool('work_timer_status', {}));
  check('goodbye card, then 15 more minutes', status.running && status.minutes_left >= 14 && !status.saying_goodbye, JSON.stringify(status));

  // The whole countdown: "shutdown" happens (as a log line only).
  await main.evaluate(() => window.ather.setSetting('workSession', { ends: Date.now() + 2000, task: 'project', shutdown: true }));
  for (let i = 0; i < 100 && !logs.join('').includes('would shutdown'); i++) await sleep(1000);
  check('after the minute it shuts down (test: not really)', logs.join('').includes('would shutdown now'));

  // Magnifier by voice command: Magnify.exe starts, then stops.
  await main.evaluate(() => window.ather.voiceCommand({ cmd: 'magnify', action: 'in' }));
  await sleep(2500);
  const running = () => { try { return execFileSync('tasklist', ['/FI', 'IMAGENAME eq Magnify.exe']).toString().includes('Magnify.exe'); } catch { return false; } };
  const on = running();
  await main.evaluate(() => window.ather.voiceCommand({ cmd: 'magnify', action: 'off' }));
  await sleep(2000);
  const fg = await pc.foreground();
  check('magnifier on and off by voice; the taskbar does not keep the focus', on && !running() && fg.process !== 'explorer', `front: ${fg.process}`);

  // Accessibility page shows the new sections.
  await main.click('nav >> text=Accessibility');
  await main.waitForSelector('text=Work timer');
  await main.waitForSelector('text=Medicine and care');
  await main.screenshot({ path: join(shots, '58-accessibility-1.6.png'), fullPage: true });
  check('Accessibility page: work timer, medicine, phone, blink', !!(await main.$('#sos-p')) && !!(await main.$('text=Blink to click')));
} catch (e) {
  check('run', false, e.message);
} finally {
  await app.close();
}

// Ask ChatGPT in its own test profile (logged out), then read the answer.
const dir = join(tmpdir(), 'ather-chatgpt-test');
mkdirSync(dir, { recursive: true });
const open = async (url) => spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [`--user-data-dir=${join(dir, 'profile')}`, '--no-first-run', '--start-maximized', '--new-window', url], { detached: true, stdio: 'ignore' }).unref();
const r = await askChatbot({ pc, open, site: 'chatgpt', prompt: 'What is the capital of Tamil Nadu? Answer in one word.', timeoutMs: 90_000 });
check('ask ChatGPT and read the answer', /chennai/i.test(r.answer || ''), JSON.stringify(r).slice(0, 200));
writeFileSync(join(dir, 'last.json'), JSON.stringify(r, null, 2));
pc.stop();
try { execFileSync('powershell.exe', ['-NoProfile', '-Command', `Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.CommandLine -like '*${join(dir, 'profile')}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`]); } catch { /* already closed */ }
const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed.`);
process.exit(failed ? 1 : 0);
