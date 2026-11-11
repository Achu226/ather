// Head mouse maths: face landmarks → cursor position, face expressions → clicks. Pure, so it is unit tested.

// MediaPipe face mesh indices.
const NOSE = 1, LEFT_EYE = 33, RIGHT_EYE = 263, FOREHEAD = 10, CHIN = 152;

/** Where the head points: nose offset from between the eyes, scaled by face size (0,0 ≈ looking at the camera). */
export function headDirection(lm) {
  const midX = (lm[LEFT_EYE].x + lm[RIGHT_EYE].x) / 2, midY = (lm[LEFT_EYE].y + lm[RIGHT_EYE].y) / 2;
  const eyes = Math.hypot(lm[RIGHT_EYE].x - lm[LEFT_EYE].x, lm[RIGHT_EYE].y - lm[LEFT_EYE].y) || 1;
  const height = Math.hypot(lm[CHIN].x - lm[FOREHEAD].x, lm[CHIN].y - lm[FOREHEAD].y) || 1;
  return { x: (lm[NOSE].x - midX) / eyes, y: (lm[NOSE].y - midY) / height };
}

/**
 * Turns head directions into a smooth cursor position (0..1 of the screen).
 * The first `calibrate` frames set "straight ahead" = screen centre. speed 1 = normal.
 * Smoothing adapts (like the One Euro filter): tiny moves (head tremor) are smoothed hard, so the cursor stays still;
 * big moves follow almost at once, so it never lags. A fixed `smooth` (0..1) turns that off.
 */
const adaptive = (d) => Math.min(0.85, 0.15 + d * 10);
export function createPointer({ speed = 1, smooth = null, calibrate = 15 } = {}) {
  let neutral = null, samples = [], pos = { x: 0.5, y: 0.5 };
  return {
    recenter() { neutral = null; samples = []; pos = { x: 0.5, y: 0.5 }; },
    get calibrating() { return !neutral; },
    update(dir) {
      if (!neutral) {
        samples.push(dir);
        if (samples.length >= calibrate) neutral = { x: samples.reduce((a, s) => a + s.x, 0) / samples.length, y: samples.reduce((a, s) => a + s.y, 0) / samples.length };
        return pos;
      }
      // The camera image is mirrored: turning right moves the nose left in the picture.
      const target = { x: 0.5 - (dir.x - neutral.x) * 3.2 * speed, y: 0.5 + (dir.y - neutral.y) * 5 * speed };
      const clamp = (v) => Math.min(1, Math.max(0, v));
      const a = smooth ?? adaptive(Math.hypot(target.x - pos.x, target.y - pos.y));
      pos = { x: clamp(pos.x + (target.x - pos.x) * a), y: clamp(pos.y + (target.y - pos.y) * a) };
      return pos;
    },
  };
}

/** Extra face gestures (as in Project Gameface) and how to tell them from the face's blendshape scores. */
export const FACE_GESTURES = [
  ['browUp', 'Raise eyebrows', (s) => (s.browInnerUp ?? 0) > 0.5],
  ['mouthLeft', 'Mouth to the left', (s) => (s.mouthLeft ?? 0) > 0.45],
  ['mouthRight', 'Mouth to the right', (s) => (s.mouthRight ?? 0) > 0.45],
  ['pucker', 'Pucker lips (kiss)', (s) => (s.mouthPucker ?? 0) > 0.6 && (s.jawOpen ?? 0) < 0.2],
];
/** What a gesture can do (services/pc.js faceAction carries them out). */
export const FACE_ACTIONS = [['none', 'Nothing'], ['click', 'Click'], ['right', 'Right-click'], ['double', 'Double-click'],
  ['scrollUp', 'Scroll up'], ['scrollDown', 'Scroll down'], ['enter', 'Enter'], ['escape', 'Esc'], ['tab', 'Tab']];

/**
 * The user's chosen face gestures → actions: each fires once per gesture held `hold` ms, at most once per `cooldown`.
 * Gestures set to "none" (the default) are ignored, so ordinary expressions never act on their own.
 */
export function createFaceActions({ map = {}, hold = 300, cooldown = 800 } = {}) {
  const used = FACE_GESTURES.filter(([k]) => map[k] && map[k] !== 'none');
  const since = {}, fired = {};
  let last = -Infinity;
  return (s, t) => {
    let action = null;
    for (const [k, , on] of used) {
      if (!on(s)) { since[k] = null; fired[k] = false; continue; }
      since[k] ??= t;
      if (!action && !fired[k] && t - since[k] >= hold && t - last >= cooldown) { fired[k] = true; last = t; action = map[k]; }
    }
    return action;
  };
}

/**
 * Glance (as in "look to speak"): a deliberate head turn left or right, held for `hold` ms, gives 'left' or 'right' once.
 * Small moves (under `amp` from the calibrated straight-ahead) and quick twitches do nothing; the head must come back
 * near the centre before the next glance counts.
 */
