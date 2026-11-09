// Hands-free voice: wait for the user to speak, notice when they stop, and detect them talking over Maya.
import { startRecording } from './audio.js';

const SILENCE_MS = 900;   // this much quiet after speech ends the turn
const MIN_SPEECH_MS = 350;

/** Measure room noise for a moment so the speech threshold fits this microphone and room. */
async function calibrate(start = startRecording) {
  const rec = await start();
  await new Promise((r) => setTimeout(r, 400));
  const noise = rec.level();
  await rec.stop();
  return Math.max(0.012, noise * 3);
}

let threshold = null;

/** Record one utterance. Resolves with 16 kHz audio, or null if nothing was said / it was cancelled. */
const PREROLL = 8000; // 0.5 s kept from before speech starts, so the first word is not clipped
const join = (a, b) => { const out = new Float32Array(a.length + b.length); out.set(a); out.set(b, a.length); return out; };
export async function listenOnce(signal, onLevel = () => {}, start = startRecording) {
  threshold ??= await calibrate(start);
  const rec = await start();
  let speechStart = 0;
  let lastVoice = 0;
  let before = new Float32Array(0);
  return new Promise((resolve) => {
    const timer = setInterval(async () => {
      const level = rec.level();
      onLevel(Math.min(1, level / (threshold * 4)));
      const t = Date.now();
      if (level > threshold) { speechStart ||= t; lastVoice = t; }
      // Waiting in a quiet room: drop the silence, or a "Hey Maya" said after a long wait becomes a long clip the wake check ignores.
      if (!speechStart) before = join(before, rec.take()).slice(-PREROLL);
      const ended = speechStart && t - lastVoice > SILENCE_MS;
      if (!signal.aborted && !ended) return;
      clearInterval(timer);
      const audio = join(before, await rec.stop());
      resolve(!signal.aborted && lastVoice - speechStart >= MIN_SPEECH_MS ? audio : null);
    }, 50);
  });
}

/** Watch the mic while Maya talks; calls onInterrupt once if the user speaks loudly over it. Returns stop(). */
export async function watchForInterrupt(onInterrupt) {
  threshold ??= await calibrate();
  const rec = await startRecording();
  let loudSince = 0;
  const timer = setInterval(() => {
    // Higher bar than normal speech: Maya's own voice leaks into the mic despite echo cancellation.
    if (rec.level() > threshold * 2.5) {
      loudSince ||= Date.now();
      if (Date.now() - loudSince > 250) { stop(); onInterrupt(); }
    } else loudSince = 0;
  }, 50);
  let stopped = false;
  const stop = () => { if (stopped) return; stopped = true; clearInterval(timer); rec.stop(); };
  return stop;
}

// Whisper tiny hears "Hey Maya" almost always right; these are the misses seen in tests ("Hymaya", "Hi, Myers").
// "Ather", the old name, still works.
const WAKE = /\b(?:(?:hey|hi|hello|okay|ok|hay)[\s,.!]*(?:maya|maia|maaya|mayah|myah|mya|mia|myers?|ather|aether)|hymaya|heymaya)\b[\s,.!?]*(.*)$/i;
// Whisper often mishears "Hey" ("Tae Maya", "A Maya"): the name at the very start, after at most one short word, wakes it too.
const WAKE_START = /^\W*(?:[a-z]{1,3}[\s,.!]+)?(?:maya|maia|maaya|mayah|mia)\b[\s,.!?]*(.*)$/i;

/** null if the wake word is not there, otherwise whatever was said after it ("" if nothing). */
export function matchWake(text, name = '') {
  const m = text.match(WAKE) || text.match(WAKE_START);
  if (m) return m[1].trim();
  // The name the user gave Maya (My Maya) wakes it too: "Hey Priya".
  const n = name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const own = n && !/^maya$/i.test(n) ? text.match(new RegExp(`\\b(?:hey|hi|hello|okay|ok)[\\s,.!]*${n}\\b[\\s,.!?]*(.*)$`, 'iu')) : null;
  return own ? own[1].trim() : null;
}

/**
 * The next finished sentence in a streaming answer after position `from`, or null until one is complete.
 * Text that was replaced (shorter than `from`) starts again from 0.
 */
export function nextSentence(text, from = 0) {
  const start = text.length < from ? 0 : from;
  const m = text.slice(start).match(/^[\s\S]*?[.!?।…](?=\s)|^[\s\S]*?\n\n/);
  if (!m || m[0].trim().length < 2) return null;
  return { text: m[0].trim(), end: start + m[0].length };
}

/** "Good morning, boss! What's the work today?" by the time of day. */
export function greeting(at = new Date(), title = 'boss') {
  const h = at.getHours();
  const part = h < 5 ? 'Hello' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  const name = title ? `, ${title}` : '';
  return h >= 22 || h < 5 ? `${part}${name}! Working late? What's the work?` : `${part}${name}! What's the work${h < 12 ? ' today' : ''}?`;
}

export const isStopPhrase = (text) => /^\s*(stop|exit|bye|goodbye|that'?s all|stop voice mode)[.!]?\s*$/i.test(text);
