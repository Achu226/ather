// Click-through layer over the whole screen for hands-free control: yellow numbers on every control, a lettered grid,
// the glowing boxes of switch scanning, and the filling ring of a dwell click at the cursor.
import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';

const COLS = 16, ROWS = 10; // same grid as computer control (A1 … P10)

function Marks({ data }) {
  const { bounds } = data;
  if (data.kind === 'point') {
    // "Where's the Save button?": a glowing outline, an arrow above it and its name.
    const { x, y, w = 40, h = 30, label } = data.at;
    const left = x - w / 2 - bounds.x, top = y - h / 2 - bounds.y;
    const above = top > 70;
    return (
      <>
        <div className="point" style={{ left: left - 6, top: top - 6, width: w + 12, height: h + 12 }} />
        <div className="arrow" style={{ left: left + w / 2 - 16, top: above ? top - 38 : top + h + 14, transform: above ? undefined : 'rotate(180deg)' }} />
        {label && <div className="label" style={{ left: Math.max(4, left + w / 2 - 60), top: above ? top - 72 : top + h + 44 }}>{label}</div>}
      </>
    );
  }
  if (data.kind === 'grid') {
    const w = bounds.width / COLS, h = bounds.height / ROWS;
    return Array.from({ length: COLS * ROWS }, (_, k) => {
      const c = k % COLS, r = Math.floor(k / COLS);
      return <div key={k} className="cell" style={{ left: c * w, top: r * h, width: w, height: h }}><span>{String.fromCharCode(65 + c)}{r + 1}</span></div>;
    });
  }
  const lit = new Set(data.lit || []);
  const scanning = !!data.lit;
  return (
    <>
      {data.back && <div className="back">↩ Back</div>}
      {data.items.map((e) => {
        const left = e.x - (e.w || 0) / 2 - bounds.x, top = e.y - (e.h || 0) / 2 - bounds.y;
        // While scanning only the lit boxes show, so the eye goes straight to them.
        if (scanning && !lit.has(e.i)) return null;
        return (
          <div key={e.i}>
            <div className={`box ${lit.has(e.i) ? 'lit' : ''}`} data-name={e.name} style={{ left, top, width: e.w, height: e.h }} />
            <div className="tag" style={{ left: Math.max(0, left - 4), top: Math.max(0, top - 8) }}>{e.i}</div>
          </div>
        );
      })}
    </>
  );
}

function Ring({ ring }) {
  const r = 26, c = 2 * Math.PI * r;
  return (
    <svg className="ring" style={{ left: ring.at.x - ring.bounds.x - 32, top: ring.at.y - ring.bounds.y - 32 }} width="64" height="64" aria-hidden="true">
      <circle cx="32" cy="32" r={r} className="ring-track" />
      <circle cx="32" cy="32" r={r} className="ring-fill" strokeDasharray={c} strokeDashoffset={c * (1 - ring.progress)} />
    </svg>
  );
}

function Overlay() {
  const [data, setData] = useState(null);
  const [ring, setRing] = useState(null);
  useEffect(() => { const a = window.ather.onOverlay(setData); const b = window.ather.onOverlayRing(setRing); return () => { a(); b(); }; }, []);
  return <>{data && <Marks data={data} />}{ring && <Ring ring={ring} />}</>;
}

createRoot(document.getElementById('root')).render(<Overlay />);
