import { useState } from 'react';
import { startRecording } from './audio.js';

/** 🎤 next to a text field: press, speak, press again; the words are added to the field. For people who cannot type. */
export default function MicButton({ onText, label = 'Speak instead of typing' }) {
  const [recorder, setRecorder] = useState(null);
  async function toggle() {
    if (!recorder) { try { setRecorder(await startRecording()); } catch { /* no microphone */ } return; }
    const audio = await recorder.stop();
    setRecorder(null);
    if (audio.length >= 16000 * 0.3) onText((await window.ather.transcribe(audio)).trim());
  }
  return <button type="button" className={`btn small mic ${recorder ? 'primary' : ''}`} onClick={toggle} aria-label={recorder ? 'Stop and use what I said' : label} title={label}>{recorder ? '⏹' : '🎤'}</button>;
}
