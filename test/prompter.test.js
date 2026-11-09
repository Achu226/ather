import { test } from 'node:test';
import assert from 'node:assert/strict';
import { words, align } from '../src/renderer/shared/prompter.js';

const script = words('Good morning everyone. Today I will present Maya, a voice assistant for people who cannot use a mouse. ' +
  'Maya lives at the top of the screen and does what you say. It runs on your own computer, so your voice never leaves it.');

test('the position follows what was just read, even with Whisper mistakes', () => {
  assert.equal(script[align(script, words('good morning everyone today i will'))], 'present');
  // misheard "Maya" as "my a", skipped a word: still lands after "mouse"
  assert.equal(script[align(script, words('for people who cannot use a mouse'), 10)], 'maya');
  assert.equal(script[align(script, words('so your voice never leaves'), 30)], 'it');
});

test('silence or unrelated words keep the place; it never jumps backwards', () => {
  assert.equal(align(script, [], 12), 12);
  assert.equal(align(script, words('hello can you hear me'), 12), 12);
  assert.equal(align(script, words('good morning everyone'), 20), 20);
});
