import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchWake, isStopPhrase, listenOnce } from '../src/renderer/shared/voice.js';

test('wake word matches what Whisper actually hears', () => {
  // Real Whisper-tiny transcripts of Kokoro voices saying "Hey/Hi/Okay Maya".
  assert.equal(matchWake('Hey Maya, what time is it?'), 'what time is it?');
  assert.equal(matchWake('Okay, Maya, open YouTube.'), 'open YouTube.');
  assert.equal(matchWake('Hymaya'), '');
  assert.equal(matchWake('Hi, Myers.'), '');
  assert.equal(matchWake('Hey Ather'), ''); // the old name still works
  assert.equal(matchWake('I was talking to my brother yesterday'), null);
  assert.equal(matchWake('hey mayank, are you coming?'), null);
  assert.equal(matchWake('the weather is nice'), null);
});

test('wake word survives Whisper mishearing "Hey" (heard live from the fake mic: "Tae Maya")', () => {
  assert.equal(matchWake('Tae Maya'), '');
  assert.equal(matchWake('A Maya.'), '');
  assert.equal(matchWake('Hay, Maaya, open YouTube'), 'open YouTube');
  assert.equal(matchWake('Hey Mia.'), '');
  assert.equal(matchWake('Maya, what time is it?'), 'what time is it?');
  // Only at the start: talking about someone called Maya does not wake it.
  assert.equal(matchWake('I was talking to Maya yesterday'), null);
  assert.equal(matchWake('Please tell Maya I am late'), null);
});

test('stop phrases end voice mode', () => {
  assert.ok(isStopPhrase('Stop.'));
  assert.ok(isStopPhrase("that's all"));
  assert.ok(!isStopPhrase('stop the timer in five minutes'));
});

// A fake microphone: quiet room, then the user speaks from `talkAt` for `talkMs`. 16 samples per ms (16 kHz).
function fakeMic({ talkAt, talkMs }) {
  const t0 = Date.now();
  return async () => {
    let last = Date.now();
    const take = () => { const now = Date.now(); const n = (now - last) * 16; last = now; return new Float32Array(n); };
    return {
      level: () => { const t = Date.now() - t0; return t >= talkAt && t < talkAt + talkMs ? 0.2 : 0.001; },
      take,
      stop: async () => take(),
    };
  };
}

test('a wake phrase after a long quiet wait is a short clip (the quiet before it is dropped)', async () => {
  const audio = await listenOnce(new AbortController().signal, () => {}, fakeMic({ talkAt: 3000, talkMs: 700 }));
  assert.ok(audio, 'speech was heard');
  const seconds = audio.length / 16000;
  // The wake loop drops clips over 4 s: before the fix this was ~4.6 s (all the waiting + speech + silence).
  assert.ok(seconds < 2.5, `clip is ${seconds.toFixed(1)} s`);
  assert.ok(seconds > 0.7, 'the speech itself is kept');
});
