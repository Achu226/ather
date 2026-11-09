import { useState } from 'react';
import { useData, tool } from './useData.js';

const dayLetters = () => [...Array(7)].map((_, i) => new Date(Date.now() - (6 - i) * 864e5).toLocaleDateString([], { weekday: 'narrow' }));

export default function Habits({ version }) {
  const habits = useData(() => tool('habits_progress'), version);
  const [name, setName] = useState('');
  const [perWeek, setPerWeek] = useState(7);

  async function add(e) {
    e.preventDefault();
    if (!name.trim()) return;
    await tool('habits_create', { name: name.trim(), per_week: Number(perWeek) });
    setName('');
  }

  const letters = dayLetters();
  return (
    <>
      <h1 className="page-title">Habits</h1>
      <p className="page-sub">Say “I drank water” or “start a habit: gym 3 times a week”.</p>
      <form className="panel row wrap" onSubmit={add}>
        <input className="input" style={{ flex: 3, minWidth: 200 }} placeholder="New habit, e.g. Read 20 pages" value={name} onChange={(e) => setName(e.target.value)} aria-label="Habit name" />
        <label className="row muted">Days per week
          <input className="input" type="number" min="1" max="7" style={{ width: 70 }} value={perWeek} onChange={(e) => setPerWeek(e.target.value)} />
        </label>
        <button className="btn primary">Add habit</button>
      </form>

      <div className="panel">
        {habits?.length === 0 && <p className="empty">No habits yet.</p>}
        <ul className="list">
          {(habits || []).map((h) => (
            <li className="item" key={h.id}>
              <span className="item-title"><b>{h.name}</b><br /><small className="muted">{h.this_week}/{h.per_week} this week · 🔥 {h.streak} day streak</small></span>
              <div className="week" aria-label="Last 7 days">
                {h.last7.map((on, i) => <span key={i} className={on ? 'on' : ''}>{letters[i]}</span>)}
              </div>
              <button className={`btn small ${h.done_today ? '' : 'primary'}`} disabled={h.done_today} onClick={() => tool('habits_checkin', { id: h.id })}>
                {h.done_today ? 'Done today ✓' : 'Check in'}
              </button>
              <button className="btn small" onClick={() => tool('habits_delete', { id: h.id })} aria-label={`Remove ${h.name}`}>✕</button>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
