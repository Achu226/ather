// On-screen keyboard for people who type with a head mouse, dwell clicks or a switch. Keys go to the app with the focus
// (this window never takes it). English and Tamil layouts, word suggestions, and an SOS key.
import { createRoot } from 'react-dom/client';
import { useEffect, useRef, useState } from 'react';

const LAYOUTS = {
  en: [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', "'"],
    ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '?'],
  ],
  ta: [
    ['அ', 'ஆ', 'இ', 'ஈ', 'உ', 'ஊ', 'எ', 'ஏ', 'ஐ', 'ஒ', 'ஓ', 'ஔ'],
    ['க', 'ங', 'ச', 'ஞ', 'ட', 'ண', 'த', 'ந', 'ப', 'ம', 'ய', 'ர'],
    ['ல', 'வ', 'ழ', 'ள', 'ற', 'ன', 'ஜ', 'ஷ', 'ஸ', 'ஹ', 'ஃ', '?'],
    ['ா', 'ி', 'ீ', 'ு', 'ூ', 'ெ', 'ே', 'ை', 'ொ', 'ோ', 'ௌ', '்'],
  ],
};
const ENDS_WORD = /[\s,.?!]/;

function Keyboard() {
  const [layout, setLayout] = useState(new URLSearchParams(location.search).get('layout') === 'ta' ? 'ta' : 'en');
  const [shift, setShift] = useState(false);
  const [word, setWord] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [hit, setHit] = useState(null);
  const wordRef = useRef('');

  useEffect(() => { window.ather.keyboardSuggest(word).then(setSuggestions).catch(() => setSuggestions([])); }, [word]);
  const setW = (w) => { wordRef.current = w; setWord(w); };
  const flash = (k) => { setHit(k); setTimeout(() => setHit(null), 150); };

  async function type(ch) {
    flash(ch);
    const text = shift ? ch.toUpperCase() : ch;
    await window.ather.keyboardKey({ text });
    if (shift) setShift(false);
    if (ENDS_WORD.test(ch)) { window.ather.keyboardLearn(wordRef.current); setW(''); } else setW(wordRef.current + text);
  }
  async function keys(combo, label) {
    flash(label);
    await window.ather.keyboardKey({ keys: combo });
    if (combo === 'backspace') setW(wordRef.current.slice(0, -1));
    else if (combo === 'enter') { window.ather.keyboardLearn(wordRef.current); setW(''); } else setW('');
  }
  async function pick(s) {
    await window.ather.keyboardKey({ text: `${s.slice(wordRef.current.length)} ` });
    window.ather.keyboardLearn(s);
    setW('');
  }
  const k = (label, onClick, cls = '') => <button key={label} className={`${cls} ${hit === label ? 'hit' : ''}`} onClick={onClick} aria-label={label}>{label}</button>;

  return (
    <div className="kb">
      <div className="top">
        {[0, 1, 2].map((i) => <button key={i} className="sugg" onClick={() => suggestions[i] && pick(suggestions[i])}>{suggestions[i] || ''}</button>)}
        {k(layout === 'en' ? 'தமிழ்' : 'ABC', () => setLayout(layout === 'en' ? 'ta' : 'en'), 'tool')}
        {k('SOS', () => window.ather.sosTrigger('pressed SOS on the on-screen keyboard'), 'tool sos')}
        {k('✕', () => window.ather.keyboardSet(false), 'tool')}
      </div>
      {LAYOUTS[layout].map((row, r) => (
        <div className="row" key={`${layout}${r}`}>
          {r === 3 && layout === 'en' && k('⇧', () => setShift(!shift), `wide ${shift ? 'on' : ''}`)}
          {row.map((ch) => k(shift && layout === 'en' ? ch.toUpperCase() : ch, () => type(ch)))}
          {r === 3 && k('⌫', () => keys('backspace', '⌫'), 'wide')}
        </div>
      ))}
      <div className="row">
        {k('Ctrl+Z', () => keys('ctrl+z', 'Ctrl+Z'), 'tool')}
        {k('Copy', () => keys('ctrl+c', 'Copy'), 'tool')}
        {k('Paste', () => keys('ctrl+v', 'Paste'), 'tool')}
        {k('Space', () => type(' '), 'space')}
        {k('⏎', () => keys('enter', '⏎'), 'wide')}
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Keyboard />);
