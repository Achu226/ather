import { useState } from 'react';
import Face from '../shared/Face.jsx';
import { playSpeech } from '../shared/audio.js';
import { useData, tool, fmtDate } from './useData.js';
import { daysLeft } from './Timetable.jsx';
import { useAsk } from '../shared/useAsk.js';
import { useSetting } from './Settings.jsx';

const QUICK = ['What is on today?', 'Read my new emails', 'Read my new WhatsApp messages', 'Play my music', 'What did you do today?', 'Call Amma'];

/** Big one-press buttons (head mouse, dwell, one switch): Maya does it and says the answer. Editable. */
function QuickActions() {
  const [list, setList] = useSetting('quickActions', QUICK);
  const [editing, setEditing] = useState(false);
  const { turn, send } = useAsk();
  const go = async (q) => { const answer = await send(q, [], { style: 'short' }); if (answer) { const a = await window.ather.speak(answer); if (a) playSpeech(a); } };
  return (
    <div className="panel quick" style={{ marginBottom: 16 }}>
      <div className="row"><h2>⚡ Quick actions</h2><span className="spacer" /><button className="btn small" onClick={() => setEditing(!editing)}>{editing ? 'Done' : 'Edit'}</button></div>
      {editing
        ? <textarea className="input" rows={6} value={(list || QUICK).join('\n')} onChange={(e) => setList(e.target.value.split('\n').filter((l) => l.trim()).slice(0, 12))} aria-label="One quick action per line" />
        : <div className="quick-grid">
            {(list || QUICK).map((q) => <button key={q} className="btn quick-btn" onClick={() => go(q)} disabled={turn?.thinking}><span className="quick-icon" aria-hidden="true">{iconFor(q)}</span>{q}</button>)}
            <button className="btn danger quick-btn sos" onClick={() => window.ather.sosTrigger('pressed Help on Home')}><span className="quick-icon" aria-hidden="true">🆘</span>Help</button>
          </div>}
      {turn && <p className="muted" role="status" aria-live="polite" style={{ marginTop: 8 }}>{turn.thinking && !turn.text ? 'Working on it…' : (turn.text || turn.error || '').slice(0, 400)}</p>}
    </div>
  );
}

