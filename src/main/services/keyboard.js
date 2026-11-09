// Word suggestions for the on-screen keyboard: common English words plus the words this user types (English or Tamil).
// Typing one letter at a time is slow with a head mouse; picking a suggestion saves most of the presses.
import { looksLikePassword } from './clipboard.js';

const COMMON = (`the be to of and a in that have i it for not on with he as you do at this but his by from they we say her she or
an will my one all would there their what so up out if about who get which go me when make can like time no just him know take
people into year your good some could them see other than then now look only come its over think also back after use two how our
work first well way even new want because any these give day most us is was are has had am been please thank thanks hello hi yes
okay ok sorry help call send message mom dad amma appa friend today tomorrow tonight morning evening night meeting class exam study
college school homework assignment project report notes book read write open close search find show tell where when why water food
eat lunch dinner breakfast medicine doctor hospital pain tired sleep home office phone email whatsapp youtube google chrome video
music play stop pause next later soon minutes hours late early coming going waiting reached done ready happy fine love bye`).split(/\s+/);
const MAX_LEARNED = 600;

export function createKeyboard({ store }) {
  return {
    /** Up to 3 words that start with what has been typed of the current word. */
    suggest(prefix) {
      const p = String(prefix || '').toLowerCase();
      if (!p) return [];
      const learned = Object.entries(store.getSetting('kbWords', {})).filter(([w]) => w.startsWith(p) && w !== p)
        .sort((a, b) => b[1] - a[1]).map(([w]) => w);
      return [...new Set([...learned, ...COMMON.filter((w) => w.startsWith(p) && w !== p)])].slice(0, 3);
    },
    /** Remember a finished word, unless it could be a password, a code or a number. */
    learn(word) {
      const w = String(word || '').toLowerCase().trim();
      if (w.length < 2 || w.length > 30 || looksLikePassword(word) || /\d/.test(w)) return false;
      const words = store.getSetting('kbWords', {});
      words[w] = (words[w] || 0) + 1;
      const kept = Object.entries(words).sort((a, b) => b[1] - a[1]).slice(0, MAX_LEARNED);
      store.setSetting('kbWords', Object.fromEntries(kept));
      return true;
    },
  };
}
