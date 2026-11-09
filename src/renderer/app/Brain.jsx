import { useEffect, useState } from 'react';
import { useData, tool } from './useData.js';
import { useAsk } from '../shared/useAsk.js';
import Markdown from '../shared/Markdown.jsx';
import MicButton from '../shared/MicButton.jsx';

// Which branch lights up while Maya uses a tool ("a brain you can see").
const BRANCH_OF = [[/^(memory_|learn_word)/, 'facts'], [/^(contacts_|call_|whatsapp_|phone)/, 'people'], [/^(tasks_|reminders_|calendar_|work_timer)/, 'plans'],
  [/^skills_/, 'skills'], [/^(notes_|diary_)/, 'notes'], [/^persona_set|^ui_set/, 'goals']];
const short = (s, n = 26) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Maya's second brain: a mind map of what it knows about the user, searchable, askable, glowing while it works. */
export default function Brain({ version }) {
  const memories = useData(() => tool('memory_list', {}), version) || [];
  const contacts = useData(() => tool('contacts_query', {}), version) || [];
  const tasks = useData(() => tool('tasks_query', { status: 'open' }), version) || [];
  const notes = useData(() => tool('notes_query', {}), version) || [];
  const skills = useData(() => tool('skills_list', {}), version) || [];
  const agent = useData(() => window.ather.getSetting('agent', {}), version) || {};
  const [search, setSearch] = useState('');
  const [active, setActive] = useState(null);
  const [q, setQ] = useState('');
  const { turn, send } = useAsk();

  // Live: the branch for Maya's latest action glows for a few seconds.
  useEffect(() => {
    let last = null;
    const t = setInterval(async () => {
      const w = await window.ather.workToday().catch(() => null);
      const top = w?.items?.[0];
      if (!top || top.id === last || Date.now() - Date.parse(top.at) > 8000) return;
      last = top.id;
      setActive(BRANCH_OF.find(([re]) => re.test(top.name))?.[1] || 'you');
      setTimeout(() => setActive(null), 4000);
    }, 1500);
    return () => clearInterval(t);
  }, []);
  useEffect(() => { if (turn?.thinking) setActive('you'); }, [turn?.thinking]);

  const branches = [
    ['people', '👥 People', contacts.map((c) => `${c.name}${c.relation ? ` (${c.relation})` : ''}`)],
    ['facts', '🧠 About you', memories.filter((m) => m.category !== 'preference').map((m) => m.fact)],
    ['likes', '💜 Likes & ways', memories.filter((m) => m.category === 'preference').map((m) => m.fact.replace(/^How the user wants answers: /, ''))],
    ['goals', '🎯 Goals & rules', [agent.goals, agent.rules].filter(Boolean).join('\n').split('\n').map((s) => s.replace(/^- /, '')).filter(Boolean)],
    ['plans', '📅 Plans', tasks.slice(0, 12).map((t) => `${t.title}${t.due ? ` · ${t.due.slice(5, 10)}` : ''}`)],
    ['notes', '📝 Notes', notes.slice(0, 12).map((n) => n.title)],
    ['skills', '✨ Skills', skills.filter((s) => s.enabled).map((s) => s.name)],
  ];
  const match = (s) => search && s.toLowerCase().includes(search.toLowerCase());
  const W = 960, H = 640, cx = W / 2, cy = H / 2;

  return (
    <>
      <h1 className="page-title">{agent.name || 'Maya'}’s brain</h1>
      <p className="page-sub">Everything {agent.name || 'Maya'} knows and remembers about you, linked like a mind map. It lights up while {agent.name || 'Maya'} works. All of it stays on this PC.</p>
      <div className="row wrap" style={{ marginBottom: 12 }}>
        <input className="input" style={{ flex: 1, minWidth: 220 }} placeholder="Search the brain…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search the brain" />
        <MicButton onText={(t) => setSearch(t)} />
      </div>
      <div className="panel brain-map" aria-hidden="true">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img">
          {branches.map(([id, label, items], b) => {
            const a = (b / branches.length) * Math.PI * 2 - Math.PI / 2;
            const bx = cx + Math.cos(a) * 190, by = cy + Math.sin(a) * 175;
            const leaves = items.slice(0, 6);
            return (
              <g key={id} className={`branch ${active === id ? 'lit' : ''}`}>
                <line x1={cx} y1={cy} x2={bx} y2={by} className="link" />
                {leaves.map((it, i) => {
                  const la = a + (i - (leaves.length - 1) / 2) * 0.17;
                  const lx = cx + Math.cos(la) * 300, ly = cy + Math.sin(la) * 268;
                  return (
                    <g key={i} className={match(it) ? 'hit' : ''}>
                      <line x1={bx} y1={by} x2={lx} y2={ly} className="link thin" />
                      <circle cx={lx} cy={ly} r="5" className="leaf" />
                      <text x={lx + (Math.cos(la) < 0 ? -9 : 9)} y={ly + 4} textAnchor={Math.cos(la) < 0 ? 'end' : 'start'} className="leaf-text">{short(it)}</text>
                    </g>
                  );
                })}
                <circle cx={bx} cy={by} r="30" className="node" />
                <text x={bx} y={by + 4} textAnchor="middle" className="node-text">{label.split(' ')[0]}</text>
                <text x={bx} y={by + 46} textAnchor="middle" className="node-label">{label.slice(label.indexOf(' ') + 1)} ({items.length})</text>
              </g>
            );
          })}
          <circle cx={cx} cy={cy} r="48" className={`core ${active ? 'lit' : ''}`} />
          <text x={cx} y={cy + 6} textAnchor="middle" className="core-text">You</text>
        </svg>
      </div>
      <div className="grid" style={{ marginTop: 16 }}>
        <section className="panel" aria-labelledby="brain-ask">
          <h2 id="brain-ask">💬 Ask your brain</h2>
          <form className="row" onSubmit={(e) => { e.preventDefault(); if (q.trim()) send(`From what you remember about me: ${q}`, [], { style: 'chat' }); }}>
            <input className="input" style={{ flex: 1 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="When is my sister's wedding? What do I like?" aria-label="Ask your brain" />
            <MicButton onText={(t) => setQ(t)} />
            <button className="btn primary">Ask</button>
          </form>
          {turn && <div style={{ marginTop: 10 }}>{turn.thinking && !turn.text ? <p className="muted">Thinking…</p> : <Markdown text={turn.text || turn.error || ''} />}</div>}
        </section>
        {/* The same brain as a list, for screen readers and switch users. */}
        <section className="panel" aria-label="Everything in the brain">
          {branches.map(([id, label, items]) => (
            <details key={id} open={!!search && items.some(match)}>
              <summary>{label} ({items.length})</summary>
              <ul className="list">{items.filter((s) => !search || match(s)).map((s, i) => <li className="item" key={i}><span className="item-title">{s}</span></li>)}</ul>
            </details>
          ))}
        </section>
      </div>
    </>
  );
}
