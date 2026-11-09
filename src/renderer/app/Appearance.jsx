import { useEffect, useState } from 'react';
import Face from '../shared/Face.jsx';
import { FACE_COLORS, DEFAULT_FACE } from '../shared/look.js';
import { customColors, sliderTrack } from '../shared/colors.js';
import { playSpeech } from '../shared/audio.js';

const SHAPES = { classic: 'Classic', round: 'Round', robot: 'Robot', cat: 'Cat', blob: 'Blob', orb: 'Jarvis orb', bear: 'Bear', alien: 'Alien', ghost: 'Ghost' };
const COLOR_NAMES = { auto: 'Auto (black in dark mode)', purple: 'Purple', midnight: 'Midnight black', mint: 'Mint', pink: 'Pink', ocean: 'Ocean', sunset: 'Sunset' };
const EYES = { tall: 'Tall', round: 'Round', dots: 'Dots' };
const ACCESSORIES = { none: 'None', glasses: 'Glasses', shades: 'Shades', catears: 'Cat ears', headphones: 'Headphones', bow: 'Bow' };
// "Any pill. Any eyes.": each slider's track shows the colours it gives.
const SLIDERS = [['pill', 'Pill', (c, t) => customColors({ ...c, pill: t }).a], ['shade', 'Shade', (c, t) => customColors({ ...c, shade: t }).a], ['eyes', 'Eyes', (c, t) => customColors({ ...c, eyes: t }).eyes]];

