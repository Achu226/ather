import { useEffect, useRef, useState } from 'react';

const errText = (e) => e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

/** auto: start downloading what is missing by itself (first-run setup: no click needed). */
export default function ModelList({ auto = false }) {
  const [status, setStatus] = useState(null);
  const [progress, setProgress] = useState({});
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState(null);

  const refresh = () => window.ather.modelStatus().then(setStatus);
  useEffect(() => {
    refresh();
    return window.ather.onModelProgress(({ key, progress: p }) => setProgress((all) => ({ ...all, [key]: p })));
  }, []);

  async function download() {
    setDownloading(true);
    setError(null);
    try { setStatus(await window.ather.downloadModels()); } catch (e) { setError(errText(e)); } finally { setDownloading(false); }
  }

  const started = useRef(false);
  useEffect(() => {
    if (!auto || started.current || !status?.ollama || !status.models.some((m) => !m.installed)) return;
    started.current = true;
    download();
  }, [auto, status]);

  if (!status) return <p className="muted">Checking models…</p>;
  const missing = status.models.filter((m) => !m.installed);

  return (
    <>
      {!status.ollama && (
        <p className="bad">
          Ollama is not running. Install it free from{' '}
          <button className="link" onClick={() => window.ather.openExternal('https://ollama.com/download')}>ollama.com</button>, then press Check again.
        </p>
      )}
      <ul className="list">
        {status.models.map((m) => (
          <li className="item" key={m.key}>
            <span className={m.installed ? 'ok' : 'muted'}>{m.installed ? '✓' : '○'}</span>
            <span className="item-title">{m.label}</span>
            {!m.installed && progress[m.key] !== undefined && (
              <div className="progress" style={{ width: 140 }}><div style={{ width: `${Math.round(progress[m.key] * 100)}%` }} /></div>
            )}
            <span className="badge">{m.sizeMB >= 1000 ? `${(m.sizeMB / 1000).toFixed(1)} GB` : `${m.sizeMB} MB`}</span>
          </li>
        ))}
      </ul>
      {error && <p className="bad">{error}</p>}
      <div className="row" style={{ marginTop: 10 }}>
        {missing.length > 0
          ? <button className="btn primary" disabled={downloading || !status.ollama} onClick={download}>{downloading ? 'Downloading…' : `Download ${missing.length} missing`}</button>
          : <span className="ok">All models are ready.</span>}
        <button className="btn" onClick={refresh} disabled={downloading}>Check again</button>
      </div>
    </>
  );
}
