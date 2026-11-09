// Smart search: "find my photo of the beach", "the note about DBMS", "my resume file".
// Text files and notes use nomic-embed-text (Ollama); photos use CLIP (ML worker).
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import { embed } from '../ollama.js';

const TEXT = new Set(['.txt', '.md', '.csv', '.json', '.html', '.js', '.py', '.java', '.c', '.cpp', '.ts', '.log', '.xml', '.yml', '.sql']);
const IMAGE = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp']);
const OTHER = new Set(['.pdf', '.docx', '.pptx', '.xlsx', '.doc', '.ppt', '.xls', '.zip', '.mp4', '.mp3']);
const MAX_FILES = 5000;

const toBlob = (v) => Buffer.from(new Float32Array(v).buffer);
const fromBlob = (b) => new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
const cosine = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
const unit = (v) => { const n = Math.hypot(...v) || 1; return v.map((x) => x / n); };

function* walk(dir, depth = 0) {
  if (depth > 6) return;
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'AppData') continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) yield* walk(full, depth + 1);
    else yield full;
  }
}

export function createSearch({ store, ml }) {
  /** Index (or refresh) the chosen folders. onProgress(done, total). */
  async function index(folders, onProgress = () => {}) {
    const files = [];
    for (const f of folders) for (const file of walk(f)) {
      const ext = extname(file).toLowerCase();
      if (TEXT.has(ext) || IMAGE.has(ext) || OTHER.has(ext)) files.push(file);
      if (files.length >= MAX_FILES) break;
    }
    let done = 0;
    for (const file of files) {
      onProgress(done++, files.length);
      let mtime;
      try { mtime = statSync(file).mtimeMs; } catch { continue; }
      const old = store.get('SELECT mtime FROM search_index WHERE path = ?', file);
      if (old && old.mtime === mtime) continue;
      const ext = extname(file).toLowerCase();
      try {
        let kind, text, vector;
        if (IMAGE.has(ext)) {
          kind = 'image'; text = basename(file); vector = await ml.call('clipImage', file);
        } else {
          kind = TEXT.has(ext) ? 'text' : 'file';
          const content = TEXT.has(ext) ? readFileSync(file, 'utf8').slice(0, 2000) : '';
          text = `${basename(file)}\n${content}`;
          [vector] = await embed([`search_document: ${text}`]);
        }
        store.run('INSERT OR REPLACE INTO search_index (path, kind, mtime, text, embedding) VALUES (?,?,?,?,?)',
          file, kind, mtime, text.slice(0, 500), toBlob(unit(vector)));
      } catch { /* unreadable file: skip it, keep indexing the rest */ }
    }
    onProgress(files.length, files.length);
    return { indexed: files.length };
  }

  /** Best matches across files, photos and notes. */
  async function query(q, limit = 8) {
    const [textVec] = await embed([`search_query: ${q}`]);
    const tq = unit(textVec);
    let iq = null;
    try { iq = await ml.call('clipText', q); } catch { /* photo model not ready: text results only */ }

    const results = store.all('SELECT path, kind, text, embedding FROM search_index').map((r) => {
      const v = fromBlob(r.embedding);
      // CLIP text-image similarity is on a smaller scale than text-text, so lift it to compare fairly.
      const score = r.kind === 'image' ? (iq ? cosine(iq, v) * 2.5 : 0) : cosine(tq, v);
      return { path: r.path, kind: r.kind, preview: r.text.slice(0, 160), score };
    });

    const notes = store.all('SELECT id, title, body FROM notes WHERE deleted = 0');
    if (notes.length) {
      const vecs = await embed(notes.map((n) => `search_document: ${n.title}\n${n.body}`.slice(0, 2000)));
      notes.forEach((n, i) => results.push({ note_id: n.id, kind: 'note', preview: `${n.title}: ${n.body}`.slice(0, 160), score: cosine(tq, unit(vecs[i])) }));
    }
    return results.sort((a, b) => b.score - a.score).slice(0, limit).map((r) => ({ ...r, score: Math.round(r.score * 100) / 100 }));
  }

  const stats = () => store.all('SELECT kind, COUNT(*) AS n FROM search_index GROUP BY kind');
  return { index, query, stats };
}
