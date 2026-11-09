// "Speak for me" board logic (as in look-to-speak): the phrases are split into a left and a right half; each glance
// (or the left/right arrow keys, or two switches) keeps one half until a single phrase is left, which Maya says aloud.

export const DEFAULT_PHRASES = [
  'Please give me some water',
  'I am in pain',
  'I need the toilet',
  'Please call Amma',
  'I am cold',
  'I am hungry',
  'Please help me sit up',
  'Yes',
  'No',
  'Thank you',
  'எனக்கு தண்ணீர் வேண்டும்',
  'அம்மாவை கூப்பிடுங்கள்',
];

/** [left, right]: the left half gets the extra phrase. */
export const halves = (list) => { const mid = Math.ceil(list.length / 2); return [list.slice(0, mid), list.slice(mid)]; };

/** The half the user glanced at; a half with nothing in it keeps the list as it is. */
export function narrow(list, side) {
  const [left, right] = halves(list);
  const kept = side === 'left' ? left : right;
  return kept.length ? kept : list;
}
