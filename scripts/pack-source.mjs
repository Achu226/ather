// Writes the source code "in order": docs/CODE_GUIDE.md (every file, grouped by the project report's modules),
// docs/SOURCE-LISTING.md (all the code in that order, for printing) and release/Maya-<version>-source.zip.
// Usage: node scripts/pack-source.mjs
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, rmSync, cpSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const ls = (dir, re = /\.(js|jsx|mjs|cjs|css|html)$/) => readdirSync(join(root, dir)).filter((f) => re.test(f) && !f.startsWith('_')).sort().map((f) => `${dir}/${f}`);

// Modules 1-6 follow the report's LIST OF MODULES; 7-12 are the rest of Maya.
const MODULES = [
  ['1. Voice & Interface', 'Speech to text (Whisper), text to speech (Kokoro, Tamil MMS), the face window (notch), the app window, hands-free control (voice commands, head mouse, keyboard, switch scanning, SOS) and their bridge to the core.',
    ['src/main/main.js', 'src/main/windows.js', 'src/preload/preload.cjs', 'src/main/ipc.js', 'src/main/speech.js', 'src/main/dictation.js', 'src/main/services/sapi.js',
      'src/renderer/notch.html', 'src/renderer/notch.jsx', 'src/renderer/notch.css', 'src/renderer/shared/voice.js', 'src/renderer/shared/audio.js',
      'src/renderer/shared/Face.jsx', 'src/renderer/shared/emotion.js', 'src/renderer/shared/useAsk.js', 'src/renderer/shared/Markdown.jsx', 'src/renderer/shared/ToolResult.jsx',
      'src/main/services/holdkeys.js', 'src/main/services/dictate.js',
      'src/renderer/shared/voicecommands.js', 'src/main/services/voicecontrol.js', 'src/renderer/overlay.html', 'src/renderer/overlay.jsx',
      'src/renderer/app/Accessibility.jsx', 'src/main/services/scanning.js', 'src/main/services/keyboard.js', 'src/renderer/keyboard.html', 'src/renderer/keyboard.jsx',
      'src/main/services/sos.js', 'src/main/services/telegram.js', 'src/renderer/sos.html', 'src/renderer/sos.jsx', 'src/main/services/session.js', 'src/main/services/chatbots.js', 'src/renderer/shared/MicButton.jsx',
      'src/renderer/app.html', 'src/renderer/app.jsx', 'src/renderer/app.css', 'src/renderer/shared/base.css', 'src/renderer/app/Chat.jsx', 'src/renderer/app/Home.jsx']],
  ['2. Supervisor Orchestration Core', 'Understands the request, picks the model, chooses tools, plans multi-step goals (Agent and Builder modes) and runs workflows.',
    ['src/main/brain.js', 'src/main/models.js', 'src/main/personality.js', 'src/main/providers.js', 'src/main/ollama.js', 'src/main/tools/index.js', 'src/main/tools/select.js', 'src/main/services/skills.js', 'src/main/services/learning.js', 'src/main/services/worklog.js', 'src/main/tools/maya.js', 'src/renderer/app/Skills.jsx', 'src/renderer/app/Monitor.jsx', 'src/renderer/app/Agent.jsx', 'src/renderer/app/Connections.jsx', 'src/renderer/app/Brain.jsx', 'src/renderer/shared/work.js',
      'src/main/services/workflows.js', 'src/renderer/app/Workflows.jsx', 'src/renderer/app/Models.jsx']],
  ['3. Local OS & Environment Sandbox', 'Safe access to the PC: approved folders only, approval cards for risky actions, app opening, computer control, head mouse.',
    ['src/main/approvals.js', 'src/main/tools/dev.js', 'src/main/tools/pc.js', 'src/main/services/pc.js', 'src/main/tools/computer.js', 'src/main/services/sysmon.js',
      'src/main/services/activity.js', 'src/renderer/shared/Approvals.jsx', 'src/renderer/app/Activity.jsx',
      'src/renderer/headmouse.html', 'src/renderer/headmouse.jsx', 'src/renderer/shared/headpose.js']],
  ['4. Autonomous Engineering Sub-Agent', 'Writes and fixes code: file tools, the command runner and the Python code interpreter.',
    ['src/main/services/python.js', 'src/main/services/files.js', 'src/main/tools/power.js']],
  ['5. Quality Assurance (QA) Sub-Agent', 'Checks the Engineer\'s work: loads websites in a hidden browser and reports errors; runs tests.',
    ['src/main/services/qa.js', 'scripts/e2e.mjs', 'scripts/voice-e2e.mjs', 'scripts/a11y-e2e.mjs', 'scripts/work-e2e.mjs', 'scripts/maya-e2e.mjs', 'scripts/nlp-eval.mjs']],
  ['6. GitHub & CI/CD Deployment Sub-Agent', 'Git and GitHub: commits, publishing to GitHub Pages (asks first), MCP servers, releases and auto-update.',
    ['src/main/services/mcp-client.js', 'src/main/services/mcp-presets.js', 'src/main/services/mcp.js', 'src/renderer/app/Mcp.jsx', 'src/main/updater.js', 'scripts/release.mjs', 'scripts/check-update.mjs']],
  ['7. AI models on this PC', 'Local machine-learning worker: Whisper, Kokoro, CLIP, OCR, faces, background removal, upscaling, image generation.',
    ['src/main/ml/catalog.js', 'src/main/ml/client.js', 'src/main/ml/worker.js', 'src/main/ml/core.js', 'src/main/services/imaging.js', 'src/main/services/syscheck.js',
      'src/renderer/app/ModelList.jsx', 'src/renderer/app/Setup.jsx', 'src/renderer/app/Images.jsx', 'scripts/fetch-models.js', 'scripts/make-share.mjs', 'scripts/wake-e2e.mjs']],
  ['8. Productivity', 'Tasks, notes, reminders, habits, focus, calendar, mail, briefing, scheduler.',
    ['src/main/tools/productivity.js', 'src/main/services/scheduler.js', 'src/main/services/calendar-feeds.js', 'src/main/services/mail.js', 'src/main/services/work.js', 'src/main/services/briefing.js',
      'src/renderer/app/useData.js', 'src/renderer/app/Tasks.jsx', 'src/renderer/app/Notes.jsx', 'src/renderer/app/Habits.jsx', 'src/renderer/app/Focus.jsx',
      'src/renderer/app/Calendar.jsx', 'src/renderer/app/Inbox.jsx']],
  ['9. Study', 'PDF chat, quizzes and flashcards, lecture recorder, timetable and exam countdown.',
    ['src/main/services/docs.js', 'src/main/services/study.js', 'src/main/services/lectures.js', 'src/main/tools/student.js',
      'src/renderer/app/Study.jsx', 'src/renderer/app/Lectures.jsx', 'src/renderer/app/Timetable.jsx']],
  ['10. Helpers', 'Memory, web, smart search, screen snip, clipboard history, live captions, health breaks, extras.',
    ['src/main/tools/assistant.js', 'src/main/tools/extras.js', 'src/main/services/web.js', 'src/main/services/search.js', 'src/main/services/clipboard.js',
      'src/main/services/health.js', 'src/renderer/app/Search.jsx', 'src/renderer/snip.html', 'src/renderer/snip.jsx', 'src/renderer/captions.html', 'src/renderer/captions.jsx',
      'src/main/tools/everyday.js', 'src/main/services/places.js', 'src/main/services/timers.js', 'src/renderer/prompter.html', 'src/renderer/prompter.jsx', 'src/renderer/shared/prompter.js',
      'src/renderer/camera.html', 'src/renderer/camera.js', 'src/main/services/interpreter.js', 'src/main/tools/people.js']],
  ['11. Data, security and settings', 'SQLite storage, encrypted secrets, PIN lock, backup, theme.',
    ['src/main/paths.js', 'src/main/store.js', 'src/main/secrets.js', 'src/main/security.js', 'src/main/backup.js', 'src/main/theme.js',
      'src/renderer/shared/LockScreen.jsx', 'src/renderer/shared/look.js', 'src/renderer/shared/colors.js', 'src/renderer/app/Settings.jsx', 'src/renderer/app/Appearance.jsx',
      'scripts/make-icon.js', 'scripts/face-gallery.mjs', 'scripts/pack-source.mjs', 'scripts/print-source.mjs']],
  ['12. Tests', 'Automatic checks (npm test). Model tests skip themselves when a model is not downloaded.', ls('test')],
];

