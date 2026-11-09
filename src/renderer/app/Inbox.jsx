import { useEffect, useState } from 'react';

const errText = (e) => e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

export default function Inbox() {
  const [connected, setConnected] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => { window.ather.hasSecret('mail-password').then(setConnected); }, []);

  async function check() {
    setLoading(true); setError(null);
    try { setResult(await window.ather.tool('mail_triage')); } catch (e) { setError(errText(e)); } finally { setLoading(false); }
  }

  if (connected === false) return <><h1 className="page-title">Inbox</h1><MailConnect onDone={() => setConnected(true)} /></>;

  return (
    <>
      <div className="row">
        <h1 className="page-title">Inbox</h1>
        <span className="spacer" />
        <button className="btn" onClick={() => setConnected(false)}>Change account</button>
        <button className="btn primary" onClick={check} disabled={loading}>{loading ? 'Reading…' : 'Sort my inbox'}</button>
      </div>
      <p className="page-sub">Maya reads your latest emails (read-only) and tells you which ones need you. Or ask: “anything important in my email?”</p>
      {error && <p className="bad">{error}</p>}
      {result && (
        <div className="panel">
          <h2>{result.needs_you} email{result.needs_you === 1 ? '' : 's'} need you</h2>
          <ul className="list">
            {[...result.mails].sort((a, b) => (b.needs_you ? 1 : 0) - (a.needs_you ? 1 : 0)).map((m) => (
              <li className="item" key={m.uid}>
                <span>{m.needs_you ? '🔴' : '⚪'}</span>
                <span className="item-title"><b>{m.from.split('<')[0].replace(/"/g, '')}</b> — {m.subject}<br /><small className="muted">{m.snippet.slice(0, 120)}</small></span>
                {m.why && <span className="badge late">{m.why}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function MailConnect({ onDone }) {
  const [presets, setPresets] = useState({});
  const [provider, setProvider] = useState('gmail');
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');

  useEffect(() => { window.ather.mailPresets().then(setPresets); }, []);

  async function save(e) {
    e.preventDefault();
    await window.ather.setSetting('mail', { ...presets[provider], user });
    await window.ather.setSecret('mail-password', pass);
    onDone();
  }

  return (
    <form className="panel" onSubmit={save} style={{ maxWidth: 520 }}>
      <h2>Connect your email</h2>
      <p className="muted">
        Use an <b>app password</b>, not your normal password. Gmail: Google Account → Security → 2-Step Verification → App passwords.
        It is stored encrypted on this computer only.
      </p>
      <div className="field"><label htmlFor="mp">Provider</label>
        <select id="mp" className="input" value={provider} onChange={(e) => setProvider(e.target.value)}>
          {Object.keys(presets).map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
        </select>
      </div>
      <div className="field"><label htmlFor="mu">Email address</label><input id="mu" className="input" type="email" required value={user} onChange={(e) => setUser(e.target.value)} /></div>
      <div className="field"><label htmlFor="mpw">App password</label><input id="mpw" className="input" type="password" required value={pass} onChange={(e) => setPass(e.target.value)} /></div>
      <button className="btn primary">Connect</button>
    </form>
  );
}
