import { useEffect, useState } from 'react';

const errText = (e) => e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

/** Use this PC's AI from the user's laptop (over Tailscale), or think on another PC's AI. */
export default function BrainServer() {
  const [server, setServer] = useState(null); // { host, url }
  const [share, setShare] = useState(null); // { sharing, addresses }
  const [host, setHost] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState('');

  const load = () => Promise.all([window.ather.brainServer(), window.ather.brainShare()]).then(([s, sh]) => { setServer(s); setShare(sh); setHost((h) => h || s.host); });
  useEffect(() => { load().catch((e) => setResult({ ok: false, error: errText(e) })); }, []);

  async function act(name, fn) {
    setBusy(name);
    try { setResult(await fn()); } catch (e) { setResult({ ok: false, error: errText(e) }); }
    setBusy('');
    load().catch(() => {});
  }
  const usingOther = !!server?.host;

  return (
    <div className="panel brain-server">
      <h2>Brain server: use this PC's AI from your laptop</h2>
      <p className="muted">One strong PC does the thinking; your laptop runs Maya (head mouse, voice, screen) and asks this PC. Works anywhere with <a href="https://tailscale.com/download" target="_blank" rel="noreferrer">Tailscale</a> (free): sign in with the same account on both.</p>

      <h3>Share this PC's brain</h3>
      {!share && <p className="muted">Checking…</p>}
      {share && (
        <>
          <div className="row wrap">
            <span className={`badge ${share.sharing ? 's-running' : ''}`}>{share.sharing ? 'Shared with your devices' : 'Only this PC'}</span>
            <button className="btn small" disabled={!!busy} onClick={() => act('share', () => window.ather.brainShareSet(!share.sharing))}>
              {busy === 'share' ? 'Restarting the AI…' : share.sharing ? 'Stop sharing' : 'Let my other devices use this brain'}</button>
          </div>
          {share.sharing && (
            <>
              <p className="muted">On the laptop, paste one of these below (Tailscale works anywhere; home network only at home). If Windows asks whether Ollama may use the network, press <b>Allow</b>.</p>
              {share.addresses.length === 0 && <p className="empty">No network found. Connect to Wi-Fi or Tailscale.</p>}
              <ul className="addresses">
                {share.addresses.map((a) => (
                  <li key={a.address} className="row">
                    <code className="pair-code small-code">{a.address}</code>
                    <span className="badge">{a.kind === 'tailscale' ? 'Tailscale: anywhere' : 'Home network'}</span>
                    <button className="btn small" onClick={() => navigator.clipboard.writeText(a.address)} aria-label={`Copy ${a.address}`}>Copy</button>
                  </li>
                ))}
              </ul>
              <p className="warn-note">⚠ The AI has no password. Use the Tailscale address; never open port 11434 on your router.</p>
            </>
          )}
        </>
      )}

      <h3>Think on another PC's brain</h3>
      <p className="muted">Now using: <b>{usingOther ? `the PC at ${server.host}` : 'this computer'}</b></p>
      <form className="row wrap" onSubmit={(e) => { e.preventDefault(); act('use', () => window.ather.brainServerSet(host)); }}>
        <input className="input" style={{ flex: 1, minWidth: 220 }} placeholder="e.g. 100.101.102.103:11434" value={host} onChange={(e) => setHost(e.target.value)} aria-label="Brain server address" />
        <button type="button" className="btn small" disabled={!host.trim() || !!busy} onClick={() => act('test', () => window.ather.brainServerTest(host))}>{busy === 'test' ? 'Testing…' : 'Test'}</button>
        <button className="btn small primary" disabled={!host.trim() || !!busy}>{busy === 'use' ? 'Connecting…' : 'Use it'}</button>
        {usingOther && <button type="button" className="btn small" disabled={!!busy} onClick={() => { setHost(''); act('local', () => window.ather.brainServerSet('')); }}>Back to this PC</button>}
      </form>
      <div aria-live="polite">
        {result && (result.ok
          ? <p className="ok">✓ {result.version ? `Ollama ${result.version} with ${result.models?.length ?? 0} models at ${result.url}` : result.sharing !== undefined ? (result.sharing ? 'Shared. Copy an address above.' : 'Sharing is off.') : `Maya now thinks on ${result.url}`}</p>
          : <p className="bad">✗ {result.error}</p>)}
      </div>
    </div>
  );
}
