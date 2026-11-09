import { useEffect, useState } from 'react';
import { useData, tool } from './useData.js';

const CATS = { productive: '🟢 Productive', neutral: '⚪ Neutral', distracting: '🔴 Distracting' };
const fmt = (m) => (m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`);

const Meter = ({ label, percent, detail }) => (
  <div className="meter">
    <div className="row"><b>{label}</b><span className="spacer" /><small className="muted">{detail}</small></div>
    <div className="meter-bar" role="meter" aria-label={label} aria-valuenow={percent ?? 0} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${percent ?? 0}%` }} className={percent >= 90 ? 'hot' : percent >= 70 ? 'warm' : ''} />
    </div>
  </div>
);

/** Live CPU, memory, GPU, disk and battery; the busiest apps refresh less often. */
function ThisPc() {
  const [s, setS] = useState(null);
  useEffect(() => {
    let n = 0, live = true;
    const load = () => window.ather.systemStatus(n++ % 5 === 0).then((x) => live && setS((old) => ({ ...x, busiest_apps: x.busiest_apps.length ? x.busiest_apps : old?.busiest_apps || [] }))).catch(() => {});
    load();
    const t = setInterval(load, 3000);
    return () => { live = false; clearInterval(t); };
  }, []);
  if (!s) return <div className="panel"><h2>This PC</h2><p className="muted">Checking…</p></div>;
  return (
    <div className="panel">
      <div className="row"><h2>This PC</h2><span className="spacer" /><small className="muted">{s.cpu.model} · on for {s.uptime_hours} h</small></div>
      <div className="meters">
        <Meter label="CPU" percent={s.cpu.load_percent} detail={`${s.cpu.load_percent}% · ${s.cpu.cores} threads`} />
        <Meter label="Memory" percent={s.memory.percent} detail={`${s.memory.used_gb} of ${s.memory.total_gb} GB`} />
        {s.gpu && <Meter label="GPU" percent={s.gpu.load_percent} detail={`${s.gpu.load_percent}% · ${s.gpu.memory_used_gb}/${s.gpu.memory_total_gb} GB · ${s.gpu.temperature_c}°C`} />}
        {s.disk && <Meter label="Disk C:" percent={s.disk.percent} detail={`${s.disk.free_gb} GB free of ${s.disk.total_gb} GB`} />}
        {s.battery && <Meter label={`Battery${s.battery.charging ? ' ⚡' : ''}`} percent={s.battery.percent} detail={`${s.battery.percent}%${s.battery.charging ? ' charging' : ''}`} />}
      </div>
      {!!s.busiest_apps?.length && <p className="muted" style={{ marginBottom: 0 }}>Using the most memory: {s.busiest_apps.map((a) => `${a.app} ${a.memory_mb >= 1024 ? `${(a.memory_mb / 1024).toFixed(1)} GB` : `${a.memory_mb} MB`}`).join(' · ')}</p>}
    </div>
  );
}

/** Everything Maya did while controlling the PC (computer control), newest first. */
function ActionLog({ version, tick }) {
  const log = useData(() => window.ather.computerLog(), version, [tick]);
  return (
    <div className="panel">
      <div className="row"><h2>Maya's actions on your PC</h2><span className="spacer" />
        <button className="btn small danger" onClick={() => window.ather.computerStop()}>Stop control now</button></div>
      {!log?.length && <p className="empty">Maya has not controlled your PC yet. It only does after you allow it, once per task.</p>}
      <ul className="list" style={{ maxHeight: 220, overflowY: 'auto' }}>
        {(log || []).slice(0, 60).map((l, i) => <li className="item" key={i}><span className="badge">{l.at.slice(11, 19)}</span><span className="item-title"><b>{l.action}</b> {l.detail}</span></li>)}
      </ul>
    </div>
  );
}