export function Appearance() {
  const [theme, setTheme] = useState('system');
  const [face, setFace] = useState(DEFAULT_FACE);
  const [motion, setMotion] = useState('full');
  const [thanked, setThanked] = useState(false);
  useEffect(() => {
    window.ather.getSetting('motion', 'full').then(setMotion);
    window.ather.getSetting('theme', 'system').then(setTheme);
    window.ather.getSetting('faceStyle', DEFAULT_FACE).then((f) => setFace({ ...DEFAULT_FACE, ...f }));
  }, []);

  const saveTheme = (t) => { setTheme(t); window.ather.setSetting('theme', t); };
  const saveFace = (patch) => { const f = { ...face, ...patch }; setFace(f); window.ather.setSetting('faceStyle', f); };

  return (
    <div className="panel">
      <h2>Appearance</h2>
      <div className="row wrap" style={{ alignItems: 'flex-start', gap: 24 }}>
        <div style={{ textAlign: 'center' }}>
          <Face size={130} mood={thanked ? 'love' : 'happy'} style={face} /><div className="muted">Preview</div>
          <button className="btn small" style={{ marginTop: 8 }} onClick={() => { setThanked(true); setTimeout(() => setThanked(false), 2600); }}>Thank Maya 💜</button>
        </div>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div className="field"><label htmlFor="th">Theme</label>
            <select id="th" className="input" value={theme} onChange={(e) => saveTheme(e.target.value)}>
              <option value="system">Same as Windows</option><option value="light">Light</option><option value="dark">Dark (black app and icons)</option>
            </select>
          </div>
          <div className="field"><label htmlFor="mo">Animation</label>
            <select id="mo" className="input" value={motion} onChange={(e) => { setMotion(e.target.value); window.ather.setSetting('motion', e.target.value); }}>
              <option value="full">Full: breathing, glances, bounces, glow</option>
              <option value="subtle">Subtle: only reacts to what is happening</option>
              <option value="off">Off: no motion</option>
            </select>
          </div>
          <div className="field"><label>Face shape</label>
            <div className="row wrap" role="radiogroup" aria-label="Face shape">
              {Object.entries(SHAPES).map(([k, v]) => (
                <button key={k} className={`shape-pick ${(face.shape || 'classic') === k ? 'on' : ''}`} onClick={() => saveFace({ shape: k })} role="radio" aria-checked={(face.shape || 'classic') === k}>
                  <Face size={54} mood="idle" style={{ ...face, shape: k }} /><span>{v}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="field"><label htmlFor="lv">Liveliness</label>
            <select id="lv" className="input" value={face.liveliness || 'normal'} onChange={(e) => saveFace({ liveliness: e.target.value })}>
              <option value="calm">Calm: rarely moves on its own</option>
              <option value="normal">Normal: glances, smiles now and then</option>
              <option value="lively">Lively: smiles, wonders and yawns often</option>
            </select>
          </div>
          <div className="field"><label>Face colour</label>
            <div className="row wrap">
              {Object.keys(COLOR_NAMES).map((c) => (
                <button key={c} className={`swatch ${face.color === c ? 'on' : ''}`} onClick={() => saveFace({ color: c })} title={COLOR_NAMES[c]} aria-label={COLOR_NAMES[c]} aria-pressed={face.color === c}
                  style={{ background: c === 'auto' ? 'linear-gradient(135deg, #6c5cff 50%, #0d0d10 50%)' : `linear-gradient(135deg, ${FACE_COLORS[c][0]}, ${FACE_COLORS[c][1]})` }} />
              ))}
              <button className={`swatch ${face.color === 'custom' ? 'on' : ''}`} onClick={() => saveFace({ color: 'custom', custom: face.custom || { pill: 0, shade: 0, eyes: 0 } })}
                title="Custom: any colour" aria-label="Custom colour" aria-pressed={face.color === 'custom'}
                style={{ background: 'conic-gradient(#f44, #fd4, #4f8, #4cf, #84f, #f4c, #f44)' }} />
            </div>
          </div>
          {face.color === 'custom' && (
            <div className="field sliders">
              {SLIDERS.map(([key, label, color]) => (
                <label key={key} className="row" style={{ gap: 10 }}><span style={{ width: 46 }}>{label}</span>
                  <input type="range" min="0" max="1000" value={Math.round((face.custom?.[key] || 0) * 1000)} aria-label={`${label} colour`}
                    onChange={(e) => saveFace({ custom: { ...face.custom, [key]: Number(e.target.value) / 1000 } })}
                    style={{ flex: 1, height: 14, borderRadius: 7, appearance: 'none', background: sliderTrack((t) => color(face.custom || {}, t)) }} /></label>
              ))}
              <p className="muted">Text on the pill switches between light and dark by itself.</p>
            </div>
          )}
          <div className="row wrap">
            <div className="field" style={{ flex: 1 }}><label htmlFor="ey">Eyes</label>
              <select id="ey" className="input" value={face.eyes} onChange={(e) => saveFace({ eyes: e.target.value })}>
                {Object.entries(EYES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></div>
            <div className="field" style={{ flex: 1 }}><label htmlFor="ac">Accessory</label>
              <select id="ac" className="input" value={face.accessory} onChange={(e) => saveFace({ accessory: e.target.value })}>
                {Object.entries(ACCESSORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PersonalityEditor() {
  const [list, setList] = useState([]);
  const [voices, setVoices] = useState([]);
  const [draft, setDraft] = useState({ label: '', prompt: '', voice: 'af_heart' });
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    window.ather.getSetting('customPersonalities', []).then(setList);
    window.ather.voices().then(setVoices);
  }, []);

  const save = (next) => { setList(next); window.ather.setSetting('customPersonalities', next); };
  function add(e) {
    e.preventDefault();
    if (!draft.label.trim() || !draft.prompt.trim()) return;
    const id = `custom-${draft.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    save([...list.filter((p) => p.id !== id), { id, label: draft.label.trim(), prompt: draft.prompt.trim(), voice: draft.voice }]);
    setDraft({ label: '', prompt: '', voice: draft.voice });
  }
  async function test() {
    setTesting(true);
    try { await playSpeech(await window.ather.testVoice('Hi! This is how I sound. Nice to meet you.', draft.voice)); } finally { setTesting(false); }
  }

  return (
    <div className="panel">
      <h2>Your own personalities</h2>
      <p className="muted">Describe how Maya should talk and pick a voice. Then choose it under “How Maya talks”, or say “talk like {draft.label || 'Coach'}”.</p>
      <ul className="list">
        {list.map((p) => (
          <li className="item" key={p.id}><span className="item-title"><b>{p.label}</b> <small className="muted">· {p.voice} · {p.prompt.slice(0, 80)}</small></span>
            <button className="btn small" onClick={() => save(list.filter((x) => x.id !== p.id))} aria-label={`Delete ${p.label}`}>✕</button></li>
        ))}
      </ul>
      <form onSubmit={add} style={{ marginTop: 10 }}>
        <div className="row wrap">
          <input className="input" style={{ width: 200 }} placeholder="Name, e.g. Coach" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} aria-label="Personality name" />
          <select className="input" style={{ width: 160 }} value={draft.voice} onChange={(e) => setDraft({ ...draft, voice: e.target.value })} aria-label="Voice">
            {voices.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <button type="button" className="btn" onClick={test} disabled={testing}>{testing ? 'Speaking…' : '▶ Test voice'}</button>
        </div>
        <textarea className="input" style={{ minHeight: 70, marginTop: 8 }} placeholder="How it talks, e.g. You are a strict but caring fitness coach. Short, motivating sentences."
          value={draft.prompt} onChange={(e) => setDraft({ ...draft, prompt: e.target.value })} aria-label="How it talks" />
        <button className="btn primary" style={{ marginTop: 8 }}>Save personality</button>
      </form>
    </div>
  );
}
