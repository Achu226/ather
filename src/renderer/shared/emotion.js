// How the user seems to feel, from their words, so Maya's face can react before it answers.
// Returns a face mood or null. Instant and offline; covers English, Hinglish and Tanglish phrases.

const RULES = [
  ['worried', /\b(stress(ed)?|tension|tense|worried|anxious|anxiety|panic(king)?|overwhelm(ed|ing)?|too much (work|to do)|so much (work|to do)|deadline (is )?(today|tomorrow)|exam (is )?(today|tomorrow)|no time|help me please|bahut tension|tension ho|kya karu|bayama irukku|romba tension)\b/i],
  ['sad', /\b(sad|depressed|lonely|crying|cry|upset|heart ?broken|failed|feel(ing)? (low|bad|down)|bad day|give up|giving up|miss (her|him|them|home)|dukhi|kashtam)\b/i],
  ['angry', /\b(angry|annoyed|frustrat(ed|ing)|irritat(ed|ing)|hate (this|it)|so done|ugh+|wtf|not working again|gussa)\b/i],
  ['love', /\b(love you|you'?re the best|thank you so much|thanks a lot|you'?re amazing|best (assistant|buddy)|i like you)\b/i],
  ['excited', /\b(yay+|woo+h*o*|awesome|amazing news|great news|i passed|got (the|a) (job|internship|offer)|we won|i won|so happy|so excited|can'?t wait|let'?s go+|semma|mast)\b|!{3,}/i],
  ['sleepy', /\b(sleepy|tired|exhausted|so late|can'?t sleep|good ?night|neend)\b/i],
];

/** Count separate requests in one message ("do X, Y and also Z" → 3). */
export function countRequests(text) {
  return text.split(/[,;\n]|\band (also |then )?(?=(add|remind|make|create|send|book|call|finish|write|buy|study|open|schedule|set|plan|check|email|pay)\b)|\balso\b|\bthen\b/i)
    .filter((part) => part && /\b(add|remind|make|create|send|book|call|finish|write|buy|study|open|schedule|set|plan|check|email|pay|submit|prepare|clean)\b/i.test(part)).length;
}

export function detectEmotion(text) {
  if (!text) return null;
  for (const [mood, pattern] of RULES) if (pattern.test(text)) return mood;
  // Piling on many things at once is stressful: Maya looks a little tense, then gets to work.
  if (countRequests(text) >= 3) return 'worried';
  return null;
}

/** The face to show after answering someone who felt this way. */
export const afterFeeling = (mood) => ({ worried: 'love', sad: 'love', angry: 'happy', excited: 'celebrate', love: 'love', sleepy: 'sleepy' }[mood] || 'happy');
