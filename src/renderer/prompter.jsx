// Teleprompter that listens: the script scrolls along as you read it aloud, and waits when you pause.
import { createRoot } from 'react-dom/client';
import { useEffect, useRef, useState } from 'react';
import { startRecording } from './shared/audio.js';
import { words, align } from './shared/prompter.js';

const CHECK_MS = 2000; // how often Whisper listens to the last stretch
const rms = (pcm) => { let s = 0; for (let i = 0; i < pcm.length; i += 8) s += pcm[i] * pcm[i]; return Math.sqrt(s / Math.max(1, pcm.length / 8)); };

function Prompter() {
  const [script, setScript] = useState('');
  const [pos, setPos] = useState(0); // index of the next word to read
  const [hearing, setHearing] = useState(false);
  const [paused, setPaused] = useState(false);
  const box = useRef(null);
  const posRef = useRef(0), pausedRef = useRef(false);
  posRef.current = pos; pausedRef.current = paused;

  useEffect(() => window.ather.onPrompterScript(setScript), []);

  useEffect(() => {
    if (!script) return undefined;
    const list = words(script);
    let rec, timer, busy = false, recent = [], keep = new Float32Array(0);
    (async () => {
      rec = await startRecording();
      timer = setInterval(async () => {
        const chunk = rec.take();
        const talking = rms(chunk) > 0.01;
        setHearing(talking);
        if (busy || pausedRef.current) return;
        // Listen to the last ~4 s, so a phrase cut in half still matches.
        const both = new Float32Array(keep.length + chunk.length); both.set(keep); both.set(chunk, keep.length);
        keep = both.slice(-16000 * 4);
        if (!talking) return;
        busy = true;
        try {
          const heard = words(await window.ather.transcribeQuick(keep));
          recent = heard.slice(-8);
          const next = align(list, recent, posRef.current);
          if (next > posRef.current) setPos(next);
        } catch { /* a missed check just waits for the next one */ } finally { busy = false; }
      }, CHECK_MS);
    })().catch(() => {});
    return () => { clearInterval(timer); rec?.stop(); };
  }, [script]);

  // Keep the next words about a third of the way down.
  useEffect(() => {
    const el = box.current?.querySelector('.w.next');
    if (el) box.current.style.transform = `translateY(${-(el.offsetTop - 70)}px)`;
  }, [pos, script]);

  if (!script) return <div className="tp"><div className="scroll" style={{ padding: 40, fontSize: 22 }}>Copy your script first, then say “start teleprompter”.</div></div>;
  let k = 0;
  return (
    <div className="tp">
      <div className="bar">
        <span className={`mic ${hearing ? 'on' : ''}`} aria-hidden="true" />{paused ? 'Paused' : hearing ? 'Following you' : 'Waiting for you'}
        <button onClick={() => setPos(0)}>Restart</button>
        <button onClick={() => setPaused(!paused)}>{paused ? 'Resume' : 'Pause'}</button>
        <button onClick={() => window.ather.prompterSet(false)} aria-label="Close teleprompter">✕</button>
      </div>
      <div className="fade top" /><div className="fade bottom" />
      <div className="scroll" ref={box} aria-live="off">
        {script.split(/\n+/).map((para, p) => (
          <p key={p}>{para.split(/(\s+)/).map((part, i) => {
            if (!words(part).length) return part;
            const index = k; k += words(part).length;
            return <span key={i} className={`w ${index < pos - 3 ? '' : index < pos ? 'now' : index < pos + 12 ? 'next' : ''}`}>{part}</span>;
          })}</p>
        ))}
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Prompter />);
