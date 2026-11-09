// Main-process side of the ML utility process. Restarts it if it crashes.
import { utilityProcess } from 'electron';
import { fileURLToPath } from 'node:url';

const workerPath = fileURLToPath(new URL('./worker.js', import.meta.url));

export function createMl() {
  let child = null;
  let seq = 0;
  const pending = new Map();

  function start() {
    child = utilityProcess.fork(workerPath, [], { serviceName: 'Maya AI models', stdio: 'inherit' });
    child.on('message', ({ id, result, error, progress }) => {
      const p = pending.get(id);
      if (!p) return;
      if (progress !== undefined) { p.onProgress?.(progress); return; }
      pending.delete(id);
      error ? p.reject(new Error(error)) : p.resolve(result);
    });
    child.on('exit', () => {
      child = null;
      for (const p of pending.values()) p.reject(new Error('The AI model process stopped. Please try again.'));
      pending.clear();
    });
  }

  const send = (op, args, onProgress) => new Promise((resolve, reject) => {
    if (!child) start();
    const id = ++seq;
    pending.set(id, { resolve, reject, onProgress });
    child.postMessage({ id, op, args });
  });

  return {
    call: (op, ...args) => send(op, args),
    warm: (key, onProgress) => send('warm', [key], onProgress),
    stop: () => child?.kill(),
  };
}
