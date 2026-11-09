import { useEffect, useRef, useState } from 'react';
import { useAsk } from '../shared/useAsk.js';
import ToolResult from '../shared/ToolResult.jsx';
import Markdown from '../shared/Markdown.jsx';
import { AgentChecklist } from '../shared/Approvals.jsx';
import Face from '../shared/Face.jsx';
import { startRecording } from '../shared/audio.js';
import MicButton from '../shared/MicButton.jsx';

/** 👍 / 👎 on an answer. A 👎 asks what to do differently, and Maya follows that from now on. */
function Feedback({ question }) {
  const [state, setState] = useState(null); // null | 'good' | 'asking' | 'saved'
  const [note, setNote] = useState('');
  const send = (good, text = '') => window.ather.feedback({ question, good, note: text }).then(() => setState(good ? 'good' : 'saved'));
  if (state === 'good') return <span className="muted">👍 Thanks!</span>;
  if (state === 'saved') return <span className="muted">✓ Maya will remember that</span>;
  if (state === 'asking') return (
    <form className="row" onSubmit={(e) => { e.preventDefault(); send(false, note); }}>
      <input className="input small" autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder="What should Maya do differently?" aria-label="What should Maya do differently?" />
      <MicButton onText={(t) => setNote((v) => `${v}${v ? ' ' : ''}${t}`)} />
      <button className="btn small primary">Save</button>
    </form>
  );
  return <>
    <button onClick={() => send(true)} title="Good answer" aria-label="Good answer">👍</button>
    <button onClick={() => setState('asking')} title="Bad answer" aria-label="Bad answer">👎</button>
  </>;
}
import { useData } from './useData.js';

const errText = (e) => e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
const SUGGESTIONS = [
  'Explain normalization in DBMS with examples',
  'Make a 8-slide PPT on cloud computing',
  'Plot y = x² from -5 to 5 with Python',
  'Make a 7-day study plan for my operating systems exam',
];

