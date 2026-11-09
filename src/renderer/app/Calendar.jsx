import { useState } from 'react';
import { useData, tool, today } from './useData.js';

export default function Calendar({ version, go }) {
  const to = new Date(Date.now() + 14 * 864e5).toLocaleDateString('en-CA');
  const events = useData(() => tool('calendar_query', { from: today(), to }), version);
  const [title, setTitle] = useState('');
  const [start, setStart] = useState('');

  async function add(e) {
    e.preventDefault();
    if (!title.trim() || !start) return;
    await tool('calendar_create', { title: title.trim(), start });
    setTitle(''); setStart('');
  }

  const byDay = {};
  for (const ev of events || []) (byDay[ev.start.slice(0, 10)] ??= []).push(ev);

  return (
    <>
      <h1 className="page-title">Calendar</h1>
      <p className="page-sub">
        Say “add a haircut on Tuesday at 11”. Google, Outlook and Apple calendars show here too once you add their link in{' '}
        <button className="link" onClick={() => go('settings')}>Settings</button>.
      </p>
      <form className="panel row wrap" onSubmit={add}>
        <input className="input" style={{ flex: 2, minWidth: 200 }} placeholder="Event" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Event title" />
        <input className="input" style={{ flex: 1, minWidth: 190 }} type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} aria-label="Start" />
        <button className="btn primary">Add</button>
      </form>
      <div className="panel">
        <h2>Next 14 days</h2>
        {events?.length === 0 && <p className="empty">Nothing planned.</p>}
        {Object.entries(byDay).map(([day, list]) => (
          <div key={day}>
            <div className="day-head">{new Date(`${day}T12:00`).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}</div>
            <ul className="list">
              {list.map((ev, i) => (
                <li className="item" key={i}>
                  <span className="badge">{ev.start.length > 10 ? new Date(ev.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'all day'}</span>
                  <span className="item-title">{ev.title}{ev.location && <small className="muted"> · {ev.location}</small>}</span>
                  <span className="badge">{ev.source}</span>
                  {ev.source === 'Maya' && <button className="btn small" onClick={() => tool('calendar_delete', { id: ev.id })} aria-label={`Delete ${ev.title}`}>✕</button>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </>
  );
}
