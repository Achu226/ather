import { useEffect, useId, useState } from 'react';
import { useLook, faceColors, faceInk, DEFAULT_FACE } from './look.js';

/**
 * Maya's face. mood: idle | happy | think | listen | love | surprised | sleepy | celebrate | wave | sad
 *   | worried (tense) | excited | angry | working (a tool is running) | error
 *   | ask (waiting for a spoken yes/no) | nod (a voice command was done)
 *   | sos (emergency) | sleep (idle for long) | wake (just woken by "Hey Maya")
 * mouth: 0..1 how open the mouth is while speaking. level: 0..1 voice level while listening (ripples).
 * look: -1..1 or { x, y } where the eyes look. style: optional face style override (Appearance preview).
 * The user picks shape (classic | round | robot | cat | blob) and liveliness (calm | normal | lively) in Appearance.
 */

// How often the face does something on its own while idle (ms): [glance, little expression].
const LIFE = { calm: [[10000, 16000], [18000, 30000]], normal: [[6000, 13000], [9000, 15000]], lively: [[3000, 6000], [4000, 8000]] };
const EXPRESSIONS = ['smile', 'curious', 'yawn', 'smile', 'wink'];
const between = ([a, b]) => a + Math.random() * (b - a);
const BLOBS = [
  'M60 8 C92 6 114 26 112 52 C110 80 88 94 60 92 C30 94 8 78 8 52 C8 24 30 10 60 8 Z',
  'M60 10 C94 4 116 30 110 56 C106 82 84 96 58 92 C28 90 6 74 10 48 C14 22 32 12 60 10 Z',
  'M62 6 C90 10 112 24 112 50 C112 78 90 96 62 92 C34 90 8 80 8 54 C8 26 34 4 62 6 Z',
];

function Body({ shape, fill, stroke }) {
  const common = { fill, stroke, strokeWidth: 1.5 };
  if (shape === 'round') return <ellipse cx="60" cy="50" rx="52" ry="46" {...common} />;
  if (shape === 'bear') return (
    <g {...common}><circle cx="22" cy="14" r="15" /><circle cx="98" cy="14" r="15" /><circle cx="22" cy="14" r="7" fill="#ff9ccb" opacity="0.6" stroke="none" /><circle cx="98" cy="14" r="7" fill="#ff9ccb" opacity="0.6" stroke="none" />
      <rect x="8" y="10" width="104" height="82" rx="40" /></g>
  );
  if (shape === 'alien') return (
    <g><path d="M38 12 L28 -6 M82 12 L92 -6" stroke={fill} strokeWidth="3" strokeLinecap="round" /><circle cx="28" cy="-7" r="5" fill="#7dffb2" /><circle cx="92" cy="-7" r="5" fill="#7dffb2" />
      <path d="M60 4 C100 4 114 26 110 50 C106 78 82 94 60 94 C38 94 14 78 10 50 C6 26 20 4 60 4 Z" {...common} /></g>
  );
  if (shape === 'ghost') return <path className="ghost-body" d="M14 52 C14 22 34 6 60 6 C86 6 106 22 106 52 L106 94 L94 86 L82 94 L70 86 L60 94 L50 86 L38 94 L26 86 L14 94 Z" {...common} />;
  // Jarvis-style glowing orb: a sphere with orbit rings that turn while Maya works or listens.
  if (shape === 'orb') return (
    <g>
      <circle cx="60" cy="50" r="46" fill="#071a2b" stroke="#36e0ff" strokeWidth="2.5" className="orb-glow" />
      <g className="orb-rings" fill="none" stroke="#36e0ff" strokeWidth="1.2" opacity="0.55">
        <ellipse cx="60" cy="50" rx="44" ry="14" /><ellipse cx="60" cy="50" rx="14" ry="44" /><ellipse cx="60" cy="50" rx="34" ry="34" transform="rotate(45 60 50)" strokeDasharray="4 5" />
      </g>
    </g>
  );
  if (shape === 'blob') {
    const still = document.documentElement.dataset.motion === 'off';
    return (
      <path d={BLOBS[0]} {...common}>
        {!still && <animate attributeName="d" dur="7s" repeatCount="indefinite" values={[...BLOBS, BLOBS[0]].join(';')} />}
      </path>
    );
  }
  return <rect x="8" y="8" width="104" height="84" rx={shape === 'robot' ? 14 : shape === 'cat' ? 34 : 32} {...common} />;
}

