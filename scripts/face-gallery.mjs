// Renders every face mood from the real app into docs/screenshots/faces/ (for checking and the report).
// Usage: npm run build:ui && node scripts/face-gallery.mjs
import { _electron as electron } from 'playwright';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const out = join(process.cwd(), 'docs', 'screenshots', 'faces');
mkdirSync(out, { recursive: true });
const env = { ...process.env, ATHER_DATA: mkdtempSync(join(tmpdir(), 'ather-faces-')), ATHER_MODELS: join(process.env.APPDATA, 'Ather', 'models') };
const app = await electron.launch({ args: ['.'], env });
try {
  let notch;
  for (let i = 0; i < 50 && !notch; i++) { notch = app.windows().find((w) => w.url().includes('notch.html')); await new Promise((r) => setTimeout(r, 200)); }
  for (const theme of ['light', 'dark']) {
    await notch.evaluate((t) => window.ather.setSetting('theme', t), theme);
    for (const mood of ['idle', 'happy', 'think', 'working', 'listen', 'worried', 'sad', 'angry', 'excited', 'love', 'surprised', 'sleepy', 'celebrate', 'error', 'ask', 'nod', 'sos', 'sleep', 'wake', 'wink', 'meh', 'groove']) {
      await app.evaluate(({ BrowserWindow }, m) => {
        const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes('notch.html'));
        w.setIgnoreMouseEvents(false);
        w.webContents.send('notch:expand', { focus: false });
        w.webContents.send('face:play', { name: m });
      }, mood);
      await notch.waitForSelector(`.face-${mood}`, { timeout: 5000 });
      await notch.waitForTimeout(250);
      await notch.locator('.face-wrap').screenshot({ path: join(out, `${theme}-${mood}.png`) });
    }
  }
  // Every face shape the user can pick, with the newer moods (light theme).
  await notch.evaluate(() => window.ather.setSetting('theme', 'light'));
  for (const shape of ['classic', 'round', 'robot', 'cat', 'blob', 'orb', 'bear', 'alien', 'ghost']) {
    await notch.evaluate((s) => window.ather.setSetting('faceStyle', { shape: s, liveliness: 'calm' }), shape);
    for (const mood of ['idle', 'happy', 'listen', 'sos', 'sleep', 'celebrate']) {
      await app.evaluate(({ BrowserWindow }, m) => {
        BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes('notch.html')).webContents.send('face:play', { name: m });
      }, mood);
      await notch.waitForSelector(`.face-${mood}.shape-${shape}`, { timeout: 5000 });
      await notch.waitForTimeout(mood === 'celebrate' ? 450 : 250);
      await notch.locator('.face-wrap').screenshot({ path: join(out, `shape-${shape}-${mood}.png`) });
    }
  }
  // "Any pill. Any eyes.": custom colours and the Shades look.
  const looks = { 'custom-black-shades': { color: 'custom', custom: { pill: 0, shade: 0, eyes: 0 }, accessory: 'shades' },
    'custom-white': { color: 'custom', custom: { pill: 0, shade: 1, eyes: 0 } },
    'custom-teal-green-eyes': { color: 'custom', custom: { pill: 0.5, shade: 0.3, eyes: 0.35 }, accessory: 'headphones' },
    'custom-yellow-bow': { color: 'custom', custom: { pill: 0.17, shade: 0.1, eyes: 0 }, accessory: 'bow' } };
  for (const [name, style] of Object.entries(looks)) {
    await notch.evaluate((s) => window.ather.setSetting('faceStyle', { ...s, liveliness: 'calm' }), style);
    for (const mood of ['idle', 'love', 'groove']) {
      await app.evaluate(({ BrowserWindow }, m) => {
        BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes('notch.html')).webContents.send('face:play', { name: m });
      }, mood);
      await notch.waitForSelector(`.face-${mood}`, { timeout: 5000 });
      await notch.waitForTimeout(350);
      await notch.locator('.face-wrap').screenshot({ path: join(out, `${name}-${mood}.png`) });
    }
  }
  await notch.evaluate(() => window.ather.setSetting('faceStyle', {}));
  console.log(`faces saved to ${out}`);
} finally {
  await app.close();
}
