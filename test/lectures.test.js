// Lecture pipeline with real models: Kokoro "teacher" audio → Whisper transcript pieces → notes → flashcards.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const realModels = join(process.env.APPDATA || '', 'Ather', 'models');
process.env.ATHER_DATA = mkdtempSync(join(tmpdir(), 'ather-lec-'));
process.env.ATHER_MODELS = realModels;
const { openStore } = await import('../src/main/store.js');
const { createLectures } = await import('../src/main/services/lectures.js');
const { createStudy } = await import('../src/main/services/study.js');
const { OLLAMA } = await import('../src/main/ollama.js');
const ready = existsSync(join(realModels, 'hf', 'onnx-community', 'whisper-small')) && await fetch(`${OLLAMA}/api/version`).then((r) => r.ok, () => false);

const to16k = (s, rate) => { const o = new Float32Array(Math.floor((s.length * 16000) / rate)); for (let i = 0; i < o.length; i++) o[i] = s[Math.floor((i * rate) / 16000)]; return o; };

test('lecture audio becomes a transcript, notes and flashcards', { skip: !ready && 'needs models', timeout: 900_000 }, async () => {
  const core = await import('../src/main/ml/core.js');
  const store = openStore(':memory:');
  const lectures = createLectures({ store });
  const id = lectures.start('OS: Deadlocks', 'mic');
  const pieces = [
    'Today we study deadlocks. A deadlock happens when processes wait for each other forever.',
    'There are four Coffman conditions: mutual exclusion, hold and wait, no preemption, and circular wait.',
    'The banker\'s algorithm avoids deadlock by checking if a resource request keeps the system in a safe state.',
  ];
  for (const p of pieces) {
    const { samples, sampleRate } = await core.speak(p, 'am_michael');
    lectures.append(id, await core.transcribe(to16k(samples, sampleRate), 'english'));
  }
  assert.match(lectures.get(id).transcript, /deadlock/i);

  const done = await lectures.finish(id, 1);
  assert.match(done.notes, /##/);
  assert.match(done.notes, /circular wait|coffman|banker/i);
  assert.ok(store.get("SELECT id FROM notes WHERE title LIKE 'Lecture notes:%'"));

  const set = await createStudy({ store, docs: {} }).create({ kind: 'flashcards', topic: done.title, text: done.transcript, count: 4 });
  assert.ok(JSON.parse(set.items).length >= 3);
});
