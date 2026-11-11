import { useEffect, useState } from 'react';
import ModelList from './ModelList.jsx';
import BrainServer from './BrainServer.jsx';
import { useData } from './useData.js';

const errText = (e) => e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

export default function Models({ version }) {
  const providers = useData(() => window.ather.providers(), version);
  const usage = useData(() => window.ather.usage(), version);
  const [presets, setPresets] = useState({});
  const [chatModels, setChatModels] = useState([]);
  const [tests, setTests] = useState({});
  const [keys, setKeys] = useState({});
  const [adding, setAdding] = useState({ preset: 'openai', name: '', baseUrl: '' });
  const [routing, setRouting] = useState({ hybrid: false, hybridModel: '', cloudShareFiles: false });
  const reload = () => window.ather.chatModels(true).then(setChatModels);

  useEffect(() => {
    window.ather.providerPresets().then(setPresets);
    reload();
    Promise.all(['hybrid', 'hybridModel', 'cloudShareFiles'].map((k) => window.ather.getSetting(k, k === 'hybridModel' ? '' : false)))
      .then(([hybrid, hybridModel, cloudShareFiles]) => setRouting({ hybrid, hybridModel, cloudShareFiles }));
  }, []);

  const setRoute = (k, v) => { setRouting((r) => ({ ...r, [k]: v })); window.ather.setSetting(k, v); };
  async function test(id) {
    setTests((t) => ({ ...t, [id]: { busy: true } }));
    const r = await window.ather.testProvider(id).catch((e) => ({ ok: false, error: errText(e) }));
    setTests((t) => ({ ...t, [id]: r }));
    reload();
  }
  async function save(p, patch) { await window.ather.saveProvider(p.id, patch, keys[p.id]); setKeys((k) => ({ ...k, [p.id]: undefined })); reload(); }
  async function add(e) {
    e.preventDefault();
    const id = `${adding.preset}-${Date.now().toString(36)}`;
    await window.ather.saveProvider(id, { preset: adding.preset, name: adding.name || presets[adding.preset].name, baseUrl: adding.baseUrl || undefined, enabled: true });
    setAdding({ preset: 'openai', name: '', baseUrl: '' });
  }

  const cloudModels = chatModels.filter((m) => !m.local);

  return (
    <>
      <h1 className="page-title">AI models</h1>
      <p className="page-sub">Maya runs on your computer by default. Add LM Studio or a cloud service (OpenAI, Gemini, Claude, Groq, OpenRouter) if you want; you choose what goes where.</p>

      <div className="grid">
        {(providers || []).map((p) => {
          const t = tests[p.id] || p.lastTest;
          return (
            <div className="panel provider" key={p.id}>
              <div className="row"><h2 style={{ margin: 0 }}>{p.name}</h2><span className="spacer" />
                <span className={`badge ${p.local ? '' : 'late'}`}>{p.local ? 'on this PC' : '☁ cloud'}</span></div>
              <small className="muted" style={{ wordBreak: 'break-all' }}>{p.baseUrl}</small>
              <label className="row" style={{ margin: '10px 0' }}>
                <input type="checkbox" className="check" checked={p.enabled} onChange={(e) => save(p, { enabled: e.target.checked })} /> Use this provider
              </label>
              {!p.keyless && (
                <div className="row">
                  <input className="input" type="password" placeholder={p.hasKey ? 'API key saved (encrypted)' : 'Paste API key'} value={keys[p.id] || ''}
                    onChange={(e) => setKeys((k) => ({ ...k, [p.id]: e.target.value }))} aria-label={`${p.name} API key`} />
                  <button className="btn small" disabled={!keys[p.id]} onClick={() => save(p, {})}>Save</button>
                </div>
              )}
              <div className="row" style={{ marginTop: 10 }}>
                <button className="btn small primary" onClick={() => test(p.id)} disabled={t?.busy}>{t?.busy ? 'Testing…' : 'Test connection'}</button>
                {p.id !== 'ollama' && p.id !== 'lmstudio' && <button className="btn small danger" onClick={() => window.ather.removeProvider(p.id)}>Remove</button>}
              </div>
              {t && !t.busy && (t.ok
                ? <p className="ok">✓ Works: {t.models} models, “{t.model}” replied in {(t.ms / 1000).toFixed(1)} s</p>
                : <p className="bad">✗ {t.error}</p>)}
            </div>
          );
        })}
      </div>

      <form className="panel" onSubmit={add} style={{ marginTop: 16 }}>
        <h2>Add a provider</h2>
        <div className="row wrap">
          <select className="input" style={{ width: 230 }} value={adding.preset} onChange={(e) => setAdding({ ...adding, preset: e.target.value })} aria-label="Provider type">
            {Object.entries(presets).filter(([k]) => k !== 'ollama' && k !== 'lmstudio').map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
          </select>
          <input className="input" style={{ width: 200 }} placeholder="Name (optional)" value={adding.name} onChange={(e) => setAdding({ ...adding, name: e.target.value })} aria-label="Name" />
          {adding.preset === 'custom' && <input className="input" style={{ flex: 1, minWidth: 240 }} placeholder="Base URL, e.g. http://localhost:8080/v1" value={adding.baseUrl} onChange={(e) => setAdding({ ...adding, baseUrl: e.target.value })} aria-label="Base URL" required />}
          <button className="btn primary">Add</button>
        </div>
        <p className="muted">Then paste its API key above and press Test connection.</p>
      </form>

      <BrainServer />

      <div className="panel">
        <h2>Which model answers</h2>
        <p className="muted">In Chat you can pick any of the {chatModels.length} models found, or keep ✨ Auto (local models chosen per question).</p>
        <label className="row field"><input type="checkbox" className="check" checked={routing.hybrid} onChange={(e) => setRoute('hybrid', e.target.checked)} />
          Hybrid: send big questions (explanations, code) to a cloud model, everything else stays local</label>
        {routing.hybrid && (
          <select className="input" style={{ maxWidth: 420 }} value={routing.hybridModel} onChange={(e) => setRoute('hybridModel', e.target.value)} aria-label="Cloud model for big questions">
            <option value="">Choose a cloud model…</option>
            {cloudModels.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        )}
        <label className="row field" style={{ marginTop: 10 }}><input type="checkbox" className="check" checked={routing.cloudShareFiles} onChange={(e) => setRoute('cloudShareFiles', e.target.checked)} />
          Allow cloud models to see my screen, files, documents and pictures (off = they only get the conversation)</label>
      </div>

      <div className="panel">
        <h2>Usage</h2>
        {!usage?.length && <p className="empty">No requests recorded yet.</p>}
        {usage?.length > 0 && (
          <table className="table">
            <thead><tr><th>Provider</th><th>Model</th><th>Requests</th><th>Tokens in</th><th>Tokens out</th></tr></thead>
            <tbody>{usage.map((u) => <tr key={`${u.provider}${u.model}`}><td>{u.provider}</td><td>{u.model}</td><td>{u.requests}</td><td>{u.prompt_tokens?.toLocaleString()}</td><td>{u.completion_tokens?.toLocaleString()}</td></tr>)}</tbody>
          </table>
        )}
      </div>

      <div className="panel">
        <h2>Maya's own models</h2>
        <ModelList />
      </div>
    </>
  );
}
