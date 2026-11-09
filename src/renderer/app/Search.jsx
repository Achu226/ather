import { useEffect, useState } from 'react';
import { fileUrl } from '../shared/audio.js';
import { useData } from './useData.js';

export default function Search({ version }) {
  const [folders, setFolders] = useState([]);
  const [progress, setProgress] = useState(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const stats = useData(() => window.ather.searchStats(), version, [progress?.done === progress?.total]);

  useEffect(() => {
    window.ather.getSetting('searchFolders', []).then(setFolders);
    return window.ather.onSearchProgress(setProgress);
  }, []);

  const saveFolders = (list) => { setFolders(list); window.ather.setSetting('searchFolders', list); };
  async function addFolder() {
    const f = await window.ather.pickFolder();
    if (f && !folders.includes(f)) saveFolders([...folders, f]);
  }
  async function index() {
    setProgress({ done: 0, total: 1 });
    await window.ather.indexFolders(folders);
  }
  async function find(e) {
    e.preventDefault();
    if (!query.trim()) return;
    setBusy(true);
    try { setResults(await window.ather.tool('files_search', { query })); } finally { setBusy(false); }
  }

  const indexing = progress && progress.done < progress.total;
  const count = (kind) => stats?.find((s) => s.kind === kind)?.n || 0;

  return (
    <>
      <h1 className="page-title">Smart search</h1>
      <p className="page-sub">Find photos, notes and files by just asking: “my photo at the beach”, “the PDF about operating systems”.</p>

      <form className="panel row" onSubmit={find}>
        <input className="input" placeholder="Describe what you're looking for…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search" />
        <button className="btn primary" disabled={busy}>{busy ? 'Searching…' : 'Search'}</button>
      </form>

      {results && (
        <div className="panel">
          {results.length === 0 && <p className="empty">Nothing found. Add folders below and index them first.</p>}
          <div className="grid">
            {results.map((r, i) => (
              <button key={i} className="panel" style={{ textAlign: 'left' }} onClick={() => (r.path ? window.ather.openPath(r.path) : null)}>
                {r.kind === 'image' && <img src={fileUrl(r.path)} alt="" style={{ width: '100%', height: 140, objectFit: 'cover', borderRadius: 10 }} />}
                <div><b>{r.kind === 'note' ? '📝 Note' : r.path.split(/[\\/]/).pop()}</b></div>
                <small className="muted">{r.kind === 'note' ? r.preview : r.path}</small>
                <div><span className="badge">match {Math.round(r.score * 100)}%</span></div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="panel">
        <h2>Folders Maya can search</h2>
        <p className="muted">Indexed: {count('image')} photos, {count('text')} text files, {count('file')} other files. Notes are always included.</p>
        <ul className="list">
          {folders.map((f) => (
            <li className="item" key={f}><span className="item-title">📁 {f}</span>
              <button className="btn small" onClick={() => saveFolders(folders.filter((x) => x !== f))} aria-label={`Remove ${f}`}>✕</button></li>
          ))}
        </ul>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn" onClick={addFolder}>Add folder…</button>
          <button className="btn primary" onClick={index} disabled={!folders.length || indexing}>{indexing ? 'Indexing…' : 'Index now'}</button>
          {indexing && <div className="progress" style={{ flex: 1 }}><div style={{ width: `${(progress.done / progress.total) * 100}%` }} /></div>}
          {indexing && <small className="muted">{progress.done}/{progress.total}</small>}
        </div>
      </div>
    </>
  );
}
