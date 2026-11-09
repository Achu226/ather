import { useEffect, useState } from 'react';
import { useSetting } from './Settings.jsx';
import { useData, tool } from './useData.js';
import MicButton from '../shared/MicButton.jsx';
import { playSpeech } from '../shared/audio.js';

const LOCAL_VOICES = [['af_heart', 'Heart (warm, female)'], ['af_bella', 'Bella (bright, female)'], ['af_nicole', 'Nicole (soft, female)'], ['bf_emma', 'Emma (British, female)'],
  ['am_michael', 'Michael (male)'], ['am_adam', 'Adam (deep, male)'], ['bm_george', 'George (British, male)']];
const OPENAI_VOICES = ['nova', 'alloy', 'shimmer', 'coral', 'sage', 'echo', 'onyx', 'fable', 'ash', 'ballad'];
const PRESETS = {
  Calm: { theme: 'light', accent: '#12b886', face: 'mint' },
  Night: { theme: 'dark', accent: '#8b7dff', face: 'midnight' },
  Sunrise: { theme: 'light', accent: '#f76707', face: 'sunset' },
  'Tamil classic': { theme: 'light', accent: '#8b1e3f', face: 'pink' },
  'High contrast': { theme: 'dark', accent: '#ffd43b', face: 'midnight', large: true },
};
const PAGES = [['tasks', 'Tasks'], ['notes', 'Notes'], ['habits', 'Habits'], ['focus', 'Focus'], ['study', 'Study'], ['workflows', 'Workflows'], ['activity', 'Activity'], ['calendar', 'Calendar'],
  ['inbox', 'Inbox'], ['search', 'Smart search'], ['images', 'Image tools'], ['models', 'AI models'], ['mcp', 'Connected tools'], ['skills', 'Skills'], ['monitor', 'Work monitor']];

/** Saved snippets: [value, save (writes the setting), show (after the tool saved it)]. */
function useSnippets() {
  const [v, setV] = useState({});
  useEffect(() => { window.ather.getSetting('snippets', {}).then((s) => setV(s || {})); }, []);
  return [v, (next) => { setV(next); window.ather.setSetting('snippets', next); }, (s) => setV(s || {})];
}

