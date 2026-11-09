import { useEffect, useState } from 'react';
import { useData } from './useData.js';

const errText = (e) => e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
const STATUS = { connected: ['ok', '● Connected'], connecting: ['muted', '◌ Connecting…'], error: ['bad', '● Error'], off: ['muted', '○ Off'] };
const PERMS = { ask: 'Ask me before every action', auto: 'Read freely, ask before changes', off: 'Disabled' };

export default function Mcp({ version }) {
  const servers = useData(() => window.ather.mcpServers(), version);
  const [busy, setBusy] = useState({});
  const [open, setOpen] = useState(null);
  const [adding, setAdding] = useState({ name: '', transport: 'stdio', command: '', args: '', url: '' });

  async function connect(id) {
    setBusy((b) => ({ ...b, [id]: true }));
    try { await window.ather.mcpConnect(id); } finally { setBusy((b) => ({ ...b, [id]: false })); }
  }
  async function add(e) {
    e.preventDefault();
    const id = adding.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 20) || `server${Date.now()}`;
    await window.ather.mcpSave(id, adding.transport === 'http'
      ? { name: adding.name, transport: 'http', url: adding.url, permission: 'ask', description: 'Custom server' }
      : { name: adding.name, transport: 'stdio', command: adding.command, args: adding.args.match(/"[^"]*"|\S+/g)?.map((a) => a.replace(/^"|"$/g, '')) || [], permission: 'ask', description: 'Custom server' });
    setAdding({ name: '', transport: 'stdio', command: '', args: '', url: '' });
    connect(id);
  }

  return (
    <>
      <h1 className="page-title">Connected tools (MCP)</h1>
      <p className="page-sub">MCP servers give Maya new skills: your files, GitHub, a browser it can drive, programming docs. A server shows “Connected” only after Maya really talked to it.</p>

      <div className="grid">
        {(servers || []).map((s) => {
          const [cls, label] = STATUS[s.enabled ? s.status : 'off'] || STATUS.off;
          return (
            <div className="panel provider" key={s.id}>
              <div className="row"><h2 style={{ margin: 0 }}>{s.name}</h2><span className="spacer" /><span className={cls}>{label}</span></div>
              <p className="muted" style={{ margin: '6px 0' }}>{s.description}</p>
              {s.error && <p className="bad" style={{ margin: '4px 0', fontSize: 12.5 }}>{s.error}</p>}
              {s.status === 'connected' && <small className="muted">{s.tools.length} tools · {s.tools.filter((t) => t.read).length} read-only</small>}
              <div className="field" style={{ marginTop: 10 }}>
                <select className="input" value={s.permission} onChange={(e) => window.ather.mcpSave(s.id, { permission: e.target.value })} aria-label={`${s.name} permission`}>
                  {Object.entries(PERMS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="row wrap">
                {s.enabled && s.status === 'connected'
                  ? <button className="btn small" onClick={() => window.ather.mcpSave(s.id, { enabled: false })}>Turn off</button>
                  : <button className="btn small primary" onClick={() => connect(s.id)} disabled={busy[s.id] || s.permission === 'off'}>{busy[s.id] ? 'Connecting…' : s.status === 'error' ? 'Reconnect' : 'Connect'}</button>}
                {s.status === 'connected' && <button className="btn small" onClick={() => setOpen(open === s.id ? null : s.id)}>{open === s.id ? 'Hide tools' : 'Tools & log'}</button>}
                {!s.preset && <button className="btn small danger" onClick={() => window.ather.mcpRemove(s.id)}>Remove</button>}
              </div>
              {open === s.id && <ServerDetail server={s} />}
            </div>
          );
        })}
      </div>

      <form className="panel" onSubmit={add} style={{ marginTop: 16 }}>
        <h2>Add any MCP server</h2>
        <div className="row wrap">
          <input className="input" style={{ width: 180 }} placeholder="Name" required value={adding.name} onChange={(e) => setAdding({ ...adding, name: e.target.value })} aria-label="Server name" />
          <select className="input" style={{ width: 150 }} value={adding.transport} onChange={(e) => setAdding({ ...adding, transport: e.target.value })} aria-label="Connection">
            <option value="stdio">Command</option><option value="http">URL (HTTP)</option>
          </select>
          {adding.transport === 'http'
            ? <input className="input" style={{ flex: 1, minWidth: 240 }} placeholder="http://localhost:8000/mcp" required value={adding.url} onChange={(e) => setAdding({ ...adding, url: e.target.value })} aria-label="Server URL" />
            : <>
                <input className="input" style={{ width: 160 }} placeholder="cmd.exe" required value={adding.command} onChange={(e) => setAdding({ ...adding, command: e.target.value })} aria-label="Command" />
                <input className="input" style={{ flex: 1, minWidth: 240 }} placeholder='/c npx -y @modelcontextprotocol/server-memory' value={adding.args} onChange={(e) => setAdding({ ...adding, args: e.target.value })} aria-label="Arguments" />
              </>}
          <button className="btn primary">Add and connect</button>
        </div>
        <p className="muted">New servers start with “Ask me before every action”.</p>
      </form>

      <ApprovedFolders />
    </>
  );
}

function ServerDetail({ server }) {
  const [tool, setTool] = useState(server.tools[0]?.name || '');
  const [args, setArgs] = useState('{}');
  const [out, setOut] = useState(null);
  async function tryTool() {
    setOut('Running…');
    try { setOut((await window.ather.mcpCall(server.id, tool, JSON.parse(args || '{}'))).content.slice(0, 2000)); } catch (e) { setOut(`Error: ${errText(e)}`); }
  }
  return (
    <div style={{ marginTop: 10 }}>
      <ul className="list" style={{ maxHeight: 180, overflowY: 'auto' }}>
        {server.tools.map((t) => <li className="item" key={t.name}><span className="item-title"><b>{t.name}</b> <small className="muted">{t.description.slice(0, 90)}</small></span><span className="badge">{t.read ? 'read' : 'changes'}</span></li>)}
      </ul>
      <div className="row wrap" style={{ marginTop: 8 }}>
        <select className="input" style={{ flex: 1 }} value={tool} onChange={(e) => setTool(e.target.value)} aria-label="Tool to try">{server.tools.map((t) => <option key={t.name}>{t.name}</option>)}</select>
        <input className="input" style={{ flex: 1 }} value={args} onChange={(e) => setArgs(e.target.value)} aria-label="Arguments as JSON" />
        <button className="btn small" onClick={tryTool}>Try it</button>
      </div>
      {out && <pre className="py-out">{out}</pre>}
      <h3 style={{ fontSize: 13, margin: '10px 0 4px' }}>Log</h3>
      <ul className="list" style={{ maxHeight: 140, overflowY: 'auto', fontSize: 12 }}>
        {server.log.map((l, i) => <li key={i} className="item"><span className={l.ok ? 'ok' : 'bad'}>{l.ok ? '✓' : '✗'}</span><span className="item-title">{l.at.slice(11, 19)} {l.tool || l.event} {l.ms ? `${l.ms} ms` : ''} <small className="muted">{l.summary}</small></span></li>)}
      </ul>
    </div>
  );
}

function ApprovedFolders() {
  const [folders, setFolders] = useState([]);
  useEffect(() => { window.ather.approvedFolders().then(setFolders); }, []);
  const save = (list) => { setFolders(list); window.ather.setSetting('approvedFolders', list); };
  return (
    <div className="panel">
      <h2>Approved folders</h2>
      <p className="muted">Maya (file manager, coding, the Filesystem server) can only open and change files inside these folders. Deleting always goes to the Recycle Bin and asks first.</p>
      <ul className="list">
        {folders.map((f) => <li className="item" key={f}><span className="item-title">📁 {f}</span><button className="btn small" onClick={() => save(folders.filter((x) => x !== f))} aria-label={`Remove ${f}`}>✕</button></li>)}
      </ul>
      <button className="btn" style={{ marginTop: 8 }} onClick={async () => { const f = await window.ather.pickFolder(); if (f && !folders.includes(f)) save([...folders, f]); }}>Add folder…</button>
      <p className="muted">After changing folders, reconnect the Filesystem server.</p>
    </div>
  );
}
