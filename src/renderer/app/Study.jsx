import { useState } from 'react';
import Markdown from '../shared/Markdown.jsx';
import { useData, tool, fmtDate } from './useData.js';
import Lectures from './Lectures.jsx';
import Timetable from './Timetable.jsx';

const errText = (e) => e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
const KINDS = { quiz: '❓ Quiz', flashcards: '🃏 Flashcards', summary: '📄 Summary' };

export default function Study({ version, go }) {
  const [tab, setTab] = useState('sets');
  const sets = useData(() => window.ather.studySets(), version);
  const notes = useData(() => tool('notes_query', {}), version);
  const [open, setOpen] = useState(null);
  const [form, setForm] = useState({ kind: 'quiz', source: 'topic', topic: '', note_id: '', path: '', count: 8 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function create(e) {
    e.preventDefault();
    const args = { kind: form.kind, count: Number(form.count) };
    if (form.source === 'topic') { if (!form.topic.trim()) return; args.topic = form.topic.trim(); }
    if (form.source === 'note') { if (!form.note_id) return; args.note_id = Number(form.note_id); }
    if (form.source === 'file') { if (!form.path) return; args.path = form.path; }
    setBusy(true); setError(null);
    try {
      const set = await window.ather.createStudy(args);
      setOpen(await window.ather.studySet(set.id));
    } catch (err) { setError(errText(err)); } finally { setBusy(false); }
  }

  if (open) return <Player set={open} onBack={() => setOpen(null)} />;

  const tabs = (
    <div className="tabs" role="tablist">
      <button role="tab" aria-selected={tab === 'sets'} className={`btn small ${tab === 'sets' ? 'primary' : ''}`} onClick={() => setTab('sets')}>❓ Quizzes & flashcards</button>
      <button role="tab" aria-selected={tab === 'lectures'} className={`btn small ${tab === 'lectures' ? 'primary' : ''}`} onClick={() => setTab('lectures')}>🎙 Lectures</button>
      <button role="tab" aria-selected={tab === 'timetable'} className={`btn small ${tab === 'timetable' ? 'primary' : ''}`} onClick={() => setTab('timetable')}>🗓 Timetable & exams</button>
    </div>
  );
  if (tab === 'timetable') {
    return (
      <>
        <h1 className="page-title">Study</h1>
        <p className="page-sub">Your weekly classes and a countdown to every exam. Import a timetable from a photo or PDF.</p>
        {tabs}
        <Timetable version={version} />
      </>
    );
  }
  if (tab === 'lectures') {
    return (
      <>
        <h1 className="page-title">Study</h1>
        <p className="page-sub">Record a class or an online lecture. Maya writes the transcript live, then makes notes, flashcards and a quiz.</p>
        {tabs}
        <Lectures version={version} go={go} />
      </>
    );
  }

  return (
    <>
      <h1 className="page-title">Study</h1>
      <p className="page-sub">Turn a topic, a note or a PDF into a quiz, flashcards or a summary. Or ask Maya: “make a quiz on DBMS joins”.</p>
      {tabs}

      <form className="panel" onSubmit={create}>
        <div className="row wrap">
          <select className="input" style={{ width: 160 }} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} aria-label="What to make">
            {Object.entries(KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <span className="muted">from</span>
          <select className="input" style={{ width: 130 }} value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} aria-label="Source">
            <option value="topic">a topic</option><option value="note">a note</option><option value="file">a file</option>
          </select>
          {form.source === 'topic' && <input className="input" style={{ flex: 1, minWidth: 220 }} placeholder="e.g. Operating system scheduling algorithms" value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} aria-label="Topic" />}
          {form.source === 'note' && (
            <select className="input" style={{ flex: 1, minWidth: 220 }} value={form.note_id} onChange={(e) => setForm({ ...form, note_id: e.target.value })} aria-label="Note">
              <option value="">Choose a note…</option>
              {(notes || []).map((n) => <option key={n.id} value={n.id}>{n.title}</option>)}
            </select>
          )}
          {form.source === 'file' && (
            <button type="button" className="btn" style={{ flex: 1, minWidth: 220, textAlign: 'left' }} onClick={async () => { const p = await window.ather.pickDocument(); if (p) setForm({ ...form, path: p }); }}>
              {form.path ? `📄 ${form.path.split(/[\\/]/).pop()}` : 'Choose a PDF, Word or text file…'}
            </button>
          )}
          {form.kind !== 'summary' && <input className="input" type="number" min="3" max="20" style={{ width: 80 }} value={form.count} onChange={(e) => setForm({ ...form, count: e.target.value })} aria-label="How many" />}
          <button className="btn primary" disabled={busy}>{busy ? 'Making…' : 'Make it'}</button>
        </div>
        {busy && <p className="muted">The AI is writing your study set. This takes 10 to 40 seconds.</p>}
        {error && <p className="bad">{error}</p>}
      </form>

      <div className="panel">
        <h2>Your study sets</h2>
        {sets?.length === 0 && <p className="empty">Nothing yet. Make your first quiz above.</p>}
        <ul className="list">
          {(sets || []).map((s) => (
            <li className="item" key={s.id}>
              <span>{KINDS[s.kind].split(' ')[0]}</span>
              <span className="item-title"><b>{s.title}</b> <small className="muted">· {fmtDate(s.created_at)}</small></span>
              {s.best !== null && <span className={`badge ${s.best >= 70 ? '' : 'late'}`}>best {s.best}%</span>}
              <button className="btn small primary" onClick={async () => setOpen(await window.ather.studySet(s.id))}>{s.kind === 'quiz' ? 'Practice' : 'Open'}</button>
              <button className="btn small" onClick={() => window.ather.deleteStudySet(s.id)} aria-label={`Delete ${s.title}`}>✕</button>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

function Player({ set, onBack }) {
  return (
    <>
      <div className="row"><button className="btn" onClick={onBack}>← Back</button><h1 className="page-title" style={{ margin: 0 }}>{set.title}</h1></div>
      <div className="panel" style={{ marginTop: 16, maxWidth: 760 }}>
        {set.kind === 'quiz' && <Quiz set={set} />}
        {set.kind === 'flashcards' && <Cards cards={set.items} />}
        {set.kind === 'summary' && (
          <>
            <Markdown text={set.items.summary} />
            <h2 style={{ marginTop: 16 }}>Key points to remember</h2>
            <ul>{set.items.key_points.map((k, i) => <li key={i}>{k}</li>)}</ul>
          </>
        )}
      </div>
    </>
  );
}

function Quiz({ set }) {
  const questions = set.items;
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const q = questions[i];

  function choose(k) {
    if (picked !== null) return;
    setPicked(k);
    if (k === q.answer) setScore((s) => s + 1);
  }
  function next() {
    if (i + 1 < questions.length) { setI(i + 1); setPicked(null); return; }
    setDone(true);
    window.ather.studyAttempt(set.id, score, questions.length);
  }
  const restart = () => { setI(0); setPicked(null); setScore(0); setDone(false); };

  if (done) {
    const pct = Math.round((score / questions.length) * 100);
    return (
      <div style={{ textAlign: 'center' }}>
        <div className="timer">{pct}%</div>
        <p>You got <b>{score}</b> of {questions.length} right. {pct >= 80 ? 'Excellent! 🎉' : pct >= 50 ? 'Good, keep practising 💪' : 'Review the topic and try again 📚'}</p>
        <button className="btn primary" onClick={restart}>Try again</button>
      </div>
    );
  }
  return (
    <>
      <div className="row"><span className="muted">Question {i + 1} of {questions.length}</span><span className="spacer" /><span className="badge">Score {score}</span></div>
      <div className="progress" style={{ margin: '8px 0 14px' }}><div style={{ width: `${(i / questions.length) * 100}%` }} /></div>
      <h2 style={{ fontSize: 18 }}>{q.question}</h2>
      {q.options.map((o, k) => (
        <button key={k} className={`quiz-option ${picked !== null && k === q.answer ? 'right' : ''} ${picked === k && k !== q.answer ? 'wrong' : ''}`} onClick={() => choose(k)} disabled={picked !== null}>
          {String.fromCharCode(65 + k)}. {o}
        </button>
      ))}
      {picked !== null && (
        <>
          <p className={picked === q.answer ? 'ok' : 'bad'}>{picked === q.answer ? 'Correct!' : `Not quite. The answer is ${String.fromCharCode(65 + q.answer)}.`}</p>
          {q.explanation && <p className="muted">{q.explanation}</p>}
          <button className="btn primary" onClick={next}>{i + 1 < questions.length ? 'Next →' : 'See score'}</button>
        </>
      )}
    </>
  );
}

function Cards({ cards }) {
  const [queue, setQueue] = useState(() => cards.map((_, k) => k));
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState(0);
  if (!queue.length) {
    return <div style={{ textAlign: 'center' }}><p>You know all {cards.length} cards! 🎉</p><button className="btn primary" onClick={() => { setQueue(cards.map((_, k) => k)); setKnown(0); }}>Start again</button></div>;
  }
  const card = cards[queue[0]];
  const answer = (gotIt) => {
    setFlipped(false);
    if (gotIt) setKnown((n) => n + 1);
    setQueue(([first, ...rest]) => (gotIt ? rest : [...rest, first])); // missed cards come back later
  };
  return (
    <>
      <div className="row"><span className="muted">{known} of {cards.length} learned · {queue.length} left</span></div>
      <button className={`flashcard ${flipped ? 'back' : ''}`} onClick={() => setFlipped(!flipped)} aria-label={flipped ? 'Show question' : 'Show answer'} style={{ marginTop: 10 }}>
        {flipped ? card.back : card.front}
      </button>
      <p className="muted" style={{ textAlign: 'center' }}>{flipped ? 'Did you know it?' : 'Click the card to see the answer'}</p>
      {flipped && <div className="row" style={{ justifyContent: 'center' }}><button className="btn" onClick={() => answer(false)}>↺ Again</button><button className="btn primary" onClick={() => answer(true)}>✓ I knew it</button></div>}
    </>
  );
}
