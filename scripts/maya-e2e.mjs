// Maya 1.7 by voice, end to end: every request is spoken with Maya's own voice, heard by Whisper, then answered
// by the real app in a throwaway data folder. Nothing is shut down, sent or published; the Builder writes into a temp folder.
// Usage: npm run build:ui && node scripts/maya-e2e.mjs   (close the installed Maya first)
import { _electron as electron } from 'playwright';
import { mkdtempSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseCommand } from '../src/renderer/shared/voicecommands.js';

const shots = join('docs', 'screenshots');
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${String(detail).slice(0, 220)}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const work = mkdtempSync(join(tmpdir(), 'maya-17-work-'));
const app = await electron.launch({ args: ['.'], env: { ...process.env, ATHER_NO_SHUTDOWN: '1', ATHER_DATA: mkdtempSync(join(tmpdir(), 'maya-17-')), ATHER_MODELS: join(process.env.APPDATA, 'Ather', 'models') } });
const page = async (name) => { for (let i = 0; i < 240; i++) { const w = app.windows().find((x) => !x.isClosed() && x.url().includes(`${name}.html`)); if (w) return w; await sleep(250); } throw new Error(`${name} window did not open`); };
try {
  const main = await page('app');
  await main.waitForSelector("text=Hi, I'm Ather!, text=Hi, I'm Maya!", { timeout: 60_000 }).catch(() => {});
  if (await main.$('text=Start using Maya')) await main.click('text=Start using Maya');
  if (await main.$('text=Start using Ather')) await main.click('text=Start using Ather');
  await main.evaluate((dir) => window.ather.setSetting('approvedFolders', [dir]), work);
  const notch = await page('notch');
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes('notch.html'));
    w.setIgnoreMouseEvents(false);
    w.webContents.send('notch:expand', { focus: true });
  });
  await notch.waitForSelector('textarea');

  // Maya says it, Whisper hears it: the words go through the same ears a user's voice does.
  const hear = (sentence) => notch.evaluate(async (s) => {
    const a = await window.ather.speak(s);
    const out = new Float32Array(Math.floor((a.samples.length * 16000) / a.sampleRate));
    for (let i = 0; i < out.length; i++) out[i] = a.samples[Math.floor((i * a.sampleRate) / 16000)];
    return window.ather.transcribe(out);
  }, sentence);
  const ask = async (spoken, timeout = 240_000) => {
    const heard = await hear(spoken);
    // The face folds away when idle; open it again, as moving to the top of the screen does.
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes('notch.html')).webContents.send('notch:expand', { focus: true }));
    await notch.waitForSelector('textarea', { timeout: 10_000 });
    await notch.fill('textarea', heard);
    await notch.press('textarea', 'Enter');
    await notch.waitForSelector('.icon-btn.stop', { timeout: 10_000 }).catch(() => {});
    // Only the Builder's own file writes and commands inside the test folder are allowed; every other card
    // (closing an app, shutting down, sending) is refused, so a test can never act on the user's PC.
    const end = Date.now() + timeout;
    while (await notch.$('.icon-btn.stop') && Date.now() < end) {
      const card = await notch.$('.approval');
      if (card) {
        const text = (await card.textContent()) || '';
        const ours = /fs write|Run this command/i.test(text) && text.includes(work.split(/[\\/]/).pop());
        await card.$(`button:has-text("${ours ? 'Allow' : 'Cancel'}")`).then((b) => b?.click()).catch(() => {});
        if (!ours) console.log(`  refused a card: ${text.replace(/\s+/g, ' ').slice(0, 100)}`);
      }
      await sleep(500);
    }
    const answer = (await notch.textContent('.answer').catch(() => '')) || '';
    console.log(`  said "${spoken}" → heard "${heard}" → ${answer.replace(/\s+/g, ' ').slice(0, 160)}`);
    return { heard, answer };
  };
  const setting = (k, f = null) => main.evaluate(([key, fb]) => window.ather.getSetting(key, fb), [k, f]);

  // 1. Teach a skill by voice, then use it by saying its name.
  await ask('Teach yourself a new skill called Goodnight: when I say goodnight, make the text bigger and tell me my tasks for tomorrow.');
  const skills = await main.evaluate(() => window.ather.tool('skills_list', {}));
  check('a skill taught by voice is saved', skills.some((s) => /goodnight/i.test(s.name)), skills.filter((s) => !s.builtin).map((s) => s.name));
  await ask('Goodnight.');
  check('saying its name runs the skill', ((await setting('ui', {}))?.fontScale || 1) > 1, JSON.stringify(await setting('ui', {})));

  // 2. Change Maya by voice.
  await ask('Change your name to Priya.');
  check('"change your name to Priya"', (await setting('agent', {}))?.name === 'Priya', JSON.stringify(await setting('agent', {})));
  await ask('Talk a little slower please.');
  check('"talk slower"', ((await setting('agent', {}))?.speed || 1) < 1, JSON.stringify(await setting('agent', {})));

  // 3. The work monitor, by voice and on its page.
  const doing = await ask('What did you do today?');
  check('"what did you do today?" tells the work', /name|priya|skill|text|slower|speed/i.test(doing.answer), doing.answer);

  // 4. A 👎 by voice teaches Maya; a fresh question follows it.
  const bad = parseCommand(await hear('Bad answer.'));
  const note = await hear('Answer in one short sentence only.');
  await main.evaluate(([n]) => window.ather.feedback({ question: 'explain things', good: false, note: n }), [note]);
  const prefs = await main.evaluate(() => window.ather.tool('memory_list', {}));
  check('"bad answer" + a note is remembered', bad?.cmd === 'feedback' && prefs.some((m) => m.category === 'preference' && /one short sentence/i.test(m.fact)), JSON.stringify(prefs.map((m) => m.fact)));
  const short = await ask('What is photosynthesis?');
  check('the next answer follows it', short.answer.split(/[.!?]\s/).filter((s) => s.trim()).length <= 2, short.answer);

  // 5. Tamil: heard in Tamil, answered in Tamil, spoken with the Tamil voice.
  await main.evaluate(() => window.ather.setSetting('listenLanguage', 'tamil'));
  const ta = await ask('வணக்கம், நீ யார்?');
  const taVoice = await notch.evaluate(async (t) => { const a = await window.ather.speak(t); return a ? a.samples.length : 0; }, ta.answer || 'வணக்கம்');
  check('Tamil question → Tamil answer → Tamil voice', /[஀-௿]/.test(ta.answer) && taVoice > 8000, ta.answer);
  await main.evaluate(() => window.ather.setSetting('listenLanguage', null));

  // 6. Build something by voice (Builder): a working page in the test folder.
  const built = await ask('Build me a simple counter web page with plus, minus and reset buttons.', 600_000);
  const projects = join(work, 'Maya Projects');
  const dir = existsSync(projects) ? readdirSync(projects).map((d) => join(projects, d)).find((d) => existsSync(join(d, 'index.html'))) : null;
  const html = dir ? readFileSync(join(dir, 'index.html'), 'utf8') : '';
  check('"build me a counter page" makes a working page', /<button/i.test(html) && /<script/i.test(html) && /reset/i.test(html), dir || built.answer);

  // 7. The new pages, for the guide.
  for (const [nav, file] of [['Skills', '60-skills.png'], ['My Priya', '61-my-maya.png'], ['Work monitor', '62-work-monitor.png'], ['Connections', '63-connections.png']]) {
    await main.click(`nav >> text=${nav}`).catch(() => main.click(`nav >> text=My Maya`));
    await sleep(1200);
    await main.screenshot({ path: join(shots, file) });
  }
  const log = await main.evaluate(() => window.ather.workToday());
  check('the work monitor lists the actions', log.actions >= 4, `${log.actions} actions: ${log.items.slice(0, 4).map((i) => i.detail).join(' | ')}`);
} catch (e) {
  check('run', false, e.message);
} finally {
  await app.close();
}
const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} Maya 1.7 checks passed.`);
process.exit(failed ? 1 : 0);
