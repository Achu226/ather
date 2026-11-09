import { useState } from 'react';
import { useData, tool } from './useData.js';
import MicButton from '../shared/MicButton.jsx';

const add = (setter) => (text) => setter((v) => `${v}${v ? ' ' : ''}${text}`);

/** Skills Maya can do and learn: the built-in ones, the user's own, and a form (or voice) to teach a new one. */
export default function Skills({ version }) {
  const skills = useData(() => tool('skills_list', {}), version) || [];
  const [name, setName] = useState('');
  const [when, setWhen] = useState('');
  const [steps, setSteps] = useState('');
  const [msg, setMsg] = useState(null);

  async function save(e) {
    e.preventDefault();
    try { await tool('skills_save', { name, when, steps }); setMsg(`✓ Maya learned “${name}”.`); setName(''); setWhen(''); setSteps(''); } catch (err) { setMsg(`⚠ ${err.message}`); }
  }
  const card = (s) => (
    <li className="item skill" key={s.name}>
      <span className="item-title"><b>{s.name}</b><br /><small className="muted">{s.when}</small></span>
      {!!s.uses && <span className="badge" title="Times used">{s.uses}×</span>}
      <label className="row"><input type="checkbox" className="check" checked={!!s.enabled} aria-label={`${s.name} on`}
        onChange={(e) => tool('skills_switch', { name: s.name, on: e.target.checked })} /> On</label>
      {!s.builtin && <button className="btn small" onClick={() => tool('skills_forget', { name: s.name })} aria-label={`Delete ${s.name}`}>Delete</button>}
    </li>
  );

  return (
    <>
      <h1 className="page-title">Skills</h1>
      <p className="page-sub">Ready-made skills Maya uses by itself when they fit, and skills you teach it. Say “teach yourself: when I say goodnight, turn on dark mode and tell me tomorrow’s tasks”, or fill in the form.</p>
      <div className="grid a11y-grid">
        <section className="panel" aria-labelledby="sk-mine">
          <h2 id="sk-mine">✨ Teach Maya a skill</h2>
          <form onSubmit={save}>
            <div className="field"><label htmlFor="sk-n">Name (also the words that start it)</label>
              <div className="row"><input id="sk-n" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Goodnight" required /><MicButton onText={add(setName)} /></div></div>
            <div className="field"><label htmlFor="sk-w">When to use it</label>
              <div className="row"><input id="sk-w" className="input" value={when} onChange={(e) => setWhen(e.target.value)} placeholder="when I say goodnight or I'm going to sleep" required /><MicButton onText={add(setWhen)} /></div></div>
            <div className="field"><label htmlFor="sk-s">What to do, step by step</label>
              <div className="row"><textarea id="sk-s" className="input" rows={4} value={steps} onChange={(e) => setSteps(e.target.value)} placeholder="Turn on dark mode. Read tomorrow's tasks. Set an alarm for 7 am." required /><MicButton onText={add(setSteps)} /></div></div>
            <button className="btn primary">Save skill</button>
          </form>
          {msg && <p className="muted" role="status">{msg}</p>}
          <ul className="list">{skills.filter((s) => !s.builtin).map(card)}</ul>
        </section>
        <section className="panel" aria-labelledby="sk-built">
          <h2 id="sk-built">📚 Built-in skills</h2>
          <ul className="list">{skills.filter((s) => s.builtin).map(card)}</ul>
        </section>
      </div>
    </>
  );
}
