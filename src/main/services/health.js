// Health breaks: water, 20-20-20 eye breaks and stretching, counted only in minutes the user is actually
// at the computer (idle time resets nothing but does not count).
import { HEALTH_DEFAULTS } from '../tools/student.js';

const MESSAGES = {
  water: ['Water break 💧', 'Time for a glass of water.'],
  eyes: ['Eye break 👀', 'Look at something 20 feet (6 m) away for 20 seconds.'],
  stretch: ['Stretch break 🧘', 'Stand up, roll your shoulders and straighten your back.'],
};

/** Call tick() once a minute. notify(title, body, kind) shows the nudge. */
export function createHealth({ store, idleSeconds, notify, quiet = () => false }) {
  const active = { water: 0, eyes: 0, stretch: 0 };
  return {
    tick() {
      if (idleSeconds() > 120) return; // away from the PC: nothing to count
      const every = store.getSetting('health', HEALTH_DEFAULTS);
      for (const kind of Object.keys(active)) {
        if (!every[kind]) continue;
        active[kind] += 1;
        if (active[kind] < every[kind]) continue;
        active[kind] = 0;
        if (!quiet()) notify(...MESSAGES[kind], 'health');
      }
    },
  };
}
