// Live captions of the computer's sound (videos, online classes, calls), optionally translated to English.
import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import { startRecording } from './shared/audio.js';

const translate = new URLSearchParams(location.search).get('translate') === '1';
const CHUNK_MS = 4000;
// Whisper invents these on silence or music.
const NOISE = /^\s*(\[.*\]|\(.*\)|♪.*|thank you\.?|thanks for watching!?|you|\.+)\s*$/i;
const rms = (pcm) => { let s = 0; for (let i = 0; i < pcm.length; i += 8) s += pcm[i] * pcm[i]; return Math.sqrt(s / Math.max(1, pcm.length / 8)); };

function Captions() {
  const [lines, setLines] = useState([]);
  const [status, setStatus] = useState('Listening to your computer…');

  useEffect(() => {
    let rec, timer, busy = false;
    (async () => {
      try {
        // Maya's display-media handler answers with the screen plus Windows loopback sound (video is dropped).
        const stream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
        stream.getVideoTracks().forEach((t) => t.stop());
        rec = await startRecording(new MediaStream(stream.getAudioTracks()));
        timer = setInterval(async () => {
          if (busy) return; // audio keeps collecting until the last chunk is done
          const pcm = rec.take();
          if (rms(pcm) < 0.004) return;
          busy = true;
          try {
            const text = await window.ather.captionsTranscribe(pcm, translate);
            if (text && !NOISE.test(text)) { setLines((l) => [...l, text].slice(-2)); setStatus(null); }
          } catch (e) { setStatus(e.message); } finally { busy = false; }
        }, CHUNK_MS);
      } catch (e) {
        setStatus(`Could not hear the computer sound: ${e.message}`);
      }
    })();
    return () => { clearInterval(timer); rec?.stop(); };
  }, []);

  return (
    <div className="cap" role="log" aria-live="polite">
      {translate && <span className="tag">TRANSLATING TO ENGLISH</span>}
      <button className="x" onClick={() => window.ather.captionsSet(false)} aria-label="Close captions">✕</button>
      {status && <p className="status">{status}</p>}
      {lines.map((l, i) => <p key={i} className={i === lines.length - 1 ? 'now' : ''}>{l}</p>)}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Captions />);
