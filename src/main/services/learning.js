// Learning from the user, all on this PC: words Maya keeps mishearing, and what the user liked or did not like.
import { now } from '../store.js';
import { looksLikePassword } from './clipboard.js';

const MAX_WORDS = 300;
const clean = (w) => String(w).toLowerCase().replace(/[^\p{L}\p{N}' -]/gu, '').trim();
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** What the user said, with the words Maya learned to fix ("mya" → "Maya"). */
export function fixHeard(store, text) {
  let out = String(text || '');
  for (const [heard, meant] of Object.entries(store.getSetting('learnedWords', {}))) {
    out = out.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escape(heard)}(?![\\p{L}\\p{N}])`, 'giu'), meant);
  }
  return out;
}

export function learnWord(store, heard, meant) {
  const h = clean(heard), m = String(meant || '').trim();
  if (!h || !m || h === m.toLowerCase() || h.length > 40 || m.length > 40) return { learned: false };
  const words = { ...store.getSetting('learnedWords', {}), [h]: m };
  const keys = Object.keys(words);
  if (keys.length > MAX_WORDS) delete words[keys[0]]; // oldest first
  store.setSetting('learnedWords', words);
  return { learned: true, heard: h, meant: m };
}

/**
 * The user fixed a transcription before sending it: one or two changed words are learned
 * (more than that is a rewrite, not a mishearing). Exported for tests.
 */
export function wordFixes(heard, sent) {
  const a = String(heard).trim().split(/\s+/), b = String(sent).trim().split(/\s+/);
  if (a.length !== b.length || a.length > 40) return [];
  const pairs = a.map((w, i) => [clean(w), b[i].replace(/[.,!?;:]+$/, '')]).filter(([h, m]) => h && clean(m) && h !== clean(m));
  return pairs.length && pairs.length <= 2 ? pairs : [];
}

const words = (s) => new Set(String(s).toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []);
/** A new fact is a repeat when most of its words are already in one saved fact (exported for tests). */
export function knownFact(fact, saved) {
  const w = words(fact);
  return saved.some((s) => { const o = words(s); const shared = [...w].filter((x) => o.has(x)).length; return w.size && shared / w.size >= 0.7; });
}

/**
 * After each exchange Maya thinks back: lasting facts about the user it heard are saved, so it does not forget.
 * complete(prompt, opts) is the local model; secrets and repeats are never saved.
 */
export async function reflect(store, question, answer, complete) {
  if (String(question).trim().split(/\s+/).length < 4 || looksLikePassword(question)) return [];
  const raw = await complete(`Read this exchange between a user and their assistant Maya.\nUser: ${String(question).slice(0, 1500)}\nMaya: ${String(answer).slice(0, 800)}\n\n`
    + 'List lasting facts about the USER worth remembering in future chats: who they are, people in their life, preferences, plans, dates, goals, health needs. '
    + 'Not small talk, not questions, not facts about Maya or the world, never passwords or codes. At most 3 facts, each under 15 words, third person ("Has a brother named Rahul"). Reply as JSON.',
  { format: { type: 'object', required: ['facts'], properties: { facts: { type: 'array', items: { type: 'string' } } } } });
  let facts = [];
  try { facts = JSON.parse(raw).facts || []; } catch { return []; }
  const saved = store.all('SELECT fact FROM memories WHERE deleted = 0').map((m) => m.fact);
  const kept = [];
  const secret = (x) => /\b(password|passcode|pin|otp|cvv|card number)\b/i.test(x) || x.split(/\s+/).some(looksLikePassword);
  for (const f of facts.map((x) => String(x).trim()).filter((x) => x.length > 5 && x.length < 160 && !secret(x))) {
    if (knownFact(f, [...saved, ...kept])) continue;
    store.insert('memories', { fact: f, category: 'fact', created_at: now(), updated_at: now() }, 'Remembered from the conversation');
    kept.push(f);
  }
  return kept;
}

/** 👍 counts; 👎 with a note becomes a preference Maya follows from now on. */
export function saveFeedback(store, { question = '', good, note = '' }) {
  const log = store.getSetting('feedback', { good: 0, bad: 0 });
  store.setSetting('feedback', { ...log, [good ? 'good' : 'bad']: (log[good ? 'good' : 'bad'] || 0) + 1 });
  if (good || !note.trim()) return { saved: true };
  // Kept general: a 👎 note ("shorter answers") is about how Maya answers, not only that one question.
  const fact = `How the user wants answers: ${note.trim().slice(0, 200)} (said after "${question.slice(0, 60)}")`;
  store.insert('memories', { fact, category: 'preference', created_at: now(), updated_at: now() }, 'Learned from feedback');
  return { saved: true, learned: fact };
}
