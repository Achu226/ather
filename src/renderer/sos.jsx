// Full-screen emergency sign: a countdown first (so a misheard "help" can be undone), then a flashing
// "I need help" sign with a siren, so people nearby notice even if the person cannot call out.
import { createRoot } from 'react-dom/client';
import { useEffect, useRef, useState } from 'react';

/** A rising and falling siren until stop() is called. */
function siren() {
  const ctx = new AudioContext();
  const osc = ctx.createOscillator(), gain = ctx.createGain(), lfo = ctx.createOscillator(), depth = ctx.createGain();
  osc.type = 'sawtooth'; osc.frequency.value = 760;
  lfo.frequency.value = 0.9; depth.gain.value = 260;
  lfo.connect(depth).connect(osc.frequency);
  gain.gain.value = 0.35;
  osc.connect(gain).connect(ctx.destination);
  osc.start(); lfo.start();
  return () => ctx.close();
}

function Sos() {
  const [s, setS] = useState(null);
  const [left, setLeft] = useState(0);
  const stopSiren = useRef(null);
  useEffect(() => window.ather.onSos(setS), []);
  useEffect(() => {
    if (s?.state !== 'countdown') return;
    setLeft(s.seconds);
    const t = setInterval(() => setLeft((n) => Math.max(0, n - 1)), 1000);
    return () => clearInterval(t);
  }, [s?.state, s?.seconds]);
  useEffect(() => {
    if (s?.state === 'alarm' && !stopSiren.current) stopSiren.current = siren();
    return undefined;
  }, [s?.state]);
  useEffect(() => () => stopSiren.current?.(), []);
  if (!s) return null;

  if (s.state === 'countdown') {
    return (
      <div className="sos">
        <p>{s.reason?.startsWith('did not answer') ? 'Are you okay? Say "I\'m okay" or press the button.' : 'Getting help in'}</p>
        <div className="count" role="timer" aria-live="assertive">{left}</div>
        <p>Say <b>“cancel”</b> or <b>“வேண்டாம்”</b> if you are okay.</p>
        <button autoFocus onClick={() => window.ather.sosCancel()}>I'm okay — cancel</button>
      </div>
    );
  }
  const stop = () => { stopSiren.current?.(); stopSiren.current = null; window.ather.sosStop(); };
  return (
    <div className="sos alarm" role="alert">
      <h1>I NEED HELP</h1>
      <div className="ta">எனக்கு உதவி தேவை</div>
      {s.name && <p>{s.name} needs help. Please come and check on them.</p>}
      {s.note && <p className="info">Note: {s.note}</p>}
      {s.medical?.length > 0 && <section className="medical" aria-label="Medical ID"><h2>MEDICAL ID</h2><ul>{s.medical.map((l) => <li key={l}>{l}</li>)}</ul></section>}
      {(s.calling || s.call_error) && <p className="info">{s.calling ? `📞 Calling ${s.calling}…` : `⚠ ${s.call_error}`}</p>}
      <p className="info">{s.sent ? `✓ ${s.sent} caregiver${s.sent > 1 ? 's were' : ' was'} emailed.` : s.error ? `⚠ ${s.error}` : 'Contacting caregivers…'}</p>
      <button autoFocus onClick={stop}>Help is here — stop the alarm</button>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Sos />);
