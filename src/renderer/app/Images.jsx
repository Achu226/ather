import { useState } from 'react';
import { fileUrl } from '../shared/audio.js';

const errText = (e) => e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

export default function Images() {
  return (
    <>
      <h1 className="page-title">Image tools</h1>
      <p className="page-sub">Hide private details in a screenshot, or draw a brand-new picture. Both run on this computer.</p>
      <Blur />
      <OneClick title="Remove the background" tool="images_remove_background" button="Remove background" note="Keeps the person or object and makes the rest transparent (PNG)." />
      <OneClick title="Upscale a photo (2×)" tool="images_upscale" button="Upscale" note="Makes small or blurry pictures sharper at double the size. Works on pictures up to 1024 px wide." />
      <Create />
      <p className="muted">Tip: press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd> anywhere to snip part of your screen and ask Maya about it.</p>
    </>
  );
}

function Blur() {
  const [src, setSrc] = useState(null);
  const [opts, setOpts] = useState({ faces: true, emails: true, names: true });
  const [out, setOut] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function pick() {
    const p = await window.ather.pickImage();
    if (p) { setSrc(p); setOut(null); }
  }
  async function run() {
    setBusy(true); setError(null);
    try { setOut(await window.ather.tool('images_blur', { path: src, ...opts })); } catch (e) { setError(errText(e)); } finally { setBusy(false); }
  }

  return (
    <div className="panel">
      <h2>Blur a screenshot</h2>
      <div className="row wrap" style={{ marginBottom: 12 }}>
        <button className="btn" onClick={pick}>Choose picture…</button>
        {['faces', 'emails', 'names'].map((k) => (
          <label key={k} className="row"><input type="checkbox" className="check" checked={opts[k]} onChange={(e) => setOpts({ ...opts, [k]: e.target.checked })} />
            {k === 'emails' ? 'Emails & phone numbers' : k[0].toUpperCase() + k.slice(1)}</label>
        ))}
        <button className="btn primary" disabled={!src || busy} onClick={run}>{busy ? 'Working…' : 'Blur it'}</button>
      </div>
      {error && <p className="bad">{error}</p>}
      {src && (
        <div className="compare">
          <figure style={{ margin: 0 }}><img src={fileUrl(src)} alt="Original" /><figcaption className="muted">Original</figcaption></figure>
          {out && (
            <figure style={{ margin: 0 }}>
              <img src={fileUrl(out.path)} alt="Blurred" />
              <figcaption className="row"><span className="muted">Blurred: {out.blurred.length ? [...new Set(out.blurred)].join(', ') : 'nothing found'}</span>
                <span className="spacer" /><button className="btn small" onClick={() => window.ather.showInFolder(out.path)}>Show file</button></figcaption>
            </figure>
          )}
        </div>
      )}
    </div>
  );
}

function OneClick({ title, tool, button, note }) {
  const [src, setSrc] = useState(null);
  const [out, setOut] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  async function run() {
    setBusy(true); setError(null);
    try { setOut(await window.ather.tool(tool, { path: src })); } catch (e) { setError(errText(e)); } finally { setBusy(false); }
  }
  return (
    <div className="panel">
      <h2>{title}</h2>
      <p className="muted">{note}</p>
      <div className="row" style={{ marginBottom: 12 }}>
        <button className="btn" onClick={async () => { const p = await window.ather.pickImage(); if (p) { setSrc(p); setOut(null); } }}>Choose picture…</button>
        <button className="btn primary" disabled={!src || busy} onClick={run}>{busy ? 'Working…' : button}</button>
      </div>
      {error && <p className="bad">{error}</p>}
      {src && (
        <div className="compare">
          <figure style={{ margin: 0 }}><img src={fileUrl(src)} alt="Original" /><figcaption className="muted">Original</figcaption></figure>
          {out && (
            <figure style={{ margin: 0 }}>
              <img src={fileUrl(out.path)} alt="Result" className="checker" />
              <figcaption className="row"><span className="muted">Result</span><span className="spacer" />
                <button className="btn small" onClick={() => window.ather.showInFolder(out.path)}>Show file</button></figcaption>
            </figure>
          )}
        </div>
      )}
    </div>
  );
}

function Create() {
  const [prompt, setPrompt] = useState('');
  const [count, setCount] = useState(4);
  const [shape, setShape] = useState('square');
  const [images, setImages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function run(e) {
    e.preventDefault();
    if (!prompt.trim()) return;
    setBusy(true); setError(null);
    try {
      const r = await window.ather.tool('images_generate', { prompt, count, shape });
      setImages((x) => [...r.paths.map((path) => ({ path, prompt, model: r.model })), ...x]);
    } catch (err) { setError(errText(err)); } finally { setBusy(false); }
  }

  return (
    <div className="panel">
      <h2>Create pictures</h2>
      <form className="row wrap" onSubmit={run}>
        <input className="input" style={{ flex: 1, minWidth: 260 }} placeholder="e.g. a cosy desk with a laptop and a cup of chai, watercolor" value={prompt} onChange={(e) => setPrompt(e.target.value)} aria-label="Picture description" />
        <select className="input" style={{ width: 120 }} value={count} onChange={(e) => setCount(Number(e.target.value))} aria-label="How many pictures">
          {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n} picture{n > 1 ? 's' : ''}</option>)}
        </select>
        <select className="input" style={{ width: 130 }} value={shape} onChange={(e) => setShape(e.target.value)} aria-label="Shape">
          <option value="square">Square</option><option value="portrait">Portrait</option><option value="landscape">Landscape</option>
        </select>
        <button className="btn primary" disabled={busy}>{busy ? 'Drawing…' : 'Create'}</button>
      </form>
      {busy && <p className="muted">Drawing {count} picture{count > 1 ? 's' : ''} on your graphics card…</p>}
      {error && <p className="bad">{error}</p>}
      <div className="grid" style={{ marginTop: 12 }}>
        {images.map((im) => (
          <figure key={im.path} style={{ margin: 0 }}>
            <img src={fileUrl(im.path)} alt={im.prompt} style={{ width: '100%', borderRadius: 12 }} onClick={() => window.ather.openPath(im.path)} />
            <figcaption className="muted">{im.prompt} · {im.model}</figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
