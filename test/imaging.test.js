// Real image generation + blur (slow, uses the GPU). Skipped until the models are downloaded.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const { modelsDir, imagesDir } = await import('../src/main/paths.js');
const ready = existsSync(join(modelsDir, 'sd', 'sd_turbo-f16-q8_0.gguf'));
const core = ready ? await import('../src/main/ml/core.js') : null;
const { createImaging } = await import('../src/main/services/imaging.js');
const ml = { call: (op, ...args) => core[op](...args) };
const imaging = createImaging({ ml });
const opts = { skip: !ready && 'models not downloaded', timeout: 600_000 };

test('generates several different pictures in one request', opts, async () => {
  const { paths, model } = await imaging.generate('a red sports car on a mountain road, photo', { count: 2 });
  console.log('image model:', model);
  assert.equal(paths.length, 2);
  const [a, b] = await Promise.all(paths.map((p) => sharp(p).raw().toBuffer()));
  assert.ok(!a.equals(b), 'the two pictures should be different');
});

test('generates a portrait and finds the face in it', opts, async () => {
  const { path } = await imaging.generate('close-up portrait photo of a smiling young man, looking at the camera, studio light');
  assert.ok(existsSync(path));
  const meta = await sharp(path).metadata();
  assert.equal(meta.width, 512);
  const found = await core.faces(path);
  assert.ok(found.length >= 1, 'expected at least one face');
});

test('blurs an email address found by OCR', opts, async () => {
  const svg = `<svg width="700" height="160" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="white"/>
    <text x="20" y="70" font-size="36" font-family="Arial">Contact: rahul.sharma@gmail.com</text>
    <text x="20" y="130" font-size="36" font-family="Arial">Meeting at 5pm</text></svg>`;
  const src = join(imagesDir, 'ocr-test.png');
  await sharp(Buffer.from(svg)).png().toFile(src);
  const { path, blurred } = await imaging.blur(src, { faces: false, emails: true, names: false });
  assert.ok(blurred.includes('email'));
  const { text } = await core.ocr(path);
  assert.doesNotMatch(text, /gmail/i);
  assert.match(text, /Meeting/);
});
