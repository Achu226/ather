import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectEmotion, countRequests, afterFeeling } from '../src/renderer/shared/emotion.js';

test('feelings from the user\'s words', () => {
  assert.equal(detectEmotion('I am so stressed about my exam tomorrow'), 'worried');
  assert.equal(detectEmotion('bhai bahut tension ho raha hai'), 'worried');
  assert.equal(detectEmotion('I failed my exam and feel like giving up'), 'sad');
  assert.equal(detectEmotion('YAY I got the internship!!!'), 'excited');
  assert.equal(detectEmotion('thank you so much, you are the best'), 'love');
  assert.equal(detectEmotion('ugh the wifi is not working again'), 'angry');
  assert.equal(detectEmotion('what is the capital of France?'), null);
});

test('many requests at once make Maya tense', () => {
  const busy = 'add a task to finish the report, remind me to call mom at 6, book the lab slot and also prepare slides for Monday';
  assert.ok(countRequests(busy) >= 3, String(countRequests(busy)));
  assert.equal(detectEmotion(busy), 'worried');
  assert.equal(detectEmotion('add a task to study DBMS'), null);
});

test('after answering, worried or sad users get a caring face', () => {
  assert.equal(afterFeeling('worried'), 'love');
  assert.equal(afterFeeling('excited'), 'celebrate');
  assert.equal(afterFeeling(null), 'happy');
});
