import { useEffect, useState } from 'react';
import { useData, tool, fmtDate } from './useData.js';

export default function Notes({ version }) {
  const [search, setSearch] = useState('');
  const notes = useData(() => tool('notes_query', { search }), version, [search]);
  const [selected, setSelected] = useState(null);
  const [draft, setDraft] = useState({ title: '', body: '' });
  const [saved, setSaved] = useState(true);

  const current = notes?.find((n) => n.id === selected);
  useEffect(() => { if (current && saved) setDraft({ title: current.title, body: current.body }); }, [current?.id, current?.updated_at]);

  async function create() {
    const n = await tool('notes_create', { title: 'New note', body: '' });
    setSelected(n.id);
    setDraft({ title: n.title, body: '' });
  }
  async function save() {
    await tool('notes_update', { id: selected, title: draft.title || 'Untitled', body: draft.body });
    setSaved(true);
  }
  const edit = (patch) => { setDraft((d) => ({ ...d, ...patch })); setSaved(false); };

  return (
    <>
      <h1 className="page-title">Notes</h1>
      <p className="page-sub">Say “note that the lab exam is in room 204” and Maya saves it here.</p>
      <div className="split">
        <div className="panel">
          <div className="row" style={{ marginBottom: 8 }}>
            <input className="input" placeholder="Search notes…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search notes" />
            <button className="btn primary" onClick={create}>New</button>
          </div>
          {notes?.length === 0 && <p className="empty">No notes yet.</p>}
          {(notes || []).map((n) => (
            <button key={n.id} className={`note-pick ${n.id === selected ? 'active' : ''}`} onClick={() => { setSelected(n.id); setSaved(true); setDraft({ title: n.title, body: n.body }); }}>
              <b>{n.title}</b><small>{fmtDate(n.updated_at)} · {n.body.slice(0, 60)}</small>
            </button>
          ))}
        </div>
        <div className="panel">
          {!current ? <p className="empty">Pick a note or make a new one.</p> : (
            <>
              <div className="field"><label htmlFor="nt">Title</label><input id="nt" className="input" value={draft.title} onChange={(e) => edit({ title: e.target.value })} /></div>
              <div className="field"><label htmlFor="nb">Note</label><textarea id="nb" className="input" style={{ minHeight: 320 }} value={draft.body} onChange={(e) => edit({ body: e.target.value })} /></div>
              <div className="row">
                <button className="btn primary" onClick={save} disabled={saved}>{saved ? 'Saved' : 'Save'}</button>
                <span className="spacer" />
                <button className="btn danger" onClick={async () => { await tool('notes_delete', { id: current.id }); setSelected(null); }}>Delete</button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