/** My Maya: who Maya is (name, rules, goals, voice) and how it looks, plus what it has learned about the user. */
export default function Agent({ version }) {
  const [agent, setAgent] = useSetting('agent', {});
  const [callMe, setCallMe] = useSetting('userTitle', 'boss');
  const [engine, setEngine] = useSetting('voiceEngine', 'local');
  const [ui, setUi] = useSetting('ui', {});
  const [faceStyle, setFaceStyle] = useSetting('faceStyle', {});
  const [, setTheme] = useSetting('theme', 'system');
  const [, setLarge] = useSetting('a11yLarge', false);
  const [rules, setRules] = useState('');
  const [goals, setGoals] = useState('');
  const memories = useData(() => tool('memory_list', {}), version) || [];
  const [words, setWords] = useState({});
  const [snippets, setSnippets, setSnippetsLocal] = useSnippets();
  const [snipName, setSnipName] = useState('');
  const [snipText, setSnipText] = useState('');
  const [chromeProfile, setChromeProfile] = useSetting('chromeProfile', null);
  const [profiles, setProfiles] = useState([]);
  useEffect(() => { window.ather.chromeProfiles().then(setProfiles).catch(() => {}); }, []);
  useEffect(() => { setRules(agent?.rules || ''); setGoals(agent?.goals || ''); }, [agent?.rules, agent?.goals]);
  useEffect(() => { window.ather.getSetting('learnedWords', {}).then(setWords); }, [version]);
  const a = { name: 'Maya', speed: 1, voice: 'af_heart', openaiVoice: 'nova', ...agent };
  const setA = (patch) => setAgent({ ...a, ...patch });
  const setU = (patch) => setUi({ ...ui, ...patch });
  const hidden = ui?.hidePages || [];
  const test = async () => { const audio = await window.ather.speak(`Hi ${callMe || ''}! I am ${a.name}. This is how I sound.`); if (audio) playSpeech(audio); };
  const forgetWord = (w) => { const next = { ...words }; delete next[w]; setWords(next); window.ather.setSetting('learnedWords', next); };
  const preset = (p) => { setTheme(p.theme); setU({ accent: p.accent }); setFaceStyle({ ...faceStyle, color: p.face }); setLarge(!!p.large); };

  return (
    <>
      <h1 className="page-title">My {a.name}</h1>
      <p className="page-sub">Make {a.name} yours: its name, how it talks to you, your rules and goals, its voice and look. You can also just say it: “change your name to Priya”, “talk slower”, “make the text bigger”.</p>
      <div className="grid a11y-grid">
        <section className="panel" aria-labelledby="ag-who">
          <h2 id="ag-who">🤖 Who {a.name} is</h2>
          <div className="row wrap">
            <div className="field" style={{ flex: 1 }}><label htmlFor="ag-n">Name (wake word: “Hey {a.name}”)</label>
              <input id="ag-n" className="input" value={a.name} maxLength={20} onChange={(e) => setA({ name: e.target.value.replace(/[^\p{L} '-]/gu, '') || 'Maya' })} /></div>
            <div className="field" style={{ flex: 1 }}><label htmlFor="ag-c">It calls you</label>
              <input id="ag-c" className="input" value={callMe} onChange={(e) => setCallMe(e.target.value)} placeholder="sir, madam, your name" /></div>
          </div>
          {profiles.length > 1 && <div className="field"><label htmlFor="ag-cp">Chrome profile {a.name} uses (Gmail, ChatGPT, WhatsApp open signed in here)</label>
            <select id="ag-cp" className="input" value={chromeProfile || profiles.find((p) => p.lastUsed)?.dir || ''} onChange={(e) => setChromeProfile(e.target.value)}>
              {profiles.map((p) => <option key={p.dir} value={p.dir}>{p.name}{p.account ? ` — ${p.account}` : ''}{p.lastUsed ? ' (used last)' : ''}</option>)}
            </select></div>}
          <div className="field"><label htmlFor="ag-r">Your rules (one per line)</label>
            <div className="row"><textarea id="ag-r" className="input" rows={3} value={rules} onChange={(e) => setRules(e.target.value)} onBlur={() => setA({ rules })} placeholder={'Always answer in Tamil\nKeep answers short\nRemind me to drink water'} />
              <MicButton onText={(t) => { const r = `${rules}${rules ? '\n' : ''}${t}`; setRules(r); setA({ rules: r }); }} /></div></div>
          <div className="field"><label htmlFor="ag-g">Your goals</label>
            <div className="row"><textarea id="ag-g" className="input" rows={2} value={goals} onChange={(e) => setGoals(e.target.value)} onBlur={() => setA({ goals })} placeholder="Finish my college project by December; walk 20 minutes a day" />
              <MicButton onText={(t) => { const g = `${goals}${goals ? ' ' : ''}${t}`; setGoals(g); setA({ goals: g }); }} /></div></div>
        </section>

        <section className="panel" aria-labelledby="ag-voice">
          <h2 id="ag-voice">🗣 Voice</h2>
          <div className="row wrap" role="radiogroup" aria-label="Voice engine">
            <label className="row"><input type="radio" name="engine" checked={engine === 'local'} onChange={() => setEngine('local')} /> Free voices on this PC (English + Tamil, offline)</label>
            <label className="row"><input type="radio" name="engine" checked={engine === 'openai'} onChange={() => setEngine('openai')} /> OpenAI voices (the ones ChatGPT uses)</label>
          </div>
          {engine === 'openai' && <p className="muted">Uses your OpenAI key from AI models. Paid per use (very cheap), needs internet, and what {a.name} says is sent to OpenAI. If it fails, the free voice speaks instead.</p>}
          <div className="row wrap">
            {engine === 'local'
              ? <div className="field" style={{ flex: 1 }}><label htmlFor="ag-v">English voice</label>
                  <select id="ag-v" className="input" value={a.voice} onChange={(e) => setA({ voice: e.target.value })}>{LOCAL_VOICES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></div>
              : <div className="field" style={{ flex: 1 }}><label htmlFor="ag-ov">OpenAI voice</label>
                  <select id="ag-ov" className="input" value={a.openaiVoice} onChange={(e) => setA({ openaiVoice: e.target.value })}>{OPENAI_VOICES.map((v) => <option key={v}>{v}</option>)}</select></div>}
            <label className="field" style={{ flex: 1 }}>Speed: {a.speed}×
              <input type="range" min="0.7" max="1.3" step="0.1" value={a.speed} onChange={(e) => setA({ speed: Number(e.target.value) })} aria-label="Speaking speed" /></label>
          </div>
          <button className="btn" onClick={test}>🔊 Hear it</button>
        </section>

        <section className="panel" aria-labelledby="ag-look">
          <h2 id="ag-look">🎨 Look</h2>
          <div className="row wrap">{Object.entries(PRESETS).map(([n, p]) => <button key={n} className="btn" onClick={() => preset(p)} style={{ borderColor: p.accent }}>{n}</button>)}</div>
          <div className="row wrap">
            <label className="field">Accent colour <input type="color" value={ui?.accent || '#6c5cff'} onChange={(e) => setU({ accent: e.target.value })} aria-label="Accent colour" /></label>
            <div className="field"><label htmlFor="ag-ts">Text size</label>
              <select id="ag-ts" className="input" value={ui?.fontScale || 1} onChange={(e) => setU({ fontScale: Number(e.target.value) })}><option value="1">Normal</option><option value="1.15">Large</option><option value="1.3">Larger</option></select></div>
            <div className="field"><label htmlFor="ag-d">Spacing</label>
              <select id="ag-d" className="input" value={ui?.density || 'comfortable'} onChange={(e) => setU({ density: e.target.value })}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></div>
          </div>
          <fieldset className="field"><legend>Pages in the sidebar</legend>
            <div className="row wrap">{PAGES.map(([id, label]) => (
              <label key={id} className="row"><input type="checkbox" className="check" checked={!hidden.includes(id)} onChange={(e) => setU({ hidePages: e.target.checked ? hidden.filter((h) => h !== id) : [...hidden, id] })} /> {label}</label>
            ))}</div>
          </fieldset>
          <p className="muted">Face shape, colours and how lively it is: Settings → Appearance.</p>
        </section>

        <section className="panel" aria-labelledby="ag-snip">
          <h2 id="ag-snip">⌨️ Things you type often</h2>
          <p className="muted">Say “type my address” in any app and {a.name} types it for you. Or say “save my email as …”. Never passwords.</p>
          <ul className="list">{Object.entries(snippets || {}).map(([k, v]) => (
            <li className="item" key={k}><span className="item-title"><b>my {k}</b><br /><small className="muted">{v.slice(0, 80)}</small></span>
              <button className="btn small" onClick={() => { const next = { ...snippets }; delete next[k]; setSnippets(next); }} aria-label={`Delete my ${k}`}>Delete</button></li>
          ))}</ul>
          <form className="row wrap" onSubmit={(e) => { e.preventDefault(); if (snipName.trim() && snipText.trim()) window.ather.tool('snippets_save', { name: snipName, text: snipText }).then((r) => { if (r.error) alert(r.error); else { setSnipName(''); setSnipText(''); window.ather.getSetting('snippets', {}).then(setSnippetsLocal); } }); }}>
            <input className="input" style={{ width: 130 }} placeholder="address" value={snipName} onChange={(e) => setSnipName(e.target.value)} aria-label="Name" />
            <input className="input" style={{ flex: 1, minWidth: 200 }} placeholder="12 Gandhi Street, Chennai 600001" value={snipText} onChange={(e) => setSnipText(e.target.value)} aria-label="Text" />
            <MicButton onText={(t) => setSnipText((v) => `${v}${v ? ' ' : ''}${t}`)} />
            <button className="btn primary">Save</button>
          </form>
        </section>

        <section className="panel" aria-labelledby="ag-learned">
          <h2 id="ag-learned">🧠 What {a.name} learned about you</h2>
          <p className="muted">From your corrections, 👎 notes and what you share. All kept on this PC. Remove anything that is wrong.</p>
          {!memories.length && <p className="empty">Nothing yet. Tell {a.name} about yourself, or press 👎 on an answer to teach it.</p>}
          <ul className="list">{memories.map((m) => (
            <li className="item" key={m.id}><span className="badge">{m.category}</span><span className="item-title">{m.fact}</span>
              <button className="btn small" onClick={() => tool('memory_forget', { id: m.id })} aria-label={`Forget: ${m.fact}`}>Forget</button></li>
          ))}</ul>
          {!!Object.keys(words).length && <>
            <h3>Words it learned to hear right</h3>
            <ul className="list">{Object.entries(words).map(([h, m]) => (
              <li className="item" key={h}><span className="item-title">“{h}” → <b>{m}</b></span><button className="btn small" onClick={() => forgetWord(h)} aria-label={`Forget the word ${h}`}>Forget</button></li>
            ))}</ul>
          </>}
        </section>
      </div>
    </>
  );
}
