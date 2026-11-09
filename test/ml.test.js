// Real-model checks (slow). Skipped until the models are downloaded: node scripts/fetch-models.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const { modelsDir } = await import('../src/main/paths.js');
const ready = existsSync(join(modelsDir, 'hf', 'onnx-community', 'whisper-small'));
const core = ready ? await import('../src/main/ml/core.js') : null;
const opts = { skip: !ready && 'models not downloaded', timeout: 600_000 };

/** Linear resample to 16 kHz for Whisper. */
function to16k(samples, rate) {
  const out = new Float32Array(Math.floor((samples.length * 16000) / rate));
  for (let i = 0; i < out.length; i++) out[i] = samples[Math.floor((i * rate) / 16000)];
  return out;
}

test('Kokoro speaks and Whisper hears it back', opts, async () => {
  const { samples, sampleRate } = await core.speak('Remind me to study databases tomorrow.', 'af_heart');
  assert.ok(samples.length > sampleRate); // more than a second of audio
  const text = await core.transcribe(to16k(samples, sampleRate), 'english');
  assert.match(text.toLowerCase(), /study.*database/);
});

test('CLIP matches text to the right meaning', opts, async () => {
  const cat = await core.clipText('a photo of a cat');
  const kitten = await core.clipText('a picture of a kitten');
  const car = await core.clipText('a red sports car');
  const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
  assert.ok(dot(cat, kitten) > dot(cat, car));
});
