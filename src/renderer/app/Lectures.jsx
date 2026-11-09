import { useEffect, useRef, useState } from 'react';
import Markdown from '../shared/Markdown.jsx';
import { startRecording } from '../shared/audio.js';
import { useData, fmtDate } from './useData.js';

const errText = (e) => e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
const CHUNK_MS = 30_000;

export default function Lectures({ version, go }) {
  const list = useData(() => window.ather.lectures(), version);
  const [title, setTitle] = useState('');
  const [source, setSource] = useState('mic');
  const [state, setState] = useState('idle'); // idle | recording | finishing
  const [transcript, setTranscript] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [lecture, setLecture] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const rec = useRef(null);
  const chain = useRef(Promise.resolve());
  const idRef = useRef(null);
  const timers = useRef([]);
  const box = useRef(null);

  useEffect(() => { box.current?.scrollTo(0, box.current.scrollHeight); }, [transcript]);
  useEffect(() => () => timers.current.forEach(clearInterval), []);

  // Transcribe pieces one after another so the transcript stays in order.
  const transcribe = (audio) => {
    if (audio.length < 16000) return chain.current;
    chain.current = chain.current.then(async () => {
      const text = await window.ather.transcribe(audio).catch(() => '');
      if (!text) return;
      setTranscript((t) => `${t} ${text}`.trim());
      await window.ather.lectureAppend(idRef.current, text);
    });
    return chain.current;
  };

  async function start() {
    setError(null); setLecture(null); setTranscript(''); setElapsed(0);
    try {
      let stream = null;
      if (source === 'computer') {
        const display = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
        display.getVideoTracks().forEach((t) => t.stop());
        if (!display.getAudioTracks().length) throw new Error('No computer sound was shared.');
        stream = new MediaStream(display.getAudioTracks());
      }
      rec.current = await startRecording(stream);
      idRef.current = await window.ather.lectureStart(title.trim(), source);
      const began = Date.now();
      timers.current = [
        setInterval(() => transcribe(rec.current.take()), CHUNK_MS),
        setInterval(() => setElapsed(Math.floor((Date.now() - began) / 1000)), 1000),
      ];
      setState('recording');
    } catch (e) {
      setError(e.name === 'NotAllowedError' ? 'Maya was not allowed to record. Check Windows microphone privacy settings.' : errText(e));
    }
  }

  async function stop() {
    timers.current.forEach(clearInterval);
    setState('finishing');
    await transcribe(await rec.current.stop());
    try {
      setLecture(await window.ather.lectureFinish(idRef.current, Math.round(elapsed / 60)));
    } catch (e) { setError(errText(e)); }
    setState('idle');
  }

  async function study(kind) {
    setBusy(kind);
    try { await window.ather.lectureStudy(lecture.id, kind); go('study'); } catch (e) { setError(errText(e)); } finally { setBusy(null); }
  }
  async function chat() { go(`chat:${await window.ather.lectureChat(lecture.id)}`); }

  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');

  return (
    <>
      <div className="panel">
        <h2>🎙 Record a lecture</h2>
        {state === 'idle' && (
          <div className="row wrap">
            <input className="input" style={{ flex: 1, minWidth: 220 }} placeholder="Lecture title, e.g. OS Unit 3: Deadlocks" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Lecture title" />
            <select className="input" style={{ width: 230 }} value={source} onChange={(e) => setSource(e.target.value)} aria-label="Record from">
              <option value="mic">Microphone (class in the room)</option>
              <option value="computer">Computer sound (online class)</option>
            </select>
            <button className="btn primary" onClick={start}>● Start recording</button>
          </div>
        )}
        {state !== 'idle' && (
          <div className="row">
            <span className="rec-dot" aria-hidden /> <b>{state === 'recording' ? `Recording ${mm}:${ss}` : 'Writing your notes…'}</b>
            <span className="spacer" />
            {state === 'recording' && <button className="btn danger" onClick={stop}>■ Stop and make notes</button>}
          </div>
        )}
        {error && <p className="bad">{error}</p>}
        {(state !== 'idle' || transcript) && (
          <div className="transcript" ref={box} aria-live="polite">{transcript || <span className="muted">The transcript appears here every 30 seconds…</span>}</div>
        )}
      </div>

      {lecture?.notes && (
        <div className="panel">
          <div className="row wrap"><h2>📒 {lecture.title}</h2><span className="spacer" />
            <button className="btn small" onClick={() => study('flashcards')} disabled={!!busy}>{busy === 'flashcards' ? 'Making…' : '🃏 Flashcards'}</button>
            <button className="btn small" onClick={() => study('quiz')} disabled={!!busy}>{busy === 'quiz' ? 'Making…' : '❓ Quiz'}</button>
            <button className="btn small primary" onClick={chat}>💬 Ask about it</button>
          </div>
          <Markdown text={lecture.notes} />
          <p className="muted">Also saved in Notes.</p>
        </div>
      )}

      <div className="panel">
        <h2>Past lectures</h2>
        {!list?.length && <p className="empty">No lectures yet.</p>}
        <ul className="list">
          {(list || []).map((l) => (
            <li className="item" key={l.id}>
              <span className="item-title"><b>{l.title}</b> <small className="muted">· {fmtDate(l.started_at)} · {l.minutes} min · {l.source === 'computer' ? 'computer sound' : 'microphone'}</small></span>
              <button className="btn small" onClick={async () => setLecture(await window.ather.lecture(l.id))} disabled={!l.has_notes}>Open</button>
              <button className="btn small" onClick={() => window.ather.deleteLecture(l.id)} aria-label={`Delete ${l.title}`}>✕</button>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
