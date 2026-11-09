// "Any pill, any eyes" colour maths (no browser needed, so it is unit tested).

const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const hsl = (h, s, l) => {
  l /= 100; const a = (s / 100) * Math.min(l, 1 - l);
  const f = (n) => { const k = (n + h / 30) % 12; return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, '0'); };
  return `#${f(0)}${f(8)}${f(4)}`;
};

/**
 * Three 0..1 sliders. pill: 0 = black/grey, then the colour wheel; shade: 0 = bright … 1 = deep (for grey: black … white);
 * eyes: 0 = automatic (white, or dark on a light pill), then the colour wheel. ink = the text colour that reads on the pill.
 */
export function customColors({ pill = 0, shade = 0, eyes = 0 } = {}) {
  const grey = pill < 0.03;
  const h = Math.round(((pill - 0.03) / 0.97) * 360);
  const a = grey ? hsl(0, 0, 2 + shade * 88) : hsl(h, 78, 60 - shade * 48);
  const b = grey ? hsl(0, 0, Math.min(96, 12 + shade * 80)) : hsl((h + 22) % 360, 80, Math.max(6, 52 - shade * 44));
  const light = luminance(a) > 0.4;
  return { a, b, eyes: eyes < 0.03 ? (light ? '#141418' : '#ffffff') : hsl(Math.round(((eyes - 0.03) / 0.97) * 360), 95, 70), ink: light ? '#141418' : '#ffffff' };
}

/** CSS gradients for the slider tracks: what each slider would look like at every position. */
export const sliderTrack = (fn, steps = 24) => `linear-gradient(90deg, ${Array.from({ length: steps + 1 }, (_, k) => fn(k / steps)).join(', ')})`;
