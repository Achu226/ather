import { useState } from 'react';
import { useData, tool } from './useData.js';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const errText = (e) => e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
const cap = (s) => s[0].toUpperCase() + s.slice(1);

/** Days left as words: "today", "tomorrow", "in 12 days". */
export const daysLeft = (n) => (n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`);

export default function Timetable({ version }) {
  const classes = useData(() => tool('timetable_query', { day: 'week' }), version) || [];
  const exams = useData(() => tool('exams_query'), version) || [];
  const [form, setForm] = useState({ day: 'monday', start: '09:00', end: '09:50', subject: '', room: '' });
  const [exam, setExam] = useState({ subject: '', date: '' });
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const todayName = DAYS[(new Date().getDay() + 6) % 7];

  async function importFile(kind) {
    const path = kind === 'image' ? await window.ather.pickImage() : await window.ather.pickDocument();
    if (!path) return;
    setBusy(true); setError(null);
    try { setPreview(await window.ather.importTimetable(path)); } catch (e) { setError(errText(e)); } finally { setBusy(false); }
  }
  async function add(list) {
    const r = await tool('timetable_add', { classes: list });
    if (r.error) setError(r.error); else { setPreview(null); setForm({ ...form, subject: '', room: '' }); }
  }

  return (
    <>
      <div className="panel">
        <div className="row"><h2>Exam countdown</h2></div>
        {!exams.length && <p className="empty">No exams added. Add one below or tell Maya “my DBMS exam is on 14 December”.</p>}
        <div className="exam-grid">
          {exams.map((e) => (
            <div className={`exam ${e.days_left <= 7 ? 'soon' : ''}`} key={e.id}>
              <div className="exam-days">{e.days_left}</div>
              <div className="exam-label">{e.days_left === 1 ? 'day' : 'days'} left</div>
              <b>{e.subject}</b>
              <small className="muted">{new Date(`${e.date}T00:00`).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}</small>
              <button className="btn small" onClick={() => tool('exams_delete', { id: e.id })} aria-label={`Remove ${e.subject}`}>✕</button>
            </div>
          ))}
        </div>
        <form className="row wrap" style={{ marginTop: 10 }} onSubmit={(ev) => { ev.preventDefault(); if (exam.subject && exam.date) tool('exams_add', exam).then(() => setExam({ subject: '', date: '' })); }}>
          <input className="input" style={{ flex: 2 }} placeholder="Exam, e.g. DBMS end-sem" value={exam.subject} onChange={(e) => setExam({ ...exam, subject: e.target.value })} aria-label="Exam name" />
          <input className="input" style={{ width: 170 }} type="date" value={exam.date} onChange={(e) => setExam({ ...exam, date: e.target.value })} aria-label="Exam date" />
          <button className="btn primary" disabled={!exam.subject || !exam.date}>Add exam</button>
        </form>
      </div>

      <div className="panel">
        <div className="row wrap"><h2>Weekly timetable</h2><span className="spacer" />
          <button className="btn small" disabled={busy} onClick={() => importFile('image')}>📷 From photo</button>
          <button className="btn small" disabled={busy} onClick={() => importFile('doc')}>📄 From PDF</button></div>
        <p className="muted">Classes show on Home and in your briefing, and Maya reminds you 10 minutes before each one.</p>
        {busy && <p className="muted">Reading your timetable…</p>}
        {error && <p className="bad">{error}</p>}
        {preview && (
          <div className="wf-detail" style={{ whiteSpace: 'normal' }}>
            <b>Found {preview.length} classes. Check them, then add:</b>
            <ul className="list">
              {preview.map((c, i) => (
                <li className="item" key={i}><span className="item-title">{cap(c.day)} {c.start}–{c.end} <b>{c.subject}</b> {c.room}</span>
                  <button className="btn small" onClick={() => setPreview(preview.filter((_, j) => j !== i))} aria-label="Leave out">✕</button></li>
              ))}
            </ul>
            <div className="row"><button className="btn primary" disabled={!preview.length} onClick={() => add(preview)}>Add {preview.length} classes</button>
              <button className="btn" onClick={() => setPreview(null)}>Discard</button></div>
          </div>
        )}
        <div className="timetable">
          {DAYS.filter((d) => d !== 'sunday' || classes.some((c) => c.day === 'sunday')).map((d) => (
            <div className={`tt-day ${d === todayName ? 'today' : ''}`} key={d}>
              <h3>{cap(d).slice(0, 3)}</h3>
              {classes.filter((c) => c.day === d).map((c) => (
                <div className="tt-class" key={c.id} title={c.room || ''}>
                  <small>{c.start}{c.end ? `–${c.end}` : ''}</small><b>{c.subject}</b>{c.room && <small>{c.room}</small>}
                  <button className="tt-x" onClick={() => tool('timetable_delete', { id: c.id })} aria-label={`Remove ${c.subject} on ${d}`}>✕</button>
                </div>
              ))}
            </div>
          ))}
        </div>
        <form className="row wrap" style={{ marginTop: 12 }} onSubmit={(e) => { e.preventDefault(); if (form.subject) add([form]); }}>
          <select className="input" style={{ width: 130 }} value={form.day} onChange={(e) => setForm({ ...form, day: e.target.value })} aria-label="Day">
            {DAYS.map((d) => <option key={d} value={d}>{cap(d)}</option>)}
          </select>
          <input className="input" style={{ width: 110 }} type="time" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} aria-label="Starts" />
          <input className="input" style={{ width: 110 }} type="time" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} aria-label="Ends" />
          <input className="input" style={{ flex: 2 }} placeholder="Subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} aria-label="Subject" />
          <input className="input" style={{ flex: 1 }} placeholder="Room" value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} aria-label="Room" />
          <button className="btn primary" disabled={!form.subject}>Add class</button>
        </form>
      </div>
    </>
  );
}
