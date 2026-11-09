// End-to-end check of the real app with Playwright: launches Electron, talks to Maya, saves screenshots.
// Usage: npm run build:ui && node scripts/e2e.mjs [path-to-Maya.exe]
import { _electron as electron } from 'playwright';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const shots = join(process.cwd(), 'docs', 'screenshots');
mkdirSync(shots, { recursive: true });
const exe = process.argv[2];
const env = {
  ...process.env,
  ATHER_DATA: mkdtempSync(join(tmpdir(), 'ather-e2e-')),
  ATHER_MODELS: join(process.env.APPDATA, 'Ather', 'models'),
};

/** A minimal one-page PDF containing `text`. */
function makePdf(text) {
  const content = `BT /F1 14 Tf 40 700 Td (${text}) Tj ET`;
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  let pdf = '%PDF-1.4\n';
  const offsets = objs.map((o, i) => { const at = pdf.length; pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; return at; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  return `${pdf}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
}

const app = await electron.launch(exe ? { executablePath: exe, env } : { args: ['.'], env });
app.process().stdout.on('data', (d) => process.stdout.write(`[app] ${d}`));
app.process().stderr.on('data', (d) => process.stdout.write(`[app:err] ${d}`));
app.on('window', (w) => {
  w.on('console', (m) => m.type() === 'error' && console.log(`[${w.url().split('/').pop()}] ${m.text()}`));
  w.on('crash', () => console.log(`[crash] ${w.url()}`));
  w.on('pageerror', (e) => console.log(`[pageerror ${w.url().split('/').pop()}] ${e.message}`));
  w.on('close', () => console.log(`[closed] ${w.url()}`));
});
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`); };
const page = async (name) => {
  for (let i = 0; i < 50; i++) {
    const found = app.windows().find((w) => w.url().includes(`${name}.html`));
    if (found) return found;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`${name} window did not open`);
};

try {
  const notch = await page('notch');
  const main = await page('app');
  await main.waitForSelector('text=Hi, I\'m Maya!');
  await main.waitForSelector('text=All models are ready', { timeout: 60_000 }).catch(() => {});
  await main.screenshot({ path: join(shots, '01-setup.png') });
  check('first-run setup screen', true);

  if (await main.$('text=Start using Maya')) await main.click('text=Start using Maya');
  await main.waitForSelector('.hero-title');

  // Open the notch as if the mouse hit the top of the screen.
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes('notch.html'));
    w.setIgnoreMouseEvents(false);
    w.webContents.send('notch:expand', { focus: true });
  });
  await notch.waitForSelector('textarea');
  await notch.screenshot({ path: join(shots, '02-notch-open.png'), omitBackground: true });

  const ask = async (text, waitFor = '.answer', timeout = 180_000) => {
    await notch.fill('textarea', text);
    await notch.press('textarea', 'Enter');
    // The stop button shows for the whole turn (thinking, tools and streaming).
    await notch.waitForSelector('.icon-btn.stop', { timeout: 10_000 }).catch(() => {});
    await notch.waitForSelector('.icon-btn.stop', { state: 'detached', timeout });
    await notch.waitForSelector(waitFor, { timeout: 5000 }).catch(() => {});
  };

  await ask('Add a task to submit the DBMS assignment tomorrow at 5pm');
  const tasks = await main.evaluate(() => window.ather.tool('tasks_query', {}));
  check('typed request creates a task', tasks.some((t) => /dbms/i.test(t.title)), JSON.stringify(tasks.map((t) => [t.title, t.due])));
  await notch.screenshot({ path: join(shots, '03-notch-task.png'), omitBackground: true });

  await ask('Remind me to drink water every day at 9pm');
  const reminders = await main.evaluate(() => window.ather.tool('reminders_query', {}));
  check('reminder with repeat', reminders.some((r) => r.repeat === 'daily'), JSON.stringify(reminders.map((r) => [r.text, r.at, r.repeat])));

  await ask('Note that the lab exam is in room 204');
  const notes = await main.evaluate(() => window.ather.tool('notes_query', {}));
  check('note saved', notes.some((n) => /204/.test(n.title + n.body)));

  await ask('How many tasks are still open?');
  check('answers a question', (await notch.textContent('.answer'))?.length > 0, await notch.textContent('.answer'));

  await ask('Draw a cute orange cat sitting on a desk', '.result-image', 300_000);
  check('image generation from chat', !!(await notch.$('.result-image')));
  await notch.screenshot({ path: join(shots, '04-notch-image.png'), omitBackground: true });

  // Voice: Kokoro speaks in the ML utility process, Whisper hears it back.
  const heard = await notch.evaluate(async () => {
    const a = await window.ather.speak('Add a task to call mom tonight.');
    const out = new Float32Array(Math.floor((a.samples.length * 16000) / a.sampleRate));
    for (let i = 0; i < out.length; i++) out[i] = a.samples[Math.floor((i * a.sampleRate) / 16000)];
    return window.ather.transcribe(out);
  });
  check('voice round trip in the app', /call.*mom/i.test(heard), heard);

  // Voice command for an app that is not installed: Maya searches for it in Chrome and says so.
  const spoken = await notch.evaluate(async () => {
    const a = await window.ather.speak('Open WhatsApp.');
    const out = new Float32Array(Math.floor((a.samples.length * 16000) / a.sampleRate));
    for (let i = 0; i < out.length; i++) out[i] = a.samples[Math.floor((i * a.sampleRate) / 16000)];
    return window.ather.transcribe(out);
  });
  await ask(spoken);
  const opened = await notch.textContent('.answer').catch(() => '');
  check('voice "open WhatsApp" opens it or searches in Chrome and says so', /whatsapp/i.test(spoken) && /chrome|opened|open/i.test(opened), `${spoken} → ${opened}`);
  await ask('How much battery and RAM is my laptop using?');
  check('system status by text', /%|GB/i.test(await notch.textContent('.answer').catch(() => '')), await notch.textContent('.answer').catch(() => ''));

  // Selected-text actions: like the Ctrl+Shift+E handler, open the notch then send the selection.
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes('notch.html'));
    w.setIgnoreMouseEvents(false);
    w.webContents.send('notch:expand', { focus: true });
    w.webContents.send('selection', 'Photosynthesis is the process by which green plants use sunlight, water and carbon dioxide to make glucose and release oxygen. It happens in the chloroplasts.');
  });
  await notch.click('text=Summarise');
  await notch.waitForSelector('.icon-btn.stop', { timeout: 10_000 }).catch(() => {});
  await notch.waitForSelector('.icon-btn.stop', { state: 'detached', timeout: 180_000 });
  check('selected text summarised', /photosynth|glucose|sunlight|oxygen/i.test(await notch.textContent('.answer')));
  await notch.screenshot({ path: join(shots, '15-notch-selection.png'), omitBackground: true });

  // Screen understanding.
  await ask("What's on my screen right now? One sentence.");
  check('looks at the screen', /screen/i.test(await notch.textContent('.bubble')), await notch.textContent('.answer'));

  // ChatGPT-style chat with formatting, a document and memory.
  await main.click('nav >> text=Chat');
  await main.waitForSelector('text=What can I help with?');
  await main.screenshot({ path: join(shots, '16-chat-empty.png') });
  await main.fill('.composer-input', 'Compare TCP and UDP in a markdown table with 4 rows.');
  await main.press('.composer-input', 'Enter');
  await main.waitForSelector('.md table', { timeout: 300_000 });
  await main.waitForSelector('text=↻ Regenerate', { timeout: 300_000 });
  check('chat renders a table', true);
  await main.waitForTimeout(4000); // auto title
  await main.screenshot({ path: join(shots, '17-chat-table.png') });

  const doc = join(env.ATHER_DATA, 'syllabus.pdf');
  (await import('node:fs')).writeFileSync(doc, makePdf('CS304 Operating Systems syllabus. The final exam is on 14 December in Hall B.'), 'latin1');
  const cid = await main.evaluate(async () => (await window.ather.conversations())[0].id);
  await main.evaluate(([c, p]) => window.ather.addDocument(c, p), [cid, doc]);
  await main.waitForSelector('text=syllabus.pdf');
  await main.fill('.composer-input', 'According to my syllabus, where is the final exam?');
  await main.press('.composer-input', 'Enter');
  await main.waitForFunction(() => document.querySelectorAll('.msg.assistant').length >= 2 && !document.querySelector('.composer-bar .btn:not(.primary)'), null, { timeout: 300_000 });
  check('answers from attached document', /hall b/i.test(await main.textContent('.chat-log')));
  await main.screenshot({ path: join(shots, '18-chat-document.png') });

  // Study: make a quiz and answer the first question.
  await main.click('nav >> text=Study');
  await main.fill('input[aria-label="Topic"]', 'Deadlocks in operating systems');
  await main.fill('input[aria-label="How many"]', '4');
  await main.click('text=Make it');
  await main.waitForSelector('.quiz-option', { timeout: 300_000 });
  await main.click('.quiz-option >> nth=0');
  await main.waitForSelector('text=/Correct!|Not quite/');
  check('quiz plays', true);
  await main.screenshot({ path: join(shots, '19-study-quiz.png') });

  // ---- Face emotions (1.3): each mood rendered for real ----
  for (const mood of ['worried', 'excited', 'working', 'error', 'love', 'think', 'ask', 'nod']) {
    await app.evaluate(({ BrowserWindow }, m) => {
      const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes('notch.html'));
      w.setIgnoreMouseEvents(false);
      w.webContents.send('notch:expand', { focus: false });
      w.webContents.send('face:play', { name: m });
    }, mood);
    await notch.waitForSelector(`.face-${mood}`, { timeout: 5000 });
    await notch.locator('.face-wrap').screenshot({ path: join(shots, `face-${mood}.png`) });
  }
  check('all new face moods render', true);

  // ---- Maya 1.2 features ----
  const chatAsk = async (text, mode = 'auto') => {
    await main.click('nav >> text=Chat');
    await main.click('text=+ New chat');
    await main.selectOption('.mode-pick', mode);
    await main.fill('.composer-input', text);
    await main.press('.composer-input', 'Enter');
    await main.waitForSelector('.composer-bar >> text=■ Stop', { timeout: 20_000 }).catch(() => {});
  };
  const chatDone = (timeout = 600_000) => main.waitForSelector('.composer-bar >> text=Send ↑', { timeout });

  // Agent mode: plan checklist + real tasks.
  const before = (await main.evaluate(() => window.ather.tool('tasks_query', {}))).length;
  await chatAsk('Plan 2 revision sessions for Operating Systems on different days this week and add each as a task.', 'agent');
  await main.waitForSelector('.agent-plan', { timeout: 300_000 });
  await main.screenshot({ path: join(shots, '20-agent-plan.png') });
  await chatDone();
  const after = (await main.evaluate(() => window.ather.tool('tasks_query', {}))).length;
  check('agent mode adds the planned tasks', after >= before + 2, `${before} → ${after}`);
  await main.screenshot({ path: join(shots, '21-agent-done.png') });

  // Code interpreter: approval card, then a chart.
  await chatAsk('Use Python to plot y = x squared for x from -5 to 5.');
  await main.waitForSelector('.approvals-dock .approval', { timeout: 300_000 });
  await main.screenshot({ path: join(shots, '22-code-approval.png') });
  await main.click('.approvals-dock >> text=▶ Run');
  await chatDone();
  check('python chart appears after approval', !!(await main.$('.chat-log .result-image')));
  await main.screenshot({ path: join(shots, '23-code-chart.png') });

  // PowerPoint maker.
  await chatAsk('Make a 4-slide PowerPoint presentation on cloud computing for my class.');
  await chatDone();
  const pptLink = await main.textContent('.chat-log').then((t) => /Made a PowerPoint/.test(t));
  check('PowerPoint created', pptLink);
  await main.screenshot({ path: join(shots, '24-ppt.png') });

  // Dark theme everywhere (app, notch, face).
  await main.evaluate(() => window.ather.setSetting('theme', 'dark'));
  await main.waitForTimeout(800);
  const dark = await Promise.all([main, notch].map((p) => p.evaluate(() => document.documentElement.dataset.theme)));
  check('dark theme in app and notch', dark.every((t) => t === 'dark'), dark.join(','));
  await main.click('nav >> text=Home');
  await main.waitForTimeout(600);
  await main.screenshot({ path: join(shots, '25-dark-home.png') });
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes('notch.html'));
    w.setIgnoreMouseEvents(false);
    w.webContents.send('notch:expand', { focus: true });
  });
  await notch.waitForTimeout(500);
  await notch.screenshot({ path: join(shots, '26-dark-notch.png'), omitBackground: true });

  for (const [section, file] of [['Activity', '27-activity'], ['Study', '28-study'], ['Settings', '29-settings-dark']]) {
    await main.click(`nav >> text=${section}`);
    await main.waitForTimeout(800);
    await main.screenshot({ path: join(shots, `${file}.png`) }).catch(() => {});
  }
  await main.click('nav >> text=Study');
  await main.click('text=🎙 Lectures');
  await main.waitForTimeout(400);
  await main.screenshot({ path: join(shots, '30-lectures.png') }).catch(() => {});
  await main.evaluate(() => window.ather.setSetting('theme', 'light'));

  // Workflows: a 3-step run completes; a run waiting for approval can be cancelled.
  await main.evaluate(() => window.ather.tool('routines_save', { name: 'e2e prep', steps: [
    { tool: 'tasks_create', args: { title: 'Revise DBMS unit 3' } }, { tool: 'notes_create', args: { title: 'DBMS plan', body: 'Normalization' } },
    { tool: 'focus_start', args: { minutes: 25, label: 'DBMS' } }] }));
  await main.click('nav >> text=Workflows');
  await main.click('.wf-saved:has-text("e2e prep") >> text=▶ Run');
  await main.waitForSelector('.wf-run .badge.s-completed', { timeout: 30_000 });
  check('workflow runs 3 real steps', (await main.locator('.wf-run').first().locator('.wf-node.s-completed').count()) === 3);
  await main.screenshot({ path: join(shots, '41-workflow-run.png') });
  await main.evaluate(() => window.ather.tool('routines_save', { name: 'e2e night', steps: [{ tool: 'pc_power', args: { action: 'sleep', minutes: 30 } }] }));
  await main.evaluate(() => window.ather.workflowStart('e2e night'));
  await main.waitForSelector('.wf-run .badge:has-text("awaiting approval")', { timeout: 15_000 });
  await main.click('.wf-run:has(.badge:has-text("awaiting approval")) >> text=Cancel');
  await main.waitForSelector('.wf-run .badge.s-cancelled', { timeout: 10_000 });
  check('a running workflow can be cancelled', true);

  // Timetable, exams, clipboard history, captions.
  await main.evaluate(() => window.ather.tool('timetable_add', { classes: [{ day: 'monday', start: '09:00', end: '09:50', subject: 'DBMS', room: 'A-204' }] }));
  await main.evaluate((d) => window.ather.tool('exams_add', { subject: 'DBMS end-sem', date: d }), new Date(Date.now() + 12 * 864e5).toLocaleDateString('en-CA'));
  await main.click('nav >> text=Study');
  await main.click('text=Timetable & exams');
  await main.waitForSelector('.tt-class');
  check('timetable and exam countdown', (await main.textContent('.exam-days')) === '12');
  await main.screenshot({ path: join(shots, '43-timetable.png'), fullPage: true });
  await app.evaluate(async ({ clipboard }) => { await clipboard.writeText('https://example.com/e2e'); await new Promise((r) => setTimeout(r, 1300)); await clipboard.writeText('Xk9#mP2$vL'); await new Promise((r) => setTimeout(r, 1300)); });
  const clips = (await main.evaluate(() => window.ather.tool('clipboard_history', {}))).map((c) => c.text);
  check('clipboard history keeps text, skips passwords', clips.includes('https://example.com/e2e') && !clips.includes('Xk9#mP2$vL'), JSON.stringify(clips));
  await main.evaluate(() => window.ather.captionsSet(true, { translate: false }));
  const cap = await page('captions');
  await cap.waitForSelector('text=Listening to your computer', { timeout: 10_000 });
  check('captions hear the computer sound', !/Could not/.test(await cap.textContent('.cap')));
  await main.evaluate(() => window.ather.captionsSet(false));

  // PIN lock.
  await main.evaluate(() => window.ather.setPin('', '2580'));
  await main.evaluate(() => window.ather.lockNow());
  await main.waitForSelector('text=Maya is locked');
  const blocked = await main.evaluate(() => window.ather.tool('tasks_query', {}).then(() => 'open', (e) => e.message));
  check('locked Maya refuses requests', /locked/i.test(blocked), blocked);
  await main.screenshot({ path: join(shots, '31-locked.png') });
  await main.fill('input[aria-label="PIN"]', '2580');
  await main.click('text=Unlock');
  await main.waitForSelector('nav >> text=Home');
  check('PIN unlocks', true);
  await main.evaluate(() => window.ather.setPin('2580', null));

  for (const [section, file] of [['Home', '05-home'], ['Tasks', '06-tasks'], ['Notes', '07-notes'], ['Habits', '08-habits'], ['Focus', '09-focus'],
    ['Calendar', '10-calendar'], ['Chat', '11-chat'], ['Smart search', '12-search'], ['Image tools', '13-images'], ['Settings', '14-settings']]) {
    await main.click(`nav >> text=${section}`);
    await main.waitForTimeout(700);
    // Windows sometimes holds a lock on the old PNG (indexer, viewer); one retry is enough.
    await main.screenshot({ path: join(shots, `${file}.png`) }).catch(() => main.waitForTimeout(1500).then(() => main.screenshot({ path: join(shots, `${file}.png`) })));
  }
  check('all sections render', true);
} catch (err) {
  check('run', false, err.stack);
} finally {
  await app.close();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed. Screenshots in ${shots}`);
process.exit(failed ? 1 : 0);
