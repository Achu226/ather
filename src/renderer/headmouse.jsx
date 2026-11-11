// Hands-free mouse: the webcam follows your head to move the cursor; open your mouth to click, smile to right-click,
// or (dwell) simply hold the pointer still to click.
import { createRoot } from 'react-dom/client';
import { useEffect, useRef, useState } from 'react';
import { FaceLandmarker } from '@mediapipe/tasks-vision';
import wasmLoader from '../../node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.js?url';
import wasmBinary from '../../node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.wasm?url';
import { headDirection, createPointer, createGestures, createDwell, createBlink, createHeadGesture, createGlance, createFaceActions } from './shared/headpose.js';

const query = new URLSearchParams(location.search);
const speed = Number(query.get('speed')) || 1;
const dwellMs = Number(query.get('dwell')) || 0; // 0 = dwell click off
const blinkOn = query.get('blink') === '1';
const faceMap = (() => { try { return JSON.parse(query.get('faces') || '{}'); } catch { return {}; } })(); // Accessibility page choices

function HeadMouse() {
  const video = useRef(null);
  const pointer = useRef(createPointer({ speed }));
  const [status, setStatus] = useState('Starting the camera…');
  const [state, setState] = useState(''); // '' | 'on' | 'click'
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  pausedRef.current = paused;
  // "Speak for me" look mode: the cursor stays still (no moves, no clicks) and only left/right glances are sent.
  const holdRef = useRef(false);
  useEffect(() => window.ather.onHeadMouseHold?.((on) => { holdRef.current = !!on; }), []);

  useEffect(() => {
    let stop = false, stream, landmarker;
    const gestures = createGestures();
    const dwell = dwellMs ? createDwell({ ms: dwellMs }) : null;
    const blink = blinkOn ? createBlink() : null;
    const nod = createHeadGesture(); // nod = yes, shake = no on an approval card
    const glance = createGlance(); // look left / look right on the Speak for me board
    const faceActions = createFaceActions({ map: faceMap }); // eyebrows, mouth left/right, pucker → the chosen action
    let lastRing = 0;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, frameRate: { ideal: 60 }, facingMode: 'user' } });
        video.current.srcObject = stream;
        await video.current.play();
        setStatus('Loading the face tracker…');
        const model = await window.ather.headMouseModel();
        landmarker = await FaceLandmarker.createFromOptions({ wasmLoaderPath: new URL(wasmLoader, location.href).href, wasmBinaryPath: new URL(wasmBinary, location.href).href }, {
          baseOptions: { modelAssetBuffer: new Uint8Array(model), delegate: 'GPU' },
          runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: true,
        });
        setStatus('Look at the screen centre…');
        let lastFrame = -1;
        const loop = () => {
          if (stop) return;
          const v = video.current;
          if (v.currentTime !== lastFrame) {
            lastFrame = v.currentTime;
            const now = performance.now();
            const r = landmarker.detectForVideo(v, now);
            const lm = r.faceLandmarks?.[0];
            if (!lm) { setState(''); setStatus('No face found: sit in front of the camera.'); }
            else if (!pausedRef.current && holdRef.current) {
              const side = glance(headDirection(lm), now);
              if (side) window.ather.headMouseGlance(side);
              setState('on');
              setStatus('Look left or right to choose');
            }
            else if (!pausedRef.current) {
              glance(headDirection(lm), now); // keeps its calibration current
              const scores = Object.fromEntries((r.faceBlendshapes?.[0]?.categories || []).map((c) => [c.categoryName, c.score]));
              const g = gestures(scores, now);
              const b = blink?.(scores, now);
              const yesNo = nod(headDirection(lm), now);
              if (yesNo) window.ather.headMouseGesture(yesNo);
              if (b?.click && !g.click) g.click = b.click;
              const p = g.freeze || b?.freeze ? null : pointer.current.update(headDirection(lm));
              if (p && !pointer.current.calibrating) {
                window.ather.headMouseMove(p.x, p.y);
                const d = dwell?.(p, now);
                // The ring at the cursor is redrawn in steps of 5% (enough to look smooth, few messages).
                const ring = d ? Math.round(d.progress * 20) / 20 : 0;
                if (ring !== lastRing) { lastRing = ring; window.ather.headMouseDwell(ring < 1 ? ring : 0); }
                if (d?.click) { window.ather.headMouseClick('left'); setState('click'); setTimeout(() => setState('on'), 300); }
              }
              const fa = g.click ? null : faceActions(scores, now);
              if (fa) { window.ather.headMouseAction(fa).catch(() => {}); setState('click'); setTimeout(() => setState('on'), 300); }
              if (g.click) { window.ather.headMouseClick(g.click); setState('click'); setTimeout(() => setState('on'), 300); }
              else setState((s) => (s === 'click' ? s : 'on'));
              setStatus(pointer.current.calibrating ? 'Look at the screen centre…' : (dwellMs ? 'Turn your head to move · hold still to click · smile = right-click' : 'Turn your head to move · open mouth = click · smile = right-click'));
            }
          }
          requestAnimationFrame(loop);
        };
        loop();
      } catch (e) {
        setStatus(e.name === 'NotAllowedError' || e.name === 'NotFoundError' ? 'No camera available (check Windows camera privacy).' : `Head mouse stopped: ${e.message}`);
      }
    })();
    return () => { stop = true; stream?.getTracks().forEach((t) => t.stop()); landmarker?.close(); };
  }, []);

  return (
    <div className="hm">
      <video ref={video} muted playsInline />
      <span className={`dot ${paused ? '' : state}`} aria-hidden="true" />
      <div className="bar">
        <span role="status">{paused ? 'Paused' : status}</span>
        <button onClick={() => pointer.current.recenter()} title="Look at the screen centre, then press">Center</button>
        <button onClick={() => setPaused(!paused)}>{paused ? 'Resume' : 'Pause'}</button>
        <button onClick={() => window.ather.headMouseSet(false)} aria-label="Turn off head mouse">✕</button>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<HeadMouse />);
