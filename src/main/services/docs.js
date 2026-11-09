// "Chat with your PDFs": extract text, split into chunks, embed, and pull the relevant parts into each answer.
import { readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { embed } from '../ollama.js';
import { now } from '../store.js';

const CHUNK = 1200;
const OVERLAP = 200;
const WHOLE_DOC_LIMIT = 7000; // smaller documents go to the model whole

const toBlob = (v) => Buffer.from(new Float32Array(v).buffer);
const fromBlob = (b) => new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
const unit = (v) => { const n = Math.hypot(...v) || 1; return v.map((x) => x / n); };
const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

export async function extractText(path) {
  const ext = extname(path).toLowerCase();
  if (ext === '.pdf') {
    const { extractText: pdfText, getDocumentProxy } = await import('unpdf');
    const pdf = await getDocumentProxy(new Uint8Array(await readFile(path)));
    const { text } = await pdfText(pdf, { mergePages: true });
    return text;
  }
  if (ext === '.docx') {
    const mammoth = await import('mammoth');
    return (await mammoth.extractRawText({ path })).value;
  }
  return readFile(path, 'utf8');
}

export function chunk(text) {
  const clean = text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  const out = [];
  for (let i = 0; i < clean.length; i += CHUNK - OVERLAP) out.push(clean.slice(i, i + CHUNK));
  return out;
}

export function createDocs({ store }) {
  async function add(conversationId, path) {
    const text = (await extractText(path)).trim();
    if (!text) throw new Error('No readable text in that file (scanned PDFs are pictures; try a text PDF).');
    return addText(conversationId, basename(path), text, path);
  }

  async function addText(conversationId, name, text, path = null) {
    const { lastInsertRowid } = store.run('INSERT INTO documents (conversation_id, name, path, text, created_at) VALUES (?,?,?,?,?)',
      conversationId, name, path, text, now());
    const id = Number(lastInsertRowid);
    const pieces = chunk(text);
    for (let i = 0; i < pieces.length; i += 16) {
      const vecs = await embed(pieces.slice(i, i + 16).map((p) => `search_document: ${p}`));
      vecs.forEach((v, j) => store.run('INSERT INTO doc_chunks (document_id, text, embedding) VALUES (?,?,?)', id, pieces[i + j], toBlob(unit(v))));
    }
    return { id, name, chars: text.length, chunks: pieces.length };
  }

  const list = (conversationId) => store.all('SELECT id, name, length(text) AS chars FROM documents WHERE conversation_id = ?', conversationId);

  function remove(id) {
    store.run('DELETE FROM doc_chunks WHERE document_id = ?', id);
    store.run('DELETE FROM documents WHERE id = ?', id);
  }

  /** Text to put in the prompt for this question: whole small documents, otherwise the best-matching chunks. */
  async function context(conversationId, question, maxChunks = 6) {
    const docs = store.all('SELECT * FROM documents WHERE conversation_id = ?', conversationId);
    if (!docs.length) return '';
    const total = docs.reduce((n, d) => n + d.text.length, 0);
    if (total <= WHOLE_DOC_LIMIT) return docs.map((d) => `### ${d.name}\n${d.text}`).join('\n\n');

    const [q] = await embed([`search_query: ${question}`]);
    const qv = unit(q);
    const names = Object.fromEntries(docs.map((d) => [d.id, d.name]));
    const rows = store.all(`SELECT document_id, text, embedding FROM doc_chunks WHERE document_id IN (${docs.map(() => '?').join(',')})`, ...docs.map((d) => d.id));
    return rows.map((r) => ({ ...r, score: dot(qv, fromBlob(r.embedding)) }))
      .sort((a, b) => b.score - a.score).slice(0, maxChunks)
      .map((r) => `### ${names[r.document_id]} (excerpt)\n${r.text}`).join('\n\n');
  }

  return { add, addText, list, remove, context };
}
