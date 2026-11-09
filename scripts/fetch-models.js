// Download every model ahead of time: node scripts/fetch-models.js
// (The app does the same on first run from its setup screen.)
import { ensureOllama, hasModel, pullModel, ensureBrainModel } from '../src/main/ollama.js';
import { BRAIN_MODEL, BASE_MODEL } from '../src/main/brain.js';
import { MODES } from '../src/main/models.js';
import { ollamaModels, fileModels, downloadFile } from '../src/main/ml/catalog.js';
import { warm } from '../src/main/ml/core.js';

const log = (label) => { let last = -1; return (p) => { const pct = Math.floor(p * 10) * 10; if (pct !== last) { last = pct; console.log(`${label}: ${pct}%`); } }; };

if (!(await ensureOllama())) throw new Error('Ollama is not installed or will not start');
for (const m of Object.values(ollamaModels).filter((x) => !x.lite)) if (!(await hasModel(m.name))) await pullModel(m.name, log(m.label));
await ensureBrainModel(BRAIN_MODEL, BASE_MODEL);
await ensureBrainModel(MODES.smart.model, MODES.smart.base);
for (const key of Object.keys(fileModels)) await downloadFile(key, log(fileModels[key].label));
for (const key of ['whisper', 'kokoro', 'clip', 'ocr']) {
  await warm(key, (e) => e.status === 'progress' && e.file?.endsWith('.onnx') && log(`${key} ${e.file}`)(e.progress / 100));
  console.log(`${key}: ready`);
}
console.log('All models ready');
process.exit(0);
