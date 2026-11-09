// Every model Maya needs, where it comes from, and whether it is on disk.
import { createWriteStream, existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { execFileSync } from 'node:child_process';
import { modelsDir, TAR } from '../paths.js';

export const ollamaModels = {
  brain: { name: 'qwen3.5:4b', label: 'Brain + vision (Qwen 3.5 4B)', sizeMB: 3400 },
  smart: { name: 'qwen3.5:9b', label: 'Smart brain for long answers (Qwen 3.5 9B)', sizeMB: 6600 },
  embed: { name: 'nomic-embed-text', label: 'Text search (nomic-embed-text)', sizeMB: 274 },
  // Only on Lite laptops (no 4 GB graphics card or under 10 GB RAM), instead of the 4B.
  lite: { name: 'qwen3.5:2b', label: 'Lite brain for this laptop (Qwen 3.5 2B)', sizeMB: 2700, lite: true },
};

export const hfModels = {
  whisper: { repo: 'onnx-community/whisper-small', label: 'Listening (Whisper small)', sizeMB: 400 },
  kokoro: { repo: 'onnx-community/Kokoro-82M-v1.0-ONNX', label: 'Voice (Kokoro 82M)', sizeMB: 90 },
  clip: { repo: 'Xenova/clip-vit-base-patch32', label: 'Photo search (CLIP)', sizeMB: 350 },
  rmbg: { repo: 'briaai/RMBG-1.4', label: 'Background remover (RMBG 1.4)', sizeMB: 45 },
  upscaler: { repo: 'Xenova/swin2SR-classical-sr-x2-64', label: 'Photo upscaler (Swin2SR ×2)', sizeMB: 22 },
  wake: { repo: 'onnx-community/whisper-tiny.en', label: '"Hey Maya" listener (Whisper tiny)', sizeMB: 65 },
};

export const fileModels = {
  ultraface: { label: 'Face detection (UltraFace)', file: 'faces/version-RFB-320.onnx', sizeMB: 1,
    url: 'https://huggingface.co/onnxmodelzoo/version-RFB-320/resolve/main/version-RFB-320.onnx' },
  tesseract: { label: 'Text reading (Tesseract English)', file: 'tesseract/eng.traineddata.gz', sizeMB: 3,
    url: 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int/eng.traineddata.gz' },
  sdcpp: { label: 'Image generator program (stable-diffusion.cpp, Vulkan)', file: 'sd/sd-vulkan.zip', unzip: 'sd/bin', sizeMB: 30,
    url: 'https://github.com/leejet/stable-diffusion.cpp/releases/download/master-1017-be48649/sd-master-be48649-bin-win-vulkan-x64.zip' },
  // minVramGB: skipped on laptops whose graphics card cannot run it.
  sdturbo: { label: 'Image generator model (SD-Turbo)', file: 'sd/sd_turbo-f16-q8_0.gguf', sizeMB: 2024, minVramGB: 4,
    url: 'https://huggingface.co/Green-Sky/SD-Turbo-GGUF/resolve/main/sd_turbo-f16-q8_0.gguf' },
  githubmcp: { label: 'GitHub MCP server', file: '../mcp/github-mcp-server.zip', unzip: '../mcp/github', sizeMB: 12, optional: true,
    url: 'https://github.com/github/github-mcp-server/releases/download/v2.0.3/github-mcp-server_Windows_x86_64.zip' },
  sdxl: { label: 'Better image generator (SDXL-Turbo)', file: 'sd/sd_xl_turbo_1.0.q8_0.gguf', sizeMB: 4099, minVramGB: 6,
    url: 'https://huggingface.co/OlegSkutte/sdxl-turbo-GGUF/resolve/main/sd_xl_turbo_1.0.q8_0.gguf' },
  sdxlvae: { label: 'SDXL colour decoder (VAE fp16 fix)', file: 'sd/sdxl_vae.safetensors', sizeMB: 335, minVramGB: 6,
    url: 'https://huggingface.co/madebyollin/sdxl-vae-fp16-fix/resolve/main/sdxl_vae.safetensors' },
  // Downloaded the first time Maya speaks Tamil: Meta's MMS-TTS Tamil voice (CC-BY-NC 4.0), converted to ONNX for Maya.
  tamilvoice: { label: 'Tamil voice (Meta MMS, offline)', file: 'local/mms-tts-tam.zip', unzip: 'local/mms-tts-tam', sizeMB: 105, optional: true,
    url: 'https://github.com/Achu226/ather/releases/download/v1.5.0/mms-tts-tam.zip' },
  // Downloaded when the listening language is Tamil: Whisper small fine-tuned on Tamil (Apache-2.0), ~9x fewer mistakes.
  tamilears: { label: 'Tamil listening (Whisper Tamil small)', file: 'local/whisper-tamil-small.zip', unzip: 'local/whisper-tamil-small', sizeMB: 456, optional: true,
    url: 'https://github.com/Achu226/ather/releases/download/v1.5.0/whisper-tamil-small.zip' },
  // Downloaded when head mouse control is first turned on.
  facemesh: { label: 'Face tracker for head mouse (MediaPipe)', file: 'face_landmarker.task', sizeMB: 4, optional: true,
    url: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task' },
};

export const hfInstalled = (key) => existsSync(join(modelsDir, 'hf', hfModels[key].repo));
export const fileInstalled = (key) => {
  const m = fileModels[key];
  return existsSync(join(modelsDir, m.unzip || m.file));
};

/** Download one file model with progress (0..1); unzips zip archives with Windows' built-in tar. */
export async function downloadFile(key, onProgress = () => {}) {
  const m = fileModels[key];
  const target = join(modelsDir, m.file);
  if (fileInstalled(key)) return target;
  mkdirSync(dirname(target), { recursive: true });

  const res = await fetch(m.url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Download failed for ${m.label}: ${res.status}`);
  const total = Number(res.headers.get('content-length')) || m.sizeMB * 1e6;
  let done = 0;
  const body = Readable.fromWeb(res.body);
  body.on('data', (c) => { done += c.length; onProgress(done / total); });
  await pipeline(body, createWriteStream(`${target}.part`));
  if (statSync(`${target}.part`).size < 1000) throw new Error(`Download of ${m.label} looks broken`);
  renameSync(`${target}.part`, target);

  if (m.unzip) {
    const dir = join(modelsDir, m.unzip);
    mkdirSync(dir, { recursive: true });
    execFileSync(TAR, ['-xf', target, '-C', dir]);
  }
  onProgress(1);
  return target;
}
