import { useState } from 'react';
import { useData, tool, fmtDate, today } from './useData.js';

export default function Tasks({ version }) {
  const [status, setStatus] = useState('open');
  const tasks = useData(() => tool('tasks_query', { status }), version, [status]);
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [priority, setPriority] = useState('normal');

  async function add(e) {
    e.preventDefault();
    if (!title.trim()) return;
    await tool('tasks_create', { title: title.trim(), due: due || undefined, priority });
    setTitle(''); setDue(''); setPriority('normal');
  }

  return (
    <>
      <h1 className="page-title">Tasks</h1>
      <p className="page-sub">Or just tell Maya: “add a task to submit the DBMS assignment Friday 5pm”.</p>

      <form className="panel row wrap" onSubmit={add}>
        <input className="input" style={{ flex: 3, minWidth: 200 }} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New task…" aria-label="Task title" />
        <input className="input" style={{ flex: 1, minWidth: 180 }} type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due" />
        <select className="input" style={{ width: 120 }} value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Priority">
          <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option>
        </select>
        <button className="btn primary">Add</button>
      </form>

      <div className="panel">
        <div className="row" style={{ marginBottom: 6 }}>
          {['open', 'done', 'all'].map((s) => <button key={s} className={`btn small ${status === s ? 'primary' : ''}`} onClick={() => setStatus(s)}>{s[0].toUpperCase() + s.slice(1)}</button>)}
          <span className="spacer" />
          <button className="btn small" onClick={() => tool('app_undo')}>↶ Undo</button>
        </div>
        {tasks?.length === 0 && <p className="empty">No tasks here.</p>}
        <ul className="list">
          {(tasks || []).map((t) => (
            <li key={t.id} className={`item ${t.done ? 'done' : ''}`}>
              <input type="checkbox" className="check" checked={!!t.done} onChange={() => tool('tasks_complete', { id: t.id, done: !t.done })} aria-label={`Done: ${t.title}`} />
              <span className="item-title">{t.title}{t.notes && <small className="muted"> — {t.notes}</small>}</span>
              {t.priority === 'high' && <span className="badge high">high</span>}
              {t.due && <span className={`badge ${!t.done && t.due.slice(0, 10) < today() ? 'late' : ''}`}>{fmtDate(t.due)}</span>}
              <button className="btn small" onClick={() => tool('tasks_delete', { id: t.id })} aria-label={`Delete ${t.title}`}>✕</button>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
