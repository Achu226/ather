import { ipcMain, dialog, BrowserWindow, shell, app, screen } from 'electron';
import { createBackup, unpackBackup, applyBackup } from './backup.js';
import { writeFileSync, readFileSync } from 'node:fs';
import { extractText } from './services/docs.js';
import { join } from 'node:path';
import { ask, complete, updateSummary, followUps } from './brain.js';
import { requestApproval } from './approvals.js';
import { weather } from './services/briefing.js';
import { PROVIDER_PRESETS } from './providers.js';
import { approvedFolders } from './services/mcp-presets.js';
import { basename } from 'node:path';
import { availableModes, MODES, LITE, isLite } from './models.js';
import { now } from './store.js';
import { allTools } from './tools/index.js';
import { toSendKeys } from './tools/computer.js';
import { speakReply } from './speech.js';
import { allPersonalities, KOKORO_VOICES } from './personality.js';
import { imagesDir } from './paths.js';
import { ensureOllama, hasModel, pullModel, ensureBrainModel } from './ollama.js';
import { BRAIN_MODEL, BASE_MODEL } from './brain.js';
import { ollamaModels, hfModels, fileModels, hfInstalled, fileInstalled, downloadFile } from './ml/catalog.js';
import { systemCheck } from './services/syscheck.js';
import { MAIL_PRESETS } from './services/mail.js';
import { careDone } from './services/scheduler.js';
import { fixHeard, learnWord, wordFixes, saveFeedback, reflect } from './services/learning.js';
import { learnSkill, saveSkill } from './services/skills.js';
import { workToday } from './services/worklog.js';
import { chromeProfiles } from './services/pc.js';
import { finishDictation } from './services/dictate.js';
import { interpretTurn } from './services/interpreter.js';
import { pasteText, pasteClip } from './dictation.js';

export const READ_ONLY_TOOL = /_(query|status|progress|list|files|history)$|^(web_|files_search|mail_(triage|search|read|promotions)|open_)/;

// While locked only these work; settings:get is limited to how things look.
const OPEN_WHEN_LOCKED = new Set(['lock:status', 'lock:unlock', 'settings:get', 'theme:resolved']);
const LOOK_SETTINGS = new Set(['theme', 'faceStyle', 'faceMode', 'motion', 'a11yLarge']);

