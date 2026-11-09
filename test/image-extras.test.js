import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';

process.env.ATHER_DATA = mkdtempSync(join(tmpdir(), 'ather-img-'));
process.env.ATHER_MODELS = join(process.env.APPDATA || '', 'Ather', 'models');
const core = await import('../src/main/ml/core.js');
const opts = { timeout: 600_000 };

const sample = async (name, size) => {
  const file = join(process.env.ATHER_DATA, name);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="100%" height="100%" fill="#7ec8e3"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${size / 4}" fill="#e4572e"/><rect x="${size / 3}" y="${size * 0.7}" width="${size / 3}" height="${size / 8}" fill="#333"/></svg>`;
  await sharp(Buffer.from(svg)).png().toFile(file);
  return file;
};

test('background removal produces a transparent cut-out', opts, async () => {
  const out = await core.removeBackground(await sample('ball.png', 320), join(process.env.ATHER_DATA, 'cut.png'));
  const meta = await sharp(out).metadata();
  const { data } = await sharp(out).ensureAlpha().extractChannel(3).raw().toBuffer({ resolveWithObject: true });
  const hist = [0, 0, 0, 0];
  for (const a of data) hist[a >> 6]++;
  assert.equal(meta.channels, 4, `channels ${meta.channels}`);
  assert.ok(hist[0] > 1000 && hist[3] > 1000, `alpha histogram ${hist}`);
});

test('upscaler doubles the resolution', opts, async () => {
  const out = await core.upscale(await sample('small.png', 96), join(process.env.ATHER_DATA, 'big.png'));
  const { width, height } = await sharp(out).metadata();
  assert.equal(width, 192);
  assert.equal(height, 192);
});

test('upscaler refuses huge pictures with a clear message', opts, async () => {
  await assert.rejects(core.upscale(await sample('huge.png', 1500), join(process.env.ATHER_DATA, 'x.png')), /up to 1024/);
});

test('quick transcriber hears the wake word', opts, async () => {
  const { samples, sampleRate } = await core.speak('Hey Maya, what is the time?', 'af_heart');
  const out = new Float32Array(Math.floor((samples.length * 16000) / sampleRate));
  for (let i = 0; i < out.length; i++) out[i] = samples[Math.floor((i * sampleRate) / 16000)];
  const text = await core.transcribeQuick(out);
  assert.match(text.toLowerCase(), /time/);
  console.log('heard:', text);
});
