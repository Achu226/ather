// Dictation clean-up, like a careful typist: drop "um"s, follow spoken corrections ("ten, actually fifteen"),
// and turn spoken punctuation and "bullet point" into real text. 'polished' also lets the local AI fix small slips.

const NUMBER = String.raw`(?:\d+(?:[.:]\d+)?|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|sixty|hundred|half)`;
const SPOKEN = [
  [/\s*\b(?:new paragraph)\b[,.]?\s*/gi, '\n\n'],
  [/\s*\b(?:new line|next line)\b[,.]?\s*/gi, '\n'],
  [/\s*\b(?:bullet point|bullet|next bullet)\b[,.:]?\s*/gi, '\n- '],
  [/\s*\b(?:full stop|period)\b/gi, '.'],
  [/\s*\bcomma\b/gi, ','],
  [/\s*\bquestion mark\b/gi, '?'],
  [/\s*\bexclamation (?:mark|point)\b/gi, '!'],
  [/\s*\bcolon\b/gi, ':'],
  [/\s*\bsemicolon\b/gi, ';'],
];

/** Rule-based clean-up (no AI): fast and predictable. Exported for tests. */
export function cleanDictation(text) {
  let s = ` ${text} `;
  // Fillers, with the comma Whisper often puts after them.
  s = s.replace(/[\s,]*\b(?:um+|uh+|uhm|erm|er|ah+|hmm+|mm+)\b[,.]?(?=\s)/gi, ' ');
  // "about ten, actually fifteen minutes" / "ten, no, make that fifteen" → the corrected number.
  s = s.replace(new RegExp(String.raw`\b${NUMBER}[,.]?\s+(?:actually|sorry|no|i mean)[,.]?\s+(?:make (?:it|that)\s+)?(${NUMBER})\b`, 'gi'), '$1');
  // "on Tuesday, actually make that Wednesday" → "on Wednesday"
  s = s.replace(/\b[\w'-]+[,.]?\s+(?:actually|sorry|no|i mean)[,.]?\s+make (?:it|that)\s+([\w'-]+)/gi, '$1');
  for (const [said, mark] of SPOKEN) s = s.replace(said, mark);
  s = s
    .replace(/[ \t]+([,.!?;:])/g, '$1') // no space before punctuation
    .replace(/([,.!?;:])(?=[^\s\d"')\]])/g, '$1 ') // one space after it
    .replace(/([.!?]){2,}/g, '$1')
    .replace(/,([.!?])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .trim();
  // Capital letter at the start of each sentence, line and list item.
  s = s.replace(/(^|[.!?]\s+|\n-?\s*)([a-z])/g, (_, before, c) => before + c.toUpperCase());
  return s.replace(/^-\s/, '- ').replace(/^\n+/, '');
}

/**
 * Turn what Whisper heard into the text to type. style: 'raw' | 'clean' (default) | 'polished'.
 * complete(prompt) is the local model; if it fails or rewrites too much, the clean text is used.
 */
export async function finishDictation(text, style = 'clean', complete = null) {
  if (!text || style === 'raw') return text;
  const clean = cleanDictation(text);
  if (style !== 'polished' || !complete) return clean;
  try {
    const out = (await complete(`Fix only clear spelling, grammar and punctuation mistakes in this dictated text. Keep the same words, meaning, tone and line breaks. Do not add or answer anything. Reply with the corrected text only.\n\n${clean}`)).trim().replace(/^"|"$/g, '');
    // A rewrite that changes length a lot is not "fixing slips": keep the user's own words.
    return out && Math.abs(out.length - clean.length) <= Math.max(12, clean.length * 0.25) ? out : clean;
  } catch {
    return clean;
  }
}
