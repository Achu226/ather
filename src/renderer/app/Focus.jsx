import { useEffect, useState } from 'react';
import { useData, tool } from './useData.js';

export default function Focus({ version }) {
  const status = useData(() => tool('focus_status'), version);
  const stats = useData(() => tool('history_query'), version);
  const [label, setLabel] = useState('');
  const [left, setLeft] = useState(0);

  useEffect(() => {
    if (!status?.running) { setLeft(0); return; }
    const end = Date.now() + status.seconds_left * 1000;
    const t = setInterval(() => setLeft(Math.max(0, Math.round((end - Date.now()) / 1000))), 500);
    setLeft(status.seconds_left);
    return () => clearInterval(t);
  }, [status]);

  const mm = String(Math.floor(left / 60)).padStart(2, '0');
  const ss = String(left % 60).padStart(2, '0');

  return (
    <>
      <h1 className="page-title">Focus</h1>
      <p className="page-sub">Say “help me focus for 25 minutes on maths”. Maya pings you when time is up.</p>
      <div className="panel" style={{ textAlign: 'center' }}>
        {status?.running ? (
          <>
            <div className="muted">Focusing on <b>{status.label}</b></div>
            <div className="timer" role="timer" aria-live="off">{mm}:{ss}</div>
            <button className="btn" onClick={() => tool('focus_stop')}>Stop early</button>
          </>
        ) : (
          <>
            <div className="timer">--:--</div>
            <div className="row" style={{ justifyContent: 'center', marginBottom: 12 }}>
              <input className="input" style={{ maxWidth: 320 }} placeholder="What are you working on?" value={label} onChange={(e) => setLabel(e.target.value)} aria-label="Focus label" />
            </div>
            <div className="row" style={{ justifyContent: 'center' }}>
              {[15, 25, 50].map((m) => <button key={m} className="btn primary" onClick={() => tool('focus_start', { minutes: m, label: label || 'Focus' })}>{m} min</button>)}
            </div>
          </>
        )}
      </div>
      <div className="grid" style={{ marginTop: 16 }}>
        <div className="panel"><div className="stat">{stats?.focus_minutes_this_week ?? 0}</div><div className="stat-label">focus minutes in the last 7 days</div></div>
        <div className="panel"><div className="stat">{stats?.focus_sessions_this_week ?? 0}</div><div className="stat-label">sessions finished</div></div>
      </div>
    </>
  );
}