export default function Activity({ version }) {
  const [tick, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), 30_000); return () => clearInterval(t); }, []);
  const today = useData(() => tool('activity_query', {}), version, [tick]);
  const week = useData(() => tool('activity_query', { week: true }), version, [tick]);
  const [tracking, setTracking] = useState(true);
  const [focusAction, setFocusAction] = useState('minimize');
  const [cats, setCats] = useState({});

  useEffect(() => {
    window.ather.getSetting('activityTracking', true).then(setTracking);
    window.ather.getSetting('focusAction', 'minimize').then(setFocusAction);
    window.ather.getSetting('appCategories', {}).then(setCats);
  }, []);

  const setCategory = (label, c) => { const next = { ...cats, [label]: c }; setCats(next); window.ather.setSetting('appCategories', next).then(() => setTick((n) => n + 1)); };
  const maxWeek = Math.max(1, ...(week || []).map((d) => d.total));
  const share = (m) => (today?.total_minutes ? `${(m / today.total_minutes) * 100}%` : '0%');

  return (
    <>
      <h1 className="page-title">Activity</h1>
      <p className="page-sub">Where your computer time goes. Only app and site names are saved, on this computer. Ask “how long was I on YouTube today?”</p>

      <div className="grid">
        <div className="panel"><div className="stat">{fmt(today?.total_minutes ?? 0)}</div><div className="stat-label">on the computer today</div></div>
        <div className="panel"><div className="stat ok">{fmt(today?.productive_minutes ?? 0)}</div><div className="stat-label">productive</div></div>
        <div className="panel"><div className="stat bad">{fmt(today?.distracting_minutes ?? 0)}</div><div className="stat-label">distracting</div></div>
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <h2>Today</h2>
        <div className="split-bar" aria-label="Productive, neutral and distracting share">
          <div className="seg good" style={{ width: share(today?.productive_minutes ?? 0) }} />
          <div className="seg bad" style={{ width: share(today?.distracting_minutes ?? 0) }} />
        </div>
        {!today?.apps?.length && <p className="empty">Nothing recorded yet today. Keep Maya running and check back soon.</p>}
        <ul className="list">
          {(today?.apps || []).map((a) => (
            <li className="item" key={a.label}>
              <span className="item-title"><b>{a.label}</b>{a.label !== a.app && <small className="muted"> · {a.app}</small>}</span>
              <span className="badge">{fmt(a.minutes)}</span>
              <select className="input" style={{ width: 160 }} value={a.category} onChange={(e) => setCategory(a.label, e.target.value)} aria-label={`Category for ${a.label}`}>
                {Object.entries(CATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </li>
          ))}
        </ul>
      </div>

      <div className="panel">
        <h2>Last 7 days</h2>
        <div className="week-chart">
          {(week || []).map((d) => (
            <div key={d.day} className="week-col" title={`${d.day}: ${fmt(d.productive)} productive, ${fmt(d.distracting)} distracting`}>
              <div className="bars" style={{ height: 140 }}>
                <div className="seg bad" style={{ height: `${(d.distracting / maxWeek) * 100}%` }} />
                <div className="seg good" style={{ height: `${(d.productive / maxWeek) * 100}%` }} />
              </div>
              <small className="muted">{new Date(`${d.day}T12:00`).toLocaleDateString([], { weekday: 'short' })}</small>
            </div>
          ))}
        </div>
      </div>

      <ThisPc />
      <ActionLog version={version} tick={tick} />

      <div className="panel">
        <h2>Focus blocking</h2>
        <p className="muted">During a focus session, when you open something marked 🔴 Distracting, Maya nudges you and:</p>
        <select className="input" style={{ maxWidth: 380 }} value={focusAction} onChange={(e) => { setFocusAction(e.target.value); window.ather.setSetting('focusAction', e.target.value); }} aria-label="Focus blocking action">
          <option value="minimize">Minimises it (safe, nothing is lost)</option>
          <option value="close">Closes the app (browsers are only minimised)</option>
          <option value="nudge">Only reminds me</option>
        </select>
        <label className="row" style={{ marginTop: 12 }}>
          <input type="checkbox" className="check" checked={tracking} onChange={(e) => { setTracking(e.target.checked); window.ather.setSetting('activityTracking', e.target.checked); }} />
          Track which apps and sites I use
        </label>
      </div>
    </>
  );
}
