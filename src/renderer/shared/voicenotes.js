// Telegram voice notes, done with Chromium's own audio code (no extra library): decode a phone's Ogg/Opus note to
// 16 kHz samples for Whisper, and record Maya's spoken answer as M4A (Telegram plays it as a voice message).
// The main process calls these in the notch window (window.mayaVoice) with base64, the only safe way across.

const toBase64 = (buffer) => {
  const bytes = new Uint8Array(buffer);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromBase64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

/** Any audio file (base64) → 16 kHz mono Float32 samples (base64). */
export async function decodeVoice(b64) {
  const ctx = new AudioContext();
  const decoded = await ctx.decodeAudioData(fromBase64(b64).buffer).finally(() => ctx.close());
  const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * 16000)), 16000);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination);
  src.start();
  return toBase64((await off.startRendering()).getChannelData(0).buffer);
}

/** Float32 samples (base64) at sampleRate → an M4A file (base64), recorded in real time. */
export async function encodeVoice(b64, sampleRate) {
  const samples = new Float32Array(fromBase64(b64).buffer);
  const ctx = new AudioContext({ sampleRate });
  await ctx.resume();
  const buffer = ctx.createBuffer(1, samples.length, sampleRate);
  buffer.copyToChannel(samples, 0);
  const dest = ctx.createMediaStreamDestination();
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.connect(dest);
  const rec = new MediaRecorder(dest.stream, { mimeType: 'audio/mp4' });
  const parts = [];
  rec.ondataavailable = (e) => parts.push(e.data);
  const stopped = new Promise((r) => { rec.onstop = r; });
  rec.start();
  src.start();
  await new Promise((r) => { src.onended = r; });
  rec.stop();
  await stopped;
  ctx.close();
  return toBase64(await new Blob(parts).arrayBuffer());
}

export const installVoiceHelpers = () => { window.mayaVoice = { decodeVoice, encodeVoice }; };