export function createGlance({ amp = 0.08, hold = 350, calibrate = 15 } = {}) {
  let neutral = null, samples = [], side = null, since = 0, armed = true;
  return (dir, t) => {
    if (neutral === null) {
      samples.push(dir.x);
      if (samples.length >= calibrate) neutral = samples.reduce((a, b) => a + b, 0) / samples.length;
      return null;
    }
    const d = dir.x - neutral;
    if (Math.abs(d) < amp / 2) { armed = true; side = null; return null; }
    // The camera image is mirrored: turning right moves the nose left in the picture.
    const now = d <= -amp ? 'right' : d >= amp ? 'left' : null;
    if (!now || !armed) { if (!now) side = null; return null; }
    if (now !== side) { side = now; since = t; return null; }
    if (t - since < hold) return null;
    armed = false; side = null;
    return now;
  };
}

/**
 * Dwell click, for people who cannot open their mouth on purpose: hold the pointer still for `ms` and it clicks once.
 * It must move away (more than `radius` of the screen) before it can click again. progress 0..1 draws the ring.
 */
export function createDwell({ ms = 1000, radius = 0.015 } = {}) {
  let anchor = null, since = 0, done = false;
  return (p, t) => {
    if (!anchor || Math.hypot(p.x - anchor.x, p.y - anchor.y) > radius) { anchor = p; since = t; done = false; return { progress: 0, click: false }; }
    if (done) return { progress: 0, click: false };
    const progress = Math.min(1, (t - since) / ms);
    done = progress >= 1;
    return { progress, click: done };
  };
}

/**
 * Nod = yes, shake = no (answering approval cards without speaking or clicking): the head swings past `amp`
 * and back at least 3 times within `ms` (down-up-down, or left-right-left). Returns 'yes', 'no' or null.
 */
export function createHeadGesture({ amp = 0.05, ms = 1600, swings = 3 } = {}) {
  let hist = [], last = -Infinity;
  const count = (k) => {
    let n = 0, dir = 0, ref = hist[0][k];
    for (const h of hist) {
      const d = h[k] - ref;
      if (Math.abs(d) > amp && Math.sign(d) !== dir) { n++; dir = Math.sign(d); ref = h[k]; } else if (Math.sign(d) === dir && Math.abs(d) > 0) ref = dir > 0 ? Math.max(ref, h[k]) : Math.min(ref, h[k]);
    }
    return n;
  };
  return (p, t) => {
    hist.push({ t, x: p.x, y: p.y });
    hist = hist.filter((h) => t - h.t <= ms);
    if (t - last < 1500 || hist.length < 5) return null;
    const y = count('y'), x = count('x');
    const g = y >= swings && y > x ? 'yes' : x >= swings && x > y ? 'no' : null;
    if (g) { last = t; hist = []; }
    return g;
  };
}

/**
 * Blink to click, for people who can barely move their head: eyes closed `hold` ms or longer = left click,
 * `long` ms or longer = right click, decided when the eyes open again. Natural blinks (well under `hold`) do nothing.
 * freeze: the pointer stays put while the eyes are closed, so the click lands where you were looking.
 */
export function createBlink({ hold = 450, long = 1500, closed = 0.5 } = {}) {
  let since = null;
  return (s, t) => {
    const shut = (s.eyeBlinkLeft ?? 0) > closed && (s.eyeBlinkRight ?? 0) > closed;
    if (shut) { since ??= t; return { click: null, freeze: t - since > 150 }; }
    const d = since === null ? 0 : t - since;
    since = null;
    return { click: d >= long ? 'right' : d >= hold ? 'left' : null, freeze: false };
  };
}

/**
 * Expressions → clicks: open mouth = left click, big smile = right click.
 * An expression must be held `hold` ms, fires once, and must be released before it can fire again.
 * While the mouth is opening the cursor should stay still (`freeze`), so the click lands where you aimed.
 */
export function createGestures({ hold = 220, cooldown = 700 } = {}) {
  const since = {}, fired = {};
  let last = -Infinity;
  return (s, t) => {
    const active = {
      left: (s.jawOpen ?? 0) > 0.45,
      right: (((s.mouthSmileLeft ?? 0) + (s.mouthSmileRight ?? 0)) / 2) > 0.65 && (s.jawOpen ?? 0) < 0.3,
    };
    let click = null;
    for (const k of Object.keys(active)) {
      if (!active[k]) { since[k] = null; fired[k] = false; continue; }
      since[k] ??= t;
      if (!fired[k] && t - since[k] >= hold && t - last >= cooldown) { fired[k] = true; last = t; click = k; }
    }
    return { click, freeze: (s.jawOpen ?? 0) > 0.2 || active.right };
  };
}
