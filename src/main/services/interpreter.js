// Interpreter mode: two people talk, Maya says each sentence in the other language (English ↔ another language).
// Whisper hears either language; which way to translate follows from the script of what was heard.
import { scriptLanguage } from './sapi.js';

// Languages whose script tells them apart from English (Maya speaks Tamil itself; the others use a Windows voice if installed).
export const INTERPRETER_LANGUAGES = { ta: 'Tamil', hi: 'Hindi', te: 'Telugu', bn: 'Bengali', ar: 'Arabic', ru: 'Russian', ja: 'Japanese', ko: 'Korean', zh: 'Chinese' };

/** Which way to translate what was heard. Exported for tests. */
export const direction = (heard, lang) => (scriptLanguage(heard) === lang ? { from: lang, to: 'en' } : { from: 'en', to: lang });

// Common English words: Whisper sometimes writes Tamil/Hindi speech in English letters ("Varya maruthuva…").
const ENGLISH = new Set(`the a an and or but is are was were be been am i you he she it we they me my your his her our their this that these those
what where when why how who which whom whose do does did done have has had not no yes can could will would shall should may might must
to of in on at for from with by about as into over after before up down out off again here there now then very so just also please thank
thanks hello hi sorry okay ok go come get give take make know think want need help like see look find call tell say said let one two three
some any all more most much many good bad big small near nearest far today tomorrow time day night home bus train hospital doctor water
food money where's what's i'm it's don't can't won't let's`.split(/\s+/));
/** Share of words that are common English words (0..1). Exported for tests. */
export const englishShare = (text) => {
  const words = (text.toLowerCase().match(/[a-z']+/g) || []);
  return words.length ? words.filter((w) => ENGLISH.has(w)).length / words.length : 0;
};

/** One turn: audio → { heard, said, from, to }. ml transcribes, complete(prompt) translates. */
export async function interpretTurn(audio, lang, { ml, complete }) {
  let heard = await ml.call('transcribe', audio, null); // auto-detect the language
  if (!heard) return null;
  // Not the other script and hardly any English words: it was the other language written in English letters.
  const spokeOther = scriptLanguage(heard) === lang || englishShare(heard) < 0.25;
  // Listen again in that language (the dedicated Tamil listener for Tamil) to get its own script.
  if (spokeOther) heard = (await ml.call('transcribe', audio, lang).catch(() => '')) || heard;
  const { from, to } = spokeOther ? { from: lang, to: 'en' } : { from: 'en', to: lang };
  const target = to === 'en' ? 'English' : INTERPRETER_LANGUAGES[to];
  const said = (await complete(`Translate into natural spoken ${target}${to === 'en' ? '' : ` written in ${target} script`}. Keep the meaning, names and numbers. Reply with the translation only.\n\n${heard}`))
    .trim().replace(/^["“]|["”]$/g, '');
  return { heard, said, from, to };
}
