// Local ML models, loaded lazily. Runs inside the ML utility process (worker.js) so the UI never freezes.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { env, pipeline, AutoModel, AutoProcessor, CLIPVisionModelWithProjection, AutoTokenizer, CLIPTextModelWithProjection, RawImage } from '@huggingface/transformers';
import { KokoroTTS } from 'kokoro-js';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as ort from 'onnxruntime-node';
import sharp from 'sharp';
import { createWorker } from 'tesseract.js';
import { modelsDir } from '../paths.js';
import { fileModels } from './catalog.js';

env.cacheDir = join(modelsDir, 'hf');
// Models Maya converted itself (Tamil voice and listening) are unzipped here; the library joins local paths with '/'.
env.localModelPath = join(modelsDir, 'local').replaceAll('\\', '/');

// kokoro-js bundles its own transformers v3; point that copy's cache at Maya's models folder too,
// otherwise it downloads into node_modules (which is read-only inside the packaged app).
const kokoroDir = dirname(dirname(createRequire(import.meta.url).resolve('kokoro-js')));
const kokoroTransformers = join(kokoroDir, 'node_modules', '@huggingface', 'transformers', 'dist', 'transformers.node.mjs');
if (existsSync(kokoroTransformers)) (await import(pathToFileURL(kokoroTransformers).href)).env.cacheDir = join(modelsDir, 'hf');

export const HF = {
  whisper: 'onnx-community/whisper-small',
  kokoro: 'onnx-community/Kokoro-82M-v1.0-ONNX',
  clip: 'Xenova/clip-vit-base-patch32',
  rmbg: 'briaai/RMBG-1.4',
  upscaler: 'Xenova/swin2SR-classical-sr-x2-64',
  wake: 'onnx-community/whisper-tiny.en',
};

const cache = {};
const once = (key, make) => (cache[key] ??= make().catch((e) => { delete cache[key]; throw e; }));

// ---------- speech to text ----------
const whisper = (progress) => once('whisper', () => pipeline('automatic-speech-recognition', HF.whisper,
  { dtype: { encoder_model: 'fp32', decoder_model_merged: 'q8' }, progress_callback: progress }));

// Tamil: Whisper small fine-tuned on Tamil (about 2% wrong characters instead of 15%), when downloaded.
const tamilEars = () => once('tamilEars', () => pipeline('automatic-speech-recognition', 'whisper-tamil-small',
  { dtype: { encoder_model: 'fp32', decoder_model_merged: 'q8' }, local_files_only: true }));

/** audio: Float32Array of 16 kHz mono samples. language: e.g. "english", "hindi", or null to auto-detect. */
/** task 'translate' turns speech in any language into English text. */
export async function transcribe(audio, language = null, task = 'transcribe') {
  const tamil = /^(ta|tamil)$/i.test(language || '') && task === 'transcribe' && existsSync(join(modelsDir, 'local', 'whisper-tamil-small', 'onnx'));
  const asr = tamil ? await tamilEars() : await whisper();
  const out = await asr(audio, { language, task, chunk_length_s: 30 });
  return out.text.trim();
}

// Tiny English Whisper for the always-on "Hey Maya" check: fast enough to run on every short utterance.
const whisperTiny = (progress) => once('wake', () => pipeline('automatic-speech-recognition', HF.wake,
  { dtype: { encoder_model: 'fp32', decoder_model_merged: 'q8' }, progress_callback: progress }));

export async function transcribeQuick(audio) {
  const asr = await whisperTiny();
  return (await asr(audio)).text.trim();
}

// ---------- image extras ----------
// RMBG-1.4 is a custom model type, so it is loaded by hand (the ready-made pipeline rejects it).
const rmbg = (progress) => once('rmbg', async () => ({
  model: await AutoModel.from_pretrained(HF.rmbg, { config: { model_type: 'custom' }, dtype: 'q8', progress_callback: progress }),
  processor: await AutoProcessor.from_pretrained(HF.rmbg, { progress_callback: progress, config: {
    do_normalize: true, do_pad: false, do_rescale: true, do_resize: true, image_mean: [0.5, 0.5, 0.5], image_std: [1, 1, 1],
    feature_extractor_type: 'ImageFeatureExtractor', resample: 2, rescale_factor: 1 / 255, size: { width: 1024, height: 1024 },
  } }),
}));
const upscaler = (progress) => once('upscaler', () => pipeline('image-to-image', HF.upscaler, { dtype: 'q8', progress_callback: progress }));
const MAX_UPSCALE_SIDE = 1024;

