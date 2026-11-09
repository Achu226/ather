// ML utility process: runs core.js functions on request from the main process.
import * as core from './core.js';

const port = process.parentPort;
port.on('message', async ({ data: { id, op, args = [] } }) => {
  try {
    if (op === 'warm') {
      await core.warm(args[0], (p) => port.postMessage({ id, progress: p }));
      port.postMessage({ id, result: true });
      return;
    }
    if (!['transcribe', 'transcribeQuick', 'speak', 'speakTamil', 'clipImage', 'clipText', 'ocr', 'faces', 'removeBackground', 'upscale'].includes(op)) throw new Error(`Unknown ML op ${op}`);
    port.postMessage({ id, result: await core[op](...args) });
  } catch (err) {
    port.postMessage({ id, error: err.message });
  }
});
