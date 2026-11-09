import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanDictation, finishDictation } from '../src/main/services/dictate.js';

test('fillers go, spoken corrections are followed', () => {
  assert.equal(cleanDictation("Hey Sam, I'm running about ten, actually fifteen minutes late. Uh, save me a seat!"),
    "Hey Sam, I'm running about fifteen minutes late. Save me a seat!");
  assert.equal(cleanDictation('um so the meeting is at 3, no, make that 4 pm'), 'So the meeting is at 4 pm');
  assert.equal(cleanDictation('see you on tuesday actually make that wednesday'), 'See you on wednesday');
});

test('spoken punctuation, new lines and bullet points', () => {
  assert.equal(cleanDictation('shopping list colon bullet point milk bullet point eggs bullet point bread'), 'Shopping list:\n- Milk\n- Eggs\n- Bread');
  assert.equal(cleanDictation('hi rahul comma new line can you send the notes question mark'), 'Hi rahul,\nCan you send the notes?');
  assert.equal(cleanDictation('that is all full stop thanks exclamation mark'), 'That is all. Thanks!');
});

test('normal words that contain filler sounds are kept', () => {
  assert.equal(cleanDictation('The umbrella and the hummus are here.'), 'The umbrella and the hummus are here.');
  assert.equal(cleanDictation('Version 1.6 at 10:30 costs $4.50.'), 'Version 1.6 at 10:30 costs $4.50.');
});

test('polished mode uses the AI only for small fixes', async () => {
  assert.equal(await finishDictation('i has a apple', 'polished', async () => 'I have an apple'), 'I have an apple');
  // a rewrite that changes too much keeps the user's own words
  assert.equal(await finishDictation('ok see you', 'polished', async () => 'Okay! I will see you very soon, have a wonderful day.'), 'Ok see you');
  assert.equal(await finishDictation('um hello', 'raw'), 'um hello');
  assert.equal(await finishDictation('um hello', 'polished', async () => { throw new Error('model down'); }), 'Hello');
});