// Every source file must be listed exactly once.
const all = [...ls('src/main'), ...ls('src/main/ml'), ...ls('src/main/services'), ...ls('src/main/tools'), ...ls('src/preload'),
  ...ls('src/renderer'), ...ls('src/renderer/app'), ...ls('src/renderer/shared'), ...ls('scripts'), ...ls('test')];
const listed = MODULES.flatMap(([, , files]) => files);
const missing = all.filter((f) => !listed.includes(f)), extra = listed.filter((f) => !all.includes(f));
const twice = listed.filter((f, i) => listed.indexOf(f) !== i);
if (missing.length || extra.length || twice.length) throw new Error(`Update MODULES. Missing: ${missing} | not found: ${extra} | twice: ${twice}`);

const lang = (f) => ({ js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'jsx', css: 'css', html: 'html' })[f.split('.').pop()];
const DESCRIPTIONS = {
  "src/main/brain.js": "The brain: answers a question, calls tools in a loop, plans Agent and Builder goals, streams the reply.",
  "src/main/ipc.js": "Every request from the windows to the core (ask, tools, settings, models, workflows, captions, head mouse…), with the PIN-lock check.",
  "src/main/main.js": "Electron entry point: creates every service, the windows, global shortcuts and timers.",
  "src/main/ollama.js": "Talks to Ollama: is it running, pull models, build ather-brain/ather-smart, embeddings, free the GPU.",
  "src/main/paths.js": "Where Maya keeps its data, models and pictures (%APPDATA%\\Maya).",
  "src/main/services/web.js": "Web search (DuckDuckGo) and reading a web page as text.",
  "src/main/store.js": "SQLite database: tables, migrations, settings and undo history.",
  "src/main/tools/assistant.js": "Memory brain (save, update, forget, no secrets), screen reading and study-set tools.",
  "src/main/tools/extras.js": "Image, personality, animation and agent-step tools.",
  "src/main/tools/index.js": "The full list of tools the AI can use.",
  "src/main/tools/productivity.js": "Tasks, notes, reminders, habits, focus, calendar, patterns and undo tools.",
  "src/main/windows.js": "All windows: the face at the top of the screen, the app, tray, snip overlay, captions bar, head-mouse camera and voice-control layer.",
  "src/preload/preload.cjs": "The safe bridge (window.ather) between the web pages and the core.",
  "src/renderer/app.css": "Styles of the app window (chat, workflows, timetable, meters…).",
  "src/renderer/app.html": "Page for the app window.",
  "src/renderer/app.jsx": "The app window: sidebar sections, setup, lock screen and approvals.",
  "src/renderer/app/Activity.jsx": "Activity page: time per app, This PC meters, Maya's actions on the PC.",
  "src/renderer/app/Appearance.jsx": "Theme, face colours, eyes, accessories, glow and motion settings.",
  "src/renderer/app/Calendar.jsx": "Calendar page.",
  "src/renderer/app/Chat.jsx": "ChatGPT-style chat: conversations, model picker, files, voice, agent checklist.",
  "src/renderer/app/Focus.jsx": "Focus timer page.",
  "src/renderer/app/Habits.jsx": "Habits page with streaks.",
  "src/renderer/app/Home.jsx": "Home: briefing, today, coming up (classes, exams), what Maya noticed.",
  "src/renderer/app/Images.jsx": "Image tools: create, blur private details, remove background, upscale.",
  "src/renderer/app/Inbox.jsx": "Inbox page: mail sorted by importance.",
  "src/renderer/app/Lectures.jsx": "Lecture recorder with live transcript and notes.",
  "src/renderer/app/Mcp.jsx": "Connected tools (MCP servers): status, permissions, logs, add your own.",
  "src/renderer/app/ModelList.jsx": "Download list for Maya's own AI models.",
  "src/renderer/app/Models.jsx": "AI models page: local and cloud providers, API keys, tests, usage.",
  "src/renderer/app/Notes.jsx": "Notes page.",
  "src/renderer/app/Search.jsx": "Smart search of your files and photos.",
  "src/renderer/app/Settings.jsx": "Settings: voice, personality, helpers, memories, security, backup, updates.",
  "src/renderer/app/Setup.jsx": "First-run setup: checks the PC and downloads the models.",
  "src/renderer/app/Study.jsx": "Study page: quizzes, flashcards, summaries, lectures, timetable tabs.",
  "src/renderer/app/Tasks.jsx": "Tasks page.",
  "src/renderer/app/Timetable.jsx": "Weekly timetable (import from photo/PDF) and exam countdown.",
  "src/renderer/app/Workflows.jsx": "Workflows page: describe → steps → run, live node states, pause/resume/cancel/retry, history.",
  "src/renderer/app/useData.js": "Small helpers the app pages share (load data, call a tool, format dates).",
  "src/renderer/captions.html": "Page for the live captions bar.",
  "src/renderer/overlay.html": "Page for the hands-free layer (numbers, grid, scanning highlight, dwell ring).",
  "src/renderer/keyboard.html": "Page for the on-screen keyboard.",
  "src/renderer/sos.html": "Page for the full-screen SOS sign.",
  "src/renderer/app/Accessibility.jsx": "Accessibility page: voice only, head mouse and dwell click, keyboard, switch scanning, emergency help, large mode.",
  "test/scanning.test.js": "Switch scanning order: groups, controls, back step.",
  "test/sos.test.js": "Emergency: countdown, cancel, caregiver email, check-in hours.",
  "test/session.test.js": "Work timer goodbye and shutdown (never real), voice wait/magnifier/pages, blink click, care reminders, emergency call, ChatGPT answer reading.",
  "test/skills.test.js": "Skills: built-ins use real tools, the right skill is picked, everyday sentences pick none, taught skills by name.",
  "test/learning.test.js": "Learning: misheard words fixed next time, a thumbs-down note becomes a preference, good/bad answer by voice.",
  "test/monitor.test.js": "Work monitor in plain words, working faces, OLLAMA_HOST addresses, tool calls written as text.",
  "test/agent.test.js": "My Maya: safe look/name/speed changes by voice, rules in the prompt, OpenAI voice request, wake word follows the name.",
  "test/mail.test.js": "Email: search, read, threaded reply, archive (never delete), approvals, follow-ups, weekly report; live model checks.",
  "test/keyboard.test.js": "Keyboard word suggestions; passwords and codes never learned.",
  "src/renderer/shared/voicecommands.js": "Voice-only control: turns spoken commands (show numbers, click 5, scroll down, type …, yes/no, some Tamil) into actions.",
  "src/main/services/voicecontrol.js": "Carries out voice commands in the app the user is working in: numbers or grid on screen, click, scroll, keys, typing.",
  "test/voicecommands.test.js": "Voice commands, questions left for the AI, spoken yes/no in English and Tamil.",
  "src/renderer/headmouse.html": "Page for the head-mouse camera window.",
  "src/renderer/notch.css": "Styles of the face window at the top of the screen.",
  "src/renderer/notch.html": "Page for the face window.",
  "src/renderer/notch.jsx": "The face window: ask by text or voice, hands-free voice chat, emotions, approvals, clipboard picker.",
  "src/renderer/shared/Approvals.jsx": "Approval cards: Maya asks before risky actions.",
  "src/renderer/shared/Face.jsx": "Maya's animated face: moods, blinking, glances, accessories.",
  "src/renderer/shared/LockScreen.jsx": "PIN lock screen.",
  "src/renderer/shared/Markdown.jsx": "Shows AI answers as safe Markdown (code, tables, maths).",
  "src/renderer/shared/ToolResult.jsx": "One line per action Maya took (\"Added task…\", \"Opened Chrome…\").",
  "src/renderer/shared/base.css": "Shared colours, light/dark theme and face animations.",
  "src/renderer/shared/useAsk.js": "Sends a question to the brain and follows the streamed answer.",
  "src/renderer/snip.html": "Page for the screen-snip overlay.",
  "src/renderer/snip.jsx": "Drag a box on a frozen screenshot to ask about that part (Ctrl+Shift+S).",
  "test/activity.test.js": "Activity tracking and routines.",
  "test/advanced.test.js": "Chat summaries, follow-ups, memory and real-model conversation checks.",
  "test/briefing.test.js": "Daily briefing and nudges.",
  "test/emotion.test.js": "Face emotions from what the user says.",
  "test/headpose.test.js": "Head mouse maths: head direction, cursor, mouth/smile clicks.",
  "test/image-extras.test.js": "Background removal and upscaling.",
  "test/memory.test.js": "Memory: survives restart, updates, deletes, refuses secrets.",
  "test/pc.test.js": "App-name matching and window descriptions.",
  "test/power.test.js": "Python, PowerPoint/Word, approvals, code interpreter, agent mode.",
  "test/productivity.test.js": "Tasks, notes, reminders, habits, focus, undo.",
  "test/security.test.js": "PIN lock, backup and restore, icons.",
  "test/select.test.js": "Which tools each request gets.",
  "test/services.test.js": "Tool names, read-only tools, scheduler, audio.",
  "test/student.test.js": "Timetable, exams, class alerts, clipboard, health breaks.",
  "test/wake.test.js": "\"Hey Maya\" wake word and stop phrases.",
  "test/workflows.test.js": "Workflows: 3 real steps, cancel, pause/resume, retry, approval, schedule.",
};

