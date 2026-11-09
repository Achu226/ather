import { useEffect, useState } from 'react';
import ModelList from './ModelList.jsx';
import { Appearance, PersonalityEditor } from './Appearance.jsx';

const LANGUAGES = [['', 'Detect automatically'], ['english', 'English'], ['hindi', 'Hindi'], ['tamil', 'Tamil'], ['telugu', 'Telugu'],
  ['bengali', 'Bengali'], ['marathi', 'Marathi'], ['german', 'German'], ['french', 'French'], ['spanish', 'Spanish'],
  ['italian', 'Italian'], ['portuguese', 'Portuguese'], ['russian', 'Russian'], ['japanese', 'Japanese'], ['korean', 'Korean'], ['chinese', 'Chinese']];

export function useSetting(key, fallback) {
  const [value, setValue] = useState(fallback);
  useEffect(() => { window.ather.getSetting(key, fallback).then(setValue); }, []);
  return [value, (v) => { setValue(v); window.ather.setSetting(key, v); }];
}

const errText = (e) => e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

function Security() {
  const [status, setStatus] = useState({ enabled: false });
  const [form, setForm] = useState({ current: '', next: '', again: '' });
  const [msg, setMsg] = useState(null);
  const [after, setAfter] = useState(10);
  useEffect(() => { window.ather.lockStatus().then(setStatus); window.ather.getSetting('lockAfterMinutes', 10).then(setAfter); }, []);

  async function save(remove = false) {
    setMsg(null);
    if (!remove && form.next !== form.again) { setMsg({ bad: true, text: 'The two new PINs are different.' }); return; }
    try {
      const r = await window.ather.setPin(form.current, remove ? null : form.next);
      setStatus((s) => ({ ...s, enabled: r.enabled }));
      setForm({ current: '', next: '', again: '' });
      setMsg({ text: r.enabled ? 'PIN saved. Maya locks when you lock Windows or after you are away.' : 'PIN removed.' });
    } catch (e) { setMsg({ bad: true, text: errText(e) }); }
  }
  const pinInput = (key, label) => (
    <input className="input" style={{ width: 150 }} type="password" inputMode="numeric" maxLength={8} placeholder={label} aria-label={label}
      value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value.replace(/\D/g, '') })} />
  );

  return (
    <div className="panel">
      <h2>🔒 PIN lock</h2>
      <p className="muted">{status.enabled ? 'Maya is protected with a PIN.' : 'Protect your chats, notes and data with a 4 to 8 digit PIN.'}</p>
      <div className="row wrap">
        {status.enabled && pinInput('current', 'Current PIN')}
        {pinInput('next', status.enabled ? 'New PIN' : 'PIN')}
        {pinInput('again', 'Repeat PIN')}
        <button className="btn primary" onClick={() => save(false)} disabled={form.next.length < 4}>{status.enabled ? 'Change PIN' : 'Set PIN'}</button>
        {status.enabled && <button className="btn danger" onClick={() => save(true)} disabled={form.current.length < 4}>Remove PIN</button>}
      </div>
      {msg && <p className={msg.bad ? 'bad' : 'ok'}>{msg.text}</p>}
      {status.enabled && (
        <div className="row wrap" style={{ marginTop: 10 }}>
          <span>Lock after</span>
          <select className="input" style={{ width: 150 }} value={after} onChange={(e) => { setAfter(Number(e.target.value)); window.ather.setSetting('lockAfterMinutes', Number(e.target.value)); }} aria-label="Lock after">
            {[[5, '5 minutes away'], [10, '10 minutes away'], [30, '30 minutes away'], [0, 'Only when Windows locks']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <button className="btn" onClick={() => window.ather.lockNow()}>Lock now</button>
        </div>
      )}
    </div>
  );
}

function BackupAndUpdates() {
  const [msg, setMsg] = useState(null);
  const [restore, setRestore] = useState(null);
  const [update, setUpdate] = useState(null);
  const [auto, setAuto] = useState(true);
  useEffect(() => {
    window.ather.updateStatus().then(setUpdate);
    window.ather.getSetting('autoBackup', true).then(setAuto);
    return window.ather.onUpdateStatus(setUpdate);
  }, []);

  async function backup() {
    setMsg(null);
    try { const zip = await window.ather.backupCreate(); if (zip) setMsg({ text: `Saved ${zip}`, path: zip }); } catch (e) { setMsg({ bad: true, text: errText(e) }); }
  }
  async function choose() {
    setMsg(null);
    try { setRestore(await window.ather.backupChoose()); } catch (e) { setMsg({ bad: true, text: errText(e) }); }
  }
  const updateText = {
    idle: '', checking: 'Checking…', latest: 'You have the latest version.', ready: `Version ${update?.available} is ready.`,
    downloading: `Downloading ${update?.available ?? ''}… ${update?.percent ?? 0}%`, error: update?.error,
  }[update?.state];

  return (
    <div className="panel">
      <h2>💾 Backup & updates</h2>
      <div className="row wrap">
        <button className="btn" onClick={backup}>Back up now…</button>
        <button className="btn" onClick={choose}>Restore from backup…</button>
        <label className="row"><input type="checkbox" className="check" checked={auto} onChange={(e) => { setAuto(e.target.checked); window.ather.setSetting('autoBackup', e.target.checked); }} /> Weekly automatic backup to Documents\Maya\Backups</label>
      </div>
      {msg && <p className={msg.bad ? 'bad' : 'ok'}>{msg.text} {msg.path && <button className="link" onClick={() => window.ather.showInFolder(msg.path)}>show</button>}</p>}
      {restore && (
        <div className="approval">
          <b>⚠ Restore “{restore.file}”?</b>
          <p>This replaces all your current tasks, notes, chats and settings with the backup, then restarts Maya.</p>
          <div className="row"><button className="btn danger" onClick={() => window.ather.backupApply()}>Replace and restart</button><button className="btn" onClick={() => setRestore(null)}>Cancel</button></div>
        </div>
      )}
      <div className="row wrap" style={{ marginTop: 14 }}>
        <span>Maya version <b>{update?.version}</b></span>
        <button className="btn small" onClick={() => window.ather.updateCheck()} disabled={update?.state === 'checking' || update?.state === 'downloading'}>Check for updates</button>
        {update?.state === 'ready' && <button className="btn small primary" onClick={() => window.ather.updateInstall()}>Restart and update</button>}
        <span className={update?.state === 'error' ? 'bad' : 'muted'}>{updateText}</span>
      </div>
    </div>
  );
}

function BriefingSettings() {
  const [s, setS] = useState({ briefingEnabled: true, briefingTime: '08:00', city: '', eveningReview: true, nudges: true });
  const [weather, setWeather] = useState(null);
  useEffect(() => {
    Promise.all(Object.entries(s).map(([k, v]) => window.ather.getSetting(k, v).then((x) => [k, x]))).then((pairs) => setS(Object.fromEntries(pairs)));
  }, []);
  const set = (k, v) => { setS((x) => ({ ...x, [k]: v })); window.ather.setSetting(k, v); };
  async function testCity() {
    setWeather('Checking…');
    try { const w = await window.ather.weather(s.city); setWeather(`${w.place}: ${w.now_c}°C now, ${w.sky}, high ${w.high_c}°C, ${w.rain_chance}% rain`); } catch (e) { setWeather(e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')); }
  }
  return (
    <div className="panel">
      <h2>Daily briefing & nudges</h2>
      <label className="row field"><input type="checkbox" className="check" checked={s.briefingEnabled} onChange={(e) => set('briefingEnabled', e.target.checked)} />
        Morning briefing at <input className="input" type="time" style={{ width: 120 }} value={s.briefingTime} onChange={(e) => set('briefingTime', e.target.value)} aria-label="Briefing time" /></label>
      <div className="row field">
        <input className="input" style={{ maxWidth: 260 }} placeholder="Your city, for the weather" value={s.city} onChange={(e) => set('city', e.target.value)} aria-label="City" />
        <button className="btn small" onClick={testCity} disabled={!s.city}>Test</button>
      </div>
      {weather && <p className="muted">{weather}</p>}
      <label className="row field"><input type="checkbox" className="check" checked={s.eveningReview} onChange={(e) => set('eveningReview', e.target.checked)} /> Evening review at 9 pm</label>
      <label className="row field"><input type="checkbox" className="check" checked={s.nudges} onChange={(e) => set('nudges', e.target.checked)} /> Gentle nudges (overdue tasks, habits, too much screen time)</label>
    </div>
  );
}

const HEALTH = [['water', '💧 Drink water'], ['eyes', '👀 20-20-20 eye break'], ['stretch', '🧘 Stretch / posture']];

function Extras() {
  const [health, setHealth] = useSetting('health', { water: 60, eyes: 20, stretch: 45 });
  const [clipOn, setClipOn] = useSetting('clipboardHistory', true);
  const [holdToTalk, setHoldToTalk] = useSetting('holdToTalk', true);
  const [dictationStyle, setDictationStyle] = useSetting('dictationStyle', 'clean');
  const [liteBrain, setLiteBrain] = useSetting('liteBrain', false);
  return (
    <div className="panel">
      <h2>Helpers</h2>
      <h3>Speed</h3>
      <label className="row field"><input type="checkbox" className="check" checked={!!liteBrain} onChange={(e) => setLiteBrain(e.target.checked)} />
        Lite brain (Qwen 3.5 2B): much faster on PCs without a graphics card or with 8 GB memory; answers are a little simpler</label>
      <p className="muted">Maya turns this on by herself on slower PCs. The first time, the 2.7 GB model downloads in the background.</p>
      <h3>Talk and type</h3>
      <label className="row field"><input type="checkbox" className="check" checked={holdToTalk} onChange={(e) => setHoldToTalk(e.target.checked)} />
        Hold <kbd>Right Ctrl</kbd> to talk to Maya, hold <kbd>Right Alt</kbd> to dictate into any app (let go to finish)</label>
      <label className="row field" htmlFor="dstyle">Dictation
        <select id="dstyle" className="input" style={{ maxWidth: 420 }} value={dictationStyle} onChange={(e) => setDictationStyle(e.target.value)}>
          <option value="clean">Clean: removes “um”, follows “actually, make that…”, says “comma” / “new line” / “bullet point”</option>
          <option value="polished">Polished: clean, plus the local AI fixes small slips</option>
          <option value="raw">Exactly as heard</option>
        </select></label>
      <h3>Health breaks</h3>
      <p className="muted">Counted only while you are using the computer, and held back during a focus session. 0 turns one off.</p>
      {HEALTH.map(([k, label]) => (
        <label className="row field" key={k}>{label} every
          <input className="input" type="number" min="0" max="240" style={{ width: 80 }} value={health[k]} onChange={(e) => setHealth({ ...health, [k]: Math.max(0, Number(e.target.value) || 0) })} aria-label={`${label} minutes`} /> minutes</label>
      ))}
      <h3>Clipboard history</h3>
      <label className="row field"><input type="checkbox" className="check" checked={clipOn} onChange={(e) => setClipOn(e.target.checked)} />
        Remember text I copy, so <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>V</kbd> can paste it later</label>
      <p className="muted">Kept in memory only and gone when Maya closes. Passwords and anything a password manager marks private are skipped.</p>
      <p className="muted">Head mouse, on-screen keyboard, switch scanning and emergency help are on the <b>Accessibility</b> page.</p>
      <h3>Live captions</h3>
      <p className="muted">Captions for any sound on your computer: videos, online classes, calls. <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>C</kbd> shows or hides them.</p>
      <div className="row">
        <button className="btn small" onClick={() => window.ather.captionsSet(true, { translate: false })}>Show captions</button>
        <button className="btn small" onClick={() => window.ather.captionsSet(true, { translate: true })}>Captions in English (translate)</button>
        <button className="btn small" onClick={() => window.ather.captionsSet(false)}>Hide</button>
      </div>
    </div>
  );
}

const MEMORY_ICONS = { preference: '⭐', project: '🛠', fact: '🧠' };

function Memories() {
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);
  const [msg, setMsg] = useState(null);
  const load = () => window.ather.tool('memory_list').then(setItems);
  useEffect(() => { load(); return window.ather.onDataChanged(load); }, []);
  const save = async () => { await window.ather.tool('memory_update', { id: editing.id, fact: editing.fact, category: editing.category }); setEditing(null); };
  return (
    <div className="panel">
      <div className="row"><h2>What Maya remembers about you</h2><span className="spacer" />
        <button className="btn small" onClick={async () => { const f = await window.ather.exportMemories(); if (f) setMsg(`Saved ${f}`); }}>Export</button></div>
      <p className="muted">Lasting things you mention (preferences, projects, facts like exam dates) are used in every chat. Passwords, keys and codes are never saved. Edit or forget anything here.</p>
      {msg && <p className="ok">{msg}</p>}
      {!items.length && <p className="empty">Nothing yet.</p>}
      <ul className="list">
        {items.map((m) => (
          <li className="item" key={m.id}>
            {editing?.id === m.id ? (
              <>
                <select className="input" style={{ width: 130 }} value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })} aria-label="Category">
                  <option value="preference">Preference</option><option value="project">Project</option><option value="fact">Fact</option>
                </select>
                <input className="input" value={editing.fact} onChange={(e) => setEditing({ ...editing, fact: e.target.value })} aria-label="Memory" />
                <button className="btn small primary" onClick={save}>Save</button>
              </>
            ) : (
              <>
                <span className="item-title">{MEMORY_ICONS[m.category] || '🧠'} {m.fact} <small className="muted">· {m.category || 'fact'}</small></span>
                <button className="btn small" onClick={() => setEditing({ id: m.id, fact: m.fact, category: m.category || 'fact' })}>Edit</button>
                <button className="btn small" onClick={() => window.ather.tool('memory_forget', { id: m.id })} aria-label={`Forget ${m.fact}`}>Forget</button>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Settings() {
  const [personality, setPersonality] = useSetting('personality', 'normal');
  const [speakAlways, setSpeakAlways] = useSetting('speakAlways', false);
  const [faceMode, setFaceMode] = useSetting('faceMode', 'face');
  const [listenLanguage, setListenLanguage] = useSetting('listenLanguage', null);
  const [feeds] = useSetting('calendarFeeds', []);
  const [mcpEnabled, setMcpEnabled] = useSetting('mcpEnabled', false);
  const [wakeWord, setWakeWord] = useSetting('wakeWord', true);
  const [startWithWindows, setStartWithWindows] = useSetting('startWithWindows', false);
  const [personalities, setPersonalities] = useState([]);
  const [mcp, setMcp] = useState(null);
  const [check, setCheck] = useState(null);

  useEffect(() => {
    window.ather.personalities().then(setPersonalities);
    window.ather.mcpStatus().then(setMcp);
  }, []);

  const mcpConfig = mcp && JSON.stringify({ mcpServers: { ather: { type: 'http', url: mcp.url } } }, null, 2);

  return (
    <>
      <h1 className="page-title">Settings</h1>
      <p className="page-sub">Everything stays on this computer.</p>

      <div className="grid">
        <div className="panel">
          <h2>Personality & voice</h2>
          <div className="field"><label htmlFor="pers">How Maya talks</label>
            <select id="pers" className="input" value={personality} onChange={(e) => setPersonality(e.target.value)}>
              {personalities.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
          <label className="row field"><input type="checkbox" className="check" checked={speakAlways} onChange={(e) => setSpeakAlways(e.target.checked)} />
            Speak every answer (otherwise only when you talk to Maya)</label>
          <div className="field"><label htmlFor="lang">Language you speak to Maya</label>
            <select id="lang" className="input" value={listenLanguage || ''} onChange={(e) => setListenLanguage(e.target.value || null)}>
              {LANGUAGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        </div>

        <div className="panel">
          <h2>Top of the screen</h2>
          <div className="field"><label htmlFor="fm">What the notch shows</label>
            <select id="fm" className="input" value={faceMode} onChange={(e) => setFaceMode(e.target.value)}>
              <option value="face">Maya's face + text box</option>
              <option value="text">Just the text box</option>
            </select>
          </div>
          <label className="row field"><input type="checkbox" className="check" checked={startWithWindows} onChange={(e) => setStartWithWindows(e.target.checked)} />
            Start Maya when Windows starts</label>
          <label className="row field"><input type="checkbox" className="check" checked={wakeWord} onChange={(e) => setWakeWord(e.target.checked)} />
            Say “Hey Maya” to start a voice chat (keeps the microphone on; everything stays on this computer)</label>
          <p className="muted">Open it by moving the mouse to the very top of the screen, or with <kbd>Ctrl</kbd>+<kbd>Space</kbd>.
            Type with your voice in any app with <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Space</kbd> (press again to stop).</p>
        </div>

        <div className="panel">
          <h2>Connect an AI agent (MCP)</h2>
          <label className="row field"><input type="checkbox" className="check" checked={mcpEnabled} onChange={(e) => setMcpEnabled(e.target.checked)} />
            Let Claude, Codex or your own agent use Maya</label>
          <p className="muted">They can read your day, add tasks, take notes and play face animations. Only programs on this computer can connect.</p>
          {mcpEnabled && mcpConfig && <div className="code">{mcpConfig}</div>}
          {mcpEnabled && <p className="muted">Claude Code: <span className="code" style={{ display: 'inline' }}>claude mcp add --transport http ather {mcp?.url}</span></p>}
        </div>
      </div>

      <div style={{ marginTop: 16 }}><Appearance /></div>
      <PersonalityEditor />

      <div className="panel">
        <h2>Calendars, email, phone and accounts</h2>
        <p className="muted">{feeds.length ? `${feeds.length} calendar(s) connected. ` : ''}Google Calendar, Gmail, WhatsApp, your phone and Chrome accounts are all on the Connections page.</p>
      </div>

      <div className="panel">
        <h2>AI models</h2>
        <ModelList />
      </div>

      <div className="panel">
        <div className="row"><h2>Can my computer run it?</h2><span className="spacer" />
          <button className="btn" onClick={() => window.ather.systemCheck().then(setCheck)}>Check my computer</button></div>
        {check && (
          <>
            <ul className="list">
              {check.checks.map((c) => <li className="item" key={c.name}><span className={c.ok ? 'ok' : 'bad'}>{c.ok ? '✓' : '✗'}</span><span className="item-title"><b>{c.name}:</b> {c.value}</span></li>)}
            </ul>
            <p><b>{check.verdict}</b></p>
          </>
        )}
      </div>

      <BriefingSettings />
      <Extras />
      <Memories />
      <Security />
      <BackupAndUpdates />

      <div className="panel">
        <h2>Your data</h2>
        <button className="btn danger" onClick={() => { if (confirm('Delete the whole chat history?')) window.ather.clearChat(); }}>Delete chat history</button>
      </div>
    </>
  );
}
