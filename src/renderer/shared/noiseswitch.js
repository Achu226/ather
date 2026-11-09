// Mouth-noise switch (as in Talon's "pop"): a short, sharp sound such as a lip pop or tongue click presses the switch,
// for people who can neither speak clearly nor move their head. Speech, coughs and music are longer, so they do not count.

/** Peak levels (0..1) a pop must reach, and below which the room counts as quiet. */
export const SENSITIVITY = {
  low: { threshold: 0.4, quiet: 0.1 },
  normal: { threshold: 0.25, quiet: 0.06 },
  high: { threshold: 0.12, quiet: 0.04 },
};

/**
 * Feed it the peak level every ~20 ms; it returns true once per pop: a burst over `threshold` lasting at most `maxMs`,
 * after at least `preQuietMs` of quiet, and at least `gapMs` after the last pop. Pure, so it is unit tested.
 */
export function createNoiseSwitch({ threshold = SENSITIVITY.normal.threshold, quiet = SENSITIVITY.normal.quiet, maxMs = 150, preQuietMs = 250, gapMs = 600 } = {}) {
  let quietFrom = null, burst = null, last = -Infinity;
  return (level, t) => {
    if (burst) {
      if (level >= quiet) { if (t - burst.start > maxMs) burst.ok = false; return false; }
      const fire = burst.ok && t - last >= gapMs;
      burst = null; quietFrom = t;
      if (fire) last = t;
      return fire;
    }
    if (level >= threshold) { burst = { start: t, ok: quietFrom !== null && t - quietFrom >= preQuietMs }; return false; }
    if (level >= quiet) { quietFrom = null; return false; }
    quietFrom ??= t;
    return false;
  };
}

/** Listens to the microphone and calls onPress for each pop; returns stop(). Noise suppression would remove the pops. */
export async function startNoiseSwitch({ onPress, sensitivity = 'normal' }) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  const ctx = new AudioContext();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  ctx.createMediaStreamSource(stream).connect(analyser);
  const buf = new Float32Array(analyser.fftSize);
  const detect = createNoiseSwitch(SENSITIVITY[sensitivity] || SENSITIVITY.normal);
  const timer = setInterval(() => {
    analyser.getFloatTimeDomainData(buf);
    let peak = 0;
    for (const v of buf) peak = Math.max(peak, Math.abs(v));
    if (detect(peak, performance.now())) onPress();
  }, 20);
  return () => { clearInterval(timer); stream.getTracks().forEach((t) => t.stop()); ctx.close(); };
}
