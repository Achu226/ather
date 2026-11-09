// Speaking replies: Kokoro for Latin-script text, Windows voices for other alphabets.
import { allPersonalities } from './personality.js';
import { scriptLanguage, sapiSpeak } from './services/sapi.js';
import { downloadFile } from './ml/catalog.js';

/** Remove markdown, links and emoji that sound odd when read aloud. */
export const speakable = (text) => text
  .replace(/```[\s\S]*?```/g, ' ')
  .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
  .replace(/https?:\/\/\S+/g, 'the link')
  .replace(/[*_#>`~|]/g, '')
  .replace(/\p{Extended_Pictographic}/gu, '')
  .replace(/\s+/g, ' ')
  .trim();

export const OPENAI_VOICES = ['nova', 'alloy', 'shimmer', 'coral', 'sage', 'echo', 'onyx', 'fable', 'ash', 'ballad'];

/**
 * OpenAI's voices (the ones ChatGPT uses) with the user's own key, from AI models. Paid per use; the text goes
 * to OpenAI. Raw 24 kHz 16-bit audio becomes samples the player understands.
 */
export async function openaiSpeak(text, { providers, voice = 'nova', speed = 1 }) {
  const p = providers?.list().find((x) => x.preset === 'openai' && x.hasKey);
  if (!p) throw new Error('Add your OpenAI key in AI models to use the OpenAI voices.');
  const res = await providers.request(p, '/audio/speech', { model: 'gpt-4o-mini-tts', voice: OPENAI_VOICES.includes(voice) ? voice : 'nova', input: text.slice(0, 4000), response_format: 'pcm', speed });
  if (!res.ok) throw new Error(`OpenAI voice: ${res.status} ${(await res.text()).slice(0, 150)}`);
  const pcm = Buffer.from(await res.arrayBuffer());
  const samples = new Float32Array(pcm.length >> 1);
  for (let i = 0; i < samples.length; i++) samples[i] = pcm.readInt16LE(i * 2) / 32768;
  return { samples, sampleRate: 24000 };
}

export async function speakReply(text, { ml, store, providers }) {
  const clean = speakable(text);
  if (!clean) return null;
  const agent = store.getSetting('agent', {});
  if (store.getSetting('voiceEngine', 'local') === 'openai') {
    // Offline or a bad key: the free voices on this PC answer instead.
    try { return await openaiSpeak(clean, { providers, voice: agent.openaiVoice, speed: agent.speed || 1 }); } catch { /* fall back */ }
  }
  const lang = scriptLanguage(clean);
  if (lang === 'ta') {
    // Natural offline Tamil voice; the Windows route only works if a Tamil voice pack is installed.
    try { await downloadFile('tamilvoice'); return await ml.call('speakTamil', clean); } catch { /* no internet for the first download */ }
  }
  if (lang) return sapiSpeak(clean, lang);
  const voice = agent.voice || allPersonalities(store.getSetting('customPersonalities', []))[store.getSetting('personality', 'normal')]?.voice || 'af_heart';
  return ml.call('speak', clean, voice, agent.speed || 1);
}
