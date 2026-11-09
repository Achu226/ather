// Switch scanning, for people who can press only one button (or make one sound): controls light up in turn and a
// press picks the lit one. Groups of controls come first (fewer waits), then the controls of the chosen group,
// then a "back" step to return to the groups. Pure, so it is unit tested.

export function createScanner(items, { size = 8 } = {}) {
  const groups = [];
  for (let k = 0; k < items.length; k += size) groups.push(items.slice(k, k + size));
  let level = groups.length > 1 ? 'group' : 'item', g = 0, i = 0;
  return {
    /** What is lit now: the controls of a group, one control, or [] with back = true. */
    get lit() {
      if (!groups.length) return { items: [], back: false };
      if (level === 'group') return { items: groups[g], back: false };
      return i === groups[g].length ? { items: [], back: true } : { items: [groups[g][i]], back: false };
    },
    next() {
      if (!groups.length) return;
      if (level === 'group') g = (g + 1) % groups.length;
      else i = (i + 1) % (groups[g].length + (groups.length > 1 ? 1 : 0)); // the back step only when there are groups
    },
    /** The switch was pressed: returns the chosen control, or null when it moved into or out of a group. */
    press() {
      if (!groups.length) return null;
      if (level === 'group') { level = 'item'; i = 0; return null; }
      if (i === groups[g].length) { level = 'group'; g = 0; return null; }
      const chosen = groups[g][i];
      level = groups.length > 1 ? 'group' : 'item'; g = 0; i = 0;
      return chosen;
    },
  };
}