/** Cut out the main subject: saves a transparent PNG to `out`. */
export async function removeBackground(path, out) {
  const { model, processor } = await rmbg();
  const image = await RawImage.read(path);
  const { pixel_values } = await processor(image);
  const { output } = await model({ input: pixel_values });
  const mask = await RawImage.fromTensor(output[0].mul(255).to('uint8')).resize(image.width, image.height);
  // Flatten to RGB first: sharp applies removeAlpha() late, which would also drop the joined mask.
  const rgb = await sharp(path).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  await sharp(rgb.data, { raw: rgb.info })
    .joinChannel(Buffer.from(mask.data), { raw: { width: mask.width, height: mask.height, channels: 1 } }).png().toFile(out);
  return out;
}

/** Double the resolution with Swin2SR. Large inputs are refused (memory and minutes of CPU). */
export async function upscale(path, out) {
  const meta = await sharp(path).metadata();
  if (Math.max(meta.width, meta.height) > MAX_UPSCALE_SIDE) throw new Error(`This picture is already ${meta.width}×${meta.height}. Upscaling works on pictures up to ${MAX_UPSCALE_SIDE} pixels wide.`);
  const image = await (await upscaler())(path);
  await image.save(out);
  return out;
}

// ---------- text to speech ----------
const kokoro = (progress) => once('kokoro', () => KokoroTTS.from_pretrained(HF.kokoro, { dtype: 'q8', device: 'cpu', progress_callback: progress }));

export async function speak(text, voice = 'af_heart', speed = 1) {
  const tts = await kokoro();
  // Slower speech helps people who process speech slowly or are tired; 0.7 to 1.3.
  const audio = await tts.generate(text, { voice, speed: Math.min(1.3, Math.max(0.7, Number(speed) || 1)) });
  return { samples: audio.audio, sampleRate: audio.sampling_rate };
}

// Tamil: Meta's MMS voice, offline (Kokoro has no Tamil and most PCs have no Tamil Windows voice).
const tamilVoice = () => once('tamil', () => pipeline('text-to-speech', 'mms-tts-tam', { dtype: 'fp32', local_files_only: true }));

// The Tamil voice only knows Tamil letters: abbreviations like "DBMS" are spelled with Tamil letter names instead of vanishing.
const LETTERS = { A: 'ஏ', B: 'பி', C: 'சி', D: 'டி', E: 'ஈ', F: 'எஃப்', G: 'ஜி', H: 'ஹெச்', I: 'ஐ', J: 'ஜே', K: 'கே', L: 'எல்', M: 'எம்',
  N: 'என்', O: 'ஓ', P: 'பி', Q: 'க்யூ', R: 'ஆர்', S: 'எஸ்', T: 'டி', U: 'யூ', V: 'வி', W: 'டபிள்யூ', X: 'எக்ஸ்', Y: 'ஒய்', Z: 'இசட்' };
export const spellAbbreviations = (text) => text.replace(/\b[A-Z]{2,6}\b/g, (w) => [...w].map((c) => LETTERS[c]).join(' '));

export async function speakTamil(text) {
  const tts = await tamilVoice();
  text = spellAbbreviations(text);
  // Sentence by sentence, with a short pause: long input makes this model rush and slur.
  const parts = text.split(/(?<=[.!?।])\s+/).map((s) => s.trim()).filter(Boolean);
  const chunks = [];
  let rate = 16000;
  for (const p of parts) {
    const out = await tts(p);
    rate = out.sampling_rate;
    chunks.push(out.audio, new Float32Array(Math.round(rate * 0.25)));
  }
  const samples = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) { samples.set(c, at); at += c.length; }
  return { samples, sampleRate: rate };
}

