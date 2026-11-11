import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * OLLAMA_HOST is the address Ollama *listens* on, often "0.0.0.0:11434" with no scheme: to connect, add http://
 * and use this PC for 0.0.0.0. Exported for tests.
 */
export function ollamaUrl(host = '') {
  if (!host.trim()) return 'http://127.0.0.1:11434';
  const url = /^https?:\/\//i.test(host) ? host.trim() : `http://${host.trim()}`;
  return url.replace(/\/\/(0\.0\.0\.0|\[::\])(?=[:/]|$)/, '//127.0.0.1').replace(/\/+$/, '');
}
// A live binding: brain, providers, imaging, mail and embeddings all follow setOllamaHost().
export let OLLAMA = ollamaUrl(process.env.OLLAMA_HOST);
/** Think on another PC's Ollama (the "brain server"); '' = this PC. Returns the URL now in use. */
export function setOllamaHost(host = '') { OLLAMA = ollamaUrl(host || process.env.OLLAMA_HOST || ''); return OLLAMA; }
export const isLocalOllama = (url = OLLAMA) => /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(?=[:/]|$)/i.test(url);

async function up() {
  try { return (await fetch(`${OLLAMA}/api/version`, { signal: AbortSignal.timeout(2000) })).ok; } catch { return false; }
}

/** Make sure the Ollama server is running; start it if it is installed but stopped (only on this PC). */
export async function ensureOllama() {
  if (await up()) return true;
  if (!isLocalOllama()) return false; // another PC's brain: Maya can't start it from here
  const exe = [join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama', 'ollama.exe')].find(existsSync) || 'ollama';
  try {
    spawn(exe, ['serve'], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  } catch { return false; }
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (await up()) return true;
  }
  return false;
}

export async function hasModel(name) {
  const res = await fetch(`${OLLAMA}/api/show`, { method: 'POST', body: JSON.stringify({ model: name }) });
  return res.ok;
}

/** Unload every Ollama model so another GPU program (the image generator) gets the video memory. */
export async function freeGpu() {
  const res = await fetch(`${OLLAMA}/api/ps`).catch(() => null);
  if (!res?.ok) return;
  const { models = [] } = await res.json();
  await Promise.all(models.map((m) => fetch(`${OLLAMA}/api/generate`, { method: 'POST', body: JSON.stringify({ model: m.name, keep_alive: 0 }) }).catch(() => {})));
}

/** Pull a model, reporting progress as 0..1. */
export async function pullModel(name, onProgress = () => {}) {
  const res = await fetch(`${OLLAMA}/api/pull`, { method: 'POST', body: JSON.stringify({ model: name, stream: true }) });
  if (!res.ok) throw new Error(`Could not download ${name}: ${res.status}`);
  const decoder = new TextDecoder();
  let buf = '';
  for await (const chunk of res.body) {
    buf += decoder.decode(chunk, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      if (!line.trim()) continue;
      const msg = JSON.parse(line);
      if (msg.error) throw new Error(msg.error);
      if (msg.total) onProgress(msg.completed / msg.total, msg.status);
    }
  }
  onProgress(1, 'done');
}

/**
 * Maya's own copy of a model with a 16K context: the tool list alone is ~5.5K tokens, and Ollama's
 * default 4K context cut answers off mid-sentence. Shares the base model's files, so no extra download.
 * Re-created when an older Maya made it with a different context size.
 */
export async function ensureBrainModel(alias, base, numCtx = 16384) {
  const show = await fetch(`${OLLAMA}/api/show`, { method: 'POST', body: JSON.stringify({ model: alias }) });
  if (show.ok && new RegExp(`num_ctx\\s+${numCtx}\\b`).test((await show.json()).parameters || '')) return true;
  if (!(await hasModel(base))) return false;
  const res = await fetch(`${OLLAMA}/api/create`, {
    method: 'POST', body: JSON.stringify({ model: alias, from: base, parameters: { num_ctx: numCtx }, stream: false }),
  });
  return res.ok;
}

export async function embed(texts, model = 'nomic-embed-text') {
  const res = await fetch(`${OLLAMA}/api/embed`, { method: 'POST', body: JSON.stringify({ model, input: texts }) });
  if (!res.ok) throw new Error(`Embedding failed: ${res.status}`);
  return (await res.json()).embeddings;
}
