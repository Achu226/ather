import { test } from 'node:test';
import assert from 'node:assert/strict';
import { direction, interpretTurn, englishShare } from '../src/main/services/interpreter.js';
import { everydayTools } from '../src/main/tools/everyday.js';
import { selectTools } from '../src/main/tools/select.js';
import { allTools } from '../src/main/tools/index.js';

const tool = (name) => everydayTools.find((t) => t.name === name);

test('interpreter: the script of what was heard decides the direction', async () => {
  assert.deepEqual(direction('Where is the bus stand?', 'ta'), { from: 'en', to: 'ta' });
  assert.deepEqual(direction('பேருந்து நிலையம் எங்கே?', 'ta'), { from: 'ta', to: 'en' });
  assert.deepEqual(direction('बस स्टैंड कहाँ है?', 'hi'), { from: 'hi', to: 'en' });
  const calls = [];
  const ml = { call: async (op, audio, lang) => { calls.push(lang); return lang === 'ta' ? 'பேருந்து நிலையம் எங்கே?' : 'பெருந்து நிலயம் எங்கே'; } };
  const turn = await interpretTurn(new Float32Array(10), 'ta', { ml, complete: async (p) => (/English/.test(p) ? '"Where is the bus stand?"' : 'x') });
  assert.deepEqual(turn, { heard: 'பேருந்து நிலையம் எங்கே?', said: 'Where is the bus stand?', from: 'ta', to: 'en' });
  assert.deepEqual(calls, [null, 'ta']); // auto first, then the Tamil listener for accuracy
  // Whisper wrote Tamil speech in English letters: still recognised as Tamil.
  assert.ok(englishShare('Varya maruthuva manayangé, yana thadhaikku udevithayavé.') < 0.25);
  assert.ok(englishShare('Where is the nearest hospital? My father needs help.') > 0.5);
});

test('camera: describing attaches the photo; reading returns the printed text', async () => {
  const photo = 'data:image/jpeg;base64,AAAA';
  const look = await tool('camera_look').run({ question: 'what colour is the bottle?' }, { services: { camera: async () => photo } });
  assert.equal(look.attachImage, photo);
  assert.match(look.how, /what colour is the bottle/);
  const read = await tool('camera_read').run({}, { services: { camera: async () => photo, ocr: async () => 'PARACETAMOL  500 mg\n\n\n\nTake one tablet after food' } });
  assert.equal(read.text, 'PARACETAMOL 500 mg\n\nTake one tablet after food');
  assert.equal(read.attachImage, undefined);
  const blurry = await tool('camera_read').run({}, { services: { camera: async () => photo, ocr: async () => 'Il' } });
  assert.equal(blurry.attachImage, photo); // too little text: the AI looks at the photo instead
});

test('requests reach the camera and interpreter tools', () => {
  const names = (q) => selectTools(allTools, q).map((t) => t.name);
  assert.ok(names("what's in front of me?").includes('camera_look'));
  assert.ok(names('read this paper for me').includes('camera_read'));
  assert.ok(names('be my interpreter in Tamil').includes('interpreter'));
  assert.ok(!names('what is the capital of France').includes('camera_look'));
});