export function registerIpc({ store, ml, services, secrets, windows, mcp, theme, lock, updater }) {
  const ctx = { store, services };
  const running = new Map(); // ask id -> AbortController
  const changed = () => windows.broadcast('data:changed');
  // The listening language; choosing Tamil fetches the Tamil-trained model once, in the background.
  let fetchingTamil = false;
  const listenLanguage = () => {
    const lang = store.getSetting('listenLanguage', null);
    if (/^(ta|tamil)$/i.test(lang || '') && !fetchingTamil && !fileInstalled('tamilears')) {
      fetchingTamil = true;
      downloadFile('tamilears').catch(() => { fetchingTamil = false; });
    }
    return lang;
  };
  // Handlers get only what the screen sent. The few that need the sender use withEvent and get it first:
  // appended last, it filled any optional argument the screen left out (Test connection sent it as the model name).
  const guarded = (channel, call) => ipcMain.handle(channel, (event, ...args) => {
    if (lock.locked && (!OPEN_WHEN_LOCKED.has(channel) || (channel === 'settings:get' && !LOOK_SETTINGS.has(args[0])))) {
      throw new Error('Maya is locked. Enter your PIN to unlock.');
    }
    return call(event, args);
  });
  const handle = (channel, fn) => guarded(channel, (_, args) => fn(...args));
  const withEvent = (channel, fn) => guarded(channel, (event, args) => fn(event, ...args));

  handle('theme:resolved', () => theme.resolved());

  // ---------- PIN lock ----------
  handle('lock:status', () => ({ enabled: lock.enabled(), locked: lock.locked }));
  handle('lock:unlock', (pin) => lock.unlock(pin));
  handle('lock:now', () => lock.lock());
  handle('lock:set', (currentPin, newPin) => lock.setPin(currentPin, newPin));

  // ---------- backup / restore ----------
  let pendingRestore = null;
  withEvent('backup:create', async (event) => {
    const dir = (await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), { title: 'Choose where to save the backup', defaultPath: join(app.getPath('documents'), 'Maya'), properties: ['openDirectory', 'createDirectory'] })).filePaths[0];
    return dir ? createBackup(store, dir) : null;
  });
  /** Step 1: pick and check a backup file. The renderer then asks the user to confirm. */
  withEvent('backup:choose', async (event) => {
    const zip = (await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), { filters: [{ name: 'Maya backup', extensions: ['zip'] }], properties: ['openFile'] })).filePaths[0];
    if (!zip) return null;
    pendingRestore = unpackBackup(zip);
    return { file: basename(zip) };
  });
  /** Step 2: replace the data with the checked backup and restart. */
  handle('backup:apply', () => {
    if (!pendingRestore) throw new Error('Choose a backup first.');
    store.db.close();
    applyBackup(pendingRestore);
    app.relaunch();
    app.exit(0);
  });

  // ---------- updates ----------
  handle('update:status', () => updater.status());
  handle('update:check', () => updater.check());
  handle('update:install', () => updater.install());

  // ---------- chat ----------
  const newConversation = (title = 'New chat') =>
    Number(store.run('INSERT INTO conversations (title, created_at, updated_at) VALUES (?,?,?)', title, now(), now()).lastInsertRowid);
  // The notch keeps one running conversation so "open in chat" can continue it.
  const notchConversation = () => {
    const id = store.getSetting('notchConversation');
    if (id && store.get('SELECT id FROM conversations WHERE id = ?', id)) return id;
    const fresh = newConversation('Quick questions');
    store.setSetting('notchConversation', fresh);
    return fresh;
  };

  async function autoTitle(conversationId, question) {
    const conv = store.get('SELECT title FROM conversations WHERE id = ?', conversationId);
    if (conv?.title !== 'New chat') return;
    const title = (await complete(`Give a 2 to 5 word title for a chat that starts with: "${question.slice(0, 300)}". Reply with the title only, no quotes.`))
      .replace(/["*#\n]/g, '').trim().slice(0, 60);
    if (title) { store.run('UPDATE conversations SET title = ? WHERE id = ?', title, conversationId); changed(); }
  }

  withEvent('ask', async (event, { id, text, images = [], conversationId, style = 'short', mode = 'auto' }) => {
    const controller = new AbortController();
    running.set(id, controller);
    const conv = conversationId || notchConversation();
    // Save attached pictures so tools (e.g. images_blur) can work on them by path.
    const paths = images.map((url, i) => {
      const file = join(imagesDir, `attached-${Date.now()}-${i}.png`);
      writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
      return file;
    });
    const fullText = paths.length ? `${text}\n(Attached image saved at: ${paths.join(', ')})` : text;
    try {
      const answer = await ask({
        text: fullText, images, store, tools: [...allTools, ...services.mcpClient.tools()], signal: controller.signal, conversationId: conv, style, mode,
        services: { ...services, confirm: (req) => requestApproval(event.sender, { ...req, askId: id }, controller.signal) },
        onEvent: (e) => { if (!event.sender.isDestroyed()) event.sender.send('ask:event', { id, ...e }); if (e.type === 'tool' && !READ_ONLY_TOOL.test(e.name)) changed(); },
      });
      changed();
      autoTitle(conv, text).catch(() => {});
      updateSummary(store, conv).catch(() => {});
      // Think back on what the user said and keep the lasting facts (local model, in the background).
      reflect(store, text, answer, (p, o) => complete(p, o)).then((kept) => kept.length && changed()).catch(() => {});
      // A job that worked and no skill covered becomes a skill offer; it is kept only if the user says yes.
      const done = store.get("SELECT tools FROM messages WHERE conversation_id = ? AND role = 'assistant' ORDER BY id DESC LIMIT 1", conv);
      learnSkill(store, text, JSON.parse(done?.tools || '[]'), (p, o) => complete(p, o))
        .then(async (skill) => { if (skill && await requestApproval(event.sender, { name: 'skills_learn', args: skill })) { saveSkill(store, skill); changed(); } })
        .catch(() => {});
      return answer;
    } finally {
      running.delete(id);
    }
  });
  handle('ask:cancel', (id) => running.get(id)?.abort());
  handle('chat:modes', availableModes);

  // ---------- MCP servers Maya connects to ----------
  const mcpc = services.mcpClient;
  handle('mcp:servers', () => mcpc.configs());
  handle('files:approved', () => approvedFolders(store));
  handle('computer:log', () => services.computer.log());
  handle('timetable:import', async (path) => {
    const image = /\.(png|jpe?g|webp|bmp)$/i.test(path);
    const text = image ? '' : (await extractText(path)).slice(0, 12000);
    const prompt = 'Read this class timetable and list every weekly class. Days are full lowercase English weekday names; times are 24-hour HH:MM.\n'
      + 'Reply as JSON {"classes": [{"day": "monday", "start": "09:00", "end": "09:50", "subject": "DBMS", "room": "A-204 or empty"}]}.'
      + (text ? `\n\nTimetable:\n${text}` : '');
    const out = await complete(prompt, { format: 'json', images: image ? [readFileSync(path).toString('base64')] : undefined });
    // Empty cells ("-", free periods) are not classes.
    return (JSON.parse(out).classes || []).filter((c) => c.subject?.trim() && !/^[-–—]+$|^free$/i.test(c.subject.trim()));
  });
  // Emergencies must work even while Maya is PIN-locked: these skip the lock check on purpose.
  ipcMain.handle('voice:command', (_, c) => {
    if (lock.locked && !['sos', 'cancel', 'later'].includes(c?.cmd)) throw new Error('Maya is locked. Enter your PIN to unlock.');
    services.lastVoice = Date.now();
    return services.voiceControl.run(c);
  });
  ipcMain.handle('sos:trigger', (_, reason) => services.sos.trigger(reason || 'pressed the help button'));
  ipcMain.handle('sos:cancel', () => services.sos.cancel());
  ipcMain.handle('sos:stop', () => services.sos.stopAlarm());
  // The shutdown warning can be stopped while locked too: nobody should lose their work to a timer.
  ipcMain.handle('session:extend', () => services.session.extend(15));
  ipcMain.handle('session:cancel', () => services.session.cancel());
  ipcMain.handle('care:done', (_, id) => { careDone(store, Number(id)); changed(); return true; });
  handle('sos:test', () => services.sos.test());
  handle('sos:testCall', () => services.sos.testCall());
  handle('sos:log', () => store.getSetting('sosLog', []));
  ipcMain.on('voice:heard', () => { services.lastVoice = Date.now(); });
  handle('headmouse:set', (on) => services.headMouse.set(on));
  handle('headmouse:model', async () => readFileSync(await downloadFile('facemesh')));
  // While switch scanning, a mouth-open "click" is the switch instead.
  handle('headmouse:click', (button) => (services.voiceControl.mode === 'scan' && button !== 'right'
    ? services.voiceControl.press() : services.pc.clickHere(button === 'right' ? 'right' : 'left')));
  ipcMain.on('headmouse:dwell', (_, progress) => windows.ring(progress > 0 ? { progress, at: screen.getCursorScreenPoint(), bounds: screen.getPrimaryDisplay().bounds } : null));
  // ---- on-screen keyboard: keys go to the app with the focus (the keyboard window never takes it) ----
  handle('keyboard:key', async (k) => {
    if (k.text) await services.pc.type(k.text);
    else if (k.keys) await services.pc.keys(toSendKeys(k.keys));
    return true;
  });
  handle('keyboard:suggest', (prefix) => services.keyboard.suggest(prefix));
  handle('keyboard:learn', (word) => services.keyboard.learn(word));
  handle('keyboard:set', (on) => { services.voiceControl.run({ cmd: 'keyboard', on }); return on; });
  // Cursor moves arrive many times a second: plain messages, no reply. x, y are 0..1 of the main screen.
  ipcMain.on('headmouse:move', (_, x, y) => {
    const { bounds } = screen.getPrimaryDisplay();
    // Scaled (DIP) coordinates, like Electron's; the PC helper converts them to real pixels.
    services.pc.move(bounds.x + Math.min(1, Math.max(0, x)) * (bounds.width - 1), bounds.y + Math.min(1, Math.max(0, y)) * (bounds.height - 1));
  });
  handle('system:status', async (apps) => (await import('./services/sysmon.js')).systemStatus({ apps }));
  handle('prompter:set', (on, script) => services.prompter.set(on, script));
  // The 9B translates much more faithfully (tested round trip English → Tamil → English); the 4B is the fallback.
  handle('interpret:turn', (audio, lang) => interpretTurn(audio, lang, { ml, complete: (p) => complete(p, { model: 'ather-smart' }).catch(() => complete(p)) }));
  handle('clipboard:paste', async (text) => { windows.collapse(); await new Promise((r) => setTimeout(r, 120)); await pasteClip(text); return true; });
  handle('clipboard:clear', () => services.clipboard.clear());
  handle('captions:set', (on, opts) => services.captions.set(on, opts));
  handle('captions:transcribe', (audio, translate) => ml.call('transcribe', audio, translate ? null : listenLanguage(), translate ? 'translate' : 'transcribe'));
  handle('workflows:tools', () => allTools.filter((t) => !t.name.startsWith('routines_')).map(({ name, description }) => ({ name, description })));
  handle('workflows:runs', () => services.workflows.runs());
  handle('workflows:control', (id, action) => {
    if (!['pause', 'resume', 'cancel', 'retry'].includes(action)) throw new Error(`Unknown action ${action}`);
    services.workflows[action](id).done?.catch(() => {});
    return true;
  });
  handle('workflows:start', (name) => { services.workflows.start(name).done.catch(() => {}); return true; });
  handle('workflows:draft', async (text) => {
    const tools = allTools.filter((t) => !t.name.startsWith('routines_'))
      .map((t) => `${t.name}(${Object.keys(t.parameters?.properties || {}).join(', ')}): ${t.description.split('. ')[0]}`).join('\n');
    const out = await complete(`Turn this request into an automation workflow for a desktop assistant. Use ONLY these tools, with their argument names:\n${tools}\n\nRequest: ${text}\n\nReply as JSON {"name": short lowercase name, "steps": [{"tool": tool name, "args": {...}}]}: one step per action, in order.`, { model: 'ather-smart', format: 'json' });
    const draft = JSON.parse(out);
    draft.steps = (draft.steps || []).filter((s) => allTools.some((t) => t.name === s.tool && !t.name.startsWith('routines_')));
    return draft;
  });
  withEvent('memory:export', async (event) => {
    const file = (await dialog.showSaveDialog(BrowserWindow.fromWebContents(event.sender), { defaultPath: join(app.getPath('documents'), 'ather-memories.json'), filters: [{ name: 'JSON', extensions: ['json'] }] })).filePath;
    if (!file) return null;
    writeFileSync(file, JSON.stringify(store.all('SELECT fact, category, created_at, updated_at FROM memories WHERE deleted = 0'), null, 2));
    return file;
  });
  handle('computer:stop', () => { services.computer.stop('stopped by you'); services.onComputerStop(); });
  handle('mcp:save', async (id, patch) => {
    mcpc.save(id, patch);
    if (patch.enabled === false) await mcpc.disconnect(id);
    changed();
    return mcpc.configs().find((c) => c.id === id);
  });
  handle('mcp:connect', async (id) => { mcpc.save(id, { enabled: true }); const s = await mcpc.connect(id); changed(); return s; });
  handle('mcp:disconnect', async (id) => { await mcpc.disconnect(id); changed(); });
  handle('mcp:remove', async (id) => { await mcpc.remove(id); changed(); });
  /** "Try a tool" on the MCP page: really runs it, so working tools are verified, not assumed. */
  handle('mcp:call', (id, name, args) => mcpc.call(id, name, args || {}));

  // ---------- model providers (Ollama, LM Studio, cloud) ----------
  const providers = services.providers;
  handle('providers:list', () => providers.list());
  handle('providers:presets', () => PROVIDER_PRESETS);
  handle('providers:save', (id, patch, apiKey) => providers.save(id, patch, apiKey));
  handle('providers:remove', (id) => providers.remove(id));
  handle('providers:test', (id, model) => providers.test(id, model));
  handle('providers:usage', () => providers.usageSummary());
  let modelCache = { at: 0, items: [] };
  /** Every model the chat menu can offer: all local Ollama models plus enabled providers' models. */
  handle('providers:chatModels', async (refresh) => {
    if (!refresh && Date.now() - modelCache.at < 5 * 60_000) return modelCache.items;
    const items = [];
    for (const p of providers.list().filter((x) => x.enabled)) {
      try {
        for (const m of await providers.models(p.id)) {
          if (/embed/i.test(m) || /^ather-/.test(m)) continue;
          items.push({ value: `p:${p.id}:${m}`, label: `${m} · ${p.name}${p.local ? '' : ' ☁'}`, local: p.local });
        }
      } catch { /* provider offline: skip it; the Models page shows the error */ }
    }
    modelCache = { at: Date.now(), items };
    return items;
  });
  handle('chat:followups', (question, answer) => followUps(question, answer).catch(() => []));
  handle('chat:notchConversation', notchConversation);
  handle('chat:conversations', () => store.all('SELECT * FROM conversations ORDER BY updated_at DESC'));
  handle('chat:new', () => newConversation());
  handle('chat:rename', (cid, title) => { store.run('UPDATE conversations SET title = ? WHERE id = ?', title.slice(0, 80), cid); changed(); });
  handle('chat:delete', (cid) => {
    store.run('DELETE FROM messages WHERE conversation_id = ?', cid);
    for (const d of services.docs.list(cid)) services.docs.remove(d.id);
    store.run('DELETE FROM conversations WHERE id = ?', cid);
    changed();
  });
  handle('chat:messages', (cid) => store.all('SELECT * FROM messages WHERE conversation_id IS ? ORDER BY id', cid));
  /** Remove the last question + answer so the renderer can ask it again; returns the question. */
  handle('chat:regenerate', (cid) => {
    const last = store.all('SELECT * FROM messages WHERE conversation_id = ? ORDER BY id DESC LIMIT 2', cid);
    const question = last.find((m) => m.role === 'user');
    if (!question) return null;
    for (const m of last) store.run('DELETE FROM messages WHERE id = ?', m.id);
    changed();
    return question.content.replace(/\n\(Attached image saved at:[^)]*\)/, '');
  });
  handle('chat:clear', () => { store.run('DELETE FROM messages'); store.run('DELETE FROM conversations'); changed(); });

  // ---------- documents attached to a conversation ----------
  handle('docs:add', async (cid, path) => {
    // Spreadsheets also go to the Python work folder so the code interpreter can open them by name.
    if (/\.(csv|xlsx|xls)$/i.test(path)) services.python.addFile(cid, path);
    const name = basename(path);
    const d = /\.xlsx?$/i.test(path)
      ? await services.docs.addText(cid, name, `Spreadsheet "${name}" is in the Python working folder. To answer questions about it, use python_run with pandas.read_excel("${name}").`, path)
      : await services.docs.add(cid, path);
    changed();
    return d;
  });
  handle('docs:list', (cid) => services.docs.list(cid));
  handle('docs:remove', (docId) => { services.docs.remove(docId); changed(); });

  // ---------- lectures ----------
  handle('lecture:start', (title, source) => services.lectures.start(title, source));
  handle('lecture:append', (id, text) => services.lectures.append(id, text));
  handle('lecture:finish', async (id, minutes) => { const l = await services.lectures.finish(id, minutes); changed(); return l; });
  handle('lecture:list', () => services.lectures.list());
  handle('lecture:get', (id) => services.lectures.get(id));
  handle('lecture:delete', (id) => { services.lectures.remove(id); changed(); });
  handle('lecture:study', async (id, kind) => {
    const l = services.lectures.get(id);
    const set = await services.study.create({ kind, topic: l.title, text: `${l.notes || ''}\n\n${l.transcript}` });
    changed();
    return set;
  });
  /** Opens a chat with the lecture transcript attached, so the user can ask questions about it. */
  handle('lecture:chat', async (id) => {
    const l = services.lectures.get(id);
    const cid = newConversation(`About: ${l.title}`.slice(0, 60));
    await services.docs.addText(cid, `${l.title} (transcript)`, l.transcript);
    changed();
    return cid;
  });

  // ---------- study ----------
  handle('study:create', async (args) => { const s = await services.study.create(args); changed(); return s; });
  handle('study:list', () => services.study.list());
  handle('study:get', (sid) => services.study.get(sid));
  handle('study:attempt', (sid, score, total) => { services.study.attempt(sid, score, total); changed(); });
  handle('study:delete', (sid) => { store.update('study_sets', sid, { deleted: 1 }, 'Deleted study set'); changed(); });

  // ---------- voice ----------
  handle('speak', (text) => speakReply(text, { ml, store, providers: services.providers }));
  handle('transcribe', async (audio) => fixHeard(store, await ml.call('transcribe', audio, listenLanguage())));
  // Learning: the user fixed what Maya heard before sending it; 👍 / 👎 on an answer.
  handle('learn:edited', (heard, sent) => wordFixes(heard, sent).map(([h, m]) => learnWord(store, h, m)));
  handle('feedback', (f) => saveFeedback(store, f || {}));
  handle('work:today', () => workToday(store, 150));
  handle('chrome:profiles', () => chromeProfiles());
  // Nod / shake in the head mouse answers the oldest open approval card (in the face window or the app).
  handle('headmouse:gesture', (g) => { windows.broadcast('approval:gesture', g === 'yes'); return true; });
  handle('transcribe:quick', (audio) => ml.call('transcribeQuick', audio));
  handle('dictation:result', async (audio) => {
    const heard = fixHeard(store, await ml.call('transcribe', audio, listenLanguage()));
    const text = await finishDictation(heard, store.getSetting('dictationStyle', 'clean'), (p) => complete(p));
    if (text) await pasteText(text);
    return text;
  });

  // ---------- tools for the app screens (same handlers the AI uses) ----------
  withEvent('tool', async (event, name, args = {}) => {
    const tool = [...allTools, ...services.mcpClient.tools()].find((t) => t.name === name);
    if (!tool) throw new Error(`Unknown tool ${name}`);
    const confirm = (req) => requestApproval(event.sender, req);
    if (tool.confirm && !(await confirm({ name, args }))) return { denied: true };
    const result = await tool.run(args, { ...ctx, services: { ...services, confirm } });
    // Only changes are announced: screens reload on "data:changed", so announcing reads would loop forever.
    if (!READ_ONLY_TOOL.test(name)) changed();
    return result;
  });

  // ---------- settings ----------
  handle('settings:get', (key, fallback) => (key.startsWith('secret:') ? null : store.getSetting(key, fallback)));
  handle('settings:set', (key, value) => {
    if (key.startsWith('secret:')) throw new Error('Use secret:set');
    store.setSetting(key, value);
    if (key === 'calendarFeeds') services.calendarFeeds.refresh();
    if (key === 'mcpEnabled') mcp.set(value);
    if (key === 'theme') theme.apply();
    if (key === 'liteBrain') services.useLite?.(!!value).catch(() => {});
    if (key === 'holdToTalk') (value ? services.holdKeys?.start() : services.holdKeys?.stop());
    if (key === 'startWithWindows' && app.isPackaged) app.setLoginItemSettings({ openAtLogin: !!value });
    windows.broadcast('settings:changed', key, value);
  });
  handle('secret:set', (name, value) => secrets.set(name, value));
  handle('secret:has', (name) => secrets.has(name));
  handle('personalities', () => Object.entries(allPersonalities(store.getSetting('customPersonalities', [])))
    .map(([id, p]) => ({ id, label: p.label, voice: p.voice, custom: !!p.custom })));
  handle('voices', () => KOKORO_VOICES);
  handle('weather', (city) => weather(city));
  handle('speak:test', (text, voice) => ml.call('speak', text, voice));
  handle('mail:presets', () => MAIL_PRESETS);
  handle('mcp:status', () => ({ enabled: !!store.getSetting('mcpEnabled', false), url: mcp.url }));

  // ---------- models ----------
  async function modelStatus() {
    const up = await ensureOllama();
    const list = [];
    // Only what this laptop can run: Lite laptops get the 2B instead of the 4B; the 9B needs a 6 GB card and 14 GB RAM.
    const { vramGB, ramGB } = await systemCheck();
    const lite = isLite();
    const skip = { brain: lite, lite: !lite, smart: lite || vramGB < 6 || ramGB < 14 };
    if (up) {
      await ensureBrainModel(BRAIN_MODEL, BASE_MODEL);
      await ensureBrainModel(MODES.smart.model, MODES.smart.base);
      if (lite) await ensureBrainModel(LITE.model, LITE.base);
    }
    for (const [key, m] of Object.entries(ollamaModels).filter(([k]) => !skip[k])) {
      const name = key === 'brain' ? BRAIN_MODEL : key === 'smart' ? MODES.smart.model : key === 'lite' ? LITE.model : m.name;
      list.push({ key, label: m.label, sizeMB: m.sizeMB, kind: 'ollama', installed: up && await hasModel(name) });
    }
    for (const [key, m] of Object.entries(hfModels)) list.push({ key, label: m.label, sizeMB: m.sizeMB, kind: 'hf', installed: hfInstalled(key) });
    for (const [key, m] of Object.entries(fileModels).filter(([, f]) => !f.optional && !(vramGB < (f.minVramGB || 0)))) list.push({ key, label: m.label, sizeMB: m.sizeMB, kind: 'file', installed: fileInstalled(key) });
    return { ollama: up, models: list };
  }
  handle('models:status', modelStatus);
  handle('models:download', async () => {
    const { ollama, models } = await modelStatus();
    if (!ollama) throw new Error('Ollama is not running. Install it from ollama.com, then press Download again.');
    for (const m of models.filter((x) => !x.installed)) {
      const progress = (p) => windows.broadcast('models:progress', { key: m.key, progress: p });
      if (m.kind === 'ollama') await pullModel(ollamaModels[m.key].name, progress);
      if (m.key === 'lite') await ensureBrainModel(LITE.model, LITE.base);
      if (m.kind === 'file') await downloadFile(m.key, progress);
      if (m.kind === 'hf') await ml.warm(m.key, (e) => e?.status === 'progress' && progress(e.progress / 100));
      windows.broadcast('models:progress', { key: m.key, progress: 1, done: true });
    }
    // OCR data comes with the "file" models; load it so the first blur is quick.
    await ml.warm('ocr');
    return modelStatus();
  });
  handle('syscheck', systemCheck);

  // ---------- search ----------
  handle('search:index', (folders) => services.search.index(folders, (done, total) => windows.broadcast('search:progress', { done, total })));
  handle('search:stats', () => services.search.stats());

  // ---------- files, dialogs, windows ----------
  withEvent('dialog:folder', async (event) => (await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), { properties: ['openDirectory'] })).filePaths[0] || null);
  withEvent('dialog:document', async (event) => (await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
    properties: ['openFile'], filters: [{ name: 'Documents', extensions: ['pdf', 'docx', 'txt', 'md', 'csv', 'xlsx', 'xls', 'json', 'html', 'py', 'java', 'js', 'c', 'cpp', 'sql'] }],
  })).filePaths[0] || null);
  withEvent('dialog:image', async (event) => (await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
    properties: ['openFile'], filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'] }],
  })).filePaths[0] || null);
  handle('open:app', (section) => windows.openApp(section));
  handle('open:path', (path) => shell.openPath(path));
  handle('open:folder', (path) => shell.showItemInFolder(path));
  handle('open:external', (url) => { if (/^https?:\/\//i.test(url)) return shell.openExternal(url); });

  // ---------- notch window state ----------
  ipcMain.on('notch:busy', (_, busy) => windows.setBusy(busy));
  ipcMain.on('notch:height', (_, h) => windows.setContentHeight(h));
  ipcMain.on('notch:collapse', () => windows.collapse());
}
