import { useEffect, useRef, useState } from 'react';
import Face from './Face.jsx';

/** Whether Maya is locked right now (follows lock/unlock events). */
export function useLocked() {
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    window.ather.lockStatus().then((s) => setLocked(s.locked));
    return window.ather.onLockChanged(setLocked);
  }, []);
  return locked;
}

export default function LockScreen({ compact = false }) {
  const [pin, setPin] = useState('');
  const [message, setMessage] = useState('');
  const [mood, setMood] = useState('sleepy');
  const input = useRef(null);
  useEffect(() => { input.current?.focus(); }, []);

  async function submit(e) {
    e.preventDefault();
    const r = await window.ather.unlock(pin);
    setPin('');
    if (r.ok) { setMood('happy'); return; }
    setMood('sad');
    setMessage(r.wait ? `Too many tries. Wait ${r.wait} seconds.` : 'Wrong PIN, try again.');
  }

  return (
    <div className={compact ? 'lock compact' : 'lock'} role="dialog" aria-label="Maya is locked">
      <Face size={compact ? 70 : 120} mood={mood} />
      <h2>🔒 Maya is locked</h2>
      <form onSubmit={submit} className="row">
        <input ref={input} className="input pin" type="password" inputMode="numeric" autoComplete="off" maxLength={8} placeholder="PIN"
          value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} aria-label="PIN" />
        <button className="btn primary" disabled={pin.length < 4}>Unlock</button>
      </form>
      {message && <p className="bad">{message}</p>}
    </div>
  );
}