/** DESCRIPTIONS first; otherwise a comment on the file's first line. */
const about = (f) => {
  const top = readFileSync(join(root, f), 'utf8').split('\n').find((l) => l.trim());
  const m = top?.match(/^\s*(?:\/\/|\/\*\*?|<!--)\s*(.+?)\s*(?:\*\/|-->)?$/);
  return DESCRIPTIONS[f] || (m ? m[1] : '');
};
const lines = (f) => readFileSync(join(root, f), 'utf8').split('\n').length;

let guide = `# Maya ${version} — source code guide\n\nEvery source file, in reading order, grouped by the modules of the AETHER project report. `
  + `${listed.length} files, ${listed.reduce((n, f) => n + lines(f), 0).toLocaleString('en')} lines. Languages: JavaScript (Node.js + React), HTML, CSS; C# and PowerShell inside src/main/services/pc.js; Windows batch files.\n\n`
  + 'Start here: `start.bat` runs Maya from this folder; `install.bat` installs the latest release on another PC.\n';
let listing = `# Maya ${version} — full source listing\n\nSame order as CODE_GUIDE.md.\n`;
for (const [title, desc, files] of MODULES) {
  guide += `\n## ${title}\n\n${desc}\n\n| # | File | Lines | What it does |\n|---|---|---|---|\n`;
  files.forEach((f, i) => { guide += `| ${i + 1} | [${f}](../${f}) | ${lines(f)} | ${about(f).replace(/\|/g, '\\|')} |\n`; });
  listing += `\n## ${title}\n`;
  for (const f of files) listing += `\n### ${f}\n\n\`\`\`${lang(f)}\n${readFileSync(join(root, f), 'utf8').trimEnd()}\n\`\`\`\n`;
}
writeFileSync(join(root, 'docs', 'CODE_GUIDE.md'), guide);
writeFileSync(join(root, 'docs', 'SOURCE-LISTING.md'), listing);

