// "Hey Maya" through the real microphone path: the app hears a recording (8 s of quiet room, then "Hey Maya" in
// Maya's own voice) as its mic, and must wake up and greet. Runs in a throwaway data folder.
// Usage: npm run build:ui && node scripts/wake-e2e.mjs
import { _electron as electron } from 'playwright';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const env = () => ({ ...process.env, ATHER_NO_SHUTDOWN: '1', ATHER_DATA: mkdtempSync(join(tmpdir(), 'maya-wake-')), ATHER_MODELS: join(process.env.APPDATA, 'Ather', 'models') });
const windowOf = async (app, name) => { for (let i = 0; i < 240; i++) { const w = app.windows().find((x) => !x.isClosed() && x.url().includes(`${name}.html`)); if (w) return w; await sleep(250); } throw new Error(`${name} window did not open`); };

// 1. Maya's voice says "Hey Maya" → a 16-bit WAV with quiet before and after.
let app = await electron.launch({ args: ['.'], env: env() });
const voice = await (await windowOf(app, 'notch')).evaluate(async () => { const a = await window.ather.speak('Hey Maya.'); return { samples: Array.from(a.samples), rate: a.sampleRate }; });
await app.close();
const quiet = (s) => new Array(Math.round(s * voice.rate)).fill(0);
const samples = [...quiet(8), ...voice.samples, ...quiet(6)];
const wav = Buffer.alloc(44 + samples.length * 2);
wav.write('RIFF', 0); wav.writeUInt32LE(36 + samples.length * 2, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(voice.rate, 24);
wav.writeUInt32LE(voice.rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(samples.length * 2, 40);
samples.forEach((v, i) => wav.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v * 32767))), 44 + i * 2));
const file = join(mkdtempSync(join(tmpdir(), 'maya-wake-wav-')), 'hey-maya.wav');
writeFileSync(file, wav);

// 2. The app with that recording as its microphone.
app = await electron.launch({ args: ['.', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${file}`], env: env() });
let ok = false;
try {
  const notch = await windowOf(app, 'notch');
  const spoken = [];
  // Woken = the notch opens for voice and Maya greets ("Good morning, boss! What's the work?").
  for (let i = 0; i < 80 && !ok; i++) {
    await sleep(500);
    const text = (await notch.textContent('body').catch(() => '')) || '';
    if (/boss|what's the work|Listening… just talk|Speaking…|Thinking…/i.test(text)) { ok = true; spoken.push(text.replace(/\s+/g, ' ').slice(0, 160)); }
  }
  console.log(`${ok ? 'PASS' : 'FAIL'} "Hey Maya" after 8 s of quiet wakes Maya ${spoken[0] || ''}`);
} finally {
  await app.close();
}
process.exit(ok ? 0 : 1);
