// Speak for me: a phrase board for people who cannot speak clearly. Click, dwell or scan to a phrase, or choose by
// looking (as in look-to-speak): glance left or right (or press ←/→, or two switches) until one phrase is left.
import { useEffect, useRef, useState } from 'react';
import { playSpeech } from '../shared/audio.js';
import { useSetting } from './Settings.jsx';
import { DEFAULT_PHRASES, halves, narrow } from '../shared/speakboard.js';

export default function Speak() {
  const [saved, setSaved] = useSetting('speakPhrases', DEFAULT_PHRASES);
  const phrases = saved?.length ? saved : DEFAULT_PHRASES;
  const [said, setSaid] = useState('');
  const [look, setLook] = useState(null); // null = off; otherwise the phrases still in play
  const [headOn, setHeadOn] = useState(true);
  const [draft, setDraft] = useState('');
  const lookRef = useRef(null);
  lookRef.current = look;

  const say = async (text) => {
    setSaid(text);
    try { const audio = await window.ather.speak(text); if (audio) playSpeech(audio); } catch { /* the words stay on screen */ }
  };
  const choose = (side) => {
    if (!lookRef.current) return;
    const next = narrow(lookRef.current, side);
    if (next.length === 1) { say(next[0]); setLook(phrases); } else setLook(next);
  };
  const start = async () => {
    setLook(phrases);
    setHeadOn(!!(await window.ather.headMouseHold(true).catch(() => false)));
  };
  const stop = () => { setLook(null); window.ather.headMouseHold(false).catch(() => {}); };
  const headMouseOn = async () => { await window.ather.headMouseSet(true); setTimeout(async () => setHeadOn(!!(await window.ather.headMouseHold(true).catch(() => false))), 1500); };

  useEffect(() => window.ather.onHeadGlance?.((side) => choose(side)), [phrases]);
  useEffect(() => {
    if (!look) return undefined;
    // ←/→ act as two switches; Esc stops.
    const key = (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); choose(e.key === 'ArrowLeft' ? 'left' : 'right'); }
      else if (e.key === 'Escape') stop();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [look]);
  useEffect(() => () => { window.ather.headMouseHold?.(false).catch(() => {}); }, []); // leaving the page frees the cursor

  const add = (e) => { e.preventDefault(); const t = draft.trim(); if (t && !phrases.includes(t)) setSaved([...phrases, t]); setDraft(''); };
  const [left, right] = look ? halves(look) : [[], []];

  return (
    <>
      <h1 className="page-title">Speak for me</h1>
      <p className="page-sub">Pick a phrase and Maya says it out loud (Tamil phrases in the Tamil voice). Click it, hold the head mouse on it, scan to it, or choose by looking.</p>
      <p className="said" aria-live="assertive">{said || ' '}</p>

      {look ? (
        <section className="panel" aria-label="Choose by looking">
          {!headOn && (
            <p className="muted">The head mouse is off: use the <kbd>←</kbd> and <kbd>→</kbd> keys (or two switches), or{' '}
              <button className="btn small" onClick={headMouseOn}>turn on the head mouse</button></p>
          )}
          <div className="look-cols">
            {[['left', '← Look left', left], ['right', 'Look right →', right]].map(([side, label, items]) => (
              <button key={side} className="look-col" onClick={() => choose(side)} disabled={!items.length} aria-label={`${label}: ${items.join(', ')}`}>
                <b>{label}</b>
                <ul>{items.map((p) => <li key={p}>{p}</li>)}</ul>
              </button>
            ))}
          </div>
          <button className="btn" onClick={stop}>Stop choosing by looking</button>
        </section>
      ) : (
        <>
          <div className="row wrap"><button className="btn primary big-btn" onClick={start}>👀 Choose by looking</button></div>
          <div className="phrase-grid">
            {phrases.map((p) => (
              <div className="phrase-cell" key={p}>
                <button className="phrase" onClick={() => say(p)}>{p}</button>
                <button className="btn small ghost" onClick={() => setSaved(phrases.filter((x) => x !== p))} aria-label={`Remove “${p}”`}>✕</button>
              </div>
            ))}
          </div>
          <form className="row wrap" onSubmit={add}>
            <input className="input" style={{ flex: 1, minWidth: 220 }} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add a phrase, e.g. Please open the window" aria-label="New phrase" />
            <button className="btn" disabled={!draft.trim()}>Add</button>
          </form>
        </>
      )}
    </>
  );
}
