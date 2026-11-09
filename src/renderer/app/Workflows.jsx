import { useEffect, useState } from 'react';
import { useData, tool } from './useData.js';

const STATE = { waiting: '○', running: '◐', 'awaiting approval': '✋', completed: '✓', failed: '✗', cancelled: '⊘', paused: '⏸' };
const label = (name) => name.replace(/^(pc|fs|images|files)_/, '').replace(/_/g, ' ');
const argText = (args) => Object.values(args || {}).filter((v) => typeof v !== 'object').join(', ');

/** The steps as connected nodes; each node shows its real state. */
function Graph({ steps, onPick, picked }) {
  return (
    <div className="wf-graph">
      {steps.map((s, i) => (
        <div className="wf-cell" key={i}>
          {i > 0 && <span className={`wf-link ${s.status && s.status !== 'waiting' ? 'on' : ''}`} />}
          <button type="button" className={`wf-node s-${(s.status || 'waiting').replace(' ', '-')} ${picked === i ? 'picked' : ''}`} onClick={() => onPick?.(i)}>
            <span className="wf-state" aria-label={s.status || 'step'}>{s.status ? STATE[s.status] : i + 1}</span>
            <b>{label(s.tool)}</b>
            <small>{argText(s.args) || ' '}</small>
          </button>
        </div>
      ))}
    </div>
  );
}

function Run({ run }) {
  const [picked, setPicked] = useState(null);
  const id = run.id, act = (a) => window.ather.workflowControl(id, a);
  const active = ['running', 'paused', 'awaiting approval', 'waiting'].includes(run.status);
  const step = picked != null && run.steps[picked];
  return (
    <li className="wf-run">
      <div className="row">
        <span className={`badge s-${run.status.replace(' ', '-')}`}>{STATE[run.status]} {run.status}</span>
        <b>{run.routine}</b><small className="muted">{run.trigger === 'schedule' ? '⏰ scheduled' : ''} {new Date(run.started_at).toLocaleString()}</small>
        <span className="spacer" />
        {run.status === 'running' && <button className="btn small" onClick={() => act('pause')}>⏸ Pause</button>}
        {run.status === 'paused' && <button className="btn small primary" onClick={() => act('resume')}>▶ Resume</button>}
        {active && <button className="btn small danger" onClick={() => act('cancel')}>Cancel</button>}
        {['failed', 'cancelled'].includes(run.status) && <button className="btn small" onClick={() => act('retry')}>↻ Retry</button>}
      </div>
      <Graph steps={run.steps} onPick={(i) => setPicked(picked === i ? null : i)} picked={picked} />
      {step && (
        <pre className="wf-detail">{step.error ? `Error: ${step.error}` : JSON.stringify(step.result ?? 'Not run yet', null, 2).slice(0, 1500)}</pre>
      )}
    </li>
  );
}