// Zip: the project without dependencies, builds or downloaded models.
const stage = mkdtempSync(join(tmpdir(), 'ather-src-')), dest = join(stage, `Maya-${version}-source`);
for (const p of ['src', 'scripts', 'test', 'assets', 'docs', 'package.json', 'package-lock.json', 'vite.config.js', 'README.md', 'start.bat', 'install.bat', 'share']) {
  if (existsSync(join(root, p))) cpSync(join(root, p), join(dest, p), { recursive: true, filter: (s) => !/[\\/]_[^\\/]*\.mjs$/.test(s) });
}
mkdirSync(join(root, 'release'), { recursive: true });
const zip = join(root, 'release', `Maya-${version}-source.zip`);
rmSync(zip, { force: true });
execFileSync(join(process.env.SystemRoot, 'System32', 'tar.exe'), ['-a', '-c', '-f', zip, '-C', stage, `Maya-${version}-source`]);
rmSync(stage, { recursive: true, force: true });

// For the guide: the same files arranged in one folder per module, in report order (each keeps its path inside).
const byModule = join(root, 'release', `Maya-${version}-code-by-module`);
rmSync(byModule, { recursive: true, force: true });
const intro = join(byModule, '00 Read me first');
mkdirSync(intro, { recursive: true });
for (const f of ['docs/CODE_GUIDE.md', 'docs/Maya-source-code.pdf', 'README.md']) if (existsSync(join(root, f))) cpSync(join(root, f), join(intro, f.split('/').pop()));
MODULES.forEach(([title, , files], n) => {
  const folder = `${String(n + 1).padStart(2, '0')} ${title.replace(/^\d+\.\s*/, '').replace(/&/g, 'and').replace(/[\\/:*?"<>|]/g, '')}`;
  for (const f of files) cpSync(join(root, f), join(byModule, folder, f));
});
const zip2 = `${byModule}.zip`;
rmSync(zip2, { force: true });
execFileSync(join(process.env.SystemRoot, 'System32', 'tar.exe'), ['-a', '-c', '-f', zip2, '-C', join(root, 'release'), `Maya-${version}-code-by-module`]);
console.log(`${listed.length} files → docs/CODE_GUIDE.md, docs/SOURCE-LISTING.md, ${zip}, ${zip2}`);
