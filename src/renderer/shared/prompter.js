// Teleprompter maths: find where the reader is in the script from the last words they said.

/** Lower-case words without punctuation. */
export const words = (text) => text.toLowerCase().replace(/[’']/g, '').match(/[\p{L}\p{N}]+/gu) || [];

/**
 * The script position (index of the next word to read) after the words just heard, searching from `from`
 * up to `ahead` words further. Returns `from` when nothing matches well enough (2+ of the last words).
 */
export function align(script, heard, from = 0, ahead = 80) {
  const tail = heard.slice(-6);
  if (!tail.length) return from;
  let best = { score: 1, at: from };
  for (let end = from; end < Math.min(script.length, from + ahead); end++) {
    // How many of the heard words appear, in order, in the stretch of script ending here.
    let score = 0, j = end;
    for (let k = tail.length - 1; k >= 0 && j >= Math.max(0, end - 9); k--) {
      let found = -1;
      for (let s = j; s >= Math.max(0, end - 9); s--) if (script[s] === tail[k]) { found = s; break; }
      if (found >= 0) { score++; j = found - 1; }
    }
    if (score > best.score) best = { score, at: end + 1 };
  }
  return best.at;
}
