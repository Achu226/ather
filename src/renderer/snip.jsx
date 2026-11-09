import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';

// Fullscreen frozen screenshot: drag a box to send that part to Maya, Esc to cancel.
function Snip() {
  const [image, setImage] = useState(null);
  const [start, setStart] = useState(null);
  const [rect, setRect] = useState(null);

  useEffect(() => {
    const off = window.ather.onSnipImage(setImage);
    const onKey = (e) => { if (e.key === 'Escape') window.ather.snipDone(null); };
    window.addEventListener('keydown', onKey);
    return () => { off(); window.removeEventListener('keydown', onKey); };
  }, []);

  const box = (a, b) => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) });
  const down = (e) => { setStart({ x: e.clientX, y: e.clientY }); setRect(null); };
  const move = (e) => { if (start) setRect(box(start, { x: e.clientX, y: e.clientY })); };
  const up = (e) => {
    if (!start) return;
    const r = box(start, { x: e.clientX, y: e.clientY });
    setStart(null);
    if (r.width > 8 && r.height > 8) window.ather.snipDone(r);
  };

  return (
    <div onMouseDown={down} onMouseMove={move} onMouseUp={up}
      style={{ position: 'fixed', inset: 0, background: image ? `url(${image}) 0 0 / 100% 100% no-repeat` : '#000' }}>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,8,30,.45)', clipPath: rect ? `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${rect.x}px ${rect.y}px, ${rect.x}px ${rect.y + rect.height}px, ${rect.x + rect.width}px ${rect.y + rect.height}px, ${rect.x + rect.width}px ${rect.y}px, ${rect.x}px ${rect.y}px)` : 'none' }} />
      {rect && <div style={{ position: 'fixed', left: rect.x, top: rect.y, width: rect.width, height: rect.height, border: '2px solid #8b7dff', boxShadow: '0 0 0 1px #fff' }} />}
      <div style={{ position: 'fixed', top: 18, left: '50%', transform: 'translateX(-50%)', background: '#1d1638', color: '#fff', padding: '8px 16px', borderRadius: 999, font: '14px Segoe UI' }}>
        Drag a box around what you want to ask about · Esc to cancel
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Snip />);
