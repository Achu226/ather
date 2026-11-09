// Microphone capture at 16 kHz (what Whisper expects) and speech playback with a mouth-level callback.

/** Record 16 kHz mono from the mic (default) or a given MediaStream (e.g. computer audio). */
export async function startRecording(given = null) {
  const stream = given || await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  const ctx = new AudioContext({ sampleRate: 16000 });
  const source = ctx.createMediaStreamSource(stream);
  const processor = ctx.createScriptProcessor(4096, 1, 1);
  const chunks = [];
  let level = 0;
  processor.onaudioprocess = (e) => {
    const data = e.inputBuffer.getChannelData(0);
    chunks.push(new Float32Array(data));
    let sum = 0;
    for (let i = 0; i < data.length; i += 16) sum += data[i] * data[i];
    level = Math.sqrt(sum / (data.length / 16));
  };
  source.connect(processor);
  processor.connect(ctx.destination);

  const drain = () => {
    const out = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
    let offset = 0;
    for (const c of chunks) { out.set(c, offset); offset += c.length; }
    chunks.length = 0;
    return out;
  };

  return {
    level: () => level,
    /** Audio recorded since the last take(), while recording continues. */
    take: drain,
    async stop() {
      processor.disconnect();
      source.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      await ctx.close();
      return drain();
    },
  };
}

let current = null;

/** Play { samples, sampleRate }; onLevel(0..1) is called every frame for the mouth. Resolves when finished. */
export function playSpeech(audio, onLevel = () => {}) {
  stopSpeech();
  return new Promise((resolve) => {
    const ctx = new AudioContext();
    const buffer = ctx.createBuffer(1, audio.samples.length, audio.sampleRate);
    buffer.copyToChannel(Float32Array.from(audio.samples), 0);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    src.connect(analyser);
    analyser.connect(ctx.destination);
    const data = new Float32Array(analyser.fftSize);
    let raf;
    const tick = () => {
      analyser.getFloatTimeDomainData(data);
      let sum = 0;
      for (const v of data) sum += v * v;
      onLevel(Math.min(1, Math.sqrt(sum / data.length) * 6));
      raf = requestAnimationFrame(tick);
    };
    const finish = () => { cancelAnimationFrame(raf); onLevel(0); ctx.close(); current = null; resolve(); };
    src.onended = finish;
    current = { stop: () => { try { src.stop(); } catch { finish(); } } };
    src.start();
    tick();
  });
}

export function stopSpeech() { current?.stop(); }

/** Short two-note chime for reminders. */
export function chime() {
  const ctx = new AudioContext();
  [660, 880].forEach((f, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = f;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.18);
    gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + i * 0.18 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.18 + 0.35);
    osc.connect(gain).connect(ctx.destination);
    osc.start(ctx.currentTime + i * 0.18);
    osc.stop(ctx.currentTime + i * 0.18 + 0.4);
  });
  setTimeout(() => ctx.close(), 1200);
}

export const fileUrl = (path) => `file:///${encodeURI(path.replace(/\\/g, '/'))}`;