function Builder({ draft, setDraft, tools }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const steps = draft?.steps || [];
  const setSteps = (s) => setDraft({ ...draft, steps: s });
  const move = (i, d) => { const s = [...steps]; [s[i], s[i + d]] = [s[i + d], s[i]]; setSteps(s); };

  async function make() {
    setBusy(true); setMsg(null);
    try { setDraft(await window.ather.workflowDraft(text)); } catch (e) { setMsg(`Could not plan it: ${e.message}`); }
    setBusy(false);
  }
  async function save() {
    const r = await tool('routines_save', { name: draft.name, steps: steps.map(({ tool: t, args }) => ({ tool: t, args })) });
    if (r.error) return setMsg(r.error);
    setMsg(`Saved “${draft.name}”.`); setDraft(null); setText('');
  }

  return (
    <div className="panel">
      <h2>New workflow</h2>
      <p className="muted">Describe what should happen, in your own words. Maya turns it into steps you can check and change before saving.</p>
      <div className="row">
        <input className="input" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && text && make()}
          placeholder="e.g. exam prep: add a task to revise DBMS, make a note with today's plan, start a 50 minute focus" aria-label="Describe a workflow" />
        <button className="btn primary" disabled={!text || busy} onClick={make}>{busy ? 'Planning…' : 'Make steps'}</button>
        <button className="btn" onClick={() => setDraft({ name: '', steps: [] })}>Blank</button>
      </div>
      {msg && <p className="muted">{msg}</p>}
      {draft && (
        <>
          <Graph steps={steps} />
          <input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Workflow name" aria-label="Workflow name" />
          <ol className="list wf-edit">
            {steps.map((s, i) => (
              <li className="item" key={i}>
                <select className="input" value={s.tool} onChange={(e) => setSteps(steps.map((x, j) => (j === i ? { ...x, tool: e.target.value } : x)))} aria-label={`Step ${i + 1} action`}>
                  {tools.map((t) => <option key={t.name} value={t.name} title={t.description}>{label(t.name)}</option>)}
                </select>
                <input className="input mono" defaultValue={JSON.stringify(s.args || {})} aria-label={`Step ${i + 1} details`}
                  onBlur={(e) => { try { setSteps(steps.map((x, j) => (j === i ? { ...x, args: JSON.parse(e.target.value || '{}') } : x))); } catch { setMsg(`Step ${i + 1}: details must be JSON, e.g. {"title": "Revise"}`); } }} />
                <button className="btn small" disabled={!i} onClick={() => move(i, -1)} aria-label="Move up">↑</button>
                <button className="btn small" disabled={i === steps.length - 1} onClick={() => move(i, 1)} aria-label="Move down">↓</button>
                <button className="btn small" onClick={() => setSteps(steps.filter((_, j) => j !== i))} aria-label="Remove step">✕</button>
              </li>
            ))}
          </ol>
          <div className="row">
            <button className="btn" onClick={() => setSteps([...steps, { tool: tools[0]?.name, args: {} }])}>+ Step</button>
            <span className="spacer" />
            <button className="btn" onClick={() => setDraft(null)}>Discard</button>
            <button className="btn primary" disabled={!draft.name || !steps.length} onClick={save}>Save workflow</button>
          </div>
        </>
      )}
    </div>
  );
}

export default function Workflows({ version }) {
  const saved = useData(() => tool('routines_list'), version);
  const tools = useData(() => window.ather.workflowTools(), 0) || [];
  const [runs, setRuns] = useState([]);
  const [draft, setDraft] = useState(null);
  const [times, setTimes] = useState({});

  useEffect(() => {
    window.ather.workflowRuns().then(setRuns);
    // Live updates: replace the changed run, or add a new one on top.
    return window.ather.onWorkflowRun((run) => setRuns((rs) => (rs.some((r) => r.id === run.id) ? rs.map((r) => (r.id === run.id ? run : r)) : [run, ...rs])));
  }, []);

  return (
    <>
      <h1 className="page-title">Workflows</h1>
      <p className="page-sub">Chains of actions Maya runs for you, step by step. Watch each step live, pause, cancel or retry, and look back at every run.</p>
      <Builder draft={draft} setDraft={setDraft} tools={tools} />
      <div className="panel">
        <h2>Saved workflows</h2>
        <p className="muted">You can also ask in chat: “make a workflow called study mode that…”, then “start study mode”.</p>
        {!saved?.length && <p className="empty">No workflows yet.</p>}
        <ul className="list">
          {(saved || []).map((r) => (
            <li className="wf-saved" key={r.id}>
              <div className="row">
                <b>{r.name}</b>{r.schedule && <span className="badge">⏰ daily {r.schedule}</span>}
                <span className="spacer" />
                <input className="input" type="time" style={{ width: 120 }} value={times[r.name] ?? r.schedule ?? ''} onChange={(e) => setTimes({ ...times, [r.name]: e.target.value })} aria-label={`Daily time for ${r.name}`} />
                <button className="btn small" disabled={(times[r.name] ?? r.schedule ?? '') === (r.schedule ?? '')} onClick={() => tool('routines_schedule', { name: r.name, time: times[r.name] })}>Set schedule</button>
                <button className="btn small" onClick={() => setDraft({ name: r.name, steps: r.steps })}>Edit</button>
                <button className="btn small primary" onClick={() => window.ather.workflowStart(r.name)}>▶ Run</button>
                <button className="btn small" onClick={() => tool('routines_delete', { name: r.name })} aria-label={`Delete ${r.name}`}>✕</button>
              </div>
              <Graph steps={r.steps} />
            </li>
          ))}
        </ul>
      </div>
      <div className="panel">
        <h2>Runs</h2>
        {!runs.length && <p className="empty">Nothing has run yet.</p>}
        <ul className="list">{runs.slice(0, 20).map((r) => <Run key={r.id} run={r} />)}</ul>
      </div>
    </>
  );
}
