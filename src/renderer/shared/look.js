// Theme (light/dark) and face style, shared by every component in a window.
import { useEffect, useState } from 'react';
import { customColors } from './colors.js';

export { customColors };

export const FACE_COLORS = {
  purple: ['#6c5cff', '#a35cff'],
  midnight: ['#0d0d10', '#2c2c33'],
  mint: ['#12b886', '#38d9a9'],
  pink: ['#f06595', '#ff8cc6'],
  ocean: ['#1c7ed6', '#22b8cf'],
  sunset: ['#f76707', '#fa5252'],
};
export const DEFAULT_FACE = { color: 'auto', eyes: 'tall', accessory: 'none', shape: 'classic', liveliness: 'normal' };

// The main process decides light/dark (Windows setting or the user's choice) and tells every window.
let state = { theme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light', face: DEFAULT_FACE };
const subscribers = new Set();

/** "auto" = purple in light theme, black in dark theme; "custom" = the sliders. */
export const faceColors = (face, theme) => {
  if (face.color === 'custom') { const c = customColors(face.custom); return [c.a, c.b]; }
  return FACE_COLORS[face.color] || (theme === 'dark' ? FACE_COLORS.midnight : FACE_COLORS.purple);
};
/** Eye colour and text colour for the pill. */
export const faceInk = (face) => (face.color === 'custom' ? customColors(face.custom) : { eyes: '#ffffff', ink: '#ffffff' });

function apply(patch) {
  state = { ...state, ...patch };
  const root = document.documentElement;
  root.dataset.theme = state.theme;
  const [a, b] = faceColors(state.face, state.theme);
  root.style.setProperty('--face-a', a);
  root.style.setProperty('--face-b', b);
  root.style.setProperty('--face-ink', faceInk(state.face).ink);
  root.style.setProperty('--face-eyes', faceInk(state.face).eyes);
  subscribers.forEach((fn) => fn(state));
}

apply({});
// Animation intensity: full | subtle | off; the Windows "reduce animations" setting always means off.
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const applyMotion = (value) => { document.documentElement.dataset.motion = reduced.matches ? 'off' : value || 'full'; };
window.ather.getSetting('motion', 'full').then(applyMotion);
// Large and high-contrast mode (Accessibility page).
const applyLarge = (on) => { document.documentElement.dataset.a11y = on ? 'large' : ''; };
window.ather.getSetting('a11yLarge', false).then(applyLarge);
window.ather.onSettingsChanged((key, value) => { if (key === 'a11yLarge') applyLarge(value); });
window.ather.onSettingsChanged((key, value) => { if (key === 'motion') applyMotion(value); });
// The user's own look (My Maya / "make the text bigger"): accent colour, text size, spacing.
const applyUi = (ui = {}) => {
  const root = document.documentElement;
  for (const v of ['--accent', '--accent-2', '--accent-ink']) ui.accent ? root.style.setProperty(v, ui.accent) : root.style.removeProperty(v);
  root.style.setProperty('--ui-zoom', ui.fontScale || 1);
  root.dataset.density = ui.density || 'comfortable';
};
window.ather.getSetting('ui', {}).then(applyUi);
window.ather.onSettingsChanged((key, value) => { if (key === 'ui') applyUi(value || {}); });

window.ather.themeResolved().then((theme) => apply({ theme }));
window.ather.onThemeChanged((theme) => apply({ theme }));
window.ather.getSetting('faceStyle', DEFAULT_FACE).then((face) => apply({ face: { ...DEFAULT_FACE, ...face } }));
window.ather.onSettingsChanged((key, value) => { if (key === 'faceStyle') apply({ face: { ...DEFAULT_FACE, ...value } }); });

export function useLook() {
  const [s, setS] = useState(state);
  useEffect(() => { subscribers.add(setS); return () => subscribers.delete(setS); }, []);
  return s;
}
