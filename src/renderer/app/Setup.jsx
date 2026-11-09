import { useEffect, useState } from 'react';
import Face from '../shared/Face.jsx';
import ModelList from './ModelList.jsx';

/** First run: check the computer, download the AI models, done. */
export default function Setup({ onDone }) {
  const [check, setCheck] = useState(null);
  useEffect(() => { window.ather.systemCheck().then(setCheck); }, []);

  const finish = async () => { await window.ather.setSetting('setupDone', true); onDone(); };

  return (
    <div className="setup">
      <div className="setup-hero">
        <Face size={130} mood="wave" />
        <h1 className="page-title">Hi, I'm Maya!</h1>
        <p className="page-sub">Your computer's little buddy. Everything runs on this computer: free, private, and it works offline.</p>
      </div>

      <div className="panel">
        <h2>1. Can this computer run me?</h2>
        {!check ? <p className="muted">Checking…</p> : (
          <>
            <ul className="list">
              {check.checks.map((c) => (
                <li className="item" key={c.name}>
                  <span className={c.ok ? 'ok' : 'bad'}>{c.ok ? '✓' : '✗'}</span>
                  <span className="item-title"><b>{c.name}:</b> {c.value}</span>
                  {!c.ok && <span className="badge">needs {c.need}</span>}
                </li>
              ))}
            </ul>
            <p><b>{check.verdict}</b></p>
          </>
        )}
      </div>

      <div className="panel">
        <h2>2. Download my brain, ears and voice</h2>
        <p className="muted">Only what this computer can run. It starts by itself, one time; after that, no internet is needed.</p>
        <ModelList auto />
      </div>

      <div className="row" style={{ marginTop: 20 }}>
        <span className="spacer" />
        <button className="btn primary" onClick={finish}>Start using Maya →</button>
      </div>
    </div>
  );
}
