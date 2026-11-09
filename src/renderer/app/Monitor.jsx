import { useEffect, useState } from 'react';
import Face from '../shared/Face.jsx';
import { playSpeech } from '../shared/audio.js';

const ICON = { done: '✅', failed: '❌', denied: '✋' };
const SOURCE = { chat: 'You asked', agent: 'Agent', builder: 'Builder', workflow: 'Workflow' };

/** Everything Maya does, live: what it is doing now, and each action today in plain words. */
export default function Monitor() {
  const [w, setW] = useState(null);
  const [only, setOnly] = useState('all');
  useEffect(() => {
    const load = () => window.ather.workToday().then(setW).catch(() => {});
    load();
    const t = setInterval(load, 2000); // live while this page is open
    return () => clearInterval(t);
  }, []);
  const items = (w?.items || []).filter((i) => only === 'all' || (only === 'problems' ? i.status !== 'done' : i.source === only));
  const say = () => w && window.ather.speak(w.now ? `Right now I am: ${w.now}.` : `Today I did ${w.actions} things${w.failed ? `, ${w.failed} did not work` : ''}. The last one: ${w.items?.[0]?.detail || 'nothing yet'}.`).then((a) => a && playSpeech(a));

  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}>
        <Face size={64} mood={w?.now ? 'working' : 'happy'} />
        <div>
          <h1 className="page-title">Work monitor</h1>
          <p className="page-sub" style={{ margin: 0 }}>Everything Maya does for you, as it happens. Ask “what are you doing?” any time.</p>
        </div>
        <span className="spacer" />
        <button className="btn" onClick={say} aria-label="Read the work out loud">🔊 Tell me</button>
      </div>
      <div className="grid">
        <div className="panel"><div className="stat">{w?.now ? '⚙️' : '😌'}</div><div className="stat-label">{w?.now || 'Not busy right now'}</div></div>
        <div className="panel"><div className="stat">{w?.actions ?? '–'}</div><div className="stat-label">actions today</div></div>
        <div className="panel"><div className="stat">{w?.failed ?? '–'}</div><div className="stat-label">did not work</div></div>
      </div>
      <div className="panel" style={{ marginTop: 16 }}>
        <div className="row wrap" role="group" aria-label="Show">
          {[['all', 'Everything'], ['chat', 'Asked by you'], ['builder', 'Builder'], ['workflow', 'Workflows'], ['problems', 'Problems']].map(([k, label]) => (
            <button key={k} className={`btn small ${only === k ? 'primary' : ''}`} aria-pressed={only === k} onClick={() => setOnly(k)}>{label}</button>
          ))}
        </div>
        {!items.length && <p className="empty">Nothing yet today.</p>}
        <ul className="list" aria-live="polite">
          {items.map((i) => (
            <li className="item" key={i.id}>
              <span>{ICON[i.status] || '•'}</span>
              <span className="item-title">{i.detail}<br /><small className="muted">{SOURCE[i.source] || i.source} · {new Date(i.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}{i.ms > 1000 ? ` · ${Math.round(i.ms / 1000)} s` : ''}</small></span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