// ---------- CLIP: photo search ----------
const clip = (progress) => once('clip', async () => ({
  processor: await AutoProcessor.from_pretrained(HF.clip, { progress_callback: progress }),
  vision: await CLIPVisionModelWithProjection.from_pretrained(HF.clip, { progress_callback: progress }),
  tokenizer: await AutoTokenizer.from_pretrained(HF.clip, { progress_callback: progress }),
  text: await CLIPTextModelWithProjection.from_pretrained(HF.clip, { progress_callback: progress }),
}));

const normalize = (v) => { const n = Math.hypot(...v) || 1; return Array.from(v, (x) => x / n); };

export async function clipImage(path) {
  const m = await clip();
  const image = await RawImage.read(path);
  const { image_embeds } = await m.vision(await m.processor(image));
  return normalize(image_embeds.data);
}

export async function clipText(text) {
  const m = await clip();
  const { text_embeds } = await m.text(m.tokenizer([text], { padding: true, truncation: true }));
  return normalize(text_embeds.data);
}

// ---------- OCR ----------
const ocrWorker = () => once('ocr', () => createWorker('eng', 1, {
  langPath: join(modelsDir, 'tesseract'), cachePath: join(modelsDir, 'tesseract'), gzip: true,
}));

/** Words found in an image with their pixel boxes. */
export async function ocr(path) {
  const worker = await ocrWorker();
  const { data } = await worker.recognize(path, {}, { blocks: true });
  const words = [];
  for (const b of data.blocks || []) for (const p of b.paragraphs) for (const l of p.lines) for (const w of l.words) {
    words.push({ text: w.text, box: w.bbox });
  }
  return { text: data.text, words };
}

// ---------- face detection (UltraFace RFB-320) ----------
const faceModel = () => once('faces', () => {
  const file = join(modelsDir, fileModels.ultraface.file);
  if (!existsSync(file)) throw new Error('Face model not downloaded yet');
  return ort.InferenceSession.create(readFileSync(file));
});

/** Face boxes in pixels: [{ x0, y0, x1, y1, score }]. */
export async function faces(path) {
  const session = await faceModel();
  const meta = await sharp(path).metadata();
  const { data } = await sharp(path).removeAlpha().resize(320, 240, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  const input = new Float32Array(3 * 240 * 320);
  for (let i = 0; i < 240 * 320; i++) for (let c = 0; c < 3; c++) input[c * 240 * 320 + i] = (data[i * 3 + c] - 127) / 128;
  const out = await session.run({ input: new ort.Tensor('float32', input, [1, 3, 240, 320]) });
  const scores = out.scores.data, boxes = out.boxes.data;
  const found = [];
  for (let i = 0; i < scores.length / 2; i++) {
    if (scores[i * 2 + 1] < 0.7) continue;
    found.push({ score: scores[i * 2 + 1], x0: boxes[i * 4] * meta.width, y0: boxes[i * 4 + 1] * meta.height,
      x1: boxes[i * 4 + 2] * meta.width, y1: boxes[i * 4 + 3] * meta.height });
  }
  return nms(found.sort((a, b) => b.score - a.score));
}

function nms(boxes, limit = 0.3) {
  const kept = [];
  const area = (b) => Math.max(0, b.x1 - b.x0) * Math.max(0, b.y1 - b.y0);
  for (const b of boxes) {
    const overlaps = kept.some((k) => {
      const w = Math.max(0, Math.min(b.x1, k.x1) - Math.max(b.x0, k.x0));
      const h = Math.max(0, Math.min(b.y1, k.y1) - Math.max(b.y0, k.y0));
      return (w * h) / (area(b) + area(k) - w * h) > limit;
    });
    if (!overlaps) kept.push(b);
  }
  return kept;
}

/** Load a model ahead of time (first-run download screen). */
export async function warm(key, progress) {
  if (key === 'whisper') return whisper(progress);
  if (key === 'kokoro') return kokoro(progress);
  if (key === 'clip') return clip(progress);
  if (key === 'ocr') return ocrWorker();
  if (key === 'rmbg') return rmbg(progress);
  if (key === 'upscaler') return upscaler(progress);
  if (key === 'wake') return whisperTiny(progress);
  throw new Error(`Unknown model ${key}`);
}