export default function Face({ mood = 'idle', mouth = 0, size = 96, look = 0, level = 0, style }) {
  const { theme, face: saved } = useLook();
  const face = { ...DEFAULT_FACE, ...(style || saved) };
  const shape = face.shape || 'classic';
  const life = LIFE[face.liveliness] || LIFE.normal;
  const [colorA, colorB] = mood === 'sos' ? ['#ff4d5e', '#b00020'] : faceColors(face, theme);
  const gradient = `face-${useId().replace(/:/g, '')}`;
  const [blink, setBlink] = useState(false);
  const [drift, setDrift] = useState(0);
  const [expr, setExpr] = useState(null); // a short idle expression: smile | curious | yawn
  useEffect(() => {
    let timer, glance, moment;
    const next = () => {
      timer = setTimeout(() => { setBlink(true); setTimeout(() => setBlink(false), 130); next(); }, 2200 + Math.random() * 3500);
    };
    // Idle life: glance around now and then, and sometimes smile, wonder or yawn.
    const wander = () => {
      glance = setTimeout(() => { setDrift(Math.random() < 0.5 ? -1 : 1); setTimeout(() => setDrift(0), 900); wander(); }, between(life[0]));
    };
    const feel = () => {
      moment = setTimeout(() => { setExpr(EXPRESSIONS[Math.floor(Math.random() * EXPRESSIONS.length)]); setTimeout(() => setExpr(null), 1600); feel(); }, between(life[1]));
    };
    next(); wander(); feel();
    return () => { clearTimeout(timer); clearTimeout(glance); clearTimeout(moment); };
  }, [face.liveliness]);

  // An idle expression shows only while nothing else is going on.
  const m = mood === 'idle' && expr ? { smile: 'happy', curious: 'curious', yawn: 'yawn', wink: 'wink' }[expr] : mood;
  const lx = typeof look === 'object' ? look.x : look, ly = typeof look === 'object' ? look.y : 0;
  const lookX = m === 'think' ? 5 : (lx || (m === 'idle' ? drift : 0)) * 4;
  // Working moods: what Maya is doing right now (typing, building, searching, checking), like a person at work.
  const busy = m === 'working' || m === 'typing' || m === 'building' || m === 'checking';
  const lookY = m === 'think' ? -5 : busy ? 4 : m === 'searching' ? -2 : (ly || 0) * 4;
  const ink = faceInk(face).eyes; // the user's eye colour ("Any pill. Any eyes.")
  const eye = (cx) => {
    const x = cx + lookX, y = 44 + lookY;
    const arc = (d) => <path d={d} stroke={ink} strokeWidth="5" fill="none" strokeLinecap="round" />;
    if (m === 'excited') return <path d={`M${x} ${y - 11} L${x + 3} ${y - 3} L${x + 11} ${y} L${x + 3} ${y + 3} L${x} ${y + 11} L${x - 3} ${y + 3} L${x - 11} ${y} L${x - 3} ${y - 3} Z`} fill="#ffe066" />;
    if (m === 'error') return <path d={`M${x - 7} ${y - 7} L${x + 7} ${y + 7} M${x + 7} ${y - 7} L${x - 7} ${y + 7}`} stroke={ink} strokeWidth="4.5" strokeLinecap="round" />;
    if (busy) return <rect x={x - 7} y={y - 5} width={14} height={blink ? 3 : 12} rx={6} fill={ink} />;
    if (m === 'wink' && cx < 60) return arc(`M${x - 8} ${y + 2} Q${x} ${y - 6} ${x + 8} ${y + 2}`);
    if (m === 'happy' || m === 'celebrate' || m === 'wave' || m === 'wake' || m === 'groove') return arc(`M${x - 8} ${y + 3} Q${x} ${y - 9} ${x + 8} ${y + 3}`);
    if (m === 'love') return <path d={`M${x} ${y + 8} l-9 -9 a5 5 0 0 1 9 -6 a5 5 0 0 1 9 6 z`} fill="#ff7eb6" />;
    if (m === 'sleepy' || m === 'sleep' || m === 'yawn' || blink) return arc(`M${x - 8} ${y} ${m === 'sleep' ? `Q${x} ${y + 6} ${x + 8} ${y}` : 'h16'}`);
    if (m === 'sad') return arc(`M${x - 8} ${y - 2} Q${x} ${y + 6} ${x + 8} ${y - 2}`);
    // "meh": half-closed, looking away
    if (m === 'meh') return <rect x={x - 7 - 3} y={y - 1} width={14} height={8} rx={4} fill={ink} />;
    const big = m === 'surprised' || m === 'listen' || m === 'sos' || m === 'curious' || m === 'searching';
    if (shape === 'robot') return <rect x={x - 9} y={y - (big ? 9 : 7)} width={18} height={big ? 18 : 14} rx={3} fill={face.color === 'custom' ? ink : '#bff7ff'} />;
    if (face.eyes === 'round') return <circle cx={x} cy={y} r={big ? 11 : 9} fill={ink} />;
    if (face.eyes === 'dots') return <circle cx={x} cy={y} r={big ? 7 : 5} fill={ink} />;
    const h = big ? 26 : 21, w = m === 'surprised' || m === 'sos' ? 16 : 13;
    return <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={w / 2} fill={ink} />;
  };

  let mouthEl;
  if (mouth > 0.04) {
    mouthEl = <ellipse cx="60" cy="72" rx={7 + mouth * 4} ry={2 + mouth * 9} fill="#1b1030" stroke={ink} strokeWidth="2.5" />;
  } else if (m === 'surprised' || m === 'sos') {
    mouthEl = <circle cx="60" cy="73" r={m === 'sos' ? 7 : 5} fill="none" stroke={ink} strokeWidth="3" />;
  } else if (m === 'yawn') {
    mouthEl = <ellipse cx="60" cy="73" rx="7" ry="9" fill="#1b1030" stroke={ink} strokeWidth="2.5" />;
  } else if (m === 'worried') {
    mouthEl = <path d="M49 74 q3.7 -4 7.3 0 t7.3 0 t7.3 0" stroke={ink} strokeWidth="3.2" fill="none" strokeLinecap="round" />;
  } else if (m === 'angry') {
    mouthEl = <path d="M51 76 Q60 69 69 76" stroke={ink} strokeWidth="3.5" fill="none" strokeLinecap="round" />;
  } else if (m === 'error') {
    mouthEl = <ellipse cx="60" cy="74" rx="6" ry="4" fill="none" stroke={ink} strokeWidth="3" />;
  } else if (m === 'excited' || m === 'wake') {
    mouthEl = <path d="M47 67 Q60 86 73 67 Z" fill="#1b1030" stroke={ink} strokeWidth="3" strokeLinejoin="round" />;
  } else if (m === 'sad' || m === 'sleepy' || m === 'sleep') {
    mouthEl = <path d={m === 'sleep' ? 'M55 73 h10' : 'M52 75 Q60 70 68 75'} stroke={ink} strokeWidth="3.5" fill="none" strokeLinecap="round" />;
  } else if (m === 'meh') {
    mouthEl = <path d="M54 74 h11" stroke={ink} strokeWidth="3.5" fill="none" strokeLinecap="round" />;
  } else if (m === 'wink') {
    mouthEl = <path d="M50 70 Q61 80 71 68" stroke={ink} strokeWidth="3.5" fill="none" strokeLinecap="round" />;
  } else if (m === 'think' || m === 'curious') {
    mouthEl = <path d={m === 'curious' ? 'M54 73 Q60 70 66 73' : 'M54 73 h12'} stroke={ink} strokeWidth="3.5" fill="none" strokeLinecap="round" />;
  } else {
    const wide = m === 'happy' || m === 'celebrate' || m === 'love' || m === 'wave';
    mouthEl = <path d={wide ? 'M49 69 Q60 82 71 69' : 'M52 70 Q60 77 68 70'} stroke={ink} strokeWidth="3.5" fill="none" strokeLinecap="round" />;
  }

  const body = `url(#${gradient})`;
  const catEars = shape === 'cat' || face.accessory === 'catears';
  return (
    <svg width={size} height={size * (112 / 120)} viewBox="0 -12 120 112" className={`face face-${m} shape-${shape}`} aria-label={`Maya looks ${m}`} role="img">
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={colorA} />
          <stop offset="1" stopColor={colorB} />
        </linearGradient>
      </defs>
      {catEars && <g fill={body}><path d="M18 22 L24 -6 L46 12 Z" /><path d="M102 22 L96 -6 L74 12 Z" /><path d="M24 14 L27 2 L37 11 Z M96 14 L93 2 L83 11 Z" fill="#ff9ccb" /></g>}
      {shape === 'robot' && <g><path d="M60 8 V-4" stroke={colorB} strokeWidth="3" /><circle className="antenna" cx="60" cy="-6" r="4.5" fill={m === 'sos' ? '#ff4d5e' : '#7dffb2'} />
        <rect x="1" y="40" width="8" height="20" rx="3" fill={colorB} /><rect x="111" y="40" width="8" height="20" rx="3" fill={colorB} /></g>}
      {face.accessory === 'headphones' && <path d="M10 50 Q10 -8 60 -8 Q110 -8 110 50" stroke="#2a2a31" strokeWidth="6" fill="none" />}
      {m === 'listen' && <rect x="2" y="2" width="116" height="96" rx="36" fill="none" stroke={colorB} strokeWidth="3" className="pulse-ring" />}
      {/* Voice ripples: rings that grow with how loudly the user speaks. */}
      {m === 'listen' && level > 0.02 && [0, 1].map((k) => (
        <ellipse key={k} className="ripple" cx="60" cy="50" rx={60 + level * (14 + k * 10)} ry={52 + level * (12 + k * 9)} fill="none" stroke={colorB} strokeWidth={2.5 - k} opacity={0.55 - k * 0.2} />
      ))}
      <Body shape={shape} fill={body} stroke={theme === 'dark' ? '#3a3a44' : 'none'} />
      {shape !== 'blob' && shape !== 'orb' && <rect x="16" y="14" width="88" height="26" rx="13" fill="#fff" opacity="0.08" />}
      {eye(42)}
      {eye(78)}
      {shape !== 'robot' && shape !== 'orb' && <><circle cx="30" cy="64" r="6" fill="#ff8fc7" opacity="0.45" /><circle cx="90" cy="64" r="6" fill="#ff8fc7" opacity="0.45" /></>}
      {mouthEl}
      {shape === 'cat' && <g stroke="#fff" strokeWidth="1.6" opacity="0.7" strokeLinecap="round"><path d="M14 62 h14 M15 69 l13 -3 M106 62 h-14 M105 69 l-13 -3" /></g>}
      {face.accessory === 'glasses' && <g stroke="#fff" strokeWidth="2.5" fill="none" opacity="0.9"><circle cx={42 + lookX} cy={44 + lookY} r="14" /><circle cx={78 + lookX} cy={44 + lookY} r="14" /><path d={`M${56 + lookX} ${44 + lookY} h8`} /></g>}
      {face.accessory === 'headphones' && <g fill="#2a2a31"><rect x="0" y="36" width="14" height="30" rx="7" /><rect x="106" y="36" width="14" height="30" rx="7" /></g>}
      {face.accessory === 'shades' && <g>
        <rect x={27 + lookX} y={33 + lookY} width="30" height="20" rx="8" fill="#0b0b10" stroke="#2a2a33" strokeWidth="2" />
        <rect x={63 + lookX} y={33 + lookY} width="30" height="20" rx="8" fill="#0b0b10" stroke="#2a2a33" strokeWidth="2" />
        <path d={`M${57 + lookX} ${40 + lookY} h6 M27 ${40 + lookY} h-14 M93 ${40 + lookY} h14`} stroke="#2a2a33" strokeWidth="3" />
        <path d={`M${32 + lookX} ${38 + lookY} l8 0 M${68 + lookX} ${38 + lookY} l8 0`} stroke="#fff" strokeWidth="2" opacity="0.5" strokeLinecap="round" />
      </g>}
      {m === 'love' && <g className="hearts" fill="#ff6fa8">
        {[[18, 18, 0], [100, 10, 0.4], [60, -6, 0.8]].map(([x, y, d]) => <path key={x} style={{ animationDelay: `${d}s` }} d={`M${x} ${y + 6} l-6 -6 a3.4 3.4 0 0 1 6 -4 a3.4 3.4 0 0 1 6 4 z`} />)}
      </g>}
      {m === 'groove' && <g className="notes" fill="#fff" fontWeight="800"><text x="98" y="16" fontSize="14">♪</text><text x="10" y="22" fontSize="12">♫</text></g>}
      {face.accessory === 'bow' && <g fill="#ff5fa2"><path d="M86 6 L100 -4 L100 16 Z" /><path d="M114 6 L100 -4 L100 16 Z" /><circle cx="100" cy="6" r="4" fill="#ff8cc6" /></g>}
      {m === 'worried' && <g>
        <path d="M31 31 L50 27 M89 31 L70 27" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity="0.9" />
        <path className="sweat" d="M100 22 q5 8 0 11 q-5 -3 0 -11 Z" fill="#9be7ff" />
      </g>}
      {m === 'angry' && <path d="M32 27 L50 33 M88 27 L70 33" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" />}
      {m === 'working' && <g className="gear" transform="translate(101 20)">
        <circle r="6.5" fill="none" stroke="#ffd166" strokeWidth="3" strokeDasharray="3.4 1.7" /><circle r="2" fill="#ffd166" />
      </g>}
      {m === 'typing' && <g className="keys" transform="translate(30 88)">
        {[0, 1, 2, 3, 4, 5].map((k) => <rect key={k} className="key" x={k * 10} y="0" width="8" height="6" rx="1.5" fill="#fff" opacity="0.75" style={{ animationDelay: `${(k * 0.17) % 0.5}s` }} />)}
      </g>}
      {m === 'building' && <g>
        <path d="M30 14 Q60 -14 90 14 Z" fill="#ffd166" stroke="#e0a800" strokeWidth="2" /><rect x="26" y="12" width="68" height="5" rx="2.5" fill="#e0a800" />
        <rect x="30" y="88" width="60" height="5" rx="2.5" fill="#fff" opacity="0.25" /><rect className="progress" x="30" y="88" width="60" height="5" rx="2.5" fill="#7dffb2" />
      </g>}
      {m === 'searching' && <g className="lens"><circle cx="100" cy="66" r="9" fill="#ffffff22" stroke="#fff" strokeWidth="3" /><path d="M106 73 l8 8" stroke="#fff" strokeWidth="4" strokeLinecap="round" /></g>}
      {m === 'checking' && <path className="tick" d="M96 14 l6 6 12 -14" stroke="#7dffb2" strokeWidth="4.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />}
      {m === 'excited' && <g fill="#ffd166"><path d="M10 18 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" /><path d="M108 70 l1.5 4 4 1.5 -4 1.5 -1.5 4 -1.5 -4 -4 -1.5 4 -1.5z" /></g>}
      {m === 'celebrate' && <g>
        <g fill="#ffd166"><path d="M14 10 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3z" /><path d="M104 6 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" /></g>
        {/* Confetti burst */}
        {['#ffd166', '#ff6b9a', '#7dffb2', '#7cc7ff', '#c4a1ff', '#ffd166', '#ff6b9a', '#7dffb2'].map((c, k) => (
          <rect key={k} className="confetti" x={14 + k * 13} y="-10" width="4" height="7" rx="1" fill={c} style={{ animationDelay: `${(k % 4) * 0.12}s` }} />
        ))}
      </g>}
      {m === 'wave' && <g className="wave-hand"><circle cx="108" cy="80" r="9" fill="#ffd6a5" stroke="#fff" strokeWidth="2" /></g>}
      {m === 'think' && <g fill="#fff" opacity="0.8"><circle cx="100" cy="20" r="3" /><circle cx="108" cy="12" r="4.5" /></g>}
      {(m === 'ask' || m === 'curious') && <g>
        <path d="M33 28 Q42 22 51 28 M69 28 Q78 22 87 28" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" />
        {m === 'ask' && <text className="ask-mark" x="104" y="16" fontSize="22" fontWeight="800" fill="#ffd166" textAnchor="middle">?</text>}
      </g>}
      {m === 'sos' && <text className="sos-mark" x="106" y="18" fontSize="24" fontWeight="900" fill="#fff" textAnchor="middle">!</text>}
      {m === 'sleep' && <g fill="#fff" fontWeight="800" className="zzz">
        <text x="96" y="22" fontSize="11">z</text><text x="104" y="12" fontSize="14">z</text><text x="112" y="0" fontSize="17">Z</text>
      </g>}
    </svg>
  );
}
