// Brain server: this PC shares its Ollama with the user's other devices (over Tailscale), or Maya thinks on another PC's.
import { execFile } from 'node:child_process';
import { networkInterfaces } from 'node:os';
import { ollamaUrl } from '../ollama.js';

const run = (exe, args) => new Promise((resolve) => execFile(exe, args, { windowsHide: true, timeout: 20_000 }, (e, out) => resolve(e ? '' : String(out))));
// Tailscale gives every device an address in 100.64.0.0/10.
const isTailscale = (ip) => /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip);

/** This PC's addresses another device can reach, Tailscale first (exported for tests). */
export function brainAddresses(ifaces = networkInterfaces()) {
  return Object.values(ifaces).flat()
    .filter((a) => a && (a.family === 'IPv4' || a.family === 4) && !a.internal && !a.address.startsWith('169.254.'))
    .map((a) => ({ address: `${a.address}:11434`, kind: isTailscale(a.address) ? 'tailscale' : 'home' }))
    .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'tailscale' ? -1 : 1));
}

/** Is there an Ollama at this address? { ok, url, version, models } or { ok: false, error }. */
export async function probeOllama(host, fetchFn = fetch) {
  const url = ollamaUrl(String(host || ''));
  if (!/^https?:\/\/[\w.:[\]-]+$/i.test(url)) return { ok: false, url, error: 'That does not look like an address. Example: 100.101.102.103:11434' };
  try {
    const signal = AbortSignal.timeout(5000);
    const v = await fetchFn(`${url}/api/version`, { signal });
    if (!v.ok) return { ok: false, url, error: `It answered, but not like Ollama (${v.status}).` };
    const { version } = await v.json();
    const tags = await fetchFn(`${url}/api/tags`, { signal }).then((r) => r.json()).catch(() => ({}));
    return { ok: true, url, version, models: (tags.models || []).map((m) => m.name) };
  } catch (e) {
    return { ok: false, url, error: e.name === 'TimeoutError' ? 'No answer. Is that PC on, with Ollama running and Tailscale connected?' : `Could not reach it: ${e.message}` };
  }
}

/**
 * Sharing = Ollama listens on every network card (OLLAMA_HOST=0.0.0.0:11434, a per-user setting, no admin).
 * Ollama has no password, so the page tells the user to share only over Tailscale, never through the router.
 * restart() restarts Ollama so the change takes effect now.
 */
export function createBrainShare({ restart }) {
  const readEnv = async () => (await run('reg.exe', ['query', 'HKCU\\Environment', '/v', 'OLLAMA_HOST'])).match(/OLLAMA_HOST\s+REG_\w+\s+(.*)/)?.[1]?.trim() || '';
  const sharing = (v) => /^(0\.0\.0\.0|\[::\])(:|$)/.test(v);
  return {
    async status() { return { sharing: sharing(await readEnv()), addresses: brainAddresses() }; },
    async set(on) {
      const now = await readEnv();
      if (on) {
        await run('setx.exe', ['OLLAMA_HOST', '0.0.0.0:11434']);
        process.env.OLLAMA_HOST = '0.0.0.0:11434'; // Ollama started by Maya gets it too
      } else if (sharing(now)) { // only undo what "share" set, never a value the user chose
        await run('reg.exe', ['delete', 'HKCU\\Environment', '/v', 'OLLAMA_HOST', '/f']);
        delete process.env.OLLAMA_HOST;
      }
      await restart();
      return this.status();
    },
  };
}
