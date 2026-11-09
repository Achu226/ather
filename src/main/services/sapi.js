// Offline Windows voices (System.Speech) for languages Kokoro cannot speak, e.g. Hindi, Russian, Chinese.
import { execFile } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

/** Guess a language from the alphabet used; null means Latin text (Kokoro handles it). */
export function scriptLanguage(text) {
  const checks = [[/[ऀ-ॿ]/, 'hi'], [/[ঀ-৿]/, 'bn'], [/[஀-௿]/, 'ta'], [/[ఀ-౿]/, 'te'],
    [/[Ѐ-ӿ]/, 'ru'], [/[぀-ヿ]/, 'ja'], [/[가-힯]/, 'ko'], [/[一-鿿]/, 'zh'], [/[؀-ۿ]/, 'ar']];
  return checks.find(([re]) => re.test(text))?.[1] ?? null;
}

const SCRIPT = `
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$v = $s.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.TwoLetterISOLanguageName -eq $env:ATHER_LANG } | Select-Object -First 1
if ($v) { $s.SelectVoice($v.VoiceInfo.Name) }
$s.SetOutputToWaveFile($env:ATHER_WAV)
$s.Speak($env:ATHER_TEXT)
$s.Dispose()
`;

export async function sapiSpeak(text, lang = 'en') {
  const wav = join(tmpdir(), `ather-say-${Date.now()}.wav`);
  try {
    await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', SCRIPT],
      { env: { ...process.env, ATHER_TEXT: text, ATHER_LANG: lang, ATHER_WAV: wav }, windowsHide: true, timeout: 60_000 });
    return readWav(readFileSync(wav));
  } finally {
    rmSync(wav, { force: true });
  }
}

/** 16-bit PCM WAV → mono Float32 samples. */
export function readWav(buf) {
  const channels = buf.readUInt16LE(22), sampleRate = buf.readUInt32LE(24);
  let p = 12;
  while (p < buf.length && buf.toString('ascii', p, p + 4) !== 'data') p += 8 + buf.readUInt32LE(p + 4);
  const start = p + 8, frames = Math.floor(buf.readUInt32LE(p + 4) / 2 / channels);
  const samples = new Float32Array(frames);
  for (let i = 0; i < frames; i++) samples[i] = buf.readInt16LE(start + i * 2 * channels) / 32768;
  return { samples, sampleRate };
}