function Briefing({ version }) {
  const saved = useData(() => window.ather.getSetting('lastBriefing', null), version);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  async function now() {
    setBusy(true); setError(null);
    try { await tool('briefing_now', {}); } catch (e) { setError(e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')); } finally { setBusy(false); }
  }
  const listen = async () => { const a = await window.ather.speak(saved.text); if (a) playSpeech(a); };
  return (
    <div className="panel briefing">
      <div className="row"><h2>{saved?.kind === 'evening' ? '🌙 Your day' : '☀️ Today’s briefing'}</h2><span className="spacer" />
        {saved && <button className="btn small" onClick={listen} title="Read it to me">🔊</button>}
        <button className="btn small" onClick={now} disabled={busy}>{busy ? 'Preparing…' : 'Brief me now'}</button></div>
      {saved ? <p style={{ margin: 0 }}>{saved.text}</p> : <p className="muted" style={{ margin: 0 }}>Every morning Maya sums up your weather, classes, tasks and emails. Set your city in Settings.</p>}
      {saved && <small className="muted">{fmtDate(saved.at)}</small>}
      {error && <p className="bad">{error}</p>}
    </div>
  );
}

function Work({ version, go }) {
  const mail = useData(() => window.ather.getSetting('mail', null), version);
  const triage = useData(() => window.ather.getSetting('mailTriage', null), version);
  const follow = useData(() => window.ather.getSetting('followups', []), version);
  const last = useData(() => window.ather.getSetting('weeklyReportLast', null), version);
  const auto = useData(() => window.ather.getSetting('weeklyReport', true), version);
  const day = useData(() => tool('activity_query', {}), version);
  const hm = (m) => (m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} m` : `${m} m`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  async function report() {
    setBusy(true); setError(null);
    try { const { path } = await tool('report_weekly', {}); window.ather.openPath(path); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  const waiting = (follow || []).filter((f) => !f.done);
  return (
    <div className="panel" style={{ marginTop: 16 }}>
      <div className="row"><h2>💼 Work</h2><span className="spacer" />
        <button className="btn small" onClick={() => go('inbox')}>Inbox</button>
        <button className="btn small" onClick={report} disabled={busy}>{busy ? 'Making…' : 'Weekly report'}</button></div>
      {!!day?.total_minutes && <p style={{ margin: '4px 0 8px' }}>🖥 Today: <b>{hm(day.productive_minutes)}</b> working{day.distracting_minutes ? `, ${hm(day.distracting_minutes)} distracted` : ''}{day.apps?.[0] ? ` · most in ${day.apps[0].label}` : ''}</p>}
      {!mail && <p className="muted">Connect your email on the Inbox page, then say “any emails I need to reply to?” or “remind me if Rahul doesn’t reply by Friday”.</p>}
      <ul className="list">
        {(triage?.needs_you || []).slice(0, 5).map((m) => <li className="item" key={`m${m.uid}`}><span className="item-title">✉️ <b>{m.from.split('<')[0].replace(/"/g, '')}</b> — {m.subject}</span>{m.why && <span className="badge late">{m.why}</span>}</li>)}
        {waiting.map((f) => <li className="item" key={`f${f.id}`}><span className="item-title">⏳ Waiting on <b>{f.from}</b>{f.subject ? ` — ${f.subject}` : ''}</span><span className="badge">by {fmtDate(f.by)}</span></li>)}
      </ul>
      {mail && !triage?.needs_you?.length && !waiting.length && <p className="empty">No emails waiting on you and no follow-ups.</p>}
      <label className="row muted" style={{ gap: 8 }}><input type="checkbox" key={String(auto)} defaultChecked={auto !== false} onChange={(e) => window.ather.setSetting('weeklyReport', e.target.checked)} />
        Make my weekly report every Friday at 5 pm{last ? ` · last: ${fmtDate(last.at)}` : ''}</label>
      {error && <p className="bad">{error}</p>}
    </div>
  );
}

/** The first thing on Home: Maya's face in a halo that breathes while it listens for its name, and what is running. */
function Hero({ greeting }) {
  const [wake] = useSetting('wakeWord', true);
  const [lite] = useSetting('liteBrain', false);
  const [title] = useSetting('userTitle', 'boss');
  const [agent] = useSetting('agent', {});
  const name = agent?.name || 'Maya';
  return (
    <section className="hero" aria-label={`${name} status`}>
      <div className={`hero-face${wake ? ' listening' : ''}`}><Face size={96} mood="happy" /></div>
      <div className="hero-text">
        <h1 className="hero-title">{greeting}{title ? `, ${title}` : ''}</h1>
        <p className="hero-sub">{wake ? `Say “Hey ${name}” and tell me the work. No button needed.` : 'Move to the top of the screen or press Ctrl+Space to talk to me.'}</p>
        <ul className="hero-chips">
          <li>{wake ? `👂 Listening for “Hey ${name}”` : '🔇 Wake word is off'}</li>
          <li>🧠 {lite ? 'Lite brain · Qwen 3.5 2B' : 'Brain · Qwen 3.5 4B'}</li>
          <li>🔒 Runs only on this laptop</li>
        </ul>
      </div>
    </section>
  );
}

// A picture for each quick action, so it can be found at a glance.
const ICONS = [[/did you do|work/i, '🧾'], [/today|day|calendar/i, '📅'], [/email|mail/i, '✉️'], [/whatsapp|message/i, '💬'], [/music|song|play/i, '🎵'], [/call|phone/i, '📞'], [/weather/i, '⛅'], [/remind/i, '⏰']];
const iconFor = (q) => ICONS.find(([re]) => re.test(q))?.[1] || '✨';

export default function Home({ version, go }) {
  const p = useData(() => tool('history_query'), version);
  const todayTasks = useData(() => tool('tasks_query', { status: 'open', when: 'today' }), version);
  const overdue = useData(() => tool('tasks_query', { when: 'overdue' }), version);
  const events = useData(() => tool('calendar_query', {}), version);
  const reminders = useData(() => tool('reminders_query', {}), version);
  const exams = useData(() => tool('exams_query'), version);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <>
      <Hero greeting={greeting} />

      <QuickActions />
      <Briefing version={version} />
      <Work version={version} go={go} />

      <div className="grid" style={{ marginTop: 16 }}>
        <div className="panel"><div className="stat">{p?.tasks_done_today ?? '–'}</div><div className="stat-label">tasks done today</div></div>
        <div className="panel"><div className="stat">{p?.tasks_open ?? '–'}</div><div className="stat-label">tasks still open</div></div>
        <div className="panel"><div className="stat">{p?.focus_minutes_this_week ?? '–'}</div><div className="stat-label">focus minutes this week</div></div>
        <div className="panel"><div className="stat">{p?.habits?.length ? Math.max(...p.habits.map((h) => h.streak)) : 0}</div><div className="stat-label">best habit streak (days)</div></div>
      </div>

      <div className="grid" style={{ marginTop: 16 }}>
        <div className="panel">
          <div className="row"><h2>Today</h2><span className="spacer" /><button className="btn small" onClick={() => go('tasks')}>All tasks</button></div>
          {[...(overdue || []), ...(todayTasks || [])].length === 0 && <p className="empty">Nothing due today 🎉</p>}
          <ul className="list">
            {(overdue || []).map((t) => <li className="item" key={`o${t.id}`}><span className="item-title">{t.title}</span><span className="badge late">overdue</span></li>)}
            {(todayTasks || []).map((t) => <li className="item" key={t.id}><span className="item-title">{t.title}</span><span className="badge">{fmtDate(t.due)}</span></li>)}
          </ul>
        </div>

        <div className="panel">
          <div className="row"><h2>Coming up</h2><span className="spacer" /><button className="btn small" onClick={() => go('calendar')}>Calendar</button></div>
          {!events?.length && !reminders?.length && !exams?.length && <p className="empty">No events or reminders this week.</p>}
          <ul className="list">
            {(exams || []).slice(0, 3).map((e) => <li className="item" key={`x${e.id}`}><span className="item-title">🎓 {e.subject}</span><span className={`badge ${e.days_left <= 7 ? 'late' : ''}`}>{daysLeft(e.days_left)}</span></li>)}
            {(events || []).slice(0, 5).map((e, i) => <li className="item" key={`e${i}`}><span className="item-title">📅 {e.title}</span><span className="badge">{fmtDate(e.start)}</span></li>)}
            {(reminders || []).slice(0, 4).map((r) => <li className="item" key={`r${r.id}`}><span className="item-title">⏰ {r.text}</span><span className="badge">{fmtDate(r.at)}</span></li>)}
          </ul>
        </div>

        <div className="panel">
          <h2>What I've noticed</h2>
          {!p ? <p className="muted">…</p> : (
            <ul className="list">
              <li className="item"><span className="item-title">You get the most done between <b>{p.most_productive_hours}</b>.</span></li>
              <li className="item"><span className="item-title">You finished <b>{p.tasks_done_this_week}</b> tasks in the last 7 days.</span></li>
              {p.habits.map((h) => <li className="item" key={h.name}><span className="item-title">{h.name}: <b>{h.this_week}/{h.target}</b> this week, streak {h.streak}</span></li>)}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