export default function Chat({ version, arg }) {
  const conversations = useData(() => window.ather.conversations(), version);
  const modes = useData(() => window.ather.chatModes(), version);
  const allModels = useData(() => window.ather.chatModels(false), version);
  const [cid, setCid] = useState(arg ? Number(arg) : null);
  useEffect(() => { if (arg) setCid(Number(arg)); }, [arg]);
  const messages = useData(() => (cid ? window.ather.messages(cid) : Promise.resolve([])), version, [cid]);
  const docs = useData(() => (cid ? window.ather.documents(cid) : Promise.resolve([])), version, [cid]);
  const { turn, send, cancel, reset } = useAsk();
  const [input, setInput] = useState('');
  const [images, setImages] = useState([]);
  const [mode, setMode] = useState('auto');
  const [busyDoc, setBusyDoc] = useState(false);
  const [error, setError] = useState(null);
  const [recorder, setRecorder] = useState(null);
  const end = useRef(null);
  const heardRef = useRef(''); // what the mic heard, to learn the words the user corrects
  const fileRef = useRef(null);

  useEffect(() => { window.ather.getSetting('chatMode', 'auto').then(setMode); }, []);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [messages, turn?.text, turn?.tools.length, turn?.reasoning]);
  // Switching chats clears the old answer, but not one still streaming (a new chat gets its id mid-question).
  useEffect(() => { if (!turn?.thinking) reset(); setError(null); }, [cid]);

  const pickMode = (m) => { setMode(m); window.ather.setSetting('chatMode', m); };
  const ensureConversation = async () => cid || (await window.ather.newConversation().then((id) => { setCid(id); return id; }));

  const [followUps, setFollowUps] = useState([]);
  useEffect(() => setFollowUps([]), [cid]);

  /** Ask, then swap the live answer for the saved one and fetch follow-up suggestions. */
  async function run(q, pics, conv) {
    setFollowUps([]);
    const answer = await send(q, pics, { conversationId: conv, style: 'chat', mode });
    if (answer === null) return;
    reset(); // a finished answer is saved and shows up in the history list
    setFollowUps(await window.ather.followUps(q, answer));
  }

  async function submit(text = input) {
    const q = text.trim() || (images.length ? 'What is in this picture?' : '');
    if (!q || turn?.thinking) return;
    const conv = await ensureConversation();
    const pics = images;
    // Words the user fixed in what the mic heard are learned for next time.
    if (heardRef.current && text === input && q !== heardRef.current) window.ather.learnEdited(heardRef.current, q).catch(() => {});
    heardRef.current = '';
    setInput(''); setImages([]);
    await run(q, pics, conv);
  }

  async function regenerate() {
    const q = await window.ather.regenerate(cid);
    if (q) await run(q, [], cid);
  }

  async function attachDocument() {
    const path = await window.ather.pickDocument();
    if (!path) return;
    setBusyDoc(true); setError(null);
    try { await window.ather.addDocument(await ensureConversation(), path); } catch (e) { setError(errText(e)); } finally { setBusyDoc(false); }
  }

  function attachImages(files) {
    for (const f of files) {
      if (!f.type.startsWith('image/')) continue;
      const r = new FileReader();
      r.onload = () => setImages((x) => [...x, r.result].slice(0, 3));
      r.readAsDataURL(f);
    }
  }

  async function toggleMic() {
    if (!recorder) { try { setRecorder(await startRecording()); } catch { setError('Maya could not use the microphone.'); } return; }
    const audio = await recorder.stop();
    setRecorder(null);
    if (audio.length < 16000 * 0.3) return;
    const heard = await window.ather.transcribe(audio);
    setInput((v) => { const next = `${v}${v ? ' ' : ''}${heard}`; heardRef.current = next.trim(); return next; });
  }

  const [editing, setEditing] = useState(null); // { id, title }
  const saveRename = () => {
    if (editing?.title.trim()) window.ather.renameConversation(editing.id, editing.title.trim());
    setEditing(null);
  };

  const lastAssistant = [...(messages || [])].reverse().find((m) => m.role === 'assistant');

  return (
    <div className="chat-page">
      <aside className="conv-list" aria-label="Conversations">
        <button className="btn primary" style={{ width: '100%' }} onClick={() => setCid(null)}>+ New chat</button>
        {(conversations || []).map((c) => (
          <div key={c.id} className={`conv ${c.id === cid ? 'active' : ''}`}>
            {editing?.id === c.id
              ? <input className="input conv-edit" autoFocus value={editing.title} aria-label="Chat name"
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })} onBlur={saveRename}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveRename(); if (e.key === 'Escape') setEditing(null); }} />
              : <button className="conv-title" onClick={() => setCid(c.id)} title={c.title}>{c.title}</button>}
            <button className="conv-act" onClick={() => setEditing({ id: c.id, title: c.title })} aria-label={`Rename ${c.title}`} title="Rename">✎</button>
            <button className="conv-act" onClick={() => { if (confirm(`Delete "${c.title}"?`)) { window.ather.deleteConversation(c.id); if (c.id === cid) setCid(null); } }} aria-label={`Delete ${c.title}`} title="Delete">🗑</button>
          </div>
        ))}
      </aside>

      <section className="chat-main">
        <div className="chat-scroll">
          {!messages?.length && !turn && (
            <div className="chat-empty">
              <Face size={90} mood="happy" />
              <h1 className="page-title">What can I help with?</h1>
              <p className="muted">Ask anything, attach a PDF or picture, or say “remember that my exam is on 14 December”.</p>
              <div className="suggestions">{SUGGESTIONS.map((s) => <button key={s} className="suggestion" onClick={() => submit(s)}>{s}</button>)}</div>
            </div>
          )}

          <div className="chat-log">
            {(messages || []).map((m) => (
              <div key={m.id} className={`msg ${m.role}`}>
                {m.role === 'user'
                  ? m.content.replace(/\n\(Attached image saved at:[^)]*\)/, ' 🖼')
                  : <>
                      {m.tools && (() => { const events = JSON.parse(m.tools); return <><AgentChecklist tools={events} />{events.map((t, i) => <ToolResult key={i} event={t} />)}</>; })()}
                      <Markdown text={m.content} />
                      <div className="msg-actions">
                        <button onClick={() => navigator.clipboard.writeText(m.content)} title="Copy answer">Copy</button>
                        {m.id === lastAssistant?.id && !turn?.thinking && <button onClick={regenerate} title="Ask again">↻ Regenerate</button>}
                        <Feedback question={messages[messages.indexOf(m) - 1]?.content || ''} />
                        {m.model && <span className="muted">{m.model}</span>}
                      </div>
                      {m.id === lastAssistant?.id && !turn && followUps.length > 0 && (
                        <div className="followups">{followUps.map((f) => <button key={f} className="suggestion small" onClick={() => submit(f)}>{f}</button>)}</div>
                      )}
                    </>}
              </div>
            ))}
            {turn && (
              <>
                <div className="msg user">{turn.question}{turn.images?.length ? ' 🖼' : ''}</div>
                <div className="msg assistant">
                  {turn.model && <div className="model-tag">{turn.model}</div>}
                  {turn.reasoning && (
                    <details className="reasoning" open={!turn.text}>
                      <summary>{turn.text ? `Thought for ${turn.thoughtFor ?? 0}s` : 'Thinking…'}</summary>
                      <div>{turn.reasoning}</div>
                    </details>
                  )}
                  <AgentChecklist tools={turn.tools} />
                  {turn.tools.map((t, i) => <ToolResult key={i} event={t} />)}
                  {turn.text && <Markdown text={turn.text} />}
                  {turn.thinking && !turn.text && !turn.reasoning && <div className="dots"><span /><span /><span /></div>}
                  {turn.error && <span className="bad">⚠ {turn.error}</span>}
                </div>
              </>
            )}
            <div ref={end} />
          </div>
        </div>

        <div className="composer-box">
          {(docs?.length > 0 || images.length > 0 || busyDoc) && (
            <div className="attach-row">
              {(docs || []).map((d) => <span key={d.id} className="badge">📄 {d.name} <button className="x" onClick={() => window.ather.removeDocument(d.id)} aria-label={`Remove ${d.name}`}>✕</button></span>)}
              {busyDoc && <span className="badge">Reading document…</span>}
              {images.map((src, i) => <button key={i} className="thumb small" onClick={() => setImages(images.filter((_, j) => j !== i))} title="Remove"><img src={src} alt="Attached" /></button>)}
            </div>
          )}
          {error && <div className="bad" style={{ padding: '0 6px' }}>{error}</div>}
          <textarea
            className="composer-input" rows={2} value={input} placeholder={recorder ? 'Listening… press 🎤 again when done' : 'Message Maya…'} aria-label="Message"
            onChange={(e) => setInput(e.target.value)} onPaste={(e) => attachImages(e.clipboardData.files)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
          />
          <div className="composer-bar">
            <button className="icon" onClick={attachDocument} title="Attach a PDF, Word or text file" aria-label="Attach document">📄</button>
            <button className="icon" onClick={() => fileRef.current.click()} title="Attach a picture" aria-label="Attach picture">🖼</button>
            <input type="file" accept="image/*" hidden ref={fileRef} onChange={(e) => { attachImages(e.target.files); e.target.value = ''; }} />
            <button className={`icon ${recorder ? 'rec' : ''}`} onClick={toggleMic} title="Speak instead of typing" aria-label="Voice input">🎤</button>
            <select className="mode-pick" value={mode} onChange={(e) => pickMode(e.target.value)} aria-label="AI model">
              <option value="auto">✨ Auto (best model for each question)</option>
              <optgroup label="Maya modes">
                {(modes || []).map((m) => <option key={m.key} value={m.key} disabled={!m.installed}>{m.label}{m.installed ? '' : ' (not downloaded)'}</option>)}
              </optgroup>
              {allModels?.length > 0 && (
                <optgroup label="Any model">
                  {allModels.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </optgroup>
              )}
            </select>
            <span className="spacer" />
            {turn?.thinking
              ? <button className="btn" onClick={cancel}>■ Stop</button>
              : <button className="btn primary" onClick={() => submit()} disabled={!input.trim() && !images.length}>Send ↑</button>}
          </div>
        </div>
      </section>
    </div>
  );
}
