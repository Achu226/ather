// Image editor (blur emails, faces, names) and local image generation (stable-diffusion.cpp + SD-Turbo).
import { execFile } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join, parse } from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { imagesDir, modelsDir } from '../paths.js';
import { fileModels } from '../ml/catalog.js';
import { OLLAMA, freeGpu } from '../ollama.js';
import { BRAIN_MODEL } from '../brain.js';
import { liteSwap } from '../models.js';

const run = promisify(execFile);
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/;
const PHONE = /^\+?\d[\d\s-]{7,}\d$/;

/** Ask the brain which OCR words are people's names. */
async function findNames(text) {
  if (!text.trim()) return [];
  const res = await fetch(`${OLLAMA}/v1/chat/completions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: liteSwap(BRAIN_MODEL), reasoning_effort: 'none', temperature: 0,
      messages: [{ role: 'user', content: `List every person's name (first or last names) in this text as a JSON array of strings, nothing else:\n\n${text.slice(0, 3000)}` }],
    }),
  });
  const content = (await res.json()).choices?.[0]?.message?.content || '[]';
  try { return JSON.parse(content.match(/\[[\s\S]*\]/)?.[0] || '[]').flatMap((n) => String(n).split(/\s+/)); } catch { return []; }
}

export function createImaging({ ml }) {
  /** Blur faces, emails (and phone numbers) and/or names in a picture. Saves a copy and returns its path. */
  async function blur(path, { faces = true, emails = true, names = true } = {}) {
    const meta = await sharp(path).metadata();
    const regions = [];
    if (faces) for (const f of await ml.call('faces', path)) regions.push({ x0: f.x0, y0: f.y0, x1: f.x1, y1: f.y1, why: 'face' });
    if (emails || names) {
      const { text, words } = await ml.call('ocr', path);
      const nameSet = names ? new Set((await findNames(text)).map((n) => n.toLowerCase().replace(/[^\p{L}]/gu, ''))) : new Set();
      for (const w of words) {
        const clean = w.text.toLowerCase().replace(/[^\p{L}]/gu, '');
        const hit = (emails && (EMAIL.test(w.text) || PHONE.test(w.text))) ? 'email' : (nameSet.has(clean) && clean.length > 1 ? 'name' : null);
        if (hit) regions.push({ ...w.box, why: hit });
      }
    }

    const layers = [];
    for (const r of regions) {
      const pad = 4;
      const left = Math.max(0, Math.floor(r.x0) - pad), top = Math.max(0, Math.floor(r.y0) - pad);
      const width = Math.min(meta.width - left, Math.ceil(r.x1 - r.x0) + pad * 2);
      const height = Math.min(meta.height - top, Math.ceil(r.y1 - r.y0) + pad * 2);
      if (width < 2 || height < 2) continue;
      const sigma = Math.max(6, Math.min(width, height) / 3);
      layers.push({ input: await sharp(path).extract({ left, top, width, height }).blur(sigma).toBuffer(), left, top });
    }
    const out = join(imagesDir, `${parse(path).name}-blurred-${Date.now()}.png`);
    await sharp(path).composite(layers).png().toFile(out);
    return { path: out, blurred: regions.map((r) => r.why) };
  }

  /**
   * Generate 1-4 different pictures from a text prompt, fully offline.
   * Uses SDXL-Turbo when downloaded (better), otherwise SD-Turbo. shape: square | portrait | landscape.
   */
  async function generate(prompt, { count = 1, shape = 'square' } = {}) {
    const binDir = join(modelsDir, fileModels.sdcpp.unzip);
    const exe = existsSync(binDir) && readdirSync(binDir, { recursive: true }).find((f) => /(^|[\\/])sd(-cli)?\.exe$/i.test(f));
    const sdxl = join(modelsDir, fileModels.sdxl.file), vae = join(modelsDir, fileModels.sdxlvae.file);
    const turbo = join(modelsDir, fileModels.sdturbo.file);
    let useXl = existsSync(sdxl) && existsSync(vae);
    if (!exe || !existsSync(useXl ? sdxl : turbo)) throw new Error('The image generator is still downloading. Try again in a few minutes.');
    const n = Math.min(4, Math.max(1, Math.round(count) || 1));
    const [w, h] = { portrait: [512, 768], landscape: [768, 512] }[shape] || [512, 512];
    const base = join(imagesDir, `generated-${Date.now()}`);
    // Turbo models are distilled for 1 (SD) to 4 (SDXL) steps with guidance off; a random seed gives variety.
    const args = (xl) => ['-m', xl ? sdxl : turbo, '-p', prompt, '-n', 'blurry, deformed, ugly, low quality, watermark, text artifacts',
      '--steps', xl ? '4' : '1', '--cfg-scale', '1', '--sampling-method', 'euler_a', '-W', String(w), '-H', String(h),
      '-s', '-1', '-b', String(n), '-o', `${base}-%d.png`, ...(xl ? ['--vae', vae, '--vae-tiling'] : [])];
    const draw = async (xl) => { await freeGpu(); await run(join(binDir, exe), args(xl), { timeout: 600_000, windowsHide: true, cwd: binDir }); };
    try {
      await draw(useXl); // freeGpu first: a loaded chat model can leave too little video memory for SDXL
    } catch (e) {
      // Video memory still too small (e.g. a chat model reloaded meanwhile): the much smaller SD-Turbo still fits.
      if (!useXl || !existsSync(turbo)) throw e;
      useXl = false;
      await draw(false);
    }
    const paths = readdirSync(imagesDir).filter((f) => f.startsWith(`${parse(base).name}-`) && f.endsWith('.png')).sort().map((f) => join(imagesDir, f));
    if (!paths.length) throw new Error('The image generator finished without a picture. Try a simpler description.');
    return { path: paths[0], paths, prompt, model: useXl ? 'SDXL-Turbo' : 'SD-Turbo' };
  }

  const outPath = (path, tag) => join(imagesDir, `${parse(path).name}-${tag}-${Date.now()}.png`);
  const removeBackground = async (path) => ({ path: await ml.call('removeBackground', path, outPath(path, 'cutout')) });
  const upscale = async (path) => ({ path: await ml.call('upscale', path, outPath(path, '2x')) });

  return { blur, generate, removeBackground, upscale };
}
